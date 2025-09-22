const mongoose = require('mongoose');

const pastMemberSchema = new mongoose.Schema({
  // Original user data
  originalUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: false },
  address: { type: String, required: false },
  ward: { type: String, required: true },
  panchayath: { type: String, required: true },
  
  // Removal details
  removalReason: { 
    type: String, 
    enum: ['death', 'relocation', 'other'], 
    required: true 
  },
  deathCertificateUrl: { type: String, required: false }, // Only for death cases
  removalComments: { type: String, required: false },
  
  // Councillor who performed the action
  removedBy: { 
    councillorId: { type: mongoose.Schema.Types.ObjectId, required: true },
    councillorName: { type: String, required: true },
    councillorEmail: { type: String, required: true }
  },
  
  // Timestamps
  originalRegistrationDate: { type: Date, required: true },
  removedAt: { type: Date, default: Date.now },
  
  // Status
  status: { 
    type: String, 
    enum: ['removed', 'deceased'], 
    default: 'removed' 
  }
});

// Indexes for efficient queries
pastMemberSchema.index({ ward: 1, panchayath: 1 });
pastMemberSchema.index({ removalReason: 1 });
pastMemberSchema.index({ removedAt: -1 });
pastMemberSchema.index({ originalUserId: 1 });

module.exports = mongoose.model('PastMember', pastMemberSchema, 'past_members');