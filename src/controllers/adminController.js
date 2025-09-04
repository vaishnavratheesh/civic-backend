const User = require('../models/User');
const CouncillorProfile = require('../models/CouncillorProfile');
const bcrypt = require('bcryptjs');

// Get dashboard statistics
async function getDashboardStats(req, res) {
  try {
    // Get total users by role
    const totalUsers = await User.countDocuments();
    const totalCitizens = await User.countDocuments({ role: 'citizen' });
    const totalCouncillors = await CouncillorProfile.countDocuments();
    const totalOfficers = await User.countDocuments({ role: 'officer' });
    const totalAdmins = await User.countDocuments({ role: 'admin' });

    // Get users by ward
    const usersByWard = await User.aggregate([
      { $group: { _id: '$ward', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    // Get councillors with their details
    const councillors = await CouncillorProfile.find()
      .select('name email ward appointmentDate endDate partyAffiliation approved isVerified')
      .sort({ ward: 1 });

    // Get recent users (last 10)
    const recentUsers = await User.find()
      .select('name email role ward createdAt approved isVerified')
      .sort({ createdAt: -1 })
      .limit(10);

    // Get user statistics by approval status
    const approvedUsers = await User.countDocuments({ approved: true });
    const pendingUsers = await User.countDocuments({ approved: false });

    // Get verified vs unverified users
    const verifiedUsers = await User.countDocuments({ isVerified: true });
    const unverifiedUsers = await User.countDocuments({ isVerified: false });

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalCitizens,
        totalCouncillors,
        totalOfficers,
        totalAdmins,
        approvedUsers,
        pendingUsers,
        verifiedUsers,
        unverifiedUsers
      },
      usersByWard,
      councillors,
      recentUsers
    });
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    res.status(500).json({ success: false, message: 'Error fetching dashboard statistics' });
  }
}

// Get all users with filtering and pagination
async function getAllUsers(req, res) {
  try {
    const { page = 1, limit = 10, role, ward, approved, isVerified, search } = req.query;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = {};
    if (role) filter.role = role;
    if (ward) filter.ward = parseInt(ward);
    if (approved !== undefined) filter.approved = approved === 'true';
    if (isVerified !== undefined) filter.isVerified = isVerified === 'true';
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Get users with pagination
    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await User.countDocuments(filter);

    res.json({
      success: true,
      users,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalUsers: total,
        hasNextPage: skip + users.length < total,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ success: false, message: 'Error fetching users' });
  }
}

// Get user by ID
async function getUserById(req, res) {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select('-password');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ success: false, message: 'Error fetching user' });
  }
}

// Update user (admin can update user details)
async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { name, ward, panchayath, approved, isVerified, role } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Update fields
    if (name) user.name = name;
    if (ward) user.ward = ward;
    if (panchayath) user.panchayath = panchayath;
    if (approved !== undefined) user.approved = approved;
    if (isVerified !== undefined) user.isVerified = isVerified;
    if (role) user.role = role;

    await user.save();

    res.json({ 
      success: true, 
      message: 'User updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        ward: user.ward,
        approved: user.approved,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ success: false, message: 'Error updating user' });
  }
}

// Delete user
async function deleteUser(req, res) {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Prevent deletion of admin users
    if (user.role === 'admin') {
      return res.status(403).json({ success: false, message: 'Cannot delete admin users' });
    }

    await User.findByIdAndDelete(id);

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ success: false, message: 'Error deleting user' });
  }
}

// Get councillors with detailed information
async function getCouncillors(req, res) {
  try {
    const councillors = await CouncillorProfile.find()
      .select('-password')
      .sort({ ward: 1 });

    // Calculate tenure for each councillor
    const councillorsWithTenure = councillors.map(councillor => {
      const councillorObj = councillor.toObject();
      
      if (councillor.appointmentDate) {
        const appointmentDate = new Date(councillor.appointmentDate);
        const endDate = councillor.endDate ? new Date(councillor.endDate) : null;
        const currentDate = new Date();
        
        // Calculate days in office
        const daysInOffice = Math.floor((currentDate - appointmentDate) / (1000 * 60 * 60 * 24));
        
        // Calculate remaining days if end date exists
        let remainingDays = null;
        if (endDate) {
          remainingDays = Math.floor((endDate - currentDate) / (1000 * 60 * 60 * 24));
        }

        councillorObj.daysInOffice = daysInOffice;
        councillorObj.remainingDays = remainingDays;
        councillorObj.isActive = !endDate || currentDate <= endDate;
      }

      return councillorObj;
    });

    res.json({ success: true, councillors: councillorsWithTenure });
  } catch (error) {
    console.error('Error getting councillors:', error);
    res.status(500).json({ success: false, message: 'Error fetching councillors' });
  }
}

// Update councillor details
async function updateCouncillor(req, res) {
  try {
    const { id } = req.params;
    const { 
      name, 
      ward, 
      appointmentDate, 
      endDate, 
      partyAffiliation, 
      educationalQualification, 
      previousExperience, 
      emergencyContact, 
      emergencyContactRelation,
      approved,
      isVerified 
    } = req.body;

    const councillor = await CouncillorProfile.findById(id);
    if (!councillor) {
      return res.status(404).json({ success: false, message: 'Councillor not found' });
    }
    // CouncillorProfile implies role 'councillor'

    // Update fields
    if (name) councillor.name = name;
    if (ward) councillor.ward = ward;
    if (appointmentDate) councillor.appointmentDate = appointmentDate;
    if (endDate) councillor.endDate = endDate;
    if (partyAffiliation) councillor.partyAffiliation = partyAffiliation;
    if (educationalQualification) councillor.educationalQualification = educationalQualification;
    if (previousExperience) councillor.previousExperience = previousExperience;
    if (emergencyContact) councillor.emergencyContact = emergencyContact;
    if (emergencyContactRelation) councillor.emergencyContactRelation = emergencyContactRelation;
    if (approved !== undefined) councillor.approved = approved;
    if (isVerified !== undefined) councillor.isVerified = isVerified;

    await councillor.save();

    res.json({ 
      success: true, 
      message: 'Councillor updated successfully',
      councillor: {
        id: councillor._id,
        name: councillor.name,
        email: councillor.email,
        ward: councillor.ward,
        appointmentDate: councillor.appointmentDate,
        endDate: councillor.endDate,
        partyAffiliation: councillor.partyAffiliation,
        approved: councillor.approved,
        isVerified: councillor.isVerified
      }
    });
  } catch (error) {
    console.error('Error updating councillor:', error);
    res.status(500).json({ success: false, message: 'Error updating councillor' });
  }
}

// Get users by ward
async function getUsersByWard(req, res) {
  try {
    const { ward } = req.params;
    
    const users = await User.find({ ward: parseInt(ward) })
      .select('-password')
      .sort({ role: 1, name: 1 });
    const councillors = await CouncillorProfile.find({ ward: parseInt(ward) }).select('-password');

    const wardStats = {
      totalUsers: users.length + councillors.length,
      citizens: users.filter(u => u.role === 'citizen').length,
      councillors: councillors.length,
      officers: users.filter(u => u.role === 'officer').length,
      approved: users.filter(u => u.approved).length + councillors.filter(c => c.approved).length,
      verified: users.filter(u => u.isVerified).length + councillors.filter(c => c.isVerified).length
    };

    res.json({ 
      success: true, 
      ward: parseInt(ward),
      stats: wardStats,
      users,
      councillors
    });
  } catch (error) {
    console.error('Error getting users by ward:', error);
    res.status(500).json({ success: false, message: 'Error fetching ward users' });
  }
}

// Bulk approve users
async function bulkApproveUsers(req, res) {
  try {
    const { userIds, approved } = req.body;

    if (!userIds || !Array.isArray(userIds)) {
      return res.status(400).json({ success: false, message: 'User IDs array is required' });
    }

    const result = await User.updateMany(
      { _id: { $in: userIds } },
      { $set: { approved: approved } }
    );

    res.json({ 
      success: true, 
      message: `${result.modifiedCount} users ${approved ? 'approved' : 'unapproved'} successfully` 
    });
  } catch (error) {
    console.error('Error bulk approving users:', error);
    res.status(500).json({ success: false, message: 'Error updating users' });
  }
}

module.exports = {
  getDashboardStats,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getCouncillors,
  updateCouncillor,
  getUsersByWard,
  bulkApproveUsers
}; 