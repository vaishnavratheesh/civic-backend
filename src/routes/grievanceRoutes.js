const express = require('express');
const router = express.Router();
const grievanceController = require('../controllers/grievanceController');
const auth = require('../middleware/auth');

// Create a new grievance (citizen)
router.post('/grievances', auth, grievanceController.createGrievance);

// Get user's own grievances (citizen)
router.get('/grievances/my', auth, grievanceController.getMyGrievances);

// Get community grievances (citizen)
router.get('/grievances/community', auth, grievanceController.getCommunityGrievances);

// Get all grievances (admin/officer)
router.get('/grievances', auth, grievanceController.getAllGrievances);

// Update grievance status (admin/officer)
router.put('/grievances/:id', auth, grievanceController.updateGrievanceStatus);

// Get grievance statistics (admin/officer)
router.get('/grievances/stats', auth, grievanceController.getGrievanceStats);

module.exports = router;