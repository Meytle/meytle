/**
 * OTP Verification Controller
 * Handles meeting verification with OTP codes and GPS location
 * Supports time extension if user is not at location (max 20 min total: 10 base + 10 extension)
 */

const { pool } = require('../../config/database');
const { isNearMeetingLocation } = require('../../utils/gpsHelper');
const logger = require('../../services/logger');
const { sendSuccess, sendBadRequest, sendNotFound, sendError } = require('../../utils/responseHelpers');
const stripeService = require('../../services/stripeService');
const { createNotification, notificationTemplates } = require('../../services/notificationService');

// Configuration
const BASE_VERIFICATION_MINUTES = 10;
const EXTENSION_MINUTES = 10;
const MAX_TOTAL_MINUTES = 20; // 10 base + 10 extension
const PROXIMITY_RADIUS_METERS = 5000; // 5km radius - if within this, auto-pass
// If outside 5km, user gets confirmation prompt to proceed anyway

/**
 * Calculate the verification deadline for a booking
 * Uses dynamic deadline if set, otherwise calculates from start time
 */
function getDeadline(booking) {
  // If dynamic deadline is set, use it
  if (booking.verification_deadline) {
    const deadline = new Date(booking.verification_deadline);
    if (!isNaN(deadline.getTime())) {
      return deadline;
    }
  }

  // Format booking_date - MySQL may return Date object or string
  let dateStr = booking.booking_date;
  if (dateStr instanceof Date) {
    dateStr = dateStr.toISOString().split('T')[0]; // YYYY-MM-DD
  } else if (typeof dateStr === 'string' && dateStr.includes('T')) {
    dateStr = dateStr.split('T')[0]; // Extract date part
  }

  // Format start_time - ensure HH:MM:SS format
  let timeStr = booking.start_time;
  if (timeStr instanceof Date) {
    // MySQL may return TIME as Date object - extract HH:MM:SS
    timeStr = timeStr.toISOString().split('T')[1].split('.')[0];
  } else if (typeof timeStr === 'string' && timeStr.length === 5) {
    timeStr = timeStr + ':00'; // Add seconds if missing
  }

  // Create meeting start time (stored as UTC in DB)
  const meetingStartTime = new Date(`${dateStr}T${timeStr}Z`);

  // Validate the date
  if (isNaN(meetingStartTime.getTime())) {
    console.error('[OTP DEBUG] Invalid meeting start time:', {
      booking_date: booking.booking_date,
      start_time: booking.start_time,
      dateStr,
      timeStr
    });
    // Fallback to current time + verification minutes
    return new Date(Date.now() + BASE_VERIFICATION_MINUTES * 60 * 1000);
  }

  return new Date(meetingStartTime.getTime() + BASE_VERIFICATION_MINUTES * 60 * 1000);
}

/**
 * Format a Date object to MySQL DATETIME string
 * @param {Date} date
 * @returns {string} MySQL-compatible datetime string (YYYY-MM-DD HH:MM:SS)
 */
function formatDateForMySQL(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Format distance in meters to human-readable string
 * @param {number} meters - Distance in meters
 * @returns {string} Formatted distance (e.g., "6.2 km" or "500 meters")
 */
function formatDistance(meters) {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} meters`;
}

/**
 * Log verification attempt to database for admin audit trail
 * Uses pool directly (not transaction connection) to ensure audit logs persist
 * even when the main transaction is rolled back
 * @param {object} data - Attempt data
 */
async function logVerificationAttempt(data) {
  try {
    // Use pool directly so audit logs persist regardless of transaction outcome
    await pool.execute(
      `INSERT INTO verification_attempts
       (booking_id, user_id, user_role, attempt_type, user_lat, user_lon, meeting_lat, meeting_lon, distance_meters, success, failure_reason, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.bookingId,
        data.userId,
        data.userRole,
        data.attemptType || 'verify',
        data.userLat,
        data.userLon,
        data.meetingLat || 0,
        data.meetingLon || 0,
        data.distance || 0,
        data.success ? 1 : 0,
        data.failureReason || null,
        data.ipAddress || null,
        data.userAgent || null
      ]
    );
  } catch (error) {
    // Don't fail the main operation if logging fails
    logger.warn('otpVerificationController', 'logVerificationAttempt', 'Failed to log attempt', {
      error: error.message,
      bookingId: data.bookingId
    });
  }
}

/**
 * Verify OTP and capture GPS location
 * @route POST /api/booking/:bookingId/verify-otp
 * @access Private (Client or Companion)
 */
const verifyOTP = async (req, res) => {
  const { bookingId } = req.params;
  const { otpCode, latitude, longitude, confirmLocation } = req.body; // confirmLocation = user confirmed they're at location despite GPS
  const userId = req.user.id;
  const userRole = req.user.activeRole || req.user.role;
  const ipAddress = req.ip || req.connection?.remoteAddress || null;
  const userAgent = req.get('User-Agent') || null;

  console.log('[OTP DEBUG] === VERIFY OTP REQUEST START ===');
  console.log('[OTP DEBUG] bookingId:', bookingId);
  console.log('[OTP DEBUG] userId:', userId);
  console.log('[OTP DEBUG] userRole:', userRole);
  console.log('[OTP DEBUG] otpCode:', otpCode);
  console.log('[OTP DEBUG] latitude:', latitude);
  console.log('[OTP DEBUG] longitude:', longitude);
  console.log('[OTP DEBUG] confirmLocation:', confirmLocation);

  logger.info('otpVerificationController', 'verifyOTP', 'OTP verification attempt', {
    bookingId,
    userId,
    userRole,
    hasOTP: !!otpCode,
    hasGPS: !!(latitude && longitude)
  });

  // Validate inputs
  if (!otpCode || !latitude || !longitude) {
    return sendBadRequest(res, 'OTP code and GPS location are required');
  }

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return sendBadRequest(res, 'Invalid GPS coordinates');
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Get booking details with verification info (including extension columns)
    const [bookings] = await connection.execute(
      `SELECT
        b.id,
        b.client_id,
        b.companion_id,
        b.booking_date,
        b.start_time,
        b.end_time,
        b.status,
        b.payment_status,
        b.payment_intent_id,
        b.meeting_location_lat,
        b.meeting_location_lon,
        b.meeting_location,
        bv.client_otp,
        bv.companion_otp,
        bv.client_verified_at,
        bv.companion_verified_at,
        bv.verification_status,
        bv.otp_sent_at,
        bv.extension_used,
        bv.verification_deadline
      FROM bookings b
      INNER JOIN booking_verification bv ON b.id = bv.booking_id
      WHERE b.id = ? AND (b.client_id = ? OR b.companion_id = ?)`,
      [bookingId, userId, userId]
    );

    if (bookings.length === 0) {
      await connection.rollback();
      return sendNotFound(res, 'Booking not found or you do not have access');
    }

    const booking = bookings[0];

    console.log('[OTP DEBUG] Booking fetched:', {
      bookingId: booking.id,
      clientId: booking.client_id,
      companionId: booking.companion_id,
      status: booking.status,
      paymentStatus: booking.payment_status,
      clientOTP: booking.client_otp,
      companionOTP: booking.companion_otp,
      clientVerifiedAt: booking.client_verified_at,
      companionVerifiedAt: booking.companion_verified_at
    });

    // Check if booking is in confirmed or payment_held status
    if (booking.status !== 'confirmed' && booking.status !== 'payment_held') {
      await connection.rollback();
      return sendBadRequest(res, 'Booking is not in confirmed status');
    }

    // Check if OTP was sent
    if (!booking.otp_sent_at) {
      await connection.rollback();
      return sendBadRequest(res, 'OTP has not been sent for this booking yet');
    }

    // Re-fetch the latest verification_deadline with FOR UPDATE to avoid race condition
    // (another request may have extended the deadline after our initial fetch)
    const [freshVerification] = await connection.execute(
      `SELECT verification_deadline, extension_used
       FROM booking_verification
       WHERE booking_id = ?
       FOR UPDATE`,
      [bookingId]
    );

    // Use fresh deadline data for the check
    const freshDeadline = freshVerification[0]?.verification_deadline
      ? new Date(freshVerification[0].verification_deadline)
      : getDeadline(booking);

    // Update booking object with fresh extension_used value
    booking.extension_used = freshVerification[0]?.extension_used;

    const now = new Date();

    if (now > freshDeadline) {
      await connection.rollback();
      return sendBadRequest(res, 'Verification window has expired');
    }

    // Determine if user is client or companion
    const isClient = userId === booking.client_id;
    const isCompanion = userId === booking.companion_id;

    if (!isClient && !isCompanion) {
      await connection.rollback();
      return sendBadRequest(res, 'You are not authorized for this booking');
    }

    // Check if user already verified
    if ((isClient && booking.client_verified_at) || (isCompanion && booking.companion_verified_at)) {
      await connection.rollback();
      return sendBadRequest(res, 'You have already verified this booking');
    }

    // STEP 1: Check GPS location (within 5km = auto-pass, outside 5km = ask for confirmation)
    let gpsDistance = 0;
    let gpsConfirmedByUser = false;

    if (booking.meeting_location_lat && booking.meeting_location_lon) {
      const proximityCheck = isNearMeetingLocation(
        latitude,
        longitude,
        booking.meeting_location_lat,
        booking.meeting_location_lon,
        PROXIMITY_RADIUS_METERS
      );
      gpsDistance = proximityCheck.distance;

      if (!proximityCheck.isNearby) {
        // User is outside 5km radius

        if (!confirmLocation) {
          // User hasn't confirmed yet - ask them to confirm
          logger.info('otpVerificationController', 'verifyOTP', 'User outside radius, asking for confirmation', {
            bookingId,
            userId,
            distance: proximityCheck.distance
          });

          // Calculate time remaining
          const minutesRemaining = Math.max(0, Math.floor((freshDeadline - now) / (1000 * 60))) || 0;

          await connection.rollback();
          // Return confirmation prompt (not an error, just asking user to confirm)
          return res.status(200).json({
            status: 'confirm_required',
            type: 'CONFIRM_LOCATION',
            message: `GPS shows you are ${formatDistance(proximityCheck.distance)} away. Are you at the meeting location?`,
            data: {
              distance: proximityCheck.distance,
              distanceFormatted: formatDistance(proximityCheck.distance),
              minutesRemaining: minutesRemaining,
              userLocation: { lat: latitude, lon: longitude },
              meetingLocation: {
                lat: booking.meeting_location_lat,
                lon: booking.meeting_location_lon,
                address: booking.meeting_location
              }
            }
          });
        }

        // User confirmed they are at location despite GPS showing otherwise
        gpsConfirmedByUser = true;
        logger.warn('otpVerificationController', 'verifyOTP', 'User confirmed location despite GPS mismatch', {
          bookingId,
          userId,
          distance: proximityCheck.distance,
          userConfirmed: true
        });
      } else {
        logger.info('otpVerificationController', 'verifyOTP', 'GPS proximity check passed', {
          bookingId,
          userId,
          distance: proximityCheck.distance
        });
      }
    }

    // STEP 2: Verify OTP code (only if GPS check passed)
    const expectedOTP = isClient ? booking.client_otp : booking.companion_otp;

    console.log('[OTP DEBUG] OTP comparison:', {
      isClient,
      enteredOTP: otpCode,
      expectedOTP,
      match: otpCode === expectedOTP,
      enteredType: typeof otpCode,
      expectedType: typeof expectedOTP
    });

    if (otpCode !== expectedOTP) {
      logger.warn('otpVerificationController', 'verifyOTP', 'Invalid OTP code provided', {
        bookingId,
        userId,
        userRole
      });
      await connection.rollback();
      return sendBadRequest(res, 'INVALID_OTP|Invalid verification code. Please check your email and try again.');
    }

    // Log successful verification attempt (includes if user confirmed despite GPS mismatch)
    await logVerificationAttempt({
      bookingId: parseInt(bookingId),
      userId,
      userRole: isClient ? 'client' : 'companion',
      attemptType: 'verify',
      userLat: latitude,
      userLon: longitude,
      meetingLat: booking.meeting_location_lat,
      meetingLon: booking.meeting_location_lon,
      distance: gpsDistance,
      success: true,
      failureReason: gpsConfirmedByUser ? 'USER_CONFIRMED_LOCATION' : null, // Track when user bypassed GPS
      ipAddress,
      userAgent
    });

    // Update verification record
    if (isClient) {
      await connection.execute(
        `UPDATE booking_verification
         SET client_verified_at = NOW(),
             client_verification_lat = ?,
             client_verification_lon = ?
         WHERE booking_id = ?`,
        [latitude, longitude, bookingId]
      );
    } else {
      await connection.execute(
        `UPDATE booking_verification
         SET companion_verified_at = NOW(),
             companion_verification_lat = ?,
             companion_verification_lon = ?
         WHERE booking_id = ?`,
        [latitude, longitude, bookingId]
      );
    }

    // Check if BOTH parties have now verified
    // CRITICAL: Must use FOR UPDATE to bypass REPEATABLE READ snapshot and see latest committed data
    // This prevents race condition where two concurrent verifications don't see each other's updates
    const [verificationStatus] = await connection.execute(
      `SELECT client_verified_at, companion_verified_at
       FROM booking_verification
       WHERE booking_id = ?
       FOR UPDATE`,
      [bookingId]
    );

    const bothVerified =
      verificationStatus[0].client_verified_at &&
      verificationStatus[0].companion_verified_at;

    console.log('[OTP DEBUG] Verification check:', {
      bookingId,
      userId,
      clientVerifiedAt: verificationStatus[0].client_verified_at,
      companionVerifiedAt: verificationStatus[0].companion_verified_at,
      bothVerified,
      paymentStatus: booking.payment_status,
      paymentIntentId: booking.payment_intent_id ? 'EXISTS' : 'NULL'
    });

    if (bothVerified) {
      console.log('[OTP DEBUG] STEP: Both parties verified!');
      logger.info('otpVerificationController', 'verifyOTP', 'BOTH PARTIES VERIFIED - Completing booking', {
        bookingId
      });

      // Update verification status
      await connection.execute(
        `UPDATE booking_verification
         SET verification_status = 'verified',
             both_verified_at = NOW()
         WHERE booking_id = ?`,
        [bookingId]
      );

      // Update booking status to meeting_started BEFORE payment capture
      // This ensures verification is saved even if payment fails
      console.log('[OTP DEBUG] STEP: Updating booking status to meeting_started...');
      await connection.execute(
        `UPDATE bookings
         SET status = 'meeting_started',
             updated_at = NOW()
         WHERE id = ?`,
        [bookingId]
      );

      // CRITICAL: Commit verification FIRST before attempting payment capture
      // This ensures client_verified_at is saved even if payment capture fails
      console.log('[OTP DEBUG] STEP: Committing verification transaction...');
      await connection.commit();
      console.log('[OTP DEBUG] STEP: Verification committed successfully!');

      // Release connection back to pool since transaction is complete
      connection.release();
      connection = null; // Prevent double release in finally block

      // Track payment success for response
      let paymentSuccess = false;
      let transferSuccess = false;

      // Now capture payment in a SEPARATE operation (not in transaction)
      // Payment failure should NOT undo the verification
      console.log('[OTP DEBUG] STEP: Starting payment capture (separate from verification)...');
      console.log('[OTP DEBUG] payment_status:', booking.payment_status);
      console.log('[OTP DEBUG] payment_intent_id:', booking.payment_intent_id);

      if ((booking.payment_status === 'authorized' || booking.payment_status === 'pending') && booking.payment_intent_id) {
        try {
          // Step 1: Capture the payment (charge the client)
          console.log('[OTP DEBUG] STEP: Calling stripeService.capturePayment...');
          const captureResult = await stripeService.capturePayment(bookingId);
          console.log('[OTP DEBUG] STEP: Payment captured successfully!');
          logger.info('otpVerificationController', 'verifyOTP', 'Payment captured successfully', {
            bookingId,
            paymentIntentId: booking.payment_intent_id,
            platformFee: captureResult.platformFeeAmount,
            companionAmount: captureResult.companionAmount
          });
          paymentSuccess = true;
        } catch (paymentError) {
          // Payment capture failed - but verification is already saved!
          console.error('[OTP DEBUG] Payment capture failed:', paymentError.message);
          logger.error('otpVerificationController', 'verifyOTP', paymentError, {
            bookingId,
            message: 'Payment capture failed - verification was saved'
          });

          // Update payment status to failed (using pool since connection was released)
          try {
            await pool.execute(
              `UPDATE bookings
               SET payment_status = 'failed',
                   updated_at = NOW()
               WHERE id = ?`,
              [bookingId]
            );
          } catch (updateError) {
            console.error('[OTP DEBUG] Failed to update payment status:', updateError.message);
          }

          // Still return success for verification, but note payment issue
          // The user verified successfully - payment is a separate concern
        }
      } else {
        console.log('[OTP DEBUG] Payment capture skipped - no payment intent or wrong status');
      }

      // Step 2: Transfer to companion (after transaction commit to ensure verification is saved)
      // The transfer function now handles failures gracefully and marks them for manual processing
      let transferResult = null;
      let transferPendingManual = false;

      if (paymentSuccess) {
        try {
          transferResult = await stripeService.transferToCompanion(bookingId);

          if (transferResult.success) {
            transferSuccess = true;
            logger.info('otpVerificationController', 'verifyOTP', 'Transfer to companion completed', {
              bookingId,
              transferId: transferResult.transferId,
              companionEarnings: transferResult.companionEarnings
            });
          } else if (transferResult.requiresManualProcessing) {
            // Transfer failed but marked for manual processing
            // Booking is still completed, just needs admin attention for payout
            transferPendingManual = true;
            logger.warn('otpVerificationController', 'verifyOTP', 'Transfer marked for manual processing', {
              bookingId,
              reason: transferResult.reason,
              companionEarnings: transferResult.companionEarnings,
              message: transferResult.message
            });
          }

          // Send payment received notification to companion (even if transfer is pending)
          try {
            const [clientInfo] = await pool.execute(
              'SELECT name FROM users WHERE id = ?',
              [booking.client_id]
            );
            const clientName = clientInfo[0]?.name || 'Client';

            // Customize notification based on transfer status
            if (transferSuccess) {
              const notificationData = notificationTemplates.paymentReceived(
                transferResult.companionEarnings.toFixed(2),
                clientName
              );
              await createNotification(
                booking.companion_id,
                notificationData.type,
                notificationData.title,
                notificationData.message,
                notificationData.actionUrl
              );
            } else if (transferPendingManual) {
              // Notify companion that payment is pending processing
              await createNotification(
                booking.companion_id,
                'payment',
                'Payment Being Processed',
                `Your payment of $${transferResult.companionEarnings.toFixed(2)} from ${clientName} is being processed. You will receive it within 2-3 business days.`,
                '/companion-dashboard'
              );
            }
          } catch (notifyError) {
            logger.controllerWarn('otpVerificationController', 'verifyOTP', 'Failed to send payment notification', {
              bookingId,
              error: notifyError.message
            });
          }
        } catch (transferError) {
          logger.error('otpVerificationController', 'verifyOTP', transferError, {
            bookingId,
            message: 'Transfer to companion failed unexpectedly - requires manual review'
          });
          // Transfer failed unexpectedly - booking should still be marked as completed
          // The stripeService already handles this, but log it here for visibility
        }
      }

      // Emit socket event to BOTH parties so they know meeting is verified
      // This ensures the first verifier's modal closes when the second person verifies
      try {
        const { emitBookingUpdate } = require('../../config/socket');
        emitBookingUpdate(booking.client_id, booking.companion_id, 'meeting_verified', {
          bookingId: parseInt(bookingId),
          status: 'meeting_started',
          paymentCaptured: paymentSuccess,
          transferCompleted: transferSuccess,
          message: 'Both parties verified! Meeting can begin.'
        });
        logger.info('otpVerificationController', 'verifyOTP', 'meeting_verified socket event emitted', {
          bookingId,
          clientId: booking.client_id,
          companionId: booking.companion_id
        });
      } catch (socketError) {
        logger.warn('otpVerificationController', 'verifyOTP', 'Socket emit failed for meeting_verified', {
          bookingId,
          error: socketError.message
        });
      }

      // Send "Meeting Started" notifications to both parties
      try {
        const [userNames] = await pool.execute(
          `SELECT
            (SELECT name FROM users WHERE id = ?) as client_name,
            (SELECT name FROM users WHERE id = ?) as companion_name`,
          [booking.client_id, booking.companion_id]
        );
        const names = userNames[0] || {};

        // Notify client
        await createNotification(
          booking.client_id,
          'booking',
          'Meeting Started',
          `Your meeting with ${names.companion_name || 'your companion'} has started. Enjoy!`,
          '/dashboard'
        );

        // Notify companion
        await createNotification(
          booking.companion_id,
          'booking',
          'Meeting Started',
          `Your meeting with ${names.client_name || 'your client'} has started.`,
          '/companion-dashboard'
        );

        logger.info('otpVerificationController', 'verifyOTP', 'Meeting started notifications sent', {
          bookingId,
          clientId: booking.client_id,
          companionId: booking.companion_id
        });
      } catch (notifyError) {
        logger.warn('otpVerificationController', 'verifyOTP', 'Failed to send meeting started notifications', {
          bookingId,
          error: notifyError.message
        });
      }

      return sendSuccess(res, {
        verified: true,
        bothVerified: true,
        paymentCaptured: paymentSuccess,
        transferCompleted: transferSuccess,
        transferPendingManual: transferPendingManual,
        message: transferSuccess
          ? 'Meeting verified! Payment has been processed and transferred to companion.'
          : transferPendingManual
            ? 'Meeting verified! Payment captured. Companion payout is being processed and will be completed within 2-3 business days.'
            : paymentSuccess
              ? 'Meeting verified! Payment captured. Transfer pending - please contact support if not received.'
              : 'Meeting verified! Payment processing pending.',
        bookingStatus: (transferSuccess || transferPendingManual) ? 'completed' : 'meeting_started'
      }, 200, 'Both parties verified!');
    }

    // Only one party verified so far
    await connection.commit();

    logger.info('otpVerificationController', 'verifyOTP', 'Single party verified', {
      bookingId,
      userId,
      userRole,
      waitingFor: isClient ? 'companion' : 'client'
    });

    return sendSuccess(res, {
      verified: true,
      bothVerified: false,
      message: `You are verified! Waiting for ${isClient ? 'companion' : 'client'} to verify. Stay at the location.`,
      waitingFor: isClient ? 'companion' : 'client'
    }, 200, 'Your verification was successful!');

  } catch (error) {
    if (connection) await connection.rollback();

    // DETAILED ERROR LOGGING for debugging
    console.error('=== OTP VERIFICATION ERROR ===');
    console.error('Booking ID:', bookingId);
    console.error('User ID:', userId);
    console.error('Error Name:', error.name);
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);
    console.error('Full Error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    console.error('==============================');

    logger.error('otpVerificationController', 'verifyOTP', error, {
      bookingId,
      userId,
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack
    });
    return sendError(res, `Failed to verify OTP: ${error.message}`, 500, error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Request extra time for verification (+10 minutes)
 * Only available when NOT_AT_LOCATION error occurs and extension not yet used
 * @route POST /api/booking/:bookingId/extend-verification
 * @access Private (Client or Companion)
 */
const requestExtension = async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user.id;

  logger.info('otpVerificationController', 'requestExtension', 'Extension requested', {
    bookingId,
    userId
  });

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Get booking with verification info
    const [bookings] = await connection.execute(
      `SELECT
        b.id,
        b.client_id,
        b.companion_id,
        b.booking_date,
        b.start_time,
        b.status,
        bv.client_verified_at,
        bv.companion_verified_at,
        bv.extension_used,
        bv.verification_deadline,
        bv.otp_sent_at
      FROM bookings b
      INNER JOIN booking_verification bv ON b.id = bv.booking_id
      WHERE b.id = ? AND (b.client_id = ? OR b.companion_id = ?)`,
      [bookingId, userId, userId]
    );

    if (bookings.length === 0) {
      await connection.rollback();
      return sendNotFound(res, 'Booking not found');
    }

    const booking = bookings[0];
    const isClient = userId === booking.client_id;

    // Validation checks
    if (booking.status !== 'confirmed' && booking.status !== 'payment_held') {
      await connection.rollback();
      return sendBadRequest(res, 'Booking is not in confirmed status');
    }

    if (!booking.otp_sent_at) {
      await connection.rollback();
      return sendBadRequest(res, 'OTP has not been sent yet');
    }

    // Check if user already verified (no extension needed)
    if ((isClient && booking.client_verified_at) || (!isClient && booking.companion_verified_at)) {
      await connection.rollback();
      return sendBadRequest(res, 'You have already verified - no extension needed');
    }

    // Check if extension already used
    if (booking.extension_used) {
      await connection.rollback();
      return sendBadRequest(res, 'Extra time has already been used for this booking');
    }

    // Calculate current deadline and new deadline
    const currentDeadline = getDeadline(booking);
    const now = new Date();

    // Check if current deadline has already passed
    if (now > currentDeadline) {
      await connection.rollback();
      return sendBadRequest(res, 'Verification window has already expired');
    }

    // Calculate new deadline (+10 minutes from current deadline)
    const newDeadline = new Date(currentDeadline.getTime() + EXTENSION_MINUTES * 60 * 1000);

    // Update database with extension info (format Date for MySQL)
    await connection.execute(
      `UPDATE booking_verification
       SET extension_used = TRUE,
           extension_requested_by = ?,
           extension_requested_at = NOW(),
           verification_deadline = ?
       WHERE booking_id = ?`,
      [isClient ? 'client' : 'companion', formatDateForMySQL(newDeadline), bookingId]
    );

    await connection.commit();

    // Calculate new time remaining
    const newMinutesRemaining = Math.floor((newDeadline.getTime() - now.getTime()) / (1000 * 60));
    const newSecondsRemaining = Math.floor((newDeadline.getTime() - now.getTime()) / 1000);

    logger.info('otpVerificationController', 'requestExtension', 'Extension granted', {
      bookingId,
      userId,
      requestedBy: isClient ? 'client' : 'companion',
      newDeadline: newDeadline.toISOString(),
      newMinutesRemaining
    });

    // Emit socket event to notify BOTH parties about the extension
    try {
      const { emitBookingUpdate } = require('../../config/socket');
      emitBookingUpdate(booking.client_id, booking.companion_id, 'verification_extended', {
        bookingId: parseInt(bookingId),
        extendedBy: isClient ? 'client' : 'companion',
        newDeadline: newDeadline.toISOString(),
        newSecondsRemaining,
        message: `Extra time added. ${newMinutesRemaining} minutes remaining.`
      });
    } catch (socketError) {
      logger.warn('otpVerificationController', 'requestExtension', 'Socket emit failed', {
        bookingId,
        error: socketError.message
      });
    }

    return sendSuccess(res, {
      extended: true,
      newDeadline: newDeadline.toISOString(),
      newSecondsRemaining,
      minutesRemaining: newMinutesRemaining,
      message: `Extra time added! You now have ${newMinutesRemaining} minutes remaining.`
    });

  } catch (error) {
    if (connection) await connection.rollback();
    logger.error('otpVerificationController', 'requestExtension', error, {
      bookingId,
      userId
    });
    return sendError(res, 'Failed to extend verification time', 500, error);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Get verification status for a booking
 * @route GET /api/booking/:bookingId/verification-status
 * @access Private (Client or Companion)
 */
const getVerificationStatus = async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user.id;

  try {
    const [result] = await pool.execute(
      `SELECT
        b.id,
        b.client_id,
        b.companion_id,
        b.booking_date,
        b.start_time,
        b.status,
        bv.client_verified_at,
        bv.companion_verified_at,
        bv.verification_status,
        bv.otp_sent_at,
        bv.both_verified_at,
        bv.extension_used,
        bv.extension_requested_by,
        bv.verification_deadline
      FROM bookings b
      LEFT JOIN booking_verification bv ON b.id = bv.booking_id
      WHERE b.id = ? AND (b.client_id = ? OR b.companion_id = ?)`,
      [bookingId, userId, userId]
    );

    if (result.length === 0) {
      return sendNotFound(res, 'Booking not found');
    }

    const booking = result[0];
    const isClient = userId === booking.client_id;

    // Calculate deadline
    const deadline = getDeadline(booking);
    const now = new Date();
    const secondsRemaining = Math.max(0, Math.floor((deadline.getTime() - now.getTime()) / 1000));

    // Format booking_date for response (handle MySQL Date object)
    let bookingDateStr = booking.booking_date;
    if (bookingDateStr instanceof Date) {
      bookingDateStr = bookingDateStr.toISOString().split('T')[0];
    } else if (typeof bookingDateStr === 'string' && bookingDateStr.includes('T')) {
      bookingDateStr = bookingDateStr.split('T')[0];
    }

    // Format start_time
    let startTimeStr = booking.start_time;
    if (startTimeStr instanceof Date) {
      // MySQL may return TIME as Date object - extract HH:MM:SS
      startTimeStr = startTimeStr.toISOString().split('T')[1].split('.')[0];
    } else if (typeof startTimeStr === 'string' && startTimeStr.length === 5) {
      startTimeStr = startTimeStr + ':00';
    }

    return sendSuccess(res, {
      bookingId: booking.id,
      status: booking.status,
      otpSent: !!booking.otp_sent_at,
      userVerified: isClient ? !!booking.client_verified_at : !!booking.companion_verified_at,
      otherPartyVerified: isClient ? !!booking.companion_verified_at : !!booking.client_verified_at,
      bothVerified: !!booking.both_verified_at,
      verificationStatus: booking.verification_status,
      meetingStartTime: `${bookingDateStr}T${startTimeStr}Z`,
      extensionUsed: !!booking.extension_used,
      extensionRequestedBy: booking.extension_requested_by,
      verificationDeadline: deadline.toISOString(),
      secondsRemaining
    });

  } catch (error) {
    logger.error('otpVerificationController', 'getVerificationStatus', error, {
      bookingId,
      userId
    });
    return sendError(res, 'Failed to get verification status', 500, error);
  }
};

/**
 * Expire verification window (cancel booking due to timeout)
 * Called by frontend when the timer expires
 * @route POST /api/booking/:bookingId/expire-verification
 * @access Private (Client or Companion)
 */
const expireVerification = async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user.id;

  logger.info('otpVerificationController', 'expireVerification', 'Verification expiration requested', {
    bookingId,
    userId
  });

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Get booking with verification info
    const [bookings] = await connection.execute(
      `SELECT
        b.id,
        b.client_id,
        b.companion_id,
        b.booking_date,
        b.start_time,
        b.status,
        b.payment_status,
        b.payment_intent_id,
        b.total_amount,
        bv.client_verified_at,
        bv.companion_verified_at,
        bv.verification_status,
        bv.extension_used,
        bv.verification_deadline
      FROM bookings b
      LEFT JOIN booking_verification bv ON b.id = bv.booking_id
      WHERE b.id = ? AND (b.client_id = ? OR b.companion_id = ?)`,
      [bookingId, userId, userId]
    );

    if (bookings.length === 0) {
      await connection.rollback();
      return sendNotFound(res, 'Booking not found or you do not have access');
    }

    const booking = bookings[0];

    // Check if already expired or cancelled
    if (booking.status === 'cancelled' || booking.verification_status === 'expired') {
      await connection.rollback();
      return sendSuccess(res, { alreadyExpired: true }, 'Booking already cancelled');
    }

    // Check if BOTH verified (meeting completed)
    if (booking.client_verified_at && booking.companion_verified_at) {
      await connection.rollback();
      return sendBadRequest(res, 'Cannot expire - both parties have already verified');
    }

    // Cancel Stripe payment if authorized
    if (booking.payment_status === 'authorized' && booking.payment_intent_id) {
      try {
        await stripeService.cancelPaymentIntent(booking.payment_intent_id);
        logger.info('otpVerificationController', 'expireVerification', 'Payment cancelled', {
          bookingId,
          paymentIntentId: booking.payment_intent_id
        });
      } catch (stripeError) {
        logger.warn('otpVerificationController', 'expireVerification', 'Payment cancellation failed', {
          bookingId,
          error: stripeError.message
        });
        // Continue anyway - payment might already be cancelled
      }
    }

    // Determine cancellation reason based on extension usage
    const cancellationReason = booking.extension_used
      ? 'Verification window expired - no OTP verification within 20 minutes (including extension)'
      : 'Verification window expired - no OTP verification within 10 minutes';

    // Update booking status
    await connection.execute(
      `UPDATE bookings
       SET status = 'cancelled',
           payment_status = 'refunded',
           cancelled_by = 'system',
           cancelled_at = NOW(),
           cancellation_reason = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [cancellationReason, bookingId]
    );

    // Update verification status
    await connection.execute(
      `UPDATE booking_verification
       SET verification_status = 'expired'
       WHERE booking_id = ?`,
      [bookingId]
    );

    await connection.commit();

    logger.info('otpVerificationController', 'expireVerification', 'Booking expired successfully', {
      bookingId,
      clientId: booking.client_id,
      companionId: booking.companion_id,
      extensionWasUsed: booking.extension_used
    });

    // Emit socket event to both parties
    try {
      const { emitBookingUpdate } = require('../../config/socket');
      emitBookingUpdate(booking.client_id, booking.companion_id, 'booking_expired', {
        bookingId,
        status: 'cancelled',
        reason: 'verification_expired',
        message: 'Booking cancelled - verification window expired'
      });
    } catch (socketError) {
      logger.warn('otpVerificationController', 'expireVerification', 'Socket emit failed', {
        bookingId,
        error: socketError.message
      });
    }

    return sendSuccess(res, {
      expired: true,
      bookingId,
      message: 'Booking cancelled due to verification timeout. Full refund will be processed.'
    });

  } catch (error) {
    if (connection) await connection.rollback();
    logger.error('otpVerificationController', 'expireVerification', error, {
      bookingId,
      userId
    });
    return sendError(res, 'Failed to expire verification', 500, error);
  } finally {
    if (connection) connection.release();
  }
};

module.exports = {
  verifyOTP,
  requestExtension,
  getVerificationStatus,
  expireVerification
};
