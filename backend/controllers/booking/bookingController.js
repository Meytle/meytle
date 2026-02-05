/**
 * Booking Controller
 * Handles core booking operations (create, read, update, delete)
 */

const { pool } = require('../../config/database');
const { sendBookingNotificationEmail, sendBookingConfirmationEmail, sendBookingCancellationEmail } = require('../../services/emailService');
const { createNotification, notificationTemplates, sendBookingCreatedNotification, sendBookingStatusNotification } = require('../../services/notificationService');
const { validateBookingAddress } = require('../../utils/addressValidation');
const { transformToFrontend, transformArrayToFrontend } = require('../../utils/transformer');
const { safeParseDate, isPastTimeSlot, canCancelBooking } = require('../../utils/dateHelpers');
const { sendSuccess, sendError, sendCreated, sendNotFound, sendBadRequest, sendForbidden } = require('../../utils/responseHelpers');
const asyncHandler = require('../../utils/asyncHandler');
const logger = require('../../services/logger');
const stripeService = require('../../services/stripeService');
const { convertToUTC } = require('../../utils/timezoneConverter');

/**
 * Step 1: Create Payment Intent (NO booking yet)
 * @route POST /api/booking/create-payment-intent
 * 
 * This creates a Stripe Payment Intent with all booking data in metadata.
 * The actual booking is created ONLY after payment authorization succeeds.
 */
const createPaymentIntent = asyncHandler(async (req, res) => {
  const clientId = req.user.id;
  
  // 🔍 DEBUG: Log what we received
  logger.controllerInfo('bookingController', 'createPaymentIntent', '📥 Received request body', {
    body: req.body,
    bodyKeys: Object.keys(req.body),
    clientId
  });
  
  const {
    companionId,
    bookingDate,
    startTime,
    endTime,
    serviceType,
    location,
    durationHours,
    totalAmount,
    specialRequests,
    clientTimezone
  } = req.body;

  // Validate required fields
  if (!companionId || !bookingDate || !startTime || !endTime || !location || !clientTimezone) {
    logger.controllerWarn('bookingController', 'createPaymentIntent', '❌ Validation failed', {
      companionId: !!companionId,
      bookingDate: !!bookingDate,
      startTime: !!startTime,
      endTime: !!endTime,
      location: !!location,
      clientTimezone: !!clientTimezone,
      durationHours: !!durationHours,
      totalAmount: !!totalAmount
    });
    return sendBadRequest(res, 'Missing required booking fields');
  }

  // Get client email for Stripe receipt
  const [clientRows] = await pool.query(
    'SELECT email FROM users WHERE id = ?',
    [clientId]
  );
  
  if (!clientRows || clientRows.length === 0) {
    return sendBadRequest(res, 'Client not found');
  }
  
  const clientEmail = clientRows[0].email;

  // Validate companion exists and is approved
  const [companions] = await pool.query(
    `SELECT u.id, ca.hourly_rate 
     FROM users u
     JOIN companion_applications ca ON u.id = ca.user_id
     JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'companion' AND ur.is_active = TRUE
     WHERE u.id = ? AND ca.status = 'approved'`,
    [companionId]
  );

  if (!companions || companions.length === 0) {
    return sendNotFound(res, 'Companion not found or not approved');
  }
  
  const companion = companions[0];

  // Validate booking date is valid
  const parsedDate = safeParseDate(bookingDate);
  if (!parsedDate) {
    return sendBadRequest(res, 'Invalid booking date provided');
  }

  // Validate time slot is not in the past (30 minute buffer)
  // Pass client timezone to correctly validate against their local time
  if (isPastTimeSlot(bookingDate, startTime, 30, clientTimezone)) {
    return sendBadRequest(res, 'Booking must be at least 30 minutes in the future to allow time for processing');
  }

  // Validate location (convert location object to expected format)
  const addressValidation = await validateBookingAddress({
    meetingLocation: location.address,
    meetingType: location.type || 'in_person',
    meeting_location_lat: location.lat,
    meeting_location_lon: location.lng,
    meeting_location_place_id: location.placeId
  });
  if (!addressValidation.isValid) {
    return sendBadRequest(res, 'Invalid booking location', {
      errors: addressValidation.errors,
      warnings: addressValidation.warnings
    });
  }

  // Convert times to UTC for storage and comparison
  const utcStartTime = convertToUTC(startTime, bookingDate, clientTimezone);
  const utcEndTime = convertToUTC(endTime, bookingDate, clientTimezone);

  logger.controllerInfo('bookingController', 'createPaymentIntent', 'Converted booking times to UTC', {
    original: { start: startTime, end: endTime, timezone: clientTimezone },
    utc: { start: utcStartTime, end: utcEndTime },
    date: bookingDate
  });

  // Check 1: Verify companion has availability for this time slot (in UTC)
  const dayOfWeek = parsedDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const [availabilitySlots] = await pool.query(
    `SELECT start_time, end_time, companion_timezone, is_utc
     FROM companion_availability
     WHERE companion_id = ? AND day_of_week = ? AND is_available = TRUE`,
    [companionId, dayOfWeek]
  );

  // Check if requested time falls within any availability slot (compare UTC to UTC)
  let isWithinAvailability = false;
  for (const slot of availabilitySlots) {
    // Slots are stored in UTC (if is_utc = 1)
    const slotStartUTC = slot.start_time;
    const slotEndUTC = slot.end_time;

    // Check if booking time is within this slot
    if (utcStartTime >= slotStartUTC && utcEndTime <= slotEndUTC) {
      isWithinAvailability = true;
      logger.controllerInfo('bookingController', 'createPaymentIntent', 'Booking time matches availability slot', {
        requestedUTC: { start: utcStartTime, end: utcEndTime },
        slotUTC: { start: slotStartUTC, end: slotEndUTC }
      });
      break;
    }
  }

  if (!isWithinAvailability) {
    logger.controllerWarn('bookingController', 'createPaymentIntent', 'Booking time does not match companion availability', {
      requestedUTC: { start: utcStartTime, end: utcEndTime },
      dayOfWeek,
      availableSlots: availabilitySlots.map(s => ({ start: s.start_time, end: s.end_time }))
    });

    // Get existing bookings for this date to filter out unavailable slots
    const [existingBookings] = await pool.query(
      `SELECT start_time, end_time FROM bookings
       WHERE companion_id = ?
       AND booking_date = ?
       AND status NOT IN ('cancelled', 'declined', 'completed')`,
      [companionId, bookingDate]
    );

    // Filter availability slots to exclude already-booked times
    const alternateSlots = [];
    for (const slot of availabilitySlots) {
      let slotStart = slot.start_time;
      const slotEnd = slot.end_time;

      // Check if any booking overlaps with this slot
      const slotBookings = existingBookings.filter(b =>
        (b.start_time < slotEnd && b.end_time > slotStart)
      ).sort((a, b) => a.start_time.localeCompare(b.start_time));

      if (slotBookings.length === 0) {
        // No bookings in this slot, it's fully available
        alternateSlots.push({ start: slotStart, end: slotEnd });
      } else {
        // Split the slot around existing bookings
        for (const booking of slotBookings) {
          // Gap before this booking
          if (slotStart < booking.start_time) {
            alternateSlots.push({ start: slotStart, end: booking.start_time });
          }
          // Move start past this booking
          slotStart = booking.end_time;
        }
        // Gap after last booking
        if (slotStart < slotEnd) {
          alternateSlots.push({ start: slotStart, end: slotEnd });
        }
      }
    }

    return sendBadRequest(res, 'Companion is not available at the requested time. Please select a different time slot.', {
      availableSlots: alternateSlots,
      date: bookingDate
    });
  }

  // Check 2: Check for time conflicts with existing bookings
  const [conflicts] = await pool.query(
    `SELECT id FROM bookings 
     WHERE companion_id = ? 
     AND booking_date = ? 
     AND status NOT IN ('cancelled', 'declined', 'completed')
     AND (
       (start_time <= ? AND end_time > ?) OR
       (start_time < ? AND end_time >= ?) OR
       (start_time >= ? AND end_time <= ?)
     )`,
    [companionId, bookingDate, utcStartTime, utcStartTime, utcEndTime, utcEndTime, utcStartTime, utcEndTime]
  );

  if (conflicts.length > 0) {
    logger.controllerWarn('bookingController', 'createPaymentIntent', 'Time slot conflict with existing booking', {
      requestedUTC: { start: utcStartTime, end: utcEndTime },
      conflictingBookingId: conflicts[0].id
    });
    return sendBadRequest(res, 'Time slot is already booked');
  }

  // Create Payment Intent with all booking data in metadata
  const paymentIntent = await stripeService.createPaymentIntent({
    amount: totalAmount,
    currency: 'usd',
    receipt_email: clientEmail, // Client's email for Stripe receipt/customer identification
    metadata: {
      clientId: String(clientId),
      companionId: String(companionId),
      bookingDate,
      startTime: utcStartTime,
      endTime: utcEndTime,
      originalStartTime: startTime,
      originalEndTime: endTime,
      clientTimezone,
      serviceType: serviceType || 'Companionship',
      location: JSON.stringify(location),
      durationHours: String(durationHours),
      specialRequests: specialRequests || '',
      bookingType: 'normal'
    }
  });

  logger.controllerInfo('bookingController', 'createPaymentIntent', 'Payment intent created - NO booking yet', {
    paymentIntentId: paymentIntent.id,
    amount: totalAmount,
    clientId,
    companionId
  });

  return sendCreated(res, {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    totalAmount: totalAmount,
    durationHours: durationHours
  }, 'Payment intent created. Please authorize payment to complete booking.');
});

/**
 * Step 2: Create booking AFTER payment authorization
 * @route POST /api/booking
 * 
 * This is called ONLY after the client successfully authorizes the payment.
 * It retrieves booking data from the Payment Intent and creates the database record.
 */
const createBooking = asyncHandler(async (req, res) => {
  let connection;

  try {
    const clientId = req.user.id;
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return sendBadRequest(res, 'Payment Intent ID is required');
    }

    // Retrieve and verify Payment Intent from Stripe
    let paymentIntent;
    try {
      paymentIntent = await stripeService.retrievePaymentIntent(paymentIntentId);
    } catch (error) {
      logger.controllerError('bookingController', 'createBooking', error, req);
      return sendBadRequest(res, 'Invalid Payment Intent');
    }

    // Verify payment is authorized (requires_capture) or succeeded
    if (paymentIntent.status !== 'requires_capture' && paymentIntent.status !== 'succeeded') {
      return sendBadRequest(res, `Payment not authorized. Status: ${paymentIntent.status}`);
    }

    // Extract booking data from Payment Intent metadata
    const metadata = paymentIntent.metadata;
    const companionId = parseInt(metadata.companionId);
    const bookingDate = metadata.bookingDate;
    const startTime = metadata.startTime; // Already in UTC from createPaymentIntent
    const endTime = metadata.endTime; // Already in UTC
    const bookingTimezone = metadata.clientTimezone;
    const specialRequests = metadata.specialRequests || null;
    const serviceType = metadata.serviceType;
    const totalAmount = paymentIntent.amount / 100; // Convert cents to dollars
    const durationHours = parseFloat(metadata.durationHours);
    const serviceCategoryId = metadata.serviceCategoryId ? parseInt(metadata.serviceCategoryId) : null;
    
    // Parse location from metadata
    const location = JSON.parse(metadata.location);
    const meetingLocation = location.address;
    const meetingLocationLat = location.lat;
    const meetingLocationLon = location.lng;
    const meetingLocationPlaceId = location.placeId;
    const meetingType = location.type || 'in_person';

    // Verify client ID matches
    if (parseInt(metadata.clientId) !== clientId) {
      return sendForbidden(res, 'Payment Intent does not belong to this user');
    }

    // Get a connection from the pool for transaction support
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Prevent self-booking
    if (clientId === parseInt(companionId)) {
      await connection.rollback();
      return sendBadRequest(res, 'You cannot book yourself as a companion');
    }

    // Validate date is valid
    const parsedDate = safeParseDate(bookingDate);
    if (!parsedDate) {
      await connection.rollback();
      return sendBadRequest(res, 'Invalid booking date provided');
    }

    // Validate time slot is not in the past with 30 minute buffer
    // Pass booking timezone to correctly validate against their local time
    if (isPastTimeSlot(bookingDate, startTime, 30, bookingTimezone)) {
      await connection.rollback();
      return sendBadRequest(res, 'Booking must be at least 30 minutes in the future to allow time for processing');
    }

    // Check if companion exists and is approved
    const [companions] = await connection.execute(
      `SELECT u.id, u.name, u.email, u.timezone, ca.status
       FROM users u
       JOIN companion_applications ca ON u.id = ca.user_id
       JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'companion' AND ur.is_active = TRUE
       WHERE u.id = ? AND ca.status = 'approved'`,
      [companionId]
    );

    if (companions.length === 0) {
      await connection.rollback();
      return sendNotFound(res, 'Companion not found or not approved');
    }

    const companion = companions[0];

    // Validate and fetch service category if provided
    let categoryBasePrice = null;
    if (serviceCategoryId) {
      const [categories] = await connection.execute(
        'SELECT id, base_price FROM service_categories WHERE id = ? AND is_active = TRUE',
        [serviceCategoryId]
      );

      if (categories.length === 0) {
        await connection.rollback();
        return sendNotFound(res, 'Service category not found or inactive');
      }

      categoryBasePrice = categories[0].base_price;
    }

    // Validate meetingType if provided
    if (meetingType && !['in_person', 'virtual'].includes(meetingType)) {
      await connection.rollback();
      return sendBadRequest(res, 'Invalid meeting type. Must be in_person or virtual');
    }

    // Validate meeting location using the validation helper
    const addressValidation = validateBookingAddress({
      meetingLocation,
      meetingType,
      meeting_location_lat: meetingLocationLat,
      meeting_location_lon: meetingLocationLon,
      meeting_location_place_id: meetingLocationPlaceId
    });

    if (!addressValidation.isValid) {
      await connection.rollback();
      return sendBadRequest(res, 'Address validation failed', addressValidation.errors);
    }

    // Log warnings if any (but don't block the booking)
    if (addressValidation.warnings.length > 0) {
      logger.warn('Address validation warnings', { warnings: addressValidation.warnings });
    }

    // ⚠️ startTime and endTime are ALREADY in UTC from payment intent metadata
    // ⚠️ totalAmount is ALREADY authorized in Stripe
    // ⚠️ durationHours is ALREADY calculated and stored in metadata
    
    // Get ACTUAL timezones from users table (not from frontend or metadata)
    const [clientData] = await connection.execute(
      `SELECT timezone FROM users WHERE id = ?`,
      [clientId]
    );
    const actualClientTimezone = clientData[0]?.timezone || bookingTimezone || 'UTC';

    const [companionData] = await connection.execute(
      `SELECT timezone FROM users WHERE id = ?`,
      [companionId]
    );
    const actualCompanionTimezone = companionData[0]?.timezone || 'UTC';

    logger.controllerInfo('bookingController', 'createBooking', '🌍 Fetched actual user timezones', {
      clientTimezone: actualClientTimezone,
      companionTimezone: actualCompanionTimezone,
      metadataTimezone: bookingTimezone
    });

    // Just verify no conflicts exist (times already in UTC)
    const [conflictingBookings] = await connection.execute(
      `SELECT id FROM bookings
       WHERE companion_id = ? AND booking_date = ?
       AND ((start_time <= ? AND end_time > ?) OR (start_time < ? AND end_time >= ?))
       AND status IN ('pending', 'payment_held', 'confirmed')`,
      [companionId, bookingDate, startTime, startTime, endTime, endTime]
    );

    if (conflictingBookings.length > 0) {
      await connection.rollback();
      return sendBadRequest(res, 'Time slot is already booked');
    }

    // Create booking (times already in UTC from metadata, amount already authorized)
    const bookingParams = [
      clientId,
      companionId,
      bookingDate,
      startTime, // Already UTC from metadata
      endTime, // Already UTC from metadata
      durationHours, // Already calculated in metadata
      actualClientTimezone, // Client timezone from users table
      actualClientTimezone, // Store as client_timezone
      actualCompanionTimezone, // Companion timezone from users table
      totalAmount, // Already authorized amount from payment intent
      specialRequests || null,
      meetingLocation || null,
      meetingLocationLat || null,
      meetingLocationLon || null,
      meetingLocationPlaceId || null,
      serviceCategoryId || null,
      meetingType || 'in_person',
      paymentIntentId // Store payment intent ID
    ];

    const [result] = await connection.execute(
      `INSERT INTO bookings
       (client_id, companion_id, booking_date, start_time, end_time, duration_hours, booking_timezone,
        client_timezone, companion_timezone_stored,
        total_amount, special_requests, meeting_location, meeting_location_lat, meeting_location_lon,
        meeting_location_place_id, service_category_id, meeting_type, status, payment_status, payment_intent_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'authorized', ?)`,
      bookingParams
    );

    const bookingId = result.insertId;

    // Get client information for the email and payment
    const [clientInfo] = await connection.execute(
      'SELECT name, email FROM users WHERE id = ?',
      [clientId]
    );
    const clientName = clientInfo[0]?.name || 'Client';
    const clientEmail = clientInfo[0]?.email;

    // Update Payment Intent with booking ID
    try {
      await stripeService.updatePaymentIntent(paymentIntentId, {
        metadata: {
          ...metadata,
          bookingId: String(bookingId)
        }
      });
    } catch (error) {
      logger.controllerWarn('bookingController', 'createBooking', 'Failed to update Payment Intent with booking ID', { error });
    }

    // Commit transaction (payment_status already set to 'authorized' in INSERT)
    await connection.commit();

    // ✅ Payment is already authorized - NOW send notification to companion
    try {
      // Use the helper function for proper notification
      await sendBookingCreatedNotification(
        { id: companionId },
        { clientName, bookingDate, startTime }
      );

      // Send booking notification email to companion with timezone conversion
      const { convertFromUTC } = require('../../utils/timezoneConverter');
      
      // Convert UTC times to companion's timezone for display
      // ✅ Use actualCompanionTimezone (from users table) instead of companion.timezone (from old query)
      const companionStartTime = convertFromUTC(
        startTime,
        bookingDate,
        actualCompanionTimezone
      );
      const companionEndTime = convertFromUTC(
        endTime,
        bookingDate,
        actualCompanionTimezone
      );

      await sendBookingNotificationEmail(companion.email, {
        companionName: companion.name,
        clientName,
        bookingDate,
        startTime: companionStartTime,  // ✅ Converted to companion's timezone
        endTime: companionEndTime,      // ✅ Converted to companion's timezone
        timezone: actualCompanionTimezone,    // ✅ Use actual timezone from users table
        clientTimezone: actualClientTimezone, // ✅ Use actual client timezone (not metadata)
        durationHours,
        totalAmount,
        serviceName: serviceType || 'Standard Service',
        meetingLocation,
        meetingType: meetingType || 'in_person',
        specialRequests: specialRequests || 'None'
      });
    } catch (notificationError) {
      logger.controllerWarn('bookingController', 'createBooking', 'Booking created but notification failed', { 
        bookingId, 
        error: notificationError.message 
      });
    }

    logger.controllerInfo('bookingController', 'createBooking', 'Booking created successfully with authorized payment', { 
      bookingId,
      paymentIntentId,
      status: 'pending',
      paymentStatus: 'authorized'
    });

    // Emit real-time event to companion
    try {
      const { emitBookingUpdate } = require('../../config/socket');
      emitBookingUpdate(clientId, companionId, 'booking_created', {
        bookingId,
        status: 'pending',
        bookingDate,
        startTime,
        endTime,
        totalAmount,
        durationHours,
        clientName,
        companionName: companion.name,
        meetingLocation,
        serviceName: serviceType || 'Standard Service'
      });
    } catch (socketError) {
      logger.controllerError('bookingController', 'createBooking', socketError, req);
    }

    return sendCreated(res, {
      bookingId,
      totalAmount,
      durationHours,
      paymentIntentId
    }, 'Booking created successfully! Payment authorized and companion notified.');

  } catch (error) {
    // Rollback transaction on error
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        logger.controllerError('bookingController', 'createBooking', rollbackError, req);
      }
    }
    throw error;
  } finally {
    // Always release connection back to pool
    if (connection) {
      connection.release();
    }
  }
});

/**
 * Get bookings for a user (client or companion)
 * @route GET /api/booking
 */
const getBookings = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  let userRole = req.user.activeRole || req.user.role;

  logger.controllerInfo('bookingController', 'getBookings', 'Getting bookings for user', {
    userId,
    activeRole: req.user.activeRole,
    fallbackRole: req.user.role,
    determinedRole: userRole,
    allRoles: req.user.roles
  });

  // Safety check for role
  if (!userRole) {
    return sendBadRequest(res, 'Unable to determine user role. Please sign in again.', {
      activeRole: req.user.activeRole,
      role: req.user.role,
      roles: req.user.roles
    });
  }

  // Verify companion role exists in database
  if (userRole === 'companion') {
    const [companionRoleCheck] = await pool.execute(
      'SELECT role FROM user_roles WHERE user_id = ? AND role = "companion" AND is_active = TRUE',
      [userId]
    );

    if (companionRoleCheck.length === 0) {
      logger.controllerWarning('bookingController', 'getBookings',
        'User claims companion role but not found in database', { userId, claimedRole: userRole });
      
      const [clientRoleCheck] = await pool.execute(
        'SELECT role FROM user_roles WHERE user_id = ? AND role = "client" AND is_active = TRUE',
        [userId]
      );
      
      if (clientRoleCheck.length > 0) {
        userRole = 'client';
      }
    }
  }

  const { status } = req.query;
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  const validLimit = Math.floor(isNaN(limit) || limit < 1 ? 20 : Math.min(limit, 100));
  const validOffset = Math.floor(isNaN(offset) || offset < 0 ? 0 : offset);

  // Build query based on user role
  let query;
  if (userRole === 'client') {
    query = `
      SELECT
        b.id,
        b.companion_id,
        DATE_FORMAT(b.booking_date, '%Y-%m-%d') as booking_date,
        b.start_time,
        b.end_time,
        b.duration_hours,
        b.total_amount,
        b.status,
        b.payment_status,
        b.special_requests,
        b.meeting_location,
        b.meeting_type,
        b.created_at,
        b.service_category_id,
        b.cancelled_by,
        b.cancellation_reason,
        b.cancelled_at,
        b.verification_required,
        sc.name as service_category_name,
        sc.base_price as service_category_price,
        u.name as companion_name,
        ca.profile_photo_url as companion_photo
      FROM bookings b
      JOIN users u ON b.companion_id = u.id
      LEFT JOIN companion_applications ca ON u.id = ca.user_id
      LEFT JOIN service_categories sc ON b.service_category_id = sc.id
      WHERE b.client_id = ?
        AND b.payment_status IN ('authorized', 'paid', 'refunded', 'cancelled')
    `;
  } else {
    // ⚠️ PRIVACY: Do NOT include client email for companions
    query = `
      SELECT
        b.id,
        b.client_id,
        DATE_FORMAT(b.booking_date, '%Y-%m-%d') as booking_date,
        b.start_time,
        b.end_time,
        b.duration_hours,
        b.total_amount,
        b.status,
        b.payment_status,
        b.special_requests,
        b.meeting_location,
        b.meeting_type,
        b.created_at,
        b.service_category_id,
        b.cancelled_by,
        b.cancellation_reason,
        b.cancelled_at,
        b.verification_required,
        sc.name as service_category_name,
        sc.base_price as service_category_price,
        u.name as client_name,
        cv.profile_photo_url as client_photo
      FROM bookings b
      JOIN users u ON b.client_id = u.id
      LEFT JOIN client_verifications cv ON u.id = cv.user_id
      LEFT JOIN service_categories sc ON b.service_category_id = sc.id
      WHERE b.companion_id = ?
        AND b.payment_status IN ('authorized', 'paid', 'refunded', 'cancelled')
    `;
  }

  const params = [userId];

  if (status) {
    query += ' AND b.status = ?';
    params.push(status);
  }

  query += ` ORDER BY b.booking_date DESC, b.start_time DESC LIMIT ${validLimit} OFFSET ${validOffset}`;

  const [bookings] = await pool.execute(query, params);

  // Fetch current user's timezone for frontend conversion
  const [userTimezone] = await pool.execute(
    'SELECT timezone FROM users WHERE id = ?',
    [userId]
  );
  const timezone = userTimezone[0]?.timezone || 'UTC';

  // Transform bookings to camelCase
  const transformedBookings = bookings.map(booking => {
    const transformed = transformToFrontend(booking);

    if (transformed.serviceCategoryPrice !== null && transformed.serviceCategoryPrice !== undefined) {
      transformed.serviceCategoryPrice = Number(transformed.serviceCategoryPrice);
    }

    // Validate date format
    if (transformed.bookingDate) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(transformed.bookingDate)) {
        const dateObj = safeParseDate(transformed.bookingDate);
        if (dateObj) {
          const year = dateObj.getFullYear();
          const month = String(dateObj.getMonth() + 1).padStart(2, '0');
          const day = String(dateObj.getDate()).padStart(2, '0');
          transformed.bookingDate = `${year}-${month}-${day}`;
        }
      }
    }

    return transformed;
  });

  // ⚠️ CRITICAL: Return timezone so frontend can display times in user's local time
  return sendSuccess(res, {
    bookings: transformedBookings,
    userTimezone: timezone
  });
});

/**
 * Get a single booking by ID
 * @route GET /api/booking/:bookingId
 */
const getBookingById = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user.id;

  const [bookings] = await pool.execute(
    `SELECT
      b.id,
      b.client_id,
      b.companion_id,
      DATE_FORMAT(b.booking_date, '%Y-%m-%d') as booking_date,
      b.start_time,
      b.end_time,
      b.duration_hours,
      b.total_amount,
      b.status,
      b.special_requests,
      b.meeting_location,
      b.meeting_type,
      b.created_at,
      b.service_category_id,
      sc.name as service_category_name,
      sc.base_price as service_category_price,
      u.name as companion_name,
      u.email as companion_email,
      ca.profile_photo_url as companion_photo,
      c.name as client_name,
      c.email as client_email,
      c.profile_photo_url as client_photo
    FROM bookings b
    JOIN users u ON b.companion_id = u.id
    JOIN users c ON b.client_id = c.id
    LEFT JOIN companion_applications ca ON u.id = ca.user_id
    LEFT JOIN service_categories sc ON b.service_category_id = sc.id
    WHERE b.id = ? AND (b.client_id = ? OR b.companion_id = ?)`,
    [bookingId, userId, userId]
  );

  if (bookings.length === 0) {
    return sendNotFound(res, 'Booking not found or access denied');
  }

  const booking = bookings[0];
  
  // ⚠️ PRIVACY: Remove sensitive data based on user role
  if (userId === booking.client_id) {
    // Client viewing: remove companion email
    delete booking.companion_email;
  } else if (userId === booking.companion_id) {
    // Companion viewing: remove client email
    delete booking.client_email;
  }
  
  const transformedBooking = transformToFrontend(booking);

  if (transformedBooking.serviceCategoryPrice !== null) {
    transformedBooking.serviceCategoryPrice = Number(transformedBooking.serviceCategoryPrice);
  }

  // Fetch current user's timezone for frontend conversion
  const [userTimezone] = await pool.execute(
    'SELECT timezone FROM users WHERE id = ?',
    [userId]
  );
  const timezone = userTimezone[0]?.timezone || 'UTC';

  return sendSuccess(res, {
    booking: transformedBooking,
    userTimezone: timezone
  });
});

/**
 * Update booking status
 * @route PUT /api/booking/:bookingId/status
 */
const updateBookingStatus = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const { status, cancellationReason } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;

  // Fetch the booking with payment info
  const [bookings] = await pool.execute(
    `SELECT id, status, companion_id, client_id, booking_date, start_time, 
            total_amount, payment_intent_id, payment_status
     FROM bookings
     WHERE id = ? AND (client_id = ? OR companion_id = ?)`,
    [bookingId, userId, userId]
  );

  if (bookings.length === 0) {
    return sendNotFound(res, 'Booking not found or access denied');
  }

  const booking = bookings[0];
  const cancelledBy = userId === booking.client_id ? 'client' : 'companion';

  // Check 3-hour cancellation restriction if trying to cancel
  if (status === 'cancelled') {
    const cancellationCheck = canCancelBooking(booking.booking_date, booking.start_time);
    
    if (!cancellationCheck.canCancel) {
      return sendBadRequest(res, cancellationCheck.message, {
        hoursRemaining: cancellationCheck.hoursRemaining
      });
    }
  }

  const currentStatus = booking.status;

  // Enforce role-based status transitions
  const allowedTransitions = {
    client: {
      'pending': ['cancelled'],
      'confirmed': ['cancelled'],
      'meeting_started': ['completed'], // Allow completing after meeting ends
      'completed': [],
      'cancelled': [],
      'no_show': []
    },
    companion: {
      'pending': ['confirmed', 'cancelled'],
      'confirmed': ['completed', 'cancelled', 'no_show'],
      'meeting_started': ['completed'], // Allow completing after meeting ends
      'completed': [],
      'cancelled': [],
      'no_show': []
    }
  };

  const allowedStatuses = allowedTransitions[userRole]?.[currentStatus] || [];

  if (!allowedStatuses.includes(status)) {
    return sendForbidden(res, `You cannot change booking status from '${currentStatus}' to '${status}'. Allowed transitions: ${allowedStatuses.join(', ') || 'none'}`);
  }

  // Handle cancellation with payment logic
  if (status === 'cancelled') {
    // If booking is still PENDING (not confirmed), no penalty
    if (currentStatus === 'pending') {
      await pool.execute(
        `UPDATE bookings 
         SET status = 'cancelled', 
             cancelled_at = NOW(),
             cancelled_by = ?,
             cancellation_reason = ?
         WHERE id = ?`,
        [cancelledBy, cancellationReason || 'No reason provided', bookingId]
      );

      logger.controllerInfo('bookingController', 'updateBookingStatus', 
        'Pending booking cancelled (no payment involved)', { bookingId });

    } else if (currentStatus === 'confirmed' && booking.payment_intent_id) {
      // If booking is CONFIRMED and payment was authorized, release the hold (full refund)
      try {
        // Cancel authorization - full refund, no penalties for anyone
        await stripeService.cancelAuthorization(bookingId);
        
        await pool.execute(
          `UPDATE bookings 
           SET status = 'cancelled',
               cancelled_at = NOW(),
               cancelled_by = ?,
               cancellation_reason = ?,
               cancellation_fee = 0
           WHERE id = ?`,
          [cancelledBy, cancellationReason, bookingId]
        );

        logger.controllerInfo('bookingController', 'updateBookingStatus', 
          'Booking cancelled - full refund, no penalties', 
          { bookingId, cancelledBy });

      } catch (paymentError) {
        logger.controllerError('bookingController', 'updateBookingStatus', paymentError, req);
        return sendError(res, 500, 'Failed to process cancellation. Please contact support.');
      }
    } else {
      // Fallback for other cases
      await pool.execute(
        `UPDATE bookings 
         SET status = 'cancelled', 
             cancelled_at = NOW(),
             cancelled_by = ?,
             cancellation_reason = ?
         WHERE id = ?`,
        [cancelledBy, cancellationReason, bookingId]
      );
    }
  } else {
    // For non-cancellation status updates
    await pool.execute(
      'UPDATE bookings SET status = ? WHERE id = ?',
      [status, bookingId]
    );
  }

  // Create notifications for status updates
  try {
    const [bookingDetails] = await pool.execute(
      `SELECT b.*, c.name as companion_name, cl.name as client_name
       FROM bookings b
       JOIN users c ON b.companion_id = c.id
       JOIN users cl ON b.client_id = cl.id
       WHERE b.id = ?`,
      [bookingId]
    );

    if (bookingDetails.length > 0) {
      const booking = bookingDetails[0];

      // Notify companion if status was changed by client
      if (userRole === 'client') {
        let message = `${booking.client_name} has ${status === 'cancelled' ? 'cancelled' : 'updated'} the booking for ${booking.booking_date}`;
        if (status === 'cancelled' && cancellationReason) {
          message += `. Reason: ${cancellationReason}`;
        }
        
        await createNotification(
          booking.companion_id,
          'booking',
          status === 'cancelled' ? 'Booking Cancelled' : 'Booking Status Updated',
          message,
          '/companion-dashboard'
        );
      }

      // Notify client if status was changed by companion
      if (userRole === 'companion') {
        let message = '';
        let title = 'Booking Status Updated';
        if (status === 'confirmed') {
          message = `${booking.companion_name} has confirmed your booking for ${booking.booking_date}`;
        } else if (status === 'cancelled') {
          message = `${booking.companion_name} has cancelled your booking for ${booking.booking_date}`;
          title = 'Booking Cancelled';
          if (cancellationReason) {
            message += `. Reason: ${cancellationReason}`;
          }
        // Note: 'meeting_started' is set by OTP verification controller, not here
        // The notification for meeting_started is sent in otpVerificationController.js
        } else if (status === 'completed') {
          message = `Your booking with ${booking.companion_name} has been marked as completed`;
        } else if (status === 'no_show') {
          message = `Your booking with ${booking.companion_name} was marked as no-show`;
        }

        if (message) {
          await createNotification(
            booking.client_id,
            'booking',
            title,
            message,
            '/dashboard'
          );
        }
      }
      
      // If booking is completed, send review reminder notification to CLIENT ONLY
      // (Only clients can review companions, not the other way around)
      if (status === 'completed') {
        await createNotification(
          booking.client_id,
          'review',
          'Please Review Your Companion',
          `Your booking with ${booking.companion_name} is complete. Please leave a review to book future companions.`,
          `/bookings/${bookingId}`
        );
      }
    }
  } catch (notificationError) {
    logger.controllerError('bookingController', 'updateBookingStatus', notificationError, req);
  }

  return sendSuccess(res, null, 200, 'Booking status updated successfully');
});

/**
 * Approve a booking (for companions)
 * @route POST /api/booking/:bookingId/approve
 */
const approveBooking = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const companionId = req.user.id;

  let connection;

  try {
    // Get connection for transaction
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Note: Companions do NOT need to complete reviews (only clients review companions)
    // So no pending review check here

    // Verify the booking exists and belongs to this companion
    const [bookings] = await connection.execute(
      `SELECT b.*, c.email as client_email, c.name as client_name
       FROM bookings b
       JOIN users c ON b.client_id = c.id
       WHERE b.id = ? AND b.companion_id = ? AND b.status = 'pending'`,
      [bookingId, companionId]
    );

    if (bookings.length === 0) {
      await connection.rollback();
      return sendNotFound(res, 'Booking not found or already processed');
    }

    const booking = bookings[0];

    // Check if booking is in the past (cannot approve past bookings)
    // Use booking's timezone for validation (stored when booking was created)
    if (isPastTimeSlot(booking.booking_date, booking.start_time, 30, booking.booking_timezone)) {
      await connection.rollback();
      return sendBadRequest(res, 'Cannot approve a booking that has already passed or starts in less than 30 minutes');
    }

    // Check for conflicting approved bookings
    const [conflicts] = await connection.execute(
      `SELECT id FROM bookings
       WHERE companion_id = ? AND booking_date = ?
       AND ((start_time <= ? AND end_time > ?) OR (start_time < ? AND end_time >= ?))
       AND (status = 'confirmed' OR status = 'payment_held') AND id != ?`,
      [companionId, booking.booking_date, booking.start_time, booking.start_time,
       booking.end_time, booking.end_time, bookingId]
    );

    if (conflicts.length > 0) {
      await connection.rollback();
      return sendBadRequest(res, 'You have an existing confirmed booking at this time', {
        detail: 'Please cancel your existing confirmed booking first if you want to approve this request',
        conflicts: conflicts.map(c => ({ id: c.id })),
        requiresAction: 'cancel_existing'
      });
    }

    // Verify payment intent exists (it should have been created when booking was made)
    if (!booking.payment_intent_id) {
      await connection.rollback();
      return sendBadRequest(res, 'No payment method found for this booking. Please contact support.');
    }

    // Update booking status to confirmed
    await connection.execute(
      `UPDATE bookings 
       SET status = ?, 
           confirmed_at = NOW(),
           updated_at = NOW()
       WHERE id = ?`,
      ['confirmed', bookingId]
    );

    logger.controllerInfo('bookingController', 'approveBooking', 'Booking approved successfully', { 
      bookingId, 
      paymentIntentId: booking.payment_intent_id 
    });

    // Commit transaction
    await connection.commit();

    // Send confirmation email to client
    try {
      // Fetch companion name and client timezone
      const [companionData] = await pool.execute(
        'SELECT name FROM users WHERE id = ?',
        [booking.companion_id]
      );
      const companionName = companionData[0]?.name || 'Companion';
      
      const [clientData] = await pool.execute(
        'SELECT timezone FROM users WHERE id = ?',
        [booking.client_id]
      );
      const clientTimezone = clientData[0]?.timezone || booking.booking_timezone || 'UTC';
      
      // Convert UTC times to client's timezone
      const { convertFromUTC } = require('../../utils/timezoneConverter');
      const clientStartTime = convertFromUTC(
        booking.start_time,
        booking.booking_date,
        clientTimezone
      );
      const clientEndTime = convertFromUTC(
        booking.end_time,
        booking.booking_date,
        clientTimezone
      );
      
      await sendBookingConfirmationEmail(
        booking.client_email,
        booking.client_name,
        companionName,
        {
          bookingDate: booking.booking_date,
          startTime: clientStartTime,  // ✅ Converted to client's timezone
          endTime: clientEndTime,      // ✅ Converted to client's timezone
          timezone: clientTimezone,    // ✅ Show client's timezone
          totalAmount: booking.total_amount,
          meetingLocation: booking.meeting_location,
          serviceName: booking.service_name || 'Companionship'
        }
      );
      logger.controllerInfo('bookingController', 'approveBooking', 'Confirmation email sent to client', { clientEmail: booking.client_email });

      // Send in-app notification to client about confirmation
      await sendBookingStatusNotification(
        { id: booking.client_id },
        { companionName },
        'confirmed'
      );
    } catch (emailError) {
      logger.controllerError('bookingController', 'approveBooking', emailError, req);
      // Don't fail the booking approval if email fails
    }

    // Automatically cancel other pending bookings for the same time slot
    const [conflictingBookings] = await pool.execute(
      `SELECT id, client_id 
       FROM bookings
       WHERE companion_id = ? AND booking_date = ?
       AND ((start_time <= ? AND end_time > ?) OR (start_time < ? AND end_time >= ?))
       AND status = 'pending' AND id != ?`,
      [companionId, booking.booking_date, booking.start_time, booking.start_time,
       booking.end_time, booking.end_time, bookingId]
    );

    for (const conflict of conflictingBookings) {
      // Cancel Stripe payment authorization for conflicting booking
      try {
        const [conflictPayment] = await pool.execute(
          'SELECT payment_intent_id FROM bookings WHERE id = ?',
          [conflict.id]
        );
        if (conflictPayment[0]?.payment_intent_id) {
          await stripeService.cancelAuthorization(conflict.id);
        }
      } catch (stripeErr) {
        logger.controllerError('bookingController', 'approveBooking', stripeErr, req);
      }

      await pool.execute(
        `UPDATE bookings
         SET status = 'cancelled',
             payment_status = 'refunded',
             cancelled_by = 'companion',
             cancellation_reason = 'Time slot accepted for another booking',
             cancelled_at = NOW()
         WHERE id = ?`,
        [conflict.id]
      );

      try {
        await createNotification(
          conflict.client_id,
          'booking',
          'Booking Automatically Cancelled',
          `Your booking was cancelled because the companion accepted another booking for this time slot. Your payment has been refunded.`,
          '/client-dashboard'
        );
      } catch (notificationError) {
        logger.controllerError('bookingController', 'approveBooking', notificationError, req);
      }
    }

    // Auto-reject conflicting pending custom requests
    try {
      const [conflictingRequests] = await pool.execute(
        `SELECT id, client_id, payment_intent_id
         FROM booking_requests
         WHERE companion_id = ? AND status = 'pending'
           AND requested_date = ?
           AND start_time IS NOT NULL AND end_time IS NOT NULL
           AND ((start_time <= ? AND end_time > ?) OR (start_time < ? AND end_time >= ?))`,
        [companionId, booking.booking_date, booking.start_time, booking.start_time,
         booking.end_time, booking.end_time]
      );

      for (const conflicting of conflictingRequests) {
        if (conflicting.payment_intent_id) {
          try {
            const pi = await stripeService.retrievePaymentIntent(conflicting.payment_intent_id);
            if (pi.status === 'requires_capture') {
              await stripeService.cancelPaymentIntent(conflicting.payment_intent_id);
            }
          } catch (stripeErr) {
            logger.controllerError('bookingController', 'approveBooking-autoReject', stripeErr, req);
          }
        }

        await pool.execute(
          `UPDATE booking_requests
           SET status = 'rejected',
               companion_response = 'Auto-rejected: time slot is no longer available',
               responded_at = NOW()
           WHERE id = ?`,
          [conflicting.id]
        );

        await createNotification(
          conflicting.client_id,
          'booking',
          'Booking Request Unavailable',
          `Your custom request for ${booking.booking_date} was declined because the time slot is no longer available. Your payment has been refunded.`,
          '/client-dashboard'
        );
      }
    } catch (autoRejectError) {
      logger.controllerError('bookingController', 'approveBooking-autoReject', autoRejectError, req);
    }

    // Emit real-time update to both client and companion
    try {
      const { emitBookingUpdate } = require('../../config/socket');
      emitBookingUpdate(booking.client_id, companionId, 'booking_approved', {
        bookingId,
        status: 'confirmed',
        bookingDate: booking.booking_date,
        startTime: booking.start_time,
        endTime: booking.end_time,
        companionName: req.user.name,
        clientName: booking.client_name
      });
    } catch (socketError) {
      // Don't fail the request if socket emit fails
      logger.controllerError('bookingController', 'approveBooking', socketError, req);
    }

    // Return success (payment was already authorized when booking was created)
    return sendSuccess(res, {
      message: 'Booking approved successfully',
      bookingId,
      status: 'confirmed'
    }, 200, 'Booking approved successfully.');

  } catch (error) {
    // Rollback transaction on error
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        logger.controllerError('bookingController', 'approveBooking', rollbackError, req);
      }
    }
    throw error;
  } finally {
    // Always release connection back to pool
    if (connection) {
      connection.release();
    }
  }
});

/**
 * Reject/Cancel a booking (for companions)
 * @route POST /api/booking/:bookingId/reject
 */
const rejectBooking = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const companionId = req.user.id;
  const { reason, cancellationReason } = req.body;

  const finalReason = cancellationReason || reason || 'No reason provided';

  // Verify the booking exists and belongs to this companion
  const [bookings] = await pool.execute(
    `SELECT b.*, c.email as client_email, c.name as client_name
     FROM bookings b
     JOIN users c ON b.client_id = c.id
     WHERE b.id = ? AND b.companion_id = ?`,
    [bookingId, companionId]
  );

  if (bookings.length === 0) {
    return sendNotFound(res, 'Booking not found or access denied');
  }

  const booking = bookings[0];

  // If booking is already cancelled or completed, don't process
  if (booking.status === 'cancelled' || booking.status === 'completed') {
    return sendBadRequest(res, 'Booking is already ' + booking.status);
  }

  // Handle payment cancellation if booking was confirmed/payment_held with payment
  if ((booking.status === 'confirmed' || booking.status === 'payment_held') && booking.payment_intent_id) {
    try {
      // Cancel payment authorization - full refund, no penalties
      await stripeService.cancelAuthorization(bookingId);

      logger.controllerInfo('bookingController', 'rejectBooking',
        'Confirmed booking cancelled - full refund, no penalties',
        { bookingId });

    } catch (paymentError) {
      logger.controllerError('bookingController', 'rejectBooking', paymentError, req);
      return sendError(res, 500, 'Failed to process cancellation. Please contact support.');
    }
  }

  // Update booking status to cancelled
  await pool.execute(
    `UPDATE bookings 
     SET status = 'cancelled', 
         cancelled_by = 'companion',
         cancellation_reason = ?,
         cancelled_at = NOW(),
         updated_at = NOW() 
     WHERE id = ?`,
    [finalReason, bookingId]
  );

  // Send rejection notification to client
  try {
    await createNotification(
      booking.client_id,
      'booking',
      'Booking Request Cancelled',
      `${req.user.name || 'The companion'} has cancelled your booking request. Reason: ${finalReason}`,
      '/client-dashboard'
    );

    // Send cancellation email to client
    try {
      // Fetch client timezone
      const [clientData] = await pool.execute(
        'SELECT timezone FROM users WHERE id = ?',
        [booking.client_id]
      );
      const clientTimezone = clientData[0]?.timezone || booking.booking_timezone || 'UTC';
      
      // Convert UTC time to client's timezone
      const { convertFromUTC } = require('../../utils/timezoneConverter');
      const clientStartTime = convertFromUTC(
        booking.start_time,
        booking.booking_date,
        clientTimezone
      );
      
      await sendBookingCancellationEmail(
        booking.client_email,
        booking.client_name,
        req.user.name,
        {
          bookingDate: booking.booking_date,
          startTime: clientStartTime,  // ✅ Converted to client's timezone
          timezone: clientTimezone,    // ✅ Show client's timezone
          serviceName: booking.service_name || 'Companionship'
        },
        finalReason
      );
      logger.controllerInfo('bookingController', 'rejectBooking', 'Cancellation email sent to client', { clientEmail: booking.client_email });
    } catch (emailError) {
      logger.controllerError('bookingController', 'rejectBooking', emailError, req);
      // Don't fail the rejection if email fails
    }
  } catch (notificationError) {
    logger.controllerError('bookingController', 'rejectBooking', notificationError, req);
  }

  // Emit real-time update to both client and companion
  try {
    const { emitBookingUpdate } = require('../../config/socket');
    emitBookingUpdate(booking.client_id, companionId, 'booking_cancelled', {
      bookingId,
      status: 'cancelled',
      cancelledBy: 'companion',
      reason: finalReason,
      bookingDate: booking.booking_date,
      startTime: booking.start_time,
      companionName: req.user.name,
      clientName: booking.client_name
    });
  } catch (socketError) {
    // Don't fail the request if socket emit fails
    logger.controllerError('bookingController', 'rejectBooking', socketError, req);
  }

  return sendSuccess(res, null, 200, 'Booking cancelled successfully');
});

/**
 * Get pending bookings for companion approval
 * @route GET /api/booking/pending
 */
const getPendingBookingsForCompanion = asyncHandler(async (req, res) => {
  const companionId = req.user.id;

  const [bookings] = await pool.execute(
    `SELECT
      b.id,
      DATE_FORMAT(b.booking_date, '%Y-%m-%d') as booking_date,
      b.start_time,
      b.end_time,
      b.duration_hours,
      b.total_amount,
      b.status,
      b.special_requests,
      b.meeting_location,
      b.meeting_type,
      b.created_at,
      b.service_category_id,
      b.client_id,
      b.companion_id,
      c.name as client_name,
      c.email as client_email,
      cv.profile_photo_url as client_photo,
      sc.name as service_category_name,
      sc.base_price as service_category_price
     FROM bookings b
     JOIN users c ON b.client_id = c.id
     LEFT JOIN client_verifications cv ON c.id = cv.user_id
    LEFT JOIN service_categories sc ON b.service_category_id = sc.id
    WHERE b.companion_id = ? 
      AND b.status = 'pending'
      AND b.payment_status = 'authorized'
    ORDER BY b.created_at DESC`,
    [companionId]
  );

  // Fetch companion's timezone for frontend conversion
  const [companionTimezone] = await pool.execute(
    'SELECT timezone FROM users WHERE id = ?',
    [companionId]
  );
  const timezone = companionTimezone[0]?.timezone || 'UTC';

  const transformedBookings = transformArrayToFrontend(bookings);

  return sendSuccess(res, {
    pendingBookings: transformedBookings,
    pendingCount: transformedBookings.length,
    userTimezone: timezone
  });
});

/**
 * Create booking AFTER payment is authorized
 * @route POST /api/booking/create-with-payment
 */
const createBookingWithPayment = asyncHandler(async (req, res) => {
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const clientId = req.user.id;
    const {
      paymentIntentId,
      companionId,
      bookingDate,
      startTime,
      endTime,
      durationHours,
      totalAmount,
      serviceCategoryId,
      meetingLocation,
      meetingLocationLat,
      meetingLocationLon,
      meetingLocationPlaceId,
      meetingType,
      specialRequests,
      bookingTimezone
    } = req.body;

    // Validate required fields
    if (!paymentIntentId || !companionId || !bookingDate || !startTime || !endTime) {
      await connection.rollback();
      return sendBadRequest(res, 'Missing required fields');
    }

    // Verify payment intent is authorized
    const paymentIntent = await stripeService.retrievePaymentIntent(paymentIntentId);
    
    if (paymentIntent.status !== 'requires_capture') {
      await connection.rollback();
      return sendBadRequest(res, `Payment not authorized. Status: ${paymentIntent.status}`);
    }

    // Convert times to UTC for storage (convert each time separately)
    const utcStartTime = convertToUTC(startTime, bookingDate, bookingTimezone || 'UTC');
    const utcEndTime = convertToUTC(endTime, bookingDate, bookingTimezone || 'UTC');

    // Create booking with payment_status='authorized'
    const bookingParams = [
      clientId,
      companionId,
      bookingDate,
      utcStartTime,
      utcEndTime,
      durationHours,
      bookingTimezone || 'UTC',
      totalAmount,
      specialRequests || null,
      meetingLocation || null,
      meetingLocationLat || null,
      meetingLocationLon || null,
      meetingLocationPlaceId || null,
      serviceCategoryId || null,
      meetingType || 'in_person',
      paymentIntentId
    ];

    const [result] = await connection.execute(
      `INSERT INTO bookings
       (client_id, companion_id, booking_date, start_time, end_time, duration_hours, booking_timezone,
        total_amount, special_requests, meeting_location, meeting_location_lat, meeting_location_lon,
        meeting_location_place_id, service_category_id, meeting_type, status, payment_status, payment_intent_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'authorized', ?)`,
      bookingParams
    );

    const bookingId = result.insertId;

    // Get full booking details for notification
    const [bookings] = await connection.execute(
      `SELECT b.*, 
              c.name as companion_name, c.email as companion_email, c.timezone as companion_timezone,
              cl.name as client_name,
              sc.name as service_name
       FROM bookings b
       JOIN users c ON b.companion_id = c.id
       JOIN users cl ON b.client_id = cl.id
       LEFT JOIN service_categories sc ON b.service_category_id = sc.id
       WHERE b.id = ?`,
      [bookingId]
    );

    const booking = bookings[0];

    await connection.commit();

    logger.controllerInfo('bookingController', 'createBookingWithPayment', 'Booking created with authorized payment', {
      bookingId,
      paymentIntentId
    });

    // Send notification to companion
    try {
      const { sendBookingNotificationEmail } = require('../../services/emailService');
      const { convertFromUTC } = require('../../utils/timezoneConverter');
      
      // Convert UTC times to companion's timezone for display
      const companionTimezone = booking.companion_timezone || 'UTC';
      const companionStartTime = convertFromUTC(
        booking.start_time,
        booking.booking_date,
        companionTimezone
      );
      const companionEndTime = convertFromUTC(
        booking.end_time,
        booking.booking_date,
        companionTimezone
      );

      await sendBookingNotificationEmail(booking.companion_email, {
        companionName: booking.companion_name,
        clientName: booking.client_name,
        bookingDate: booking.booking_date,
        startTime: companionStartTime, // ✅ Converted to companion's timezone
        endTime: companionEndTime,     // ✅ Converted to companion's timezone
        timezone: companionTimezone,   // ✅ Show companion's timezone
        clientTimezone: bookingTimezone, // ✅ Show client's timezone for reference
        durationHours: booking.duration_hours,
        totalAmount: booking.total_amount,
        serviceName: booking.service_name || 'Standard Service',
        meetingLocation: booking.meeting_location,
        meetingType: booking.meeting_type || 'in_person',
        specialRequests: booking.special_requests
      });

      // Create in-app notification
      const { createNotification } = require('../../services/notificationService');
      const { notificationTemplates } = require('../../config/notificationTemplates');
      const notificationData = notificationTemplates.bookingCreated(
        booking.client_name,
        booking.booking_date,
        booking.start_time
      );

      await createNotification(
        booking.companion_id,
        notificationData.type,
        notificationData.title,
        notificationData.message,
        notificationData.actionUrl
      );
    } catch (notificationError) {
      logger.controllerError('bookingController', 'createBookingWithPayment', notificationError, req);
      // Don't fail if notification fails
    }

    // Emit real-time socket event to notify companion dashboard
    try {
      const { emitBookingUpdate } = require('../../config/socket');
      emitBookingUpdate(clientId, companionId, 'booking_created', {
        bookingId,
        status: 'pending',
        bookingDate: booking.booking_date,
        startTime: booking.start_time,  // UTC time from database
        endTime: booking.end_time,      // UTC time from database
        totalAmount: booking.total_amount,
        durationHours: booking.duration_hours,
        clientName: booking.client_name,
        companionName: booking.companion_name,
        meetingLocation: booking.meeting_location,
        serviceName: booking.service_name || 'Standard Service'
      });
    } catch (socketError) {
      logger.controllerError('bookingController', 'createBookingWithPayment', socketError, req);
      // Don't fail if socket emit fails - booking is already created
    }

    return sendCreated(res, {
      bookingId,
      status: 'pending',
      paymentStatus: 'authorized',
      message: 'Booking created successfully! Pending companion approval.'
    });

  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        logger.controllerError('bookingController', 'createBookingWithPayment', rollbackError, req);
      }
    }
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

/**
 * Confirm payment and finalize booking
 * @route POST /api/booking/:bookingId/confirm-payment
 */
const confirmBookingPayment = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const clientId = req.user.id;

  // Verify booking exists and belongs to this client
  const [bookings] = await pool.execute(
    `SELECT b.*, u.email as companion_email, u.name as companion_name, u.timezone as companion_timezone,
            c.email as client_email, c.name as client_name
     FROM bookings b
     JOIN users u ON b.companion_id = u.id
     JOIN users c ON b.client_id = c.id
     WHERE b.id = ? AND b.client_id = ?`,
    [bookingId, clientId]
  );

  if (bookings.length === 0) {
    return sendNotFound(res, 'Booking not found');
  }

  const booking = bookings[0];

  // Check if payment is still pending (not already confirmed)
  if (booking.payment_status !== 'pending') {
    return sendBadRequest(res, 'Payment has already been processed for this booking');
  }

  // Update payment status to 'authorized' (card hold successful, but not yet captured)
  // Payment will be captured and set to 'paid' after meeting is completed
  await pool.execute(
    `UPDATE bookings 
     SET payment_status = 'authorized',
         updated_at = NOW()
     WHERE id = ?`,
    [bookingId]
  );

  logger.controllerInfo('bookingController', 'confirmBookingPayment', 'Payment authorized, booking now pending companion approval', { 
    bookingId 
  });

  // ⭐ NOW send notification to companion (payment is authorized)
  try {
    const { sendBookingNotificationEmail } = require('../../services/emailService');
    const { convertFromUTC } = require('../../utils/timezoneConverter');
    
    // Convert UTC times to companion's timezone for display
    const companionTimezone = booking.companion_timezone || 'UTC';
    const companionStartTime = convertFromUTC(
      booking.start_time,
      booking.booking_date,
      companionTimezone
    );
    const companionEndTime = convertFromUTC(
      booking.end_time,
      booking.booking_date,
      companionTimezone
    );

    await sendBookingNotificationEmail(booking.companion_email, {
      companionName: booking.companion_name,
      clientName: booking.client_name,
      bookingDate: booking.booking_date,
      startTime: companionStartTime, // ✅ Converted to companion's timezone
      endTime: companionEndTime,     // ✅ Converted to companion's timezone
      timezone: companionTimezone,   // ✅ Show companion's timezone
      clientTimezone: booking.booking_timezone, // ✅ Show client's timezone for reference
      durationHours: booking.duration_hours,
      totalAmount: booking.total_amount,
      serviceName: booking.service_name || 'Standard Service',
      meetingLocation: booking.meeting_location,
      meetingType: booking.meeting_type || 'in_person',
      specialRequests: booking.special_requests
    });

    // Create in-app notification
    const { createNotification } = require('../../services/notificationService');
    const { notificationTemplates } = require('../../config/notificationTemplates');
    const notificationData = notificationTemplates.bookingCreated(
      booking.client_name, 
      booking.booking_date, 
      booking.start_time
    );
    await createNotification(
      booking.companion_id,
      notificationData.type,
      notificationData.title,
      notificationData.message,
      notificationData.actionUrl
    );
  } catch (notificationError) {
    logger.controllerError('bookingController', 'confirmBookingPayment', notificationError, req);
    // Don't fail the confirmation if notification fails
  }

  return sendSuccess(res, { 
    message: 'Payment confirmed successfully',
    bookingId,
    status: 'pending'
  });
});

/**
 * Complete booking payment - Capture authorized payment after meeting is completed
 * @route POST /api/booking/:bookingId/complete-payment
 */
const completeBookingPayment = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user.id;

  // Get booking details
  const [bookings] = await pool.execute(
    `SELECT b.*, u.name as client_name 
     FROM bookings b
     JOIN users u ON b.client_id = u.id
     WHERE b.id = ?`,
    [bookingId]
  );

  if (bookings.length === 0) {
    return sendNotFound(res, 'Booking not found');
  }

  const booking = bookings[0];

  // Only companion or admin can complete payment
  if (req.user.role !== 'admin' && booking.companion_id !== userId) {
    return sendUnauthorized(res, 'Only the companion or admin can complete this booking payment');
  }

  // Check if booking is completed
  if (booking.status !== 'completed') {
    return sendBadRequest(res, 'Booking must be completed before capturing payment');
  }

  // Check if payment is authorized (not already captured)
  if (booking.payment_status !== 'authorized') {
    return sendBadRequest(res, `Payment cannot be captured. Current status: ${booking.payment_status}`);
  }

  // Capture the payment in Stripe
  try {
    await stripeService.capturePayment(bookingId);
    
    logger.controllerInfo('bookingController', 'completeBookingPayment', 'Payment captured successfully', { 
      bookingId,
      paymentIntentId: booking.payment_intent_id 
    });
  } catch (error) {
    logger.controllerError('bookingController', 'completeBookingPayment', error, req);
    return sendError(res, 'Failed to capture payment. Please contact support.', 500);
  }

  // Update payment status to 'paid'
  await pool.execute(
    `UPDATE bookings 
     SET payment_status = 'paid',
         updated_at = NOW()
     WHERE id = ?`,
    [bookingId]
  );

  logger.controllerInfo('bookingController', 'completeBookingPayment', 'Payment captured and marked as paid', { 
    bookingId 
  });

  // Emit real-time event to companion about payment capture
  try {
    const { emitPaymentCaptured } = require('../../config/socket');
    emitPaymentCaptured(booking.companion_id, {
      bookingId,
      totalAmount: booking.total_amount,
      companionEarnings: booking.total_amount * 0.85,
      platformFee: booking.total_amount * 0.15,
      message: 'Payment captured successfully! Earnings will be released in 7 days.'
    });
  } catch (socketError) {
    logger.controllerError('bookingController', 'completeBookingPayment', socketError, req);
  }

  return sendSuccess(res, { 
    message: 'Payment captured successfully. Funds will be transferred to companion.',
    bookingId,
    paymentStatus: 'paid'
  });
});

module.exports = {
  createBooking,
  createPaymentIntent,
  createBookingWithPayment,
  getBookings,
  getBookingById,
  updateBookingStatus,
  approveBooking,
  rejectBooking,
  getPendingBookingsForCompanion,
  confirmBookingPayment,
  completeBookingPayment
};

