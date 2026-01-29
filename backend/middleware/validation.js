/**
 * Input Validation Middleware
 * Uses express-validator for request validation and sanitization
 */

const { body, param, query, validationResult } = require('express-validator');

/**
 * Middleware to handle validation errors
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next middleware function
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.path,
      message: error.msg,
      value: error.value
    }));

    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: errorMessages
    });
  }
  next();
};

/**
 * Validation rules for user signup
 */
const validateSignup = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s'\-]+$/).withMessage('Name should only contain letters, spaces, hyphens, and apostrophes'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/\d/).withMessage('Password must contain at least one number')
    .matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/).withMessage('Password must contain at least one special character'),

  body('roles')
    .notEmpty().withMessage('At least one role is required')
    .custom((value) => {
      const roleArray = Array.isArray(value) ? value : [value];
      const validRoles = ['client', 'companion', 'admin'];
      return roleArray.every(role => validRoles.includes(role));
    }).withMessage('Invalid role(s). Must be client, companion, or admin'),

  handleValidationErrors
];

/**
 * Validation rules for user login
 */
const validateLogin = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required'),

  handleValidationErrors
];

/**
 * Validation rules for companion application
 */
const validateCompanionApplication = [
  body('date_of_birth')
    .notEmpty().withMessage('Date of birth is required')
    .isISO8601().withMessage('Invalid date format')
    .custom((value) => {
      const birthDate = new Date(value);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      return age >= 18;
    }).withMessage('Must be at least 18 years old'),


  body('phone_number')
    .optional()
    .trim()
    .matches(/^[\d\s\-\+\(\)]+$/).withMessage('Invalid phone number format'),

  body('bio')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Bio must not exceed 1000 characters'),

  body('hourly_rate')
    .optional()
    .isFloat({ min: 0 }).withMessage('Hourly rate must be a positive number'),

  body('languages')
    .optional()
    .isArray().withMessage('Languages must be an array'),

  body('services_offered')
    .optional()
    .isArray().withMessage('Services must be an array')
    .custom((value) => {
      return value.length <= 10;
    }).withMessage('Maximum 10 services allowed'),

  body('postal_code')
    .optional()
    .trim()
    .matches(/^[A-Za-z0-9\s\-]+$/).withMessage('Invalid postal code format'),

  handleValidationErrors
];

/**
 * Validation rules for booking creation
 */
const validateBooking = [
  body('companion_id')
    .notEmpty().withMessage('Companion ID is required')
    .isInt({ min: 1 }).withMessage('Invalid companion ID'),

  body('booking_date')
    .notEmpty().withMessage('Booking date is required')
    .isISO8601().withMessage('Invalid date format')
    .custom((value) => {
      const bookingDate = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return bookingDate >= today;
    }).withMessage('Booking date must be today or in the future'),

  body('start_time')
    .notEmpty().withMessage('Start time is required')
    .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid time format (HH:MM)'),

  body('end_time')
    .notEmpty().withMessage('End time is required')
    .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid time format (HH:MM)'),

  // Note: duration_hours and total_amount are calculated in the controller, not provided by client

  body('special_requests')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Special requests must not exceed 500 characters'),

  body('meeting_location')
    .optional()
    .trim()
    .isLength({ max: 255 }).withMessage('Meeting location must not exceed 255 characters'),

  body('meeting_type')
    .optional()
    .isIn(['in_person', 'virtual']).withMessage('Meeting type must be either in_person or virtual'),

  body('service_category_id')
    .optional()
    .isInt({ min: 1 }).withMessage('Invalid service category ID'),

  body('custom_service')
    .optional()
    .isObject().withMessage('Custom service must be an object')
    .custom((value) => {
      if (value && (!value.name || value.name.trim().length < 3)) {
        throw new Error('Custom service name must be at least 3 characters long');
      }
      if (value && value.name && value.name.length > 255) {
        throw new Error('Custom service name must not exceed 255 characters');
      }
      return true;
    }),

  handleValidationErrors
];

/**
 * Validation rules for ID parameters
 */
const validateIdParam = [
  param('id')
    .notEmpty().withMessage('ID is required')
    .isInt({ min: 1 }).withMessage('Invalid ID format'),
  handleValidationErrors
];

/**
 * Validation rules for pagination
 */
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),

  query('sort')
    .optional()
    .isIn(['asc', 'desc', 'ASC', 'DESC']).withMessage('Sort must be asc or desc'),

  handleValidationErrors
];

/**
 * Sanitize input to prevent XSS attacks
 */
const sanitizeInput = (req, res, next) => {
  // Recursively sanitize all string values in the request
  const sanitizeObject = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        // Remove any script tags and HTML
        obj[key] = obj[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<[^>]+>/g, '');
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key]);
      }
    }
  };

  if (req.body) sanitizeObject(req.body);
  if (req.query) sanitizeObject(req.query);
  if (req.params) sanitizeObject(req.params);

  next();
};

module.exports = {
  handleValidationErrors,
  validateSignup,
  validateLogin,
  validateCompanionApplication,
  validateBooking,
  validateIdParam,
  validatePagination,
  sanitizeInput
};