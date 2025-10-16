const bcrypt = require('bcryptjs');
const CouncillorProfile = require('../models/CouncillorProfile');
const PresidentProfile = require('../models/PresidentProfile');
const User = require('../models/User');
const emailUtils = require('../utils/email');
const { sendEmail } = emailUtils.default || emailUtils;
const { 
  getCouncillorCredentialsTemplate, 
  getPresidentCredentialsTemplate,
  getCredentialsRevokedTemplate 
} = require('../utils/emailTemplates');

// Generate a secure random password
const generatePassword = () => {
  const length = 12;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  
  // Ensure at least one of each type
  password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]; // uppercase
  password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]; // lowercase
  password += '0123456789'[Math.floor(Math.random() * 10)]; // number
  password += '!@#$%^&*'[Math.floor(Math.random() * 8)]; // special
  
  // Fill the rest randomly
  for (let i = 4; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

// Get all wards with councillor information
const getWards = async (req, res) => {
  try {
    console.log('getWards called - fetching from councillorProfiles collection');
    
    // Get all existing councillors from CouncillorProfile collection (councillorProfiles)
    const councillors = await CouncillorProfile.find().select('name email ward createdAt');
    console.log(`Found ${councillors.length} councillors in councillorProfiles collection`);
    
    // Create ward data for all 23 wards
    const wards = [];
    for (let wardNumber = 1; wardNumber <= 23; wardNumber++) {
      // Find councillor for this ward
      const councillor = councillors.find(c => c.ward === wardNumber);
      
      // Get citizen count for this ward
      const citizenCount = await User.countDocuments({ 
        ward: wardNumber, 
        role: 'citizen'
      });
      
      wards.push({
        wardNumber,
        councillor: councillor || null,
        citizenCount,
        population: Math.floor(Math.random() * 2000) + 500, // Mock population data
        isVacant: !councillor
      });
    }

    console.log(`Returning data for ${wards.length} wards`);
    res.json({
      success: true,
      wards
    });
  } catch (error) {
    console.error('Error fetching wards:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wards',
      error: error.message
    });
  }
};

// Get president information
const getPresident = async (req, res) => {
  try {
    console.log('getPresident called - fetching from presidentProfiles collection');
    
    const president = await PresidentProfile.findOne().select('name email createdAt appointmentDate');
    console.log('President found:', president ? `${president.name} (${president.email})` : 'None');

    res.json({
      success: true,
      president: president || null
    });
  } catch (error) {
    console.error('Error fetching president:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch president information',
      error: error.message
    });
  }
};

// Assign councillor to ward
const assignCouncillor = async (req, res) => {
  try {
    const { wardNumber, name, email } = req.body;

    // Validate input
    if (!wardNumber || !name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Ward number, name, and email are required'
      });
    }

    if (wardNumber < 1 || wardNumber > 23) {
      return res.status(400).json({
        success: false,
        message: 'Ward number must be between 1 and 23'
      });
    }

    // Check if councillor already exists for this ward
    const existingCouncillor = await CouncillorProfile.findOne({ ward: wardNumber });
    if (existingCouncillor) {
      return res.status(400).json({
        success: false,
        message: `Ward ${wardNumber} already has a councillor assigned`
      });
    }

    // Check if email is already used
    const emailExists = await CouncillorProfile.findOne({ email });
    if (emailExists) {
      return res.status(400).json({
        success: false,
        message: 'Email is already assigned to another councillor'
      });
    }

    // Generate password
    const password = generatePassword();
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create new councillor profile
    const councillor = new CouncillorProfile({
      name,
      email,
      password: hashedPassword,
      ward: wardNumber,
      panchayath: 'Erumeli Panchayath',
      approved: true,
      isVerified: true
    });

    await councillor.save();

    // Send credentials email
    try {
      const emailTemplate = getCouncillorCredentialsTemplate(name, wardNumber, email, password);
      await sendEmail(email, emailTemplate.subject, emailTemplate.html, emailTemplate.text);
    } catch (emailError) {
      console.error('Failed to send credentials email:', emailError);
      // Don't fail the assignment if email fails
    }

    res.json({
      success: true,
      message: `Councillor assigned to Ward ${wardNumber} successfully`,
      councillor: {
        id: councillor._id,
        name: councillor.name,
        email: councillor.email,
        ward: councillor.ward
      },
      credentialsSent: true
    });

  } catch (error) {
    console.error('Error assigning councillor:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign councillor',
      error: error.message
    });
  }
};

// Assign president
const assignPresident = async (req, res) => {
  try {
    const { name, email } = req.body;

    // Validate input
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Name and email are required'
      });
    }

    // Check if president already exists
    const existingPresident = await PresidentProfile.findOne();
    if (existingPresident) {
      return res.status(400).json({
        success: false,
        message: 'A president is already assigned. Please remove the current president first.'
      });
    }

    // Generate password
    const password = generatePassword();
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create new president profile
    const president = new PresidentProfile({
      name,
      email,
      password: hashedPassword,
      panchayath: 'Erumeli Panchayath',
      approved: true,
      isVerified: true
    });

    await president.save();

    // Send credentials email
    try {
      const emailTemplate = getPresidentCredentialsTemplate(name, email, password);
      await sendEmail(email, emailTemplate.subject, emailTemplate.html, emailTemplate.text);
    } catch (emailError) {
      console.error('Failed to send credentials email:', emailError);
      // Don't fail the assignment if email fails
    }

    res.json({
      success: true,
      message: 'President assigned successfully',
      president: {
        id: president._id,
        name: president.name,
        email: president.email
      },
      credentialsSent: true
    });

  } catch (error) {
    console.error('Error assigning president:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign president',
      error: error.message
    });
  }
};

// Remove councillor from ward
const removeCouncillor = async (req, res) => {
  try {
    const { wardNumber } = req.params;

    if (!wardNumber || wardNumber < 1 || wardNumber > 23) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ward number'
      });
    }

    // Find the councillor for this ward
    const councillor = await CouncillorProfile.findOne({ ward: parseInt(wardNumber) });
    if (!councillor) {
      return res.status(404).json({
        success: false,
        message: 'No councillor assigned to this ward'
      });
    }

    // Send revocation email
    try {
      const emailTemplate = getCredentialsRevokedTemplate(
        councillor.name, 
        'councillor', 
        wardNumber
      );
      await sendEmail(
        councillor.email, 
        emailTemplate.subject, 
        emailTemplate.html, 
        emailTemplate.text
      );
    } catch (emailError) {
      console.error('Failed to send revocation email:', emailError);
    }

    // Remove councillor from database
    await CouncillorProfile.findByIdAndDelete(councillor._id);

    res.json({
      success: true,
      message: `Councillor removed from Ward ${wardNumber} successfully`
    });

  } catch (error) {
    console.error('Error removing councillor:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove councillor',
      error: error.message
    });
  }
};

// Remove president
const removePresident = async (req, res) => {
  try {
    // Find current president
    const president = await PresidentProfile.findOne();
    if (!president) {
      return res.status(404).json({
        success: false,
        message: 'No president found'
      });
    }

    // Send revocation email
    try {
      const emailTemplate = getCredentialsRevokedTemplate(
        president.name, 
        'president'
      );
      await sendEmail(
        president.email, 
        emailTemplate.subject, 
        emailTemplate.html, 
        emailTemplate.text
      );
    } catch (emailError) {
      console.error('Failed to send revocation email:', emailError);
    }

    // Remove president from database
    await PresidentProfile.findByIdAndDelete(president._id);

    res.json({
      success: true,
      message: 'President removed successfully'
    });

  } catch (error) {
    console.error('Error removing president:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove president',
      error: error.message
    });
  }
};

// Send credentials again
const resendCredentials = async (req, res) => {
  try {
    const { userId, type } = req.body; // type: 'councillor' or 'president'

    let user;
    if (type === 'president') {
      user = await PresidentProfile.findById(userId);
    } else {
      user = await CouncillorProfile.findById(userId);
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate new password
    const password = generatePassword();
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update password
    user.password = hashedPassword;
    user.updatedAt = new Date();
    await user.save();

    // Send appropriate email
    let emailTemplate;
    if (type === 'president') {
      emailTemplate = getPresidentCredentialsTemplate(user.name, user.email, password);
    } else {
      emailTemplate = getCouncillorCredentialsTemplate(user.name, user.ward, user.email, password);
    }

    await sendEmail(user.email, emailTemplate.subject, emailTemplate.html, emailTemplate.text);

    res.json({
      success: true,
      message: 'Credentials sent successfully'
    });

  } catch (error) {
    console.error('Error resending credentials:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send credentials',
      error: error.message
    });
  }
};

// Get audit logs (simplified for now)
const getAuditLogs = async (req, res) => {
  try {
    res.json({
      success: true,
      logs: [],
      pagination: {
        page: 1,
        limit: 50,
        total: 0,
        pages: 0
      }
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch audit logs',
      error: error.message
    });
  }
};

// Test endpoint to check database collections
const testCollections = async (req, res) => {
  try {
    console.log('Testing database collections...');
    
    // Check councillorProfiles collection
    const councillorCount = await CouncillorProfile.countDocuments();
    const councillors = await CouncillorProfile.find().select('name email ward');
    
    // Check presidentProfiles collection
    const presidentCount = await PresidentProfile.countDocuments();
    const presidents = await PresidentProfile.find().select('name email');
    
    console.log(`CouncillorProfile collection: ${councillorCount} documents`);
    console.log('Councillors:', councillors);
    console.log(`PresidentProfile collection: ${presidentCount} documents`);
    console.log('Presidents:', presidents);
    
    res.json({
      success: true,
      data: {
        councillorProfiles: {
          count: councillorCount,
          data: councillors
        },
        presidentProfiles: {
          count: presidentCount,
          data: presidents
        }
      }
    });
  } catch (error) {
    console.error('Error testing collections:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test collections',
      error: error.message
    });
  }
};

// Get all users (citizens)
const getUsers = async (req, res) => {
  try {
    console.log('getUsers called - fetching all users');
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    
    // Get users with pagination
    const users = await User.find({ role: { $in: ['citizen', 'officer'] } })
      .select('name email ward panchayath role isVerified approved createdAt registrationSource')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    // Get total count
    const totalUsers = await User.countDocuments({ role: { $in: ['citizen', 'officer'] } });
    
    console.log(`Found ${users.length} users out of ${totalUsers} total`);
    
    res.json({
      success: true,
      users,
      pagination: {
        page,
        limit,
        total: totalUsers,
        pages: Math.ceil(totalUsers / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
};

// Remove a user
const removeUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log('removeUser called for userId:', userId);
    
    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Don't allow removing admin users
    if (user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot remove admin users'
      });
    }
    
    // Remove the user
    await User.findByIdAndDelete(userId);
    
    console.log(`User ${user.name} (${user.email}) removed successfully`);
    
    res.json({
      success: true,
      message: `User ${user.name} removed successfully`
    });
  } catch (error) {
    console.error('Error removing user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove user',
      error: error.message
    });
  }
};

// Toggle user verification status
const toggleUserVerification = async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log('toggleUserVerification called for userId:', userId);
    console.log('Request user:', req.user);
    console.log('Request method:', req.method);
    console.log('Request URL:', req.originalUrl);
    
    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Toggle verification status
    user.isVerified = !user.isVerified;
    user.approved = user.isVerified; // Also update approved status
    await user.save();
    
    console.log(`User ${user.name} verification status changed to: ${user.isVerified}`);
    
    res.json({
      success: true,
      message: `User ${user.isVerified ? 'verified' : 'unverified'} successfully`,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        isVerified: user.isVerified,
        approved: user.approved
      }
    });
  } catch (error) {
    console.error('Error toggling user verification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user verification',
      error: error.message
    });
  }
};

module.exports = {
  getWards,
  getPresident,
  assignCouncillor,
  assignPresident,
  removeCouncillor,
  removePresident,
  resendCredentials,
  getAuditLogs,
  testCollections,
  getUsers,
  removeUser,
  toggleUserVerification
};