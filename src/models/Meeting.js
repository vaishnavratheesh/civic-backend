const mongoose = require('mongoose');

const MeetingSchema = new mongoose.Schema({
  url: { type: String, required: true },
  room: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 7200 } // expires in 2 hours
});

module.exports = mongoose.model('Meeting', MeetingSchema);