const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const controller = require('../controllers/presidentController');

// Ensure user is authenticated; controller re-checks role === 'president'
router.get('/president/wards', auth, controller.getWardsOverview);
router.get('/president/welfare', auth, controller.getWelfareStats);

// Announcements
router.get('/president/announcements', controller.listAnnouncements);
router.post('/president/announcements', auth, controller.createAnnouncement);
router.delete('/president/announcements/:id', auth, controller.deleteAnnouncement);

// Events
router.get('/president/events', controller.listEvents);
router.post('/president/events', auth, controller.createEvent);
router.delete('/president/events/:id', auth, controller.deleteEvent);

// Messages
router.get('/president/messages', auth, controller.listMessages);
router.post('/president/messages', auth, controller.sendMessage);

// Video
router.post('/president/video', auth, controller.createMeeting);

module.exports = router;

