/**
 * Verification Controller
 * Handles OTP verification and location validation for bookings
 */

const { pool } = require('../config/database');
const logger = require('../services/logger');
const { calculateDistance, isValidCoordinates } = require('../utils/geoCalculator');
const { transformToFrontend } = require('../utils/transformer');

// Import bookingService functions (will be created)
const { cancelBookingAndRefund } = require('../services/bookingService');

/**
 * Submit OTP code and location for verification
 * POST /api/verification/submit-otp
 */
const submitOTP = async (req, res) => {
  let connection;
  
  try {
    const userId = req.user.id;
    const { bookingId, enteredOTP, userLocation } = req.body;

    logger.info('verificationController', 'submitOTP', 'OTP submission started', {
      userId,
      bookingId
    });

    // Validate input
    if (!bookingId || !enteredOTP || !userLocation) {
      return res.status(400).json({
        status: 'error',
        message: 'Booking ID, OTP code, and location are required'
      });
    }

    if (!/^\d{6}$/.test(enteredOTP)) {
      return res.status(400).json({
        status: 'error',
        message: 'OTP must be a 6-digit code'
      });
    }

    // Validate location coordinates
    if (!isValidCoordinates(userLocation.latitude, userLocation.longitude)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid GPS coordinates provided'
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Get booking details and verify user is part of it
    const [bookings] = await connection.execute(
      `SELECT 
        b.id,
        b.client_id,
        b.companion_id,
        b.status,
        b.meeting_location,
        b.meeting_location_lat,
        b.meeting_location_lon,
        b.booking_date,
        b.start_time,
        client.name as client_name,
        client.email as client_email,
        companion.name as companion_name,
        companion.email as companion_email
      FROM bookings b
      INNER JOIN users client ON b.client_id = client.id
      INNER JOIN users companion ON b.companion_id = companion.id
      WHERE b.id = ?`,
      [bookingId]
    );

    if (bookings.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found'
      });
    }

    const booking = bookings[0];

    // Verify user is either the client or companion
    const isClient = booking.client_id === userId;
    const isCompanion = booking.companion_id === userId;

    if (!isClient && !isCompanion) {
      await connection.rollback();
      return res.status(403).json({
        status: 'error',
        message: 'You are not authorized to verify this booking'
      });
    }

    // Check booking status
    if (booking.status !== 'confirmed' && booking.status !== 'payment_held') {
      await connection.rollback();
      return res.status(400).json({
        status: 'error',
        message: 'Only confirmed bookings can be verified'
      });
    }

    // Check if meeting location is set
    if (!booking.meeting_location_lat || !booking.meeting_location_lon) {
      await connection.rollback();
      return res.status(400).json({
        status: 'error',
        message: 'Meeting location coordinates are not set for this booking'
      });
    }

    // Get verification record
    const [verifications] = await connection.execute(
      `SELECT * FROM booking_verification WHERE booking_id = ?`,
      [bookingId]
    );

    if (verifications.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        status: 'error',
        message: 'Verification record not found. OTP codes have not been sent yet.'
      });
    }

    const verification = verifications[0];

    // Check if verification already failed
    if (verification.verification_status === 'failed') {
      await connection.rollback();
      return res.status(400).json({
        status: 'error',
        message: 'Verification has already failed for this booking',
        reason: verification.failed_reason
      });
    }

    // Check if verification already completed
    if (verification.verification_status === 'verified') {
      await connection.rollback();
      return res.status(400).json({
        status: 'error',
        message: 'This booking has already been verified'
      });
    }

    // Check attempt count (rate limiting)
    const attemptField = isClient ? 'otp_attempt_count_client' : 'otp_attempt_count_companion';
    if (verification[attemptField] >= 3) {
      await connection.rollback();
      return res.status(429).json({
        status: 'error',
        message: 'Maximum OTP attempts exceeded (3 attempts allowed)'
      });
    }

    // Determine which OTP to check and which fields to update
    const correctOTP = isClient ? verification.companion_otp : verification.client_otp;
    const otpEnteredField = isClient ? 'client_otp_entered' : 'companion_otp_entered';
    const locationLatField = isClient ? 'client_location_lat' : 'companion_location_lat';
    const locationLonField = isClient ? 'client_location_lon' : 'companion_location_lon';

    // Check if user already submitted OTP
    if (verification[otpEnteredField]) {
      await connection.rollback();
      return res.status(400).json({
        status: 'error',
        message: 'You have already submitted your verification'
      });
    }

    // Verify OTP code
    if (enteredOTP !== correctOTP) {
      // Increment attempt count
      await connection.execute(
        `UPDATE booking_verification 
         SET ${attemptField} = ${attemptField} + 1
         WHERE booking_id = ?`,
        [bookingId]
      );

      await connection.commit();

      const remainingAttempts = 3 - (verification[attemptField] + 1);

      return res.status(400).json({
        status: 'error',
        message: 'Incorrect OTP code',
        remainingAttempts: remainingAttempts > 0 ? remainingAttempts : 0
      });
    }

    // OTP is correct - update verification record
    await connection.execute(
      `UPDATE booking_verification 
       SET ${otpEnteredField} = TRUE,
           ${locationLatField} = ?,
           ${locationLonField} = ?
       WHERE booking_id = ?`,
      [userLocation.latitude, userLocation.longitude, bookingId]
    );

    logger.info('verificationController', 'submitOTP', 'OTP verified and location saved', {
      bookingId,
      userType: isClient ? 'client' : 'companion',
      latitude: userLocation.latitude,
      longitude: userLocation.longitude
    });

    // Check if both parties have submitted their OTPs
    const bothOTPsEntered = isClient 
      ? verification.companion_otp_entered 
      : verification.client_otp_entered;

    if (bothOTPsEntered) {
      // Both parties have submitted - now verify locations
      const [updatedVerification] = await connection.execute(
        `SELECT * FROM booking_verification WHERE booking_id = ?`,
        [bookingId]
      );

      const verif = updatedVerification[0];

      // Calculate distances from meeting location
      const clientDistance = calculateDistance(
        verif.client_location_lat,
        verif.client_location_lon,
        booking.meeting_location_lat,
        booking.meeting_location_lon
      );

      const companionDistance = calculateDistance(
        verif.companion_location_lat,
        verif.companion_location_lon,
        booking.meeting_location_lat,
        booking.meeting_location_lon
      );

      logger.info('verificationController', 'submitOTP', 'Calculated distances from meeting location', {
        bookingId,
        clientDistance: Math.round(clientDistance),
        companionDistance: Math.round(companionDistance),
        requiredRadius: 100
      });

      // Check if both are within 100 meters
      const REQUIRED_RADIUS = 100; // meters
      const bothWithinRadius = clientDistance <= REQUIRED_RADIUS && companionDistance <= REQUIRED_RADIUS;

      if (bothWithinRadius) {
        // SUCCESS - Both parties verified
        await connection.execute(
          `UPDATE booking_verification 
           SET verification_status = 'verified',
               location_verified = TRUE,
               distance_from_meeting_client = ?,
               distance_from_meeting_companion = ?,
               verified_at = NOW()
           WHERE booking_id = ?`,
          [clientDistance, companionDistance, bookingId]
        );

        await connection.commit();

        logger.info('verificationController', 'submitOTP', 'Verification successful - both parties at location', {
          bookingId,
          clientDistance: Math.round(clientDistance),
          companionDistance: Math.round(companionDistance)
        });

        return res.json({
          status: 'success',
          message: 'Verification successful! Both parties are at the meeting location.',
          verified: true,
          clientDistance: Math.round(clientDistance),
          companionDistance: Math.round(companionDistance)
        });

      } else {
        // FAILURE - One or both parties not at location
        const failedReason = `Location verification failed: ${
          clientDistance > REQUIRED_RADIUS && companionDistance > REQUIRED_RADIUS
            ? 'Both parties are not at the meeting location'
            : clientDistance > REQUIRED_RADIUS
            ? `Client is ${Math.round(clientDistance)}m from meeting location (max 100m allowed)`
            : `Companion is ${Math.round(companionDistance)}m from meeting location (max 100m allowed)`
        }`;

        await connection.execute(
          `UPDATE booking_verification 
           SET verification_status = 'failed',
               failed_reason = ?,
               distance_from_meeting_client = ?,
               distance_from_meeting_companion = ?
           WHERE booking_id = ?`,
          [failedReason, clientDistance, companionDistance, bookingId]
        );

        // Commit before calling cancelBookingAndRefund
        await connection.commit();

        logger.error('verificationController', 'submitOTP', new Error(failedReason), {
          bookingId,
          clientDistance: Math.round(clientDistance),
          companionDistance: Math.round(companionDistance)
        });

        // Auto-cancel booking and refund
        try {
          await cancelBookingAndRefund(bookingId, 'location_verification_failed');
        } catch (cancelError) {
          logger.error('verificationController', 'submitOTP', cancelError, {
            bookingId,
            message: 'Failed to auto-cancel booking after verification failure'
          });
        }

        return res.status(400).json({
          status: 'error',
          message: 'Location verification failed',
          reason: failedReason,
          clientDistance: Math.round(clientDistance),
          companionDistance: Math.round(companionDistance),
          requiredRadius: REQUIRED_RADIUS
        });
      }

    } else {
      // Only one party has submitted so far
      await connection.commit();

      logger.info('verificationController', 'submitOTP', 'OTP verified, waiting for other party', {
        bookingId,
        userType: isClient ? 'client' : 'companion'
      });

      return res.json({
        status: 'success',
        message: 'Your verification has been recorded. Waiting for the other party to verify.',
        waitingForOther: true
      });
    }

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('verificationController', 'submitOTP', error, {
      userId: req.user.id,
      bookingId: req.body.bookingId
    });
    res.status(500).json({
      status: 'error',
      message: 'Failed to process verification',
      error: error.message
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

/**
 * Get verification status for a booking
 * GET /api/verification/status/:bookingId
 */
const getVerificationStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { bookingId } = req.params;

    // Verify user is part of the booking
    const [bookings] = await pool.execute(
      `SELECT client_id, companion_id, status 
       FROM bookings 
       WHERE id = ?`,
      [bookingId]
    );

    if (bookings.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found'
      });
    }

    const booking = bookings[0];
    const isClient = booking.client_id === userId;
    const isCompanion = booking.companion_id === userId;

    if (!isClient && !isCompanion) {
      return res.status(403).json({
        status: 'error',
        message: 'You are not authorized to view this verification status'
      });
    }

    // Get verification record
    const [verifications] = await pool.execute(
      `SELECT 
        booking_id,
        otp_sent_at,
        client_otp_entered,
        companion_otp_entered,
        verification_status,
        location_verified,
        distance_from_meeting_client,
        distance_from_meeting_companion,
        verified_at,
        failed_reason
       FROM booking_verification 
       WHERE booking_id = ?`,
      [bookingId]
    );

    if (verifications.length === 0) {
      return res.json({
        status: 'success',
        verificationStatus: {
          bookingId: parseInt(bookingId),
          otpSent: false,
          clientOtpEntered: false,
          companionOtpEntered: false,
          verificationStatus: 'pending',
          locationVerified: false
        }
      });
    }

    const verification = transformToFrontend(verifications[0]);

    res.json({
      status: 'success',
      verificationStatus: {
        bookingId: verification.bookingId,
        otpSent: !!verification.otpSentAt,
        clientOtpEntered: verification.clientOtpEntered,
        companionOtpEntered: verification.companionOtpEntered,
        verificationStatus: verification.verificationStatus,
        locationVerified: verification.locationVerified,
        verifiedAt: verification.verifiedAt,
        failedReason: verification.failedReason,
        distanceFromMeetingClient: verification.distanceFromMeetingClient,
        distanceFromMeetingCompanion: verification.distanceFromMeetingCompanion
      }
    });

  } catch (error) {
    logger.error('verificationController', 'getVerificationStatus', error, {
      userId: req.user.id,
      bookingId: req.params.bookingId
    });
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch verification status',
      error: error.message
    });
  }
};

module.exports = {
  submitOTP,
  getVerificationStatus
};

