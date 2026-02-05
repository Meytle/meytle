/**
 * Authentication Middleware
 * Verifies JWT tokens and protects routes
 */

const jwt = require('jsonwebtoken');
const config = require('../config/config');

const authMiddleware = (req, res, next) => {
  try {
    let token = null;

    // First, try to get token from cookie
    if (req.cookies && req.cookies.auth_token) {
      token = req.cookies.auth_token;
    }
    // Fallback to Authorization header for backwards compatibility
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.substring(7); // Remove 'Bearer ' prefix
    }

    // If no token found in either place
    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'No token provided. Please authenticate.'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, config.jwt.secret);

    // Attach user info to request
    // Support multi-role architecture with activeRole and roles array
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.activeRole || decoded.role, // Primary role for backward compatibility
      activeRole: decoded.activeRole, // Current active role in multi-role system
      roles: decoded.roles || [decoded.role] // Array of all user roles
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token. Please authenticate again.'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        message: 'Token expired. Please sign in again.'
      });
    }

    return res.status(500).json({
      status: 'error',
      message: 'Authentication error',
      error: error.message
    });
  }
};

// Optional auth middleware - doesn't fail if no token, but attaches user if present
const optionalAuthMiddleware = (req, res, next) => {
  try {
    let token = null;

    if (req.cookies && req.cookies.auth_token) {
      token = req.cookies.auth_token;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.substring(7);
    }

    if (token) {
      const decoded = jwt.verify(token, config.jwt.secret);
      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.activeRole || decoded.role,
        activeRole: decoded.activeRole,
        roles: decoded.roles || [decoded.role]
      };
    }
    // Continue even without token
    next();
  } catch (error) {
    // Token invalid/expired - continue without user
    next();
  }
};

// Middleware to require verified email for protected actions
// Use AFTER authMiddleware
const { pool } = require('../config/database');

const requireEmailVerified = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    // Check email_verified status in database
    const [rows] = await pool.query(
      'SELECT email_verified FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!rows || rows.length === 0) {
      return res.status(401).json({
        status: 'error',
        message: 'User not found'
      });
    }

    const emailVerified = rows[0].email_verified === 1;

    if (!emailVerified) {
      return res.status(403).json({
        status: 'error',
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email address to continue.'
      });
    }

    next();
  } catch (error) {
    console.error('Email verification check error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Error checking email verification status'
    });
  }
};

module.exports = authMiddleware;
module.exports.optionalAuthMiddleware = optionalAuthMiddleware;
module.exports.requireEmailVerified = requireEmailVerified;
