const express = require('express');
const router = express.Router();
const councillorController = require('../controllers/councillorController');
const councillorVerification = require('../controllers/councillorVerificationController');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const upload = require('../middleware/upload');

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

module.exports = router; 