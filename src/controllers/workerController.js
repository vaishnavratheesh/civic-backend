const mongoose = require('mongoose');
const Worker = require('../models/Worker');
const Grievance = require('../models/Grievance');
const { sendEmail } = require('../utils/email');

// Get workers by type/category
exports.getWorkers = async (req, res) => {
    try {
        const { types, availability, ward } = req.query;
        const user = req.user;

        // Base match stage
        const matchStage = { isActive: true };

        // Filter by worker types
        if (types) {
            const typeArray = types.split(',').map(t => t.trim());
            matchStage.type = { $in: typeArray };
        }

        // Filter by availability
        if (availability && availability !== 'all') {
            matchStage.availability = availability;
        }

        let workers;

        // Strategy:
        // 1. If 'ward' param is provided (e.g. from AssignComplaint for a specific task), 
        //    we want to PRIORITIZE that ward but include others. 
        //    So we DO NOT add strict ward filtering in matchStage, but use it for sorting.
        // 2. If NO 'ward' param is provided, AND user is councillor, 
        //    we default to showing their own ward (strict filter) because that's the default dashboard view.

        const targetWard = ward; // The ward we want to prioritize

        if (targetWard) {
            // Prioritization Logic (Uber-style)
            workers = await Worker.aggregate([
                { $match: matchStage },
                {
                    $addFields: {
                        isSameWard: { $eq: ["$ward", targetWard] },
                        // Custom sort order for availability: available=1, busy=2, offline=3
                        availabilityOrder: {
                            $switch: {
                                branches: [
                                    { case: { $eq: ["$availability", "available"] }, then: 1 },
                                    { case: { $eq: ["$availability", "busy"] }, then: 2 },
                                    { case: { $eq: ["$availability", "offline"] }, then: 3 }
                                ],
                                default: 4
                            }
                        }
                    }
                },
                {
                    $sort: {
                        isSameWard: -1,     // Same ward first (true > false)
                        availabilityOrder: 1, // Available first
                        assignedTasks: 1,   // Fewer tasks first
                        rating: -1          // Higher rating first
                    }
                },
                {
                    $project: {
                        isSameWard: 0,
                        availabilityOrder: 0,
                        password: 0 // Exclude password
                    }
                }
            ]);
        } else {
            // Default Strict Filtering Logic
            if (user.role === 'councillor' && user.ward) {
                matchStage.ward = user.ward;
            }

            workers = await Worker.find(matchStage)
                .select('-password')
                .sort({ availability: 1, assignedTasks: 1, rating: -1 })
                .lean();
        }

        res.json({
            success: true,
            workers,
            count: workers.length
        });
    } catch (error) {
        console.error('Error fetching workers:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch workers',
            error: error.message
        });
    }
};

// Get worker by ID
exports.getWorkerById = async (req, res) => {
    try {
        const { id } = req.params;

        const worker = await Worker.findById(id);

        if (!worker) {
            return res.status(404).json({
                success: false,
                message: 'Worker not found'
            });
        }

        res.json({
            success: true,
            worker
        });
    } catch (error) {
        console.error('Error fetching worker:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch worker',
            error: error.message
        });
    }
};

// Create new worker
exports.createWorker = async (req, res) => {
    try {
        const user = req.user;
        const {
            name,
            workerId,
            password,
            type,
            contact,
            email,
            ward,
            specialization,
            experience
        } = req.body;

        // Only councillors and admins can create workers
        if (user.role !== 'councillor' && user.role !== 'admin' && user.role !== 'president') {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized to create workers'
            });
        }

        // Validate required fields
        if (!name || !workerId || !password || !type || !contact || !ward) {
            return res.status(400).json({
                success: false,
                message: 'Name, worker ID, password, type, contact, and ward are required'
            });
        }

        // Check if worker ID already exists
        const existing = await Worker.findOne({ workerId });
        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'Worker ID already exists'
            });
        }

        // Hash password
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create worker
        const worker = new Worker({
            name,
            workerId,
            password: hashedPassword,
            type,
            contact,
            email,
            ward: user.role === 'councillor' ? user.ward : ward,
            specialization,
            experience: experience || 0,
            createdBy: user.id,
            availability: 'available',
            isActive: true
        });

        await worker.save();

        res.status(201).json({
            success: true,
            message: 'Worker created successfully. Share the credentials with the worker.',
            worker: {
                id: worker._id,
                name: worker.name,
                workerId: worker.workerId,
                type: worker.type,
                contact: worker.contact,
                ward: worker.ward
            }
        });
    } catch (error) {
        console.error('Error creating worker:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create worker',
            error: error.message
        });
    }
};

// Update worker
exports.updateWorker = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const worker = await Worker.findById(id);

        if (!worker) {
            return res.status(404).json({
                success: false,
                message: 'Worker not found'
            });
        }

        // Update allowed fields
        const allowedFields = [
            'name', 'type', 'contact', 'email', 'availability',
            'specialization', 'experience', 'isActive'
        ];

        allowedFields.forEach(field => {
            if (updates[field] !== undefined) {
                worker[field] = updates[field];
            }
        });

        await worker.save();

        res.json({
            success: true,
            message: 'Worker updated successfully',
            worker
        });
    } catch (error) {
        console.error('Error updating worker:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update worker',
            error: error.message
        });
    }
};

// Delete worker
exports.deleteWorker = async (req, res) => {
    try {
        const { id } = req.params;

        const worker = await Worker.findById(id);

        if (!worker) {
            return res.status(404).json({
                success: false,
                message: 'Worker not found'
            });
        }

        // Soft delete
        worker.isActive = false;
        await worker.save();

        res.json({
            success: true,
            message: 'Worker deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting worker:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete worker',
            error: error.message
        });
    }
};

// Assign task to worker
exports.assignTask = async (req, res) => {
    try {
        const { complaintId } = req.params;
        const { workerId, assignmentNotes } = req.body;
        const user = req.user;

        // Validate IDs
        if (!mongoose.Types.ObjectId.isValid(complaintId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid complaint ID format'
            });
        }

        if (!mongoose.Types.ObjectId.isValid(workerId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid worker ID format'
            });
        }

        // Find complaint
        const complaint = await Grievance.findById(complaintId);

        if (!complaint) {
            return res.status(404).json({
                success: false,
                message: 'Complaint not found'
            });
        }

        // Find worker
        const worker = await Worker.findById(workerId);

        if (!worker) {
            return res.status(404).json({
                success: false,
                message: 'Worker not found'
            });
        }

        // Check if worker is active and available
        if (!worker.isActive) {
            return res.status(400).json({
                success: false,
                message: 'Worker is not active'
            });
        }

        // Update complaint with assignment
        complaint.assignedTo = {
            workerId: worker._id,
            workerName: worker.name,
            workerType: worker.type,
            workerContact: worker.contact,
            assignedBy: user.id,
            assignedByName: user.name,
            assignedAt: new Date(),
            assignmentNotes: assignmentNotes || 'Task assigned by councillor'
        };

        // Update status to 'Assigned' if it's still 'Pending'
        if (complaint.status === 'Pending' || complaint.status === 'Under Review') {
            complaint.status = 'Assigned';
        }

        await complaint.save();

        // Update worker's assigned tasks count
        worker.assignedTasks = (worker.assignedTasks || 0) + 1;
        if (worker.availability === 'available' && worker.assignedTasks >= 5) {
            worker.availability = 'busy';
        }
        await worker.save();

        // Send notification email to worker if email exists
        if (worker.email) {
            try {
                await sendEmail({
                    to: worker.email,
                    subject: 'New Task Assignment',
                    html: `
                        <h2>New Task Assigned</h2>
                        <p>Dear ${worker.name},</p>
                        <p>A new task has been assigned to you:</p>
                        <ul>
                            <li><strong>Complaint ID:</strong> ${complaint._id}</li>
                            <li><strong>Category:</strong> ${complaint.issueType}</li>
                            <li><strong>Location:</strong> ${complaint.location?.address || 'N/A'}</li>
                            <li><strong>Description:</strong> ${complaint.description}</li>
                            ${assignmentNotes ? `<li><strong>Notes:</strong> ${assignmentNotes}</li>` : ''}
                        </ul>
                        <p>Please check the worker dashboard for more details.</p>
                        <p>Best regards,<br>Civic+ Team</p>
                    `
                });
            } catch (emailError) {
                console.error('Failed to send email notification:', emailError);
                // Don't fail the assignment if email fails
            }
        }

        res.json({
            success: true,
            message: `Task assigned to ${worker.name}`,
            complaint,
            worker: {
                id: worker._id,
                name: worker.name,
                type: worker.type,
                contact: worker.contact
            }
        });
    } catch (error) {
        console.error('Error assigning task:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to assign task',
            error: error.message
        });
    }
};

// Get worker statistics
exports.getWorkerStats = async (req, res) => {
    try {
        const user = req.user;
        const query = { isActive: true };

        if (user.role === 'councillor' && user.ward) {
            query.ward = user.ward;
        }

        const totalWorkers = await Worker.countDocuments(query);
        const availableWorkers = await Worker.countDocuments({ ...query, availability: 'available' });
        const busyWorkers = await Worker.countDocuments({ ...query, availability: 'busy' });

        // Workers by type
        const workersByType = await Worker.aggregate([
            { $match: query },
            { $group: { _id: '$type', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        res.json({
            success: true,
            stats: {
                total: totalWorkers,
                available: availableWorkers,
                busy: busyWorkers,
                offline: totalWorkers - availableWorkers - busyWorkers,
                byType: workersByType
            }
        });
    } catch (error) {
        console.error('Error fetching worker stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch statistics',
            error: error.message
        });
    }
};
