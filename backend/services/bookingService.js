/**
 * Booking Service
 * Contains business logic for booking operations
 */

const { pool } = require('../config/database');
const { safeParseDate, isPastTimeSlot } = require('../utils/dateHelpers');
const { createNotification, notificationTemplates } = require('./notificationService');
const { sendBookingNotificationEmail } = require('./emailService');
const logger = require('./logger');
const stripeService = require('./stripeService');

/**
 * Validate booking data before creation
 * @param {Object} bookingData - Booking data to validate
 * @returns {Object} Validation result { isValid, errors }
 */
const validateBookingData = (bookingData) => {
  const errors = [];

  // Validate date
  const parsedDate = safeParseDate(bookingData.bookingDate);
  if (!parsedDate) {
    errors.push('Invalid booking date provided');
  }

  // Validate time slot is not in the past
  if (parsedDate && isPastTimeSlot(bookingData.bookingDate, bookingData.startTime, 30)) {
    errors.push('Booking must be at least 30 minutes in the future');
  }

  // Validate time range
  if (bookingData.startTime && bookingData.endTime) {
    const start = new Date(`${bookingData.bookingDate} ${bookingData.startTime}`);
    const end = new Date(`${bookingData.bookingDate} ${bookingData.endTime}`);

    if (end <= start) {
      errors.push('End time must be after start time');
    }

    const durationHours = (end - start) / (1000 * 60 * 60);
    if (durationHours < 1) {
      errors.push('Booking duration must be at least 1 hour');
    }
    if (durationHours > 12) {
      errors.push('Booking duration cannot exceed 12 hours');
    }
  }

  // Validate meeting type
  if (bookingData.meetingType && !['in_person', 'virtual'].includes(bookingData.meetingType)) {
    errors.push('Invalid meeting type. Must be in_person or virtual');
  }

  // Service category validation is optional - backend will use default if not provided

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Check for availability conflicts
 * @param {number} companionId - Companion ID
 * @param {string} date - Booking date (YYYY-MM-DD)
 * @param {string} startTime - Start time (HH:MM)
 * @param {string} endTime - End time (HH:MM)
 * @param {number} excludeBookingId - Optional booking ID to exclude from check
 * @returns {Promise<Array>} Array of conflicting bookings
 */
const checkAvailabilityConflicts = async (companionId, date, startTime, endTime, excludeBookingId = null) => {
  let query = `
    SELECT id, start_time, end_time, status
    FROM bookings
    WHERE companion_id = ? AND booking_date = ?
    AND ((start_time <= ? AND end_time > ?) OR (start_time < ? AND end_time >= ?))
    AND status IN ('pending', 'confirmed')
  `;
  
  const params = [companionId, date, startTime, startTime, endTime, endTime];
  
  if (excludeBookingId) {
    query += ' AND id != ?';
    params.push(excludeBookingId);
  }

  const [conflicts] = await pool.execute(query, params);
  return conflicts;
};

/**
 * Calculate booking cost
 * @param {number} durationHours - Duration in hours
 * @param {number} hourlyRate - Hourly rate
 * @returns {number} Total amount
 */
const calculateBookingCost = (durationHours, hourlyRate = 35) => {
  return Math.round(durationHours * hourlyRate * 100) / 100;
};

/**
 * Calculate booking duration
 * @param {string} bookingDate - Date in YYYY-MM-DD format
 * @param {string} startTime - Start time in HH:MM format
 * @param {string} endTime - End time in HH:MM format
 * @returns {number} Duration in hours
 */
const calculateDuration = (bookingDate, startTime, endTime) => {
  const start = new Date(`${bookingDate} ${startTime}`);
  const end = new Date(`${bookingDate} ${endTime}`);
  return (end - start) / (1000 * 60 * 60);
};

/**
 * Cancel conflicting bookings when a booking is confirmed
 * @param {number} companionId - Companion ID
 * @param {string} date - Booking date
 * @param {string} startTime - Start time
 * @param {string} endTime - End time
 * @param {number} excludeBookingId - Booking ID to exclude (the one being confirmed)
 * @returns {Promise<number>} Number of cancelled bookings
 */
const cancelConflictingBookings = async (companionId, date, startTime, endTime, excludeBookingId) => {
  // Find conflicting pending bookings
  const [conflictingBookings] = await pool.execute(
    `SELECT id, client_id 
     FROM bookings
     WHERE companion_id = ? AND booking_date = ?
     AND ((start_time <= ? AND end_time > ?) OR (start_time < ? AND end_time >= ?))
     AND status = 'pending' AND id != ?`,
    [companionId, date, startTime, startTime, endTime, endTime, excludeBookingId]
  );

  // Cancel each conflicting booking
  for (const conflict of conflictingBookings) {
    await pool.execute(
      `UPDATE bookings 
       SET status = 'cancelled', 
           cancelled_by = 'companion',
           cancellation_reason = 'Time slot accepted for another booking',
           cancelled_at = NOW()
       WHERE id = ?`,
      [conflict.id]
    );
    
    // Notify the affected client
    try {
      await createNotification(
        conflict.client_id,
        'booking',
        'Booking Automatically Cancelled',
        'Your booking was cancelled because the companion accepted another booking for this time slot.',
        '/client-dashboard'
      );
    } catch (notificationError) {
      logger.error('Failed to send cancellation notification', {
        error: notificationError.message,
        bookingId: conflict.id,
        clientId: conflict.client_id
      });
    }
  }

  return conflictingBookings.length;
};

/**
 * Send booking notifications to relevant parties
 * @param {Object} booking - Booking data
 * @param {string} type - Notification type ('created', 'confirmed', 'cancelled', 'completed')
 * @param {Object} options - Additional options (reason, cancelledBy, etc.)
 */
const sendBookingNotifications = async (booking, type, options = {}) => {
  try {
    switch (type) {
      case 'created':
        // Notify companion of new booking
        const createdNotification = notificationTemplates.bookingCreated(
          booking.clientName,
          booking.bookingDate,
          booking.startTime
        );
        await createNotification(
          booking.companionId,
          createdNotification.type,
          createdNotification.title,
          createdNotification.message,
          createdNotification.actionUrl
        );
        break;

      case 'confirmed':
        // Notify client of booking confirmation
        await createNotification(
          booking.clientId,
          'booking',
          'Booking Confirmed',
          `Your booking with ${booking.companionName} has been confirmed for ${booking.bookingDate}`,
          '/client-dashboard'
        );
        
        // Send email if available
        if (booking.clientEmail) {
          await sendBookingNotificationEmail(
            booking.clientEmail,
            'Booking Confirmed!',
            `Your booking with ${booking.companionName} has been confirmed for ${booking.bookingDate}.`
          );
        }
        break;

      case 'cancelled':
        const { reason, cancelledBy } = options;
        
        // Notify the other party
        if (cancelledBy === 'client') {
          // Notify companion
          let message = `${booking.clientName} has cancelled the booking for ${booking.bookingDate}`;
          if (reason) {
            message += `. Reason: ${reason}`;
          }
          await createNotification(
            booking.companionId,
            'booking',
            'Booking Cancelled',
            message,
            '/companion-dashboard'
          );
        } else {
          // Notify client
          let message = `${booking.companionName} has cancelled your booking for ${booking.bookingDate}`;
          if (reason) {
            message += `. Reason: ${reason}`;
          }
          await createNotification(
            booking.clientId,
            'booking',
            'Booking Cancelled',
            message,
            '/client-dashboard'
          );
          
          // Send email
          if (booking.clientEmail) {
            await sendBookingNotificationEmail(
              booking.clientEmail,
              'Booking Cancelled',
              message
            );
          }
        }
        break;

      case 'completed':
        // Notify client that booking is completed
        await createNotification(
          booking.clientId,
          'booking',
          'Booking Completed',
          `Your booking with ${booking.companionName} has been marked as completed`,
          '/client-dashboard'
        );
        break;

      default:
        logger.warn('Unknown notification type', { type });
    }
  } catch (error) {
    logger.error('Failed to send booking notification', {
      error: error.message,
      bookingId: booking.id,
      type
    });
    // Don't throw - notifications should not block booking operations
  }
};

/**
 * Check if a user can cancel a booking based on time restrictions
 * @param {string} bookingDate - Booking date
 * @param {string} startTime - Start time
 * @returns {Object} { canCancel, message, hoursRemaining }
 */
const checkCancellationEligibility = (bookingDate, startTime) => {
  const now = new Date();
  const bookingStart = new Date(`${bookingDate}T${startTime}`);
  const hoursUntilBooking = (bookingStart - now) / (1000 * 60 * 60);

  if (hoursUntilBooking < 3) {
    return {
      canCancel: false,
      message: 'Bookings can only be cancelled at least 3 hours before the start time',
      hoursRemaining: Math.max(0, hoursUntilBooking)
    };
  }

  return {
    canCancel: true,
    message: 'Cancellation allowed',
    hoursRemaining: hoursUntilBooking
  };
};

/**
 * Get companion's hourly rate
 * @param {number} companionId - Companion ID
 * @returns {Promise<number>} Hourly rate
 */
const getCompanionHourlyRate = async (companionId) => {
  const [rows] = await pool.execute(
    'SELECT hourly_rate FROM companion_applications WHERE user_id = ?',
    [companionId]
  );
  
  return rows.length > 0 ? rows[0].hourly_rate : 35; // Default rate if not found
};

/**
 * Verify companion is approved
 * @param {number} companionId - Companion ID
 * @returns {Promise<boolean>} True if approved
 */
const isCompanionApproved = async (companionId) => {
  const [rows] = await pool.execute(
    `SELECT status FROM companion_applications 
     WHERE user_id = ? AND status = 'approved'`,
    [companionId]
  );
  
  return rows.length > 0;
};

/**
 * Check if user can book (not themselves, companion approved, etc.)
 * @param {number} clientId - Client ID
 * @param {number} companionId - Companion ID
 * @returns {Promise<Object>} { canBook, reason }
 */
const canCreateBooking = async (clientId, companionId) => {
  // Check self-booking
  if (clientId === companionId) {
    return {
      canBook: false,
      reason: 'You cannot book yourself as a companion'
    };
  }

  // Check companion is approved
  const isApproved = await isCompanionApproved(companionId);
  if (!isApproved) {
    return {
      canBook: false,
      reason: 'Companion is not approved or not found'
    };
  }

  return {
    canBook: true,
    reason: null
  };
};

/**
 * Cancel booking and process refund (for verification failure or system cancellation)
 * @param {number} bookingId - Booking ID to cancel
 * @param {string} reason - Reason for cancellation
 * @returns {Promise<void>}
 */
const cancelBookingAndRefund = async (bookingId, reason) => {
  let connection;
  
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Get booking details
    const [bookings] = await connection.execute(
      `SELECT 
        b.*,
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
      throw new Error(`Booking ${bookingId} not found`);
    }

    const booking = bookings[0];

    logger.info('bookingService', 'cancelBookingAndRefund', `Cancelling booking ${bookingId}`, {
      bookingId,
      reason,
      currentStatus: booking.status
    });

    // Update booking status to cancelled
    await connection.execute(
      `UPDATE bookings 
       SET status = 'cancelled',
           cancelled_by = 'system',
           cancellation_reason = ?,
           cancelled_at = NOW()
       WHERE id = ?`,
      [reason, bookingId]
    );

    // Handle payment based on actual Stripe status
    if (booking.payment_intent_id) {
      try {
        // CRITICAL: Check actual Stripe status, not just DB status
        const stripePaymentIntent = await stripeService.retrievePaymentIntent(booking.payment_intent_id);

        if (stripePaymentIntent.status === 'succeeded') {
          // Payment was CAPTURED - must issue actual refund via Stripe
          logger.info('bookingService', 'cancelBookingAndRefund', `Issuing Stripe refund for captured payment`, {
            bookingId,
            paymentIntentId: booking.payment_intent_id,
            amount: booking.total_amount
          });

          await stripeService.issueRefund(bookingId, booking.total_amount, 'requested_by_customer', connection);

          logger.info('bookingService', 'cancelBookingAndRefund', `Stripe refund issued successfully`, {
            bookingId,
            paymentIntentId: booking.payment_intent_id,
            refundAmount: booking.total_amount
          });
        } else if (stripePaymentIntent.status === 'requires_capture') {
          // Payment is authorized but not captured - cancel the authorization
          await stripeService.cancelPaymentIntent(booking.payment_intent_id);

          await connection.execute(
            `UPDATE bookings
             SET payment_status = 'refunded'
             WHERE id = ?`,
            [bookingId]
          );

          logger.info('bookingService', 'cancelBookingAndRefund', `Payment authorization cancelled`, {
            bookingId,
            paymentIntentId: booking.payment_intent_id
          });
        } else if (stripePaymentIntent.status === 'canceled') {
          // Already cancelled in Stripe - just update DB
          await connection.execute(
            `UPDATE bookings
             SET payment_status = 'refunded'
             WHERE id = ?`,
            [bookingId]
          );

          logger.info('bookingService', 'cancelBookingAndRefund', `Payment already cancelled in Stripe`, {
            bookingId,
            paymentIntentId: booking.payment_intent_id
          });
        } else {
          logger.warn('bookingService', 'cancelBookingAndRefund', `Unexpected Stripe payment status`, {
            bookingId,
            paymentIntentId: booking.payment_intent_id,
            stripeStatus: stripePaymentIntent.status
          });
        }
      } catch (stripeError) {
        logger.error('bookingService', 'cancelBookingAndRefund', stripeError, {
          bookingId,
          paymentIntentId: booking.payment_intent_id,
          message: 'Failed to process payment cancellation/refund'
        });
        // Re-throw to prevent booking from being marked as cancelled without refund
        throw new Error(`Payment cancellation/refund failed: ${stripeError.message}`);
      }
    }

    await connection.commit();

    // Send notifications to both parties
    try {
      // Notify client
      await createNotification(
        booking.client_id,
        'booking',
        'Booking Cancelled - Verification Failed',
        `Your booking on ${booking.booking_date} has been cancelled due to location verification failure. ${
          booking.payment_status === 'paid' ? 'A full refund will be processed to your original payment method.' : ''
        }`,
        '/client-dashboard'
      );

      // Notify companion
      await createNotification(
        booking.companion_id,
        'booking',
        'Booking Cancelled - Verification Failed',
        `The booking on ${booking.booking_date} has been cancelled due to location verification failure.`,
        '/companion-dashboard'
      );

      // Send emails
      const emailService = require('./emailService');
      
      if (booking.client_email) {
        await emailService.sendBookingCancellationEmail(
          booking.client_email,
          booking.client_name,
          {
            bookingDate: booking.booking_date,
            startTime: booking.start_time,
            endTime: booking.end_time,
            companionName: booking.companion_name,
            reason: 'Location verification failed - both parties were not at the agreed meeting location',
            refundAmount: booking.payment_status === 'paid' ? booking.total_amount : 0
          }
        );
      }

      if (booking.companion_email) {
        await emailService.sendBookingCancellationEmail(
          booking.companion_email,
          booking.companion_name,
          {
            bookingDate: booking.booking_date,
            startTime: booking.start_time,
            endTime: booking.end_time,
            companionName: booking.client_name,
            reason: 'Location verification failed - both parties were not at the agreed meeting location',
            refundAmount: 0
          }
        );
      }

    } catch (notificationError) {
      logger.error('bookingService', 'cancelBookingAndRefund', notificationError, {
        bookingId,
        message: 'Failed to send cancellation notifications'
      });
      // Don't throw - booking is already cancelled
    }

    logger.info('bookingService', 'cancelBookingAndRefund', `Successfully cancelled booking ${bookingId}`, {
      bookingId,
      reason
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('bookingService', 'cancelBookingAndRefund', error, {
      bookingId,
      reason
    });
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

module.exports = {
  validateBookingData,
  checkAvailabilityConflicts,
  calculateBookingCost,
  calculateDuration,
  cancelConflictingBookings,
  sendBookingNotifications,
  checkCancellationEligibility,
  getCompanionHourlyRate,
  isCompanionApproved,
  canCreateBooking,
  cancelBookingAndRefund
};

