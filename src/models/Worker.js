const mongoose = require('mongoose');

const workerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    workerId: {
        type: String,
        unique: true,
        sparse: true, // Allow null for self-registered workers before approval
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    registrationSource: {
        type: String,
        enum: ['admin', 'councillor', 'self'],
        default: 'self'
    },
    emailVerified: {
        type: Boolean,
        default: false
    },
    adminApproved: {
        type: Boolean,
        default: false
    },
    approvalStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    rejectionReason: {
        type: String
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    approvedAt: {
        type: Date
    },
    type: {
        type: String,
        required: true,
        enum: [
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
        ]
    },
    employmentType: {
        type: String,
        enum: ['government', 'private'],
        default: 'private'
    },
    contact: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    ward: {
        type: String,
        required: true
    },
    idProof: {
        type: {
            type: String,
            enum: ['aadhar', 'voter_id', 'driving_license', 'employee_id'],
        },
        fileUrl: String,
        uploadedAt: Date
    },
    verificationDocument: {
        // Worker-specific proof (e.g., harithakarmasena certificate, plumber license)
        type: String, // Document type/name
        fileUrl: String,
        uploadedAt: Date
    },
    profilePicture: {
        type: String,
        default: null
    },
    availability: {
        type: String,
        enum: ['available', 'busy', 'offline'],
        default: 'available'
    },
    assignedTasks: {
        type: Number,
        default: 0
    },
    specialization: {
        type: String,
        trim: true
    },
    joiningDate: {
        type: Date,
        default: Date.now
    },
    experience: {
        type: Number, // in years
        default: 0
    },
    rating: {
        type: Number,
        min: 0,
        max: 5,
        default: 0
    },
    completedTasks: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Index for faster queries
workerSchema.index({ ward: 1, type: 1, availability: 1 });
workerSchema.index({ isActive: 1 });

const Worker = mongoose.model('Worker', workerSchema);

module.exports = Worker;
