const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const CouncillorProfile = require('../models/CouncillorProfile');
const PresidentProfile = require('../models/PresidentProfile');
const OTP = require('../models/OTP');
const PasswordResetToken = require('../models/PasswordResetToken');
const PastMember = require('../models/PastMember');
const { sendOTPEmail, sendPasswordResetEmail } = require('../utils/email');
const generateOTP = require('../utils/generateOTP');

const config = require('../config/config');
const googleClient = new OAuth2Client(config.GOOGLE_CLIENT_ID);

// Registration - Send OTP
async function register(req, res) {
  const { name, email, password, ward, panchayath } = req.body;
  try {
    const [existingUser, pastMember] = await Promise.all([
      User.findOne({ email }),
      PastMember.findOne({ email })
    ]);
    if (existingUser) return res.status(400).json({ error: 'Email already exists' });
    if (pastMember) return res.status(400).json({ error: 'This email belongs to a past member and cannot be reused' });
    const otp = generateOTP();
    const hashedPassword = await bcrypt.hash(password, 10);
    await OTP.findOneAndDelete({ email });
    const otpRecord = new OTP({
      email,
      otp,
      userData: { name, email, password: hashedPassword, ward, panchayath }
    });
    await otpRecord.save();
    const emailSent = await sendOTPEmail(email, otp, name);
    if (!emailSent) return res.status(500).json({ error: 'Failed to send verification email' });
    res.status(200).json({ message: 'OTP sent to your email. Please verify to complete registration.', email });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
}

// OTP Verification
async function verifyOTP(req, res) {
  const { email, otp } = req.body;
  try {
    const otpRecord = await OTP.findOne({ email });
    if (!otpRecord) return res.status(400).json({ error: 'OTP expired or not found. Please request a new one.' });
    if (otpRecord.otp !== otp) return res.status(400).json({ error: 'Invalid OTP. Please try again.' });
    const userData = otpRecord.userData;
    const user = new User({
      name: userData.name,
      email: userData.email,
      password: userData.password,
      ward: userData.ward,
      panchayath: userData.panchayath,
      registrationSource: 'manual',
      isVerified: false // New users need verification by councillor
    });
    await user.save();
    await OTP.findOneAndDelete({ email });
    res.status(201).json({ message: 'Registration completed successfully! You can now login.', success: true });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: 'Verification failed' });
  }
}

// Resend OTP
async function resendOTP(req, res) {
  const { email } = req.body;
  try {
    const otpRecord = await OTP.findOne({ email });
    if (!otpRecord) return res.status(400).json({ error: 'No pending registration found for this email.' });
    const newOtp = generateOTP();
    otpRecord.otp = newOtp;
    otpRecord.createdAt = new Date();
    await otpRecord.save();
    const emailSent = await sendOTPEmail(email, newOtp, otpRecord.userData.name);
    if (!emailSent) return res.status(500).json({ error: 'Failed to send verification email' });
    res.status(200).json({ message: 'New OTP sent to your email.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resend OTP' });
  }
}

// Login (unified for citizens/admin/officer from users, and councillors from councillor_profiles)
async function login(req, res) {
  const { email, password } = req.body;
  try {
    // First try normal users (citizens/admin/officer)
    let user = await User.findOne({ email });
    if (user) {
      const isMatch = await bcrypt.compare(password, user.password || '');
      if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });
      // Auto-assign president role for demo credentials
      if (email === 'presidenterumely1@gmail.com' && password === 'Presidenterumely1@123') {
        if (user.role !== 'president') {
          user.role = 'president';
          user.approved = true;
          user.isVerified = true;
          await user.save();
        }
      }
      const token = jwt.sign({ userId: user._id, role: user.role }, config.JWT_SECRET, { expiresIn: '7d' });
      return res.json({ 
        token, 
        userId: user._id, 
        name: user.name, 
        email: user.email, 
        ward: user.ward, 
        panchayath: user.panchayath,
        profilePicture: user.profilePicture,
        role: user.role
      });
    }

    // Then try councillor profiles
    const councillor = await CouncillorProfile.findOne({ email });
    if (councillor) {
      const isMatch = await bcrypt.compare(password, councillor.password || '');
      if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });
      const token = jwt.sign({ userId: councillor._id, role: 'councillor' }, config.JWT_SECRET, { expiresIn: '7d' });
      return res.json({
        token,
        userId: councillor._id,
        name: councillor.name,
        email: councillor.email,
        ward: councillor.ward,
        panchayath: councillor.panchayath,
        profilePicture: councillor.profilePicture,
        role: 'councillor'
      });
    }

    // Then try president profiles
    let president = await PresidentProfile.findOne({ email });
    if (!president && email === 'presidenterumely1@gmail.com') {
      // Auto-bootstrap demo president record if missing
      const hashed = await bcrypt.hash('Presidenterumely1@123', 10);
      president = await PresidentProfile.create({
        name: 'Panchayat President',
        email: 'presidenterumely1@gmail.com',
        password: hashed,
        panchayath: 'Erumeli Panchayath'
      });
    }
    if (president) {
      const isMatch = await bcrypt.compare(password, president.password || '');
      if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });
      const token = jwt.sign({ userId: president._id, role: 'president' }, config.JWT_SECRET, { expiresIn: '7d' });
      return res.json({
        token,
        userId: president._id,
        name: president.name,
        email: president.email,
        ward: 0,
        panchayath: president.panchayath,
        profilePicture: president.profilePicture,
        role: 'president'
      });
    }

    return res.status(400).json({ error: 'Invalid credentials' });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
}

// Forgot Password
async function forgotPassword(req, res) {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.json({ message: 'If this email is registered, a reset link has been sent.' });
    await PasswordResetToken.deleteMany({ userId: user._id });
    const token = require('crypto').randomBytes(32).toString('hex');
    const resetToken = new PasswordResetToken({ userId: user._id, token });
    await resetToken.save();
    if (!config.FRONTEND_URL) return res.status(500).json({ error: 'Server misconfiguration: FRONTEND_URL not set.' });
    const resetLink = `${config.FRONTEND_URL}/#/reset-password?token=${token}`;
    await sendPasswordResetEmail(email, resetLink);
    return res.json({ message: 'If this email is registered, a reset link has been sent.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process request' });
  }
}

// Reset Password
async function resetPassword(req, res) {
  const { token, password } = req.body;
  try {
    const resetToken = await PasswordResetToken.findOne({ token });
    if (!resetToken) return res.status(400).json({ error: 'Invalid or expired token.' });
    const user = await User.findById(resetToken.userId);
    if (!user) return res.status(400).json({ error: 'User not found.' });
    user.password = await bcrypt.hash(password, 10);
    await user.save();
    await PasswordResetToken.deleteOne({ _id: resetToken._id });
    res.json({ message: 'Password reset successful.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
}

// Google Login
async function googleLogin(req, res) {
  const { credential } = req.body;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: config.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const email = payload.email;
    const name = payload.name;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'No account found with this email. Please register first.' });
    const token = jwt.sign({ userId: user._id, role: user.role }, config.JWT_SECRET, { expiresIn: '7d' });
    res.json({ 
      token, 
      userId: user._id, 
      name: user.name, 
      email: user.email, 
      ward: user.ward, 
      panchayath: user.panchayath,
      profilePicture: user.profilePicture,
      role: user.role
    });
  } catch (err) {
    res.status(500).json({ error: 'Google login failed' });
  }
}

// Google Register
async function googleRegister(req, res) {
  const { credential, ward, panchayath } = req.body;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: config.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const email = payload.email;
    const name = payload.name;
    const [existingUser, pastMember] = await Promise.all([
      User.findOne({ email }),
      PastMember.findOne({ email })
    ]);
    if (existingUser) return res.status(400).json({ error: 'User already exists with this email' });
    if (pastMember) return res.status(400).json({ error: 'This email belongs to a past member and cannot be reused' });
    const newUser = new User({ name, email, ward, panchayath, password: null });
    await newUser.save();
    res.json({ message: 'User registered successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Google registration failed' });
  }
}

// Google Register Complete
async function googleRegisterComplete(req, res) {
  const { credential, ward, panchayath } = req.body;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: config.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const email = payload.email;
    const name = payload.name;
    const picture = payload.picture;
    const googleId = payload.sub;
    const [existingUser, pastMember] = await Promise.all([
      User.findOne({ email }),
      PastMember.findOne({ email })
    ]);
    if (existingUser) return res.status(400).json({ error: 'User already exists with this email. Please try logging in instead.' });
    if (pastMember) return res.status(400).json({ error: 'This email belongs to a past member and cannot be reused' });
    const newUser = new User({ name, email, ward, panchayath, password: null, googleId, profilePicture: picture, registrationSource: 'google', isVerified: false });
    await newUser.save();
    const token = jwt.sign({ userId: newUser._id, role: newUser.role }, config.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, userId: newUser._id, name: newUser.name, email: newUser.email, ward: newUser.ward, panchayath: newUser.panchayath, profilePicture: newUser.profilePicture });
  } catch (err) {
    res.status(500).json({ error: 'Google registration failed. Please try again.' });
  }
}

// Check Google User
async function checkGoogleUser(req, res) {
  const { email } = req.body;
  try {
    const [existingUser, pastMember] = await Promise.all([
      User.findOne({ email }),
      PastMember.findOne({ email })
    ]);
    res.json({ exists: !!existingUser, blocked: !!pastMember });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check user' });
  }
}

// Email existence check across users, councillors, president
async function checkEmail(req, res) {
  const { email } = req.body;
  try {
    const [u, c, p] = await Promise.all([
      User.findOne({ email }).lean(),
      CouncillorProfile.findOne({ email }).lean(),
      PresidentProfile.findOne({ email }).lean()
    ]);
    res.json({ exists: !!(u || c || p) });
  } catch (err) {
    res.status(500).json({ exists: false });
  }
}

// Create Admin User (for development/testing)
async function createAdmin(req, res) {
  try {
    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin123@gmail.com' });
    if (existingAdmin) {
      return res.json({ 
        message: 'Admin user already exists!',
        credentials: {
          email: 'admin123@gmail.com',
          password: 'Admin@123'
        }
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash('Admin@123', 10);

    // Create admin user
    const adminUser = new User({
      name: 'System Administrator',
      email: 'admin123@gmail.com',
      password: hashedPassword,
      ward: 1, // Default ward for admin
      panchayath: 'Erumeli Panchayath',
      role: 'admin',
      approved: true,
      isVerified: true,
      registrationSource: 'manual'
    });

    await adminUser.save();
    res.json({ 
      message: 'Admin user created successfully!',
      credentials: {
        email: 'admin123@gmail.com',
        password: 'Admin@123'
      }
    });
  } catch (error) {
    console.error('Error creating admin user:', error);
    res.status(500).json({ error: 'Failed to create admin user' });
  }
}

module.exports = {
  register,
  verifyOTP,
  resendOTP,
  login,
  forgotPassword,
  resetPassword,
  googleLogin,
  googleRegister,
  googleRegisterComplete,
  checkGoogleUser,
  checkEmail,
  createAdmin // Add this to exports
};