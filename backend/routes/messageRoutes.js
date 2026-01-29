/**
 * Message Routes
 * Handles messaging between clients and companions
 */

const express = require('express');
const {
  sendMessage,
  getMessages,
  getUnreadCount
} = require('../controllers/messageController');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Send a message
router.post('/send', sendMessage);

// Get unread message count (MUST be before /:bookingId to avoid route collision)
router.get('/unread/count', getUnreadCount);

// Get messages for a booking
router.get('/:bookingId', getMessages);

module.exports = router;

