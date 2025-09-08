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

  // Detailed Assessment Questions for ML Analysis
  assessment: {
    // Family Information
    familyMembers: { type: Number, required: true },
    childrenCount: { type: Number, required: true },
    elderlyCount: { type: Number, required: true },
    disabledMembers: { type: Number, required: true },
    
    // Income Details
    monthlyIncome: { type: Number, required: true },
    incomeSource: { 
      type: String, 
      enum: ['salary', 'business', 'agriculture', 'daily_wage', 'pension', 'other'],
      required: true 
    },
    hasOtherIncome: { type: Boolean, default: false },
    otherIncomeAmount: { type: Number, default: 0 },
    
    // Housing Information
    houseOwnership: { 
      type: String, 
      enum: ['owned', 'rented', 'government', 'other'],
      required: true 
    },
    houseType: { 
      type: String, 
      enum: ['concrete', 'semi_concrete', 'thatched', 'temporary'],
      required: true 
    },
    hasElectricity: { type: Boolean, default: false },
    hasWaterConnection: { type: Boolean, default: false },
    hasToilet: { type: Boolean, default: false },
    
    // Education
    educationLevel: { 
      type: String, 
      enum: ['illiterate', 'primary', 'secondary', 'higher_secondary', 'graduate', 'post_graduate'],
      required: true 
    },
    childrenEducation: { 
      type: String, 
      enum: ['not_applicable', 'government', 'private', 'not_attending'],
      required: true 
    },
    
    // Health
    hasHealthInsurance: { type: Boolean, default: false },
    chronicIllness: { type: Boolean, default: false },
    illnessDetails: { type: String, required: false },
    hasDisability: { type: Boolean, default: false },
    disabilityType: { type: String, required: false },
    
    // Employment
    employmentStatus: { 
      type: String, 
      enum: ['employed', 'unemployed', 'self_employed', 'student', 'retired', 'homemaker'],
      required: true 
    },
    jobStability: { 
      type: String, 
      enum: ['permanent', 'temporary', 'contract', 'daily_wage', 'not_applicable'],
      required: true 
    },
    
    // Assets
    hasBankAccount: { type: Boolean, default: false },
    hasVehicle: { type: Boolean, default: false },
    vehicleType: { type: String, required: false },
    hasLand: { type: Boolean, default: false },
    landArea: { type: Number, default: 0 },
    
    // Social Status
    caste: { 
      type: String, 
      enum: ['general', 'obc', 'sc', 'st', 'other'],
      required: true 
    },
    religion: { 
      type: String, 
      enum: ['hindu', 'muslim', 'christian', 'sikh', 'buddhist', 'jain', 'other'],
      required: true 
    },
    isWidow: { type: Boolean, default: false },
    isOrphan: { type: Boolean, default: false },
    isSeniorCitizen: { type: Boolean, default: false },
    
    // Emergency Information
    hasEmergencyFund: { type: Boolean, default: false },
    emergencyContact: { type: String, required: true },
    emergencyRelation: { type: String, required: true },
    
    // Additional Information
    previousApplications: { type: Number, default: 0 },
    previousSchemes: [String],
    additionalNeeds: { type: String, required: false },
    specialCircumstances: { type: String, required: false }
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