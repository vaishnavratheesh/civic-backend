const config = require('./config/config');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const councillorRoutes = require('./routes/councillorRoutes');
const adminRoutes = require('./routes/adminRoutes');
const adminCouncillorRoutes = require('./routes/adminCouncillorRoutes');
const welfareRoutes = require('./routes/welfareRoutes');
const grievanceRoutes = require('./routes/grievanceRoutes');
const presidentRoutes = require('./routes/presidentRoutes');
const meetingRoutes = require('./routes/meetingRoutes');
const chatbotRoutes = require('./routes/chatbotRoutes');

const app = express();

// CORS
app.use(cors({
  origin: config.isDevelopment ? true : config.CORS_ORIGINS, // Allow all origins in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// JSON
app.use(express.json());

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Load models to ensure they're registered BEFORE connecting to MongoDB
require('./models/User');
require('./models/Ward');
require('./models/AuditLog');
require('./models/WelfareScheme');
require('./models/WelfareApplication');
require('./models/CouncillorProfile');
require('./models/PresidentProfile');
require('./models/Grievance');
require('./models/Announcement');
require('./models/Event');
require('./models/Message');
require('./models/PastMember');

// MongoDB
mongoose.connect(config.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log('MongoDB connected');
    // Seed default PresidentProfile if not present
    try {
      const bcrypt = require('bcryptjs');
      const PresidentProfile = require('./models/PresidentProfile');
      const email = 'presidenterumely1@gmail.com';
      const existing = await PresidentProfile.findOne({ email });
      if (!existing) {
        const hashed = await bcrypt.hash('Presidenterumely1@123', 10);
        await PresidentProfile.create({
          name: 'Panchayat President',
          email,
          password: hashed,
          panchayath: 'Erumeli Panchayath'
        });
        console.log('Seeded default PresidentProfile');
      }
    } catch (seedErr) {
      console.error('Failed to seed PresidentProfile:', seedErr.message);
    }
  })
  .catch((err) => console.error('MongoDB connection error:', err));

// Routes
app.use('/api', authRoutes);
app.use('/api', userRoutes);
app.use('/api', councillorRoutes);
app.use('/api', adminRoutes);
app.use('/api/admin', adminCouncillorRoutes);
app.use('/api/welfare', welfareRoutes);
app.use('/api', grievanceRoutes);

app.use('/api', presidentRoutes);
app.use('/api', meetingRoutes);
app.use('/api', chatbotRoutes);

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'Test endpoint working' });
});

// Test collections endpoint
app.get('/api/test-collections', async (req, res) => {
  try {
    const CouncillorProfile = require('./models/CouncillorProfile');
    const PresidentProfile = require('./models/PresidentProfile');
    
    console.log('Testing database collections...');
    
    // Check councillorProfiles collection
    const councillorCount = await CouncillorProfile.countDocuments();
    const councillors = await CouncillorProfile.find().select('name email ward');
    
    // Check presidentProfiles collection
    const presidentCount = await PresidentProfile.countDocuments();
    const presidents = await PresidentProfile.find().select('name email');
    
    console.log(`CouncillorProfile collection: ${councillorCount} documents`);
    console.log('Councillors:', councillors);
    console.log(`PresidentProfile collection: ${presidentCount} documents`);
    console.log('Presidents:', presidents);
    
    res.json({
      success: true,
      data: {
        councillorProfiles: {
          count: councillorCount,
          data: councillors
        },
        presidentProfiles: {
          count: presidentCount,
          data: presidents
        }
      }
    });
  } catch (error) {
    console.error('Error testing collections:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test collections',
      error: error.message
    });
  }
});

// Test email configuration endpoint
app.get('/api/test-email-config', (req, res) => {
  const emailConfig = {
    EMAIL_USER: process.env.EMAIL_USER || 'Not set',
    EMAIL_PASS: process.env.EMAIL_PASS ? 'Set (hidden)' : 'Not set',
    EMAIL_FROM: process.env.EMAIL_FROM || 'Not set'
  };
  
  console.log('Email configuration:', emailConfig);
  
  res.json({
    success: true,
    config: emailConfig,
    message: 'Email configuration check'
  });
});

// Test actual email sending
app.post('/api/test-send-email', async (req, res) => {
  try {
    const { sendOTPEmail, sendPasswordResetEmail } = require('./utils/email');
    const testEmail = req.body.email || 'test@example.com';
    const testType = req.body.type || 'otp';
    
    console.log('Testing email send to:', testEmail, 'Type:', testType);
    
    let result;
    if (testType === 'otp') {
      result = await sendOTPEmail(testEmail, '123456', 'Test User');
    } else if (testType === 'reset') {
      result = await sendPasswordResetEmail(testEmail, 'http://localhost:3000/reset-password?token=test123');
    }
    
    res.json({
      success: true,
      emailSent: result,
      message: 'Email test completed',
      type: testType
    });
  } catch (error) {
    console.error('Email test error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/', (req, res) => {
  res.send('Backend is running!');
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
});

module.exports = app;