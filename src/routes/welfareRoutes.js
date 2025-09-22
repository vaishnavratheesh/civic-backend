const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const welfareSchemeController = require('../controllers/welfareSchemeController');
const welfareApplicationController = require('../controllers/welfareApplicationController');
const upload = require('../middleware/upload');

// Welfare Scheme Routes
router.post('/schemes', auth, welfareSchemeController.createScheme);
router.get('/schemes', auth, welfareSchemeController.getSchemes);
router.get('/schemes/:id', welfareSchemeController.getScheme);
router.get('/schemes/citizens/:ward', welfareSchemeController.getSchemesForCitizens);
router.put('/schemes/:id', auth, welfareSchemeController.updateScheme);
router.delete('/schemes/:id', auth, welfareSchemeController.deleteScheme);
router.get('/schemes/stats', auth, welfareSchemeController.getSchemeStats);

// Welfare Application Routes
// Accept multiple files for application; field names will be dynamic. Use .any() to accept all.
router.post('/schemes/:schemeId/apply', auth, upload.any(), welfareApplicationController.applyForScheme);
router.get('/applications', auth, welfareApplicationController.getApplications);
// IMPORTANT: define the more specific route before the param route
router.get('/applications/user', auth, welfareApplicationController.getUserApplications);
router.get('/applications/:id', auth, welfareApplicationController.getApplication);
router.put('/applications/:id/review', auth, welfareApplicationController.reviewApplication);
router.post('/applications/:id/score', auth, welfareApplicationController.scoreApplication);
router.put('/applications/:id/manual-verify', auth, welfareApplicationController.manualVerifyApplication);
router.put('/applications/:id/auto-verify', auth, welfareApplicationController.autoVerifyApplication);
router.get('/applications/stats', auth, welfareApplicationController.getApplicationStats);
// Removed detailed application endpoint; details are in /applications and /applications/user

module.exports = router; 