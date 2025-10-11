const mongoose = require('mongoose');
const User = require('../models/User');
const CouncillorProfile = require('../models/CouncillorProfile');
const Grievance = require('../models/Grievance');
const WelfareScheme = require('../models/WelfareScheme');
const WelfareApplication = require('../models/WelfareApplication');
const Announcement = require('../models/Announcement');
const Event = require('../models/Event');
const Message = require('../models/Message');

// Helpers
const isPresident = (req) => req.user && req.user.role === 'president';

// 1) Ward overview
exports.getWardsOverview = async (req, res) => {
  try {
    if (!isPresident(req)) {
      return res.status(403).json({ success: false, message: 'Access denied. President role required.' });
    }

    // Build councillor map from CouncillorProfile
    const councillorDocs = await CouncillorProfile.find({}).select('_id name email ward').lean();
    const wardToCouncillor = councillorDocs.reduce((acc, c) => { acc[c.ward] = c; return acc; }, {});

    // Complaints per ward
    const complaints = await Grievance.aggregate([
      { $group: { _id: '$ward', totalComplaints: { $sum: 1 } } }
    ]);
    const wardToComplaints = complaints.reduce((acc, c) => { acc[c._id] = c.totalComplaints; return acc; }, {});

    // Population per ward from Users
    const usersAgg = await User.aggregate([
      { $group: { _id: '$ward', totalUsers: { $sum: 1 } } }
    ]);
    const wardToPopulation = usersAgg.reduce((acc, u) => { acc[u._id] = u.totalUsers; return acc; }, {});

    // Ensure 1..23 wards returned in order
    const wards = Array.from({ length: 23 }, (_, i) => i + 1).map((w) => {
      const c = wardToCouncillor[w];
      return {
        ward: w,
        councillor: c ? { id: c._id, name: c.name, email: c.email } : null,
        population: wardToPopulation[w] || 0,
        totalComplaints: wardToComplaints[w] || 0
      };
    });

    res.json({ success: true, wards });
  } catch (error) {
    console.error('getWardsOverview error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch wards overview' });
  }
};

// 2) Welfare statistics
exports.getWelfareStats = async (req, res) => {
  try {
    if (!isPresident(req)) {
      return res.status(403).json({ success: false, message: 'Access denied. President role required.' });
    }

    const totalSchemes = await WelfareScheme.countDocuments({});
    const applications = await WelfareApplication.aggregate([
      { $group: { _id: '$schemeId', applicants: { $sum: 1 }, approved: { $sum: { $cond: [{ $eq: ['$status', 'Approved'] }, 1, 0] } }, rejected: { $sum: { $cond: [{ $eq: ['$status', 'Rejected'] }, 1, 0] } } } }
    ]);
    const schemeMap = await WelfareScheme.find({}).select('_id title category').lean();
    const schemeIdToMeta = schemeMap.reduce((acc, s) => { acc[s._id.toString()] = s; return acc; }, {});

    const details = applications.map(a => ({
      schemeId: a._id,
      schemeTitle: schemeIdToMeta[a._id]?.title || 'Unknown',
      category: schemeIdToMeta[a._id]?.category || 'General',
      applicants: a.applicants,
      approved: a.approved,
      rejected: a.rejected
    }));

    // Distribution by category
    const distribution = details.reduce((acc, d) => { acc[d.category] = (acc[d.category] || 0) + 1; return acc; }, {});
    const totalApplicants = details.reduce((s, d) => s + d.applicants, 0);
    const totalApproved = details.reduce((s, d) => s + d.approved, 0);
    const approvalRate = totalApplicants ? (totalApproved / totalApplicants) : 0;

    res.json({ success: true, totalSchemes, approvalRate, distribution, details });
  } catch (error) {
    console.error('getWelfareStats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch welfare stats' });
  }
};

// 3) Announcements CRUD
exports.listAnnouncements = async (req, res) => {
  try {
    // Optional audience filter (?audience=citizens|councillors|all)
    const { audience } = req.query;
    const filter = audience && ['citizens','councillors','all'].includes(String(audience))
      ? { $or: [ { audience: 'all' }, { audience: audience } ] }
      : {};
    const items = await Announcement.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to list announcements' });
  }
};

exports.createAnnouncement = async (req, res) => {
  try {
    if (!isPresident(req)) {
      return res.status(403).json({ success: false, message: 'Access denied. President role required.' });
    }
    const { title, description, audience } = req.body;
    const doc = await Announcement.create({ title, description, audience, createdBy: req.user.id, createdByRole: 'president' });
    try { req.app.get('io')?.emit('announcement:new', { item: doc }); } catch {}
    res.status(201).json({ success: true, item: doc });
  } catch (e) {
    res.status(400).json({ success: false, message: 'Failed to create announcement' });
  }
};

exports.deleteAnnouncement = async (req, res) => {
  try {
    if (!isPresident(req)) {
      return res.status(403).json({ success: false, message: 'Access denied. President role required.' });
    }
    await Announcement.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, message: 'Failed to delete announcement' });
  }
};

// 4) Events CRUD
exports.listEvents = async (req, res) => {
  try {
    const now = new Date();
    const { audience } = req.query;
    const base = { time: { $gte: now } };
    const filter = audience && ['citizens','councillors','all'].includes(String(audience))
      ? { ...base, $or: [ { audience: 'all' }, { audience: audience } ] }
      : base;
    const items = await Event.find(filter).sort({ time: 1 }).lean();
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to list events' });
  }
};

exports.createEvent = async (req, res) => {
  try {
    if (!isPresident(req)) {
      return res.status(403).json({ success: false, message: 'Access denied. President role required.' });
    }
    const { title, description, time, location, audience } = req.body;
    const doc = await Event.create({ title, description, time, location, audience, createdBy: req.user.id, createdByRole: 'president' });
    try { req.app.get('io')?.emit('event:new', { item: doc }); } catch {}
    res.status(201).json({ success: true, item: doc });
  } catch (e) {
    res.status(400).json({ success: false, message: 'Failed to create event' });
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    if (!isPresident(req)) {
      return res.status(403).json({ success: false, message: 'Access denied. President role required.' });
    }
    await Event.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, message: 'Failed to delete event' });
  }
};

// 5) Messages (chat: president <-> councillors)
exports.listMessages = async (req, res) => {
  try {
    if (!isPresident(req)) {
      return res.status(403).json({ success: false, message: 'Access denied. President role required.' });
    }
    const { ward, threadId } = req.query;
    let filter = {};
    
    if (threadId) {
      filter.threadId = threadId;
    } else if (ward) {
      filter.ward = parseInt(ward);
    } else {
      // Get all messages where president is sender or receiver
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
    if (!isPresident(req)) {
      return res.status(403).json({ success: false, message: 'Access denied. President role required.' });
    }
    const { receiverId, ward, message, threadId, broadcast } = req.body;
    
    // Generate threadId if not provided
    const finalThreadId = threadId || `president-${ward || 'general'}-${Date.now()}`;
    
    let doc = await Message.create({ 
      senderId: req.user.id, 
      receiverId: receiverId || null, 
      ward: ward || null, 
      message,
      threadId: finalThreadId
    });
    // populate sender to avoid nulls on client
    doc = await doc.populate('senderId receiverId', 'name email role ward');
    
    // Emit real-time message to Socket.IO
    try {
      const io = req.app.get('io');
      if (io) {
        if (broadcast) {
          io.to('councillors').emit('message:new', { message: doc, threadId: finalThreadId, ward: null, broadcast: true });
        } else {
          if (ward) io.to(`ward:${ward}`).emit('message:new', { message: doc, threadId: finalThreadId, ward });
          if (receiverId) io.to(`user:${receiverId}`).emit('message:new', { message: doc, threadId: finalThreadId, ward });
        }
      }
    } catch (socketError) {
      console.log('Socket emit failed:', socketError.message);
    }
    
    res.status(201).json({ success: true, item: doc });
  } catch (e) {
    res.status(400).json({ success: false, message: 'Failed to send message' });
  }
};

// Send FILE message
exports.sendFileMessage = async (req, res) => {
  try {
    if (!isPresident(req)) {
      return res.status(403).json({ success: false, message: 'Access denied. President role required.' });
    }
    const { receiverId, ward, threadId, broadcast } = req.body;
    if (!req.file) return res.status(400).json({ success: false, message: 'File is required' });

    const finalThreadId = threadId || `president-${ward || 'general'}-${Date.now()}`;
    let doc = await Message.create({
      senderId: req.user.id,
      receiverId: receiverId || null,
      ward: ward || null,
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
        if (broadcast) {
          io.to('councillors').emit('message:new', { message: doc, threadId: finalThreadId, ward: null, broadcast: true });
        } else {
          if (ward) io.to(`ward:${ward}`).emit('message:new', { message: doc, threadId: finalThreadId, ward });
          if (receiverId) io.to(`user:${receiverId}`).emit('message:new', { message: doc, threadId: finalThreadId, ward });
        }
      }
    } catch {}

    res.status(201).json({ success: true, item: doc });
  } catch (e) {
    res.status(400).json({ success: false, message: 'Failed to send file' });
  }
};

// Get conversations list (threads)
exports.getConversations = async (req, res) => {
  try {
    if (!isPresident(req)) {
      return res.status(403).json({ success: false, message: 'Access denied. President role required.' });
    }
    
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

// 6) Video meeting link (Jitsi suggested)

const Meeting = require('../models/Meeting');
exports.createMeeting = async (req, res) => {
  try {
    if (!isPresident(req)) {
      return res.status(403).json({ success: false, message: 'Access denied. President role required.' });
    }
    // Create a simple Jitsi room name; in production, secure this properly
    const room = `Erumeli-ESabha-${Date.now()}`;
    const url = `https://meet.jit.si/${room}`;
    // Save to DB for others to join
    await Meeting.create({ url, room });
    res.json({ success: true, url, room });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to create meeting' });
  }
};

