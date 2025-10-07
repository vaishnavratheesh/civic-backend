const config = require('./config/config');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const councillorRoutes = require('./routes/councillorRoutes');
const adminRoutes = require('./routes/adminRoutes');
const welfareRoutes = require('./routes/welfareRoutes');
const grievanceRoutes = require('./routes/grievanceRoutes');
const presidentRoutes = require('./routes/presidentRoutes');

const app = express();

// CORS
app.use(cors({
  origin: config.CORS_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// JSON
app.use(express.json());

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Load models to ensure they're registered BEFORE connecting to MongoDB
require('./models/User');
require('./models/WelfareScheme');
require('./models/WelfareApplication');
require('./models/CouncillorProfile');
require('./models/PresidentProfile');
require('./models/Grievance');
require('./models/Announcement');
require('./models/Event');
require('./models/Message');

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
app.use('/api/welfare', welfareRoutes);
app.use('/api', grievanceRoutes);
app.use('/api', presidentRoutes);

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'Test endpoint working' });
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