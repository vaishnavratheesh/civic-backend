const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const upload = require('../middleware/upload');

// Email existence check
router.post('/check-email', userController.checkEmail);

// Ward statistics (public/simple)
router.get('/wards/:ward/stats', userController.getWardStats);

// Get user profile
router.get('/users/:id', userController.getProfile);

// Update user profile (with optional image upload)
router.put('/users/:id', upload.single('profilePicture'), userController.updateProfile);

// Update profile picture only
router.put('/users/:id/profile-picture', upload.single('profilePicture'), userController.updateProfilePicture);

// Change password
router.put('/users/:id/password', userController.changePassword);

module.exports = router;