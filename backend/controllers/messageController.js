/**
 * Message Controller
 * Handles chat messaging between clients and companions for confirmed bookings
 */

const { pool } = require('../config/database');
const logger = require('../services/logger');
const { filterMessage, getBlockedReasonMessage } = require('../utils/contentFilter');
const { transformToFrontend, transformArrayToFrontend } = require('../utils/transformer');
const { emitNewMessage, emitMessageRead, emitUnreadCountUpdate } = require('../config/socket');

/**
 * Send a message
 * Only allowed for confirmed bookings between the client and companion
 */
const sendMessage = async (req, res) => {
  try {
    const senderId = req.user.id;
    const { bookingId, messageText } = req.body;

    // Validate input
    if (!bookingId || !messageText) {
      return res.status(400).json({
        status: 'error',
        message: 'Booking ID and message text are required'
      });
    }

    if (messageText.trim().length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Message cannot be empty'
      });
    }

    if (messageText.length > 1000) {
      return res.status(400).json({
        status: 'error',
        message: 'Message is too long (maximum 1000 characters)'
      });
    }

    // Check if booking exists and user is part of it
    const [bookings] = await pool.execute(
      `SELECT client_id, companion_id, status, booking_date, start_time, end_time
       FROM bookings 
       WHERE id = ?`,
      [bookingId]
    );

    if (bookings.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found'
      });
    }

    const booking = bookings[0];

    // Verify user is either the client or companion
    const isClient = booking.client_id === senderId;
    const isCompanion = booking.companion_id === senderId;

    if (!isClient && !isCompanion) {
      return res.status(403).json({
        status: 'error',
        message: 'You are not authorized to send messages for this booking'
      });
    }

    // Only allow messaging for confirmed bookings
    if (booking.status !== 'confirmed') {
      return res.status(400).json({
        status: 'error',
        message: 'Messages can only be sent for confirmed bookings'
      });
    }

    // Check if chat is available (3 hours before meeting until meeting ends)
    // booking_date is DATE type from MySQL (YYYY-MM-DD string), times are in UTC
    const bookingDateStr = booking.booking_date instanceof Date
      ? `${booking.booking_date.getFullYear()}-${String(booking.booking_date.getMonth() + 1).padStart(2, '0')}-${String(booking.booking_date.getDate()).padStart(2, '0')}`
      : booking.booking_date;
    const meetingStartDateTime = new Date(`${bookingDateStr}T${booking.start_time}Z`); // Z = UTC
    const meetingEndDateTime = new Date(`${bookingDateStr}T${booking.end_time}Z`);
    const threeHoursBefore = new Date(meetingStartDateTime.getTime() - 3 * 60 * 60 * 1000);
    const now = new Date();

    // Check if meeting has already ended
    if (now > meetingEndDateTime) {
      return res.status(403).json({
        status: 'error',
        message: 'Meeting has ended. Chat is no longer available.',
        meetingEnded: meetingEndDateTime.toISOString()
      });
    }

    // Check if too early (more than 3 hours before meeting)
    if (now < threeHoursBefore) {
      return res.status(403).json({
        status: 'error',
        message: 'Chat will be available 3 hours before your meeting',
        availableAt: threeHoursBefore.toISOString(),
        meetingTime: meetingStartDateTime.toISOString()
      });
    }

    // Determine receiver
    const receiverId = isClient ? booking.companion_id : booking.client_id;

    // Filter message content
    const filterResult = filterMessage(messageText);

    if (!filterResult.isClean) {
      // Log the violation
      logger.controllerWarning('messageController', 'sendMessage', 'Blocked message with violations', {
        senderId,
        bookingId,
        violations: filterResult.violations,
        messageLength: messageText.length
      });

      // Store the flagged message in database for admin review
      await pool.execute(
        `INSERT INTO messages 
         (booking_id, sender_id, receiver_id, message_text, is_flagged, flagged_reason)
         VALUES (?, ?, ?, ?, TRUE, ?)`,
        [bookingId, senderId, receiverId, messageText, filterResult.violations.join(', ')]
      );

      return res.status(400).json({
        status: 'error',
        message: getBlockedReasonMessage(filterResult.violations),
        violations: filterResult.violations
      });
    }

    // Save clean message
    const [result] = await pool.execute(
      `INSERT INTO messages 
       (booking_id, sender_id, receiver_id, message_text)
       VALUES (?, ?, ?, ?)`,
      [bookingId, senderId, receiverId, messageText]
    );

    const messageId = result.insertId;

    // Get full message data with timestamp
    const [messages] = await pool.execute(
      `SELECT id, booking_id, sender_id, receiver_id, message_text, created_at, read_at
       FROM messages
       WHERE id = ?`,
      [messageId]
    );

    const messageData = transformToFrontend(messages[0]);

    // Emit real-time event to BOTH sender and receiver via Socket.io
    try {
      emitNewMessage(receiverId, messageData);
      emitNewMessage(senderId, messageData); // ✅ FIX: Emit to sender too for instant UI update
    } catch (socketError) {
      logger.controllerWarning('messageController', 'sendMessage', 'Socket emit failed (non-blocking)', {
        error: socketError.message,
        receiverId,
        senderId
      });
      // Don't fail the request if socket emit fails
    }

    logger.controllerInfo('messageController', 'sendMessage', 'Message sent successfully', {
      messageId,
      bookingId,
      senderId
    });

    res.json({
      status: 'success',
      message: 'Message sent successfully',
      messageId,
      data: messageData // Include message data in response
    });
  } catch (error) {
    logger.controllerError('messageController', 'sendMessage', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to send message',
      error: error.message
    });
  }
};

/**
 * Get messages for a booking
 * Only returns non-flagged messages
 */
const getMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { bookingId } = req.params;

    // Check if booking exists and user is part of it
    const [bookings] = await pool.execute(
      `SELECT client_id, companion_id, status, booking_date, start_time, end_time
       FROM bookings 
       WHERE id = ?`,
      [bookingId]
    );

    if (bookings.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found'
      });
    }

    const booking = bookings[0];

    // Verify user is either the client or companion
    if (booking.client_id !== userId && booking.companion_id !== userId) {
      return res.status(403).json({
        status: 'error',
        message: 'You are not authorized to view messages for this booking'
      });
    }

    // Check if chat is available (3 hours before meeting until meeting ends) for confirmed bookings
    if (booking.status === 'confirmed') {
      // booking_date is DATE type from MySQL (YYYY-MM-DD string), times are in UTC
      const bookingDateStr = booking.booking_date instanceof Date
        ? `${booking.booking_date.getFullYear()}-${String(booking.booking_date.getMonth() + 1).padStart(2, '0')}-${String(booking.booking_date.getDate()).padStart(2, '0')}`
        : booking.booking_date;
      const meetingStartDateTime = new Date(`${bookingDateStr}T${booking.start_time}Z`); // Z = UTC
      const meetingEndDateTime = new Date(`${bookingDateStr}T${booking.end_time}Z`);
      const threeHoursBefore = new Date(meetingStartDateTime.getTime() - 3 * 60 * 60 * 1000);
      const now = new Date();

      // Check if meeting has already ended
      if (now > meetingEndDateTime) {
        return res.status(403).json({
          status: 'error',
          message: 'Meeting has ended. Chat is no longer available.',
          meetingEnded: meetingEndDateTime.toISOString()
        });
      }

      // Check if too early (more than 3 hours before meeting)
      if (now < threeHoursBefore) {
        return res.status(403).json({
          status: 'error',
          message: 'Chat will be available 3 hours before your meeting',
          availableAt: threeHoursBefore.toISOString(),
          meetingTime: meetingStartDateTime.toISOString()
        });
      }
    }

    // Get messages (exclude flagged messages from display)
    const [messages] = await pool.execute(
      `SELECT 
        id,
        booking_id,
        sender_id,
        receiver_id,
        message_text,
        created_at,
        read_at
       FROM messages
       WHERE booking_id = ? AND is_flagged = FALSE
       ORDER BY created_at ASC`,
      [bookingId]
    );

    // Transform to camelCase for frontend
    const transformedMessages = transformArrayToFrontend(messages);

    // Mark messages as read if user is the receiver
    const messagesToMarkRead = messages.filter(
      m => m.receiver_id === userId && m.read_at === null
    );

    if (messagesToMarkRead.length > 0) {
      const messageIdsToMarkRead = messagesToMarkRead.map(m => m.id);
      
      await pool.execute(
        `UPDATE messages 
         SET read_at = NOW() 
         WHERE id IN (${messageIdsToMarkRead.map(() => '?').join(',')})`,
        messageIdsToMarkRead
      );

      // Emit socket events to notify senders that their messages were read
      try {
        for (const message of messagesToMarkRead) {
          emitMessageRead(message.sender_id, {
            id: message.id,
            bookingId: message.booking_id,
            readAt: new Date().toISOString()
          });
        }
        logger.controllerInfo('messageController', 'getMessages', 'Read receipts sent', {
          count: messagesToMarkRead.length,
          bookingId
        });
      } catch (socketError) {
        logger.controllerWarning('messageController', 'getMessages', 'Socket emit failed (non-blocking)', {
          error: socketError.message
        });
      }

      // Get updated unread count and emit to the receiver (this user)
      // Count messages from bookings where chat is/was accessible (not cancelled/rejected)
      try {
        const [unreadResult] = await pool.execute(
          `SELECT COUNT(*) as unread_count
           FROM messages m
           JOIN bookings b ON m.booking_id = b.id
           WHERE m.receiver_id = ?
             AND m.read_at IS NULL
             AND m.is_flagged = FALSE
             AND b.status NOT IN ('cancelled', 'no_show', 'pending', 'payment_pending')`,
          [userId]
        );
        const newUnreadCount = unreadResult[0].unread_count;
        emitUnreadCountUpdate(userId, newUnreadCount);
      } catch (countError) {
        logger.controllerWarning('messageController', 'getMessages', 'Failed to emit unread count update', {
          error: countError.message
        });
      }
    }

    res.json({
      status: 'success',
      messages: transformedMessages
    });
  } catch (error) {
    logger.controllerError('messageController', 'getMessages', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch messages',
      error: error.message
    });
  }
};

/**
 * Get unread message count for user
 * Counts messages from bookings where chat is/was accessible (not cancelled/rejected)
 */
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;

    // Count unread messages from bookings where chat is/was accessible
    // Excludes cancelled, no_show, pending, payment_pending bookings where chat was never available
    // Using NOT IN to be inclusive of any intermediate statuses (e.g., meeting_started)
    const [result] = await pool.execute(
      `SELECT COUNT(*) as unread_count
       FROM messages m
       JOIN bookings b ON m.booking_id = b.id
       WHERE m.receiver_id = ?
         AND m.read_at IS NULL
         AND m.is_flagged = FALSE
         AND b.status NOT IN ('cancelled', 'no_show', 'pending', 'payment_pending')`,
      [userId]
    );

    res.json({
      status: 'success',
      unreadCount: result[0].unread_count
    });
  } catch (error) {
    logger.controllerError('messageController', 'getUnreadCount', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get unread count',
      error: error.message
    });
  }
};

module.exports = {
  sendMessage,
  getMessages,
  getUnreadCount
};

