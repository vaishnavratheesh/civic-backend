const User = require('../models/User');
const CouncillorProfile = require('../models/CouncillorProfile');
const Message = require('../models/Message');
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
      
      const isMatch = await bcrypt.compare(updateData.currentPassword, councillor.password || '');
      if (!isMatch) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }

      if (updateData.newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters long' });
      }

      councillor.password = await bcrypt.hash(updateData.newPassword, 10);
    }

    councillor.updatedAt = new Date();
    await councillor.save();

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

// Messaging functions for councillors
exports.listMessages = async (req, res) => {
  try {
    const { threadId } = req.query;
    let filter = {};
    
    if (threadId) {
      filter.threadId = threadId;
    } else {
      // Get all messages where councillor is sender or receiver
      filter.$or = [
        { senderId: req.user.id },
        { receiverId: req.user.id }
      ];
    }
    
    const items = await Message.find(filter)
      .sort({ createdAt: 1 })
      .populate('senderId receiverId', 'name email role ward')
      .lean();
    
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to list messages' });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { receiverId, ward, message, threadId } = req.body;
    
    // Generate threadId if not provided
    // Resolve councillor ward if not provided
    let wardNum = ward;
    if (!wardNum) {
      try {
        const profile = await CouncillorProfile.findById(req.user.id).select('ward');
        wardNum = profile?.ward || null;
      } catch {}
    }
    const finalThreadId = threadId || `councillor-${wardNum || 'general'}-${Date.now()}`;
  
  let doc = await Message.create({ 
      senderId: req.user.id, 
      receiverId: receiverId || null, 
      ward: wardNum || null, 
      message,
      threadId: finalThreadId
    });
  // populate for clients
  doc = await doc.populate('senderId receiverId', 'name email role ward');
    
  // Emit real-time message to Socket.IO
    try {
      const io = req.app.get('io');
      if (io) {
        if (wardNum) io.to(`ward:${wardNum}`).emit('message:new', { message: doc, threadId: finalThreadId, ward: wardNum });
        io.to('president').emit('message:new', { message: doc, threadId: finalThreadId, ward: wardNum });
      }
    } catch (socketError) {
      console.log('Socket emit failed:', socketError.message);
    }
    
    res.status(201).json({ success: true, item: doc });
  } catch (e) {
    res.status(400).json({ success: false, message: 'Failed to send message' });
  }
};

// File message from councillor
exports.sendFileMessage = async (req, res) => {
  try {
    const { receiverId, ward, threadId } = req.body;
    if (!req.file) return res.status(400).json({ success: false, message: 'File is required' });

    let wardNum = ward;
    if (!wardNum) {
      try {
        const profile = await CouncillorProfile.findById(req.user.id).select('ward');
        wardNum = profile?.ward || null;
      } catch {}
    }
    const finalThreadId = threadId || `councillor-${wardNum || 'general'}-${Date.now()}`;
    let doc = await Message.create({
      senderId: req.user.id,
      receiverId: receiverId || null,
      ward: wardNum || null,
      message: req.file.originalname,
      messageType: 'file',
      fileUrl: `/uploads/${req.file.filename}`,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      threadId: finalThreadId
    });
    doc = await doc.populate('senderId receiverId', 'name email role ward');

    try {
      const io = req.app.get('io');
      if (io) {
        if (wardNum) io.to(`ward:${wardNum}`).emit('message:new', { message: doc, threadId: finalThreadId, ward: wardNum });
        io.to('president').emit('message:new', { message: doc, threadId: finalThreadId, ward: wardNum });
      }
    } catch {}

    res.status(201).json({ success: true, item: doc });
  } catch (e) {
    res.status(400).json({ success: false, message: 'Failed to send file' });
  }
};

exports.getConversations = async (req, res) => {
  try {
    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [
            { senderId: req.user._id },
            { receiverId: req.user._id }
          ]
        }
      },
      {
        $group: {
          _id: '$threadId',
          lastMessage: { $last: '$message' },
          lastMessageTime: { $last: '$createdAt' },
          ward: { $last: '$ward' },
          unreadCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$receiverId', req.user._id] }, { $eq: ['$isRead', false] }] },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $sort: { lastMessageTime: -1 }
      }
    ]);
    
    res.json({ success: true, conversations });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to get conversations' });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { threadId } = req.body;
    
    await Message.updateMany(
      { 
        threadId: threadId,
        receiverId: req.user._id,
        isRead: false
      },
      { isRead: true }
    );
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to mark messages as read' });
  }
};

module.exports = {
  councillorLogin,
  completeProfile,
  changePassword,
  getProfile,
  updateProfile,
  listMessages: exports.listMessages,
  sendMessage: exports.sendMessage,
  sendFileMessage: exports.sendFileMessage,
  getConversations: exports.getConversations,
  markAsRead: exports.markAsRead
}; 