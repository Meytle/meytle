/**
 * Authorization Middleware
 * Provides reusable authorization checks to eliminate duplicate code
 */

const { pool } = require('../config/database');
const { sendUnauthorized, sendForbidden, sendNotFound, sendBadRequest, sendError } = require('../utils/responseHelpers');
const logger = require('../services/logger');

/**
 * Require specific role(s) to access a route
 * @param {string|Array<string>} roles - Required role(s)
 * @returns {Function} Express middleware
 * 
 * @example
 * router.post('/booking', requireRole('client'), createBooking);
 * router.post('/admin', requireRole(['admin']), adminAction);
 */
const requireRole = (roles) => {
  const requiredRoles = Array.isArray(roles) ? roles : [roles];
  
  return (req, res, next) => {
    if (!req.user) {
      logger.warn('Authorization: No user in request', { path: req.path });
      return sendUnauthorized(res, 'Authentication required');
    }

    const userRoles = req.user.roles || [req.user.role];
    const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));

    if (!hasRequiredRole) {
      logger.warn('Authorization: Insufficient role', {
        userId: req.user.id,
        userRoles,
        requiredRoles,
        path: req.path
      });
      return sendForbidden(res, `Access requires one of these roles: ${requiredRoles.join(', ')}`);
    }

    next();
  };
};

/**
 * Require active role to match specified role(s)
 * @param {string|Array<string>} roles - Required active role(s)
 * @returns {Function} Express middleware
 */
const requireActiveRole = (roles) => {
  const requiredRoles = Array.isArray(roles) ? roles : [roles];
  
  return (req, res, next) => {
    if (!req.user) {
      return sendUnauthorized(res, 'Authentication required');
    }

    const activeRole = req.user.activeRole || req.user.role;
    
    if (!requiredRoles.includes(activeRole)) {
      logger.warn('Authorization: Wrong active role', {
        userId: req.user.id,
        activeRole,
        requiredRoles,
        path: req.path
      });
      return sendForbidden(res, `This action requires active role: ${requiredRoles.join(' or ')}`);
    }

    next();
  };
};

/**
 * Require user to own the resource
 * @param {string} resourceType - Type of resource ('booking', 'profile', etc.)
 * @param {string} idParam - Name of the route parameter containing resource ID (default: 'id')
 * @param {string} ownerField - Database field containing owner ID (default: 'user_id')
 * @returns {Function} Express middleware
 * 
 * @example
 * router.delete('/booking/:bookingId', requireOwnership('booking', 'bookingId', 'client_id'), deleteBooking);
 */
const requireOwnership = (resourceType, idParam = 'id', ownerField = 'user_id') => {
  // Map resource types to their database tables
  const tableMap = {
    'booking': 'bookings',
    'companion_application': 'companion_applications',
    'booking_request': 'booking_requests',
    'notification': 'notifications',
    'message': 'messages'
  };

  return async (req, res, next) => {
    try {
      if (!req.user) {
        return sendUnauthorized(res, 'Authentication required');
      }

      const resourceId = req.params[idParam];
      const userId = req.user.id;

      if (!resourceId) {
        logger.warn('Authorization: Missing resource ID', {
          resourceType,
          idParam,
          path: req.path
        });
        return sendBadRequest(res, 'Resource ID is required');
      }

      const tableName = tableMap[resourceType];
      if (!tableName) {
        logger.error('Authorization: Unknown resource type', { resourceType });
        return sendError(res, 'Internal server error', 500);
      }

      // Check ownership in database
      const [rows] = await pool.execute(
        `SELECT ${ownerField} FROM ${tableName} WHERE id = ?`,
        [resourceId]
      );

      if (rows.length === 0) {
        return sendNotFound(res, `${resourceType} not found`);
      }

      const ownerId = rows[0][ownerField];
      
      if (ownerId !== userId) {
        logger.warn('Authorization: Ownership check failed', {
          userId,
          ownerId,
          resourceType,
          resourceId,
          path: req.path
        });
        return sendForbidden(res, 'You do not have permission to access this resource');
      }

      // Store resource data in request for potential use in controller
      req.resource = rows[0];
      next();
    } catch (error) {
      logger.error('Authorization: Ownership check error', {
        error: error.message,
        resourceType,
        path: req.path
      });
      return sendError(res, 'Failed to verify ownership', 500, error);
    }
  };
};

/**
 * Require booking participant (client or companion)
 * @returns {Function} Express middleware
 */
const requireBookingParticipant = () => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return sendUnauthorized(res, 'Authentication required');
      }

      const bookingId = req.params.bookingId || req.params.id;
      const userId = req.user.id;

      if (!bookingId) {
        return sendBadRequest(res, 'Booking ID is required');
      }

      // Check if user is client or companion for this booking
      const [rows] = await pool.execute(
        `SELECT client_id, companion_id FROM bookings WHERE id = ?`,
        [bookingId]
      );

      if (rows.length === 0) {
        return sendNotFound(res, 'Booking not found');
      }

      const booking = rows[0];
      const isParticipant = booking.client_id === userId || booking.companion_id === userId;

      if (!isParticipant) {
        logger.warn('Authorization: Not a booking participant', {
          userId,
          bookingId,
          path: req.path
        });
        return sendForbidden(res, 'You do not have access to this booking');
      }

      // Store booking data for use in controller
      req.booking = booking;
      next();
    } catch (error) {
      logger.error('Authorization: Booking participant check error', {
        error: error.message,
        path: req.path
      });
      return sendError(res, 'Failed to verify booking access', 500, error);
    }
  };
};

/**
 * Require companion to be approved
 * @returns {Function} Express middleware
 */
const requireCompanionApproval = () => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return sendUnauthorized(res, 'Authentication required');
      }

      const userId = req.user.id;

      // Check companion application status
      const [rows] = await pool.execute(
        `SELECT status FROM companion_applications WHERE user_id = ?`,
        [userId]
      );

      if (rows.length === 0) {
        return sendForbidden(res, 'No companion application found. Please submit an application first.');
      }

      const status = rows[0].status;

      if (status !== 'approved') {
        logger.warn('Authorization: Companion not approved', {
          userId,
          status,
          path: req.path
        });
        return sendForbidden(res, `Companion application status: ${status}. Only approved companions can access this resource.`);
      }

      next();
    } catch (error) {
      logger.error('Authorization: Companion approval check error', {
        error: error.message,
        path: req.path
      });
      return sendError(res, 'Failed to verify companion status', 500, error);
    }
  };
};

/**
 * Require either admin role OR resource ownership
 * Useful for routes where both admin and owner should have access
 * @param {string} resourceType - Type of resource
 * @param {string} idParam - Name of the route parameter containing resource ID
 * @param {string} ownerField - Database field containing owner ID
 * @returns {Function} Express middleware
 */
const requireAdminOrOwnership = (resourceType, idParam = 'id', ownerField = 'user_id') => {
  return async (req, res, next) => {
    if (!req.user) {
      return sendUnauthorized(res, 'Authentication required');
    }

    // Check if user is admin
    const userRoles = req.user.roles || [req.user.role];
    if (userRoles.includes('admin')) {
      return next();
    }

    // If not admin, check ownership
    return requireOwnership(resourceType, idParam, ownerField)(req, res, next);
  };
};

module.exports = {
  requireRole,
  requireActiveRole,
  requireOwnership,
  requireBookingParticipant,
  requireCompanionApproval,
  requireAdminOrOwnership
};

