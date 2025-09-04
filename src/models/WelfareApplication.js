const mongoose = require('mongoose');

const welfareApplicationSchema = new mongoose.Schema({
  // Scheme reference
  schemeId: { type: mongoose.Schema.Types.ObjectId, ref: 'WelfareScheme', required: true },
  schemeTitle: { type: String, required: true },
  
  // Applicant information
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, required: true },
  userEmail: { type: String, required: true },
  userWard: { type: Number, required: true },
  
  // Application details
  personalDetails: {
    address: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    rationCardNumber: { type: String, required: false },
    aadharNumber: { type: String, required: false },
    familyIncome: { type: Number, required: true },
    dependents: { type: Number, required: true },
    isHandicapped: { type: Boolean, default: false },
    isSingleWoman: { type: Boolean, default: false }
  },
  
  // Application content
  reason: { type: String, required: true },
  supportingDocuments: [String], // URLs to uploaded documents
  
  // Scoring and evaluation
  score: { type: Number, required: false }, // AI-generated score
  justification: { type: String, required: false }, // AI-generated justification
  
  // Status and workflow
  status: { 
    type: String, 
    enum: ['pending', 'under_review', 'approved', 'rejected', 'completed'], 
    default: 'pending' 
  },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, required: false }, // admin or councillor ID
  reviewedByName: { type: String, required: false },
  reviewComments: { type: String, required: false },
  
  // Timestamps
  appliedAt: { type: Date, default: Date.now },
  reviewedAt: { type: Date, required: false },
  completedAt: { type: Date, required: false }
});

// Indexes for efficient queries
welfareApplicationSchema.index({ schemeId: 1, status: 1 });
welfareApplicationSchema.index({ userId: 1, status: 1 });
welfareApplicationSchema.index({ userWard: 1, status: 1 });

module.exports = mongoose.model('WelfareApplication', welfareApplicationSchema, 'welfare_applications'); 