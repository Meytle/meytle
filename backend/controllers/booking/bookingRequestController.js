/**
 * Booking Request Controller
 * Handles booking request workflow when time slots are unavailable
 */

const { pool } = require('../../config/database');
const { createNotification, notificationTemplates } = require('../../services/notificationService');
const { transformToFrontend, transformArrayToFrontend } = require('../../utils/transformer');
const { safeParseDate, isPastTimeSlot, canCancelBooking } = require('../../utils/dateHelpers');
const { sendSuccess, sendError, sendCreated, sendNotFound, sendBadRequest, sendForbidden } = require('../../utils/responseHelpers');
const asyncHandler = require('../../utils/asyncHandler');
const logger = require('../../services/logger');

/**
 * Create payment intent for booking request (WITHOUT creating request in DB yet)
 * @route POST /api/booking/requests/create-payment-intent
 */
const createRequestPaymentIntent = asyncHandler(async (req, res) => {
  const clientId = req.user.id;
  
  const {
    companionId,
    requestedDate,
    startTime,
    endTime,
    durationHours,
    serviceType,
    extraAmount,
    clientTimezone
  } = req.body;

  // Validation
  if (!companionId || !requestedDate || !durationHours) {
    return sendBadRequest(res, 'Missing required fields');
  }

  // Prevent self-booking requests
  if (clientId === parseInt(companionId)) {
    return sendBadRequest(res, 'You cannot request a booking with yourself');
  }

  // Validate booking date is valid
  const parsedDate = safeParseDate(requestedDate);
  if (!parsedDate) {
    return sendBadRequest(res, 'Invalid booking date provided');
  }

  // Validate requested date/time is not in the past
  // For custom requests, only check if time has passed (no 24-hour buffer needed)
  // Companion can accept/reject based on timing - they have full control
  let timeToCheck = startTime || '00:00:00'; // Use start time if provided, otherwise midnight
  
  // Ensure time is in HH:MM:SS format (frontend might send HH:MM)
  if (timeToCheck && timeToCheck.split(':').length === 2) {
    timeToCheck = `${timeToCheck}:00`; // Add seconds
  }
  
  logger.controllerInfo('bookingRequestController', 'createRequestPaymentIntent', 'Validating time slot', {
    requestedDate,
    startTime,
    timeToCheck,
    clientTimezone,
    currentServerTime: new Date().toISOString()
  });

  // Note: startTime from frontend is already in UTC, so don't pass clientTimezone
  // (isPastTimeSlot would double-convert if we pass timezone)
  if (isPastTimeSlot(requestedDate, timeToCheck, 0)) { // 0 minutes buffer - only reject if already passed
    logger.controllerWarn('bookingRequestController', 'createRequestPaymentIntent', 'Rejected: Time slot is in the past', {
      requestedDate,
      timeToCheck,
      clientTimezone
    });
    return sendBadRequest(res, 'Cannot request a booking for a time that has already passed');
  }
  
  logger.controllerInfo('bookingRequestController', 'createRequestPaymentIntent', 'Time validation passed', {
    requestedDate,
    timeToCheck,
    clientTimezone
  });

  // Check if companion exists and is approved
  const [companions] = await pool.execute(
    `SELECT u.id, u.name, u.email, ca.hourly_rate
     FROM users u
     JOIN companion_applications ca ON u.id = ca.user_id
     JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'companion' AND ur.is_active = TRUE
     WHERE u.id = ? AND ca.status = 'approved'`,
    [companionId]
  );

  if (companions.length === 0) {
    return sendNotFound(res, 'Companion not found or not approved');
  }

  const companion = companions[0];

  // Get client info
  const [clientInfo] = await pool.execute(
    'SELECT name, email FROM users WHERE id = ?',
    [clientId]
  );

  if (clientInfo.length === 0) {
    return sendBadRequest(res, 'Client not found');
  }

  const client = clientInfo[0];

  // Calculate amount
  const hourlyRate = companion.hourly_rate || 35;
  const duration = parseFloat(durationHours) || 1;
  const baseAmount = Math.round(duration * hourlyRate * 100) / 100;
  const totalAmount = baseAmount + (parseFloat(extraAmount) || 0);

  // Create payment intent in Stripe (NO request in DB yet!)
  const stripeService = require('../../services/stripeService');
  const paymentIntent = await stripeService.createPaymentIntent({
    amount: totalAmount,
    currency: 'usd',
    receipt_email: client.email, // Client's email for Stripe receipt/customer identification
    metadata: {
      type: 'booking_request',
      clientId: String(clientId),
      clientName: client.name,
      clientEmail: client.email,
      companionId: String(companionId),
      companionName: companion.name,
      requestedDate,
      durationHours: String(durationHours),
      serviceType: serviceType || 'Custom Request',
      extraAmount: String(extraAmount || 0)
    }
  });

  logger.controllerInfo('bookingRequestController', 'createRequestPaymentIntent', 'Payment intent created (no request yet)', {
    paymentIntentId: paymentIntent.id,
    clientId,
    companionId,
    amount: totalAmount
  });

  return sendSuccess(res, {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    totalAmount,
    durationHours
  }, 200, 'Payment intent created. Please authorize payment to complete request.');
});

/**
 * Create booking request AFTER payment is authorized
 * @route POST /api/booking/requests/create-with-payment
 */
const createRequestWithPayment = asyncHandler(async (req, res) => {
  const clientId = req.user.id;
  
  const {
    paymentIntentId,
    companionId,
    requestedDate,
    preferredTime,
    startTime,
    endTime,
    durationHours,
    serviceCategoryId,
    serviceType,
    extraAmount,
    meetingType,
    specialRequests,
    meetingLocation,
    meetingLocationLat,
    meetingLocationLon,
    meetingLocationPlaceId
  } = req.body;

  // Validate required fields
  if (!paymentIntentId || !companionId || !requestedDate) {
    return sendBadRequest(res, 'Missing required fields');
  }

  // Verify payment intent is authorized
  const stripeService = require('../../services/stripeService');
  const paymentIntent = await stripeService.retrievePaymentIntent(paymentIntentId);
  
  if (paymentIntent.status !== 'requires_capture') {
    return sendBadRequest(res, `Payment not authorized. Status: ${paymentIntent.status}`);
  }

  // Get companion info
  const [companions] = await pool.execute(
    `SELECT u.id, u.name, u.email, u.timezone as companion_timezone, ca.hourly_rate
     FROM users u
     JOIN companion_applications ca ON u.id = ca.user_id
     WHERE u.id = ?`,
    [companionId]
  );

  if (companions.length === 0) {
    return sendNotFound(res, 'Companion not found');
  }

  const companion = companions[0];

  // Get client info
  const [clientInfo] = await pool.execute(
    'SELECT name, email, timezone as client_timezone FROM users WHERE id = ?',
    [clientId]
  );

  const client = clientInfo[0];

  // Calculate amount (verify it matches payment intent)
  const hourlyRate = companion.hourly_rate || 35;
  const duration = parseFloat(durationHours) || 1;
  const baseAmount = Math.round(duration * hourlyRate * 100) / 100;
  const totalAmount = baseAmount + (parseFloat(extraAmount) || 0);

  // Set expiry date (7 days from now)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  // Create the booking request with payment_status='authorized'
  const [result] = await pool.execute(
    `INSERT INTO booking_requests
     (client_id, companion_id, requested_date, preferred_time, start_time, end_time,
      client_timezone, companion_timezone,
      duration_hours, service_category_id, service_type, extra_amount, meeting_type,
      special_requests, meeting_location, meeting_location_lat, meeting_location_lon, 
      meeting_location_place_id, expires_at, status, payment_status, payment_intent_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'authorized', ?)`,
    [
      clientId,
      companionId,
      requestedDate,
      preferredTime || null,
      startTime || null,
      endTime || null,
      client.client_timezone || 'UTC',      // Store client's actual timezone
      companion.companion_timezone || 'UTC', // Store companion's actual timezone
      durationHours || 1,
      serviceCategoryId || null,
      serviceType || null,
      extraAmount || 0,
      meetingType || 'in_person',
      specialRequests || null,
      meetingLocation || null,
      meetingLocationLat || null,
      meetingLocationLon || null,
      meetingLocationPlaceId || null,
      expiresAt,
      paymentIntentId
    ]
  );

  logger.controllerInfo('bookingRequestController', 'createRequestWithPayment', '🌍 Stored user timezones in booking request', {
    requestId: result.insertId,
    clientTimezone: client.client_timezone || 'UTC',
    companionTimezone: companion.companion_timezone || 'UTC'
  });

  const requestId = result.insertId;

  logger.controllerInfo('bookingRequestController', 'createRequestWithPayment', 'Booking request created with authorized payment', {
    requestId,
    paymentIntentId
  });

  // Send notification to companion (both email and in-app)
  try {
    const { sendBookingNotificationEmail } = require('../../services/emailService');
    const { convertFromUTC } = require('../../utils/timezoneConverter');
    
    // Convert UTC times to companion's timezone for display (if times are provided)
    const companionTimezone = companion.companion_timezone || 'UTC';
    const companionStartTime = startTime ? convertFromUTC(
      startTime,
      requestedDate,
      companionTimezone
    ) : null;
    const companionEndTime = endTime ? convertFromUTC(
      endTime,
      requestedDate,
      companionTimezone
    ) : null;

    // Send email notification
    await sendBookingNotificationEmail(companion.email, {
      companionName: companion.name,
      clientName: client.name,
      bookingDate: requestedDate,
      startTime: companionStartTime || preferredTime || 'Flexible', // ✅ Converted or flexible
      endTime: companionEndTime || 'TBD',                           // ✅ Converted or TBD
      timezone: companionTimezone,                                  // ✅ Companion's timezone
      clientTimezone: client.client_timezone,                       // ✅ Client's timezone
      durationHours: durationHours || 1,
      totalAmount,
      serviceName: serviceType || 'Custom Request',
      meetingLocation: meetingLocation || 'To be discussed',
      meetingType: meetingType || 'in_person',
      specialRequests: specialRequests || 'None'
    });

    // Send in-app notification
    const notificationData = notificationTemplates.bookingRequest(
      client.name, 
      requestedDate
    );
    await createNotification(
      companionId,
      notificationData.type,
      notificationData.title,
      notificationData.message,
      notificationData.actionUrl
    );
  } catch (notificationError) {
    logger.controllerError('bookingRequestController', 'createRequestWithPayment', notificationError, req);
    // Don't fail if notification fails
  }

  // Emit real-time event to companion
  try {
    const { emitBookingUpdate } = require('../../config/socket');
    emitBookingUpdate(clientId, companionId, 'request_created', {
      requestId,
      type: 'custom_request',
      status: 'pending',
      requestedDate,
      startTime,
      endTime,
      totalAmount,
      durationHours,
      clientName: req.user.name,
      companionName: companion.name,
      serviceType,
      meetingLocation
    });
  } catch (socketError) {
    logger.controllerError('bookingRequestController', 'createRequestWithPayment', socketError, req);
  }

  return sendCreated(res, {
    requestId,
    totalAmount,
    durationHours,
    status: 'pending',
    paymentStatus: 'authorized',
    expiresAt,
    message: 'Booking request created successfully! Pending companion approval.'
  });
});

/**
 * Create a booking request when no time slots are available
 * @route POST /api/booking/request
 */
const createBookingRequest = asyncHandler(async (req, res) => {
  const clientId = req.user.id;
  
  const {
    companion_id: companionId,
    requested_date: requestedDate,
    preferred_time: preferredTime,
    start_time: startTime,
    end_time: endTime,
    duration_hours: durationHours,
    service_category_id: serviceCategoryId,
    service_type: serviceType,
    extra_amount: extraAmount,
    meeting_type: meetingType,
    special_requests: specialRequests,
    meeting_location: meetingLocation,
    meeting_location_lat: meetingLocationLat,
    meeting_location_lon: meetingLocationLon,
    meeting_location_place_id: meetingLocationPlaceId
  } = req.body;

  // Prevent self-booking requests
  if (clientId === parseInt(companionId)) {
    return sendBadRequest(res, 'You cannot request a booking with yourself');
  }

  // Check if companion exists and is approved
  const [companions] = await pool.execute(
    `SELECT u.id, u.name, u.email, ca.hourly_rate
     FROM users u
     JOIN companion_applications ca ON u.id = ca.user_id
     JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'companion' AND ur.is_active = TRUE
     WHERE u.id = ? AND ca.status = 'approved'`,
    [companionId]
  );

  if (companions.length === 0) {
    return sendNotFound(res, 'Companion not found or not approved');
  }

  // Get client email for payment
  const [clientInfo] = await pool.execute(
    'SELECT name, email FROM users WHERE id = ?',
    [clientId]
  );

  if (clientInfo.length === 0) {
    return sendBadRequest(res, 'Client not found');
  }

  const clientName = clientInfo[0].name || 'Client';
  const clientEmail = clientInfo[0].email;
  const companion = companions[0];

  // Calculate estimated amount
  const hourlyRate = companion.hourly_rate || 35;
  const duration = durationHours || 1;
  const baseAmount = Math.round(duration * hourlyRate * 100) / 100;
  const totalAmount = baseAmount + (parseFloat(extraAmount) || 0);

  // Set expiry date (7 days from now)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  // Create the booking request
  const [result] = await pool.execute(
    `INSERT INTO booking_requests
     (client_id, companion_id, requested_date, preferred_time, start_time, end_time,
      duration_hours, service_category_id, service_type, extra_amount, meeting_type,
      special_requests, meeting_location, meeting_location_lat, meeting_location_lon, 
      meeting_location_place_id, expires_at, status, payment_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending')`,
    [
      clientId,
      companionId,
      requestedDate,
      preferredTime || null,
      startTime || null,
      endTime || null,
      durationHours || 1,
      serviceCategoryId || null,
      serviceType || null,
      extraAmount || 0,
      meetingType || 'in_person',
      specialRequests || null,
      meetingLocation || null,
      meetingLocationLat || null,
      meetingLocationLon || null,
      meetingLocationPlaceId || null,
      expiresAt
    ]
  );

  const requestId = result.insertId;

  // ⭐ Create PaymentIntent to authorize payment (hold the money)
  let paymentResult;
  try {
    const stripeService = require('../../services/stripeService');
    paymentResult = await stripeService.authorizePayment(
      requestId,
      totalAmount,
      clientEmail,
      {
        companion_id: companionId,
        client_id: clientId,
        booking_date: requestedDate,
        service_name: serviceType || 'Custom Request',
        request_type: 'custom_booking_request'
      }
    );
    
    logger.controllerInfo('bookingRequestController', 'createBookingRequest', 'Payment intent created for custom request', { 
      requestId, 
      paymentIntentId: paymentResult.paymentIntentId 
    });
  } catch (paymentError) {
    // Rollback: Delete the request if payment fails
    await pool.execute('DELETE FROM booking_requests WHERE id = ?', [requestId]);
    logger.controllerError('bookingRequestController', 'createBookingRequest', paymentError, req);
    return sendError(res, 500, 'Failed to initialize payment. Please try again or contact support.');
  }

  // Save payment_intent_id to booking_requests
  await pool.execute(
    'UPDATE booking_requests SET payment_intent_id = ? WHERE id = ?',
    [paymentResult.paymentIntentId, requestId]
  );

  // ⚠️ DO NOT send notification yet - wait for client to complete payment authorization
  // Companion will be notified ONLY after payment is successfully authorized
  
  logger.controllerInfo('bookingRequestController', 'createBookingRequest', 'Booking request created, awaiting payment authorization', { 
    requestId 
  });

  return sendCreated(res, {
    requestId: requestId,
    totalAmount,
    durationHours: duration,
    clientSecret: paymentResult.clientSecret,  // ⭐ Return clientSecret for payment confirmation
    requiresPayment: true  // Flag to indicate payment is needed
  }, 'Booking request created successfully. Please complete payment authorization.');
});

/**
 * Get booking requests for a user (client or companion)
 * @route GET /api/booking/requests
 */
const getBookingRequests = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  let { role } = req.query;
  const { status } = req.query;

  // Validate/derive role
  const allowedRoles = new Set(['client', 'companion']);
  if (!role || !allowedRoles.has(role)) {
    role = (req.user.activeRole && allowedRoles.has(req.user.activeRole))
      ? req.user.activeRole
      : 'client';
  }

  let query;
  let params = [userId];

  if (role === 'companion') {
    // Companion viewing incoming requests from clients
    // ⚠️ PRIVACY: Do NOT include client email
    // ⚠️ ONLY show requests where payment is authorized (payment_status='authorized')
    // Payment is authorized (card hold) but not yet captured (will be captured after meeting)
    query = `
      SELECT
        br.*,
        u.name as client_name,
        cv.profile_photo_url as client_photo,
        sc.name as service_category_name,
        sc.base_price as service_price
      FROM booking_requests br
      JOIN users u ON br.client_id = u.id
      LEFT JOIN client_verifications cv ON u.id = cv.user_id
      LEFT JOIN service_categories sc ON br.service_category_id = sc.id
      WHERE br.companion_id = ?
        AND br.status IN ('pending', 'rejected', 'expired')
        AND br.payment_status = 'authorized'`;
  } else {
    // Client viewing their sent requests to companions
    // ⚠️ PRIVACY: Do NOT include companion email
    query = `
      SELECT
        br.*,
        u.name as companion_name,
        ca.profile_photo_url as companion_photo,
        sc.name as service_category_name,
        sc.base_price as service_price
      FROM booking_requests br
      JOIN users u ON br.companion_id = u.id
      LEFT JOIN companion_applications ca ON u.id = ca.user_id
      LEFT JOIN service_categories sc ON br.service_category_id = sc.id
      WHERE br.client_id = ?
        AND br.status IN ('pending', 'rejected', 'expired')
        AND br.payment_status IN ('authorized', 'paid')`;
  }

  if (status) {
    query += ' AND br.status = ?';
    params.push(status);
  }

  query += ' ORDER BY br.created_at DESC';

  const [requests] = await pool.execute(query, params);
  const transformedRequests = transformArrayToFrontend(requests);

  // Fetch current user's timezone for frontend conversion
  const [userTimezone] = await pool.execute(
    'SELECT timezone FROM users WHERE id = ?',
    [userId]
  );
  const timezone = userTimezone[0]?.timezone || 'UTC';

  return sendSuccess(res, { 
    requests: transformedRequests,
    userTimezone: timezone 
  });
});

/**
 * Get single booking request details
 * @route GET /api/booking/requests/:requestId
 */
const getBookingRequestById = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { requestId } = req.params;

  const [requests] = await pool.execute(
    `SELECT
      br.*,
      client.name as client_name,
      client.email as client_email,
      cv.profile_photo_url as client_photo,
      companion.name as companion_name,
      companion.email as companion_email,
      ca.profile_photo_url as companion_photo,
      sc.name as service_category_name,
      sc.base_price as service_price
    FROM booking_requests br
    JOIN users client ON br.client_id = client.id
    JOIN users companion ON br.companion_id = companion.id
    LEFT JOIN client_verifications cv ON client.id = cv.user_id
    LEFT JOIN companion_applications ca ON companion.id = ca.user_id
    LEFT JOIN service_categories sc ON br.service_category_id = sc.id
    WHERE br.id = ? AND (br.client_id = ? OR br.companion_id = ?)`,
    [requestId, userId, userId]
  );

  if (requests.length === 0) {
    return sendNotFound(res, 'Booking request not found');
  }

  const request = requests[0];
  
  // ⚠️ PRIVACY: Remove sensitive data based on user role
  if (userId === request.client_id) {
    // Client viewing: remove companion email
    delete request.companion_email;
  } else if (userId === request.companion_id) {
    // Companion viewing: remove client email
    delete request.client_email;
  }

  const transformedRequest = transformToFrontend(request);

  return sendSuccess(res, { request: transformedRequest });
});

/**
 * Update booking request status (for companions)
 * @route PUT /api/booking/requests/:requestId
 */
const updateBookingRequestStatus = asyncHandler(async (req, res) => {
  const companionId = req.user.id;
  const { requestId } = req.params;
  const {
    status,
    companionResponse,
    suggestedDate,
    suggestedStartTime,
    suggestedEndTime
  } = req.body;

  // Check if request exists and belongs to this companion
  const [requests] = await pool.execute(
    'SELECT * FROM booking_requests WHERE id = ? AND companion_id = ?',
    [requestId, companionId]
  );

  if (requests.length === 0) {
    return sendNotFound(res, 'Booking request not found');
  }

  const request = requests[0];

  // Check if request is still pending
  if (request.status !== 'pending') {
    return sendBadRequest(res, `Cannot update request with status: ${request.status}`);
  }

  // Also check if already converted to booking
  if (request.booking_id) {
    return sendBadRequest(res, 'This request has already been accepted and converted to a booking');
  }

  // If accepting the request, create an actual booking
  if (status === 'accepted') {
    try {
      // Get companion's hourly rate
      const [companionData] = await pool.execute(
        'SELECT hourly_rate FROM companion_applications WHERE user_id = ?',
        [companionId]
      );

      if (companionData.length === 0) {
        return sendBadRequest(res, 'Companion profile not found');
      }

      const hourlyRate = companionData[0].hourly_rate || 0;
      
      // Calculate booking details
      const bookingDate = suggestedDate || request.requested_date;
      const startTime = suggestedStartTime || request.start_time;
      const endTime = suggestedEndTime || request.end_time;
      const durationHours = request.duration_hours;
      const baseAmount = hourlyRate * durationHours;
      const extraAmount = request.extra_amount || 0;
      const totalAmount = baseAmount + extraAmount;

      console.log('📝 Creating booking from custom request:', {
        requestId,
        clientId: request.client_id,
        companionId,
        bookingDate,
        startTime,
        endTime,
        durationHours,
        serviceType: request.service_type,
        hourlyRate,
        baseAmount,
        extraAmount,
        totalAmount
      });

      // Check for conflicting bookings with 1-hour buffer (same as normal bookings)
      const BUFFER_MINUTES = 60;
      const [conflictingBookings] = await pool.execute(
        `SELECT id, start_time, end_time FROM bookings
         WHERE companion_id = ? AND booking_date = ?
         AND status IN ('pending', 'confirmed')`,
        [companionId, bookingDate]
      );

      // Check if new booking conflicts with existing bookings (including buffer)
      const requestedStart = new Date(`${bookingDate}T${startTime}`);
      const requestedEnd = new Date(`${bookingDate}T${endTime}`);
      
      for (const booking of conflictingBookings) {
        const existingStart = new Date(`${bookingDate}T${booking.start_time}`);
        const existingEnd = new Date(`${bookingDate}T${booking.end_time}`);
        
        // Add 1-hour buffer before and after existing booking
        const existingStartWithBuffer = new Date(existingStart.getTime() - (BUFFER_MINUTES * 60 * 1000));
        const existingEndWithBuffer = new Date(existingEnd.getTime() + (BUFFER_MINUTES * 60 * 1000));
        
        // Check if requested time overlaps with existing booking + buffer
        if (requestedStart < existingEndWithBuffer && requestedEnd > existingStartWithBuffer) {
          return sendBadRequest(res, 'This time slot conflicts with an existing booking. Please choose a different time.');
        }
      }

      // Create the actual booking with payment_pending status
      const [bookingResult] = await pool.execute(
      `INSERT INTO bookings (
        client_id, companion_id, booking_date, start_time, end_time,
        duration_hours, service_type, hourly_rate, base_amount, extra_amount,
        total_amount, meeting_type, meeting_location,
        meeting_location_lat, meeting_location_lon, meeting_location_place_id,
        special_requests, status, payment_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', NOW())`,
      [
        request.client_id,
        companionId,
        bookingDate,
        startTime,
        endTime,
        durationHours,
        request.service_type || 'Custom Request',
        hourlyRate,
        baseAmount,
        extraAmount,
        totalAmount,
        request.meeting_type || 'in_person',
        request.meeting_location,
        request.meeting_location_lat,
        request.meeting_location_lon,
        request.meeting_location_place_id,
        request.special_requests
      ]
    );

    const bookingId = bookingResult.insertId;

    // Get client email for payment
    const [clientInfo] = await pool.execute(
      'SELECT email FROM users WHERE id = ?',
      [request.client_id]
    );

    if (clientInfo.length === 0) {
      return sendBadRequest(res, 'Client not found');
    }

    // Create payment intent for authorization
    try {
      const stripeService = require('../../services/stripeService');
      const paymentResult = await stripeService.authorizePayment(
        bookingId,
        totalAmount,
        clientInfo[0].email,
        {
          description: `Booking with ${companionData[0].name || 'companion'} on ${bookingDate}`
        }
      );

      // Update booking with payment_intent_id
      await pool.execute(
        'UPDATE bookings SET payment_intent_id = ? WHERE id = ?',
        [paymentResult.paymentIntentId, bookingId]
      );

      console.log('💳 Payment intent created for custom request booking:', {
        bookingId,
        paymentIntentId: paymentResult.paymentIntentId
      });
    } catch (paymentError) {
      // Rollback booking if payment fails
      await pool.execute('DELETE FROM bookings WHERE id = ?', [bookingId]);
      logger.controllerError('bookingRequestController', 'updateBookingRequestStatus', paymentError, req);
      return sendError(res, 500, 'Failed to initialize payment. Please try again.');
    }

    // Update booking request with suggested time (if provided) or mark as accepted
    if (suggestedDate) {
      await pool.execute(
        `UPDATE booking_requests
         SET status = ?,
             booking_id = ?,
             companion_response = ?,
             suggested_date = ?,
             suggested_start_time = ?,
             suggested_end_time = ?,
             responded_at = NOW()
         WHERE id = ?`,
        [
          status,
          bookingId,
          companionResponse || null,
          suggestedDate,
          suggestedStartTime || null,
          suggestedEndTime || null,
          requestId
        ]
      );
    } else {
      await pool.execute(
        `UPDATE booking_requests
         SET status = ?,
             booking_id = ?,
             companion_response = ?,
             responded_at = NOW()
         WHERE id = ?`,
        [status, bookingId, companionResponse || null, requestId]
      );
    }

      // Send notification to client about payment requirement
      const notificationData = {
        type: 'booking_payment_required',
        title: 'Complete Payment for Your Booking',
        message: `Your booking request was accepted! Please complete payment to confirm your booking for ${bookingDate} at ${startTime}.`,
        actionUrl: `/client/bookings/${bookingId}`
      };
      
      await createNotification(
        request.client_id,
        notificationData.type,
        notificationData.title,
        notificationData.message,
        notificationData.actionUrl
      );

      console.log('✅ Booking created successfully (awaiting payment):', { bookingId, requestId });

      // Emit real-time event to client about request acceptance
      try {
        const { emitBookingUpdate } = require('../../config/socket');
        emitBookingUpdate(request.client_id, companionId, 'request_accepted', {
          requestId,
          bookingId,
          status: 'accepted',
          bookingDate,
          startTime,
          endTime,
          totalAmount,
          requiresPayment: true,
          message: 'Your custom request was accepted! Complete payment to confirm.'
        });
      } catch (socketError) {
        logger.controllerError('bookingRequestController', 'updateBookingRequestStatus', socketError, req);
      }

      return sendSuccess(res, { 
        bookingId,
        requiresPayment: true,
        message: 'Booking request accepted. Client needs to complete payment authorization.'
      }, 200, 'Booking request accepted successfully');
    } catch (error) {
      console.error('❌ Error creating booking from custom request:', {
        error: error.message,
        stack: error.stack,
        requestId,
        companionId
      });
      return sendError(res, 500, `Failed to create booking: ${error.message}`);
    }
  } else {
    // If rejecting, just update the request status
    await pool.execute(
      `UPDATE booking_requests
       SET status = ?,
           companion_response = ?,
           responded_at = NOW()
       WHERE id = ?`,
      [status, companionResponse || null, requestId]
    );

    // Send notification to client
    const notificationData = notificationTemplates.bookingRequestRejected(requestId, companionId);
    await createNotification(
      request.client_id,
      notificationData.type,
      notificationData.title,
      notificationData.message,
      notificationData.actionUrl
    );

    // Emit real-time event to client about request rejection
    try {
      const { emitBookingUpdate } = require('../../config/socket');
      emitBookingUpdate(request.client_id, companionId, 'request_rejected', {
        requestId,
        status: 'rejected',
        companionResponse: companionResponse || 'No reason provided',
        message: 'Your custom request was declined by the companion.'
      });
    } catch (socketError) {
      logger.controllerError('bookingRequestController', 'updateBookingRequestStatus', socketError, req);
    }

    return sendSuccess(res, null, 200, `Booking request ${status} successfully`);
  }
});

/**
 * Cancel a booking request (for both client and companion)
 * @route DELETE /api/booking/requests/:requestId
 */
const cancelBookingRequest = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { requestId } = req.params;
  const { cancellationReason } = req.body;

  // Check if request exists and user has access
  const [requests] = await pool.execute(
    `SELECT br.*, c.name as companion_name, cl.name as client_name
     FROM booking_requests br
     JOIN users c ON br.companion_id = c.id
     JOIN users cl ON br.client_id = cl.id
     WHERE br.id = ? AND (br.client_id = ? OR br.companion_id = ?)`,
    [requestId, userId, userId]
  );

  if (requests.length === 0) {
    return sendNotFound(res, 'Booking request not found or access denied');
  }

  const request = requests[0];

  // Check if request can be cancelled (only pending requests)
  if (request.status !== 'pending') {
    return sendBadRequest(res, `Cannot cancel request with status: ${request.status}`);
  }

  // Determine who is cancelling
  const cancelledBy = userId === request.client_id ? 'client' : 'companion';

  // Update request status to rejected with cancellation details
  await pool.execute(
    `UPDATE booking_requests
     SET status = 'rejected',
         cancelled_by = ?,
         cancellation_reason = ?,
         cancelled_at = NOW(),
         responded_at = NOW()
     WHERE id = ?`,
    [cancelledBy, cancellationReason, requestId]
  );

  // Send notification to the other party
  try {
    if (cancelledBy === 'client') {
      await createNotification(
        request.companion_id,
        'booking',
        'Booking Request Cancelled',
        `${request.client_name} has cancelled their booking request. Reason: ${cancellationReason}`,
        '/companion-dashboard'
      );
    } else {
      await createNotification(
        request.client_id,
        'booking',
        'Booking Request Cancelled',
        `${request.companion_name} has cancelled the booking request. Reason: ${cancellationReason}`,
        '/client-dashboard'
      );
    }
  } catch (notificationError) {
    logger.controllerError('bookingRequestController', 'cancelBookingRequest', notificationError, req);
  }

  // Emit real-time event to the other party about cancellation
  try {
    const { emitBookingUpdate } = require('../../config/socket');
    const otherPartyId = cancelledBy === 'client' ? request.companion_id : request.client_id;
    emitBookingUpdate(userId, otherPartyId, 'request_cancelled', {
      requestId,
      status: 'cancelled',
      cancelledBy,
      cancellationReason,
      message: `Booking request was cancelled by ${cancelledBy}.`
    });
  } catch (socketError) {
    logger.controllerError('bookingRequestController', 'cancelBookingRequest', socketError, req);
  }

  logger.controllerInfo('bookingRequestController', 'cancelBookingRequest', 'Booking request cancelled', {
    requestId,
    cancelledBy,
    reason: cancellationReason
  });

  return sendSuccess(res, null, 200, 'Booking request cancelled successfully');
});

/**
 * Delete booking request if payment not completed
 * @route DELETE /api/booking/requests/:requestId
 */
const cancelBookingRequestPayment = asyncHandler(async (req, res) => {
  const clientId = req.user.id;
  const requestId = parseInt(req.params.requestId);

  // Get booking request
  const [requests] = await pool.execute(
    `SELECT * FROM booking_requests WHERE id = ? AND client_id = ?`,
    [requestId, clientId]
  );

  if (requests.length === 0) {
    return sendNotFound(res, 'Booking request not found');
  }

  const request = requests[0];

  // Only allow deletion if status is still pending (no payment completed)
  if (request.status !== 'pending') {
    return sendBadRequest(res, 'Cannot delete - request has already been processed');
  }

  // Cancel the payment intent in Stripe if it exists
  if (request.payment_intent_id) {
    try {
      const stripeService = require('../../services/stripeService');
      await stripeService.cancelAuthorization(requestId);
    } catch (error) {
      logger.controllerError('bookingRequestController', 'cancelBookingRequestPayment', error, req);
      // Continue even if Stripe cancellation fails
    }
  }

  // ⭐ DELETE the booking request completely (not just mark as cancelled)
  // Since payment was never completed, this request should not exist
  await pool.execute(
    'DELETE FROM booking_requests WHERE id = ?',
    [requestId]
  );

  logger.controllerInfo('bookingRequestController', 'cancelBookingRequestPayment', 'Booking request DELETED - payment not completed', { 
    requestId 
  });

  return sendSuccess(res, { 
    message: 'Booking request deleted successfully - payment not completed',
    requestId 
  });
});

/**
 * Confirm booking request payment after client authorizes card
 * @route POST /api/booking/request/:id/confirm-payment
 */
const confirmBookingRequestPayment = asyncHandler(async (req, res) => {
  const clientId = req.user.id;
  const requestId = parseInt(req.params.requestId);

  // Get booking request
  const [requests] = await pool.execute(
    `SELECT br.*, u.name as companion_name
     FROM booking_requests br
     JOIN users u ON br.companion_id = u.id
     WHERE br.id = ? AND br.client_id = ?`,
    [requestId, clientId]
  );

  if (requests.length === 0) {
    return sendNotFound(res, 'Booking request not found');
  }

  const request = requests[0];

  // Get client info
  const [clientInfo] = await pool.execute(
    'SELECT name FROM users WHERE id = ?',
    [clientId]
  );
  const clientName = clientInfo[0]?.name || 'Client';

  // ⭐ Update payment_status to 'authorized' (payment is authorized, not yet captured)
  await pool.execute(
    'UPDATE booking_requests SET payment_status = ? WHERE id = ?',
    ['authorized', requestId]
  );

  // ⭐ NOW send notification to companion (payment is authorized)
  try {
    const notificationData = notificationTemplates.bookingRequest(
      clientName, 
      request.requested_date
    );
    await createNotification(
      request.companion_id,
      notificationData.type,
      notificationData.title,
      notificationData.message,
      notificationData.actionUrl
    );
  } catch (notificationError) {
    logger.controllerError('bookingRequestController', 'confirmBookingRequestPayment', notificationError, req);
    // Don't fail if notification fails
  }

  logger.controllerInfo('bookingRequestController', 'confirmBookingRequestPayment', 'Payment confirmed, notification sent to companion', {
    requestId,
    companionId: request.companion_id
  });

  return sendSuccess(res, {
    requestId,
    companionName: request.companion_name,
    requestedDate: request.requested_date
  }, 200, 'Payment confirmed successfully. Your request has been sent to the companion.');
});

module.exports = {
  createBookingRequest, // OLD - will be deprecated
  createRequestPaymentIntent, // NEW - Step 1: Create payment intent only
  createRequestWithPayment, // NEW - Step 2: Create request after payment auth
  getBookingRequests,
  getBookingRequestById,
  updateBookingRequestStatus,
  cancelBookingRequest,
  confirmBookingRequestPayment // OLD - for backwards compatibility
};

