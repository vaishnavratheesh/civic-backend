const WelfareApplication = require('../models/WelfareApplication');
const WelfareScheme = require('../models/WelfareScheme');
const User = require('../models/User');
const CouncillorProfile = require('../models/CouncillorProfile');
const axios = require('axios');
const { verifyApplicationWithGemini } = require('../services/geminiVerify');
// Removed WelfareApplicationDetail: storing full data only in WelfareApplication

// Apply for welfare scheme
async function applyForScheme(req, res) {
  try {
    const { schemeId } = req.params;
    const { id: userId } = req.user;
    let { personalDetails, assessment, reason } = req.body;

    // Parse JSON strings when sent via multipart/form-data
    if (typeof personalDetails === 'string') {
      try { personalDetails = JSON.parse(personalDetails); } catch (_) {}
    }
    if (typeof assessment === 'string') {
      try { assessment = JSON.parse(assessment); } catch (_) {}
    }

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

    // Validate and collect uploaded required documents
    let uploadedDocuments = [];
    if (Array.isArray(scheme.requiredDocuments) && scheme.requiredDocuments.length > 0) {
      const filesArray = Array.isArray(req.files) ? req.files : [];
      const filesByField = filesArray.reduce((acc, f) => {
        acc[f.fieldname] = acc[f.fieldname] || [];
        acc[f.fieldname].push(f);
        return acc;
      }, {});

      for (const reqDoc of scheme.requiredDocuments) {
        const fieldName = `doc_${reqDoc.name.replace(/\s+/g, '_').toLowerCase()}`;
        const fileArr = filesByField[fieldName];
        if (!fileArr || fileArr.length === 0) {
          return res.status(400).json({ success: false, message: `Missing required document: ${reqDoc.name}` });
        }
        const file = fileArr[0];
        // Optional format validation by extension
        if (Array.isArray(reqDoc.formats) && reqDoc.formats.length > 0) {
          const ext = (file.originalname.split('.').pop() || '').toLowerCase();
          const allowed = reqDoc.formats.map(x => String(x).toLowerCase());
          if (!allowed.includes(ext)) {
            return res.status(400).json({ success: false, message: `${reqDoc.name} must be one of: ${reqDoc.formats.join(', ')}` });
          }
        }
        const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;
        uploadedDocuments.push({ name: reqDoc.name, url: fileUrl });
      }
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
        address: personalDetails.address,
        phoneNumber: personalDetails.phoneNumber,
        rationCardNumber: personalDetails.rationCardNumber,
        aadharNumber: personalDetails.aadharNumber,
        familyIncome: parseInt(personalDetails.familyIncome),
        dependents: parseInt(personalDetails.dependents),
        isHandicapped: personalDetails.isHandicapped,
        isSingleWoman: personalDetails.isSingleWoman
      },
      assessment: {
        familyMembers: parseInt(assessment.familyMembers),
        childrenCount: parseInt(assessment.childrenCount),
        elderlyCount: parseInt(assessment.elderlyCount),
        disabledMembers: parseInt(assessment.disabledMembers),
        monthlyIncome: parseInt(assessment.monthlyIncome),
        incomeSource: assessment.incomeSource,
        hasOtherIncome: assessment.hasOtherIncome,
        otherIncomeAmount: parseInt(assessment.otherIncomeAmount) || 0,
        houseOwnership: assessment.houseOwnership,
        houseType: assessment.houseType,
        hasElectricity: assessment.hasElectricity,
        hasWaterConnection: assessment.hasWaterConnection,
        hasToilet: assessment.hasToilet,
        educationLevel: assessment.educationLevel,
        childrenEducation: assessment.childrenEducation,
        hasHealthInsurance: assessment.hasHealthInsurance,
        chronicIllness: assessment.chronicIllness,
        illnessDetails: assessment.illnessDetails,
        hasDisability: assessment.hasDisability,
        disabilityType: assessment.disabilityType,
        employmentStatus: assessment.employmentStatus,
        jobStability: assessment.jobStability,
        hasBankAccount: assessment.hasBankAccount,
        hasVehicle: assessment.hasVehicle,
        vehicleType: assessment.vehicleType,
        hasLand: assessment.hasLand,
        landArea: parseInt(assessment.landArea) || 0,
        caste: assessment.caste,
        religion: assessment.religion,
        isWidow: assessment.isWidow,
        isOrphan: assessment.isOrphan,
        isSeniorCitizen: assessment.isSeniorCitizen,
        hasEmergencyFund: assessment.hasEmergencyFund,
        emergencyContact: assessment.emergencyContact,
        emergencyRelation: assessment.emergencyRelation,
        previousApplications: parseInt(assessment.previousApplications) || 0,
        previousSchemes: assessment.previousSchemes || [],
        additionalNeeds: assessment.additionalNeeds,
        specialCircumstances: assessment.specialCircumstances
      },
      reason,
      documents: uploadedDocuments
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

// Removed getApplicationDetail: all details are in WelfareApplication now

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
      // Councillor sees applications from their ward (explicit query param or derived from user profile)
      if (ward) {
        query.userWard = parseInt(ward);
      } else {
        const councillorUser = await User.findById(userId);
        if (!councillorUser) {
          return res.status(404).json({ 
            success: false, 
            message: 'User not found' 
          });
        }
        query.userWard = councillorUser.ward;
      }
      
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
    // Validate req.user
    if (!req.user || !req.user.id) {
      console.error('getUserApplications - No user in request');
      return res.status(401).json({ 
        success: false, 
        message: 'User not authenticated' 
      });
    }

    const { id: userId } = req.user;
    console.log('getUserApplications - userId:', userId, 'type:', typeof userId);

    // Build a tolerant filter that works whether IDs are strings or ObjectIds
    const mongoose = require('mongoose');
    const safeFilters = [];
    const userIdStr = String(userId);
    safeFilters.push({ userId: userIdStr });
    if (mongoose.Types.ObjectId.isValid(userIdStr)) {
      safeFilters.push({ userId: new mongoose.Types.ObjectId(userIdStr) });
    }

    let docs = [];
    try {
      // Return plain JSON safely without populate to avoid cast/populate issues
      docs = await WelfareApplication.find({ $or: safeFilters })
        .sort({ appliedAt: -1 })
        .lean();
    } catch (queryError) {
      // If casting failed for any reason, degrade gracefully with an empty list
      console.error('getUserApplications - query error:', queryError?.message || queryError);
      docs = [];
    }

    // Normalize fields and provide safe fallbacks expected by frontend
    const applications = (docs || []).map(d => ({
      _id: d._id,
      schemeId: ((d.schemeId && d.schemeId._id) ? d.schemeId._id : d.schemeId)?.toString?.() || String(d.schemeId || ''),
      schemeTitle: d.schemeTitle || '',
      userId: (d.userId && d.userId._id) ? d.userId._id : d.userId,
      userName: d.userName || '',
      userEmail: d.userEmail || '',
      userWard: typeof d.userWard === 'number' ? d.userWard : Number(d.userWard || 0),
      personalDetails: {
        address: d.personalDetails?.address || '',
        phoneNumber: d.personalDetails?.phoneNumber || '',
        rationCardNumber: d.personalDetails?.rationCardNumber || '',
        aadharNumber: d.personalDetails?.aadharNumber || '',
        familyIncome: Number(d.personalDetails?.familyIncome || 0),
        dependents: Number(d.personalDetails?.dependents || 0),
        isHandicapped: Boolean(d.personalDetails?.isHandicapped || false),
        isSingleWoman: Boolean(d.personalDetails?.isSingleWoman || false),
      },
      reason: d.reason || '',
      documents: Array.isArray(d.documents) ? d.documents : [],
      score: typeof d.score === 'number' ? d.score : undefined,
      justification: d.justification || '',
      status: d.status || 'pending',
      verificationStatus: d.verificationStatus || 'Pending',
      appliedAt: d.appliedAt || d.createdAt || new Date(0),
      reviewedAt: d.reviewedAt || null,
    }));

    console.log('getUserApplications - returning applications:', applications.length);
    res.json({ success: true, applications });

  } catch (error) {
    console.error('Error fetching user applications:', error?.message || error);
    if (error?.stack) console.error(error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch applications',
      error: error?.message 
    });
  }
}

// Get a single application with verification history
async function getApplication(req, res) {
  try {
    const { id } = req.params;
    const application = await WelfareApplication.findById(id)
      .populate('schemeId', 'title scope ward')
      .populate('userId', 'name email');
    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }
    return res.json({ success: true, application });
  } catch (error) {
    console.error('Error fetching application:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch application' });
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
      const reviewer = await CouncillorProfile.findById(reviewerId);
      if (!reviewer || reviewer.ward !== application.userWard) {
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

// Manual verification by councillor/admin
async function manualVerifyApplication(req, res) {
  try {
    const { id: applicationId } = req.params;
    const { id: reviewerId, role } = req.user;
    const { status, remarks } = req.body || {};

    if (!['Verified-Manual', 'Rejected'].includes(String(status))) {
      return res.status(400).json({ success: false, message: 'Invalid status for manual verification' });
    }

    const application = await WelfareApplication.findById(applicationId);
    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    // Authorization: admin or councillor of same ward
    if (role === 'councillor') {
      const reviewer = await CouncillorProfile.findById(reviewerId);
      if (!reviewer || reviewer.ward !== application.userWard) {
        return res.status(403).json({ success: false, message: 'Not allowed to verify applications from other wards' });
      }
    } else if (role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admin or councillor can verify applications' });
    }

    application.verification = {
      ...(application.verification || {}),
      mode: 'manual',
      verifiedBy: reviewerId,
      verifiedAt: new Date(),
      remarks: remarks || ''
    };
    application.verificationStatus = status;
    // Update main status based on verification
    application.status = status === 'Verified-Manual' ? 'approved' : 'rejected';
    application.reviewedBy = reviewerId;
    application.reviewedByName = role === 'admin' ? 'System Administrator' : 'Ward Councillor';
    application.reviewComments = remarks || '';
    application.reviewedAt = new Date();

    await application.save();

    return res.json({ success: true, message: 'Manual verification saved', application });
  } catch (error) {
    console.error('Error in manual verification:', error);
    return res.status(500).json({ success: false, message: 'Failed to perform manual verification' });
  }
}

// Automatic verification via Gemini
async function autoVerifyApplication(req, res) {
  try {
    const { id: applicationId } = req.params;
    const { id: reviewerId, role } = req.user;

    const application = await WelfareApplication.findById(applicationId);
    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    // Authorization: admin or councillor of same ward
    if (role === 'councillor') {
      const reviewer = await CouncillorProfile.findById(reviewerId);
      if (!reviewer || reviewer.ward !== application.userWard) {
        return res.status(403).json({ success: false, message: 'Not allowed to verify applications from other wards' });
      }
    } else if (role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admin or councillor can verify applications' });
    }

    const aiResult = await verifyApplicationWithGemini(application);
    const score = typeof aiResult.matchScore === 'number' ? aiResult.matchScore : 0;
    const remarks = aiResult.remarks || 'No remarks';

    application.verification = {
      ...(application.verification || {}),
      mode: 'auto',
      verifiedBy: reviewerId,
      verifiedAt: new Date(),
      autoScore: score,
      remarks
    };

    application.verificationStatus = score > 0.75 ? 'Verified-Auto' : 'Rejected';
    application.reviewedBy = reviewerId;
    application.reviewedByName = role === 'admin' ? 'System Administrator' : 'Ward Councillor';
    application.reviewComments = `AI: ${remarks}`;
    application.reviewedAt = new Date();

    await application.save();

    return res.json({ success: true, message: 'Auto verification completed', result: { score, remarks }, application });
  } catch (error) {
    console.error('Error in auto verification:', error);
    return res.status(500).json({ success: false, message: 'Failed to perform auto verification' });
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
      // Councillor sees stats for their ward (councillor profile lives in councillorProfiles)
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

// Score an application via external ML service and persist score
async function scoreApplication(req, res) {
  try {
    const { id: applicationId } = req.params;
    const application = await WelfareApplication.findById(applicationId);
    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    // Authorization: admin or councillor of same ward
    const { role, id: userId } = req.user;
    
    if (role === 'councillor') {
      const reviewer = await User.findById(userId);
      
      if (!reviewer || reviewer.ward !== application.userWard) {
        return res.status(403).json({ success: false, message: 'Not allowed to score applications from other wards' });
      }
    } else if (role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admin or councillor can score applications' });
    }

    // Map fields expected by ML service
    const pd = application.personalDetails || {};
    const asmt = application.assessment || {};
    const payload = {
      annual_income: Number(pd.familyIncome || (asmt.monthlyIncome ? asmt.monthlyIncome * 12 : 0) || 0),
      family_size: Number(asmt.familyMembers || pd.dependents || 0),
      occupation: String(asmt.employmentStatus || 'unemployed'),
      house_type: String(asmt.houseOwnership || 'owned'),
      already_received_schemes: Number(asmt.previousApplications || (asmt.previousSchemes ? asmt.previousSchemes.length : 0) || 0),
      education_level: String(asmt.educationLevel || 'primary'),
      age: Number(asmt.age || 40),
    };

    // Call real ML service
    const mlBase = process.env.ML_SERVICE_URL || 'http://localhost:8001';
    
    try {
      const mlResponse = await fetch(`${mlBase}/score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(application.toObject()), // Send full application data
        timeout: 10000
      });

      if (!mlResponse.ok) {
        throw new Error(`ML service error: ${mlResponse.status}`);
      }

      const mlResult = await mlResponse.json();
      
      // Save score to application
      application.score = Math.round(mlResult.score);
      application.justification = mlResult.justification || `ML prediction ${Math.round(mlResult.score)} (${mlResult.priority} Priority)`;
      await application.save();

      return res.json({ 
        success: true, 
        score: application.score, 
        label: mlResult.label, 
        priority: mlResult.priority,
        justification: application.justification,
        applicationId 
      });
      
    } catch (mlError) {
      console.error('ML service error:', mlError);
      
      // Fallback to basic scoring if ML service fails
      const fallbackScore = Math.min(100, Math.max(0, 
        (payload.monthly_income < 10000 ? 80 : 
         payload.monthly_income < 20000 ? 60 : 
         payload.monthly_income < 30000 ? 40 : 20) +
        (payload.family_members > 4 ? 15 : 0) +
        (payload.disabled_members > 0 ? 20 : 0) +
        (payload.employment_status === 'unemployed' ? 25 : 0)
      ));
      
      application.score = Math.round(fallbackScore);
      application.justification = `Fallback scoring ${Math.round(fallbackScore)}. ML service unavailable.`;
      await application.save();
    }

    return res.json({ success: true, score: application.score, label: application.score > 60 ? 1 : 0, applicationId });
  } catch (error) {
    console.error('Error scoring application:', error.message || error);
    return res.status(500).json({ success: false, message: 'Failed to score application' });
  }
}

module.exports = {
  applyForScheme,
  getApplications,
  getApplication,
  getUserApplications,
  reviewApplication,
  getApplicationStats,
  scoreApplication,
  manualVerifyApplication,
  autoVerifyApplication
};