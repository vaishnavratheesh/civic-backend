const WelfareScheme = require('../models/WelfareScheme');
const WelfareApplication = require('../models/WelfareApplication');
const User = require('../models/User');
const CouncillorProfile = require('../models/CouncillorProfile');

// Create new welfare scheme (admin or councillor)
async function createScheme(req, res) {
  try {
    const { 
      title, description, category, eligibilityCriteria, benefits, 
      documentsRequired, totalSlots, applicationDeadline, startDate, endDate,
      scope, ward, additionalDetails 
    } = req.body;

    const { id: creatorId, role } = req.user;

    // Validate scope and ward combination
    if (scope === 'ward' && !ward) {
      return res.status(400).json({ 
        success: false, 
        message: 'Ward number is required for ward-specific schemes' 
      });
    }

    if (scope === 'panchayath' && ward) {
      return res.status(400).json({ 
        success: false, 
        message: 'Ward number should not be specified for panchayath-wide schemes' 
      });
    }

    // Get creator name
    let creatorName;
    if (role === 'admin') {
      const admin = await User.findById(creatorId);
      creatorName = admin ? admin.name : 'System Administrator';
    } else if (role === 'councillor') {
      const councillor = await CouncillorProfile.findById(creatorId);
      creatorName = councillor ? councillor.name : 'Ward Councillor';
    }

    const scheme = new WelfareScheme({
      title,
      description,
      category,
      eligibilityCriteria,
      benefits,
      documentsRequired: documentsRequired || [],
      totalSlots,
      availableSlots: totalSlots,
      additionalDetails: additionalDetails || '',
      applicationDeadline,
      startDate,
      endDate,
      scope,
      createdBy: role,
      creatorId,
      creatorName,
      ward: scope === 'ward' ? ward : null
    });

    await scheme.save();

    res.status(201).json({
      success: true,
      message: 'Welfare scheme created successfully',
      scheme
    });

  } catch (error) {
    console.error('Error creating welfare scheme:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create welfare scheme' 
    });
  }
}

// Get all schemes (admin view - all schemes, councillor view - their schemes + panchayath schemes)
async function getSchemes(req, res) {
  try {
    console.log('getSchemes called with user:', req.user);
    const { id: userId, role } = req.user;
    const { scope, ward, category, status } = req.query;
    console.log('Query params:', { scope, ward, category, status });

    let query = {};

    // Filter by scope
    if (scope) query.scope = scope;
    if (ward) query.ward = parseInt(ward);
    if (category) query.category = category;
    if (status) query.status = status;

    let schemes;
    if (role === 'admin') {
      // Admin sees all schemes
      schemes = await WelfareScheme.find(query).sort({ createdAt: -1 });
    } else if (role === 'councillor') {
      // Councillor sees their own schemes + panchayath-wide schemes
      const councillor = await CouncillorProfile.findById(userId);
      if (!councillor) {
        return res.status(404).json({ 
          success: false, 
          message: 'Councillor not found' 
        });
      }

      console.log('Councillor found:', councillor.name, 'ID:', userId);
      
      // Check what schemes exist in the database
      const allSchemes = await WelfareScheme.find({}).sort({ createdAt: -1 });
      console.log('All schemes in database:', allSchemes.map(s => ({ 
        id: s._id, 
        title: s.title, 
        creatorId: s.creatorId, 
        creatorName: s.creatorName 
      })));

      query.$or = [
        { creatorId: userId }, // Schemes created by this councillor
        { scope: 'panchayath' } // Panchayath-wide schemes
      ];

      console.log('Query being used:', JSON.stringify(query));
      schemes = await WelfareScheme.find(query).sort({ createdAt: -1 });
      console.log('Found schemes for councillor:', schemes.length);
    } else {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }

    console.log('Returning schemes:', schemes.length);
    res.json({
      success: true,
      schemes
    });

  } catch (error) {
    console.error('Error fetching schemes:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch schemes' 
    });
  }
}

// Get schemes for citizens (filtered by their ward)
async function getSchemesForCitizens(req, res) {
  try {
    const { ward } = req.params;
    
    console.log('getSchemesForCitizens called for ward:', ward);
    console.log('Request user info:', req.user);
    
    if (!ward) {
      return res.status(400).json({ 
        success: false, 
        message: 'Ward number is required' 
      });
    }

    // First, let's see all schemes in the database
    const allSchemes = await WelfareScheme.find({}).sort({ createdAt: -1 });
    console.log('All schemes in database:', allSchemes.map(s => ({
      id: s._id,
      title: s.title,
      ward: s.ward,
      scope: s.scope,
      status: s.status,
      approved: s.approved,
      applicationDeadline: s.applicationDeadline,
      creatorName: s.creatorName,
      creatorId: s.creatorId
    })));

    // Let's check each scheme individually to see why it's being filtered out
    console.log('\n=== ANALYZING EACH SCHEME ===');
    allSchemes.forEach((scheme, index) => {
      console.log(`\nScheme ${index + 1}: ${scheme.title}`);
      console.log(`  - Ward: ${scheme.ward} (requested: ${ward})`);
      console.log(`  - Scope: ${scheme.scope}`);
      console.log(`  - Status: ${scheme.status}`);
      console.log(`  - Approved: ${scheme.approved}`);
      console.log(`  - Application Deadline: ${scheme.applicationDeadline}`);
      console.log(`  - Is deadline in future? ${scheme.applicationDeadline > new Date()}`);
      
      // Check if this scheme should be visible to this ward
      const isWardMatch = scheme.ward === parseInt(ward);
      const isPanchayathWide = scheme.scope === 'panchayath';
      const isActive = scheme.status === 'active';
      const isApproved = scheme.approved === true;
      const isNotExpired = scheme.applicationDeadline > new Date();
      
      console.log(`  - Ward match: ${isWardMatch}`);
      console.log(`  - Panchayath wide: ${isPanchayathWide}`);
      console.log(`  - Active: ${isActive}`);
      console.log(`  - Approved: ${isApproved}`);
      console.log(`  - Not expired: ${isNotExpired}`);
      
      const shouldShow = (isWardMatch || isPanchayathWide) && isActive && isApproved && isNotExpired;
      console.log(`  - SHOULD SHOW: ${shouldShow}`);
    });

    // Get schemes available for this ward
    const schemes = await WelfareScheme.find({
      $or: [
        { scope: 'panchayath' }, // Panchayath-wide schemes
        { ward: parseInt(ward) } // Ward-specific schemes
      ],
      status: 'active',
      approved: true,
      applicationDeadline: { $gt: new Date() } // Not expired
    }).sort({ createdAt: -1 });
    
    console.log('\n=== FINAL RESULT ===');
    console.log('Final schemes count:', schemes.length);
    console.log('Final schemes:', schemes.map(s => s.title));

    res.json({
      success: true,
      schemes: schemes
    });

  } catch (error) {
    console.error('Error fetching schemes for citizens:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch schemes' 
    });
  }
}

// Update welfare scheme
async function updateScheme(req, res) {
  try {
    const { id } = req.params;
    const { id: userId, role } = req.user;
    const updateData = req.body;

    const scheme = await WelfareScheme.findById(id);
    if (!scheme) {
      return res.status(404).json({ 
        success: false, 
        message: 'Scheme not found' 
      });
    }

    // Check permissions
    if (role === 'councillor' && scheme.creatorId.toString() !== userId) {
      return res.status(403).json({ 
        success: false, 
        message: 'You can only update schemes created by you' 
      });
    }

    // Update allowed fields
    const allowedFields = [
      'title', 'description', 'category', 'eligibilityCriteria', 'benefits',
      'documentsRequired', 'totalSlots', 'applicationDeadline', 'startDate', 
      'endDate', 'status'
    ];

    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        scheme[field] = updateData[field];
      }
    });

    scheme.updatedAt = new Date();
    await scheme.save();

    res.json({
      success: true,
      message: 'Scheme updated successfully',
      scheme
    });

  } catch (error) {
    console.error('Error updating scheme:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update scheme' 
    });
  }
}

// Delete welfare scheme
async function deleteScheme(req, res) {
  try {
    const { id } = req.params;
    const { id: userId, role } = req.user;

    const scheme = await WelfareScheme.findById(id);
    if (!scheme) {
      return res.status(404).json({ 
        success: false, 
        message: 'Scheme not found' 
      });
    }

    // Check permissions
    if (role === 'councillor' && scheme.creatorId.toString() !== userId) {
      return res.status(403).json({ 
        success: false, 
        message: 'You can only delete schemes created by you' 
      });
    }

    // Check if there are applications
    const applications = await WelfareApplication.countDocuments({ schemeId: id });
    if (applications > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete scheme with existing applications' 
      });
    }

    await WelfareScheme.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Scheme deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting scheme:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete scheme' 
    });
  }
}

// Get scheme statistics (admin dashboard)
async function getSchemeStats(req, res) {
  try {
    const { id: userId, role } = req.user;

    if (role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Admin access required' 
      });
    }

    const stats = await WelfareScheme.aggregate([
      {
        $group: {
          _id: null,
          totalSchemes: { $sum: 1 },
          activeSchemes: { 
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } 
          },
          panchayathSchemes: { 
            $sum: { $cond: [{ $eq: ['$scope', 'panchayath'] }, 1, 0] } 
          },
          wardSchemes: { 
            $sum: { $cond: [{ $eq: ['$scope', 'ward'] }, 1, 0] } 
          }
        }
      }
    ]);

    // Get schemes by category
    const categoryStats = await WelfareScheme.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Get schemes by ward
    const wardStats = await WelfareScheme.aggregate([
      { $match: { scope: 'ward' } },
      { $group: { _id: '$ward', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      stats: stats[0] || {
        totalSchemes: 0,
        activeSchemes: 0,
        panchayathSchemes: 0,
        wardSchemes: 0
      },
      categoryStats,
      wardStats
    });

  } catch (error) {
    console.error('Error fetching scheme stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch scheme statistics' 
    });
  }
}

module.exports = {
  createScheme,
  getSchemes,
  getSchemesForCitizens,
  updateScheme,
  deleteScheme,
  getSchemeStats
}; 