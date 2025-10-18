const mongoose = require('mongoose');

const grievanceSchema = new mongoose.Schema({
  // Citizen reference
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
  // Title and category (optional)
  title: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    default: ''
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
  // Location details
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
  // GeoJSON point for geospatial queries
  geo: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [lng, lat]
      default: undefined
    }
  },
  // Backward compatibility: primary image URL
  imageURL: {
    type: String,
    default: null
  },
  // Attachments (image/pdf)
  attachments: [{
    url: { type: String },
    type: { type: String } // image/pdf
  }],
  // OCR text per file
  ocrText: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // AI classification label
  aiClassification: {
    type: String,
    default: ''
  },
  // Credibility scoring and signals
  credibilityScore: {
    type: Number,
    default: 0
  },
  geoValid: {
    type: Boolean,
    default: true
  },
  duplicateFlag: {
    type: Boolean,
    default: false
  },
  imageHashes: [{ type: String }],
  priorityScore: {
    type: Number,
    default: 1
  },
  // Duplicate grouping
  duplicateGroupId: {
    type: String,
    default: null,
    index: true
  },
  duplicateCount: {
    type: Number,
    default: 1
  },
  // Aggregated participation
  citizenIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  upvotes: { type: Number, default: 1 },
  // Unique users who supported/upvoted this grievance group (stored on leader doc)
  upvoters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'resolved', 'rejected', 'assigned', 'Pending', 'InProgress', 'Resolved', 'Rejected', 'Assigned'],
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
  // Credibility flags and audit
  flags: [{ type: String }],
  audit: {
    submittedAt: { type: Date },
    ip: { type: String },
    device: { type: String }
  },
  // Video proof requests
  videoProofRequests: [{
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    requestedByName: { type: String, required: true },
    requestedAt: { type: Date, default: Date.now },
    message: { type: String, default: 'Please provide additional video evidence for this complaint.' },
    status: { 
      type: String, 
      enum: ['pending', 'uploaded', 'rejected'], 
      default: 'pending' 
    },
    videoUrl: { type: String, default: null },
    uploadedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null }
  }],
  // Action history audit
  actionHistory: [{
    action: { type: String },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date, default: Date.now },
    remarks: { type: String }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes
grievanceSchema.index({ geo: '2dsphere' });

// Update the updatedAt field before saving
grievanceSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Grievance', grievanceSchema);