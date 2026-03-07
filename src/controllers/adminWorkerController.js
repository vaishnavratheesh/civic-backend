const Worker = require('../models/Worker');
const { sendEmail } = require('../utils/email');

// Get all pending worker registrations
exports.getPendingWorkers = async (req, res) => {
    try {
        const pendingWorkers = await Worker.find({
            registrationSource: 'self',
            approvalStatus: 'pending',
            emailVerified: true
        }).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: pendingWorkers.length,
            workers: pendingWorkers
        });
    } catch (err) {
        console.error('Get pending workers error:', err);
        res.status(500).json({ error: 'Failed to fetch pending workers' });
    }
};

// Get all workers (with filters)
exports.getAllWorkers = async (req, res) => {
    try {
        const { approvalStatus, registrationSource, type, ward } = req.query;
        
        const filter = {};
        if (approvalStatus) filter.approvalStatus = approvalStatus;
        if (registrationSource) filter.registrationSource = registrationSource;
        if (type) filter.type = type;
        if (ward) filter.ward = ward;

        const workers = await Worker.find(filter)
            .select('-password')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: workers.length,
            workers
        });
    } catch (err) {
        console.error('Get all workers error:', err);
        res.status(500).json({ error: 'Failed to fetch workers' });
    }
};

// Get worker details by ID
exports.getWorkerDetails = async (req, res) => {
    try {
        const { workerId } = req.params;

        const worker = await Worker.findById(workerId).select('-password');

        if (!worker) {
            return res.status(404).json({ error: 'Worker not found' });
        }

        res.status(200).json({
            success: true,
            worker
        });
    } catch (err) {
        console.error('Get worker details error:', err);
        res.status(500).json({ error: 'Failed to fetch worker details' });
    }
};

// Approve worker registration
exports.approveWorker = async (req, res) => {
    try {
        const { workerId } = req.params;
        const adminId = req.user.id;

        const worker = await Worker.findById(workerId);

        if (!worker) {
            return res.status(404).json({ error: 'Worker not found' });
        }

        if (worker.approvalStatus === 'approved') {
            return res.status(400).json({ error: 'Worker already approved' });
        }

        // Generate Worker ID
        const workerIdCode = `WRK${worker.ward}${String(Date.now()).slice(-6)}`;

        // Update worker
        worker.workerId = workerIdCode;
        worker.adminApproved = true;
        worker.approvalStatus = 'approved';
        worker.approvedBy = adminId;
        worker.approvedAt = new Date();
        worker.isActive = true;

        await worker.save();

        // Send approval email
        try {
            const emailSent = await sendEmail(
                worker.email,
                'Worker Registration Approved - Erumeli Panchayath',
                `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
                        <h1 style="color: white; margin: 0;">🎉 Registration Approved!</h1>
                    </div>
                    <div style="padding: 30px; background-color: #f9f9f9;">
                        <p style="font-size: 16px; color: #333;">Dear <strong>${worker.name}</strong>,</p>
                        
                        <p style="font-size: 14px; color: #666; line-height: 1.6;">
                            Congratulations! Your worker registration has been approved by the admin.
                        </p>

                        <div style="background-color: white; border-left: 4px solid #667eea; padding: 20px; margin: 20px 0;">
                            <h3 style="margin-top: 0; color: #667eea;">Your Worker Details</h3>
                            <p style="margin: 5px 0;"><strong>Worker ID:</strong> ${workerIdCode}</p>
                            <p style="margin: 5px 0;"><strong>Name:</strong> ${worker.name}</p>
                            <p style="margin: 5px 0;"><strong>Type:</strong> ${worker.type}</p>
                            <p style="margin: 5px 0;"><strong>Ward:</strong> ${worker.ward}</p>
                            <p style="margin: 5px 0;"><strong>Email:</strong> ${worker.email}</p>
                        </div>

                        <div style="background-color: #e8f4fd; border: 1px solid #b3d9f2; padding: 15px; border-radius: 5px; margin: 20px 0;">
                            <p style="margin: 0; font-size: 14px; color: #0066cc;">
                                <strong>📌 Next Steps:</strong>
                            </p>
                            <ol style="margin: 10px 0; padding-left: 20px; color: #666;">
                                <li>Login to the Worker Portal using your email and password</li>
                                <li>Complete your profile if needed</li>
                                <li>Start receiving and managing tasks</li>
                            </ol>
                        </div>

                        <div style="text-align: center; margin-top: 30px;">
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/#/worker/login" 
                               style="display: inline-block; padding: 15px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                                Login to Worker Portal
                            </a>
                        </div>

                        <p style="font-size: 12px; color: #999; margin-top: 30px; text-align: center;">
                            This is an automated email from Erumeli Panchayath Worker Management System.
                        </p>
                    </div>
                </div>
                `
            );

            if (!emailSent) {
                console.log('Failed to send approval email to:', worker.email);
            }
        } catch (emailError) {
            console.error('Email sending error:', emailError);
            // Don't fail the approval if email fails
        }

        res.status(200).json({
            success: true,
            message: 'Worker approved successfully',
            worker: {
                id: worker._id,
                name: worker.name,
                email: worker.email,
                workerId: worker.workerId,
                type: worker.type
            }
        });
    } catch (err) {
        console.error('Approve worker error:', err);
        res.status(500).json({ error: 'Failed to approve worker' });
    }
};

// Reject worker registration
exports.rejectWorker = async (req, res) => {
    try {
        const { workerId } = req.params;
        const { reason } = req.body;

        if (!reason) {
            return res.status(400).json({ error: 'Rejection reason is required' });
        }

        const worker = await Worker.findById(workerId);

        if (!worker) {
            return res.status(404).json({ error: 'Worker not found' });
        }

        if (worker.approvalStatus === 'approved') {
            return res.status(400).json({ error: 'Cannot reject an approved worker' });
        }

        // Update worker
        worker.adminApproved = false;
        worker.approvalStatus = 'rejected';
        worker.rejectionReason = reason;
        worker.isActive = false;

        await worker.save();

        // Send rejection email
        try {
            const emailSent = await sendEmail(
                worker.email,
                'Worker Registration Update - Erumeli Panchayath',
                `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 30px; text-align: center;">
                        <h1 style="color: white; margin: 0;">Registration Update</h1>
                    </div>
                    <div style="padding: 30px; background-color: #f9f9f9;">
                        <p style="font-size: 16px; color: #333;">Dear <strong>${worker.name}</strong>,</p>
                        
                        <p style="font-size: 14px; color: #666; line-height: 1.6;">
                            We regret to inform you that your worker registration could not be approved at this time.
                        </p>

                        <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 20px; margin: 20px 0;">
                            <h3 style="margin-top: 0; color: #856404;">Reason for Rejection</h3>
                            <p style="margin: 0; color: #856404;">${reason}</p>
                        </div>

                        <div style="background-color: #e8f4fd; border: 1px solid #b3d9f2; padding: 15px; border-radius: 5px; margin: 20px 0;">
                            <p style="margin: 0; font-size: 14px; color: #0066cc;">
                                <strong>📌 What to do next:</strong>
                            </p>
                            <ul style="margin: 10px 0; padding-left: 20px; color: #666;">
                                <li>Please review the rejection reason carefully</li>
                                <li>Ensure you have the correct documents</li>
                                <li>You may register again with proper documentation</li>
                                <li>Contact the panchayath office for clarification if needed</li>
                            </ul>
                        </div>

                        <p style="font-size: 12px; color: #999; margin-top: 30px; text-align: center;">
                            This is an automated email from Erumeli Panchayath Worker Management System.
                        </p>
                    </div>
                </div>
                `
            );

            if (!emailSent) {
                console.log('Failed to send rejection email to:', worker.email);
            }
        } catch (emailError) {
            console.error('Email sending error:', emailError);
            // Don't fail the rejection if email fails
        }

        res.status(200).json({
            success: true,
            message: 'Worker registration rejected',
            worker: {
                id: worker._id,
                name: worker.name,
                email: worker.email
            }
        });
    } catch (err) {
        console.error('Reject worker error:', err);
        res.status(500).json({ error: 'Failed to reject worker' });
    }
};

// Get worker statistics
exports.getWorkerStatistics = async (req, res) => {
    try {
        const [total, pending, approved, rejected, selfRegistered, adminCreated] = await Promise.all([
            Worker.countDocuments(),
            Worker.countDocuments({ approvalStatus: 'pending', emailVerified: true }),
            Worker.countDocuments({ approvalStatus: 'approved' }),
            Worker.countDocuments({ approvalStatus: 'rejected' }),
            Worker.countDocuments({ registrationSource: 'self' }),
            Worker.countDocuments({ registrationSource: { $in: ['admin', 'councillor'] } })
        ]);

        res.status(200).json({
            success: true,
            statistics: {
                total,
                pending,
                approved,
                rejected,
                selfRegistered,
                adminCreated,
                active: approved
            }
        });
    } catch (err) {
        console.error('Get worker statistics error:', err);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
};
