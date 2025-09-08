const User = require('../models/User');
const CouncillorProfile = require('../models/CouncillorProfile');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/config');

// Councillor login (deprecated in favor of unified login) - keep for compatibility if used elsewhere
async function councillorLogin(req, res) {
  const { ward, password } = req.body;

  try {
    if (!ward || !password) {
      return res.status(400).json({ error: 'Ward number and password are required' });
    }

    if (ward < 1 || ward > 23) {
      return res.status(400).json({ error: 'Invalid ward number. Must be between 1 and 23' });
    }

    // Find councillor profile by ward
    const councillor = await CouncillorProfile.findOne({ ward });
    if (!councillor) {
      return res.status(404).json({ error: 'Councillor account not found for this ward' });
    }
    const isMatch = await bcrypt.compare(password, councillor.password || '');
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    if (!councillor.approved) {
      return res.status(403).json({ error: 'Your councillor account is pending approval' });
    }

    const token = jwt.sign(
      { userId: councillor._id, role: 'councillor' },
      config.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const profileComplete = !!(councillor.name && 
                           councillor.contactNumber && 
                           councillor.address && 
                           councillor.appointmentDate && 
                           councillor.endDate);

    res.json({
      token,
      userId: councillor._id,
      name: councillor.name,
      email: councillor.email,
      ward: councillor.ward,
      panchayath: councillor.panchayath,
      profilePicture: councillor.profilePicture,
      profileComplete,
      role: 'councillor'
    });

  } catch (err) {
    console.error('Councillor login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
}

// Complete councillor profile
async function completeProfile(req, res) {
  const { id } = req.user;
  const {
    name,
    ward,
    appointmentDate,
    endDate,
    contactNumber,
    email,
    address,
    partyAffiliation,
    educationalQualification,
    previousExperience,
    emergencyContact,
    emergencyContactRelation,
    currentPassword,
    newPassword
  } = req.body;

  try {
    const councillor = await CouncillorProfile.findById(id);
    if (!councillor) {
      return res.status(404).json({ error: 'Councillor not found' });
    }

    // CouncillorProfile implies role 'councillor'

    // Update basic fields
    if (name) councillor.name = name;
    if (ward) councillor.ward = parseInt(ward);
    if (appointmentDate) councillor.appointmentDate = appointmentDate;
    if (endDate) councillor.endDate = endDate;
    if (contactNumber) councillor.contactNumber = contactNumber;
    if (email) councillor.email = email;
    if (address) councillor.address = address;
    if (partyAffiliation) councillor.partyAffiliation = partyAffiliation;
    if (educationalQualification) councillor.educationalQualification = educationalQualification;
    if (previousExperience) councillor.previousExperience = previousExperience;
    if (emergencyContact) councillor.emergencyContact = emergencyContact;
    if (emergencyContactRelation) councillor.emergencyContactRelation = emergencyContactRelation;

    // Handle password change if provided
    if (currentPassword && newPassword) {
      const isMatch = await bcrypt.compare(currentPassword, councillor.password || '');
      if (!isMatch) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters long' });
      }

      councillor.password = await bcrypt.hash(newPassword, 10);
    }

    councillor.updatedAt = new Date();
    await councillor.save();

    // Return updated councillor data
    const councillorResponse = councillor.toObject();
    delete councillorResponse.password;

    res.json({
      message: 'Profile completed successfully',
      councillor: councillorResponse
    });

  } catch (err) {
    console.error('Complete profile error:', err);
    res.status(500).json({ error: 'Failed to complete profile' });
  }
}

// Change councillor password
async function changePassword(req, res) {
  const { id } = req.user;
  const { currentPassword, newPassword } = req.body;

  try {
    const councillor = await CouncillorProfile.findById(id);
    if (!councillor) {
      return res.status(404).json({ error: 'Councillor not found' });
    }

    // CouncillorProfile implies role 'councillor'

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, councillor.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Validate new password
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    // Hash and save new password
    councillor.password = await bcrypt.hash(newPassword, 10);
    councillor.updatedAt = new Date();
    await councillor.save();

    res.json({ message: 'Password changed successfully' });

  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
}

// Get councillor profile
async function getProfile(req, res) {
  const { id } = req.user;

  try {
    const councillor = await CouncillorProfile.findById(id).select('-password');
    if (!councillor) {
      return res.status(404).json({ error: 'Councillor not found' });
    }

    // CouncillorProfile implies role 'councillor'

    res.json({ councillor });

  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Failed to get profile' });
  }
}

// Update councillor profile
async function updateProfile(req, res) {
  const { id } = req.user;
  const updateData = req.body;

  try {
    const councillor = await CouncillorProfile.findById(id);
    if (!councillor) {
      return res.status(404).json({ error: 'Councillor not found' });
    }

    // CouncillorProfile implies role 'councillor'

    // Update allowed fields
    const allowedFields = [
      'name', 'contactNumber', 'address', 'partyAffiliation',
      'educationalQualification', 'previousExperience', 'emergencyContact',
      'emergencyContactRelation', 'appointmentDate', 'endDate'
    ];

    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        councillor[field] = updateData[field];
      }
    });

    // Handle password change if provided
    if (updateData.currentPassword && updateData.newPassword) {
      console.log('Password change requested for councillor:', id);
      console.log('Current password provided:', updateData.currentPassword ? 'Yes' : 'No');
      console.log('New password provided:', updateData.newPassword ? 'Yes' : 'No');
      
      const isMatch = await bcrypt.compare(updateData.currentPassword, councillor.password || '');
      if (!isMatch) {
        console.log('Current password verification failed');
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      if (updateData.newPassword.length < 8) {
        console.log('New password too short:', updateData.newPassword.length);
        return res.status(400).json({ error: 'Password must be at least 8 characters long' });
      }

      console.log('Password change approved, hashing new password...');
      councillor.password = await bcrypt.hash(updateData.newPassword, 10);
      console.log('Password hashed and updated successfully');
    }

    councillor.updatedAt = new Date();
    await councillor.save();
    console.log('Profile saved to database successfully');

    const councillorResponse = councillor.toObject();
    delete councillorResponse.password;

    res.json({
      message: 'Profile updated successfully',
      councillor: councillorResponse
    });

  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
}

module.exports = {
  councillorLogin,
  completeProfile,
  changePassword,
  getProfile,
  updateProfile
}; 