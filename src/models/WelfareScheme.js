const mongoose = require('mongoose');

const welfareSchemeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, required: true }, // e.g., 'Education', 'Healthcare', 'Housing', 'Employment'
  minAge: { type: Number, required: true, min: 0, max: 120 },
  maxAge: { type: Number, required: true, min: 0, max: 120 },
  benefits: { type: String, required: true },
  requiredDocuments: [{
    name: {
      type: String,
      enum: [
        'Aadhar Card','Ration Card','Voter ID','Driving License','PAN Card','Passport','Disability Certificate','Income Certificate','Caste Certificate','Residence Certificate','BPL Card','Senior Citizen ID','Widow Certificate','Death Certificate'
      ],
      required: false
    },
    type: { type: String, default: 'file' },
    formats: [{ type: String }]
  }],
  totalSlots: { type: Number, required: true },
  availableSlots: { type: Number, required: true },
  additionalDetails: { type: String, required: false }, // Optional additional information
  applicationDeadline: { type: Date, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  
  // Scheme scope and creator
  scope: { 
    type: String, 
    enum: ['panchayath', 'ward'], 
    required: true 
  },
  createdBy: { 
    type: String, 
    enum: ['admin', 'councillor'], 
    required: true 
  },
  creatorId: { type: mongoose.Schema.Types.ObjectId, required: true }, // admin or councillor ID
  creatorName: { type: String, required: true },
  
  // Ward information (if ward-specific)
  ward: { type: Number, required: false }, // null for panchayath-wide schemes
  
  // Status and approval
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'expired', 'cancelled'], 
    default: 'active' 
  },
  approved: { type: Boolean, default: true },
  
  // Metadata
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Index for efficient queries
welfareSchemeSchema.index({ scope: 1, ward: 1, status: 1 });
welfareSchemeSchema.index({ creatorId: 1, createdAt: -1 });

module.exports = mongoose.model('WelfareScheme', welfareSchemeSchema, 'welfare_schemes'); 