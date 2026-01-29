/**
 * Booking Validation Middleware
 * Validates booking-related request data
 */

const { body, param, query, validationResult } = require('express-validator');
const { sendBadRequest } = require('../../utils/responseHelpers');
const { safeParseDate, isPastTimeSlot } = require('../../utils/dateHelpers');

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
 * Validate booking creation data
 */
const validateCreateBooking = [
  body('companion_id')
    .notEmpty().withMessage('Companion ID is required')
    .isInt({ min: 1 }).withMessage('Companion ID must be a positive integer'),
  
  body('booking_date')
    .notEmpty().withMessage('Booking date is required')
    .isDate().withMessage('Invalid date format. Use YYYY-MM-DD')
    .custom((value) => {
      const date = safeParseDate(value);
      if (!date) {
        throw new Error('Invalid booking date');
      }
      return true;
    }),
  
  body('start_time')
    .notEmpty().withMessage('Start time is required')
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Invalid time format. Use HH:MM'),
  
  body('end_time')
    .notEmpty().withMessage('End time is required')
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Invalid time format. Use HH:MM'),
  
  body('meeting_type')
    .optional()
    .isIn(['in_person', 'virtual']).withMessage('Meeting type must be in_person or virtual'),
  
  body('meeting_location')
    .optional()
    .isString().withMessage('Meeting location must be a string')
    .isLength({ max: 500 }).withMessage('Meeting location must not exceed 500 characters'),
  
  body('special_requests')
    .optional()
    .isString().withMessage('Special requests must be a string')
    .isLength({ max: 1000 }).withMessage('Special requests must not exceed 1000 characters'),
  
  body('service_category_id')
    .optional()
    .isInt({ min: 1 }).withMessage('Service category ID must be a positive integer'),
  
  body('custom_service')
    .optional()
    .isObject().withMessage('Custom service must be an object'),
  
  body('custom_service.name')
    .if(body('custom_service').exists())
    .notEmpty().withMessage('Custom service name is required')
    .isLength({ min: 3, max: 255 }).withMessage('Custom service name must be 3-255 characters'),
  
  body('custom_service.description')
    .optional()
    .isLength({ max: 1000 }).withMessage('Custom service description must not exceed 1000 characters'),
  
  checkValidation
];

/**
 * Validate booking status update
 */
const validateUpdateBookingStatus = [
  param('bookingId')
    .notEmpty().withMessage('Booking ID is required')
    .isInt({ min: 1 }).withMessage('Booking ID must be a positive integer'),
  
  body('status')
    .notEmpty().withMessage('Status is required')
    .isIn(['pending', 'confirmed', 'cancelled', 'completed', 'no_show'])
    .withMessage('Invalid status value'),
  
  body('cancellationReason')
    .if(body('status').equals('cancelled'))
    .notEmpty().withMessage('Cancellation reason is required when cancelling')
    .isString().withMessage('Cancellation reason must be a string')
    .isLength({ min: 10, max: 500 }).withMessage('Cancellation reason must be 10-500 characters'),
  
  checkValidation
];

/**
 * Validate availability slots
 */
const validateSetAvailability = [
  body('availability')
    .notEmpty().withMessage('Availability data is required')
    .isArray().withMessage('Availability must be an array'),
  
  body('availability.*.day_of_week')
    .notEmpty().withMessage('Day of week is required')
    .isIn(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
    .withMessage('Invalid day of week'),
  
  body('availability.*.start_time')
    .notEmpty().withMessage('Start time is required')
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Invalid time format. Use HH:MM'),
  
  body('availability.*.end_time')
    .notEmpty().withMessage('End time is required')
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Invalid time format. Use HH:MM'),
  
  body('availability.*.is_available')
    .optional()
    .isBoolean().withMessage('is_available must be a boolean'),
  
  checkValidation
];

/**
 * Validate review creation
 */
const validateCreateReview = [
  param('bookingId')
    .notEmpty().withMessage('Booking ID is required')
    .isInt({ min: 1 }).withMessage('Booking ID must be a positive integer'),
  
  body('rating')
    .notEmpty().withMessage('Rating is required')
    .isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  
  body('comment')
    .notEmpty().withMessage('Review comment is required')
    .isString().withMessage('Comment must be a string')
    .isLength({ min: 10, max: 500 }).withMessage('Review must be 10-500 characters'),
  
  checkValidation
];

/**
 * Validate booking request creation
 */
const validateCreateBookingRequest = [
  body('companion_id')
    .notEmpty().withMessage('Companion ID is required')
    .isInt({ min: 1 }).withMessage('Companion ID must be a positive integer'),
  
  body('requested_date')
    .notEmpty().withMessage('Requested date is required')
    .isDate().withMessage('Invalid date format. Use YYYY-MM-DD'),
  
  body('preferred_time')
    .optional()
    .isString().withMessage('Preferred time must be a string'),
  
  body('start_time')
    .optional()
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Invalid time format. Use HH:MM'),
  
  body('end_time')
    .optional()
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Invalid time format. Use HH:MM'),
  
  body('duration_hours')
    .optional()
    .isFloat({ min: 1, max: 12 }).withMessage('Duration must be between 1 and 12 hours'),
  
  body('meeting_type')
    .optional()
    .isIn(['in_person', 'virtual']).withMessage('Meeting type must be in_person or virtual'),
  
  body('special_requests')
    .optional()
    .isString().withMessage('Special requests must be a string')
    .isLength({ max: 1000 }).withMessage('Special requests must not exceed 1000 characters'),
  
  checkValidation
];

/**
 * Validate pagination parameters
 */
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  
  query('offset')
    .optional()
    .isInt({ min: 0 }).withMessage('Offset must be a non-negative integer'),
  
  checkValidation
];

/**
 * Validate date range query
 */
const validateDateRange = [
  query('startDate')
    .notEmpty().withMessage('Start date is required')
    .isDate().withMessage('Invalid start date format. Use YYYY-MM-DD'),
  
  query('endDate')
    .notEmpty().withMessage('End date is required')
    .isDate().withMessage('Invalid end date format. Use YYYY-MM-DD')
    .custom((endDate, { req }) => {
      const start = new Date(req.query.startDate);
      const end = new Date(endDate);
      if (end < start) {
        throw new Error('End date must be after start date');
      }
      return true;
    }),
  
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
 * Validate booking ID parameter
 */
const validateBookingId = [
  param('bookingId')
    .notEmpty().withMessage('Booking ID is required')
    .isInt({ min: 1 }).withMessage('Booking ID must be a positive integer'),
  
  checkValidation
];

module.exports = {
  validateCreateBooking,
  validateUpdateBookingStatus,
  validateSetAvailability,
  validateCreateReview,
  validateCreateBookingRequest,
  validatePagination,
  validateDateRange,
  validateCompanionId,
  validateBookingId,
  checkValidation
};

