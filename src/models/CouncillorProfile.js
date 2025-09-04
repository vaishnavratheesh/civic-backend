const mongoose = require('mongoose');

const councillorProfileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  ward: { type: Number, required: true },
  panchayath: { type: String, default: 'Erumeli Panchayath' },
  profilePicture: { type: String, required: false },
  address: { type: String, required: false },
  contactNumber: { type: String, required: false },

  // Councillor-specific fields
  appointmentDate: { type: Date, required: false },
  endDate: { type: Date, required: false },
  partyAffiliation: { type: String, required: false },
  educationalQualification: { type: String, required: false },
  previousExperience: { type: String, required: false },
  emergencyContact: { type: String, required: false },
  emergencyContactRelation: { type: String, required: false },

  approved: { type: Boolean, default: true },
  isVerified: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CouncillorProfile', councillorProfileSchema, 'councillorProfiles');

