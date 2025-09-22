const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const upload = require('../middleware/upload');
const auth = require('../middleware/auth');

// Email existence check
router.post('/check-email', userController.checkEmail);

// Ward statistics (public/simple)
router.get('/wards/:ward/stats', userController.getWardStats);

// Councillor info by ward (public)
router.get('/wards/:ward/councillor', userController.getCouncillorByWard);

// Get user profile
router.get('/users/:id', userController.getProfile);

// Update user profile (with optional image upload)
router.put('/users/:id', upload.single('profilePicture'), userController.updateProfile);

// Update profile picture only
router.put('/users/:id/profile-picture', upload.single('profilePicture'), userController.updateProfilePicture);

// Upload ID proof for verification
router.post('/users/:id/id-proof', auth, upload.single('idProof'), userController.uploadIdProof);

// Change password
router.put('/users/:id/password', userController.changePassword);

module.exports = router;