/**
 * Availability Controller
 * Handles companion availability management and time slot calculations
 */

const { pool } = require('../../config/database');
const { transformToFrontend, transformArrayToFrontend } = require('../../utils/transformer');
const { safeParseDate, isPastTimeSlot } = require('../../utils/dateHelpers');
const { sendSuccess, sendError, sendNotFound, sendBadRequest } = require('../../utils/responseHelpers');
const asyncHandler = require('../../utils/asyncHandler');
const logger = require('../../services/logger');
const {
  convertToUTC,
  convertFromUTC,
  validateTimezone,
  convertAvailabilitySlotToUTC,
  convertAvailabilitySlotFromUTC
} = require('../../utils/timezoneConverter');

/**
 * Get companion availability
 * @route GET /api/booking/companion/:companionId/availability
 */
const getCompanionAvailability = asyncHandler(async (req, res) => {
  let { companionId } = req.params;
  const { date } = req.query;

  // Handle special case where companionId is '0' or 'me' to mean current user
  if (companionId === '0' || companionId === 'me') {
    companionId = req.user.id;
    logger.controllerInfo('availabilityController', 'getCompanionAvailability', 'Fetching availability for current user', { companionId });
  }

  let query = `
    SELECT
      day_of_week,
      start_time,
      end_time,
      is_available,
      services,
      companion_timezone,
      is_utc
    FROM companion_availability
    WHERE companion_id = ?
  `;

  const params = [companionId];

  if (date) {
    const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    query += ' AND day_of_week = ?';
    params.push(dayOfWeek);
  }

  query += ' ORDER BY day_of_week, start_time';

  const [availability] = await pool.execute(query, params);

  // Convert UTC times back to companion's local timezone for display
  const convertedAvailability = availability.map(slot => {
    const companionTimezone = slot.companion_timezone || 'UTC';
    const isUtc = slot.is_utc === 1;

    // Only convert if stored in UTC
    if (isUtc) {
      const localSlot = convertAvailabilitySlotFromUTC(slot, companionTimezone);
      return {
        ...slot,
        start_time: localSlot.start_time,
        end_time: localSlot.end_time,
        timezone: companionTimezone
      };
    }

    return {
      ...slot,
      timezone: companionTimezone
    };
  });

  const transformedAvailability = transformArrayToFrontend(convertedAvailability);

  return sendSuccess(res, transformedAvailability);
});

/**
 * Set companion availability
 * @route POST /api/booking/availability
 */
const setCompanionAvailability = asyncHandler(async (req, res) => {
  const companionId = req.user.id;
  const { availability, companionTimezone } = req.body;
  const userIp = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'Unknown';

  // Validate timezone
  if (!companionTimezone || !validateTimezone(companionTimezone)) {
    return sendBadRequest(res, 'Valid companion timezone is required');
  }

  logger.controllerInfo('availabilityController', 'setCompanionAvailability', 
    'Setting availability with timezone', { companionId, companionTimezone, slotsCount: availability?.length });

  // Ensure user has companion role
  const [userRoles] = await pool.execute(
    'SELECT role FROM user_roles WHERE user_id = ? AND role = "companion" AND is_active = TRUE',
    [companionId]
  );

  if (userRoles.length === 0) {
    return sendBadRequest(res, 'Only companions can set availability');
  }

  // Get current availability for audit log
  const [currentAvailability] = await pool.execute(
    'SELECT * FROM companion_availability WHERE companion_id = ?',
    [companionId]
  );

  // Group slots by day for validation
  const slotsByDay = {};
  const validatedSlots = [];

  for (const slot of availability) {
    const dayOfWeek = slot.day_of_week || slot.dayOfWeek;
    const startTime = slot.start_time || slot.startTime;
    const endTime = slot.end_time || slot.endTime;
    const isAvailable = slot.is_available !== undefined ? slot.is_available : (slot.isAvailable !== undefined ? slot.isAvailable : true);
    const services = slot.services || slot.service || null;

    if (!dayOfWeek || !startTime || !endTime) {
      continue;
    }

    // Validate that start time is before end time
    if (startTime >= endTime) {
      return sendBadRequest(res, `Invalid time range for ${dayOfWeek}: start time must be before end time`);
    }

    // Group by day for overlap checking
    if (!slotsByDay[dayOfWeek]) {
      slotsByDay[dayOfWeek] = [];
    }

    slotsByDay[dayOfWeek].push({
      dayOfWeek,
      startTime,
      endTime,
      isAvailable,
      services
    });

    validatedSlots.push({
      dayOfWeek,
      startTime,
      endTime,
      isAvailable,
      services
    });
  }

  // Check for overlapping slots and enforce 1-hour buffer within each day
  const BUFFER_MINUTES = 60; // 1 hour mandatory gap between slots
  
  for (const [day, daySlots] of Object.entries(slotsByDay)) {
    if (daySlots.length > 1) {
      // Sort by start time
      daySlots.sort((a, b) => a.startTime.localeCompare(b.startTime));

      // Check for overlaps and buffer violations
      for (let i = 0; i < daySlots.length - 1; i++) {
        const currentSlot = daySlots[i];
        const nextSlot = daySlots[i + 1];

        // Check for direct overlap
        if (currentSlot.endTime > nextSlot.startTime) {
          return sendBadRequest(res, `Overlapping time slots detected for ${day}: ${currentSlot.startTime}-${currentSlot.endTime} overlaps with ${nextSlot.startTime}-${nextSlot.endTime}`);
        }

        // Check for 1-hour buffer requirement
        const currentEndTime = new Date(`2000-01-01T${currentSlot.endTime}`);
        const nextStartTime = new Date(`2000-01-01T${nextSlot.startTime}`);
        const gapMinutes = (nextStartTime - currentEndTime) / (1000 * 60);

        if (gapMinutes < BUFFER_MINUTES) {
          return sendBadRequest(res, `Insufficient gap between time slots for ${day}: ${currentSlot.startTime}-${currentSlot.endTime} and ${nextSlot.startTime}-${nextSlot.endTime}. Please maintain at least 1 hour gap between slots (current gap: ${Math.round(gapMinutes)} minutes)`);
        }
      }
    }
  }

  // Clear existing availability
  await pool.execute('DELETE FROM companion_availability WHERE companion_id = ?', [companionId]);

  // Insert validated slots - CONVERT TO UTC BEFORE SAVING
  for (const slot of validatedSlots) {
    const servicesJson = slot.services ? JSON.stringify(slot.services) : null;

    // Convert local times to UTC
    const utcSlot = convertAvailabilitySlotToUTC({
      day_of_week: slot.dayOfWeek,
      start_time: slot.startTime,
      end_time: slot.endTime
    }, companionTimezone);

    logger.controllerInfo('availabilityController', 'setCompanionAvailability', 
      'Converting slot to UTC', {
        original: { day: slot.dayOfWeek, start: slot.startTime, end: slot.endTime },
        utc: { start: utcSlot.start_time, end: utcSlot.end_time },
        timezone: companionTimezone
      });

    await pool.execute(
      `INSERT INTO companion_availability
       (companion_id, day_of_week, start_time, end_time, is_available, services, companion_timezone, is_utc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [companionId, slot.dayOfWeek, utcSlot.start_time, utcSlot.end_time, slot.isAvailable, servicesJson, companionTimezone, 1]
    );
  }

  // Create audit log entry
  try {
    await pool.execute(
      `INSERT INTO availability_audit_log
       (companion_id, action, old_data, new_data, changed_by_id, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        companionId,
        'UPDATE_AVAILABILITY',
        JSON.stringify(currentAvailability),
        JSON.stringify(validatedSlots),
        companionId,
        userIp,
        userAgent
      ]
    );
  } catch (auditError) {
    logger.controllerError('availabilityController', 'setCompanionAvailability', auditError, req);
  }

  // Emit real-time event to notify clients viewing this companion's profile
  try {
    const { emitAvailabilityUpdate } = require('../../config/socket');
    emitAvailabilityUpdate(companionId, {
      companionId,
      slotsCount: validatedSlots.length,
      updatedAt: new Date().toISOString()
    });
  } catch (socketError) {
    logger.controllerError('availabilityController', 'setCompanionAvailability', socketError, req);
  }

  return sendSuccess(res, null, 200, `Availability updated successfully. ${validatedSlots.length} slots saved.`);
});

/**
 * Get available time slots for a companion on a specific date
 * @route GET /api/booking/companion/:companionId/slots
 * NOTE: All times are in UTC in database, converted to client timezone for display
 */
const getAvailableTimeSlots = asyncHandler(async (req, res) => {
  const { companionId } = req.params;
  const { date, clientTimezone } = req.query;

  if (!date) {
    return sendBadRequest(res, 'Date parameter is required');
  }

  const parsedDate = safeParseDate(date);
  if (!parsedDate) {
    return sendBadRequest(res, 'Invalid date provided');
  }

  const dayOfWeek = parsedDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

  // Get companion's availability for this day (stored in UTC)
  const [availability] = await pool.execute(
    `SELECT start_time, end_time, is_available, companion_timezone, is_utc
     FROM companion_availability
     WHERE companion_id = ? AND day_of_week = ? AND is_available = TRUE
     ORDER BY start_time`,
    [companionId, dayOfWeek]
  );

  // Get existing bookings for this date (stored in UTC)
  const [bookings] = await pool.execute(
    `SELECT start_time, end_time
     FROM bookings
     WHERE companion_id = ? AND booking_date = ?
     AND status IN ('pending', 'payment_held', 'confirmed')`,
    [companionId, date]
  );

  logger.controllerInfo('availabilityController', 'getAvailableTimeSlots', 
    'Fetched availability and bookings (all in UTC)', {
      date,
      dayOfWeek,
      availabilitySlots: availability.length,
      bookings: bookings.length,
      sampleAvailability: availability[0],
      sampleBooking: bookings[0]
    });

  // Calculate available time slots with 1-hour buffer between bookings
  // ALL COMPARISONS ARE IN UTC
  const BUFFER_MINUTES = 60; // 1 hour gap between bookings
  const availableSlots = [];

  for (const slot of availability) {
    // All times are UTC, so we compare UTC to UTC
    const slotStartUTC = new Date(`${date}T${slot.start_time}Z`); // Z = UTC
    const slotEndUTC = new Date(`${date}T${slot.end_time}Z`);

    // Skip past time slots with 30 minute buffer (compare in UTC)
    const now = new Date();
    const bufferTime = new Date(slotStartUTC.getTime() - (30 * 60 * 1000));
    if (bufferTime < now) {
      logger.controllerInfo('availabilityController', 'getAvailableTimeSlots', 
        'Skipping past slot', { slot: slot.start_time, now: now.toISOString() });
      continue;
    }

    // Check for conflicts with existing bookings (including 1-hour buffer)
    let hasConflict = false;
    for (const booking of bookings) {
      const bookingStartUTC = new Date(`${date}T${booking.start_time}Z`);
      const bookingEndUTC = new Date(`${date}T${booking.end_time}Z`);

      // Add 1-hour buffer before and after booking
      const bookingStartWithBuffer = new Date(bookingStartUTC.getTime() - (BUFFER_MINUTES * 60 * 1000));
      const bookingEndWithBuffer = new Date(bookingEndUTC.getTime() + (BUFFER_MINUTES * 60 * 1000));

      // Check if slot overlaps with booking + buffer (all in UTC)
      if ((slotStartUTC < bookingEndWithBuffer && slotEndUTC > bookingStartWithBuffer)) {
        hasConflict = true;
        logger.controllerInfo('availabilityController', 'getAvailableTimeSlots', 
          `Slot ${slot.start_time}-${slot.end_time} UTC conflicts with booking ${booking.start_time}-${booking.end_time} UTC (with 1-hour buffer)`, {});
        break;
      }
    }

    if (!hasConflict) {
      // Convert UTC times to client's timezone for display
      const displayTimezone = clientTimezone || slot.companion_timezone || 'UTC';
      const localStartTime = convertFromUTC(slot.start_time, date, displayTimezone);
      const localEndTime = convertFromUTC(slot.end_time, date, displayTimezone);

      availableSlots.push({
        startTime: localStartTime,
        endTime: localEndTime,
        startTimeUTC: slot.start_time,
        endTimeUTC: slot.end_time,
        timezone: displayTimezone
      });
    }
  }

  return sendSuccess(res, {
    date,
    availableSlots,
    timezone: clientTimezone || 'UTC'
  });
});

/**
 * Get companion bookings by date range
 * @route GET /api/booking/companion/:companionId/bookings
 */
const getCompanionBookingsByDateRange = asyncHandler(async (req, res) => {
  const { companionId } = req.params;
  const { startDate, endDate } = req.query;

  const parsedStartDate = safeParseDate(startDate);
  const parsedEndDate = safeParseDate(endDate);

  if (!parsedStartDate || !parsedEndDate) {
    return sendBadRequest(res, 'Invalid date format. Use YYYY-MM-DD');
  }

  if (parsedStartDate > parsedEndDate) {
    return sendBadRequest(res, 'Start date cannot be after end date');
  }

  const [bookings] = await pool.execute(
    `SELECT id, booking_date, start_time, end_time, status
     FROM bookings
     WHERE companion_id = ? AND booking_date BETWEEN ? AND ?
     AND status IN ('pending', 'payment_held', 'confirmed')
     ORDER BY booking_date ASC, start_time ASC`,
    [companionId, startDate, endDate]
  );

  const transformedBookings = transformArrayToFrontend(bookings);

  return sendSuccess(res, transformedBookings);
});

/**
 * Get companion's weekly availability pattern
 * @route GET /api/booking/companion/:companionId/weekly-availability
 */
const getCompanionWeeklyAvailability = asyncHandler(async (req, res) => {
  const { companionId } = req.params;

  const [availability] = await pool.execute(
    `SELECT
      day_of_week,
      start_time,
      end_time,
      is_available,
      services
    FROM companion_availability
    WHERE companion_id = ? AND is_available = TRUE
    ORDER BY
      CASE day_of_week
        WHEN 'monday' THEN 1
        WHEN 'tuesday' THEN 2
        WHEN 'wednesday' THEN 3
        WHEN 'thursday' THEN 4
        WHEN 'friday' THEN 5
        WHEN 'saturday' THEN 6
        WHEN 'sunday' THEN 7
      END,
      start_time`,
    [companionId]
  );

  // Group by day for easier frontend consumption
  const weeklyPattern = {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: []
  };

  availability.forEach(slot => {
    const services = slot.services ?
      (typeof slot.services === 'string' ? JSON.parse(slot.services) : slot.services) : [];

    weeklyPattern[slot.day_of_week].push({
      startTime: slot.start_time,
      endTime: slot.end_time,
      services: services
    });
  });

  // Calculate summary statistics
  const totalSlotsPerWeek = availability.length;
  const daysAvailable = Object.keys(weeklyPattern).filter(day => weeklyPattern[day].length > 0);

  return sendSuccess(res, {
    weeklyPattern,
    summary: {
      totalSlotsPerWeek,
      daysAvailable: daysAvailable.length,
      availableDays: daysAvailable
    }
  });
});

/**
 * Get companion's availability for a date range (calendar view)
 * @route GET /api/booking/availability/:companionId/calendar
 * NOTE: All times stored in UTC, compared in UTC
 */
const getCompanionAvailabilityForDateRange = asyncHandler(async (req, res) => {
  const { companionId } = req.params;
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return sendBadRequest(res, 'Start date and end date are required');
  }

  logger.controllerInfo('availabilityController', 'getCompanionAvailabilityForDateRange', 
    '🔍 Fetching availability for date range', { companionId, startDate, endDate });

  // Get companion's weekly availability pattern (stored in UTC)
  const [weeklyAvailability] = await pool.execute(
    `SELECT
      day_of_week,
      start_time,
      end_time,
      services,
      companion_timezone,
      is_utc
    FROM companion_availability
    WHERE companion_id = ? AND is_available = TRUE`,
    [companionId]
  );

  logger.controllerInfo('availabilityController', 'getCompanionAvailabilityForDateRange', 
    'Fetched weekly availability (UTC)', {
      companionId,
      slotsCount: weeklyAvailability.length,
      slots: weeklyAvailability.map(s => ({ day: s.day_of_week, time: `${s.start_time}-${s.end_time} UTC` }))
    });

  // Get existing bookings in the date range (stored in UTC)
  const [bookings] = await pool.execute(
    `SELECT
      booking_date,
      start_time,
      end_time
    FROM bookings
    WHERE companion_id = ?
      AND booking_date BETWEEN ? AND ?
      AND status IN ('pending', 'payment_held', 'confirmed')`,
    [companionId, startDate, endDate]
  );

  logger.controllerInfo('availabilityController', 'getCompanionAvailabilityForDateRange', 
    'Fetched bookings for range', {
      bookingCount: bookings.length,
      sampleBooking: bookings.length > 0 ? bookings[0] : null
    });

  // Build availability calendar
  const availabilityCalendar = {};
  
  // Parse start and end dates (they come as YYYY-MM-DD strings from frontend)
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
  
  const currentDate = new Date(startYear, startMonth - 1, startDay);
  const lastDate = new Date(endYear, endMonth - 1, endDay);

  while (currentDate <= lastDate) {
    // Format date in local timezone (not UTC) to match frontend
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    const dayOfWeek = currentDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    // Get slots for this day of week (these are in UTC)
    const daySlotsFromPattern = weeklyAvailability.filter(slot => slot.day_of_week === dayOfWeek);

    // Get bookings for this specific date
    const dateBookings = bookings.filter(booking => {
      // booking_date is stored as DATE type in MySQL (YYYY-MM-DD string)
      const bookingDateStr = booking.booking_date instanceof Date 
        ? `${booking.booking_date.getFullYear()}-${String(booking.booking_date.getMonth() + 1).padStart(2, '0')}-${String(booking.booking_date.getDate()).padStart(2, '0')}`
        : booking.booking_date;
      return bookingDateStr === dateStr;
    });

    // Calculate available slots (slots from pattern minus bookings)
    // ALL COMPARISONS IN UTC
    const availableSlots = [];

    daySlotsFromPattern.forEach(slot => {
      let hasConflict = false;

      for (const booking of dateBookings) {
        // Compare UTC times directly
        const slotStartUTC = new Date(`${dateStr}T${slot.start_time}Z`);
        const slotEndUTC = new Date(`${dateStr}T${slot.end_time}Z`);
        const bookingStartUTC = new Date(`${dateStr}T${booking.start_time}Z`);
        const bookingEndUTC = new Date(`${dateStr}T${booking.end_time}Z`);

        // Check for overlap (in UTC)
        if (slotStartUTC < bookingEndUTC && slotEndUTC > bookingStartUTC) {
          hasConflict = true;
          logger.controllerInfo('availabilityController', 'getCompanionAvailabilityForDateRange', 
            'Slot conflict detected (UTC)', {
              date: dateStr,
              slot: `${slot.start_time}-${slot.end_time}`,
              booking: `${booking.start_time}-${booking.end_time}`
            });
          break;
        }
      }

      if (!hasConflict) {
        const services = slot.services ?
          (typeof slot.services === 'string' ? JSON.parse(slot.services) : slot.services) : [];

        availableSlots.push({
          startTime: slot.start_time, // UTC
          endTime: slot.end_time, // UTC
          services: services
        });
      }
    });

    availabilityCalendar[dateStr] = {
      dayOfWeek,
      totalSlots: daySlotsFromPattern.length,
      availableSlots: availableSlots.length,
      bookedSlots: dateBookings.length,
      isAvailable: availableSlots.length > 0,
      slots: availableSlots
    };

    currentDate.setDate(currentDate.getDate() + 1);
  }

  logger.controllerInfo('availabilityController', 'getCompanionAvailabilityForDateRange', 
    'Calendar built successfully', {
      totalDays: Object.keys(availabilityCalendar).length,
      daysWithAvailability: Object.values(availabilityCalendar).filter((d) => d.isAvailable).length
    });

  return sendSuccess(res, { availabilityCalendar });
});

module.exports = {
  getCompanionAvailability,
  setCompanionAvailability,
  getAvailableTimeSlots,
  getCompanionBookingsByDateRange,
  getCompanionWeeklyAvailability,
  getCompanionAvailabilityForDateRange
};

