/**
 * Request Logger Middleware
 * Logs incoming requests with unique IDs for tracing
 */

const logger = require('../services/logger');
const crypto = require('crypto');

/**
 * Generate unique request ID
 */
const generateRequestId = () => {
  return crypto.randomBytes(8).toString('hex');
};

/**
 * Request logger middleware
 */
const requestLogger = (req, res, next) => {
  // Generate and attach request ID
  req.id = generateRequestId();

  // Record start time
  req.startTime = Date.now();

  // Log request
  logger.http('Incoming request', {
    requestId: req.id,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    userId: req.user?.id
  });

  // Capture response
  const originalSend = res.send;
  res.send = function(data) {
    res.send = originalSend;

    // Calculate response time
    const responseTime = Date.now() - req.startTime;

    // Log response
    logger.http('Request completed', {
      requestId: req.id,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      userId: req.user?.id
    });

    // Add request ID to response headers
    res.set('X-Request-Id', req.id);

    return res.send(data);
  };

  next();
};

module.exports = requestLogger;