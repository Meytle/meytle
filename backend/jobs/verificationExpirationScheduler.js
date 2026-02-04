/**
 * Verification Expiration Scheduler
 * Auto-cancels bookings where OTP verification window expired
 * Supports dynamic deadline (10 min base + optional 10 min extension = max 20 min)
 * Runs every minute to check for expired bookings and refunds payments
 */

const cron = require('node-cron');
const { pool } = require('../config/database');
const logger = require('../services/logger');
const stripeService = require('../services/stripeService');

/**
 * Check and cancel expired verification bookings
 * Uses dynamic verification_deadline if set, otherwise falls back to 10 minutes after start
 */
async function checkExpiredVerifications() {
  let connection;
  try {
    connection = await pool.getConnection();

    // Find bookings that expired:
    // - Confirmed status with OTP sent
    // - Not both verified
    // - Past dynamic deadline (or 10 min default if no deadline set)
    const [expiredBookings] = await connection.execute(
      `SELECT
        b.id,
        b.payment_intent_id,
        b.payment_status,
        b.total_amount,
        b.booking_date,
        b.start_time,
        b.client_id,
        b.companion_id,
        bv.otp_sent_at,
        bv.client_verified_at,
        bv.companion_verified_at,
        bv.extension_used,
        bv.verification_deadline
      FROM bookings b
      INNER JOIN booking_verification bv ON b.id = bv.booking_id
      WHERE (b.status = 'confirmed' OR b.status = 'payment_held')
        AND bv.otp_sent_at IS NOT NULL
        AND NOT (bv.client_verified_at IS NOT NULL AND bv.companion_verified_at IS NOT NULL)
        AND NOW() > COALESCE(
          bv.verification_deadline,
          DATE_ADD(CONCAT(b.booking_date, ' ', b.start_time), INTERVAL 10 MINUTE)
        )`,
      []
    );

    if (expiredBookings.length === 0) {
      logger.info('verificationExpirationScheduler: No expired bookings found');
      return;
    }

    logger.warn(`verificationExpirationScheduler: Found ${expiredBookings.length} expired booking(s)`, {
      expiredCount: expiredBookings.length
    });

    // Process each expired booking
    for (const booking of expiredBookings) {
      await processExpiredBooking(booking, connection);
    }

  } catch (error) {
    logger.error('verificationExpirationScheduler: Error in checkExpiredVerifications', {
      error: error.message,
      stack: error.stack
    });
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Process a single expired booking: cancel payment and update status
 * CRITICAL: Must check actual Stripe payment status and issue proper refund if already captured
 */
async function processExpiredBooking(booking, connection) {
  const bookingId = booking.id;
  let paymentHandled = false;
  let actualRefundIssued = false;

  try {
    await connection.beginTransaction();

    // CRITICAL: Check ACTUAL Stripe status, not just DB status
    // Payment might have been captured but DB wasn't updated correctly
    if (booking.payment_intent_id) {
      try {
        const stripePaymentIntent = await stripeService.retrievePaymentIntent(booking.payment_intent_id);

        if (stripePaymentIntent.status === 'succeeded') {
          // Payment was CAPTURED - must issue actual refund via Stripe
          logger.warn('verificationExpirationScheduler: Payment already captured, issuing refund', {
            bookingId,
            paymentIntentId: booking.payment_intent_id,
            amount: booking.total_amount
          });

          try {
            await stripeService.issueRefund(bookingId, booking.total_amount, 'requested_by_customer', connection);
            actualRefundIssued = true;
            paymentHandled = true;
            logger.info('verificationExpirationScheduler: Refund issued successfully', {
              bookingId,
              paymentIntentId: booking.payment_intent_id,
              refundAmount: booking.total_amount
            });
          } catch (refundError) {
            logger.error('verificationExpirationScheduler: Failed to issue refund - REQUIRES MANUAL INTERVENTION', {
              bookingId,
              paymentIntentId: booking.payment_intent_id,
              error: refundError.message
            });
            // Don't mark as refunded if refund failed - requires manual intervention
            throw new Error(`Refund failed for captured payment: ${refundError.message}`);
          }
        } else if (stripePaymentIntent.status === 'requires_capture') {
          // Payment is authorized but not captured - cancel the authorization
          try {
            await stripeService.cancelPaymentIntent(booking.payment_intent_id);
            paymentHandled = true;
            logger.info('verificationExpirationScheduler: Payment authorization cancelled', {
              bookingId,
              paymentIntentId: booking.payment_intent_id,
              amount: booking.total_amount
            });
          } catch (cancelError) {
            logger.error('verificationExpirationScheduler: Failed to cancel authorization', {
              bookingId,
              paymentIntentId: booking.payment_intent_id,
              error: cancelError.message
            });
          }
        } else if (stripePaymentIntent.status === 'canceled') {
          // Already cancelled in Stripe
          paymentHandled = true;
          logger.info('verificationExpirationScheduler: Payment already cancelled in Stripe', {
            bookingId,
            paymentIntentId: booking.payment_intent_id
          });
        } else {
          logger.warn('verificationExpirationScheduler: Unexpected Stripe status', {
            bookingId,
            paymentIntentId: booking.payment_intent_id,
            status: stripePaymentIntent.status
          });
        }
      } catch (stripeError) {
        logger.error('verificationExpirationScheduler: Failed to check/cancel Stripe payment', {
          bookingId,
          paymentIntentId: booking.payment_intent_id,
          error: stripeError.message
        });
        // Continue with booking cancellation but log the payment issue
      }
    }

    // Determine cancellation reason based on extension usage
    const cancellationReason = booking.extension_used
      ? 'Verification window expired - no OTP verification within 20 minutes (including extension)'
      : 'Verification window expired - no OTP verification within 10 minutes of start time';

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

    logger.info('verificationExpirationScheduler: Booking cancelled due to expired verification', {
      bookingId,
      clientId: booking.client_id,
      companionId: booking.companion_id,
      bookingDate: booking.booking_date,
      startTime: booking.start_time,
      extensionWasUsed: booking.extension_used,
      refundAmount: booking.total_amount
    });

    // Emit real-time notification to both parties
    try {
      const { emitBookingUpdate } = require('../config/socket');
      emitBookingUpdate(booking.client_id, booking.companion_id, 'booking_expired', {
        bookingId,
        status: 'cancelled',
        reason: 'verification_expired',
        message: booking.extension_used
          ? 'Booking cancelled - verification window expired (20 minutes including extension)'
          : 'Booking cancelled - verification window expired (10 minutes after start time)'
      });
    } catch (socketError) {
      logger.warn('verificationExpirationScheduler: Failed to emit socket event', {
        bookingId,
        error: socketError.message
      });
    }

  } catch (error) {
    if (connection) await connection.rollback();
    logger.error('verificationExpirationScheduler: Error in processExpiredBooking', {
      bookingId,
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Initialize the verification expiration scheduler
 * Runs every minute to check for expired bookings
 */
function initializeVerificationExpirationScheduler() {
  // Run every minute: '* * * * *'
  const job = cron.schedule('* * * * *', async () => {
    logger.info('verificationExpirationScheduler: Running verification expiration check...');
    await checkExpiredVerifications();
  });

  logger.info('verificationExpirationScheduler: ✅ Verification expiration scheduler started (runs every minute)');

  return job;
}

module.exports = {
  initializeVerificationExpirationScheduler,
  checkExpiredVerifications
};
