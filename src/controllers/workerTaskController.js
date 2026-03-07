const mongoose = require('mongoose');
const Grievance = require('../models/Grievance');
const Worker = require('../models/Worker');
const { uploadToCloudinary } = require('../utils/cloudinary');

// Get assigned tasks for logged-in worker
exports.getMyTasks = async (req, res) => {
    try {
        const workerId = req.user.id;
        const { status } = req.query;

        const query = {
            'assignedTo.workerId': workerId
        };

        if (status) {
            query.status = status;
        }

        const tasks = await Grievance.find(query)
            .sort({ 'assignedTo.assignedAt': -1 })
            .lean();

        // Group by status
        const taskStats = {
            pending: tasks.filter(t => t.status === 'Assigned' || t.status === 'Pending').length,
            inProgress: tasks.filter(t => t.status === 'In Progress' || t.status === 'InProgress').length,
            completed: tasks.filter(t => t.status === 'Resolved').length,
            total: tasks.length
        };

        res.json({
            success: true,
            tasks: tasks.map(t => ({ ...t, id: t._id.toString() })),
            stats: taskStats
        });
    } catch (error) {
        console.error('Get tasks error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch tasks',
            error: error.message
        });
    }
};

// Get single task details
exports.getTaskById = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(taskId)) {
            return res.status(400).json({ success: false, message: 'Invalid task ID format' });
        }

        const task = await Grievance.findOne({
            _id: taskId,
            'assignedTo.workerId': workerId
        }).lean();

        if (task) {
            task.id = task._id.toString();
        }

        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found or not assigned to you'
            });
        }

        res.json({
            success: true,
            task
        });
    } catch (error) {
        console.error('Get task error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch task',
            error: error.message
        });
    }
};

// Accept task
exports.acceptTask = async (req, res) => {
    try {
        const { taskId } = req.params;
        const workerId = req.user.id;

        if (!mongoose.Types.ObjectId.isValid(taskId)) {
            return res.status(400).json({ success: false, message: 'Invalid task ID format' });
        }

        const task = await Grievance.findOne({
            _id: taskId,
            'assignedTo.workerId': workerId
        });

        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        task.status = 'In Progress';
        task.assignedTo.acceptedAt = new Date();

        // Add to action history
        task.actionHistory = task.actionHistory || [];
        task.actionHistory.push({
            action: 'Task accepted by worker',
            by: workerId,
            at: new Date(),
            remarks: `Accepted by ${req.user.name || 'Worker'}`
        });

        await task.save();
        
        // Emit status update
        const io = req.app.get('io');
        if (io) {
            io.to(`ward:${task.ward}`).emit('complaint:update', {
                complaintId: task._id,
                status: 'In Progress',
                action: 'Accepted',
                workerName: req.user.name
            });
        }

        res.json({
            success: true,
            message: 'Task accepted successfully',
            task
        });
    } catch (error) {
        console.error('Accept task error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to accept task',
            error: error.message
        });
    }
};

// Reject task
exports.rejectTask = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { reason } = req.body;
        const workerId = req.user.id;

        if (!mongoose.Types.ObjectId.isValid(taskId)) {
            return res.status(400).json({ success: false, message: 'Invalid task ID format' });
        }

        const task = await Grievance.findOne({
            _id: taskId,
            'assignedTo.workerId': workerId
        });

        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        // Update worker's task count
        const worker = await Worker.findById(workerId);
        if (worker) {
            worker.assignedTasks = Math.max(0, (worker.assignedTasks || 0) - 1);
            if (worker.assignedTasks < 5 && worker.availability === 'busy') {
                worker.availability = 'available';
            }
            await worker.save();
        }

        // Add to action history
        task.actionHistory = task.actionHistory || [];
        task.actionHistory.push({
            action: 'Task rejected by worker',
            by: workerId,
            at: new Date(),
            remarks: reason || 'Rejected by worker'
        });

        // Reset assignment
        task.status = 'Pending';
        task.assignedTo = undefined;

        await task.save();

        // Emit status update
        const io = req.app.get('io');
        if (io) {
            io.to(`ward:${task.ward}`).emit('complaint:update', {
                complaintId: task._id,
                status: 'Pending',
                action: 'Rejected',
                workerName: req.user.name,
                reason: reason || 'Rejected by worker'
            });
        }

        res.json({
            success: true,
            message: 'Task rejected successfully'
        });
    } catch (error) {
        console.error('Reject task error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reject task',
            error: error.message
        });
    }
};

// Update task status
exports.updateTaskStatus = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { status, remarks } = req.body;
        const workerId = req.user.id;

        const task = await Grievance.findOne({
            _id: taskId,
            'assignedTo.workerId': workerId
        });

        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        const oldStatus = task.status;
        task.status = status;

        // Add to action history
        task.actionHistory = task.actionHistory || [];
        task.actionHistory.push({
            action: `Status changed from ${oldStatus} to ${status}`,
            by: workerId,
            at: new Date(),
            remarks: remarks || `Updated by worker`
        });

        await task.save();

        // Emit real-time status update
        const io = req.app.get('io');
        if (io) {
            io.to(`ward:${task.ward}`).emit('complaint:update', { 
                complaintId: task._id, 
                status: task.status,
                action: 'Status Updated'
            });
        }

        res.json({
            success: true,
            message: 'Task status updated successfully',
            task
        });
    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update status',
            error: error.message
        });
    }
};

// Complete task with before/after photos
exports.completeTask = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { remarks } = req.body;
        const workerId = req.user.id;

        if (!mongoose.Types.ObjectId.isValid(taskId)) {
            return res.status(400).json({ success: false, message: 'Invalid task ID format' });
        }

        const task = await Grievance.findOne({
            _id: taskId,
            'assignedTo.workerId': workerId
        });

        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        // Handle file uploads
        const completionPhotos = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                completionPhotos.push({
                    url: `/uploads/${file.filename}`,
                    type: 'completion_photo',
                    uploadedAt: new Date()
                });
            }
        }

        // Update task
        task.status = 'Resolved';
        task.resolvedAt = new Date();
        task.resolutionNotes = remarks || 'Task completed by worker';
        
        if (!task.assignedTo.completionPhotos) {
            task.assignedTo.completionPhotos = [];
        }
        task.assignedTo.completionPhotos.push(...completionPhotos);
        task.assignedTo.completedAt = new Date();

        // Add to action history
        task.actionHistory = task.actionHistory || [];
        task.actionHistory.push({
            action: 'Task completed',
            by: workerId,
            at: new Date(),
            remarks: remarks || 'Task completed with photos'
        });

        await task.save();

        // Emit real-time completion update
        const io = req.app.get('io');
        if (io) {
            io.to(`ward:${task.ward}`).emit('complaint:update', { 
                complaintId: task._id, 
                status: 'Resolved',
                action: 'Resolved',
                workerName: req.user.name
            });
            io.to('councillors').emit('complaint:resolved', {
                complaintId: task._id,
                workerName: req.user.name,
                remarks: remarks || 'Resolved'
            });
        }

        // Update worker stats
        const worker = await Worker.findById(workerId);
        if (worker) {
            worker.assignedTasks = Math.max(0, (worker.assignedTasks || 0) - 1);
            worker.completedTasks = (worker.completedTasks || 0) + 1;
            
            if (worker.assignedTasks < 5 && worker.availability === 'busy') {
                worker.availability = 'available';
            }
            
            await worker.save();
        }

        res.json({
            success: true,
            message: 'Task completed successfully',
            task
        });
    } catch (error) {
        console.error('Complete task error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to complete task',
            error: error.message
        });
    }
};

// Upload work progress photos
exports.uploadProgressPhoto = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { photoType } = req.body; // 'before' or 'after' or 'progress'
        const workerId = req.user.id;

        if (!mongoose.Types.ObjectId.isValid(taskId)) {
            return res.status(400).json({ success: false, message: 'Invalid task ID format' });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No photo uploaded'
            });
        }

        const task = await Grievance.findOne({
            _id: taskId,
            'assignedTo.workerId': workerId
        });

        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        const photoUrl = `/uploads/${req.file.filename}`;

        // Initialize arrays if they don't exist
        if (!task.assignedTo.progressPhotos) {
            task.assignedTo.progressPhotos = [];
        }

        task.assignedTo.progressPhotos.push({
            url: photoUrl,
            type: photoType || 'progress',
            uploadedAt: new Date()
        });

        // Add to action history
        task.actionHistory = task.actionHistory || [];
        task.actionHistory.push({
            action: `Uploaded ${photoType || 'progress'} photo`,
            by: workerId,
            at: new Date(),
            remarks: `Photo uploaded by worker`
        });

        await task.save();

        // Emit progress photo update
        const io = req.app.get('io');
        if (io) {
            io.to(`ward:${task.ward}`).emit('complaint:progress', { 
                complaintId: task._id, 
                photoUrl,
                photoType: photoType || 'progress',
                workerName: req.user.name
            });
        }

        res.json({
            success: true,
            message: 'Photo uploaded successfully',
            photoUrl
        });
    } catch (error) {
        console.error('Upload photo error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload photo',
            error: error.message
        });
    }
};

// Get worker statistics
exports.getWorkerStats = async (req, res) => {
    try {
        const workerId = req.user.id;

        const worker = await Worker.findById(workerId).select('-password');
        
        // Get task counts
        const totalTasks = await Grievance.countDocuments({
            'assignedTo.workerId': workerId
        });

        const completedTasks = await Grievance.countDocuments({
            'assignedTo.workerId': workerId,
            status: 'Resolved'
        });

        const pendingTasks = await Grievance.countDocuments({
            'assignedTo.workerId': workerId,
            status: { $in: ['Assigned', 'Pending', 'In Progress', 'InProgress'] }
        });

        // Calculate average completion time (for completed tasks)
        const completedTasksWithTime = await Grievance.find({
            'assignedTo.workerId': workerId,
            status: 'Resolved',
            'assignedTo.assignedAt': { $exists: true },
            'assignedTo.completedAt': { $exists: true }
        }).select('assignedTo.assignedAt assignedTo.completedAt');

        let avgCompletionTime = 0;
        if (completedTasksWithTime.length > 0) {
            const totalTime = completedTasksWithTime.reduce((sum, task) => {
                const start = new Date(task.assignedTo.assignedAt);
                const end = new Date(task.assignedTo.completedAt);
                return sum + (end - start);
            }, 0);
            avgCompletionTime = Math.round(totalTime / completedTasksWithTime.length / (1000 * 60 * 60)); // in hours
        }

        res.json({
            success: true,
            stats: {
                worker: {
                    name: worker.name,
                    type: worker.type,
                    rating: worker.rating,
                    experience: worker.experience,
                    availability: worker.availability
                },
                tasks: {
                    total: totalTasks,
                    completed: completedTasks,
                    pending: pendingTasks,
                    completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
                },
                performance: {
                    avgCompletionTimeHours: avgCompletionTime
                }
            }
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch statistics',
            error: error.message
        });
    }
};

// Get all complaints in worker's ward
exports.getWardComplaints = async (req, res) => {
    try {
        const { ward } = req.user;
        
        if (!ward) {
            return res.status(400).json({
                success: false,
                message: 'Ward information missing from profile'
            });
        }

        const complaints = await Grievance.find({ ward: Number(ward) })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();

        res.json({
            success: true,
            complaints: complaints.map(c => ({ ...c, id: c._id.toString() }))
        });
    } catch (error) {
        console.error('Get ward complaints error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch ward complaints',
            error: error.message
        });
    }
};

module.exports = exports;
