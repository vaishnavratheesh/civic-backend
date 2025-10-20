const express = require('express');
const router = express.Router();
const { chatWithAI, getChatHistory } = require('../controllers/aiChatbotController');
const auth = require('../middleware/auth');

// AI Chatbot routes
router.post('/chatbot', auth, chatWithAI);
router.get('/chat-history', auth, getChatHistory);

module.exports = router;