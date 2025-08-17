const express = require('express');
const router = express.Router();
const councillorController = require('../controllers/councillorController');
const auth = require('../middleware/auth');

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

module.exports = router; 