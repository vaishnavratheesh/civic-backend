const mongoose = require('mongoose');

const grievanceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userName: {
    type: String,
    required: true
  },
  ward: {
    type: Number,
    required: true
  },
  issueType: {
    type: String,
    required: true,
    enum: ['Road Repair', 'Streetlight Outage', 'Waste Management', 'Water Leakage', 'Public Nuisance', 'Drainage', 'Other']
  },
  description: {
    type: String,
    required: true,
    maxlength: 1000
  },
  location: {
    lat: {
      type: Number,
      required: true
    },
    lng: {
      type: Number,
      required: true
    },
    address: {
      type: String,
      required: true
    }
  },
  imageURL: {
    type: String,
    default: null
  },
  priorityScore: {
    type: Number,
    default: 1,
    min: 1,
    max: 5
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'resolved', 'rejected'],
    default: 'pending'
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  officerName: {
    type: String,
    default: null
  },
  source: {
    type: String,
    enum: ['user', 'officer', 'admin'],
    default: 'user'
  },
  resolutionNotes: {
    type: String,
    default: null
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
grievanceSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Grievance', grievanceSchema);