/**
 * Database Logging Wrapper
 * Provides conditional logging for database operations
 */

const logger = require('../services/logger');

// Control verbosity of database initialization logs
const ENABLE_VERBOSE_DB_LOGGING = process.env.DB_VERBOSE_LOGGING === 'true';

/**
 * Log database info only if verbose logging is enabled
 * Always log errors regardless of verbose setting
 */
const dbLog = {
  // Verbose info - only shows when DB_VERBOSE_LOGGING=true
  info: (operation, message, metadata = {}) => {
    if (ENABLE_VERBOSE_DB_LOGGING) {
      logger.dbInfo(operation, message, metadata);
    }
  },

  // Always log errors
  error: (operation, error, query = null, metadata = {}) => {
    logger.dbError(operation, error, query, metadata);
  },

  // Always log warnings
  warn: (operation, message, metadata = {}) => {
    logger.warn(message, { operation, ...metadata });
  },

  // Summary logs - always show (startup/completion)
  summary: (message, metadata = {}) => {
    logger.info(message, metadata);
  }
};

module.exports = {
  ENABLE_VERBOSE_DB_LOGGING,
  dbLog
};

