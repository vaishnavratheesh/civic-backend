const Grievance = require('../models/Grievance');
const User = require('../models/User');

// Create a new grievance
const createGrievance = async (req, res) => {
  try {
    const { issueType, description, location, imageURL, priorityScore } = req.body;
    const userId = req.user.id;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const grievance = new Grievance({
      userId,
      userName: user.name,
      ward: user.ward,
      issueType,
      description,
      location,
      imageURL: imageURL || null,
      priorityScore: priorityScore || 1,
      source: 'user'
    });

    await grievance.save();
    res.status(201).json({ message: 'Grievance submitted successfully', grievance });
  } catch (error) {
    console.error('Error creating grievance:', error);
    res.status(500).json({ message: 'Error creating grievance', error: error.message });
  }
};

// Get user's own grievances
const getMyGrievances = async (req, res) => {
  try {
    const userId = req.user.id;
    const grievances = await Grievance.find({ userId })
      .sort({ createdAt: -1 })
      .populate('assignedTo', 'name email')
      .lean();

    const mappedGrievances = grievances.map(grievance => ({
      id: grievance._id,
      userId: grievance.userId,
      userName: grievance.userName,
      ward: grievance.ward,
      imageURL: grievance.imageURL,
      issueType: grievance.issueType,
      description: grievance.description,
      location: grievance.location,
      priorityScore: grievance.priorityScore,
      status: grievance.status,
      assignedTo: grievance.assignedTo?._id || null,
      officerName: grievance.assignedTo?.name || grievance.officerName || null,
      source: grievance.source,
      createdAt: grievance.createdAt,
      resolvedAt: grievance.resolvedAt
    }));

    res.json({ grievances: mappedGrievances });
  } catch (error) {
    console.error('Error fetching user grievances:', error);
    res.status(500).json({ message: 'Error fetching grievances', error: error.message });
  }
};

// Get community grievances (all grievances in the same ward)
const getCommunityGrievances = async (req, res) => {
  try {
    const userWard = req.user.ward;
    const grievances = await Grievance.find({ ward: userWard })
      .sort({ createdAt: -1 })
      .populate('assignedTo', 'name email')
      .lean();

    const mappedGrievances = grievances.map(grievance => ({
      id: grievance._id,
      userId: grievance.userId,
      userName: grievance.userName,
      ward: grievance.ward,
      imageURL: grievance.imageURL,
      issueType: grievance.issueType,
      description: grievance.description,
      location: grievance.location,
      priorityScore: grievance.priorityScore,
      status: grievance.status,
      assignedTo: grievance.assignedTo?._id || null,
      officerName: grievance.assignedTo?.name || grievance.officerName || null,
      source: grievance.source,
      createdAt: grievance.createdAt,
      resolvedAt: grievance.resolvedAt
    }));

    res.json({ grievances: mappedGrievances });
  } catch (error) {
    console.error('Error fetching community grievances:', error);
    res.status(500).json({ message: 'Error fetching community grievances', error: error.message });
  }
};

// Get all grievances (for admin/officer)
const getAllGrievances = async (req, res) => {
  try {
    const { status, ward, page = 1, limit = 10 } = req.query;
    const filter = {};
    
    if (status) filter.status = status;
    if (ward) filter.ward = parseInt(ward);

    const grievances = await Grievance.find(filter)
      .sort({ createdAt: -1 })
      .populate('assignedTo', 'name email')
      .populate('userId', 'name email')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await Grievance.countDocuments(filter);

    const mappedGrievances = grievances.map(grievance => ({
      id: grievance._id,
      userId: grievance.userId,
      userName: grievance.userName,
      ward: grievance.ward,
      imageURL: grievance.imageURL,
      issueType: grievance.issueType,
      description: grievance.description,
      location: grievance.location,
      priorityScore: grievance.priorityScore,
      status: grievance.status,
      assignedTo: grievance.assignedTo?._id || null,
      officerName: grievance.assignedTo?.name || grievance.officerName || null,
      source: grievance.source,
      createdAt: grievance.createdAt,
      resolvedAt: grievance.resolvedAt
    }));

    res.json({ 
      grievances: mappedGrievances, 
      total, 
      page: parseInt(page), 
      totalPages: Math.ceil(total / limit) 
    });
  } catch (error) {
    console.error('Error fetching all grievances:', error);
    res.status(500).json({ message: 'Error fetching grievances', error: error.message });
  }
};

// Update grievance status (for officers/admin)
const updateGrievanceStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolutionNotes, assignedTo } = req.body;
    const userId = req.user.id;

    const grievance = await Grievance.findById(id);
    if (!grievance) {
      return res.status(404).json({ message: 'Grievance not found' });
    }

    const updateData = { status };
    if (resolutionNotes) updateData.resolutionNotes = resolutionNotes;
    if (assignedTo) {
      updateData.assignedTo = assignedTo;
      const officer = await User.findById(assignedTo);
      if (officer) updateData.officerName = officer.name;
    }
    if (status === 'resolved') updateData.resolvedAt = new Date();

    const updatedGrievance = await Grievance.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true }
    ).populate('assignedTo', 'name email');

    res.json({ message: 'Grievance updated successfully', grievance: updatedGrievance });
  } catch (error) {
    console.error('Error updating grievance:', error);
    res.status(500).json({ message: 'Error updating grievance', error: error.message });
  }
};

// Get grievance statistics
const getGrievanceStats = async (req, res) => {
  try {
    const { ward } = req.query;
    const filter = ward ? { ward: parseInt(ward) } : {};

    const stats = await Grievance.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const statusCounts = {
      pending: 0,
      in_progress: 0,
      resolved: 0,
      rejected: 0
    };

    stats.forEach(stat => {
      statusCounts[stat._id] = stat.count;
    });

    const total = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);

    res.json({
      total,
      pending: statusCounts.pending,
      in_progress: statusCounts.in_progress,
      resolved: statusCounts.resolved,
      rejected: statusCounts.rejected
    });
  } catch (error) {
    console.error('Error fetching grievance stats:', error);
    res.status(500).json({ message: 'Error fetching grievance statistics', error: error.message });
  }
};

module.exports = {
  createGrievance,
  getMyGrievances,
  getCommunityGrievances,
  getAllGrievances,
  updateGrievanceStatus,
  getGrievanceStats
};