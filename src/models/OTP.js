const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true },
  otp: { type: String, required: true },
  userData: {
    name: String,
    email: String,
    password: String,
    ward: { type: mongoose.Schema.Types.Mixed }, // Can be Number for citizens or String for workers
    panchayath: String, // For citizens
    // Worker-specific fields
    type: { type: String }, // Explicitly define type to avoid Mongoose confusion
    contact: String,
    specialization: String,
    experience: Number,
    registrationSource: String,
    emailVerified: Boolean,
    adminApproved: Boolean,
    approvalStatus: String
  },
  createdAt: { type: Date, default: Date.now, expires: 600 } // Expires in 10 minutes
});

module.exports = mongoose.model('OTP', otpSchema);