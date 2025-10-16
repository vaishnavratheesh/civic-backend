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
  
  // Application details - New simplified structure
  personalDetails: {
    // Basic Information
    address: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    houseNumber: { type: String, required: true },
    
    // Social Information
    caste: { 
      type: String, 
      enum: ['general', 'sc', 'st'],
      required: true 
    },
    
    // Membership & Participation
    isKudumbasreeMember: { type: Boolean, default: false },
    paysHarithakarmasenaFee: { type: Boolean, default: false },
    
    // Family Employment & Benefits
    hasFamilyMemberWithGovtJob: { type: Boolean, default: false },
    hasDisabledPersonInHouse: { type: Boolean, default: false },
    hasFamilyMemberWithPension: { type: Boolean, default: false },
    
    // Financial Information
    totalIncome: { type: Number, required: true },
    incomeCategory: { 
      type: String, 
      enum: ['apl', 'bpl'],
      required: true 
    },
    
    // Land Ownership
    ownsLand: { type: Boolean, default: false },
    landDetails: {
      villageName: { type: String, required: false },
      surveyNumber: { type: String, required: false },
      area: { type: String, required: false }
    },
    
    // Utilities
    drinkingWaterSource: { 
      type: String, 
      enum: ['own_well', 'public_well', 'tap', 'public_tap'],
      required: true 
    },
    hasToilet: { type: Boolean, default: false }
  },


  
  // Application content
  supportingDocuments: [String], // URLs to uploaded documents
  
  // New: store named document URLs as per scheme requirements
  documents: [{
    name: { type: String, required: true },
    url: { type: String, required: true }
  }],
  
  // Scoring and evaluation
  score: { type: Number, required: false }, // AI-generated score
  justification: { type: String, required: false }, // AI-generated justification
  
  // Status and workflow
  status: { 
    type: String, 
    enum: ['pending', 'under_review', 'approved', 'rejected', 'completed'], 
    default: 'pending' 
  },
  // Verification state (manual or AI)
  verification: {
    mode: { type: String, enum: ['none', 'manual', 'auto'], default: 'none' },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date },
    autoScore: { type: Number },
    remarks: { type: String },
    // Optional AI/raw details and history
    geminiRaw: { type: Object, required: false },
    suggestedAction: { type: String, enum: ['approve','review','reject'], required: false },
    history: [{
      mode: { type: String },
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      verifiedAt: { type: Date },
      action: { type: String },
      remarks: { type: String }
    }]
  },
  // Non-breaking: dedicated verification status to avoid changing existing UI status mapping
  verificationStatus: {
    type: String,
    enum: ['Pending', 'Verified-Manual', 'Verified-Auto', 'Rejected'],
    default: 'Pending'
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