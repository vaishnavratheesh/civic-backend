require('dotenv').config();
const mongoose = require('mongoose');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const nodemailer = require('nodemailer');
const app = express();
const PORT = 3001;

// Initialize Google OAuth client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Email transporter setup
let transporter;
try {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'vaishnavratheesh27@gmail.com',
      pass: process.env.EMAIL_PASSWORD || 'temp_password' // You'll need to add this to .env
    }
  });
  console.log('Email transporter initialized successfully');
} catch (error) {
  console.error('Error initializing email transporter:', error);
}

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

// User model
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: { type: String, required: false }, // Allow null for Google users
  ward: { type: Number, required: true },
  panchayath: { type: String, required: true },
  googleId: { type: String, required: false }, // Google user ID
  profilePicture: { type: String, required: false }, // Profile picture URL
  registrationSource: { type: String, default: 'manual' }, // 'manual' or 'google'
  isVerified: { type: Boolean, default: false }, // Email verification status
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// OTP model for temporary storage
const otpSchema = new mongoose.Schema({
  email: { type: String, required: true },
  otp: { type: String, required: true },
  userData: {
    name: String,
    email: String,
    password: String,
    ward: Number,
    panchayath: String
  },
  createdAt: { type: Date, default: Date.now, expires: 600 } // Expires in 10 minutes
});
const User = mongoose.model('User', userSchema, 'users'); // collection name: users
const OTP = mongoose.model('OTP', otpSchema);

app.use(express.json());
const cors = require('cors');
app.use(cors());

// Utility functions
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
};

const sendOTPEmail = async (email, otp, name) => {
  // Check if transporter is available
  if (!transporter) {
    console.error('Email transporter not initialized');
    return false;
  }

  // Check if EMAIL_PASSWORD is set
  if (!process.env.EMAIL_PASSWORD || process.env.EMAIL_PASSWORD === 'temp_password') {
    console.error('EMAIL_PASSWORD not set in environment variables');
    console.log('Please set up Gmail App Password in .env file');
    console.log('For now, simulating email send...');
    console.log(`\n=== SIMULATED EMAIL ===`);
    console.log(`To: ${email}`);
    console.log(`Subject: CivicBrain+ - Email Verification OTP`);
    console.log(`OTP: ${otp}`);
    console.log(`Name: ${name}`);
    console.log(`======================\n`);
    return true; // Return true for testing purposes
  }

  const mailOptions = {
    from: 'vaishnavratheesh27@gmail.com',
    to: email,
    subject: 'CivicBrain+ - Email Verification OTP',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Welcome to CivicBrain+!</h2>
        <p>Dear ${name},</p>
        <p>Thank you for registering with CivicBrain+. To complete your registration, please verify your email address using the OTP below:</p>
        <div style="background-color: #f3f4f6; padding: 20px; text-align: center; margin: 20px 0;">
          <h1 style="color: #2563eb; font-size: 32px; margin: 0; letter-spacing: 5px;">${otp}</h1>
        </div>
        <p>This OTP is valid for 10 minutes only.</p>
        <p>If you didn't request this registration, please ignore this email.</p>
        <hr style="margin: 30px 0;">
        <p style="color: #6b7280; font-size: 14px;">
          Best regards,<br>
          CivicBrain+ Team<br>
          <a href="mailto:vaishnavratheesh27@gmail.com">vaishnavratheesh27@gmail.com</a>
        </p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('OTP email sent successfully to:', email);
    return true;
  } catch (error) {
    console.error('Error sending OTP email:', error);
    console.log('Email details for debugging:');
    console.log('To:', email);
    console.log('OTP:', otp);
    return false;
  }
};

// Example route
app.get('/', (req, res) => {
  res.send('Backend is running!');
});

// Email existence check route
app.post('/api/check-email', async (req, res) => {
  const { email } = req.body;

  try {
    // Check if user exists in the main User collection
    const existingUser = await User.findOne({ email });

    res.status(200).json({
      exists: !!existingUser
    });
  } catch (err) {
    console.error('Email check error:', err);
    res.status(500).json({ error: 'Failed to check email' });
  }
});

// Registration route - Send OTP
app.post('/api/register', async (req, res) => {
  const { name, email, password, ward, panchayath } = req.body;
  console.log('Register request:', req.body);

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Generate OTP
    const otp = generateOTP();
    console.log('Generated OTP for', email, ':', otp);

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Store OTP and user data temporarily
    await OTP.findOneAndDelete({ email }); // Remove any existing OTP for this email
    const otpRecord = new OTP({
      email,
      otp,
      userData: {
        name,
        email,
        password: hashedPassword,
        ward,
        panchayath
      }
    });
    await otpRecord.save();

    // Send OTP email
    const emailSent = await sendOTPEmail(email, otp, name);
    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to send verification email' });
    }

    res.status(200).json({
      message: 'OTP sent to your email. Please verify to complete registration.',
      email: email
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// OTP Verification route
app.post('/api/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  console.log('OTP verification request:', { email, otp });

  try {
    // Find OTP record
    const otpRecord = await OTP.findOne({ email });
    if (!otpRecord) {
      return res.status(400).json({ error: 'OTP expired or not found. Please request a new one.' });
    }

    // Verify OTP
    if (otpRecord.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP. Please try again.' });
    }

    // Create user with stored data
    const userData = otpRecord.userData;
    const user = new User({
      name: userData.name,
      email: userData.email,
      password: userData.password,
      ward: userData.ward,
      panchayath: userData.panchayath,
      registrationSource: 'manual',
      isVerified: true
    });

    await user.save();
    console.log('User created successfully after OTP verification:', userData.email);

    // Delete OTP record
    await OTP.findOneAndDelete({ email });

    res.status(201).json({
      message: 'Registration completed successfully! You can now login.',
      success: true
    });
  } catch (err) {
    console.error('OTP verification error:', err);
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Resend OTP route
app.post('/api/resend-otp', async (req, res) => {
  const { email } = req.body;
  console.log('Resend OTP request for:', email);

  try {
    // Find existing OTP record
    const otpRecord = await OTP.findOne({ email });
    if (!otpRecord) {
      return res.status(400).json({ error: 'No pending registration found for this email.' });
    }

    // Generate new OTP
    const newOtp = generateOTP();
    console.log('Generated new OTP for', email, ':', newOtp);

    // Update OTP record
    otpRecord.otp = newOtp;
    otpRecord.createdAt = new Date(); // Reset expiry time
    await otpRecord.save();

    // Send new OTP email
    const emailSent = await sendOTPEmail(email, newOtp, otpRecord.userData.name);
    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to send verification email' });
    }

    res.status(200).json({ message: 'New OTP sent to your email.' });
  } catch (err) {
    console.error('Resend OTP error:', err);
    res.status(500).json({ error: 'Failed to resend OTP' });
  }
});

// Login route
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      userId: user._id,
      name: user.name,
      email: user.email,
      ward: user.ward,
      panchayath: user.panchayath
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Google Login route
app.post('/api/google-login', async (req, res) => {
  const { credential } = req.body;
  console.log('Google login attempt received');
  console.log('Credential received:', credential ? 'Yes' : 'No');

  try {
    // Verify the Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email = payload.email;
    const name = payload.name;
    console.log('Google user verified:', email);

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      console.log('User not found in database:', email);
      return res.status(400).json({ error: 'No account found with this email. Please register first.' });
    }

    console.log('User found, generating token');
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      userId: user._id,
      name: user.name,
      email: user.email,
      ward: user.ward,
      panchayath: user.panchayath
    });
  } catch (err) {
    console.error('Google login error:', err);
    res.status(500).json({ error: 'Google login failed' });
  }
});

// Google Register route (for direct registration from register page)
app.post('/api/google-register', async (req, res) => {
  const { credential, ward, panchayath } = req.body;

  try {
    // Verify the Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email = payload.email;
    const name = payload.name;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Create new user (no password needed for Google auth)
    const newUser = new User({
      name,
      email,
      ward,
      panchayath,
      password: null // Google users don't have passwords
    });

    await newUser.save();
    res.json({ message: 'User registered successfully' });
  } catch (err) {
    console.error('Google registration error:', err);
    res.status(500).json({ error: 'Google registration failed' });
  }
});

// Google Register Complete route (for completing profile after login attempt OR direct registration)
app.post('/api/google-register-complete', async (req, res) => {
  const { credential, ward, panchayath } = req.body;
  console.log('Google register complete attempt received');
  console.log('Ward:', ward, 'Panchayath:', panchayath);

  try {
    // Verify the Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email = payload.email;
    const name = payload.name;
    const picture = payload.picture;
    const googleId = payload.sub;

    console.log('Google user verified for registration:', {
      email,
      name,
      googleId,
      picture
    });

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log('User already exists:', email);
      return res.status(400).json({ error: 'User already exists with this email. Please try logging in instead.' });
    }

    // Create new user with Google data
    const newUser = new User({
      name,
      email,
      ward,
      panchayath,
      password: null, // Google users don't have passwords
      googleId: googleId, // Store Google ID for future reference
      profilePicture: picture, // Store profile picture URL
      registrationSource: 'google' // Mark as Google registration
    });

    await newUser.save();
    console.log('New user created successfully:', {
      userId: newUser._id,
      email: newUser.email,
      name: newUser.name,
      ward: newUser.ward,
      panchayath: newUser.panchayath,
      googleId: googleId
    });

    // Log user data for Google Cloud Console monitoring (if needed)
    console.log('User data stored in MongoDB:', {
      mongoId: newUser._id,
      googleId: googleId,
      email: email,
      registrationTime: new Date().toISOString(),
      source: 'google_oauth'
    });

    // Generate token and return user data
    const token = jwt.sign({ userId: newUser._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      userId: newUser._id,
      name: newUser.name,
      email: newUser.email,
      ward: newUser.ward,
      panchayath: newUser.panchayath,
      profilePicture: newUser.profilePicture
    });
  } catch (err) {
    console.error('Google registration complete error:', err);
    res.status(500).json({ error: 'Google registration failed. Please try again.' });
  }
});

// Check if Google user exists
app.post('/api/check-google-user', async (req, res) => {
  const { email } = req.body;
  console.log('Checking if Google user exists:', email);

  try {
    const existingUser = await User.findOne({ email });
    res.json({ exists: !!existingUser });
  } catch (err) {
    console.error('Error checking Google user:', err);
    res.status(500).json({ error: 'Failed to check user' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
