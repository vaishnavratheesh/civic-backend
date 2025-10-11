const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: { 
    type: String, 
    required: true,
    enum: [
      'COUNCILLOR_ASSIGNED',
      'COUNCILLOR_REMOVED',
      'PRESIDENT_ASSIGNED',
      'PRESIDENT_REMOVED',
      'USER_CREATED',
      'USER_DEACTIVATED',
      'CREDENTIALS_SENT',
      'TOKEN_REVOKED',
      'ROLE_CHANGED'
    ]
  },
  actorId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  targetId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: false 
  },
  details: { 
    type: mongoose.Schema.Types.Mixed,
    required: false 
  },
  timestamp: { 
    type: Date, 
    default: Date.now 
  },
  ipAddress: { 
    type: String, 
    required: false 
  },
  userAgent: { 
    type: String, 
    required: false 
  }
});

// Index for efficient querying
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ actorId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema, 'auditLogs');