/**
 * Notification Controller
 * Handles HTTP requests for notification operations
 */

const notificationService = require('../services/notificationService');
const { transformToFrontend, transformArrayToFrontend } = require('../utils/transformer');
const logger = require('../services/logger');

/**
 * Get notifications for the authenticated user
 */
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20, offset = 0, unreadOnly = false } = req.query;

    const notifications = await notificationService.getNotifications(
      userId,
      parseInt(limit),
      parseInt(offset),
      unreadOnly === 'true'
    );

    res.status(200).json({
      status: 'success',
      data: transformToFrontend({
        notifications: transformArrayToFrontend(notifications),
        count: notifications.length
      })
    });
  } catch (error) {
    logger.controllerError('notificationController', 'getNotifications', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch notifications'
    });
  }
};

/**
 * Get unread notification count
 */
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;
    const count = await notificationService.getUnreadCount(userId);

    res.status(200).json({
      status: 'success',
      data: {
        unreadCount: count
      }
    });
  } catch (error) {
    logger.controllerError('notificationController', 'getUnreadCount', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get unread count'
    });
  }
};

/**
 * Mark a notification as read
 */
const markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    await notificationService.markAsRead(parseInt(id), userId);

    res.status(200).json({
      status: 'success',
      message: 'Notification marked as read'
    });
  } catch (error) {
    logger.controllerError('notificationController', 'markAsRead', error, req);

    if (error.message === 'Notification not found or unauthorized') {
      return res.status(404).json({
        status: 'error',
        message: 'Notification not found'
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Failed to mark notification as read'
    });
  }
};

/**
 * Mark all notifications as read
 */
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const count = await notificationService.markAllAsRead(userId);

    res.status(200).json({
      status: 'success',
      message: `${count} notifications marked as read`,
      data: {
        markedCount: count
      }
    });
  } catch (error) {
    logger.controllerError('notificationController', 'markAllAsRead', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to mark notifications as read'
    });
  }
};

/**
 * Delete a notification
 */
const deleteNotification = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    await notificationService.deleteNotification(parseInt(id), userId);

    res.status(200).json({
      status: 'success',
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    logger.controllerError('notificationController', 'deleteNotification', error, req);

    if (error.message === 'Notification not found or unauthorized') {
      return res.status(404).json({
        status: 'error',
        message: 'Notification not found'
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Failed to delete notification'
    });
  }
};

/**
 * Get notification preferences
 */
const getPreferences = async (req, res) => {
  try {
    const userId = req.user.id;
    const preferences = await notificationService.getUserPreferences(userId);

    res.status(200).json({
      status: 'success',
      data: transformToFrontend({
        preferences
      })
    });
  } catch (error) {
    logger.controllerError('notificationController', 'getPreferences', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch notification preferences'
    });
  }
};

/**
 * Update notification preferences
 */
const updatePreferences = async (req, res) => {
  try {
    const userId = req.user.id;
    const preferences = req.body;

    // Validate preferences object
    const validKeys = [
      'email_enabled',
      'push_enabled',
      'booking_notifications',
      'payment_notifications',
      'marketing_notifications'
    ];

    const filteredPreferences = {};
    for (const key of validKeys) {
      if (key in preferences) {
        filteredPreferences[key] = Boolean(preferences[key]);
      }
    }

    await notificationService.updateUserPreferences(userId, filteredPreferences);

    res.status(200).json({
      status: 'success',
      message: 'Notification preferences updated successfully'
    });
  } catch (error) {
    logger.controllerError('notificationController', 'updatePreferences', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update notification preferences'
    });
  }
};

/**
 * Create a test notification (for development)
 */
const createTestNotification = async (req, res) => {
  try {
    // Only allow in development mode
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        status: 'error',
        message: 'Test notifications not allowed in production'
      });
    }

    const userId = req.user.id;
    const { type = 'system', title, message, actionUrl } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        status: 'error',
        message: 'Title and message are required'
      });
    }

    const notification = await notificationService.createNotification(
      userId,
      type,
      title,
      message,
      actionUrl
    );

    res.status(201).json({
      status: 'success',
      message: 'Test notification created',
      data: {
        notification
      }
    });
  } catch (error) {
    logger.controllerError('notificationController', 'createTestNotification', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create test notification'
    });
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getPreferences,
  updatePreferences,
  createTestNotification
};