/**
 * Date Helper Utilities
 * Centralized date validation and formatting functions
 */

/**
 * Safely parse a date string or Date object
 * @param {string|Date} date - Date to parse
 * @returns {Date|null} - Valid Date object or null if invalid
 */
const safeParseDate = (date) => {
  if (!date) return null;

  const parsed = date instanceof Date ? date : new Date(date);

  // Check for valid date
  if (isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

/**
 * Format date for display
 * @param {string|Date} date - Date to format
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string} - Formatted date string or 'Invalid Date'
 */
const formatDate = (date, options = {}) => {
  const parsed = safeParseDate(date);

  if (!parsed) {
    return 'Invalid Date';
  }

  const defaultOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...options
  };

  return new Intl.DateTimeFormat('en-US', defaultOptions).format(parsed);
};

/**
 * Format time for display (12-hour format)
 * @param {string} time - Time string (HH:mm:ss or HH:mm)
 * @returns {string} - Formatted time or 'Invalid Time'
 */
const formatTime = (time) => {
  if (!time) return 'Invalid Time';

  // Handle time strings like "14:30:00" or "14:30"
  const parts = time.split(':');
  if (parts.length < 2) return 'Invalid Time';

  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);

  if (isNaN(hours) || isNaN(minutes)) return 'Invalid Time';

  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  const displayMinutes = minutes.toString().padStart(2, '0');

  return `${displayHours}:${displayMinutes} ${period}`;
};

/**
 * Format date and time together
 * @param {string|Date} date - Date to format
 * @param {string} time - Time string
 * @returns {string} - Formatted date and time string
 */
const formatDateTime = (date, time) => {
  const formattedDate = formatDate(date, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const formattedTime = formatTime(time);

  if (formattedDate === 'Invalid Date' || formattedTime === 'Invalid Time') {
    return 'Invalid Date/Time';
  }

  return `${formattedDate} at ${formattedTime}`;
};

/**
 * Check if a date is in the past
 * @param {string|Date} date - Date to check
 * @returns {boolean} - True if date is in the past
 */
const isPastDate = (date) => {
  const parsed = safeParseDate(date);
  if (!parsed) return true; // Treat invalid dates as past

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);

  return parsed < today;
};

/**
 * Check if a time slot is in the past (including date)
 * @param {string|Date} date - Date of the time slot
 * @param {string} time - Time string (HH:mm:ss or HH:mm) - in LOCAL timezone if timezone provided, otherwise UTC
 * @param {number} bufferMinutes - Buffer time in minutes (default 30)
 * @param {string} timezone - Optional timezone (e.g., 'Asia/Kolkata'). If provided, time is treated as local time in this timezone.
 * @returns {boolean} - True if time slot is in the past
 */
const isPastTimeSlot = (date, time, bufferMinutes = 30, timezone = null) => {
  const parsed = safeParseDate(date);
  if (!parsed || !time) return true;

  const parts = time.split(':');
  if (parts.length < 2) return true;

  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);

  if (isNaN(hours) || isNaN(minutes)) return true;

  // If timezone is provided, convert local time to UTC for comparison
  let comparisonTime;
  if (timezone) {
    try {
      const { convertToUTC } = require('./timezoneConverter');
      const utcTime = convertToUTC(time, date, timezone);
      
      // Parse UTC time
      const utcParts = utcTime.split(':');
      const utcHours = parseInt(utcParts[0], 10);
      const utcMinutes = parseInt(utcParts[1], 10);
      
      const utcDate = new Date(date + 'T00:00:00Z');
      utcDate.setUTCHours(utcHours, utcMinutes, 0, 0);
      comparisonTime = utcDate;
    } catch (error) {
      // Fallback to assuming time is already in UTC
      parsed.setHours(hours, minutes, 0, 0);
      comparisonTime = parsed;
    }
  } else {
    // No timezone provided - assume time is in server's local timezone
    parsed.setHours(hours, minutes, 0, 0);
    comparisonTime = parsed;
  }

  const now = new Date();
  const bufferMs = bufferMinutes * 60 * 1000;

  return comparisonTime.getTime() < (now.getTime() + bufferMs);
};

/**
 * Convert MySQL date format to ISO string
 * @param {string} mysqlDate - MySQL date string
 * @returns {string|null} - ISO date string or null
 */
const mysqlToIso = (mysqlDate) => {
  const parsed = safeParseDate(mysqlDate);
  return parsed ? parsed.toISOString() : null;
};

/**
 * Get date range for a given period
 * @param {string} period - Period type (today, week, month)
 * @returns {Object} - Object with startDate and endDate
 */
const getDateRange = (period = 'today') => {
  const now = new Date();
  let startDate = new Date();
  let endDate = new Date();

  switch (period) {
    case 'today':
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'week':
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday as first day
      startDate.setDate(now.getDate() - diff);
      startDate.setHours(0, 0, 0, 0);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'month':
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    default:
      break;
  }

  return { startDate, endDate };
};

/**
 * Check if a booking can be cancelled based on time restrictions
 * Bookings cannot be cancelled within 3 hours of the start time
 * @param {string|Date} bookingDate - The booking date (YYYY-MM-DD)
 * @param {string} startTime - The booking start time (HH:mm:ss or HH:mm)
 * @returns {Object} - { canCancel: boolean, hoursRemaining: number, message: string }
 */
const canCancelBooking = (bookingDate, startTime) => {
  try {
    // Parse the booking date
    const parsedDate = safeParseDate(bookingDate);
    if (!parsedDate) {
      return {
        canCancel: false,
        hoursRemaining: 0,
        message: 'Invalid booking date'
      };
    }

    // Parse the start time (expected format: HH:mm:ss or HH:mm)
    const timeParts = startTime.split(':');
    if (timeParts.length < 2) {
      return {
        canCancel: false,
        hoursRemaining: 0,
        message: 'Invalid start time format'
      };
    }

    const hours = parseInt(timeParts[0], 10);
    const minutes = parseInt(timeParts[1], 10);

    if (isNaN(hours) || isNaN(minutes)) {
      return {
        canCancel: false,
        hoursRemaining: 0,
        message: 'Invalid start time values'
      };
    }

    // Create the booking start datetime
    const bookingStartTime = new Date(parsedDate);
    bookingStartTime.setHours(hours, minutes, 0, 0);

    // Get current time
    const now = new Date();

    // Calculate time difference in milliseconds
    const timeDiffMs = bookingStartTime - now;

    // Convert to hours
    const hoursRemaining = timeDiffMs / (1000 * 60 * 60);

    // Cannot cancel if within 3 hours
    const canCancel = hoursRemaining > 3;

    let message;
    if (hoursRemaining <= 0) {
      message = 'Cannot cancel a past booking';
    } else if (hoursRemaining <= 3) {
      message = `Cannot cancel within 3 hours of booking time. Only ${hoursRemaining.toFixed(1)} hours remaining.`;
    } else {
      message = 'Booking can be cancelled';
    }

    return {
      canCancel,
      hoursRemaining: Math.max(0, hoursRemaining),
      message
    };
  } catch (error) {
    return {
      canCancel: false,
      hoursRemaining: 0,
      message: `Error checking cancellation eligibility: ${error.message}`
    };
  }
};

/**
 * Calculate age from date of birth
 * @param {string|Date} dateOfBirth - Date of birth
 * @returns {number|null} - Age in years or null if invalid
 */
const calculateAge = (dateOfBirth) => {
  try {
    const dob = safeParseDate(dateOfBirth);
    if (!dob) return null;

    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();

    // Adjust age if birthday hasn't occurred this year yet
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }

    return age >= 0 ? age : null;
  } catch (error) {
    return null;
  }
};

/**
 * Check if a person is 18 or older
 * @param {string|Date} dateOfBirth - Date of birth
 * @returns {boolean} - True if 18 or older
 */
const isAdult = (dateOfBirth) => {
  const age = calculateAge(dateOfBirth);
  return age !== null && age >= 18;
};

/**
 * Format address components into a display string
 * @param {Object} address - Address object
 * @param {string} address.city - City name
 * @param {string} address.state - State/province name
 * @param {string} address.country - Country name
 * @param {string} address.addressLine - Street address (optional)
 * @param {string} address.postalCode - Postal/ZIP code (optional)
 * @returns {string} - Formatted location string
 */
const formatLocation = (address) => {
  if (!address) return '';

  const parts = [];

  // Add city if available
  if (address.city) {
    parts.push(address.city);
  }

  // Add state if available
  if (address.state) {
    parts.push(address.state);
  }

  // Add country if available
  if (address.country) {
    parts.push(address.country);
  }

  return parts.join(', ');
};

/**
 * Format full address including street address
 * @param {Object} address - Address object
 * @param {string} address.addressLine - Street address
 * @param {string} address.city - City name
 * @param {string} address.state - State/province name
 * @param {string} address.country - Country name
 * @param {string} address.postalCode - Postal/ZIP code
 * @returns {string} - Formatted full address string
 */
const formatFullAddress = (address) => {
  if (!address) return '';

  const parts = [];

  if (address.addressLine) {
    parts.push(address.addressLine);
  }

  if (address.city) {
    parts.push(address.city);
  }

  if (address.state && address.postalCode) {
    parts.push(`${address.state} ${address.postalCode}`);
  } else if (address.state) {
    parts.push(address.state);
  } else if (address.postalCode) {
    parts.push(address.postalCode);
  }

  if (address.country) {
    parts.push(address.country);
  }

  return parts.join(', ');
};

module.exports = {
  safeParseDate,
  formatDate,
  formatTime,
  formatDateTime,
  isPastDate,
  isPastTimeSlot,
  mysqlToIso,
  getDateRange,
  canCancelBooking,
  calculateAge,
  isAdult,
  formatLocation,
  formatFullAddress
};