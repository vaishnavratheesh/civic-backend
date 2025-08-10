const mongoose = require('mongoose');

const passwordResetTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  token: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 3600 } // 1 hour expiry
});

module.exports = mongoose.model('PasswordResetToken', passwordResetTokenSchema);