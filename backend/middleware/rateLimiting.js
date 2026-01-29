/**
 * Rate Limiting Middleware
 * Prevents abuse by limiting the number of requests from a single IP
 */

const rateLimit = require('express-rate-limit');

/**
 * Create a rate limiter with custom options
 * @param {Object} options - Rate limiter options
 * @returns {Function} Rate limiter middleware
 */
const createRateLimiter = (options = {}) => {
  const defaults = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (req, res) => {
      res.status(429).json({
        status: 'error',
        message: options.message || defaults.message,
        retryAfter: req.rateLimit.resetTime
      });
    },
    // Skip rate limiting for trusted IPs (e.g., health checks)
    skip: (req) => {
      const trustedIPs = process.env.TRUSTED_IPS ? process.env.TRUSTED_IPS.split(',') : [];
      const clientIP = req.ip || req.connection.remoteAddress;
      return trustedIPs.includes(clientIP);
    }
  };

  return rateLimit({ ...defaults, ...options });
};

/**
 * Strict rate limiter for authentication endpoints
 * More restrictive to prevent brute force attacks
 */
const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 auth requests per windowMs
  message: 'Too many authentication attempts, please try again after 15 minutes.',
  skipSuccessfulRequests: false // Count all requests, not just failed ones
});

/**
 * Rate limiter for signup endpoints
 * DISABLED FOR DEMO - No IP-based signup restrictions
 * Uncomment below to re-enable signup rate limiting
 */
// const signupRateLimiter = createRateLimiter({
//   windowMs: 60 * 60 * 1000, // 1 hour
//   max: 3, // Limit each IP to 3 signups per hour
//   message: 'Too many accounts created from this IP, please try again after an hour.',
//   skipSuccessfulRequests: false
// });

/**
 * Rate limiter for password reset endpoints
 */
const passwordResetRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 password reset requests per hour
  message: 'Too many password reset requests, please try again after an hour.'
});

/**
 * Rate limiter for email verification resend
 */
const emailVerificationRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 resend requests per hour
  message: 'Too many verification email requests, please try again after an hour.'
});

/**
 * General API rate limiter for regular endpoints
 * Less restrictive for normal API usage
 */
const apiRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per windowMs (increased for dashboard usage)
  message: 'Too many requests, please slow down.'
});

/**
 * Rate limiter for file uploads
 * More restrictive due to resource intensity
 */
const uploadRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 uploads per hour
  message: 'Too many file uploads, please try again after an hour.'
});

/**
 * Rate limiter for search endpoints
 * Moderate restrictions to prevent scraping
 */
const searchRateLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 searches per minute
  message: 'Too many search requests, please slow down.'
});

/**
 * Rate limiter for Stripe webhooks
 * Should be less restrictive as they come from Stripe servers
 */
const webhookRateLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Higher limit for webhooks
  message: 'Too many webhook requests.',
  skip: (req) => {
    // Skip rate limiting for verified Stripe webhooks
    // The Stripe signature verification will handle authenticity
    return req.headers['stripe-signature'] !== undefined;
  }
});

/**
 * Dynamic rate limiter based on user role
 * Gives higher limits to authenticated/premium users
 */
const createDynamicRateLimiter = () => {
  return createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: (req) => {
      // Higher limits for authenticated users
      if (req.user) {
        if (req.user.role === 'admin') {
          return 1000; // Admins get very high limit
        }
        if (req.user.role === 'companion' || req.user.isPremium) {
          return 500; // Premium users get higher limit
        }
        return 200; // Regular authenticated users
      }
      return 50; // Unauthenticated users get lower limit
    },
    keyGenerator: (req) => {
      // Use user ID for authenticated users, IP for others
      if (req.user && req.user.id) {
        return `user_${req.user.id}`;
      }
      return req.ip;
    }
  });
};

module.exports = {
  createRateLimiter,
  authRateLimiter,
  // signupRateLimiter, // DISABLED FOR DEMO - No IP restrictions on signup
  passwordResetRateLimiter,
  emailVerificationRateLimiter,
  apiRateLimiter,
  uploadRateLimiter,
  searchRateLimiter,
  webhookRateLimiter,
  createDynamicRateLimiter
};