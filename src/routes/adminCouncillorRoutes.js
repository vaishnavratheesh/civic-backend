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
  testCollections
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

// Test endpoint (remove in production) - no auth required for testing
router.get('/test-collections', testCollections);

module.exports = router;