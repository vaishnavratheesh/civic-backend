const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/roleAuth');
const {
  getWards,
  getPresident,
  assignCouncillor,
  assignPresident,
  removeCouncillor,
  removePresident,
  resendCredentials,
  getAuditLogs,
  testCollections,
  getUsers,
  removeUser,
  toggleUserVerification
} = require('../controllers/adminCouncillorController');

// All routes require admin role
router.use(requireAdmin);

// Ward management routes
router.get('/wards', getWards);
router.post('/councillors/assign', assignCouncillor);
router.delete('/councillors/remove/:wardNumber', removeCouncillor);

// President management routes
router.get('/president', getPresident);
router.post('/president/assign', assignPresident);
router.delete('/president/remove', removePresident);

// Credential management
router.post('/send-credentials', resendCredentials);

// Audit logs
router.get('/audit-logs', getAuditLogs);

// User management routes
router.get('/users', getUsers);
router.delete('/users/:userId', removeUser);
router.patch('/users/:userId/toggle-verification', toggleUserVerification);

// Test route to verify the endpoint exists
router.get('/test-route', (req, res) => {
  res.json({ success: true, message: 'Admin routes are working', timestamp: new Date() });
});

// Test endpoint (remove in production) - no auth required for testing
router.get('/test-collections', testCollections);

// Test admin user endpoint
router.get('/test-admin', async (req, res) => {
  try {
    const User = require('../models/User');
    const adminUsers = await User.find({ role: 'admin' }).select('name email role active isVerified approved');
    res.json({
      success: true,
      adminUsers,
      count: adminUsers.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;