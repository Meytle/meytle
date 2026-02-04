/**
 * Booking Expiry Scheduler
 * 
 * HANDLES TWO CRITICAL SCENARIOS:
 * 
 * 1. PENDING BOOKINGS - Auto-expire bookings not approved before meeting time
 *    - Client paid (payment authorized)
 *    - Companion never approved
 *    - Meeting time has passed
 *    - ACTION: Cancel payment authorization → Full refund to client
 * 
 * 2. APPROVED NO-SHOW - Auto-refund bookings with no OTP verification
 *    - Booking was approved
 *    - Meeting time has passed (30+ minutes after end time)
 *    - No OTP verification (meeting didn't happen)
 *    - ACTION: Cancel payment authorization → Full refund to client
 * 
 * Runs every 10 minutes to check for expired bookings
 */

const cron = require('node-cron');
const { pool } = require('../config/database');
const { createNotification } = require('../services/notificationService');
const stripeService = require('../services/stripeService');
const logger = require('../services/logger');

/**
 * Process bookings that need to be expired/refunded/completed
 * Runs every 10 minutes to check for expired bookings
 */
const processBookingExpiry = async () => {
  let connection;

  try {
    connection = await pool.getConnection();

    logger.info('bookingExpiryScheduler', 'processBookingExpiry', 'Starting booking expiry check');

    // Process all scenarios
    await processPendingExpiredBookings(connection);
    await processNoShowRefunds(connection);
    await autoCompleteMeetings(connection);
    await processExpiredCustomRequests(connection);

  } catch (error) {
    logger.error('bookingExpiryScheduler', 'processBookingExpiry', error, {
      message: 'Error in booking expiry scheduler'
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

/**
 * SCENARIO 1: Expire pending bookings that weren't approved before meeting time
 * - Status = 'pending'
 * - Payment authorized (payment_status = 'authorized')
 * - Meeting start time has passed (booking_date + start_time < NOW)
 * 
 * @param {object} connection - Database connection
 */
const processPendingExpiredBookings = async (connection) => {
  try {
    logger.info('bookingExpiryScheduler', 'processPendingExpiredBookings', 'Checking for expired pending bookings');

    // Find pending bookings that have passed their start time
    const [expiredBookings] = await connection.execute(
      `SELECT 
        b.id as booking_id,
        b.booking_date,
        b.start_time,
        b.end_time,
        b.total_amount,
        b.payment_intent_id,
        b.companion_id,
        b.client_id,
        client.name as client_name,
        client.email as client_email,
        companion.name as companion_name,
        companion.email as companion_email,
        TIMESTAMPDIFF(MINUTE, CONCAT(b.booking_date, ' ', b.start_time), NOW()) as minutes_past_start
      FROM bookings b
      INNER JOIN users client ON b.client_id = client.id
      INNER JOIN users companion ON b.companion_id = companion.id
      WHERE b.status = 'pending'
        AND b.payment_status = 'authorized'
        AND b.payment_intent_id IS NOT NULL
        AND CONCAT(b.booking_date, ' ', b.start_time) < NOW()`
    );

    if (expiredBookings.length === 0) {
      logger.info('bookingExpiryScheduler', 'processPendingExpiredBookings', 'No expired pending bookings found');
      return;
    }

    logger.info('bookingExpiryScheduler', 'processPendingExpiredBookings', 
      `Found ${expiredBookings.length} expired pending booking(s) to process`, {
      bookingsDetails: expiredBookings.map(b => ({
        bookingId: b.booking_id,
        minutesPastStart: b.minutes_past_start
      }))
    });

    // Process each expired booking
    for (const booking of expiredBookings) {
      try {
        await expirePendingBooking(connection, booking);
      } catch (bookingError) {
        logger.error('bookingExpiryScheduler', 'processPendingExpiredBookings', bookingError, {
          bookingId: booking.booking_id,
          message: 'Failed to expire individual booking'
        });
        // Continue with other bookings even if one fails
      }
    }

  } catch (error) {
    logger.error('bookingExpiryScheduler', 'processPendingExpiredBookings', error, {
      message: 'Error processing pending expired bookings'
    });
  }
};

/**
 * SCENARIO 2: Refund approved bookings with no OTP verification (no-show)
 * - Status = 'confirmed'
 * - Payment authorized (payment_status = 'authorized')
 * - Meeting end time has passed by 30+ minutes
 * - No OTP verification in booking_verification table
 * 
 * @param {object} connection - Database connection
 */
const processNoShowRefunds = async (connection) => {
  try {
    logger.info('bookingExpiryScheduler', 'processNoShowRefunds', 'Checking for no-show bookings requiring refund');

    // Find confirmed bookings with no verification after meeting ended (30 min buffer)
    const [noShowBookings] = await connection.execute(
      `SELECT 
        b.id as booking_id,
        b.booking_date,
        b.start_time,
        b.end_time,
        b.total_amount,
        b.payment_intent_id,
        b.companion_id,
        b.client_id,
        client.name as client_name,
        client.email as client_email,
        companion.name as companion_name,
        companion.email as companion_email,
        TIMESTAMPDIFF(MINUTE, CONCAT(b.booking_date, ' ', b.end_time), NOW()) as minutes_past_end
      FROM bookings b
      INNER JOIN users client ON b.client_id = client.id
      INNER JOIN users companion ON b.companion_id = companion.id
      LEFT JOIN booking_verification bv ON b.id = bv.booking_id
      WHERE (b.status = 'confirmed' OR b.status = 'payment_held')
        AND b.payment_status = 'authorized'
        AND b.payment_intent_id IS NOT NULL
        AND b.verification_required = TRUE
        AND (bv.booking_id IS NULL OR bv.verification_status != 'verified')
        AND TIMESTAMPDIFF(MINUTE, CONCAT(b.booking_date, ' ', b.end_time), NOW()) >= 30`
    );

    if (noShowBookings.length === 0) {
      logger.info('bookingExpiryScheduler', 'processNoShowRefunds', 'No no-show bookings found');
      return;
    }

    logger.info('bookingExpiryScheduler', 'processNoShowRefunds', 
      `Found ${noShowBookings.length} no-show booking(s) requiring refund`, {
      bookingsDetails: noShowBookings.map(b => ({
        bookingId: b.booking_id,
        minutesPastEnd: b.minutes_past_end
      }))
    });

    // Process each no-show booking
    for (const booking of noShowBookings) {
      try {
        await refundNoShowBooking(connection, booking);
      } catch (bookingError) {
        logger.error('bookingExpiryScheduler', 'processNoShowRefunds', bookingError, {
          bookingId: booking.booking_id,
          message: 'Failed to refund no-show booking'
        });
        // Continue with other bookings even if one fails
      }
    }

  } catch (error) {
    logger.error('bookingExpiryScheduler', 'processNoShowRefunds', error, {
      message: 'Error processing no-show refunds'
    });
  }
};

/**
 * Expire a single pending booking
 * @param {object} connection - Database connection
 * @param {object} booking - Booking details
 */
const expirePendingBooking = async (connection, booking) => {
  const {
    booking_id,
    booking_date,
    start_time,
    end_time,
    total_amount,
    payment_intent_id,
    client_id,
    client_name,
    client_email,
    companion_id,
    companion_name,
    companion_email,
    minutes_past_start
  } = booking;

  logger.info('bookingExpiryScheduler', 'expirePendingBooking', 
    `Processing expired pending booking ${booking_id} (${minutes_past_start} minutes past start)`);

  // Start transaction
  await connection.beginTransaction();

  try {
    // Step 1: Cancel the Stripe payment authorization (full refund)
    try {
      await stripeService.cancelAuthorization(booking_id);
      logger.info('bookingExpiryScheduler', 'expirePendingBooking', 
        `Payment authorization cancelled for booking ${booking_id}`, {
        paymentIntentId: payment_intent_id
      });
    } catch (stripeError) {
      logger.error('bookingExpiryScheduler', 'expirePendingBooking', stripeError, {
        bookingId: booking_id,
        message: 'Failed to cancel Stripe authorization'
      });
      throw new Error(`Stripe cancellation failed: ${stripeError.message}`);
    }

    // Step 2: Update booking status to 'expired'
    await connection.execute(
      `UPDATE bookings 
       SET status = 'expired',
           payment_status = 'refunded',
           cancelled_at = NOW(),
           cancelled_by = 'system',
           cancellation_reason = 'Booking expired - companion did not approve before meeting time'
       WHERE id = ?`,
      [booking_id]
    );

    logger.info('bookingExpiryScheduler', 'expirePendingBooking', 
      `Booking ${booking_id} marked as expired`, {
      bookingId: booking_id,
      refundAmount: total_amount.toFixed(2)
    });

    // Commit transaction
    await connection.commit();

    // Step 3: Send notifications (after commit)
    try {
      // Notify client
      await createNotification(
        client_id,
        'booking',
        '💰 Booking Expired - Full Refund',
        `Your booking with ${companion_name} on ${booking_date} expired (not approved in time). Your payment of $${total_amount.toFixed(2)} has been fully refunded.`,
        '/client-dashboard'
      );

      // Notify companion
      await createNotification(
        companion_id,
        'booking',
        '⚠️ Booking Expired',
        `Your pending booking request from ${client_name} on ${booking_date} expired. You did not approve it before the meeting time.`,
        '/companion-dashboard'
      );

      logger.info('bookingExpiryScheduler', 'expirePendingBooking', 
        `Notifications sent for expired booking ${booking_id}`);

    } catch (notificationError) {
      logger.error('bookingExpiryScheduler', 'expirePendingBooking', notificationError, {
        bookingId: booking_id,
        message: 'Failed to send expiry notifications'
      });
      // Don't throw - booking is already expired and refunded
    }

    logger.info('bookingExpiryScheduler', 'expirePendingBooking', 
      `Successfully expired booking ${booking_id}`, {
      bookingId: booking_id,
      refundAmount: total_amount.toFixed(2)
    });

  } catch (error) {
    // Rollback transaction on error
    await connection.rollback();
    logger.error('bookingExpiryScheduler', 'expirePendingBooking', error, {
      bookingId: booking_id,
      message: 'Failed to expire booking, transaction rolled back'
    });
    throw error;
  }
};

/**
 * Refund a no-show booking (approved but no OTP verification)
 * @param {object} connection - Database connection
 * @param {object} booking - Booking details
 */
const refundNoShowBooking = async (connection, booking) => {
  const {
    booking_id,
    booking_date,
    start_time,
    end_time,
    total_amount,
    payment_intent_id,
    client_id,
    client_name,
    client_email,
    companion_id,
    companion_name,
    companion_email,
    minutes_past_end
  } = booking;

  logger.info('bookingExpiryScheduler', 'refundNoShowBooking', 
    `Processing no-show booking ${booking_id} (${minutes_past_end} minutes past end)`);

  // Start transaction
  await connection.beginTransaction();

  try {
    // Step 1: Cancel the Stripe payment authorization (full refund to client)
    try {
      await stripeService.cancelAuthorization(booking_id);
      logger.info('bookingExpiryScheduler', 'refundNoShowBooking', 
        `Payment authorization cancelled for no-show booking ${booking_id}`, {
        paymentIntentId: payment_intent_id
      });
    } catch (stripeError) {
      logger.error('bookingExpiryScheduler', 'refundNoShowBooking', stripeError, {
        bookingId: booking_id,
        message: 'Failed to cancel Stripe authorization'
      });
      throw new Error(`Stripe cancellation failed: ${stripeError.message}`);
    }

    // Step 2: Update booking status to 'no_show'
    await connection.execute(
      `UPDATE bookings 
       SET status = 'no_show',
           payment_status = 'refunded',
           cancelled_at = NOW(),
           cancelled_by = 'system',
           cancellation_reason = 'No OTP verification - meeting did not occur'
       WHERE id = ?`,
      [booking_id]
    );

    logger.info('bookingExpiryScheduler', 'refundNoShowBooking', 
      `Booking ${booking_id} marked as no-show`, {
      bookingId: booking_id,
      refundAmount: total_amount.toFixed(2)
    });

    // Commit transaction
    await connection.commit();

    // Step 3: Send notifications (after commit)
    try {
      // Notify client
      await createNotification(
        client_id,
        'booking',
        '💰 Full Refund - Meeting Not Verified',
        `Your booking with ${companion_name} on ${booking_date} was not verified (no OTP shared). Your payment of $${total_amount.toFixed(2)} has been fully refunded.`,
        '/client-dashboard'
      );

      // Notify companion
      await createNotification(
        companion_id,
        'booking',
        '⚠️ Booking Not Verified - No Payment',
        `Your booking with ${client_name} on ${booking_date} was not verified with OTP. No payment was released. Please ensure you share OTP codes for future bookings.`,
        '/companion-dashboard'
      );

      logger.info('bookingExpiryScheduler', 'refundNoShowBooking', 
        `Notifications sent for no-show booking ${booking_id}`);

    } catch (notificationError) {
      logger.error('bookingExpiryScheduler', 'refundNoShowBooking', notificationError, {
        bookingId: booking_id,
        message: 'Failed to send no-show notifications'
      });
      // Don't throw - booking is already processed and refunded
    }

    logger.info('bookingExpiryScheduler', 'refundNoShowBooking', 
      `Successfully refunded no-show booking ${booking_id}`, {
      bookingId: booking_id,
      refundAmount: total_amount.toFixed(2)
    });

  } catch (error) {
    // Rollback transaction on error
    await connection.rollback();
    logger.error('bookingExpiryScheduler', 'refundNoShowBooking', error, {
      bookingId: booking_id,
      message: 'Failed to refund no-show booking, transaction rolled back'
    });
    throw error;
  }
};

/**
 * SCENARIO 3: Auto-complete meetings that are past their end time
 * - Status = 'meeting_started'
 * - Payment captured (payment_status = 'paid')
 * - Meeting end time has passed
 *
 * @param {object} connection - Database connection
 */
const autoCompleteMeetings = async (connection) => {
  try {
    logger.info('bookingExpiryScheduler', 'autoCompleteMeetings', 'Checking for meetings to auto-complete');

    // Find meeting_started bookings that have passed their end time
    const [meetingsToComplete] = await connection.execute(
      `SELECT
        b.id as booking_id,
        b.booking_date,
        b.start_time,
        b.end_time,
        b.total_amount,
        b.companion_id,
        b.client_id,
        client.name as client_name,
        companion.name as companion_name,
        TIMESTAMPDIFF(MINUTE, CONCAT(b.booking_date, ' ', b.end_time), NOW()) as minutes_past_end
      FROM bookings b
      INNER JOIN users client ON b.client_id = client.id
      INNER JOIN users companion ON b.companion_id = companion.id
      WHERE b.status = 'meeting_started'
        AND b.payment_status = 'paid'
        AND CONCAT(b.booking_date, ' ', b.end_time) < NOW()`
    );

    if (meetingsToComplete.length === 0) {
      logger.info('bookingExpiryScheduler', 'autoCompleteMeetings', 'No meetings to auto-complete');
      return;
    }

    logger.info('bookingExpiryScheduler', 'autoCompleteMeetings',
      `Found ${meetingsToComplete.length} meeting(s) to auto-complete`, {
      bookingsDetails: meetingsToComplete.map(b => ({
        bookingId: b.booking_id,
        minutesPastEnd: b.minutes_past_end
      }))
    });

    // Process each meeting
    for (const meeting of meetingsToComplete) {
      try {
        await completeMeeting(connection, meeting);
      } catch (meetingError) {
        logger.error('bookingExpiryScheduler', 'autoCompleteMeetings', meetingError, {
          bookingId: meeting.booking_id,
          message: 'Failed to auto-complete individual meeting'
        });
        // Continue with other meetings even if one fails
      }
    }

  } catch (error) {
    logger.error('bookingExpiryScheduler', 'autoCompleteMeetings', error, {
      message: 'Error processing auto-complete meetings'
    });
  }
};

/**
 * Complete a single meeting that has ended
 * @param {object} connection - Database connection
 * @param {object} meeting - Meeting details
 */
const completeMeeting = async (connection, meeting) => {
  const {
    booking_id,
    booking_date,
    client_id,
    client_name,
    companion_id,
    companion_name,
    minutes_past_end
  } = meeting;

  logger.info('bookingExpiryScheduler', 'completeMeeting',
    `Auto-completing meeting ${booking_id} (${minutes_past_end} minutes past end)`);

  try {
    // Update booking status to 'completed'
    await connection.execute(
      `UPDATE bookings
       SET status = 'completed'
       WHERE id = ? AND status = 'meeting_started'`,
      [booking_id]
    );

    logger.info('bookingExpiryScheduler', 'completeMeeting',
      `Booking ${booking_id} auto-completed successfully`);

    // Send notifications
    try {
      // Notify client to leave a review
      await createNotification(
        client_id,
        'booking',
        '✅ Meeting Completed',
        `Your meeting with ${companion_name} on ${booking_date} has been completed. Please leave a review!`,
        '/client-dashboard'
      );

      // Notify companion
      await createNotification(
        companion_id,
        'booking',
        '✅ Meeting Completed',
        `Your meeting with ${client_name} on ${booking_date} has been completed.`,
        '/companion-dashboard'
      );

      logger.info('bookingExpiryScheduler', 'completeMeeting',
        `Notifications sent for completed booking ${booking_id}`);

    } catch (notificationError) {
      logger.error('bookingExpiryScheduler', 'completeMeeting', notificationError, {
        bookingId: booking_id,
        message: 'Failed to send completion notifications'
      });
      // Don't throw - booking is already completed
    }

  } catch (error) {
    logger.error('bookingExpiryScheduler', 'completeMeeting', error, {
      bookingId: booking_id,
      message: 'Failed to auto-complete meeting'
    });
    throw error;
  }
};

/**
 * SCENARIO 4: Expire pending custom booking requests
 * - Status = 'pending' in booking_requests table
 * - Either expires_at has passed OR requested meeting time has passed
 * - Cancel Stripe payment authorization and notify client
 *
 * @param {object} connection - Database connection
 */
const processExpiredCustomRequests = async (connection) => {
  try {
    logger.info('bookingExpiryScheduler', 'processExpiredCustomRequests', 'Checking for expired custom requests');

    // Find pending requests that have expired (expires_at passed) or meeting time has passed
    const [expiredRequests] = await connection.execute(
      `SELECT
        br.id,
        br.client_id,
        br.companion_id,
        br.payment_intent_id,
        br.requested_date,
        br.start_time,
        br.expires_at,
        client.name as client_name,
        companion.name as companion_name
      FROM booking_requests br
      INNER JOIN users client ON br.client_id = client.id
      INNER JOIN users companion ON br.companion_id = companion.id
      WHERE br.status = 'pending'
        AND (
          br.expires_at < NOW()
          OR (br.start_time IS NOT NULL AND CONCAT(br.requested_date, ' ', br.start_time) < NOW())
        )`
    );

    if (expiredRequests.length === 0) {
      logger.info('bookingExpiryScheduler', 'processExpiredCustomRequests', 'No expired custom requests found');
      return;
    }

    logger.info('bookingExpiryScheduler', 'processExpiredCustomRequests',
      `Found ${expiredRequests.length} expired custom request(s)`);

    for (const request of expiredRequests) {
      try {
        // Cancel Stripe payment authorization
        if (request.payment_intent_id) {
          try {
            const pi = await stripeService.retrievePaymentIntent(request.payment_intent_id);
            if (pi.status === 'requires_capture') {
              await stripeService.cancelPaymentIntent(request.payment_intent_id);
            }
          } catch (stripeErr) {
            logger.error('bookingExpiryScheduler', 'processExpiredCustomRequests', stripeErr, {
              requestId: request.id, message: 'Failed to cancel Stripe authorization'
            });
          }
        }

        // Mark request as expired
        await connection.execute(
          `UPDATE booking_requests
           SET status = 'expired',
               payment_status = 'refunded',
               responded_at = NOW()
           WHERE id = ?`,
          [request.id]
        );

        // Notify client
        await createNotification(
          request.client_id,
          'booking',
          'Custom Request Expired',
          `Your custom booking request with ${request.companion_name} for ${request.requested_date} has expired. Your payment has been refunded.`,
          '/client-dashboard'
        );

        // Notify companion
        await createNotification(
          request.companion_id,
          'booking',
          'Custom Request Expired',
          `A custom booking request from ${request.client_name} for ${request.requested_date} has expired without response.`,
          '/companion-dashboard'
        );

        logger.info('bookingExpiryScheduler', 'processExpiredCustomRequests',
          `Expired custom request ${request.id}`);

      } catch (requestError) {
        logger.error('bookingExpiryScheduler', 'processExpiredCustomRequests', requestError, {
          requestId: request.id, message: 'Failed to expire custom request'
        });
      }
    }
  } catch (error) {
    logger.error('bookingExpiryScheduler', 'processExpiredCustomRequests', error, {
      message: 'Error processing expired custom requests'
    });
  }
};

/**
 * Initialize the booking expiry scheduler
 * Runs every 10 minutes
 */
const initializeBookingExpiryScheduler = () => {
  // Run every 10 minutes
  const scheduledJob = cron.schedule('*/10 * * * *', async () => {
    try {
      await processBookingExpiry();
    } catch (error) {
      logger.error('bookingExpiryScheduler', 'initializeBookingExpiryScheduler', error, {
        message: 'Error in scheduled booking expiry job'
      });
    }
  });

  logger.info('bookingExpiryScheduler', 'initializeBookingExpiryScheduler', 
    'Booking expiry scheduler initialized - running every 10 minutes');

  return scheduledJob;
};

module.exports = {
  initializeBookingExpiryScheduler,
  processBookingExpiry,
  processPendingExpiredBookings,
  processNoShowRefunds,
  autoCompleteMeetings,
  processExpiredCustomRequests
};

