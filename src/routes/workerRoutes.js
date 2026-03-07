const express = require('express');
const router = express.Router();
const workerController = require('../controllers/workerController');
const auth = require('../middleware/auth');

// All routes require authentication
router.use(auth);

// Get workers (with filters)
router.get('/', workerController.getWorkers);

// Get worker statistics
router.get('/stats', workerController.getWorkerStats);

// Get worker by ID
router.get('/:id', workerController.getWorkerById);

// Create new worker
router.post('/', workerController.createWorker);

// Update worker
router.put('/:id', workerController.updateWorker);

// Delete worker (soft delete)
router.delete('/:id', workerController.deleteWorker);

module.exports = router;
