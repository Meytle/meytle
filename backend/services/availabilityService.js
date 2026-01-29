/**
 * Availability Service
 * Contains business logic for availability management
 */

const { pool } = require('../config/database');
const { isPastTimeSlot } = require('../utils/dateHelpers');
const logger = require('./logger');

/**
 * Validate availability slots for overlaps and time conflicts
 * @param {Array} slots - Array of availability slots
 * @returns {Object} Validation result { isValid, errors }
 */
const validateAvailabilitySlots = (slots) => {
  const errors = [];
  const slotsByDay = {};

  // Group slots by day and validate basic properties
  for (const slot of slots) {
    const dayOfWeek = slot.dayOfWeek || slot.day_of_week;
    const startTime = slot.startTime || slot.start_time;
    const endTime = slot.endTime || slot.end_time;

    if (!dayOfWeek || !startTime || !endTime) {
      errors.push('Each slot must have dayOfWeek, startTime, and endTime');
      continue;
    }

    // Validate time range
    if (startTime >= endTime) {
      errors.push(`Invalid time range for ${dayOfWeek}: start time must be before end time`);
      continue;
    }

    // Validate day of week
    const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    if (!validDays.includes(dayOfWeek.toLowerCase())) {
      errors.push(`Invalid day of week: ${dayOfWeek}`);
      continue;
    }

    // Group by day for overlap checking
    if (!slotsByDay[dayOfWeek]) {
      slotsByDay[dayOfWeek] = [];
    }

    slotsByDay[dayOfWeek].push({
      dayOfWeek,
      startTime,
      endTime
    });
  }

  // Check for overlapping slots within each day
  for (const [day, daySlots] of Object.entries(slotsByDay)) {
    if (daySlots.length > 1) {
      // Sort by start time
      daySlots.sort((a, b) => a.startTime.localeCompare(b.startTime));

      // Check for overlaps
      for (let i = 0; i < daySlots.length - 1; i++) {
        const currentSlot = daySlots[i];
        const nextSlot = daySlots[i + 1];

        if (currentSlot.endTime > nextSlot.startTime) {
          errors.push(
            `Overlapping time slots detected for ${day}: ` +
            `${currentSlot.startTime}-${currentSlot.endTime} overlaps with ` +
            `${nextSlot.startTime}-${nextSlot.endTime}`
          );
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    slotsByDay
  };
};

/**
 * Calculate available time slots for a specific date
 * @param {number} companionId - Companion ID
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of available time slots
 */
const calculateAvailableSlots = async (companionId, date) => {
  const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

  // Get companion's availability for this day
  const [availability] = await pool.execute(
    `SELECT start_time, end_time, is_available
     FROM companion_availability
     WHERE companion_id = ? AND day_of_week = ? AND is_available = TRUE
     ORDER BY start_time`,
    [companionId, dayOfWeek]
  );

  // Get existing bookings for this date
  const [bookings] = await pool.execute(
    `SELECT start_time, end_time
     FROM bookings
     WHERE companion_id = ? AND booking_date = ?
     AND status IN ('pending', 'confirmed')`,
    [companionId, date]
  );

  // Calculate available time slots
  const availableSlots = [];

  for (const slot of availability) {
    // Skip past time slots with 30 minute buffer
    if (isPastTimeSlot(date, slot.start_time, 30)) {
      continue;
    }

    const slotStart = new Date(`${date}T${slot.start_time}`);
    const slotEnd = new Date(`${date}T${slot.end_time}`);

    // Check for conflicts with existing bookings
    let hasConflict = false;
    for (const booking of bookings) {
      const bookingStart = new Date(`${date}T${booking.start_time}`);
      const bookingEnd = new Date(`${date}T${booking.end_time}`);

      if ((slotStart < bookingEnd && slotEnd > bookingStart)) {
        hasConflict = true;
        break;
      }
    }

    if (!hasConflict) {
      availableSlots.push({
        startTime: slot.start_time,
        endTime: slot.end_time
      });
    }
  }

  return availableSlots;
};

/**
 * Get companion's weekly availability pattern
 * @param {number} companionId - Companion ID
 * @returns {Promise<Object>} Weekly pattern grouped by day
 */
const getWeeklyPattern = async (companionId) => {
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

  // Group by day
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

  // Calculate summary
  const totalSlotsPerWeek = availability.length;
  const daysAvailable = Object.keys(weeklyPattern).filter(day => weeklyPattern[day].length > 0);

  return {
    weeklyPattern,
    summary: {
      totalSlotsPerWeek,
      daysAvailable: daysAvailable.length,
      availableDays: daysAvailable
    }
  };
};

/**
 * Calculate availability for a date range
 * @param {number} companionId - Companion ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>} Availability calendar
 */
const getAvailabilityForDateRange = async (companionId, startDate, endDate) => {
  // Get companion's weekly availability pattern
  const [weeklyAvailability] = await pool.execute(
    `SELECT
      day_of_week,
      start_time,
      end_time,
      services
    FROM companion_availability
    WHERE companion_id = ? AND is_available = TRUE`,
    [companionId]
  );

  // Get existing bookings in the date range
  const [bookings] = await pool.execute(
    `SELECT
      booking_date,
      start_time,
      end_time
    FROM bookings
    WHERE companion_id = ?
      AND booking_date BETWEEN ? AND ?
      AND status IN ('pending', 'confirmed')`,
    [companionId, startDate, endDate]
  );

  // Build availability calendar
  const availabilityCalendar = {};
  
  // Parse start and end dates (they come as YYYY-MM-DD strings from frontend)
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
  
  const currentDate = new Date(startYear, startMonth - 1, startDay);
  const lastDate = new Date(endYear, endMonth - 1, endDay);

  while (currentDate <= lastDate) {
    // Format date in local timezone (not UTC) to match frontend and database
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    const dayOfWeek = currentDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    // Get slots for this day of week
    const daySlotsFromPattern = weeklyAvailability.filter(slot => slot.day_of_week === dayOfWeek);

    // Get bookings for this specific date (booking_date is stored as DATE in MySQL)
    const dateBookings = bookings.filter(booking => {
      const bookingDateStr = booking.booking_date instanceof Date
        ? `${booking.booking_date.getFullYear()}-${String(booking.booking_date.getMonth() + 1).padStart(2, '0')}-${String(booking.booking_date.getDate()).padStart(2, '0')}`
        : booking.booking_date;
      return bookingDateStr === dateStr;
    });

    // Calculate available slots
    const availableSlots = [];

    daySlotsFromPattern.forEach(slot => {
      let hasConflict = false;

      for (const booking of dateBookings) {
        const slotStart = new Date(`2000-01-01 ${slot.start_time}`);
        const slotEnd = new Date(`2000-01-01 ${slot.end_time}`);
        const bookingStart = new Date(`2000-01-01 ${booking.start_time}`);
        const bookingEnd = new Date(`2000-01-01 ${booking.end_time}`);

        if (slotStart < bookingEnd && slotEnd > bookingStart) {
          hasConflict = true;
          break;
        }
      }

      if (!hasConflict) {
        const services = slot.services ?
          (typeof slot.services === 'string' ? JSON.parse(slot.services) : slot.services) : [];

        availableSlots.push({
          startTime: slot.start_time,
          endTime: slot.end_time,
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

  return availabilityCalendar;
};

/**
 * Check if a companion has availability on a specific date
 * @param {number} companionId - Companion ID
 * @param {string} date - Date to check
 * @returns {Promise<boolean>} True if companion has availability
 */
const hasAvailabilityOnDate = async (companionId, date) => {
  const slots = await calculateAvailableSlots(companionId, date);
  return slots.length > 0;
};

/**
 * Get companion's total weekly hours
 * @param {number} companionId - Companion ID
 * @returns {Promise<number>} Total hours per week
 */
const getTotalWeeklyHours = async (companionId) => {
  const [availability] = await pool.execute(
    `SELECT start_time, end_time
     FROM companion_availability
     WHERE companion_id = ? AND is_available = TRUE`,
    [companionId]
  );

  let totalHours = 0;
  
  for (const slot of availability) {
    const start = new Date(`2000-01-01 ${slot.start_time}`);
    const end = new Date(`2000-01-01 ${slot.end_time}`);
    const hours = (end - start) / (1000 * 60 * 60);
    totalHours += hours;
  }

  return totalHours;
};

/**
 * Find companions available at a specific time
 * @param {string} date - Date (YYYY-MM-DD)
 * @param {string} startTime - Start time (HH:MM)
 * @param {string} endTime - End time (HH:MM)
 * @returns {Promise<Array>} Array of available companion IDs
 */
const findAvailableCompanions = async (date, startTime, endTime) => {
  const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

  // Get companions with availability on this day and time
  const [availableCompanions] = await pool.execute(
    `SELECT DISTINCT ca.companion_id
     FROM companion_availability ca
     WHERE ca.day_of_week = ?
       AND ca.is_available = TRUE
       AND ca.start_time <= ?
       AND ca.end_time >= ?
       AND NOT EXISTS (
         SELECT 1 FROM bookings b
         WHERE b.companion_id = ca.companion_id
           AND b.booking_date = ?
           AND b.status IN ('pending', 'confirmed')
           AND ((b.start_time <= ? AND b.end_time > ?) 
                OR (b.start_time < ? AND b.end_time >= ?))
       )`,
    [dayOfWeek, startTime, endTime, date, startTime, startTime, endTime, endTime]
  );

  return availableCompanions.map(row => row.companion_id);
};

module.exports = {
  validateAvailabilitySlots,
  calculateAvailableSlots,
  getWeeklyPattern,
  getAvailabilityForDateRange,
  hasAvailabilityOnDate,
  getTotalWeeklyHours,
  findAvailableCompanions
};

