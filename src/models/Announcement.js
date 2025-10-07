const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  audience: { type: String, enum: ['citizens', 'councillors', 'all'], default: 'all' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  createdByRole: { type: String, enum: ['president','councillor'], required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Announcement', announcementSchema);

