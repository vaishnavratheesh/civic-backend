const WelfareApplication = require('../models/WelfareApplication');
const WelfareScheme = require('../models/WelfareScheme');
const User = require('../models/User');

// Apply for welfare scheme
async function applyForScheme(req, res) {
  try {
    const { schemeId } = req.params;
    const { id: userId } = req.user;
    const {
      address, phoneNumber, rationCardNumber, aadharNumber,
      familyIncome, dependents, isHandicapped, isSingleWoman, reason
    } = req.body;

    // Check if scheme exists and is active
    const scheme = await WelfareScheme.findById(schemeId);
    if (!scheme) {
      return res.status(404).json({ 
        success: false, 
        message: 'Welfare scheme not found' 
      });
    }

    if (scheme.status !== 'active') {
      return res.status(400).json({ 
        success: false, 
        message: 'This scheme is not currently accepting applications' 
      });
    }

    if (scheme.applicationDeadline < new Date()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Application deadline has passed' 
      });
    }

    if (scheme.availableSlots <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No slots available for this scheme' 
      });
    }

    // Check if user already applied
    const existingApplication = await WelfareApplication.findOne({
      schemeId,
      userId
    });

    if (existingApplication) {
      return res.status(400).json({ 
        success: false, 
        message: 'You have already applied for this scheme' 
      });
    }

    // Get user details
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Create application
    const application = new WelfareApplication({
      schemeId,
      schemeTitle: scheme.title,
      userId,
      userName: user.name,
      userEmail: user.email,
      userWard: user.ward,
      personalDetails: {
        address,
        phoneNumber,
        rationCardNumber,
        aadharNumber,
        familyIncome: parseInt(familyIncome),
        dependents: parseInt(dependents),
        isHandicapped,
        isSingleWoman
      },
      reason
    });

    await application.save();

    // Update available slots
    scheme.availableSlots -= 1;
    await scheme.save();

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully',
      application
    });

  } catch (error) {
    console.error('Error applying for scheme:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to submit application' 
    });
  }
}

// Get applications (admin sees all, councillor sees their ward applications)
async function getApplications(req, res) {
  try {
    const { id: userId, role } = req.user;
    const { schemeId, status, ward } = req.query;

    let query = {};

    // Filter by scheme
    if (schemeId) query.schemeId = schemeId;
    if (status) query.status = status;

    let applications;
    if (role === 'admin') {
      // Admin sees all applications
      if (ward) query.userWard = parseInt(ward);
      applications = await WelfareApplication.find(query)
        .populate('schemeId', 'title scope ward')
        .populate('userId', 'name email')
        .sort({ appliedAt: -1 });
    } else if (role === 'councillor') {
      // Councillor sees applications from their ward
      const councillor = await CouncillorProfile.findById(userId);
      if (!councillor) {
        return res.status(404).json({ 
          success: false, 
          message: 'Councillor not found' 
        });
      }
      query.userWard = councillor.ward;
      
      applications = await WelfareApplication.find(query)
        .populate('schemeId', 'title scope ward')
        .populate('userId', 'name email')
        .sort({ appliedAt: -1 });
    } else {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }

    res.json({
      success: true,
      applications
    });

  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch applications' 
    });
  }
}

// Get user's applications
async function getUserApplications(req, res) {
  try {
    const { id: userId } = req.user;

    const applications = await WelfareApplication.find({ userId })
      .populate('schemeId', 'title scope ward category')
      .sort({ appliedAt: -1 });

    res.json({
      success: true,
      applications
    });

  } catch (error) {
    console.error('Error fetching user applications:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch applications' 
    });
  }
}

// Review application (admin or councillor)
async function reviewApplication(req, res) {
  try {
    const { id: applicationId } = req.params;
    const { id: reviewerId, role } = req.user;
    const { status, reviewComments } = req.body;

    const application = await WelfareApplication.findById(applicationId);
    if (!application) {
      return res.status(404).json({ 
        success: false, 
        message: 'Application not found' 
      });
    }

    // Check permissions
    if (role === 'councillor') {
      const councillor = await CouncillorProfile.findById(reviewerId);
      if (!councillor || councillor.ward !== application.userWard) {
        return res.status(403).json({ 
          success: false, 
          message: 'You can only review applications from your ward' 
        });
      }
    }

    // Update application
    application.status = status;
    application.reviewedBy = reviewerId;
    application.reviewedByName = role === 'admin' ? 'System Administrator' : 'Ward Councillor';
    application.reviewComments = reviewComments;
    application.reviewedAt = new Date();

    if (status === 'completed') {
      application.completedAt = new Date();
    }

    await application.save();

    res.json({
      success: true,
      message: 'Application reviewed successfully',
      application
    });

  } catch (error) {
    console.error('Error reviewing application:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to review application' 
    });
  }
}

// Get application statistics
async function getApplicationStats(req, res) {
  try {
    const { id: userId, role } = req.user;

    let stats;
    if (role === 'admin') {
      // Admin sees overall stats
      stats = await WelfareApplication.aggregate([
        {
          $group: {
            _id: null,
            totalApplications: { $sum: 1 },
            pendingApplications: { 
              $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } 
            },
            approvedApplications: { 
              $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } 
            },
            rejectedApplications: { 
              $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } 
            }
          }
        }
      ]);

      // Get applications by ward
      const wardStats = await WelfareApplication.aggregate([
        { $group: { _id: '$userWard', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]);

      // Get applications by status
      const statusStats = await WelfareApplication.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);

      stats = {
        ...stats[0],
        wardStats,
        statusStats
      };

    } else if (role === 'councillor') {
      // Councillor sees their ward stats
      const councillor = await CouncillorProfile.findById(userId);
      if (!councillor) {
        return res.status(404).json({ 
          success: false, 
          message: 'Councillor not found' 
        });
      }

      stats = await WelfareApplication.aggregate([
        { $match: { userWard: councillor.ward } },
        {
          $group: {
            _id: null,
            totalApplications: { $sum: 1 },
            pendingApplications: { 
              $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } 
            },
            approvedApplications: { 
              $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } 
            },
            rejectedApplications: { 
              $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } 
            }
          }
        }
      ]);

      stats = stats[0] || {
        totalApplications: 0,
        pendingApplications: 0,
        approvedApplications: 0,
        rejectedApplications: 0
      };
    }

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Error fetching application stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch application statistics' 
    });
  }
}

module.exports = {
  applyForScheme,
  getApplications,
  getUserApplications,
  reviewApplication,
  getApplicationStats
}; 