const Worker = require('../models/Worker');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Worker Registration (by admin/councillor)
exports.registerWorker = async (req, res) => {
    try {
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

        // Check if worker already exists
        const existingWorker = await Worker.findOne({ workerId });
        if (existingWorker) {
            return res.status(400).json({
                success: false,
                message: 'Worker ID already exists'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create worker
        const worker = new Worker({
            name,
            workerId,
            password: hashedPassword,
            type,
            contact,
            email,
            ward,
            specialization,
            experience: experience || 0,
            availability: 'available',
            isActive: true,
            createdBy: req.user?.id
        });

        await worker.save();

        res.status(201).json({
            success: true,
            message: 'Worker registered successfully',
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
        console.error('Worker registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: error.message
        });
    }
};

// Worker Login
exports.loginWorker = async (req, res) => {
    try {
        const { workerId, password } = req.body;

        // Validate input
        if (!workerId || !password) {
            return res.status(400).json({
                success: false,
                message: 'Worker ID and password are required'
            });
        }

        // Find worker
        const worker = await Worker.findOne({ workerId, isActive: true });
        if (!worker) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, worker.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                id: worker._id,
                workerId: worker.workerId,
                role: 'worker',
                type: worker.type,
                ward: worker.ward
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            message: 'Login successful',
            token,
            worker: {
                id: worker._id,
                name: worker.name,
                workerId: worker.workerId,
                type: worker.type,
                contact: worker.contact,
                email: worker.email,
                ward: worker.ward,
                availability: worker.availability,
                assignedTasks: worker.assignedTasks,
                completedTasks: worker.completedTasks,
                rating: worker.rating,
                profilePicture: worker.profilePicture,
                specialization: worker.specialization,
                experience: worker.experience
            }
        });
    } catch (error) {
        console.error('Worker login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed',
            error: error.message
        });
    }
};

// Get Worker Profile
exports.getWorkerProfile = async (req, res) => {
    try {
        const workerId = req.user.id;

        const worker = await Worker.findById(workerId).select('-password');
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
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch profile',
            error: error.message
        });
    }
};

// Update Worker Profile
exports.updateWorkerProfile = async (req, res) => {
    try {
        const workerId = req.user.id;
        const updates = req.body;

        // Fields that worker can update
        const allowedFields = ['contact', 'email', 'availability', 'profilePicture'];
        
        const worker = await Worker.findById(workerId);
        if (!worker) {
            return res.status(404).json({
                success: false,
                message: 'Worker not found'
            });
        }

        allowedFields.forEach(field => {
            if (updates[field] !== undefined) {
                worker[field] = updates[field];
            }
        });

        await worker.save();

        res.json({
            success: true,
            message: 'Profile updated successfully',
            worker: {
                id: worker._id,
                name: worker.name,
                workerId: worker.workerId,
                type: worker.type,
                contact: worker.contact,
                email: worker.email,
                ward: worker.ward,
                availability: worker.availability,
                profilePicture: worker.profilePicture
            }
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile',
            error: error.message
        });
    }
};

// Upload ID Proof
exports.uploadIdProof = async (req, res) => {
    try {
        const workerId = req.user.id;
        const { idType } = req.body;
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const worker = await Worker.findById(workerId);
        if (!worker) {
            return res.status(404).json({
                success: false,
                message: 'Worker not found'
            });
        }

        worker.idProof = {
            type: idType,
            fileUrl: `/uploads/${req.file.filename}`,
            uploadedAt: new Date()
        };

        await worker.save();

        res.json({
            success: true,
            message: 'ID proof uploaded successfully',
            idProof: worker.idProof
        });
    } catch (error) {
        console.error('Upload ID proof error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload ID proof',
            error: error.message
        });
    }
};

// Change Password
exports.changePassword = async (req, res) => {
    try {
        const workerId = req.user.id;
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current password and new password are required'
            });
        }

        const worker = await Worker.findById(workerId);
        if (!worker) {
            return res.status(404).json({
                success: false,
                message: 'Worker not found'
            });
        }

        // Verify current password
        const isPasswordValid = await bcrypt.compare(currentPassword, worker.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Hash new password
        worker.password = await bcrypt.hash(newPassword, 10);
        await worker.save();

        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to change password',
            error: error.message
        });
    }
};

module.exports = exports;
