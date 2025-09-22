const WelfareScheme = require('../models/WelfareScheme');
const WelfareApplication = require('../models/WelfareApplication');
const User = require('../models/User');
const CouncillorProfile = require('../models/CouncillorProfile');

// Allowed Indian ID/verification documents
const ALLOWED_INDIAN_DOCUMENTS = new Set([
  'Aadhar Card',
  'Ration Card',
  'Voter ID',
  'Driving License',
  'PAN Card',
  'Passport',
  'Disability Certificate',
  'Income Certificate',
  'Caste Certificate',
  'Residence Certificate',
  'BPL Card',
  'Senior Citizen ID',
  'Widow Certificate',
  'Death Certificate'
]);

// Create new welfare scheme (admin or councillor)
async function createScheme(req, res) {
  try {
    const { 
      title, description, category, eligibilityCriteria, benefits, 
      requiredDocuments, totalSlots, applicationDeadline, startDate, endDate,
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

    // Validate requiredDocuments: must contain at least one allowed document
    if (!Array.isArray(requiredDocuments) || requiredDocuments.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one required document is mandatory' });
    }
    const invalidDocs = requiredDocuments.filter(d => !d || !d.name || !ALLOWED_INDIAN_DOCUMENTS.has(String(d.name)));
    if (invalidDocs.length > 0) {
      return res.status(400).json({ success: false, message: 'Required documents must be valid Indian ID documents' });
    }

    const scheme = new WelfareScheme({
      title,
      description,
      category,
      eligibilityCriteria,
      benefits,
      requiredDocuments: Array.isArray(requiredDocuments) ? requiredDocuments.map(d => ({
        name: d.name,
        type: d.type || 'file',
        formats: Array.isArray(d.formats) ? d.formats : []
      })) : [],
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
    const { id: userId, role } = req.user;
    const { scope, ward, category, status } = req.query;

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

      query.$or = [
        { creatorId: userId }, // Schemes created by this councillor
        { scope: 'panchayath' } // Panchayath-wide schemes
      ];

      schemes = await WelfareScheme.find(query).sort({ createdAt: -1 });
    } else {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }

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
    
    
    if (!ward) {
      return res.status(400).json({ 
        success: false, 
        message: 'Ward number is required' 
      });
    }


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

// Get single scheme details (public for viewing requirements)
async function getScheme(req, res) {
  try {
    const { id } = req.params;
    const scheme = await WelfareScheme.findById(id);
    if (!scheme) {
      return res.status(404).json({ success: false, message: 'Scheme not found' });
    }
    res.json({ success: true, scheme });
  } catch (error) {
    console.error('Error fetching scheme:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch scheme' });
  }
}

// Update welfare scheme
async function updateScheme(req, res) {
  try {
    const { id } = req.params;
    const { id: userId, role } = req.user;
    const updateData = req.body;

    if (Array.isArray(updateData.requiredDocuments)) {
      updateData.requiredDocuments = updateData.requiredDocuments.map(d => ({
        name: d.name,
        type: d.type || 'file',
        formats: Array.isArray(d.formats) ? d.formats : []
      }));
    }

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
      'requiredDocuments', 'totalSlots', 'applicationDeadline', 'startDate', 
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
  getScheme,
  getSchemesForCitizens,
  updateScheme,
  deleteScheme,
  getSchemeStats
}; 