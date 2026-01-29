/**
 * Response Helper Utilities
 * Centralize all HTTP response patterns to eliminate duplicate code
 */

const logger = require('../services/logger');
const { transformToFrontend, transformArrayToFrontend } = require('./transformer');

/**
 * Send successful response
 * @param {Object} res - Express response object
 * @param {*} data - Response data
 * @param {number} statusCode - HTTP status code (default: 200)
 * @param {string} message - Optional success message
 */
const sendSuccess = (res, data = null, statusCode = 200, message = null) => {
  const response = {
    status: 'success'
  };

  if (message) {
    response.message = message;
  }

  if (data !== null) {
    // Auto-transform data if it's an object or array
    if (Array.isArray(data)) {
      response.data = transformArrayToFrontend(data);
    } else if (typeof data === 'object') {
      response.data = transformToFrontend(data);
    } else {
      response.data = data;
    }
  }

  return res.status(statusCode).json(response);
};

/**
 * Send error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code (default: 500)
 * @param {Error} error - Optional error object for logging
 * @param {Object} additionalData - Optional additional error data
 */
const sendError = (res, message, statusCode = 500, error = null, additionalData = {}) => {
  // Log error if provided
  if (error) {
    logger.error('Response error', {
      message,
      statusCode,
      error: error.message,
      stack: error.stack,
      ...additionalData
    });
  }

  const response = {
    status: 'error',
    message
  };

  // Include error details in development mode
  if (process.env.NODE_ENV !== 'production' && error) {
    response.error = error.message;
    if (error.stack) {
      response.stack = error.stack;
    }
  }

  // Include additional data if provided
  if (Object.keys(additionalData).length > 0) {
    response.data = additionalData;
  }

  return res.status(statusCode).json(response);
};

/**
 * Send not found response
 * @param {Object} res - Express response object
 * @param {string} message - Not found message
 */
const sendNotFound = (res, message = 'Resource not found') => {
  return res.status(404).json({
    status: 'error',
    message
  });
};

/**
 * Send unauthorized response
 * @param {Object} res - Express response object
 * @param {string} message - Unauthorized message
 */
const sendUnauthorized = (res, message = 'Unauthorized access') => {
  return res.status(401).json({
    status: 'error',
    message
  });
};

/**
 * Send forbidden response
 * @param {Object} res - Express response object
 * @param {string} message - Forbidden message
 */
const sendForbidden = (res, message = 'Access forbidden') => {
  return res.status(403).json({
    status: 'error',
    message
  });
};

/**
 * Send bad request response
 * @param {Object} res - Express response object
 * @param {string} message - Bad request message
 * @param {Object} validationErrors - Optional validation error details
 */
const sendBadRequest = (res, message, validationErrors = null) => {
  const response = {
    status: 'error',
    message
  };

  if (validationErrors) {
    response.errors = validationErrors;
  }

  return res.status(400).json(response);
};

/**
 * Send conflict response
 * @param {Object} res - Express response object
 * @param {string} message - Conflict message
 * @param {Object} conflictData - Optional conflict details
 */
const sendConflict = (res, message, conflictData = null) => {
  const response = {
    status: 'error',
    message
  };

  if (conflictData) {
    response.data = conflictData;
  }

  return res.status(409).json(response);
};

/**
 * Send created response
 * @param {Object} res - Express response object
 * @param {*} data - Created resource data
 * @param {string} message - Optional success message
 */
const sendCreated = (res, data = null, message = 'Resource created successfully') => {
  return sendSuccess(res, data, 201, message);
};

/**
 * Send paginated response
 * @param {Object} res - Express response object
 * @param {Array} items - Array of items
 * @param {Object} pagination - Pagination metadata
 * @param {number} pagination.currentPage - Current page number
 * @param {number} pagination.totalPages - Total number of pages
 * @param {number} pagination.totalItems - Total number of items
 * @param {number} pagination.itemsPerPage - Items per page
 */
const sendPaginated = (res, items, pagination) => {
  return res.status(200).json({
    status: 'success',
    data: transformArrayToFrontend(items),
    pagination: {
      currentPage: pagination.currentPage,
      totalPages: pagination.totalPages,
      totalItems: pagination.totalItems,
      itemsPerPage: pagination.itemsPerPage
    }
  });
};

module.exports = {
  sendSuccess,
  sendError,
  sendNotFound,
  sendUnauthorized,
  sendForbidden,
  sendBadRequest,
  sendConflict,
  sendCreated,
  sendPaginated
};

