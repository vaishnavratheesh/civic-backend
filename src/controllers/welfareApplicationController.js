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
    console.log('[applyForScheme] Starting...');
    console.log('[applyForScheme] Request user:', req.user);
    console.log('[applyForScheme] Scheme ID:', req.params.schemeId);
    console.log('[applyForScheme] Body keys:', Object.keys(req.body));
    console.log('[applyForScheme] File count:', req.files?.length || 0);
    
    const { schemeId } = req.params;
    const { id: userId } = req.user;
    let { personalDetails } = req.body;

    console.log('[applyForScheme] Raw personalDetails type:', typeof personalDetails);
    console.log('[applyForScheme] Raw personalDetails:', personalDetails);

    // Parse JSON strings when sent via multipart/form-data
    if (typeof personalDetails === 'string') {
      try { 
        personalDetails = JSON.parse(personalDetails);
        console.log('[applyForScheme] Parsed personalDetails:', personalDetails);
      } catch (_) {
        console.error('[applyForScheme] Failed to parse personalDetails');
      }
    }

    // Check if scheme exists and is active
    const scheme = await WelfareScheme.findById(schemeId);
    if (!scheme) {
      console.error('[applyForScheme] Scheme not found:', schemeId);
      return res.status(404).json({ 
        success: false, 
        message: 'Welfare scheme not found' 
      });
    }

    console.log('[applyForScheme] Scheme found:', scheme._id, scheme.title);

    if (scheme.status !== 'active') {
      console.error('[applyForScheme] Scheme not active:', scheme.status);
      return res.status(400).json({ 
        success: false, 
        message: 'This scheme is not currently accepting applications' 
      });
    }

    if (scheme.endDate < new Date()) {
      console.error('[applyForScheme] Deadline passed:', scheme.endDate);
      return res.status(400).json({ 
        success: false, 
        message: 'Application deadline has passed for this scheme' 
      });
    }

    if (scheme.availableSlots <= 0) {
      console.error('[applyForScheme] No slots available');
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
      console.error('[applyForScheme] User already applied');
      return res.status(400).json({ 
        success: false, 
        message: 'You have already applied for this scheme' 
      });
    }

    // Get user details
    const user = await User.findById(userId);
    if (!user) {
      console.error('[applyForScheme] User not found:', userId);
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    console.log('[applyForScheme] User found:', user.name);

    // Age validation
    if (user.dateOfBirth) {
      const today = new Date();
      const birthDate = new Date(user.dateOfBirth);
      const age = Math.floor((today - birthDate) / (365.25 * 24 * 60 * 60 * 1000));
      
      if (age < scheme.minAge || age > scheme.maxAge) {
        console.error('[applyForScheme] Age not in range:', age);
        return res.status(400).json({ 
          success: false, 
          message: `Age requirement not met. This scheme is for ages ${scheme.minAge} to ${scheme.maxAge}. Your age: ${age}` 
        });
      }
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
          console.error('[applyForScheme] Missing required document:', fieldName);
          return res.status(400).json({ success: false, message: `Missing required document: ${reqDoc.name}` });
        }
        const file = fileArr[0];
        // Optional format validation by extension
        if (Array.isArray(reqDoc.formats) && reqDoc.formats.length > 0) {
          const ext = (file.originalname.split('.').pop() || '').toLowerCase();
          const allowed = reqDoc.formats.map(x => String(x).toLowerCase());
          if (!allowed.includes(ext)) {
            console.error('[applyForScheme] Invalid file format:', ext);
            return res.status(400).json({ success: false, message: `${reqDoc.name} must be one of: ${reqDoc.formats.join(', ')}` });
          }
        }
        const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;
        uploadedDocuments.push({ name: reqDoc.name, url: fileUrl });
      }
    }

    console.log('[applyForScheme] Creating application with data:', {
      personalDetails,
      documentsCount: uploadedDocuments.length
    });

    // Create application with new simplified structure
    const application = new WelfareApplication({
      schemeId,
      schemeTitle: scheme.title,
      userId,
      userName: user.name,
      userEmail: user.email,
      userWard: user.ward,
      personalDetails: {
        // Basic Information
        address: personalDetails.address,
        phoneNumber: personalDetails.phoneNumber,
        houseNumber: personalDetails.houseNumber,
        
        // Social Information
        caste: personalDetails.caste,
        
        // Membership & Participation
        isKudumbasreeMember: personalDetails.isKudumbasreeMember || false,
        paysHarithakarmasenaFee: personalDetails.paysHarithakarmasenaFee || false,
        
        // Family Employment & Benefits
        hasFamilyMemberWithGovtJob: personalDetails.hasFamilyMemberWithGovtJob || false,
        hasDisabledPersonInHouse: personalDetails.hasDisabledPersonInHouse || false,
        hasFamilyMemberWithPension: personalDetails.hasFamilyMemberWithPension || false,
        
        // Financial Information
        totalIncome: parseInt(personalDetails.totalIncome) || 0,
        incomeCategory: personalDetails.incomeCategory,
        
        // Land Ownership
        ownsLand: personalDetails.ownsLand || false,
        landDetails: personalDetails.landDetails || { villageName: '', surveyNumber: '', area: '' },
        
        // Utilities
        drinkingWaterSource: personalDetails.drinkingWaterSource,
        hasToilet: personalDetails.hasToilet || false
      },
      documents: uploadedDocuments
    });

    console.log('[applyForScheme] Application object created:', {
      id: application._id,
      personalDetails: application.personalDetails
    });

    const savedApplication = await application.save();
    console.log('[applyForScheme] Application saved successfully:', savedApplication._id);

    // Update available slots
    scheme.availableSlots -= 1;
    await scheme.save();
    console.log('[applyForScheme] Scheme slots updated');

    console.log('[applyForScheme] Sending success response');
    res.status(201).json({
      success: true,
      message: 'Application submitted successfully',
      application: savedApplication
    });

  } catch (error) {
    console.error('[applyForScheme] Error:', error?.message || error);
    if (error?.stack) console.error(error.stack);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to submit application' 
    });
  }
}

// Removed getApplicationDetail: all details are in WelfareApplication now

// Get applications (admin sees all, councillor sees their ward applications)
async function getApplications(req, res) {
  try {
    const { id: userId, role } = req.user;
    const { schemeId, status, ward } = req.query;

    console.log('getApplications - userId:', userId, 'role:', role);
    console.log('getApplications - query params:', { schemeId, status, ward });

    let query = {};

    // Filter by scheme
    if (schemeId) {
      const mongoose = require('mongoose');
      if (mongoose.Types.ObjectId.isValid(schemeId)) {
        query.schemeId = new mongoose.Types.ObjectId(schemeId);
      } else {
        query.schemeId = schemeId;
      }
    }
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
      
      console.log('getApplications - final query:', query);
      applications = await WelfareApplication.find(query)
        .populate('schemeId', 'title scope ward')
        .populate('userId', 'name email')
        .sort({ appliedAt: -1 });
      console.log('getApplications - found applications:', applications.length);
    } else {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }

    // Normalize the applications data similar to getUserApplications
    const normalizedApplications = applications.map(d => ({
      _id: d._id,
      schemeId: ((d.schemeId && d.schemeId._id) ? d.schemeId._id : d.schemeId)?.toString?.() || String(d.schemeId || ''),
      schemeTitle: d.schemeTitle || (d.schemeId && d.schemeId.title ? d.schemeId.title : ''),
      userId: (d.userId && d.userId._id) ? d.userId._id : d.userId,
      userName: d.userName || (d.userId && d.userId.name ? d.userId.name : ''),
      userEmail: d.userEmail || (d.userId && d.userId.email ? d.userId.email : ''),
      userWard: typeof d.userWard === 'number' ? d.userWard : Number(d.userWard || 0),
      personalDetails: {
        // Basic Information
        address: d.personalDetails?.address || '',
        phoneNumber: d.personalDetails?.phoneNumber || '',
        houseNumber: d.personalDetails?.houseNumber || '',
        
        // Social Information
        caste: d.personalDetails?.caste || '',
        
        // Membership & Participation
        isKudumbasreeMember: Boolean(d.personalDetails?.isKudumbasreeMember || false),
        paysHarithakarmasenaFee: Boolean(d.personalDetails?.paysHarithakarmasenaFee || false),
        
        // Family Employment & Benefits
        hasFamilyMemberWithGovtJob: Boolean(d.personalDetails?.hasFamilyMemberWithGovtJob || false),
        hasDisabledPersonInHouse: Boolean(d.personalDetails?.hasDisabledPersonInHouse || false),
        hasFamilyMemberWithPension: Boolean(d.personalDetails?.hasFamilyMemberWithPension || false),
        
        // Financial Information
        totalIncome: Number(d.personalDetails?.totalIncome || 0),
        incomeCategory: d.personalDetails?.incomeCategory || '',
        
        // Land Ownership
        ownsLand: Boolean(d.personalDetails?.ownsLand || false),
        landDetails: d.personalDetails?.landDetails || { villageName: '', surveyNumber: '', area: '' },
        
        // Utilities
        drinkingWaterSource: d.personalDetails?.drinkingWaterSource || '',
        hasToilet: Boolean(d.personalDetails?.hasToilet || false),
        
        // Legacy fields for backward compatibility
        rationCardNumber: d.personalDetails?.rationCardNumber || '',
        aadharNumber: d.personalDetails?.aadharNumber || '',
        familyIncome: Number(d.personalDetails?.familyIncome || d.personalDetails?.totalIncome || 0),
        dependents: Number(d.personalDetails?.dependents || 0),
        isHandicapped: Boolean(d.personalDetails?.isHandicapped || d.personalDetails?.hasDisabledPersonInHouse || false),
        isSingleWoman: Boolean(d.personalDetails?.isSingleWoman || false),
      },
      documents: Array.isArray(d.documents) ? d.documents : [],
      score: typeof d.score === 'number' ? d.score : undefined,
      justification: d.justification || '',
      detailedAnalysis: d.detailedAnalysis || [],
      status: d.status || 'pending',
      verificationStatus: d.verificationStatus || 'Pending',
      appliedAt: d.appliedAt || d.createdAt || new Date(0),
      reviewedAt: d.reviewedAt || null,
      reason: d.reason || ''
    }));

    console.log('getApplications - returning applications:', normalizedApplications.length);
    res.json({
      success: true,
      applications: normalizedApplications
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
        // Basic Information
        address: d.personalDetails?.address || '',
        phoneNumber: d.personalDetails?.phoneNumber || '',
        houseNumber: d.personalDetails?.houseNumber || '',
        
        // Social Information
        caste: d.personalDetails?.caste || '',
        
        // Membership & Participation
        isKudumbasreeMember: Boolean(d.personalDetails?.isKudumbasreeMember || false),
        paysHarithakarmasenaFee: Boolean(d.personalDetails?.paysHarithakarmasenaFee || false),
        
        // Family Employment & Benefits
        hasFamilyMemberWithGovtJob: Boolean(d.personalDetails?.hasFamilyMemberWithGovtJob || false),
        hasDisabledPersonInHouse: Boolean(d.personalDetails?.hasDisabledPersonInHouse || false),
        hasFamilyMemberWithPension: Boolean(d.personalDetails?.hasFamilyMemberWithPension || false),
        
        // Financial Information
        totalIncome: Number(d.personalDetails?.totalIncome || 0),
        incomeCategory: d.personalDetails?.incomeCategory || '',
        
        // Land Ownership
        ownsLand: Boolean(d.personalDetails?.ownsLand || false),
        landDetails: d.personalDetails?.landDetails || { villageName: '', surveyNumber: '', area: '' },
        
        // Utilities
        drinkingWaterSource: d.personalDetails?.drinkingWaterSource || '',
        hasToilet: Boolean(d.personalDetails?.hasToilet || false),
        
        // Legacy fields for backward compatibility
        rationCardNumber: d.personalDetails?.rationCardNumber || '',
        aadharNumber: d.personalDetails?.aadharNumber || '',
        familyIncome: Number(d.personalDetails?.familyIncome || d.personalDetails?.totalIncome || 0),
        dependents: Number(d.personalDetails?.dependents || 0),
        isHandicapped: Boolean(d.personalDetails?.isHandicapped || d.personalDetails?.hasDisabledPersonInHouse || false),
        isSingleWoman: Boolean(d.personalDetails?.isSingleWoman || false),
      },
      documents: Array.isArray(d.documents) ? d.documents : [],
      score: typeof d.score === 'number' ? d.score : undefined,
      justification: d.justification || '',
      status: d.status || 'pending',
      verificationStatus: d.verificationStatus || 'Pending',
      reviewComments: d.reviewComments || '',
      reviewedAt: d.reviewedAt || null,
      reviewedByName: d.reviewedByName || '',
      detailedAnalysis: Array.isArray(d.detailedAnalysis) ? d.detailedAnalysis : [],
      appliedAt: d.appliedAt || d.createdAt || new Date(0),
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

      const base = (stats && stats[0]) ? stats[0] : {
        totalApplications: 0,
        pendingApplications: 0,
        approvedApplications: 0,
        rejectedApplications: 0
      };
      stats = { ...base, wardStats: wardStats || [], statusStats: statusStats || [] };

    } else if (role === 'councillor') {
      // Councillor sees stats for their ward (councillor profile lives in councillorProfiles)
      let councillorWard = null;
      try {
        const councillor = await CouncillorProfile.findById(userId);
        councillorWard = councillor?.ward ?? null;
      } catch (_) {
        councillorWard = null;
      }

      stats = await WelfareApplication.aggregate([
        ...(councillorWard !== null ? [{ $match: { userWard: councillorWard } }] : []),
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
    } else {
      // Default for other roles
      stats = {
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
    // Fail-soft with empty stats instead of 500 to avoid dashboard crashes
    res.json({
      success: true,
      stats: {
        totalApplications: 0,
        pendingApplications: 0,
        approvedApplications: 0,
        rejectedApplications: 0
      }
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
    const mlBase = process.env.ML_SERVICE_URL || 'http://localhost:8000';
    
    try {
      const mlResponse = await fetch(`${mlBase}/predict`, {
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

      // Map SHAP explanation to detailedAnalysis format
      const detailedAnalysis = Object.entries(mlResult.explanation || {}).map(([factor, impact]) => ({
        factor: factor.charAt(0).toUpperCase() + factor.slice(1),
        impact: Math.round(impact),
        type: impact > 0 ? (factor === 'income' ? 'negative' : 'positive') : (factor === 'income' ? 'positive' : 'negative'),
        description: `This factor ${impact > 0 ? 'increased' : 'decreased'} the score by ${Math.abs(Math.round(impact))} points due to its weight in the AI model.`
      }));
      application.detailedAnalysis = detailedAnalysis;

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

// Bulk score all applications for a specific scheme
async function scoreSchemeApplications(req, res) {
  try {
    const { schemeId } = req.params;
    const { role, id: userId } = req.user;

    // Verify scheme exists
    const scheme = await WelfareScheme.findById(schemeId);
    if (!scheme) {
      return res.status(404).json({ success: false, message: 'Scheme not found' });
    }

    // Check permissions
    if (role === 'councillor') {
      const reviewer = await CouncillorProfile.findById(userId);
      if (!reviewer || (scheme.scope === 'ward' && scheme.ward !== reviewer.ward)) {
        return res.status(403).json({ success: false, message: 'Not allowed to score applications for this scheme' });
      }
    } else if (role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admin or councillor can score applications' });
    }

    // Find all pending applications for this scheme (even if previously scored, so we can re-evaluate)
    const applications = await WelfareApplication.find({
      schemeId,
      status: 'pending'
    });

    if (applications.length === 0) {
      return res.json({ success: true, message: 'No pending applications found for this scheme.', count: 0 });
    }

    // Call real ML service for batch scoring
    const mlBase = process.env.ML_SERVICE_URL || 'http://localhost:8000';
    
    try {
      const payload = {
        applications: applications.map(app => app.toObject())
      };

      console.log(`[Batch Scoring] Sending ${payload.applications.length} applications to ${mlBase}/predict-batch`);

      const mlResponse = await fetch(`${mlBase}/predict-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        timeout: 30000 // Increase timeout for batch
      });

      if (!mlResponse.ok) {
        let errorText = await mlResponse.text().catch(() => 'no text');
        console.error(`ML service error: ${mlResponse.status} - ${errorText}`);
        throw new Error(`ML service error: ${mlResponse.status}`);
      }

      const mlResult = await mlResponse.json();
      
      if (!mlResult.success || !mlResult.results) {
         throw new Error(`ML service returned failure for batch`);
      }

      // Update each application in database
      let successCount = 0;
      let errorCount = 0;

      for (const result of mlResult.results) {
        if (result.error) {
          console.error(`Error scoring app ${result.applicationId}: ${result.error}`);
          errorCount++;
          continue;
        }

        // Map SHAP explanation to detailedAnalysis format
        const detailedAnalysis = Object.entries(result.explanation || {}).map(([factor, impact]) => ({
          factor: factor.charAt(0).toUpperCase() + factor.slice(1),
          impact: Math.round(impact),
          type: impact > 0 ? (factor === 'income' ? 'negative' : 'positive') : (factor === 'income' ? 'positive' : 'negative'),
          description: `This factor ${impact > 0 ? 'increased' : 'decreased'} the score by ${Math.abs(Math.round(impact))} points due to its weight in the AI model.`
        }));

        await WelfareApplication.findByIdAndUpdate(result.applicationId, {
          $set: {
            score: Math.round(result.score),
            justification: result.justification || `ML prediction ${Math.round(result.score)} (${result.priority} Priority)`,
            detailedAnalysis: detailedAnalysis
          }
        });
        successCount++;
      }

      return res.json({ 
        success: true, 
        message: `Successfully scored ${successCount} applications.`,
        count: successCount,
        errors: errorCount
      });
      
    } catch (mlError) {
      console.error('ML service batch error:', mlError);
      return res.status(500).json({ success: false, message: 'Failed to communicate with ML scoring service for batch processing.' });
    }
  } catch (error) {
    console.error('Error bulk scoring applications:', error.message || error);
    return res.status(500).json({ success: false, message: 'Failed to bulk score applications' });
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
  scoreSchemeApplications,
  manualVerifyApplication,
  autoVerifyApplication
};