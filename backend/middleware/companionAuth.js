/**
 * Companion Authentication Middleware
 * Provides additional security for companion-specific operations
 */

const { pool } = require('../config/database');

/**
 * Validate that the user is an active companion
 */
const isCompanion = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    // Check if user has active companion role
    const [roles] = await pool.query(
      'SELECT role FROM user_roles WHERE user_id = ? AND role = "companion" AND is_active = TRUE',
      [userId]
    );

    if (roles.length === 0) {
      console.warn(`⚠️ Non-companion user ${userId} attempted to access companion endpoint`);
      return res.status(403).json({
        status: 'error',
        message: 'Companion role required for this action'
      });
    }

    console.log(`✅ Companion ${userId} authorized for action`);
    next();
  } catch (error) {
    console.error('Companion auth middleware error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Authorization check failed'
    });
  }
};

/**
 * Validate companion ownership for availability operations
 * Ensures companions can only modify their own data
 */
const validateCompanionOwnership = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const companionId = req.params.companionId || req.body.companion_id;

    // If companionId is '0' or 'me', it refers to the current user
    if (companionId === '0' || companionId === 'me' || !companionId) {
      // User is modifying their own data
      next();
      return;
    }

    // Check if trying to modify another companion's data
    if (parseInt(companionId) !== parseInt(userId)) {
      console.error(`🚫 User ${userId} attempted to modify companion ${companionId}'s data`);

      // Log potential security breach
      await pool.query(
        `INSERT INTO availability_audit_log
         (companion_id, action, old_data, new_data, changed_by_id, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          companionId,
          'UNAUTHORIZED_ACCESS_ATTEMPT',
          null,
          JSON.stringify({ attempted_by: userId, endpoint: req.path }),
          userId,
          req.ip || req.connection.remoteAddress,
          req.headers['user-agent'] || 'Unknown'
        ]
      ).catch(err => console.error('Failed to log security breach:', err));

      return res.status(403).json({
        status: 'error',
        message: 'You can only modify your own availability'
      });
    }

    next();
  } catch (error) {
    console.error('Ownership validation error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Ownership validation failed'
    });
  }
};

/**
 * Rate limiting for companion operations
 * Prevents rapid-fire updates that could indicate abuse
 */
const companionRateLimit = (() => {
  const requestCounts = new Map();
  const WINDOW_MS = 60000; // 1 minute
  const MAX_REQUESTS = 10; // Max 10 requests per minute

  return async (req, res, next) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    const now = Date.now();
    const userKey = `companion_${userId}`;

    if (!requestCounts.has(userKey)) {
      requestCounts.set(userKey, []);
    }

    const timestamps = requestCounts.get(userKey);

    // Remove timestamps older than the window
    const validTimestamps = timestamps.filter(t => now - t < WINDOW_MS);

    if (validTimestamps.length >= MAX_REQUESTS) {
      console.warn(`⚠️ Rate limit exceeded for companion ${userId}`);
      return res.status(429).json({
        status: 'error',
        message: 'Too many requests. Please wait a moment and try again.'
      });
    }

    validTimestamps.push(now);
    requestCounts.set(userKey, validTimestamps);

    // Clean up old entries periodically
    if (Math.random() < 0.01) { // 1% chance
      for (const [key, times] of requestCounts.entries()) {
        const valid = times.filter(t => now - t < WINDOW_MS);
        if (valid.length === 0) {
          requestCounts.delete(key);
        } else {
          requestCounts.set(key, valid);
        }
      }
    }

    next();
  };
})();

module.exports = {
  isCompanion,
  validateCompanionOwnership,
  companionRateLimit
};