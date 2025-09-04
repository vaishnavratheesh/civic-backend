const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const CouncillorProfile = require('./src/models/CouncillorProfile');

async function createCouncillor() {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/civic');
    console.log('Connected to MongoDB');

    // Check if councillor already exists
    const existingCouncillor = await CouncillorProfile.findOne({ email: 'councillor1@gmail.com' });
    if (existingCouncillor) {
      console.log('Councillor already exists!');
      console.log('Email:', existingCouncillor.email);
      console.log('Ward:', existingCouncillor.ward);
      process.exit(0);
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash('Councillor1@123', 10);

    // Create councillor profile
    const councillor = new CouncillorProfile({
      name: 'Councillor 1',
      email: 'councillor1@gmail.com',
      password: hashedPassword,
      ward: 1,
      panchayath: 'Erumeli Panchayath',
      approved: true,
      isVerified: true
    });

    await councillor.save();
    console.log('Councillor created successfully!');
    console.log('Email: councillor1@gmail.com');
    console.log('Password: Councillor1@123');
    console.log('Ward: 1');
    console.log('ID:', councillor._id);

  } catch (error) {
    console.error('Error creating councillor:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

createCouncillor();