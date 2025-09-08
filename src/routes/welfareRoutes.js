const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const welfareSchemeController = require('../controllers/welfareSchemeController');
const welfareApplicationController = require('../controllers/welfareApplicationController');

// Welfare Scheme Routes
router.post('/schemes', auth, welfareSchemeController.createScheme);
router.get('/schemes', auth, welfareSchemeController.getSchemes);
router.get('/schemes/citizens/:ward', welfareSchemeController.getSchemesForCitizens);
router.put('/schemes/:id', auth, welfareSchemeController.updateScheme);
router.delete('/schemes/:id', auth, welfareSchemeController.deleteScheme);
router.get('/schemes/stats', auth, welfareSchemeController.getSchemeStats);

// Welfare Application Routes
router.post('/schemes/:schemeId/apply', auth, welfareApplicationController.applyForScheme);
router.get('/applications', auth, welfareApplicationController.getApplications);
router.get('/applications/user', auth, welfareApplicationController.getUserApplications);
router.put('/applications/:id/review', auth, welfareApplicationController.reviewApplication);
router.get('/applications/stats', auth, welfareApplicationController.getApplicationStats);
// Removed detailed application endpoint; details are in /applications and /applications/user

module.exports = router; 