const Grievance = require('../models/Grievance');
const User = require('../models/User');
const { uploadImage } = require('../utils/cloudinary');
const {
  isPointInsideWard,
  getWardByPoint,
  sha256File,
  readExifCaptureTime,
  checkDuplicate,
  checkRateLimit,
  computeCredibility,
} = require('../utils/credibility');
const stringSimilarity = require('string-similarity');
const turf = require('@turf/turf');
const crypto = require('crypto');
const fs = require('fs');

// Lightweight duplicate check without creating/updating any records
const checkDuplicateQuick = async (req, res) => {
  try {
    const { description, location, title, issueType } = req.body || {};
    let loc;
    try {
      loc = typeof location === 'string' ? JSON.parse(location) : location;
    } catch (_) {
      loc = location;
    }
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
      return res.status(400).json({ message: 'Invalid or missing location (lat,lng required)' });
    }
    const userId = req.user?.id;
    const wardInfo = getWardByPoint({ lat: loc.lat, lng: loc.lng });
    const ward = wardInfo.ward;

    const since = new Date(Date.now() - (parseInt(process.env.DUP_LOOKBACK_H || '168') * 3600 * 1000));
    const candidates = await Grievance.find({
      createdAt: { $gte: since },
      ward,
      status: { $in: ['pending', 'in_progress', 'assigned', 'Pending', 'InProgress', 'Assigned'] }
    }).select('description location duplicateGroupId duplicateCount upvoters userId createdAt').lean();

    const pt = turf.point([loc.lng, loc.lat]);
    const radiusM = parseInt(process.env.DUP_RADIUS_GROUP_M || '100');
    const radiusKm = radiusM / 1000;
    let best = null;
    let bestScore = 0;
    const text = `${title || ''} ${issueType || ''} ${description || ''}`.trim().toLowerCase();
    for (const c of candidates) {
      const distKm = turf.distance(pt, turf.point([c.location.lng, c.location.lat]), { units: 'kilometers' });
      if (distKm > radiusKm) continue;
      const sim = stringSimilarity.compareTwoStrings(text, (c.description || '').toLowerCase());
      if (sim > 0.3 && sim > bestScore) { best = c; bestScore = sim; }
    }

    if (!best) return res.json({ duplicate: false, ward });

    const leaderId = best.duplicateGroupId || (best._id?.toString?.());
    const leader = await Grievance.findOne({ $or: [ { _id: leaderId }, { duplicateGroupId: leaderId } ] }).sort({ createdAt: 1 }).lean();
    const hasUpvoted = !!(leader && Array.isArray(leader.upvoters) && userId && leader.upvoters.some(id => id.toString() === userId.toString()));
    const sameUser = !!(userId && (best.userId?.toString?.() === userId.toString()));
    const upvoteCount = leader?.duplicateCount || 1;
    return res.json({ duplicate: true, groupId: leaderId, upvoteCount, sameUser, hasUpvoted, ward });
  } catch (e) {
    console.error('checkDuplicateQuick error:', e);
    return res.status(500).json({ message: 'Duplicate check failed' });
  }
};

// Create a new grievance (multipart optional). Saves attachments to Cloudinary when files present.
const createGrievance = async (req, res) => {
  try {
    const { issueType, description, location, imageURL, priorityScore, title, category } = req.body;
    const userId = req.user.id;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Rate limiting per user
    const withinLimit = await checkRateLimit({ userId });
    if (!withinLimit) {
      return res.status(429).json({ message: 'Grievance rate limit exceeded. Please try later.' });
    }

    // Collect attachments if any files uploaded, compute hashes and EXIF
    const attachments = [];
    const imageHashes = [];
    const exifTimes = [];
    if (Array.isArray(req.files) && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const fileHash = await sha256File(file.path);
          imageHashes.push(fileHash);
          const exifTime = await readExifCaptureTime(file.path);
          if (exifTime) exifTimes.push(exifTime);
          const uploadedUrl = await uploadImage(file.path);
          const fileType = file.mimetype === 'application/pdf' ? 'pdf' : 'image';
          attachments.push({ url: uploadedUrl, type: fileType });
        } catch (e) {
          // Non-blocking: continue, but log
          console.error('Attachment upload failed:', e.message);
        } finally {
          try { fs.unlinkSync(file.path); } catch (_) {}
        }
      }
    }

    // Normalize issueType to schema enum to avoid validation errors
    const ALLOWED_TYPES = ['Road Repair', 'Streetlight Outage', 'Waste Management', 'Water Leakage', 'Public Nuisance', 'Drainage', 'Other'];
    function inferIssueTypeFromText(text) {
      const t = (text || '').toLowerCase();
      if (/(pothole|road|tarmac|asphalt)/.test(t)) return 'Road Repair';
      if (/(garbage|waste|trash|dump)/.test(t)) return 'Waste Management';
      if (/(water|leak|pipe|sewage|drainage)/.test(t)) return 'Water Leakage';
      if (/(drain|sewer)/.test(t)) return 'Drainage';
      if (/(streetlight|light|lamp|electric)/.test(t)) return 'Streetlight Outage';
      if (/(nuisance|noise|public)/.test(t)) return 'Public Nuisance';
      return 'Other';
    }
    const preferredText = `${issueType || ''} ${title || ''} ${description || ''}`.trim();
    let normalizedIssueType = ALLOWED_TYPES.includes(issueType) ? issueType : inferIssueTypeFromText(preferredText);

    // Geo validation
    let loc;
    try {
      loc = typeof location === 'string' ? JSON.parse(location) : location;
    } catch (e) {
      return res.status(400).json({ message: 'Invalid location payload' });
    }
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
      return res.status(400).json({ message: 'Invalid or missing location (lat,lng required)' });
    }
    // Determine actual ward by point; fall back to user's ward
    const detected = getWardByPoint({ lat: loc.lat, lng: loc.lng });
    const actualWard = detected.ward || user.ward;
    const { inside } = isPointInsideWard({ lat: loc.lat, lng: loc.lng, ward: actualWard });

    // Duplicate detection windows
    const possibleDuplicate = await checkDuplicate({
      description,
      lat: loc.lat,
      lng: loc.lng,
      hashes: imageHashes,
      radiusMeters: parseInt(process.env.DUP_RADIUS_M || '200'),
      lookbackHours: parseInt(process.env.DUP_LOOKBACK_H || '72'),
    });

    // Duplicate grouping (non-error). Find an existing open grievance close by with similar text or image hash
    let duplicateGroupId = null;
    let duplicateOf = null;
    try {
      const since = new Date(Date.now() - (parseInt(process.env.DUP_LOOKBACK_H || '168') * 3600 * 1000)); // 7 days
      const candidates = await Grievance.find({
        createdAt: { $gte: since },
        ward: actualWard,
        status: { $in: ['pending', 'in_progress', 'assigned', 'Pending', 'InProgress', 'Assigned'] }
      }).select('description location imageHashes duplicateGroupId duplicateCount status userId').lean();
      
      console.log(`[DUPLICATE CHECK] Found ${candidates.length} candidates in ward ${actualWard} since ${since.toISOString()}`);
      
      const pt = turf.point([loc.lng, loc.lat]);
      const radiusM = parseInt(process.env.DUP_RADIUS_GROUP_M || '100'); // Increased to 100m
      const radiusKm = radiusM / 1000;
      let best = null;
      let bestScore = 0;
      
      for (const c of candidates) {
        const distKm = turf.distance(pt, turf.point([c.location.lng, c.location.lat]), { units: 'kilometers' });
        if (distKm > radiusKm) continue;
        
        const sim = stringSimilarity.compareTwoStrings((description||'').toLowerCase(), (c.description||'').toLowerCase());
        const imageMatch = Array.isArray(c.imageHashes) && imageHashes.some(h => c.imageHashes.includes(h));
        const score = Math.max(sim, imageMatch ? 1 : 0);
        
        console.log(`[DUPLICATE CHECK] Candidate ${c._id}: dist=${(distKm*1000).toFixed(1)}m, sim=${sim.toFixed(3)}, score=${score.toFixed(3)}`);
        
        if (score > 0.3 && score > bestScore) { 
          best = c; 
          bestScore = score; 
        }
      }
      
      if (best) {
        duplicateOf = best;
        duplicateGroupId = best.duplicateGroupId || (best._id?.toString?.() || null);
        console.log(`[DUPLICATE CHECK] Found duplicate: ${duplicateGroupId} with score ${bestScore.toFixed(3)}`);
      } else {
        console.log(`[DUPLICATE CHECK] No duplicate found`);
      }
    } catch (e) {
      console.error('[DUPLICATE CHECK] Error:', e.message);
    }

    // If a duplicate exists, enforce per-user restriction and upvote logic without creating new document
    if (duplicateGroupId && duplicateOf) {
      console.log(`[DUPLICATE] Found duplicate group: ${duplicateGroupId} for user: ${userId}`);
      
      // Check if this user already has a grievance in this group OR already upvoted
      const existingForUser = await Grievance.findOne({
        $or: [
          { _id: duplicateGroupId, userId },
          { duplicateGroupId, userId }
        ]
      }).lean();

      // Also check upvoters on the group leader
      const groupLeader = await Grievance.findOne({ $or: [ { _id: duplicateGroupId }, { duplicateGroupId: duplicateGroupId } ] }).sort({ createdAt: 1 });
      const hasUpvoted = !!(groupLeader && Array.isArray(groupLeader.upvoters) && groupLeader.upvoters.some(id => id.toString() === userId.toString()));

      console.log(`[DUPLICATE] User ${userId} existing: ${!!existingForUser}, hasUpvoted: ${hasUpvoted}`);

      if (existingForUser || hasUpvoted) {
        console.log(`[DUPLICATE] Same user trying to submit again - returning 409`);
        return res.status(409).json({
          success: false,
          duplicate: true,
          message: 'You have already reported this issue. Please check your grievance list for status updates.',
          duplicateGroupId,
        });
      }

      console.log(`[DUPLICATE] Different user upvoting - adding to group`);

      // Add upvote: ensure unique and increment counts across group
      if (groupLeader) {
        await Grievance.updateOne(
          { _id: groupLeader._id },
          { $addToSet: { upvoters: userId, citizenIds: userId }, $inc: { upvotes: 1 } }
        );
      }
      
      // Recompute duplicateCount from unique supporters to keep it consistent across the group
      const refreshedLeader = await Grievance.findById(groupLeader?._id || duplicateGroupId).lean();
      const supporterCount = Array.isArray(refreshedLeader?.upvoters) ? refreshedLeader.upvoters.length : 0;
      const newDupCount = Math.max(1 + supporterCount, (refreshedLeader?.duplicateCount || 1));
      
      console.log(`[DUPLICATE] New supporter count: ${supporterCount}, new duplicate count: ${newDupCount}`);
      
      await Grievance.updateMany(
        { $or: [ { _id: duplicateGroupId }, { duplicateGroupId } ] },
        { $set: { duplicateCount: newDupCount } }
      );

      // Recompute priority for the group based on new duplicateCount
      const finalGroupId = duplicateGroupId;
      const docsForUpdate = await Grievance.find({ $or: [ { _id: finalGroupId }, { duplicateGroupId: finalGroupId } ] }).select('_id credibilityScore category issueType duplicateCount').lean();
      const totalDup = docsForUpdate.length ? Math.max(...docsForUpdate.map(d => d.duplicateCount || 1)) : 1;
      function getSeverityWeight(cat) {
        const map = { Flood: 40, 'Waste Management': 20, 'Water Leakage': 25, Drainage: 20, 'Road Repair': 20, 'Streetlight Outage': 15, 'Public Nuisance': 10, Other: 10 };
        return map[cat] || 10;
      }
      const newDuplicateWeight = Math.min(totalDup * 10, 30);
      for (const d of docsForUpdate) {
        const sev = getSeverityWeight(d.category || d.issueType || 'Other');
        const credW = (d.credibilityScore || 0) * 30;
        const newPriority = sev + credW + newDuplicateWeight;
        await Grievance.updateOne({ _id: d._id }, { priorityScore: newPriority });
      }

      console.log(`[DUPLICATE] Returning success response for upvote`);

      return res.status(201).json({
        success: true,
        duplicate: true,
        message: 'Thanks for reporting. This issue was already reported and your report has increased its priority.',
        duplicateGroupId,
        upvoteCount: newDupCount,
        grievance: refreshedLeader
      });
    }

    // Flags and audit
    const flags = [];
    // Old photo flag if EXIF older than 30 days
    const THIRTY_D_MS = 30 * 24 * 3600 * 1000;
    if (Array.isArray(exifTimes) && exifTimes.some(dt => (Date.now() - new Date(dt).getTime()) > THIRTY_D_MS)) {
      flags.push('old_photo');
    }
    if (possibleDuplicate) flags.push('duplicate');

    // Set primary imageURL from first attachment if available
    const primaryImageURL = attachments.length > 0 ? attachments[0].url : (imageURL || null);

    const grievance = new Grievance({
      userId,
      userName: user.name,
      ward: actualWard,
      title: title || issueType || '',
      category: category || '',
      issueType: normalizedIssueType,
      description,
      location: { lat: loc.lat, lng: loc.lng, address: (loc.address || loc.formattedAddress || 'Unknown address') },
      geo: { type: 'Point', coordinates: [loc.lng, loc.lat] },
      imageURL: primaryImageURL,
      attachments,
      priorityScore: 1,
      duplicateGroupId: duplicateGroupId,
      duplicateCount: 1,
      citizenIds: [userId],
      upvotes: 1,
      source: 'user',
      geoValid: inside,
      duplicateFlag: possibleDuplicate,
      imageHashes,
      flags,
      audit: {
        submittedAt: new Date(),
        ip: req.ip,
        device: req.headers['user-agent'] || ''
      },
    });

    // Initial credibility score (without AI/OCR yet)
    const userVerified = !!user.isVerified;
    const now = Date.now();
    const exifRecent = exifTimes.length === 0 || exifTimes.some(dt => Math.abs(now - new Date(dt).getTime()) < (7 * 24 * 3600 * 1000));
    const initialCredibility = computeCredibility({
      geoInside: inside,
      userVerified,
      uniqueImage: !possibleDuplicate,
      aiRelevant: false,
      goodHistory: true,
    });

    grievance.credibilityScore = initialCredibility;

    // Compute severity weight by category
    function getSeverityWeight(cat) {
      const map = {
        Flood: 40,
        'Waste Management': 20,
        'Water Leakage': 25,
        Drainage: 20,
        'Road Repair': 20,
        'Streetlight Outage': 15,
        'Public Nuisance': 10,
        Other: 10
      };
      return map[cat] || 10;
    }

    // If duplicate group, increment group's duplicateCount and reuse its groupId
    if (duplicateGroupId) {
      await Grievance.updateMany({ $or: [ { _id: duplicateOf._id }, { duplicateGroupId } ] }, { $inc: { duplicateCount: 1 } });
    }

    const groupIdForCalc = duplicateGroupId || grievance._id.toString();
    const groupDocs = await Grievance.find({ $or: [ { _id: groupIdForCalc }, { duplicateGroupId: groupIdForCalc } ] }).select('duplicateCount credibilityScore category issueType').lean();
    const totalDup = (groupDocs && groupDocs.length) ? Math.max(...groupDocs.map(g => g.duplicateCount || 1)) : 1;
    const severityWeight = getSeverityWeight(category || issueType || 'Other');
    const credibilityWeight = (grievance.credibilityScore || 0) * 30;
    const duplicateWeight = Math.min(totalDup * 10, 30);
    const calculatedPriority = severityWeight + credibilityWeight + duplicateWeight;
    grievance.priorityScore = calculatedPriority;

    await grievance.save();

    // After saving first doc, if no group was present, create self groupId and update
    if (!duplicateGroupId) {
      const selfGroupId = grievance._id.toString();
      await Grievance.updateOne({ _id: grievance._id }, { duplicateGroupId: selfGroupId, duplicateCount: 1 });
    }

    // Recalculate and update priority for all docs in group so councillor sees it rise
    {
      const finalGroupId = duplicateGroupId || grievance._id.toString();
      const docsForUpdate = await Grievance.find({ $or: [ { _id: finalGroupId }, { duplicateGroupId: finalGroupId } ] }).select('_id credibilityScore category issueType').lean();
      const newDuplicateWeight = Math.min(totalDup * 10, 30);
      for (const d of docsForUpdate) {
        const sev = getSeverityWeight(d.category || d.issueType || 'Other');
        const credW = (d.credibilityScore || 0) * 30;
        const newPriority = sev + credW + newDuplicateWeight;
        await Grievance.updateOne({ _id: d._id }, { priorityScore: newPriority });
      }
    }

    // Enqueue background job for OCR/AI only if Redis is configured
    if (process.env.REDIS_URL || process.env.REDIS_HOST) {
      try {
        const worker = require('../workers/grievanceWorker');
        if (worker && typeof worker.enqueue === 'function') {
          worker.enqueue(grievance._id.toString());
        }
      } catch (e) {
        console.warn('Background queue not configured or failed to init:', e.message);
      }
    }
    // Friendly duplicate acknowledgement
    if (duplicateGroupId) {
      return res.status(201).json({
        success: true,
        message: 'Thanks for reporting. This issue was already reported. Your report has strengthened the priority of this grievance.',
        duplicate: true,
        duplicateGroupId,
        grievanceId: grievance._id,
        priorityScore: grievance.priorityScore,
        grievance
      });
    }

    res.status(201).json({ success: true, message: 'Grievance submitted successfully', grievanceId: grievance._id, flags, credibilityScore: grievance.credibilityScore, grievance });
  } catch (error) {
    console.error('Error creating grievance:', error);
    res.status(500).json({ message: 'Error creating grievance', error: error.message });
  }
};

// Ward lookup by coordinates
const lookupWardByCoordinates = async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ message: 'lat and lng query params are required' });
    }
    const { ward, name } = getWardByPoint({ lat, lng });
    if (!ward) {
      return res.json({ ward: null, name: null, found: false });
    }
    return res.json({ ward, name, found: true });
  } catch (e) {
    console.error('lookupWardByCoordinates error:', e);
    res.status(500).json({ message: 'Failed to lookup ward', error: e.message });
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
      attachments: grievance.attachments || [],
      issueType: grievance.issueType,
      title: grievance.title || '',
      category: grievance.category || '',
      description: grievance.description,
      location: grievance.location,
      priorityScore: grievance.priorityScore,
      duplicateGroupId: grievance.duplicateGroupId || grievance._id?.toString?.(),
      duplicateCount: Math.max(grievance.duplicateCount || 1, Array.isArray(grievance.upvoters) ? 1 + grievance.upvoters.length : 1),
      status: grievance.status,
      assignedTo: grievance.assignedTo?._id || null,
      officerName: grievance.assignedTo?.name || grievance.officerName || null,
      source: grievance.source,
      createdAt: grievance.createdAt,
      resolvedAt: grievance.resolvedAt,
      videoProofRequests: grievance.videoProofRequests || []
    }));

    res.json({ grievances: mappedGrievances });
  } catch (error) {
    console.error('Error fetching user grievances:', error);
    res.status(500).json({ message: 'Error fetching grievances', error: error.message });
  }
};

// Get community grievances (all grievances in the panchayath)
const getCommunityGrievances = async (req, res) => {
  try {
    // Get all grievances across all wards in the panchayath
    const grievances = await Grievance.find({})
      .sort({ credibilityScore: -1, createdAt: -1 })
      .populate('assignedTo', 'name email')
      .lean();

    const mappedGrievances = grievances.map(grievance => ({
      id: grievance._id,
      userId: grievance.userId,
      userName: grievance.userName,
      ward: grievance.ward,
      imageURL: grievance.imageURL,
      attachments: grievance.attachments || [],
      issueType: grievance.issueType,
      title: grievance.title || '',
      category: grievance.category || '',
      description: grievance.description,
      location: grievance.location,
      priorityScore: grievance.priorityScore,
      duplicateGroupId: grievance.duplicateGroupId || grievance._id?.toString?.(),
      duplicateCount: Math.max(grievance.duplicateCount || 1, Array.isArray(grievance.upvoters) ? 1 + grievance.upvoters.length : 1),
      status: grievance.status,
      credibilityScore: grievance.credibilityScore,
      flags: grievance.flags || [],
      audit: grievance.audit || {},
      assignedTo: grievance.assignedTo?._id || null,
      officerName: grievance.assignedTo?.name || grievance.officerName || null,
      source: grievance.source,
      createdAt: grievance.createdAt,
      resolvedAt: grievance.resolvedAt,
      videoProofRequests: grievance.videoProofRequests || []
    }));

    res.json({ grievances: mappedGrievances });
  } catch (error) {
    console.error('Error fetching community grievances:', error);
    res.status(500).json({ message: 'Error fetching community grievances', error: error.message });
  }
};

// Get all grievances (filters)
const getAllGrievances = async (req, res) => {
  try {
    const { status, ward, page = 1, limit = 10, category, from, to } = req.query;
    const filter = {};
    
    if (status) filter.status = status;
    if (ward) filter.ward = parseInt(ward);
    if (category) filter.category = category;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const grievances = await Grievance.find(filter)
      .sort({ credibilityScore: -1, createdAt: -1 })
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
      attachments: grievance.attachments || [],
      issueType: grievance.issueType,
      title: grievance.title || '',
      category: grievance.category || '',
      description: grievance.description,
      location: grievance.location,
      priorityScore: grievance.priorityScore,
      duplicateGroupId: grievance.duplicateGroupId || grievance._id?.toString?.(),
      duplicateCount: Math.max(grievance.duplicateCount || 1, Array.isArray(grievance.upvoters) ? 1 + grievance.upvoters.length : 1),
      status: grievance.status,
      credibilityScore: grievance.credibilityScore,
      flags: grievance.flags || [],
      audit: grievance.audit || {},
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

// Get grievance by id (full details)
const getGrievanceById = async (req, res) => {
  try {
    const { id } = req.params;
    const grievance = await Grievance.findById(id)
      .populate('assignedTo', 'name email')
      .populate('userId', 'name email ward')
      .lean();
    if (!grievance) return res.status(404).json({ message: 'Grievance not found' });

    res.json({
      grievance: {
        id: grievance._id,
        userId: grievance.userId?._id || grievance.userId,
        userName: grievance.userName,
        ward: grievance.ward,
        title: grievance.title || '',
        category: grievance.category || '',
        issueType: grievance.issueType,
        description: grievance.description,
        location: grievance.location,
        imageURL: grievance.imageURL,
        attachments: grievance.attachments || [],
        ocrText: grievance.ocrText || {},
        aiClassification: grievance.aiClassification || '',
        priorityScore: grievance.priorityScore,
        status: grievance.status,
        assignedTo: grievance.assignedTo?._id || null,
        officerName: grievance.assignedTo?.name || grievance.officerName || null,
        actionHistory: grievance.actionHistory || [],
        createdAt: grievance.createdAt,
        updatedAt: grievance.updatedAt,
        resolvedAt: grievance.resolvedAt
      }
    });
  } catch (error) {
    console.error('Error fetching grievance by id:', error);
    res.status(500).json({ message: 'Error fetching grievance', error: error.message });
  }
};

// Auto-verify grievance: stub OCR, classification, and priority score
const autoVerifyGrievance = async (req, res) => {
  try {
    if (!req.user || !['ADMIN', 'COUNCILLOR', 'admin', 'councillor'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }
    const { id } = req.params;
    const grievance = await Grievance.findById(id);
    if (!grievance) return res.status(404).json({ message: 'Grievance not found' });

    // Stub OCR: one entry per attachment filename
    const ocrText = {};
    if (Array.isArray(grievance.attachments)) {
      for (const att of grievance.attachments) {
        const key = (att.url || '').split('/').pop() || 'file';
        ocrText[key] = '';
      }
    }

    // Simple classification heuristic based on description/issueType
    const text = `${grievance.issueType} ${grievance.description}`.toLowerCase();
    let aiClassification = 'General';
    let aiConfidence = 0.6;
    if (/(pothole|road|tarmac|asphalt)/.test(text)) { aiClassification = 'Road'; aiConfidence = 0.85; }
    else if (/(garbage|waste|trash|dump)/.test(text)) { aiClassification = 'Waste'; aiConfidence = 0.85; }
    else if (/(water|leak|pipe|sewage|drain|drainage)/.test(text)) { aiClassification = 'Water'; aiConfidence = 0.8; }
    else if (/(streetlight|light|electric|electricity|lamp)/.test(text)) { aiClassification = 'Electricity'; aiConfidence = 0.8; }

    // Category severity mapping
    const categorySeverityMap = {
      Road: 90,
      Waste: 80,
      Water: 95,
      Electricity: 85,
      Drainage: 88,
      General: 60
    };
    const categorySeverity = categorySeverityMap[aiClassification] || 60;

    // Historical ward weight: ratio of open grievances in the ward
    const totalInWard = await Grievance.countDocuments({ ward: grievance.ward });
    const openInWard = await Grievance.countDocuments({ ward: grievance.ward, status: { $in: ['pending', 'in_progress', 'assigned', 'Pending', 'InProgress', 'Assigned'] } });
    const historicalWardWeight = totalInWard > 0 ? (openInWard / totalInWard) * 100 : 50;

    // Final priority score
    const score = Math.round(0.4 * categorySeverity + 0.3 * (aiConfidence * 100) + 0.3 * historicalWardWeight);

    grievance.ocrText = ocrText;
    grievance.aiClassification = aiClassification;
    grievance.priorityScore = score;
    await grievance.save();

    // push action history
    await Grievance.findByIdAndUpdate(id, { $push: { actionHistory: { action: 'auto_verify', by: req.user.id, at: new Date(), remarks: `class:${aiClassification} score:${score}` } } });

    res.json({ success: true, grievance: {
      id: grievance._id,
      aiClassification: grievance.aiClassification,
      priorityScore: grievance.priorityScore,
      ocrText: grievance.ocrText
    }});
  } catch (error) {
    console.error('Error auto verifying grievance:', error);
    res.status(500).json({ message: 'Auto verification failed', error: error.message });
  }
};

// Assign grievance to worker/officer
const assignGrievance = async (req, res) => {
  try {
    if (!req.user || !['ADMIN', 'COUNCILLOR', 'admin', 'councillor'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }
    const { id } = req.params;
    const { assignedTo, remarks } = req.body;
    const officer = await User.findById(assignedTo);
    const updated = await Grievance.findByIdAndUpdate(
      id,
      { assignedTo, officerName: officer ? officer.name : undefined, status: 'assigned' },
      { new: true }
    ).populate('assignedTo', 'name email');
    if (!updated) return res.status(404).json({ message: 'Grievance not found' });
    await Grievance.findByIdAndUpdate(id, { $push: { actionHistory: { action: 'assign', by: req.user.id, at: new Date(), remarks: remarks || '' } } });
    res.json({ message: 'Grievance assigned', grievance: updated });
  } catch (error) {
    console.error('Error assigning grievance:', error);
    res.status(500).json({ message: 'Error assigning grievance', error: error.message });
  }
};

// Update grievance status (for officers/admin) and push action history
const updateGrievanceStatus = async (req, res) => {
  try {
    if (!req.user || !['ADMIN', 'COUNCILLOR', 'admin', 'councillor'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }
    const { id } = req.params;
    const { status, resolutionNotes, assignedTo, remarks } = req.body;
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

    // push action history
    const actionRecord = {
      action: `status:${status}`,
      by: userId,
      at: new Date(),
      remarks: remarks || resolutionNotes || ''
    };
    await Grievance.findByIdAndUpdate(id, { $push: { actionHistory: actionRecord } });

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

    console.log(`[STATS] Fetching stats for ward: ${ward}, filter:`, filter);

    // If no grievances exist, return empty stats
    const totalCount = await Grievance.countDocuments(filter);
    console.log(`[STATS] Total count: ${totalCount}`);
    
    if (totalCount === 0) {
      return res.json({
        total: 0,
        pending: 0,
        in_progress: 0,
        resolved: 0,
        rejected: 0
      });
    }

    const stats = await Grievance.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    console.log(`[STATS] Aggregation result:`, stats);

    const statusCounts = {
      pending: 0,
      in_progress: 0,
      resolved: 0,
      rejected: 0
    };

    // Handle both lowercase and capitalized status values
    stats.forEach(stat => {
      const status = stat._id?.toLowerCase();
      console.log(`[STATS] Processing status: ${stat._id} -> ${status}, count: ${stat.count}`);
      switch (status) {
        case 'pending':
          statusCounts.pending += stat.count;
          break;
        case 'in_progress':
        case 'inprogress':
          statusCounts.in_progress += stat.count;
          break;
        case 'resolved':
          statusCounts.resolved += stat.count;
          break;
        case 'rejected':
          statusCounts.rejected += stat.count;
          break;
        default:
          // For any other status, count as pending
          statusCounts.pending += stat.count;
          break;
      }
    });

    const total = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);

    console.log(`[STATS] Final counts:`, statusCounts, `total: ${total}`);

    res.json({
      total,
      pending: statusCounts.pending,
      in_progress: statusCounts.in_progress,
      resolved: statusCounts.resolved,
      rejected: statusCounts.rejected
    });
  } catch (error) {
    console.error('Error fetching grievance stats:', error);
    // Return default stats instead of crashing
    res.json({
      total: 0,
      pending: 0,
      in_progress: 0,
      resolved: 0,
      rejected: 0
    });
  }
};

// Duplicate definition removed to fix redeclaration error

// Get grievances for councillor review (ward-specific, sorted by credibility)
const getGrievancesForReview = async (req, res) => {
  try {
    const councillorWard = req.user.ward;
    const grievances = await Grievance.find({ ward: councillorWard })
      .sort({ credibilityScore: -1, createdAt: -1 })
      .populate('assignedTo', 'name email')
      .populate('userId', 'name email')
      .lean();

    const mappedGrievances = grievances.map(grievance => ({
      id: grievance._id,
      userId: grievance.userId,
      userName: grievance.userName,
      ward: grievance.ward,
      imageURL: grievance.imageURL,
      attachments: grievance.attachments || [],
      issueType: grievance.issueType,
      title: grievance.title || '',
      category: grievance.category || '',
      description: grievance.description,
      location: grievance.location,
      priorityScore: grievance.priorityScore,
      status: grievance.status,
      credibilityScore: grievance.credibilityScore,
      flags: grievance.flags || [],
      audit: grievance.audit || {},
      assignedTo: grievance.assignedTo?._id || null,
      officerName: grievance.assignedTo?.name || grievance.officerName || null,
      source: grievance.source,
      createdAt: grievance.createdAt,
      resolvedAt: grievance.resolvedAt
    }));

    res.json({ grievances: mappedGrievances });
  } catch (error) {
    console.error('Error fetching grievances for review:', error);
    res.status(500).json({ message: 'Error fetching grievances for review', error: error.message });
  }
};

// Helper function for severity weight calculation
function getSeverityWeight(cat) {
  const map = { 
    Flood: 40, 
    'Waste Management': 20, 
    'Water Leakage': 25, 
    Drainage: 20, 
    'Road Repair': 20, 
    'Streetlight Outage': 15, 
    'Public Nuisance': 10, 
    Other: 10 
  };
  return map[cat] || 10;
}

// Community upvote endpoint
const upvoteGrievance = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    console.log(`[UPVOTE] User ${userId} attempting to upvote grievance ${id}`);
    
    const grievance = await Grievance.findById(id);
    if (!grievance) {
      console.log(`[UPVOTE] Grievance ${id} not found`);
      return res.status(404).json({ message: 'Grievance not found' });
    }

    // Determine the group leader document (first doc in group)
    const groupId = grievance.duplicateGroupId || grievance._id.toString();
    const groupLeader = await Grievance.findOne({ $or: [ { _id: groupId }, { duplicateGroupId: groupId } ] }).sort({ createdAt: 1 });
    const leaderId = groupLeader ? groupLeader._id : grievance._id;

    // Check if user already upvoted on the leader
    const hasUpvoted = Array.isArray(groupLeader?.upvoters) && groupLeader.upvoters.some(upvoterId => upvoterId.toString() === userId.toString());
    console.log(`[UPVOTE] User ${userId} has already upvoted (group ${groupId}): ${hasUpvoted}`);
    if (hasUpvoted) {
      return res.status(400).json({ message: 'You have already upvoted this grievance' });
    }

    // Add upvote on leader and track unique supporters
    await Grievance.updateOne(
      { _id: leaderId },
      { $addToSet: { upvoters: userId, citizenIds: userId }, $inc: { upvotes: 1 } }
    );

    // Recompute duplicateCount from unique supporters; set across entire group
    const refreshedLeader = await Grievance.findById(leaderId).lean();
    const supporterCount = Array.isArray(refreshedLeader?.upvoters) ? refreshedLeader.upvoters.length : 0;
    const newDupCount = Math.max(1 + supporterCount, (refreshedLeader?.duplicateCount || 1));

    await Grievance.updateMany(
      { $or: [ { _id: leaderId }, { duplicateGroupId: groupId } ] },
      { $set: { duplicateCount: newDupCount } }
    );

    // Recalculate and persist priority for all docs in the group
    const docsForUpdate = await Grievance.find({ $or: [ { _id: leaderId }, { duplicateGroupId: groupId } ] }).select('_id credibilityScore category issueType').lean();
    const duplicateWeight = Math.min(newDupCount * 10, 30);
    for (const d of docsForUpdate) {
      const sev = getSeverityWeight(d.category || d.issueType || 'Other');
      const credW = (d.credibilityScore || 0) * 30;
      const newPriority = sev + credW + duplicateWeight;
      await Grievance.updateOne({ _id: d._id }, { priorityScore: newPriority });
    }

    console.log(`[UPVOTE] Upvoted group ${groupId}. Upvotes(now supporters+1): ${newDupCount}, propagated to group`);

    res.json({
      success: true,
      message: 'Grievance upvoted successfully',
      upvoteCount: newDupCount,
      priorityScore: undefined
    });
  } catch (error) {
    console.error('Error upvoting grievance:', error);
    res.status(500).json({ message: 'Error upvoting grievance', error: error.message });
  }
};

// Request video proof from citizen
const requestVideoProof = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const requesterId = req.user.id;
    const requesterName = req.user.name;

    // Check if user has permission (councillor or admin)
    if (!['councillor', 'admin', 'COUNCILLOR', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only councillors and admins can request video proof' });
    }

    const grievance = await Grievance.findById(id);
    if (!grievance) {
      return res.status(404).json({ message: 'Grievance not found' });
    }

    // Check if there's already a pending request from this user
    const existingRequest = grievance.videoProofRequests?.find(
      req => req.requestedBy.toString() === requesterId.toString() && req.status === 'pending'
    );

    if (existingRequest) {
      return res.status(400).json({ message: 'You already have a pending video proof request for this grievance' });
    }

    // Add video proof request
    const mongoose = require('mongoose');
    const videoProofRequest = {
      _id: new mongoose.Types.ObjectId(),
      requestedBy: requesterId,
      requestedByName: requesterName,
      requestedAt: new Date(),
      message: message || 'Please provide additional video evidence for this complaint.',
      status: 'pending'
    };

    console.log('Creating video proof request:', videoProofRequest);
    
    const updateResult = await Grievance.findByIdAndUpdate(id, {
      $push: { 
        videoProofRequests: videoProofRequest,
        actionHistory: {
          action: 'video_proof_requested',
          by: requesterId,
          at: new Date(),
          remarks: `Video proof requested: ${message || 'Additional evidence needed'}`
        }
      }
    }, { new: true });

    console.log('Update result:', updateResult ? 'Success' : 'Failed');
    console.log('Updated video requests:', updateResult?.videoProofRequests);

    res.json({
      success: true,
      message: 'Video proof request sent to citizen successfully',
      requestId: videoProofRequest._id.toString()
    });
  } catch (error) {
    console.error('Error requesting video proof:', error);
    res.status(500).json({ message: 'Error requesting video proof', error: error.message });
  }
};

// Upload video proof by citizen
const uploadVideoProof = async (req, res) => {
  try {
    const { id } = req.params;
    const { requestId } = req.body;
    const userId = req.user.id;

    const grievance = await Grievance.findById(id);
    if (!grievance) {
      return res.status(404).json({ message: 'Grievance not found' });
    }

    // Check if user is the original complainant
    if (grievance.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Only the original complainant can upload video proof' });
    }

    console.log('=== VIDEO UPLOAD DEBUG ===');
    console.log('Grievance ID:', id);
    console.log('Request ID:', requestId);
    console.log('User ID:', userId);
    console.log('Grievance found:', !!grievance);
    console.log('Video requests array:', grievance.videoProofRequests);
    console.log('Video requests length:', grievance.videoProofRequests?.length || 0);

    // Check if videoProofRequests exists and has items
    if (!grievance.videoProofRequests || grievance.videoProofRequests.length === 0) {
      console.log('No video proof requests found for this grievance');
      return res.status(404).json({ 
        message: 'No video proof requests found for this grievance',
        debug: {
          grievanceId: id,
          hasVideoRequests: !!grievance.videoProofRequests,
          requestCount: grievance.videoProofRequests?.length || 0
        }
      });
    }

    // Find the specific video proof request
    let requestIndex = -1;
    for (let i = 0; i < grievance.videoProofRequests.length; i++) {
      const req = grievance.videoProofRequests[i];
      console.log(`Request ${i}:`, {
        id: req._id?.toString(),
        status: req.status,
        requestedBy: req.requestedBy?.toString(),
        requestedByName: req.requestedByName
      });
      
      if (req._id?.toString() === requestId && req.status === 'pending') {
        requestIndex = i;
        console.log('Found matching request at index:', i);
        break;
      }
    }

    if (requestIndex === -1) {
      console.log('Request not found or not pending');
      return res.status(404).json({ 
        message: 'Video proof request not found or already completed',
        debug: {
          requestId,
          availableRequests: grievance.videoProofRequests.map(r => ({ 
            id: r._id?.toString(), 
            status: r.status,
            requestedBy: r.requestedByName 
          }))
        }
      });
    }

    // Handle video upload
    let videoUrl = null;
    if (req.file) {
      try {
        console.log('Processing video file:', req.file.originalname, 'Size:', req.file.size, 'Type:', req.file.mimetype);
        const { uploadVideo } = require('../utils/cloudinary');
        console.log('Starting Cloudinary upload...');
        videoUrl = await uploadVideo(req.file.path);
        console.log('Cloudinary upload successful:', videoUrl);
        
        // Clean up uploaded file
        const fs = require('fs');
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      } catch (uploadError) {
        console.error('Video upload failed:', uploadError);
        console.error('Upload error stack:', uploadError.stack);
        return res.status(500).json({ 
          message: 'Failed to upload video', 
          error: uploadError.message,
          details: uploadError.stack 
        });
      }
    } else {
      console.log('No file received in request');
      return res.status(400).json({ message: 'No video file provided' });
    }

    // Update the specific request
    const updateQuery = {};
    updateQuery[`videoProofRequests.${requestIndex}.status`] = 'uploaded';
    updateQuery[`videoProofRequests.${requestIndex}.videoUrl`] = videoUrl;
    updateQuery[`videoProofRequests.${requestIndex}.uploadedAt`] = new Date();

    await Grievance.findByIdAndUpdate(id, {
      $set: updateQuery,
      $push: {
        actionHistory: {
          action: 'video_proof_uploaded',
          by: userId,
          at: new Date(),
          remarks: 'Video proof uploaded by citizen'
        }
      }
    });

    res.json({
      success: true,
      message: 'Video proof uploaded successfully',
      videoUrl
    });
  } catch (error) {
    console.error('Error uploading video proof:', error);
    res.status(500).json({ message: 'Error uploading video proof', error: error.message });
  }
};

// Test endpoint to check video proof requests
const testVideoProofRequests = async (req, res) => {
  try {
    const { grievanceId } = req.params;
    const grievance = await Grievance.findById(grievanceId);
    
    if (!grievance) {
      return res.status(404).json({ message: 'Grievance not found' });
    }

    console.log('Test endpoint - Grievance:', grievanceId);
    console.log('Video requests:', grievance.videoProofRequests);

    res.json({
      success: true,
      grievanceId: grievance._id,
      videoProofRequests: grievance.videoProofRequests || [],
      requestCount: (grievance.videoProofRequests || []).length,
      grievanceData: {
        userId: grievance.userId,
        userName: grievance.userName,
        issueType: grievance.issueType,
        description: grievance.description
      }
    });
  } catch (error) {
    console.error('Error testing video proof requests:', error);
    res.status(500).json({ message: 'Error testing video proof requests', error: error.message });
  }
};

// Get video proof requests for current user (citizen)
const getMyVideoProofRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    // Find all grievances where this user is the complainant and has video proof requests
    const grievances = await Grievance.find({
      userId: userId,
      'videoProofRequests.0': { $exists: true }
    }).select('_id issueType description videoProofRequests createdAt').lean();

    const requests = [];
    for (const grievance of grievances) {
      for (const request of grievance.videoProofRequests || []) {
        requests.push({
          id: request._id,
          grievanceId: grievance._id,
          grievanceIssueType: grievance.issueType,
          grievanceDescription: grievance.description,
          requestedBy: request.requestedByName,
          requestedAt: request.requestedAt,
          message: request.message,
          status: request.status,
          videoUrl: request.videoUrl,
          uploadedAt: request.uploadedAt,
          rejectionReason: request.rejectionReason
        });
      }
    }

    // Sort by most recent first
    requests.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());

    res.json({
      success: true,
      requests
    });
  } catch (error) {
    console.error('Error fetching video proof requests:', error);
    res.status(500).json({ message: 'Error fetching video proof requests', error: error.message });
  }
};

module.exports = {
  createGrievance,
  checkDuplicateQuick,
  lookupWardByCoordinates,
  getMyGrievances,
  getCommunityGrievances,
  getAllGrievances,
  updateGrievanceStatus,
  getGrievanceStats,
  getGrievanceById,
  autoVerifyGrievance,
  assignGrievance,
  getGrievancesForReview,
  upvoteGrievance,
  requestVideoProof,
  uploadVideoProof,
  getMyVideoProofRequests,
  testVideoProofRequests
};


