const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Worker = require('../models/Worker');
const OTP = require('../models/OTP');
const { sendOTPEmail } = require('../utils/email');
const generateOTP = require('../utils/generateOTP');
const config = require('../config/config');

// Worker Registration - Send OTP
async function registerWorker(req, res) {
    const { name, email, password, type, contact, ward, specialization, experience } = req.body;

    try {
        console.log('🔵 Worker Registration Request:', { name, email, type, contact, ward });

        // Check if worker already exists
        const existingWorker = await Worker.findOne({ email });
        if (existingWorker) {
            console.log('❌ Worker already exists:', email);
            return res.status(400).json({ error: 'Email already registered' });
        }

        // Validate worker type
        const validTypes = [
            'harithakarmasena',
            'sanitation_worker',
            'supervisor',
            'plumber',
            'water_authority',
            'pipe_fitter',
            'road_contractor',
            'civil_engineer',
            'mason',
            'electrician',
            'kseb_technician',
            'maintenance_worker',
            'drainage_worker',
            'police',
            'municipal_inspector',
            'general_worker'
        ];

        if (!validTypes.includes(type)) {
            console.log('❌ Invalid worker type:', type);
            return res.status(400).json({ error: 'Invalid worker type' });
        }

        // Generate OTP
        const otp = generateOTP();
        console.log('✅ OTP generated:', otp);

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        console.log('✅ Password hashed');

        // Delete any existing OTP for this email
        await OTP.findOneAndDelete({ email });
        console.log('✅ Old OTP records deleted');

        // Create OTP record with worker data
        const otpRecord = new OTP({
            email,
            otp,
            userData: {
                name,
                email,
                password: hashedPassword,
                type,
                contact,
                ward: ward ? ward.toString() : '', // Ensure ward is a string
                specialization: specialization || '',
                experience: experience || 0,
                registrationSource: 'self',
                emailVerified: false,
                adminApproved: false,
                approvalStatus: 'pending'
            }
        });

        await otpRecord.save();
        console.log('✅ OTP record saved to database');

        // Send OTP email
        console.log('📧 Attempting to send OTP email to:', email);
        const emailSent = await sendOTPEmail(email, otp, name);
        console.log('📧 Email send result:', emailSent);

        if (!emailSent) {
            console.error('❌ Failed to send verification email to:', email);
            // Delete the OTP record if email fails
            await OTP.findOneAndDelete({ email });
            return res.status(500).json({ error: 'Failed to send verification email. Please try again.' });
        }

        console.log('✅ Worker registration successful, OTP sent to:', email);
        res.status(200).json({
            message: 'OTP sent to your email. Please verify to complete registration.',
            email
        });
    } catch (err) {
        console.error('❌ Worker registration error:', err);
        console.error('Error stack:', err.stack);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
}

// Worker OTP Verification
async function verifyWorkerOTP(req, res) {
    const { email, otp } = req.body;

    try {
        console.log('Worker OTP verification request:', { email, otp });

        // Validate input
        if (!email || !otp) {
            return res.status(400).json({ error: 'Email and OTP are required' });
        }

        // Find OTP record
        const otpRecord = await OTP.findOne({ email });

        if (!otpRecord) {
            console.log('OTP record not found for email:', email);
            return res.status(400).json({
                error: 'OTP expired or not found. Please request a new one.'
            });
        }

        console.log('OTP record found:', { email, storedOTP: otpRecord.otp, providedOTP: otp });

        // Verify OTP (trim whitespace and compare as strings)
        if (otpRecord.otp.toString().trim() !== otp.toString().trim()) {
            console.log('OTP mismatch');
            return res.status(400).json({ error: 'Invalid OTP. Please try again.' });
        }

        console.log('OTP verified successfully, creating worker account');

        // Create worker account
        const workerData = otpRecord.userData;

        if (!workerData) {
            console.error('Worker data not found in OTP record');
            return res.status(500).json({ error: 'Invalid OTP data. Please register again.' });
        }

        const worker = new Worker({
            name: workerData.name,
            email: workerData.email,
            password: workerData.password,
            type: workerData.type,
            contact: workerData.contact,
            ward: workerData.ward ? workerData.ward.toString() : '',
            specialization: workerData.specialization || '',
            experience: workerData.experience || 0,
            registrationSource: 'self',
            emailVerified: true,
            adminApproved: true, // Auto-approve for immediate access
            approvalStatus: 'approved', // Auto-approve
            isActive: true // Auto-activate
        });

        await worker.save();
        console.log('Worker account created successfully:', worker.email);

        // Delete OTP record
        await OTP.findOneAndDelete({ email });
        console.log('OTP record deleted');

        res.status(201).json({
            message: 'Email verified successfully! Your registration is pending admin approval. You will be notified once approved.',
            success: true
        });
    } catch (err) {
        console.error('Worker OTP verification error:', err);
        console.error('Error stack:', err.stack);

        if (err.code === 11000) {
            const duplicateKey = Object.keys(err.keyPattern || {})[0] || 'Email';
            return res.status(400).json({ error: `${duplicateKey} already registered` });
        }

        res.status(500).json({
            error: 'Verification failed. Please try again.',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}

// Resend OTP for Worker Registration
async function resendWorkerOTP(req, res) {
    const { email } = req.body;

    try {
        console.log('🔵 Resend Worker OTP Request:', email);

        // Find existing OTP record
        const otpRecord = await OTP.findOne({ email });

        if (!otpRecord) {
            console.log('❌ No OTP record found for email:', email);
            return res.status(400).json({
                error: 'No pending registration found for this email.'
            });
        }

        console.log('✅ OTP record found, generating new OTP');

        // Generate new OTP
        const newOtp = generateOTP();
        console.log('✅ New OTP generated:', newOtp);

        // Update OTP record
        otpRecord.otp = newOtp;
        otpRecord.createdAt = new Date();
        await otpRecord.save();
        console.log('✅ OTP record updated');

        // Send new OTP email
        console.log('📧 Attempting to send new OTP email');
        const emailSent = await sendOTPEmail(email, newOtp, otpRecord.userData.name);
        console.log('📧 Email send result:', emailSent);

        if (!emailSent) {
            console.error('❌ Failed to send verification email');
            return res.status(500).json({ error: 'Failed to send verification email. Please try again.' });
        }

        console.log('✅ New OTP sent successfully to:', email);
        res.status(200).json({ message: 'New OTP sent to your email.' });
    } catch (err) {
        console.error('❌ Resend worker OTP error:', err);
        console.error('Error stack:', err.stack);
        res.status(500).json({ error: 'Failed to resend OTP. Please try again.' });
    }
}

// Worker Login
async function loginWorker(req, res) {
    const { email, password } = req.body;

    try {
        // Find worker by email
        const worker = await Worker.findOne({ email });

        if (!worker) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // Check if email is verified
        if (!worker.emailVerified) {
            return res.status(403).json({
                error: 'Email not verified. Please complete the registration process.',
                emailVerified: false
            });
        }

        // Check if admin approved
        if (!worker.adminApproved || worker.approvalStatus !== 'approved') {
            if (worker.approvalStatus === 'rejected') {
                return res.status(403).json({
                    error: `Your registration has been rejected. Reason: ${worker.rejectionReason || 'Not specified'}`,
                    approvalStatus: 'rejected'
                });
            }
            return res.status(403).json({
                error: 'Your registration is pending admin approval. Please wait for approval notification.',
                approvalStatus: 'pending'
            });
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, worker.password);

        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // Check if account is active
        if (!worker.isActive) {
            return res.status(403).json({ error: 'Your account is inactive. Please contact admin.' });
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                userId: worker._id,
                role: 'worker',
                workerType: worker.type,
                ward: worker.ward
            },
            config.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Return worker profile without password
        const workerProfile = {
            id: worker._id,
            name: worker.name,
            email: worker.email,
            workerId: worker.workerId,
            type: worker.type,
            employmentType: worker.employmentType || 'private',
            contact: worker.contact,
            ward: worker.ward,
            specialization: worker.specialization,
            experience: worker.experience,
            availability: worker.availability,
            assignedTasks: worker.assignedTasks,
            completedTasks: worker.completedTasks,
            rating: worker.rating,
            profilePicture: worker.profilePicture
        };

        res.status(200).json({
            message: 'Login successful',
            token,
            worker: workerProfile
        });
    } catch (err) {
        console.error('Worker login error:', err);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
}

// Upload Verification Document (after registration, before approval)
async function uploadVerificationDocument(req, res) {
    try {
        const workerId = req.user.id;

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const worker = await Worker.findById(workerId);

        if (!worker) {
            return res.status(404).json({ error: 'Worker not found' });
        }

        // Update verification document
        worker.verificationDocument = {
            type: req.body.documentType || 'Professional Certificate',
            fileUrl: `/uploads/${req.file.filename}`,
            uploadedAt: new Date()
        };

        await worker.save();

        res.status(200).json({
            message: 'Verification document uploaded successfully',
            verificationDocument: worker.verificationDocument
        });
    } catch (err) {
        console.error('Upload verification document error:', err);
        res.status(500).json({ error: 'Failed to upload document' });
    }
}

module.exports = {
    registerWorker,
    verifyWorkerOTP,
    resendWorkerOTP,
    loginWorker,
    uploadVerificationDocument
};
