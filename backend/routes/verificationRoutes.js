/**
 * Verification Routes
 * Routes for OTP and location verification
 */

const express = require('express');
const router = express.Router();
const { submitOTP, getVerificationStatus } = require('../controllers/verificationController');
const authMiddleware = require('../middleware/auth');

// All routes require authentication
router.use(authMiddleware);

/**
 * Submit OTP code and location for verification
 * POST /api/verification/submit-otp
 * Body: { bookingId, enteredOTP, userLocation: { latitude, longitude } }
 */
router.post('/submit-otp', submitOTP);

/**
 * Get verification status for a booking
 * GET /api/verification/status/:bookingId
 */
router.get('/status/:bookingId', getVerificationStatus);

module.exports = router;

