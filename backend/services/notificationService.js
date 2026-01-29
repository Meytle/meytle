/**
 * Notification Service
 * Handles creation, retrieval, and management of user notifications
 */

const { pool } = require('../config/database');
const logger = require('./logger');
const { formatDateTime, formatDate, formatTime } = require('../utils/dateHelpers');
const { emitNotification } = require('../config/socket');

/**
 * Create a new notification for a user
 */
const createNotification = async (userId, type, title, message, actionUrl = null) => {
  try {
    const [result] = await pool.execute(
      `INSERT INTO notifications (user_id, type, title, message, action_url)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, type, title, message, actionUrl]
    );

    // Fetch the actual created_at from database to ensure consistency
    const [[inserted]] = await pool.execute(
      `SELECT created_at FROM notifications WHERE id = ?`,
      [result.insertId]
    );

    const notification = {
      id: result.insertId,
      userId,
      type,
      title,
      message,
      actionUrl,
      isRead: false,
      createdAt: inserted?.created_at ? new Date(inserted.created_at).toISOString() : new Date().toISOString()
    };

    logger.apiInfo('notificationService', 'createNotification', 'Notification created', { userId, title });

    // Emit real-time notification via Socket.io
    try {
      emitNotification(userId, notification);
    } catch (socketError) {
      // Don't fail the notification creation if socket emission fails
      logger.apiError('notificationService', 'createNotification', socketError, {
        userId,
        context: 'Socket emission failed but notification was saved'
      });
    }

    return notification;
  } catch (error) {
    logger.apiError('notificationService', 'createNotification', error, { userId, type, title });
    throw error;
  }
};

/**
 * Get notifications for a user
 */
const getNotifications = async (userId, limit = 20, offset = 0, unreadOnly = false) => {
  try {
    let query = `
      SELECT id, user_id, type, title, message, action_url, is_read, read_at, created_at
      FROM notifications
      WHERE user_id = ?
    `;

    const params = [userId];

    if (unreadOnly) {
      query += ' AND is_read = FALSE';
    }

    // Validate limit and offset to prevent SQL injection
    const safeLimit = Math.floor(Math.max(1, Math.min(parseInt(limit) || 20, 100)));
    const safeOffset = Math.floor(Math.max(0, parseInt(offset) || 0));

    // Use direct interpolation for LIMIT/OFFSET (safe because values are validated integers)
    query += ` ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;

    const [notifications] = await pool.execute(query, params);

    return notifications;
  } catch (error) {
    logger.apiError('notificationService', 'getNotifications', error, { userId, limit, offset });
    throw error;
  }
};

/**
 * Get unread notification count for a user
 */
const getUnreadCount = async (userId) => {
  try {
    const [result] = await pool.execute(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE',
      [userId]
    );

    return result[0].count;
  } catch (error) {
    logger.apiError('notificationService', 'getUnreadCount', error, { userId });
    throw error;
  }
};

/**
 * Mark a notification as read
 */
const markAsRead = async (notificationId, userId) => {
  try {
    const [result] = await pool.execute(
      'UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE id = ? AND user_id = ?',
      [notificationId, userId]
    );

    if (result.affectedRows === 0) {
      throw new Error('Notification not found or unauthorized');
    }

    logger.apiInfo('notificationService', 'markAsRead', 'Notification marked as read', { notificationId, userId });
    return true;
  } catch (error) {
    logger.apiError('notificationService', 'markAsRead', error, { notificationId, userId });
    throw error;
  }
};

/**
 * Mark all notifications as read for a user
 */
const markAllAsRead = async (userId) => {
  try {
    const [result] = await pool.execute(
      'UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE user_id = ? AND is_read = FALSE',
      [userId]
    );

    logger.apiInfo('notificationService', 'markAllAsRead', `Marked ${result.affectedRows} notifications as read`, { userId, count: result.affectedRows });
    return result.affectedRows;
  } catch (error) {
    logger.apiError('notificationService', 'markAllAsRead', error, { userId });
    throw error;
  }
};

/**
 * Delete a notification
 */
const deleteNotification = async (notificationId, userId) => {
  try {
    const [result] = await pool.execute(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?',
      [notificationId, userId]
    );

    if (result.affectedRows === 0) {
      throw new Error('Notification not found or unauthorized');
    }

    logger.apiInfo('notificationService', 'deleteNotification', 'Notification deleted', { notificationId, userId });
    return true;
  } catch (error) {
    logger.apiError('notificationService', 'deleteNotification', error, { notificationId, userId });
    throw error;
  }
};

/**
 * Delete old notifications (cleanup job)
 */
const deleteOldNotifications = async (daysOld = 30) => {
  try {
    const [result] = await pool.execute(
      'DELETE FROM notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY) AND is_read = TRUE',
      [daysOld]
    );

    logger.apiInfo('notificationService', 'deleteOldNotifications', `Deleted ${result.affectedRows} old notifications`, { daysOld, count: result.affectedRows });
    return result.affectedRows;
  } catch (error) {
    logger.apiError('notificationService', 'deleteOldNotifications', error, { daysOld });
    throw error;
  }
};

/**
 * Get user notification preferences
 */
const getUserPreferences = async (userId) => {
  try {
    const [preferences] = await pool.execute(
      'SELECT * FROM notification_preferences WHERE user_id = ?',
      [userId]
    );

    // If no preferences exist, create default ones
    if (preferences.length === 0) {
      await pool.execute(
        'INSERT INTO notification_preferences (user_id) VALUES (?)',
        [userId]
      );

      const [newPreferences] = await pool.execute(
        'SELECT * FROM notification_preferences WHERE user_id = ?',
        [userId]
      );

      return newPreferences[0];
    }

    return preferences[0];
  } catch (error) {
    logger.apiError('notificationService', 'getUserPreferences', error, { userId });
    throw error;
  }
};

/**
 * Update user notification preferences
 */
const updateUserPreferences = async (userId, preferences) => {
  try {
    const {
      email_enabled,
      push_enabled,
      booking_notifications,
      payment_notifications,
      marketing_notifications
    } = preferences;

    const [result] = await pool.execute(
      `UPDATE notification_preferences
       SET email_enabled = ?, push_enabled = ?, booking_notifications = ?,
           payment_notifications = ?, marketing_notifications = ?
       WHERE user_id = ?`,
      [
        email_enabled,
        push_enabled,
        booking_notifications,
        payment_notifications,
        marketing_notifications,
        userId
      ]
    );

    if (result.affectedRows === 0) {
      // Create preferences if they don't exist
      await pool.execute(
        `INSERT INTO notification_preferences
         (user_id, email_enabled, push_enabled, booking_notifications,
          payment_notifications, marketing_notifications)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userId,
          email_enabled,
          push_enabled,
          booking_notifications,
          payment_notifications,
          marketing_notifications
        ]
      );
    }

    logger.apiInfo('notificationService', 'updateUserPreferences', 'Updated notification preferences', { userId });
    return true;
  } catch (error) {
    logger.apiError('notificationService', 'updateUserPreferences', error, { userId });
    throw error;
  }
};

/**
 * Create notification templates for common events
 */
const notificationTemplates = {
  // Booking notifications
  bookingCreated: (clientName, bookingDate, startTime) => {
    const formattedDateTime = formatDateTime(bookingDate, startTime);
    // Never include raw "Invalid Date" in the final message
    const base = `You have a new booking request from ${clientName}`;
    const message = formattedDateTime === 'Invalid Date/Time'
      ? `${base}. Please review and confirm.`
      : `${base} for ${formattedDateTime}. Please review and confirm.`;
    return {
      type: 'booking',
      title: 'New Booking Request',
      message,
      actionUrl: '/companion-dashboard'
    };
  },

  bookingConfirmed: (companionName) => ({
    type: 'booking',
    title: 'Booking Confirmed',
    message: `Your booking with ${companionName} has been confirmed!`,
    actionUrl: '/client-dashboard'
  }),

  bookingRejected: (companionName) => ({
    type: 'booking',
    title: 'Booking Declined',
    message: `Unfortunately, your booking with ${companionName} was declined.`,
    actionUrl: '/client-dashboard'
  }),

  bookingCancelled: (userName, role) => ({
    type: 'booking',
    title: 'Booking Cancelled',
    message: `Your booking with ${userName} has been cancelled by the ${role}.`,
    actionUrl: role === 'client' ? '/companion-dashboard' : '/client-dashboard'
  }),

  bookingReminder: (companionName, date, time) => {
    const formattedTime = formatTime(time);
    return {
      type: 'booking',
      title: 'Booking Reminder',
      message: formattedTime === 'Invalid Time'
        ? `Don't forget! You have a booking with ${companionName} tomorrow.`
        : `Don't forget! You have a booking with ${companionName} tomorrow at ${formattedTime}.`,
      actionUrl: '/client-dashboard'
    };
  },

  bookingRequest: (clientName, requestedDate) => {
    const formattedDate = formatDate(requestedDate);
    const base = `You have a new custom time booking request from ${clientName}`;
    const message = formattedDate === 'Invalid Date'
      ? `${base}. Please review the request.`
      : `${base} for ${formattedDate}. Please review the request.`;
    return {
      type: 'booking',
      title: 'New Custom Time Request',
      message,
      actionUrl: '/companion-dashboard'
    };
  },

  bookingRequestAccepted: (bookingId, companionId) => ({
    type: 'booking',
    title: 'Custom Time Request Accepted!',
    message: 'Your custom time request has been accepted! A booking has been created.',
    actionUrl: '/client-dashboard'
  }),

  bookingRequestRejected: (requestId, companionId) => ({
    type: 'booking',
    title: 'Custom Time Request Declined',
    message: 'Unfortunately, your custom time request was declined. Try another time or companion.',
    actionUrl: '/browse-companions'
  }),

  // Application notifications
  applicationApproved: () => ({
    type: 'application',
    title: 'Application Approved!',
    message: 'Congratulations! Your companion application has been approved. You can now start accepting bookings.',
    actionUrl: '/companion-dashboard'
  }),

  applicationRejected: (reason) => ({
    type: 'application',
    title: 'Application Update',
    message: `Your companion application needs attention: ${reason}`,
    actionUrl: '/companion-profile'
  }),

  // Payment notifications
  paymentReceived: (amount, clientName) => ({
    type: 'payment',
    title: 'Payment Received',
    message: `You've received a payment of $${amount} from ${clientName}.`,
    actionUrl: '/companion-dashboard'
  }),

  paymentFailed: () => ({
    type: 'payment',
    title: 'Payment Failed',
    message: 'There was an issue processing your payment. Please update your payment method.',
    actionUrl: '/client-dashboard'
  }),

  // Account notifications
  welcomeMessage: (userName, role = 'client') => ({
    type: 'account',
    title: 'Welcome to Meytle!',
    message: `Hi ${userName}! Welcome to Meytle. Complete your profile to get started.`,
    actionUrl: role === 'companion' ? '/companion-profile' : '/client-profile'
  }),

  profileIncomplete: (role = 'client') => ({
    type: 'account',
    title: 'Complete Your Profile',
    message: 'Your profile is incomplete. Complete it to unlock all features.',
    actionUrl: role === 'companion' ? '/companion-profile' : '/client-profile'
  }),

  // System notifications
  systemMaintenance: (date, time) => {
    const formattedDate = formatDate(date);
    const formattedTime = formatTime(time);
    const hasValidDate = formattedDate !== 'Invalid Date' && formattedTime !== 'Invalid Time';

    return {
      type: 'system',
      title: 'Scheduled Maintenance',
      message: hasValidDate
        ? `System maintenance scheduled for ${formattedDate} at ${formattedTime}. The platform may be temporarily unavailable.`
        : 'System maintenance scheduled. The platform may be temporarily unavailable.',
      actionUrl: null
    };
  }
};

/**
 * Helper: Send booking created notification to companion
 * @param {Object} companion - Companion object with id, name
 * @param {Object} booking - Booking object with clientName, bookingDate, startTime
 */
const sendBookingCreatedNotification = async (companion, booking) => {
  try {
    // Check if companion wants booking notifications
    const [prefs] = await pool.execute(
      'SELECT booking_notifications FROM notification_preferences WHERE user_id = ?',
      [companion.id]
    );

    const shouldNotify = prefs.length === 0 || prefs[0].booking_notifications;

    if (shouldNotify) {
      const notificationData = notificationTemplates.bookingCreated(
        booking.clientName,
        booking.bookingDate,
        booking.startTime
      );
      
      await createNotification(
        companion.id,
        notificationData.type,
        notificationData.title,
        notificationData.message,
        notificationData.actionUrl
      );
      
      logger.apiInfo('notificationService', 'sendBookingCreatedNotification', 'Sent booking created notification', { 
        companionId: companion.id 
      });
    }
  } catch (error) {
    logger.apiError('notificationService', 'sendBookingCreatedNotification', error, { 
      companionId: companion.id 
    });
    // Don't throw - notifications should not block booking operations
  }
};

/**
 * Helper: Send booking status notification
 * @param {Object} user - User object with id
 * @param {Object} booking - Booking object
 * @param {string} status - New status ('confirmed', 'cancelled', 'completed', 'no_show')
 * @param {Object} options - Additional options (reason, cancelledBy)
 */
const sendBookingStatusNotification = async (user, booking, status, options = {}) => {
  try {
    let notificationData;

    switch (status) {
      case 'confirmed':
        notificationData = notificationTemplates.bookingConfirmed(booking.companionName);
        break;
      
      case 'cancelled':
        const { reason, cancelledBy } = options;
        let message = `Your booking with ${booking.companionName || booking.clientName} has been cancelled`;
        if (reason) {
          message += `. Reason: ${reason}`;
        }
        notificationData = {
          type: 'booking',
          title: 'Booking Cancelled',
          message,
          actionUrl: cancelledBy === 'client' ? '/companion-dashboard' : '/client-dashboard'
        };
        break;
      
      case 'completed':
        notificationData = {
          type: 'booking',
          title: 'Booking Completed',
          message: `Your booking with ${booking.companionName} has been completed`,
          actionUrl: '/client-dashboard'
        };
        break;
      
      case 'no_show':
        notificationData = {
          type: 'booking',
          title: 'Booking No-Show',
          message: `Your booking with ${booking.companionName} was marked as no-show`,
          actionUrl: '/client-dashboard'
        };
        break;
      
      default:
        logger.warn('Unknown booking status for notification', { status });
        return;
    }

    await createNotification(
      user.id,
      notificationData.type,
      notificationData.title,
      notificationData.message,
      notificationData.actionUrl
    );
    
    logger.apiInfo('notificationService', 'sendBookingStatusNotification', 'Sent booking status notification', { 
      userId: user.id,
      status
    });
  } catch (error) {
    logger.apiError('notificationService', 'sendBookingStatusNotification', error, { 
      userId: user.id,
      status
    });
    // Don't throw - notifications should not block booking operations
  }
};

/**
 * Helper: Send booking request notification to companion
 * @param {Object} companion - Companion object with id
 * @param {Object} request - Request object with clientName, requestedDate
 */
const sendBookingRequestNotification = async (companion, request) => {
  try {
    const notificationData = notificationTemplates.bookingRequest(
      request.clientName,
      request.requestedDate
    );
    
    await createNotification(
      companion.id,
      notificationData.type,
      notificationData.title,
      notificationData.message,
      notificationData.actionUrl
    );
    
    logger.apiInfo('notificationService', 'sendBookingRequestNotification', 'Sent booking request notification', { 
      companionId: companion.id 
    });
  } catch (error) {
    logger.apiError('notificationService', 'sendBookingRequestNotification', error, { 
      companionId: companion.id 
    });
    // Don't throw - notifications should not block booking operations
  }
};

module.exports = {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteOldNotifications,
  getUserPreferences,
  updateUserPreferences,
  notificationTemplates,
  // Helper methods
  sendBookingCreatedNotification,
  sendBookingStatusNotification,
  sendBookingRequestNotification
};