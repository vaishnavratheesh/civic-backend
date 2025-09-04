const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./src/models/User');
const config = require('./src/config/config');

async function setupAdmin() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    
    await mongoose.connect(config.MONGO_URI);
    console.log('✅ Connected to MongoDB successfully!');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin123@gmail.com' });
    if (existingAdmin) {
      console.log('✅ Admin user already exists!');
      console.log('📧 Email: admin123@gmail.com');
      console.log('🔑 Password: Admin@123');
      console.log('👤 Role: Admin');
      console.log('✅ Status: Active and Verified');
      return;
    }

    console.log('🔐 Creating admin user...');
    
    // Hash the password
    const hashedPassword = await bcrypt.hash('Admin@123', 10);

    // Create admin user
    const adminUser = new User({
      name: 'System Administrator',
      email: 'admin123@gmail.com',
      password: hashedPassword,
      ward: 1,
      panchayath: 'Erumeli Panchayath',
      role: 'admin',
      approved: true,
      isVerified: true,
      registrationSource: 'manual'
    });

    await adminUser.save();
    console.log('✅ Admin user created successfully!');
    console.log('📧 Email: admin123@gmail.com');
    console.log('🔑 Password: Admin@123');
    console.log('👤 Role: Admin');
    console.log('✅ Status: Active and Verified');
    console.log('\n🎉 You can now login to the admin dashboard!');

  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

setupAdmin(); 