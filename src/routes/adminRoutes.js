const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const auth = require('../middleware/auth');

// Middleware to check if user is admin
const adminAuth = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
  }
};

// Dashboard statistics
router.get('/admin/dashboard-stats', auth, adminAuth, adminController.getDashboardStats);

// User management routes
router.get('/admin/users', auth, adminAuth, adminController.getAllUsers);
router.get('/admin/users/:id', auth, adminAuth, adminController.getUserById);
router.put('/admin/users/:id', auth, adminAuth, adminController.updateUser);
router.delete('/admin/users/:id', auth, adminAuth, adminController.deleteUser);
router.post('/admin/users/bulk-approve', auth, adminAuth, adminController.bulkApproveUsers);

// Councillor management routes
router.get('/admin/councillors', auth, adminAuth, adminController.getCouncillors);
router.put('/admin/councillors/:id', auth, adminAuth, adminController.updateCouncillor);

// Ward-specific routes
router.get('/admin/wards/:ward/users', auth, adminAuth, adminController.getUsersByWard);

module.exports = router; 