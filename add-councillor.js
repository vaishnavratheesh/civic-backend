const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Define the schema inline to avoid import issues
const councillorProfileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  ward: { type: Number, required: true },
  panchayath: { type: String, default: 'Erumeli Panchayath' },
  profilePicture: { type: String, required: false },
  address: { type: String, required: false },
  contactNumber: { type: String, required: false },
  appointmentDate: { type: Date, required: false },
  endDate: { type: Date, required: false },
  partyAffiliation: { type: String, required: false },
  educationalQualification: { type: String, required: false },
  previousExperience: { type: String, required: false },
  emergencyContact: { type: String, required: false },
  emergencyContactRelation: { type: String, required: false },
  approved: { type: Boolean, default: true },
  isVerified: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const CouncillorProfile = mongoose.model('CouncillorProfile', councillorProfileSchema, 'councillorprofiles');

async function addCouncillor() {
  try {
    await mongoose.connect('mongodb://localhost:27017/civic_plus');
    console.log('✅ Connected to MongoDB');

    // Check if already exists
    const existing = await CouncillorProfile.findOne({ email: 'councillor1@gmail.com' });
    if (existing) {
      console.log('ℹ️  Councillor already exists!');
      console.log('📧 Email:', existing.email);
      console.log('🏛️ Ward:', existing.ward);
      return;
    }

    // Create new councillor
    const hashedPassword = await bcrypt.hash('Councillor1@123', 10);
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
    console.log('🎉 Councillor created successfully!');
    console.log('📧 Email: councillor1@gmail.com');
    console.log('🔑 Password: Councillor1@123');
    console.log('🏛️ Ward: 1');
    console.log('🆔 ID:', councillor._id);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

addCouncillor();