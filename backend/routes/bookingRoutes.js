/**
 * Booking Routes
 */

const express = require('express');
const {
  // Core booking operations
  createBooking,
  getBookings,
  getBookingById,
  updateBookingStatus,
  approveBooking,
  rejectBooking,
  getPendingBookingsForCompanion,
  createPaymentIntent,
  createBookingWithPayment,
  confirmBookingPayment,
  completeBookingPayment,
  // Availability management
  getCompanionAvailability,
  setCompanionAvailability,
  getAvailableTimeSlots,
  getCompanionBookingsByDateRange,
  getCompanionWeeklyAvailability,
  getCompanionAvailabilityForDateRange,
  // Booking requests
  createBookingRequest,
  createRequestPaymentIntent,
  createRequestWithPayment,
  getBookingRequests,
  getBookingRequestById,
  updateBookingRequestStatus,
  cancelBookingRequest,
  confirmBookingRequestPayment,
  // Reviews
  createReview,
  getCompanionReviews,
  getBookingReview,
  getPendingReviews,
  hasPendingReviews
} = require('../controllers/booking');
const { verifyOTP, getVerificationStatus, expireVerification, requestExtension } = require('../controllers/booking/otpVerificationController');
const authMiddleware = require('../middleware/auth');
const { isCompanion, validateCompanionOwnership, companionRateLimit } = require('../middleware/companionAuth');

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Booking management
router.post('/create', createBooking); // OLD - will be deprecated
router.post('/create-payment-intent', createPaymentIntent); // NEW - Step 1: Create payment intent only
router.post('/create-with-payment', createBookingWithPayment); // NEW - Step 2: Create booking after payment auth
router.get('/my-bookings', getBookings);

// Availability management (companion only) - static routes first
// Public endpoints for viewing availability
router.get('/availability/:companionId', getCompanionAvailability);
router.get('/availability/:companionId/weekly', getCompanionWeeklyAvailability);
router.get('/availability/:companionId/calendar', getCompanionAvailabilityForDateRange);
router.get('/availability/:companionId/slots', getAvailableTimeSlots);
router.get('/bookings/:companionId/date-range', getCompanionBookingsByDateRange);

// Protected companion-only endpoint for setting availability
// Apply rate limiting, companion validation, and ownership check
router.post('/availability',
  companionRateLimit,  // Rate limit to prevent abuse
  isCompanion,  // Ensure user is a companion
  validateCompanionOwnership,  // Ensure they can only modify their own data
  setCompanionAvailability
);

// Review routes (public)
router.get('/companion/:companionId/reviews', getCompanionReviews);
router.get('/pending-reviews', getPendingReviews);
router.get('/reviews/has-pending', hasPendingReviews);

// Booking Request routes
router.post('/requests/create', createBookingRequest); // OLD - will be deprecated
router.post('/requests/create-payment-intent', createRequestPaymentIntent); // NEW - Step 1: Create payment intent only
router.post('/requests/create-with-payment', createRequestWithPayment); // NEW - Step 2: Create request after payment auth
router.get('/requests', getBookingRequests);
router.get('/requests/:requestId', getBookingRequestById);
router.post('/requests/:requestId/confirm-payment', confirmBookingRequestPayment); // OLD - for backwards compatibility
router.put('/requests/:requestId/cancel', cancelBookingRequest);
router.put('/requests/:requestId/status', isCompanion, updateBookingRequestStatus);

// Companion approval routes
router.get('/companion/pending', isCompanion, getPendingBookingsForCompanion);
router.put('/companion/approve/:bookingId', isCompanion, approveBooking);
router.put('/companion/reject/:bookingId', isCompanion, rejectBooking);

// Dynamic bookingId routes - placed after static routes to avoid conflicts
router.get('/:bookingId', getBookingById);
// Payment routes
router.post('/:bookingId/confirm-payment', confirmBookingPayment); // OLD - for backwards compatibility
router.post('/:bookingId/complete-payment', completeBookingPayment); // ⭐ Capture payment after meeting
router.put('/:bookingId/status', updateBookingStatus);

// OTP Verification routes (for meeting verification)
router.post('/:bookingId/verify-otp', verifyOTP); // ⭐ Verify OTP and GPS location
router.get('/:bookingId/verification-status', getVerificationStatus); // Get current verification status
router.post('/:bookingId/extend-verification', requestExtension); // ⭐ Request +10 min extra time
router.post('/:bookingId/expire-verification', expireVerification); // ⭐ Expire booking on frontend timeout

// Review routes (require booking ownership)
router.post('/:bookingId/review', createReview);
router.get('/:bookingId/review', getBookingReview);

module.exports = router;

