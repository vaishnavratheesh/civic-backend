const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true },
  otp: { type: String, required: true },
  userData: {
    name: String,
    email: String,
    password: String,
    ward: Number,
    panchayath: String
  },
  createdAt: { type: Date, default: Date.now, expires: 600 } // Expires in 10 minutes
});

module.exports = mongoose.model('OTP', otpSchema);