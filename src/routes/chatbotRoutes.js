const express = require('express');
const router = express.Router();
const chatbotController = require('../controllers/chatbotController');
const auth = require('../middleware/auth');

// AI Chatbot endpoint
router.post('/ai/chatbot', auth, chatbotController.chatWithBot);

module.exports = router;