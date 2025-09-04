const config = require('./config/config');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const councillorRoutes = require('./routes/councillorRoutes');
const adminRoutes = require('./routes/adminRoutes');
const welfareRoutes = require('./routes/welfareRoutes');

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

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'Test endpoint working' });
});

app.get('/', (req, res) => {
  res.send('Backend is running!');
});

module.exports = app;