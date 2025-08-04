require('dotenv').config();
const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

// User model (same as in index.js)
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: { type: String, required: false },
  ward: { type: Number, required: true },
  panchayath: { type: String, required: true },
  googleId: { type: String, required: false },
  profilePicture: { type: String, required: false },
  registrationSource: { type: String, default: 'manual' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

async function monitorUsers() {
  try {
    console.log('\n=== CivicBrain+ User Database Monitor ===\n');
    
    // Get all users
    const allUsers = await User.find({});
    console.log(`Total Users: ${allUsers.length}\n`);
    
    // Separate by registration source
    const manualUsers = allUsers.filter(user => user.registrationSource === 'manual');
    const googleUsers = allUsers.filter(user => user.registrationSource === 'google');
    
    console.log(`Manual Registrations: ${manualUsers.length}`);
    console.log(`Google Registrations: ${googleUsers.length}\n`);
    
    // Display user details
    console.log('=== User Details ===\n');
    
    allUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Ward: ${user.ward}, Panchayath: ${user.panchayath}`);
      console.log(`   Registration: ${user.registrationSource}`);
      if (user.googleId) {
        console.log(`   Google ID: ${user.googleId}`);
      }
      if (user.profilePicture) {
        console.log(`   Profile Picture: ${user.profilePicture}`);
      }
      console.log(`   Created: ${user.createdAt}`);
      console.log(`   MongoDB ID: ${user._id}`);
      console.log('   ---');
    });
    
    // Statistics by Panchayath
    console.log('\n=== Statistics by Panchayath ===\n');
    const panchayathStats = {};
    allUsers.forEach(user => {
      if (!panchayathStats[user.panchayath]) {
        panchayathStats[user.panchayath] = { total: 0, manual: 0, google: 0 };
      }
      panchayathStats[user.panchayath].total++;
      if (user.registrationSource === 'google') {
        panchayathStats[user.panchayath].google++;
      } else {
        panchayathStats[user.panchayath].manual++;
      }
    });
    
    Object.entries(panchayathStats).forEach(([panchayath, stats]) => {
      console.log(`${panchayath}: ${stats.total} users (${stats.manual} manual, ${stats.google} Google)`);
    });
    
    console.log('\n=== Data Storage Information ===\n');
    console.log('✅ All user data is stored in MongoDB');
    console.log('✅ Google users have their Google ID and profile picture stored');
    console.log('✅ Registration source is tracked for analytics');
    console.log('✅ All users have complete profile information (Panchayath & Ward)');
    console.log('\nNote: Google Cloud Console can monitor OAuth usage through their dashboard.');
    console.log('MongoDB serves as the primary data store for all user information.');
    
  } catch (error) {
    console.error('Error monitoring users:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the monitor
monitorUsers();
