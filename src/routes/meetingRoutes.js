const express = require('express');
const router = express.Router();
const Meeting = require('../models/Meeting');

// Public endpoint to get the latest active meeting
router.get('/meeting', async (req, res) => {
  try {
    // Find the latest meeting (not expired)
    const meeting = await Meeting.findOne({}).sort({ createdAt: -1 });
    if (!meeting) return res.json({ success: true, url: null });
    res.json({ success: true, url: meeting.url });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to fetch meeting' });
  }
});

module.exports = router;
