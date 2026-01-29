/**
 * Global Error Handler Middleware
 * Provides consistent error responses across all endpoints
 */

const logger = require('../services/logger');

/**
 * Error response formatter
 */
const sendErrorResponse = (res, statusCode, message, details = null) => {
  const response = {
    status: 'error',
    message: message
  };

  // Add details in development mode
  if (process.env.NODE_ENV === 'development' && details) {
    response.details = details;
  }

  return res.status(statusCode).json(response);
};

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.error('Global error handler caught error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    userId: req.user?.id
  });

  // If response was already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  // Handle specific error types

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return sendErrorResponse(res, 401, 'Invalid token');
  }

  if (err.name === 'TokenExpiredError') {
    return sendErrorResponse(res, 401, 'Token expired');
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    return sendErrorResponse(res, 400, 'Validation failed', err.errors);
  }

  // Database errors
  if (err.code === 'ER_DUP_ENTRY') {
    return sendErrorResponse(res, 409, 'Duplicate entry found');
  }

  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return sendErrorResponse(res, 400, 'Referenced resource does not exist');
  }

  // File upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return sendErrorResponse(res, 400, 'File too large');
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return sendErrorResponse(res, 400, 'Unexpected file upload');
  }

  // Custom application errors
  if (err.statusCode && err.message) {
    return sendErrorResponse(res, err.statusCode, err.message);
  }

  // Default to 500 server error
  return sendErrorResponse(
    res,
    500,
    'An unexpected error occurred',
    process.env.NODE_ENV === 'development' ? err.message : undefined
  );
};

/**
 * Async error wrapper for route handlers
 * Catches async errors and passes them to error handler
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Not found handler
 */
const notFoundHandler = (req, res) => {
  logger.warn('404 - Route not found', {
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  return sendErrorResponse(res, 404, 'Route not found');
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler,
  sendErrorResponse
};