/**
 * Companion Validation Middleware
 * Validates companion application and profile-related request data
 */

const { body, param, query, validationResult } = require('express-validator');
const { sendBadRequest } = require('../../utils/responseHelpers');

/**
 * Helper to check validation results
 */
const checkValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendBadRequest(res, 'Validation failed', errors.array());
  }
  next();
};

/**
 * Validate companion application submission
 */
const validateSubmitApplication = [
  body('dateOfBirth')
    .notEmpty().withMessage('Date of birth is required')
    .isDate().withMessage('Invalid date format. Use YYYY-MM-DD')
    .custom((value) => {
      const birthDate = new Date(value);
      const age = Math.floor((new Date() - birthDate) / (365.25 * 24 * 60 * 60 * 1000));
      if (age < 18) {
        throw new Error('You must be at least 18 years old to become a companion');
      }
      if (age > 100) {
        throw new Error('Invalid date of birth');
      }
      return true;
    }),
  
  body('phoneNumber')
    .optional({ checkFalsy: true })
    .matches(/^\+?[\d\s\-()]+$/).withMessage('Invalid phone number format'),
  
  body('bio')
    .optional()
    .isString().withMessage('Bio must be a string')
    .isLength({ max: 1000 }).withMessage('Bio must not exceed 1000 characters'),
  
  body('servicesOffered')
    .optional()
    .isString().withMessage('Services offered must be a string'),
  
  body('languages')
    .optional()
    .isString().withMessage('Languages must be a string'),
  
  body('hourlyRate')
    .optional()
    .isFloat({ min: 0.01 }).withMessage('Hourly rate must be a positive number'),

  body('interests')
    .optional()
    .custom((value) => {
      // Can be string (JSON) or array
      if (typeof value === 'string') {
        try {
          JSON.parse(value);
        } catch (e) {
          throw new Error('Interests must be valid JSON array');
        }
      } else if (!Array.isArray(value)) {
        throw new Error('Interests must be an array');
      }
      return true;
    }),
  
  body('backgroundCheckConsent')
    .optional()
    .isBoolean().withMessage('Background check consent must be a boolean'),
  
  checkValidation
];

/**
 * Validate companion profile update
 */
const validateUpdateProfile = [
  body('bio')
    .optional()
    .isString().withMessage('Bio must be a string')
    .isLength({ max: 1000 }).withMessage('Bio must not exceed 1000 characters'),
  
  body('servicesOffered')
    .optional()
    .isString().withMessage('Services offered must be a string')
    .isLength({ max: 500 }).withMessage('Services offered must not exceed 500 characters'),
  
  body('languages')
    .optional()
    .isString().withMessage('Languages must be a string')
    .isLength({ max: 200 }).withMessage('Languages must not exceed 200 characters'),
  
  body('hourlyRate')
    .optional()
    .isFloat({ min: 0.01 }).withMessage('Hourly rate must be a positive number'),

  checkValidation
];

/**
 * Validate interests update
 */
const validateSaveInterests = [
  body('interests')
    .notEmpty().withMessage('Interests are required')
    .isArray().withMessage('Interests must be an array')
    .custom((value) => {
      if (value.length === 0) {
        throw new Error('At least one interest is required');
      }
      if (value.length > 20) {
        throw new Error('Maximum 20 interests allowed');
      }
      for (const interest of value) {
        if (typeof interest !== 'string') {
          throw new Error('Each interest must be a string');
        }
        if (interest.length < 2 || interest.length > 50) {
          throw new Error('Each interest must be 2-50 characters');
        }
      }
      return true;
    }),
  
  checkValidation
];

/**
 * Validate companion search filters
 */
const validateCompanionSearch = [
  query('interests')
    .optional()
    .custom((value) => {
      // Can be a single interest or comma-separated list
      if (typeof value !== 'string') {
        throw new Error('Interests must be a string');
      }
      const interests = value.split(',');
      if (interests.length > 10) {
        throw new Error('Maximum 10 interests filter allowed');
      }
      return true;
    }),
  
  query('minAge')
    .optional()
    .isInt({ min: 18, max: 100 }).withMessage('Minimum age must be between 18 and 100'),
  
  query('maxAge')
    .optional()
    .isInt({ min: 18, max: 100 }).withMessage('Maximum age must be between 18 and 100')
    .custom((value, { req }) => {
      if (req.query.minAge && parseInt(value) < parseInt(req.query.minAge)) {
        throw new Error('Maximum age must be greater than minimum age');
      }
      return true;
    }),
  
  query('city')
    .optional()
    .isString().withMessage('City must be a string')
    .isLength({ max: 100 }).withMessage('City must not exceed 100 characters'),
  
  query('state')
    .optional()
    .isString().withMessage('State must be a string')
    .isLength({ max: 100 }).withMessage('State must not exceed 100 characters'),
  
  query('country')
    .optional()
    .isString().withMessage('Country must be a string')
    .isLength({ max: 100 }).withMessage('Country must not exceed 100 characters'),
  
  query('minHourlyRate')
    .optional()
    .isFloat({ min: 0 }).withMessage('Minimum hourly rate must be non-negative'),
  
  query('maxHourlyRate')
    .optional()
    .isFloat({ min: 0 }).withMessage('Maximum hourly rate must be non-negative')
    .custom((value, { req }) => {
      if (req.query.minHourlyRate && parseFloat(value) < parseFloat(req.query.minHourlyRate)) {
        throw new Error('Maximum hourly rate must be greater than minimum hourly rate');
      }
      return true;
    }),
  
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  
  checkValidation
];

/**
 * Validate companion ID parameter
 */
const validateCompanionId = [
  param('companionId')
    .notEmpty().withMessage('Companion ID is required')
    .isInt({ min: 1 }).withMessage('Companion ID must be a positive integer'),
  
  checkValidation
];

/**
 * Validate admin application review
 */
const validateApplicationReview = [
  param('applicationId')
    .notEmpty().withMessage('Application ID is required')
    .isInt({ min: 1 }).withMessage('Application ID must be a positive integer'),
  
  body('status')
    .notEmpty().withMessage('Status is required')
    .isIn(['approved', 'rejected']).withMessage('Status must be approved or rejected'),
  
  body('rejectionReason')
    .if(body('status').equals('rejected'))
    .notEmpty().withMessage('Rejection reason is required when rejecting application')
    .isString().withMessage('Rejection reason must be a string')
    .isLength({ min: 10, max: 500 }).withMessage('Rejection reason must be 10-500 characters'),
  
  checkValidation
];

module.exports = {
  validateSubmitApplication,
  validateUpdateProfile,
  validateSaveInterests,
  validateCompanionSearch,
  validateCompanionId,
  validateApplicationReview,
  checkValidation
};

