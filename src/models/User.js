const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: { type: String, required: false }, // Allow null for Google users
  ward: { type: Number, required: false }, // Make ward optional for admin/president
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
  role: { type: String, enum: ['citizen', 'councillor', 'officer', 'admin', 'president'], default: 'citizen' },
  approved: { type: Boolean, default: false },
  active: { type: Boolean, default: true }, // For deactivating users
  tokenVersion: { type: Number, default: 0 }, // For token invalidation
  wardNumber: { type: Number, required: false }, // Alias for ward for consistency
  
  // Councillor-specific fields
  appointmentDate: { type: Date, required: false }, // Date appointed as ward member
  endDate: { type: Date, required: false }, // End date of term
  partyAffiliation: { type: String, required: false }, // Political party affiliation
  educationalQualification: { type: String, required: false }, // Educational background
  previousExperience: { type: String, required: false }, // Previous experience
  emergencyContact: { type: String, required: false }, // Emergency contact number
  emergencyContactRelation: { type: String, required: false }, // Relation to emergency contact
  
  // Identity proof for councillor verification
  idProof: {
    type: {
      type: String,
      enum: ['aadhar', 'voter_id', 'driving_license', 'ration_card', 'passport'],
      required: false
    },
    fileUrl: { type: String, required: false },
    uploadedAt: { type: Date, required: false }
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Pre-save middleware to sync ward and wardNumber
userSchema.pre('save', function(next) {
  if (this.wardNumber !== undefined && this.wardNumber !== this.ward) {
    this.ward = this.wardNumber;
  }
  next();
});

module.exports = mongoose.model('User', userSchema, 'users');