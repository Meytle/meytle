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

module.exports = authMiddleware;
