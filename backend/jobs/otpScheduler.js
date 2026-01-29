/**
 * OTP Scheduler
 * Automatically sends OTP codes 30 minutes before confirmed meetings
 */

const cron = require('node-cron');
const { pool } = require('../config/database');
const { generateOTP, sendOTPEmail } = require('../services/otpService');
const { convertFromUTC } = require('../utils/timezoneConverter');
const logger = require('../services/logger');

/**
 * Process bookings that need OTP codes sent
 * Runs every 5 minutes to check for bookings starting in ~30 minutes
 */
const processOTPGeneration = async () => {
  let connection;
  
  try {
    connection = await pool.getConnection();
    
    logger.info('otpScheduler', 'processOTPGeneration', 'Starting OTP generation check');

    // Find confirmed bookings that need OTPs sent
    // Main window: 25-35 minutes before (ideal time)
    // Fallback window: 5-60 minutes before (catch missed bookings)
    const [bookings] = await connection.execute(
      `SELECT 
        b.id as booking_id,
        b.booking_date,
        b.start_time,
        b.end_time,
        b.meeting_location,
        b.meeting_type,
        b.verification_required,
        b.booking_timezone,
        client.id as client_id,
        client.name as client_name,
        client.email as client_email,
        client.timezone as client_timezone,
        companion.id as companion_id,
        companion.name as companion_name,
        companion.email as companion_email,
        companion.timezone as companion_timezone,
        TIMESTAMPDIFF(MINUTE, NOW(), CONCAT(b.booking_date, ' ', b.start_time)) as minutes_until_start
      FROM bookings b
      INNER JOIN users client ON b.client_id = client.id
      INNER JOIN users companion ON b.companion_id = companion.id
      LEFT JOIN booking_verification bv ON b.id = bv.booking_id
      WHERE b.status = 'confirmed'
        AND b.verification_required = TRUE
        AND bv.booking_id IS NULL
        AND TIMESTAMPDIFF(MINUTE, NOW(), CONCAT(b.booking_date, ' ', b.start_time)) BETWEEN 5 AND 60`
    );

    if (bookings.length === 0) {
      logger.info('otpScheduler', 'processOTPGeneration', 'No bookings need OTP codes at this time');
      return;
    }

    logger.info('otpScheduler', 'processOTPGeneration', `Found ${bookings.length} booking(s) requiring OTP codes`, {
      bookingsDetails: bookings.map(b => ({
        bookingId: b.booking_id,
        minutesUntilStart: b.minutes_until_start
      }))
    });

    // Process each booking
    for (const booking of bookings) {
      try {
        await processBookingOTP(connection, booking);
      } catch (bookingError) {
        logger.error('otpScheduler', 'processOTPGeneration', bookingError, {
          bookingId: booking.booking_id,
          message: 'Failed to process OTP for individual booking'
        });
        // Continue with other bookings even if one fails
      }
    }

  } catch (error) {
    logger.error('otpScheduler', 'processOTPGeneration', error, {
      message: 'Error in OTP scheduler'
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

/**
 * Process OTP generation for a single booking
 * @param {object} connection - Database connection
 * @param {object} booking - Booking details
 */
const processBookingOTP = async (connection, booking) => {
  const {
    booking_id,
    booking_date,
    start_time,
    end_time,
    meeting_location,
    booking_timezone,
    client_id,
    client_name,
    client_email,
    client_timezone,
    companion_id,
    companion_name,
    companion_email,
    companion_timezone
  } = booking;

  logger.info('otpScheduler', 'processBookingOTP', `Processing OTP for booking ${booking_id}`);

  // Generate OTP codes for both parties
  const clientOTP = generateOTP();
  const companionOTP = generateOTP();

  logger.info('otpScheduler', 'processBookingOTP', `Generated OTPs for booking ${booking_id}`, {
    bookingId: booking_id,
    clientOTPGenerated: true,
    companionOTPGenerated: true
  });

  // Start transaction
  await connection.beginTransaction();

  try {
    // Insert OTP codes into booking_verification table
    await connection.execute(
      `INSERT INTO booking_verification 
        (booking_id, client_otp, companion_otp, otp_sent_at, verification_status)
      VALUES (?, ?, ?, NOW(), 'pending')`,
      [booking_id, clientOTP, companionOTP]
    );

    logger.info('otpScheduler', 'processBookingOTP', `OTP codes stored in database for booking ${booking_id}`);

    // Commit transaction before sending emails
    await connection.commit();

    // Send OTP email to client with times in their timezone
    try {
      const clientTimezoneToUse = client_timezone || booking_timezone || 'UTC';
      const clientStartTime = convertFromUTC(start_time, booking_date, clientTimezoneToUse);
      const clientEndTime = convertFromUTC(end_time, booking_date, clientTimezoneToUse);
      
      const clientMeetingDetails = {
        bookingDate: booking_date,
        startTime: clientStartTime,  // ✅ Converted to client's timezone
        endTime: clientEndTime,      // ✅ Converted to client's timezone
        timezone: clientTimezoneToUse,
        meetingLocation: meeting_location,
        otherPartyName: companion_name
      };
      
      await sendOTPEmail(
        client_email,
        client_name,
        'client',
        clientOTP,
        clientMeetingDetails
      );
      logger.info('otpScheduler', 'processBookingOTP', `OTP email sent to client for booking ${booking_id}`, {
        clientEmail: client_email,
        clientTimezone: clientTimezoneToUse
      });
    } catch (emailError) {
      logger.error('otpScheduler', 'processBookingOTP', emailError, {
        bookingId: booking_id,
        message: 'Failed to send OTP email to client'
      });
    }

    // Send OTP email to companion with times in their timezone
    try {
      const companionTimezoneToUse = companion_timezone || 'UTC';
      const companionStartTime = convertFromUTC(start_time, booking_date, companionTimezoneToUse);
      const companionEndTime = convertFromUTC(end_time, booking_date, companionTimezoneToUse);
      
      const companionMeetingDetails = {
        bookingDate: booking_date,
        startTime: companionStartTime,  // ✅ Converted to companion's timezone
        endTime: companionEndTime,      // ✅ Converted to companion's timezone
        timezone: companionTimezoneToUse,
        meetingLocation: meeting_location,
        otherPartyName: client_name
      };
      
      await sendOTPEmail(
        companion_email,
        companion_name,
        'companion',
        companionOTP,
        companionMeetingDetails
      );
      logger.info('otpScheduler', 'processBookingOTP', `OTP email sent to companion for booking ${booking_id}`, {
        companionEmail: companion_email,
        companionTimezone: companionTimezoneToUse
      });
    } catch (emailError) {
      logger.error('otpScheduler', 'processBookingOTP', emailError, {
        bookingId: booking_id,
        message: 'Failed to send OTP email to companion'
      });
    }

    logger.info('otpScheduler', 'processBookingOTP', `Successfully processed OTP for booking ${booking_id}`, {
      bookingId: booking_id,
      clientOTP: clientOTP,
      companionOTP: companionOTP
    });

    // Emit real-time notifications to both client and companion
    try {
      const { emitBookingUpdate } = require('../config/socket');
      emitBookingUpdate(client_id, companion_id, 'otp_sent', {
        bookingId: booking_id,
        bookingDate: booking_date,
        startTime: start_time,
        endTime: end_time,
        message: 'OTP codes have been sent to your email for meeting verification',
        minutesUntilStart: minutes_until_start
      });
    } catch (socketError) {
      logger.error('otpScheduler', 'processBookingOTP', socketError, {
        bookingId: booking_id,
        message: 'Failed to emit OTP socket event'
      });
    }

  } catch (error) {
    // Rollback transaction on error
    await connection.rollback();
    logger.error('otpScheduler', 'processBookingOTP', error, {
      bookingId: booking_id,
      message: 'Failed to process OTP, transaction rolled back'
    });
    throw error;
  }
};

/**
 * Initialize the OTP scheduler
 * Runs every 5 minutes
 */
const initializeOTPScheduler = () => {
  // Run every 5 minutes
  const scheduledJob = cron.schedule('*/5 * * * *', async () => {
    try {
      await processOTPGeneration();
    } catch (error) {
      logger.error('otpScheduler', 'initializeOTPScheduler', error, {
        message: 'Error in scheduled OTP job'
      });
    }
  });

  logger.info('otpScheduler', 'initializeOTPScheduler', 'OTP scheduler initialized - running every 5 minutes');

  return scheduledJob;
};

module.exports = {
  initializeOTPScheduler,
  processOTPGeneration
};

