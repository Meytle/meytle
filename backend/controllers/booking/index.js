/**
 * Booking Controllers Index
 * Exports all booking-related controllers
 */

const bookingController = require('./bookingController');
const availabilityController = require('./availabilityController');
const bookingRequestController = require('./bookingRequestController');
const reviewController = require('./reviewController');

module.exports = {
  // Core booking operations
  ...bookingController,
  
  // Availability management
  ...availabilityController,
  
  // Booking requests
  ...bookingRequestController,
  
  // Reviews
  ...reviewController
};

