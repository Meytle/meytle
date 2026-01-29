/**
 * Payment Release Scheduler
 * Automatically releases payments to companions after verified meetings end
 */

const cron = require('node-cron');
const { pool } = require('../config/database');
const { createNotification } = require('../services/notificationService');
const logger = require('../services/logger');
const { BOOKING_CONSTANTS } = require('../constants');
const stripeService = require('../services/stripeService');

/**
 * Process payments that are ready to be released
 * Runs every 5 minutes to check for completed bookings
 */
const processPaymentRelease = async () => {
  let connection;
  
  try {
    connection = await pool.getConnection();
    
    logger.info('paymentReleaseScheduler', 'processPaymentRelease', 'Starting payment release check');

    // Find confirmed bookings that have ended, are verified, paid, but payment not yet released
    const [bookings] = await connection.execute(
      `SELECT 
        b.id as booking_id,
        b.total_amount,
        b.payment_intent_id,
        b.booking_date,
        b.start_time,
        b.end_time,
        b.companion_id,
        b.client_id,
        companion.name as companion_name,
        companion.email as companion_email,
        client.name as client_name
      FROM bookings b
      INNER JOIN users companion ON b.companion_id = companion.id
      INNER JOIN users client ON b.client_id = client.id
      INNER JOIN booking_verification bv ON b.id = bv.booking_id
      WHERE b.status = 'confirmed'
        AND b.payment_status = 'paid'
        AND b.payment_released_at IS NULL
        AND bv.verification_status = 'verified'
        AND CONCAT(b.booking_date, ' ', b.end_time) < NOW()`
    );

    if (bookings.length === 0) {
      logger.info('paymentReleaseScheduler', 'processPaymentRelease', 'No payments ready for release');
      return;
    }

    logger.info('paymentReleaseScheduler', 'processPaymentRelease', `Found ${bookings.length} payment(s) to release`);

    // Process each booking
    for (const booking of bookings) {
      try {
        await processBookingPaymentRelease(connection, booking);
      } catch (bookingError) {
        logger.error('paymentReleaseScheduler', 'processPaymentRelease', bookingError, {
          bookingId: booking.booking_id,
          message: 'Failed to process payment release for individual booking'
        });
        // Continue with other bookings even if one fails
      }
    }

  } catch (error) {
    logger.error('paymentReleaseScheduler', 'processPaymentRelease', error, {
      message: 'Error in payment release scheduler'
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

/**
 * Process payment release for a single booking
 * @param {object} connection - Database connection
 * @param {object} booking - Booking details
 */
const processBookingPaymentRelease = async (connection, booking) => {
  const {
    booking_id,
    total_amount,
    payment_intent_id,
    companion_id,
    companion_name,
    companion_email,
    client_name,
    booking_date,
    start_time,
    end_time
  } = booking;

  logger.info('paymentReleaseScheduler', 'processBookingPaymentRelease', `Processing payment for booking ${booking_id}`);

  // Start transaction
  await connection.beginTransaction();

  try {
    // Calculate companion earnings (85% of total, platform keeps 15%)
    const platformFeePercentage = BOOKING_CONSTANTS.SERVICE_FEE_PERCENTAGE || 0.15;
    const companionEarnings = total_amount * (1 - platformFeePercentage);
    const platformFee = total_amount * platformFeePercentage;

    logger.info('paymentReleaseScheduler', 'processBookingPaymentRelease', `Calculated earnings for booking ${booking_id}`, {
      totalAmount: total_amount,
      companionEarnings: companionEarnings.toFixed(2),
      platformFee: platformFee.toFixed(2)
    });

    // Step 1: Capture the authorized payment
    try {
      const captureResult = await stripeService.capturePayment(booking_id, connection); // ✅ Pass connection
      logger.info('paymentReleaseScheduler', 'processBookingPaymentRelease', 
        `Payment captured for booking ${booking_id}`, {
        paymentIntentId: captureResult.paymentIntentId
      });
    } catch (captureError) {
      logger.error('paymentReleaseScheduler', 'processBookingPaymentRelease', captureError, {
        bookingId: booking_id,
        message: 'Failed to capture payment'
      });
      throw new Error(`Payment capture failed: ${captureError.message}`);
    }

    // Step 2: Transfer funds to companion via Stripe Connect
    try {
      const transferResult = await stripeService.transferToCompanion(booking_id, connection); // ✅ Pass connection
      logger.info('paymentReleaseScheduler', 'processBookingPaymentRelease', 
        `Payment transferred to companion for booking ${booking_id}`, {
        transferId: transferResult.transferId,
        companionEarnings: transferResult.companionEarnings,
        platformFee: transferResult.platformFee
      });
    } catch (transferError) {
      logger.error('paymentReleaseScheduler', 'processBookingPaymentRelease', transferError, {
        bookingId: booking_id,
        message: 'Failed to transfer payment to companion'
      });
      throw new Error(`Payment transfer failed: ${transferError.message}`);
    }

    logger.info('paymentReleaseScheduler', 'processBookingPaymentRelease', `Payment released for booking ${booking_id}`, {
      bookingId: booking_id,
      amount: companionEarnings.toFixed(2)
    });

    // Commit transaction before sending notifications
    await connection.commit();

    // Send notification to companion
    try {
      await createNotification(
        companion_id,
        'payment',
        '💰 Payment Received',
        `You've received $${companionEarnings.toFixed(2)} for your booking with ${client_name} on ${booking_date}`,
        '/companion-dashboard'
      );

      // Send email notification
      const emailService = require('../services/emailService');
      if (companion_email) {
        await emailService.sendPaymentReleasedEmail(
          companion_email,
          companion_name,
          {
            bookingDate: booking_date,
            startTime: start_time,
            endTime: end_time,
            clientName: client_name,
            amount: companionEarnings,
            platformFee: platformFee,
            totalAmount: total_amount
          }
        );
      }
    } catch (notificationError) {
      logger.error('paymentReleaseScheduler', 'processBookingPaymentRelease', notificationError, {
        bookingId: booking_id,
        message: 'Failed to send payment notification'
      });
      // Don't throw - payment is already released
    }

    // Notify client that booking is completed
    try {
      await createNotification(
        booking.client_id,
        'booking',
        'Booking Completed',
        `Your booking with ${companion_name} on ${booking_date} has been completed. Thank you for using Meytle!`,
        '/client-dashboard'
      );
    } catch (notificationError) {
      logger.error('paymentReleaseScheduler', 'processBookingPaymentRelease', notificationError, {
        bookingId: booking_id,
        message: 'Failed to send completion notification to client'
      });
    }

    logger.info('paymentReleaseScheduler', 'processBookingPaymentRelease', `Successfully processed payment release for booking ${booking_id}`, {
      bookingId: booking_id,
      companionEarnings: companionEarnings.toFixed(2)
    });

  } catch (error) {
    // Rollback transaction on error
    await connection.rollback();
    logger.error('paymentReleaseScheduler', 'processBookingPaymentRelease', error, {
      bookingId: booking_id,
      message: 'Failed to process payment release, transaction rolled back'
    });
    throw error;
  }
};

/**
 * Initialize the payment release scheduler
 * Runs every 5 minutes
 */
const initializePaymentReleaseScheduler = () => {
  // Run every 5 minutes
  const scheduledJob = cron.schedule('*/5 * * * *', async () => {
    try {
      await processPaymentRelease();
    } catch (error) {
      logger.error('paymentReleaseScheduler', 'initializePaymentReleaseScheduler', error, {
        message: 'Error in scheduled payment release job'
      });
    }
  });

  logger.info('paymentReleaseScheduler', 'initializePaymentReleaseScheduler', 'Payment release scheduler initialized - running every 5 minutes');

  return scheduledJob;
};

module.exports = {
  initializePaymentReleaseScheduler,
  processPaymentRelease
};

