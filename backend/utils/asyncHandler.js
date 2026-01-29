/**
 * Async Handler Wrapper
 * Eliminates try-catch boilerplate in async route handlers
 * Automatically catches errors and passes them to error handling middleware
 */

const logger = require('../services/logger');

/**
 * Wraps async route handlers to catch errors automatically
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Express middleware function
 * 
 * @example
 * router.get('/users', asyncHandler(async (req, res) => {
 *   const users = await User.findAll();
 *   res.json(users);
 * }));
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      // Log the error with request context
      logger.error('Async handler caught error', {
        method: req.method,
        path: req.path,
        userId: req.user?.id,
        error: error.message,
        stack: error.stack
      });
      
      // Pass error to error handling middleware
      next(error);
    });
  };
};

module.exports = asyncHandler;

