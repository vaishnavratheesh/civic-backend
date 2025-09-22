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
require('./models/Grievance');

// MongoDB
mongoose.connect(config.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Routes
app.use('/api', authRoutes);
app.use('/api', userRoutes);
app.use('/api', councillorRoutes);
app.use('/api', adminRoutes);
app.use('/api/welfare', welfareRoutes);
app.use('/api', grievanceRoutes);

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