const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  ward: { type: Number, required: false }, // for ward-threaded chats
  message: { type: String, required: true },
  messageType: { type: String, enum: ['text', 'system', 'file'], default: 'text' },
  fileUrl: { type: String, required: false },
  fileName: { type: String, required: false },
  fileSize: { type: Number, required: false },
  mimeType: { type: String, required: false },
  isRead: { type: Boolean, default: false },
  deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  threadId: { type: String, required: false }, // for grouping messages in conversations
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', messageSchema);

