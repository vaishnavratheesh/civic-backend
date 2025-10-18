const express = require('express');
const router = express.Router();
const grievanceController = require('../controllers/grievanceController');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

// Ward lookup from coordinates (public or auth? keep auth to avoid abuse)
router.get('/grievances/ward-lookup', auth, grievanceController.lookupWardByCoordinates);

// Create a new grievance (citizen) with optional attachments
router.post('/grievances', auth, upload.any(), grievanceController.createGrievance);

// Quick duplicate check prior to upload
router.post('/grievances/check-duplicate', auth, grievanceController.checkDuplicateQuick);

// Get user's own grievances (citizen)
router.get('/grievances/my', auth, grievanceController.getMyGrievances);

// Get community grievances (citizen)
router.get('/grievances/community', auth, grievanceController.getCommunityGrievances);

// Get all grievances (admin/officer)
router.get('/grievances', auth, grievanceController.getAllGrievances);
// Councillor review - ward-specific grievances sorted by credibility
router.get('/grievances/review', auth, grievanceController.getGrievancesForReview);

// Get grievance details
router.get('/grievances/:id', auth, grievanceController.getGrievanceById);

// Update grievance status (admin/officer)
router.put('/grievances/:id/status', auth, grievanceController.updateGrievanceStatus);

// Auto verify grievance (OCR + AI + priority)
router.put('/grievances/:id/verify/auto', auth, grievanceController.autoVerifyGrievance);

// Assign grievance to worker/officer
router.put('/grievances/:id/assign', auth, grievanceController.assignGrievance);

// Get grievance statistics (admin/officer)
router.get('/grievances/stats', auth, grievanceController.getGrievanceStats);

// Community upvote grievance
router.post('/grievances/:id/upvote', auth, grievanceController.upvoteGrievance);

// Video proof request endpoints
router.post('/grievances/:id/request-video-proof', auth, grievanceController.requestVideoProof);
router.post('/grievances/:id/upload-video-proof', auth, upload.single('video'), grievanceController.uploadVideoProof);
router.get('/grievances/video-proof-requests/my', auth, grievanceController.getMyVideoProofRequests);
router.get('/grievances/:grievanceId/test-video-requests', auth, grievanceController.testVideoProofRequests);

// TODO: Right to delete (policy-driven)
// router.delete('/grievances/:id', auth, grievanceController.deleteGrievance)

module.exports = router;
