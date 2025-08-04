require('dotenv').config();
const mongoose = require('mongoose');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const app = express();
const PORT = 3001;

// Initialize Google OAuth client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema, 'users'); // collection name: users

app.use(express.json());
const cors = require('cors');
app.use(cors());

// Example route
app.get('/', (req, res) => {
  res.send('Backend is running!');
});

// Registration route
app.post('/api/register', async (req, res) => {
  const { name, email, password, ward, panchayath } = req.body;
  console.log('Register request:', req.body); // Log incoming registration data
  try {
    console.log('Hashing password...');
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('Creating user object...');
    const user = new User({
      name,
      email,
      password: hashedPassword,
      ward,
      panchayath,
      registrationSource: 'manual'
    });
    console.log('Saving user to database...');
    await user.save();
    console.log('User saved successfully!');
    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    console.error('Registration error:', err); // Log any registration errors
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Registration failed' });
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

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
