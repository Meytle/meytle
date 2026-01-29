/**
 * Authentication Validation Middleware
 * Validates user authentication and profile-related request data
 */

const { body, validationResult } = require('express-validator');
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
 * Validate user signup data
 */
const validateSignup = [
  body('name')
    .notEmpty().withMessage('Name is required')
    .isString().withMessage('Name must be a string')
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail()
    .isLength({ max: 255 }).withMessage('Email must not exceed 255 characters'),
  
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/\d/).withMessage('Password must contain at least one number')
    .matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/).withMessage('Password must contain at least one special character'),
  
  body('roles')
    .notEmpty().withMessage('Roles are required')
    .custom((value) => {
      const roles = Array.isArray(value) ? value : [value];
      const validRoles = ['client', 'companion', 'admin'];
      for (const role of roles) {
        if (!validRoles.includes(role)) {
          throw new Error(`Invalid role: ${role}. Must be one of: ${validRoles.join(', ')}`);
        }
      }
      return true;
    }),
  
  checkValidation
];

/**
 * Validate user login data
 */
const validateLogin = [
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('password')
    .notEmpty().withMessage('Password is required')
    .isString().withMessage('Password must be a string'),
  
  checkValidation
];

/**
 * Validate email verification token
 */
const validateVerificationToken = [
  body('token')
    .notEmpty().withMessage('Verification token is required')
    .isString().withMessage('Token must be a string')
    .isLength({ min: 32, max: 64 }).withMessage('Invalid token format'),
  
  checkValidation
];

/**
 * Validate role switch request
 */
const validateRoleSwitch = [
  body('newRole')
    .notEmpty().withMessage('New role is required')
    .isIn(['client', 'companion', 'admin']).withMessage('Invalid role. Must be client, companion, or admin'),
  
  checkValidation
];

/**
 * Validate password change
 */
const validatePasswordChange = [
  body('currentPassword')
    .notEmpty().withMessage('Current password is required')
    .isString().withMessage('Current password must be a string'),
  
  body('newPassword')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters long')
    .matches(/[A-Z]/).withMessage('New password must contain at least one uppercase letter')
    .matches(/[a-z]/).withMessage('New password must contain at least one lowercase letter')
    .matches(/\d/).withMessage('New password must contain at least one number')
    .matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/).withMessage('New password must contain at least one special character')
    .custom((value, { req }) => {
      if (value === req.body.currentPassword) {
        throw new Error('New password must be different from current password');
      }
      return true;
    }),
  
  body('confirmPassword')
    .notEmpty().withMessage('Password confirmation is required')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Password confirmation does not match');
      }
      return true;
    }),
  
  checkValidation
];

/**
 * Validate profile update
 */
const validateProfileUpdate = [
  body('name')
    .optional()
    .isString().withMessage('Name must be a string')
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  
  body('bio')
    .optional()
    .isString().withMessage('Bio must be a string')
    .isLength({ max: 1000 }).withMessage('Bio must not exceed 1000 characters'),
  
  body('phone')
    .optional()
    .matches(/^\+?[\d\s\-()]+$/).withMessage('Invalid phone number format'),
  
  checkValidation
];

/**
 * Validate email format only (for resend verification, etc.)
 */
const validateEmail = [
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  checkValidation
];

/**
 * Validate delete account request
 */
const validateDeleteAccount = [
  body('password')
    .notEmpty().withMessage('Password is required to delete account')
    .isString().withMessage('Password must be a string'),
  
  body('confirmation')
    .notEmpty().withMessage('Confirmation is required')
    .equals('DELETE').withMessage('Type DELETE to confirm account deletion'),
  
  checkValidation
];

module.exports = {
  validateSignup,
  validateLogin,
  validateVerificationToken,
  validateRoleSwitch,
  validatePasswordChange,
  validateProfileUpdate,
  validateEmail,
  validateDeleteAccount,
  checkValidation
};

