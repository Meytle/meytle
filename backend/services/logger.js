const winston = require('winston');
const path = require('path');
require('winston-daily-rotate-file');

// Define log levels and colors
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(logColors);

// Define format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;

    // Add metadata if present
    if (metadata && Object.keys(metadata).length > 0) {
      // Remove sensitive data from logs
      const sanitizedMetadata = { ...metadata };
      if (sanitizedMetadata.password) delete sanitizedMetadata.password;
      if (sanitizedMetadata.token) delete sanitizedMetadata.token;
      if (sanitizedMetadata.governmentIdNumber) delete sanitizedMetadata.governmentIdNumber;

      msg += ` ${JSON.stringify(sanitizedMetadata)}`;
    }

    return msg;
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;

    if (metadata && Object.keys(metadata).length > 0) {
      const sanitizedMetadata = { ...metadata };
      if (sanitizedMetadata.password) delete sanitizedMetadata.password;
      if (sanitizedMetadata.token) delete sanitizedMetadata.token;
      if (sanitizedMetadata.governmentIdNumber) delete sanitizedMetadata.governmentIdNumber;

      msg += ` ${JSON.stringify(sanitizedMetadata, null, 2)}`;
    }

    return msg;
  })
);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');

// Configure transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      consoleFormat
    ),
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
  }),
];

// Add file transports for non-development environments
if (process.env.NODE_ENV !== 'development') {
  transports.push(
    // Error log file
    new winston.transports.DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '30d',
      maxSize: '20m',
      format: logFormat
    }),

    // Combined log file
    new winston.transports.DailyRotateFile({
      filename: path.join(logsDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      maxSize: '20m',
      format: logFormat
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  levels: logLevels,
  level: process.env.LOG_LEVEL || 'debug',
  transports,
  exitOnError: false, // Don't exit on handled exceptions
});

// Create a stream object for Morgan middleware integration
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

// Helper methods for common logging patterns
class Logger {
  constructor() {
    this.logger = logger;
  }

  // Standard logging methods
  error(message, metadata = {}) {
    this.logger.error(message, metadata);
  }

  warn(message, metadata = {}) {
    this.logger.warn(message, metadata);
  }

  info(message, metadata = {}) {
    this.logger.info(message, metadata);
  }

  http(message, metadata = {}) {
    this.logger.http(message, metadata);
  }

  debug(message, metadata = {}) {
    this.logger.debug(message, metadata);
  }

  // Controller-specific logging
  controllerError(controller, method, error, req = null) {
    const metadata = {
      controller,
      method,
      error: error.message || error,
      stack: error.stack,
    };

    if (req) {
      metadata.userId = req.user?.id;
      metadata.path = req.path;
      metadata.method = req.method;
      metadata.ip = req.ip;
    }

    this.error(`Controller error in ${controller}.${method}`, metadata);
  }

  controllerInfo(controller, method, message, data = {}) {
    this.info(message, {
      controller,
      method,
      ...data
    });
  }

  controllerWarn(controller, method, message, data = {}) {
    this.warn(message, {
      controller,
      method,
      ...data
    });
  }

  // Database logging
  dbError(operation, error, query = null) {
    this.error(`Database error during ${operation}`, {
      operation,
      error: error.message || error,
      query: query ? query.substring(0, 500) : undefined, // Truncate long queries
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage
    });
  }

  dbInfo(operation, message, data = {}) {
    this.info(message, {
      operation,
      ...data
    });
  }

  // API/Service logging
  apiError(service, method, error, data = {}) {
    this.error(`API error in ${service}.${method}`, {
      service,
      method,
      error: error.message || error,
      ...data
    });
  }

  apiInfo(service, method, message, data = {}) {
    this.info(message, {
      service,
      method,
      ...data
    });
  }

  // Authentication logging
  authError(action, error, userId = null) {
    this.error(`Auth error during ${action}`, {
      action,
      userId,
      error: error.message || error
    });
  }

  authInfo(action, userId, message = '') {
    this.info(`Auth: ${action} ${message}`, {
      action,
      userId
    });
  }

  // Request logging
  requestInfo(req, message = 'Request received') {
    this.info(message, {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: req.user?.id
    });
  }

  // Response logging
  responseInfo(req, res, responseTime) {
    this.info('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      userId: req.user?.id
    });
  }
}

// Export singleton instance
module.exports = new Logger();