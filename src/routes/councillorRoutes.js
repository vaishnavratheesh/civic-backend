const express = require('express');
const router = express.Router();
const councillorController = require('../controllers/councillorController');
const councillorVerification = require('../controllers/councillorVerificationController');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const upload = require('../middleware/upload');
const Announcement = require('../models/Announcement');
const Event = require('../models/Event');

// Councillor login
router.post('/councillor-login', councillorController.councillorLogin);

// Complete councillor profile
router.post('/councillors/complete-profile', auth, councillorController.completeProfile);

// Change councillor password
router.post('/councillors/change-password', auth, councillorController.changePassword);

// Get councillor profile
router.get('/councillors/profile', auth, councillorController.getProfile);

// Update councillor profile
router.put('/councillors/profile', auth, councillorController.updateProfile);

// Councillor verification endpoints
router.get('/councillors/ward/citizens', auth, requireRole('councillor'), councillorVerification.listWardCitizens);
router.post('/councillors/ward/citizens/:id/verify', auth, requireRole('councillor'), councillorVerification.verifyCitizen);
router.delete('/councillors/ward/citizens/:id', auth, requireRole('councillor'), upload.single('deathCertificate'), councillorVerification.removeCitizen);

// Councillors can post announcements for citizens only
router.post('/councillors/announcements', auth, requireRole('councillor'), async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title || !description) return res.status(400).json({ success:false, message:'Title and description required' });
    const doc = await Announcement.create({ title, description, audience: 'citizens', createdBy: req.user.id, createdByRole: 'councillor' });
    try { req.app.get('io')?.emit('announcement:new', { item: doc }); } catch {}
    res.status(201).json({ success:true, item: doc });
  } catch (e) {
    res.status(400).json({ success:false, message:'Failed to create announcement' });
  }
});

// List my announcements (citizens-only)
router.get('/councillors/announcements/mine', auth, requireRole('councillor'), async (req, res) => {
  try {
    const items = await Announcement.find({ createdBy: req.user.id, createdByRole: 'councillor' }).sort({ createdAt: -1 }).lean();
    res.json({ success:true, items });
  } catch (e) {
    res.status(500).json({ success:false, message:'Failed to list announcements' });
  }
});

// Update my announcement
router.put('/councillors/announcements/:id', auth, requireRole('councillor'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description } = req.body;
    const doc = await Announcement.findOneAndUpdate(
      { _id: id, createdBy: req.user.id, createdByRole: 'councillor' },
      { $set: { title, description } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ success:false, message:'Announcement not found' });
    res.json({ success:true, item: doc });
  } catch (e) {
    res.status(400).json({ success:false, message:'Failed to update announcement' });
  }
});

// Delete my announcement
router.delete('/councillors/announcements/:id', auth, requireRole('councillor'), async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Announcement.findOneAndDelete({ _id: id, createdBy: req.user.id, createdByRole: 'councillor' });
    if (!doc) return res.status(404).json({ success:false, message:'Announcement not found' });
    res.json({ success:true });
  } catch (e) {
    res.status(400).json({ success:false, message:'Failed to delete announcement' });
  }
});

// Councillors can post events for citizens only
router.post('/councillors/events', auth, requireRole('councillor'), async (req, res) => {
  try {
    const { title, description, time, location } = req.body;
    if (!title || !description || !time) return res.status(400).json({ success:false, message:'Title, description, and time required' });
    const doc = await Event.create({ title, description, time, location, audience: 'citizens', createdBy: req.user.id, createdByRole: 'councillor' });
    try { req.app.get('io')?.emit('event:new', { item: doc }); } catch {}
    res.status(201).json({ success:true, item: doc });
  } catch (e) {
    res.status(400).json({ success:false, message:'Failed to create event' });
  }
});

// List my events
router.get('/councillors/events/mine', auth, requireRole('councillor'), async (req, res) => {
  try {
    const now = new Date();
    const items = await Event.find({ createdBy: req.user.id, createdByRole: 'councillor', time: { $gte: new Date(now.getTime() - 365*24*60*60*1000) } }).sort({ time: -1 }).lean();
    res.json({ success:true, items });
  } catch (e) {
    res.status(500).json({ success:false, message:'Failed to list events' });
  }
});

// Update my event
router.put('/councillors/events/:id', auth, requireRole('councillor'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, time, location } = req.body;
    const doc = await Event.findOneAndUpdate(
      { _id: id, createdBy: req.user.id, createdByRole: 'councillor' },
      { $set: { title, description, time, location } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ success:false, message:'Event not found' });
    res.json({ success:true, item: doc });
  } catch (e) {
    res.status(400).json({ success:false, message:'Failed to update event' });
  }
});

// Delete my event
router.delete('/councillors/events/:id', auth, requireRole('councillor'), async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Event.findOneAndDelete({ _id: id, createdBy: req.user.id, createdByRole: 'councillor' });
    if (!doc) return res.status(404).json({ success:false, message:'Event not found' });
    res.json({ success:true });
  } catch (e) {
    res.status(400).json({ success:false, message:'Failed to delete event' });
  }
});

module.exports = router; 