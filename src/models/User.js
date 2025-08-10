const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: { type: String, required: false }, // Allow null for Google users
  ward: { type: Number, required: true },
  panchayath: { type: String, default: 'Erumeli Panchayath' }, // Default to Erumeli Panchayath
  googleId: { type: String, required: false }, // Google user ID
  profilePicture: { type: String, required: false }, // Profile picture URL
  registrationSource: { type: String, default: 'manual' }, // 'manual' or 'google'
  isVerified: { type: Boolean, default: false }, // Email verification status
  address: { type: String, required: false },
  contactNumber: { type: String, required: false },
  location: {
    latitude: { type: Number, required: false },
    longitude: { type: Number, required: false },
    formattedAddress: { type: String, required: false }
  },
  role: { type: String, enum: ['citizen', 'councillor', 'officer', 'admin'], default: 'citizen' },
  approved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema, 'users');