/**
 * Admin Authentication Middleware
 * Validates that the authenticated user has admin role
 */

/**
 * Middleware to check if user has admin role
 * Must be used AFTER the standard auth middleware
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next middleware function
 */
const adminAuth = (req, res, next) => {
  try {
    // Check if user is authenticated (should have been set by auth middleware)
    if (!req.user) {
      console.warn('⚠️  Admin access attempted without authentication');
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required. Please log in first.'
      });
    }

    // Check if user has admin role
    // Support both multi-role (roles array) and single role (role/activeRole)
    const userRoles = req.user.roles || [];
    const activeRole = req.user.activeRole || req.user.role;

    // Check both the roles array and activeRole for admin access
    const isAdmin = userRoles.includes('admin') || activeRole === 'admin';

    if (!isAdmin) {
      console.warn(`⚠️  Admin access denied for user ${req.user.email || req.user.id} with roles: ${userRoles.join(', ') || activeRole}`);
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. Admin privileges required.'
      });
    }

    // Log successful admin access for audit trail
    console.log(`✅ Admin access granted for user ${req.user.email || req.user.id} (ID: ${req.user.id})`);

    // User is admin, proceed to next middleware/route handler
    next();
  } catch (error) {
    console.error('❌ Error in admin authentication middleware:', error);
    res.status(500).json({
      status: 'error',
      message: 'Server error during authorization check'
    });
  }
};

/**
 * Middleware to optionally check for admin role
 * Adds isAdmin flag to request but doesn't block non-admins
 * Useful for routes that have different behavior for admins
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next middleware function
 */
const checkAdminRole = (req, res, next) => {
  try {
    if (!req.user) {
      req.isAdmin = false;
    } else {
      const userRoles = req.user.roles || [];
      const activeRole = req.user.activeRole || req.user.role;
      req.isAdmin = userRoles.includes('admin') || activeRole === 'admin';
    }
    next();
  } catch (error) {
    console.error('❌ Error checking admin role:', error);
    req.isAdmin = false;
    next();
  }
};

// Export both as default (for backward compatibility) and as named exports
module.exports = adminAuth;
module.exports.adminAuth = adminAuth;
module.exports.checkAdminRole = checkAdminRole;






















