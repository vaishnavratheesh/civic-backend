require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

// User model (same as in index.js)
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: { type: String, required: false },
  ward: Number,
  panchayath: String,
});

const User = mongoose.model('User', userSchema);

async function createTestUser() {
  try {
    // Check if test user already exists
    const existingUser = await User.findOne({ email: 'test@gmail.com' });
    if (existingUser) {
      console.log('Test user already exists');
      return;
    }

    // Create a test user that matches a Google account
    const testUser = new User({
      name: 'Test User',
      email: 'test@gmail.com', // Change this to your actual Gmail address
      password: null, // Google users don't have passwords
      ward: 1,
      panchayath: 'Thiruvananthapuram'
    });

    await testUser.save();
    console.log('Test user created successfully:');
    console.log('Email: test@gmail.com');
    console.log('Name: Test User');
    console.log('Ward: 1');
    console.log('Panchayath: Thiruvananthapuram');
    console.log('\nNow you can test Google Sign-In with this email address.');
    
  } catch (error) {
    console.error('Error creating test user:', error);
  } finally {
    mongoose.connection.close();
  }
}

createTestUser();
