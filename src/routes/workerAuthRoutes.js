const express = require('express');
const router = express.Router();
const workerAuthController = require('../controllers/workerAuthController');
const workerRegistrationController = require('../controllers/workerRegistrationController');
const workerTaskController = require('../controllers/workerTaskController');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

// Public routes - Registration
router.post('/register', workerRegistrationController.registerWorker);
router.post('/verify-otp', workerRegistrationController.verifyWorkerOTP);
router.post('/resend-otp', workerRegistrationController.resendWorkerOTP);

// Public routes - Login
router.post('/auth/login', workerRegistrationController.loginWorker);

// Protected routes (require worker authentication)
router.use(auth);

// Profile management
router.get('/profile', workerAuthController.getWorkerProfile);
router.put('/profile', workerAuthController.updateWorkerProfile);
router.post('/profile/id-proof', upload.single('idProof'), workerAuthController.uploadIdProof);
router.post('/profile/verification-document', upload.single('document'), workerRegistrationController.uploadVerificationDocument);
router.put('/profile/change-password', workerAuthController.changePassword);

// Task management
router.get('/tasks', workerTaskController.getMyTasks);
router.get('/ward-complaints', workerTaskController.getWardComplaints);
router.get('/tasks/stats', workerTaskController.getWorkerStats);
router.get('/tasks/:taskId', workerTaskController.getTaskById);
router.post('/tasks/:taskId/accept', workerTaskController.acceptTask);
router.post('/tasks/:taskId/self-assign', workerTaskController.selfAssignTask);
router.post('/tasks/:taskId/reject', workerTaskController.rejectTask);
router.put('/tasks/:taskId/status', workerTaskController.updateTaskStatus);
router.post('/tasks/:taskId/complete', upload.array('photos', 5), workerTaskController.completeTask);
router.post('/tasks/:taskId/upload-photo', upload.single('photo'), workerTaskController.uploadProgressPhoto);

module.exports = router;
