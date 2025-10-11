const mongoose = require('mongoose');

const wardSchema = new mongoose.Schema({
  wardNumber: { 
    type: Number, 
    required: true, 
    unique: true,
    min: 1,
    max: 23
  },
  councillorId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: false 
  },
  councillorName: { 
    type: String, 
    required: false 
  },
  councillorEmail: { 
    type: String, 
    required: false 
  },
  population: { 
    type: Number, 
    default: 0 
  },
  area: { 
    type: String, 
    required: false 
  },
  description: { 
    type: String, 
    required: false 
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
wardSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Ward', wardSchema, 'wards');