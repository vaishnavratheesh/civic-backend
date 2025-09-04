const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/register', authController.register);
router.post('/verify-otp', authController.verifyOTP);
router.post('/resend-otp', authController.resendOTP);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/google-login', authController.googleLogin);
router.post('/google-register', authController.googleRegister);
router.post('/google-register-complete', authController.googleRegisterComplete);
router.post('/check-google-user', authController.checkGoogleUser);
router.post('/create-admin', authController.createAdmin);

module.exports = router;