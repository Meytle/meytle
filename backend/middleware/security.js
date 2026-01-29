/**
 * Security Middleware
 * Various security enhancements including HTTPS enforcement
 */

/**
 * Enforce HTTPS in production
 * Redirects HTTP requests to HTTPS
 */
const enforceHTTPS = (req, res, next) => {
  // Only enforce in production
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  // Skip HTTPS enforcement for internal requests (from Nginx proxy on localhost)
  const isInternalRequest = req.hostname === 'localhost' || 
                            req.hostname === '127.0.0.1' ||
                            req.ip === '127.0.0.1' ||
                            req.ip === '::1';
  
  if (isInternalRequest) {
    return next();
  }

  // Check if request is already HTTPS
  // Check various headers that proxies might set
  const isSecure = req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    req.protocol === 'https';

  if (!isSecure) {
    // Redirect to HTTPS version
    const httpsUrl = `https://${req.hostname}${req.originalUrl}`;
    console.log(`🔒 Redirecting HTTP to HTTPS: ${httpsUrl}`);
    return res.redirect(301, httpsUrl);
  }

  // Add Strict-Transport-Security header for HTTPS requests
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  next();
};

/**
 * Add security headers to responses
 */
const securityHeaders = (req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Enable XSS filter in browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Control referrer information
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Content Security Policy
  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' https://js.stripe.com; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https:; " +
      "font-src 'self' data:; " +
      "connect-src 'self' https://api.stripe.com; " +
      "frame-src https://js.stripe.com https://hooks.stripe.com; " +
      "object-src 'none'; " +
      "base-uri 'self'; " +
      "form-action 'self'"
    );
  }

  // Permissions Policy (formerly Feature Policy)
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );

  next();
};

/**
 * Prevent common parameter pollution attacks
 */
const preventParameterPollution = (req, res, next) => {
  // Clean up query parameters - keep only the last value if duplicates
  if (req.query) {
    for (const key in req.query) {
      if (Array.isArray(req.query[key])) {
        // Keep only the last value to prevent pollution
        req.query[key] = req.query[key][req.query[key].length - 1];
        console.warn(`⚠️  Parameter pollution detected for key: ${key}`);
      }
    }
  }

  next();
};

/**
 * Request size limiter
 * Prevents large payload attacks
 */
const requestSizeLimiter = (req, res, next) => {
  const maxSize = 10 * 1024 * 1024; // 10MB default
  let size = 0;

  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > maxSize) {
      console.error(`❌ Request size exceeded limit: ${size} bytes`);
      res.status(413).json({
        status: 'error',
        message: 'Request entity too large'
      });
      req.connection.destroy();
    }
  });

  next();
};

/**
 * Log security events
 */
const securityLogger = (req, res, next) => {
  // Log suspicious activities
  const suspiciousPatterns = [
    /\.\.\//,  // Directory traversal
    /<script/i, // Script injection
    /javascript:/i, // JavaScript protocol
    /on\w+=/i, // Event handlers
    /union.*select/i, // SQL injection
    /exec\(/i, // Command execution
    /eval\(/i // Eval execution
  ];

  const checkString = JSON.stringify({
    body: req.body,
    query: req.query,
    params: req.params
  });

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(checkString)) {
      console.warn(`🚨 Suspicious pattern detected from IP ${req.ip}: ${pattern}`);
      // You might want to log this to a security monitoring service
      break;
    }
  }

  next();
};

/**
 * Middleware to hide sensitive information from responses
 */
const hideSensitiveInfo = (req, res, next) => {
  const originalJson = res.json;

  res.json = function(data) {
    // Remove sensitive fields from response
    if (data && typeof data === 'object') {
      const sanitize = (obj) => {
        if (Array.isArray(obj)) {
          return obj.map(sanitize);
        }

        if (obj && typeof obj === 'object') {
          const sanitized = { ...obj };

          // Remove sensitive fields
          delete sanitized.password;
          delete sanitized.hashedPassword;
          delete sanitized.salt;
          delete sanitized.resetToken;
          delete sanitized.verificationToken;
          delete sanitized.email_verification_token;
          delete sanitized.stripe_secret_key;
          delete sanitized.jwt_secret;

          // Recursively sanitize nested objects
          for (const key in sanitized) {
            if (typeof sanitized[key] === 'object') {
              sanitized[key] = sanitize(sanitized[key]);
            }
          }

          return sanitized;
        }

        return obj;
      };

      data = sanitize(data);
    }

    return originalJson.call(this, data);
  };

  next();
};

module.exports = {
  enforceHTTPS,
  securityHeaders,
  preventParameterPollution,
  requestSizeLimiter,
  securityLogger,
  hideSensitiveInfo
};