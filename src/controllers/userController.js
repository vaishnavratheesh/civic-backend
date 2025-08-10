const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { uploadImage, deleteImage } = require('../utils/cloudinary');
const fs = require('fs');

// Email existence check
async function checkEmail(req, res) {
  const { email } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    res.status(200).json({ exists: !!existingUser });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check email' });
  }
}

// Get user profile
async function getProfile(req, res) {
  const { id } = req.params;
  try {
    const user = await User.findById(id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
}

// Update user profile with image upload
async function updateProfile(req, res) {
  const { id } = req.params;
  const { 
    name, 
    ward, 
    panchayath, 
    address, 
    contactNumber, 
    location,
    password 
  } = req.body;

  try {
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update basic fields (email cannot be changed)
    if (name !== undefined) user.name = name;
    if (ward !== undefined) user.ward = parseInt(ward);
    if (panchayath !== undefined) user.panchayath = panchayath;
    if (address !== undefined) user.address = address;
    if (contactNumber !== undefined) user.contactNumber = contactNumber;
    if (location !== undefined) user.location = location;

    // Handle password update
    if (password && password.trim() !== '') {
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters long' });
      }
      user.password = await bcrypt.hash(password, 10);
    }

    // Handle profile picture upload
    if (req.file) {
      try {
        // Upload to Cloudinary
        const imageUrl = await uploadImage(req.file.path);
        
        // Delete old profile picture from Cloudinary if exists
        if (user.profilePicture && user.profilePicture.includes('cloudinary')) {
          const publicId = user.profilePicture.split('/').pop().split('.')[0];
          await deleteImage(publicId);
        }
        
        // Update profile picture URL
        user.profilePicture = imageUrl;
        
        // Delete local file
        fs.unlinkSync(req.file.path);
      } catch (uploadError) {
        // Delete local file if upload failed
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(500).json({ error: 'Failed to upload image' });
      }
    }

    user.updatedAt = new Date();
    await user.save();

    // Return user data without password
    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({ 
      message: 'Profile updated successfully', 
      user: userResponse 
    });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
}

// Update profile picture only
async function updateProfilePicture(req, res) {
  const { id } = req.params;

  try {
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    try {
      // Upload to Cloudinary
      const imageUrl = await uploadImage(req.file.path);
      
      // Delete old profile picture from Cloudinary if exists
      if (user.profilePicture && user.profilePicture.includes('cloudinary')) {
        const publicId = user.profilePicture.split('/').pop().split('.')[0];
        await deleteImage(publicId);
      }
      
      // Update profile picture URL
      user.profilePicture = imageUrl;
      user.updatedAt = new Date();
      await user.save();
      
      // Delete local file
      fs.unlinkSync(req.file.path);

      res.json({ 
        message: 'Profile picture updated successfully', 
        profilePicture: imageUrl 
      });
    } catch (uploadError) {
      // Delete local file if upload failed
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(500).json({ error: 'Failed to upload image' });
    }
  } catch (err) {
    console.error('Profile picture update error:', err);
    res.status(500).json({ error: 'Failed to update profile picture' });
  }
}

// Change password
async function changePassword(req, res) {
  const { id } = req.params;
  const { currentPassword, newPassword } = req.body;

  try {
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    if (user.password) {
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }
    }

    // Validate new password
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long' });
    }

    // Update password
    user.password = await bcrypt.hash(newPassword, 10);
    user.updatedAt = new Date();
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
}

module.exports = { 
  checkEmail, 
  getProfile, 
  updateProfile, 
  updateProfilePicture, 
  changePassword 
};