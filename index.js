require('dotenv').config();
const mongoose = require('mongoose');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = express();
const PORT = 3001;

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

// User model
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  ward: Number,
  panchayath: String, // Add panchayath field
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
    const user = new User({ name, email, password: hashedPassword, ward, panchayath });
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

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
