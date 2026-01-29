/**
 * Timezone Converter Utility - FIXED VERSION
 * Handles conversion between user's local timezone and UTC for storage/display
 * All times in database are stored in UTC, converted at boundaries
 */

const logger = require('../services/logger');

/**
 * Convert user's local time to UTC for storage
 * SIMPLE AND CORRECT APPROACH:
 * 1. Create Date object with user's local date/time string + timezone offset
 * 2. Extract UTC time from that Date object
 * 
 * @param {string} time - Time in HH:MM:SS format (e.g., "14:00:00") in user's LOCAL timezone
 * @param {string} date - Date in YYYY-MM-DD format (e.g., "2025-12-23")
 * @param {string} userTimezone - IANA timezone (e.g., "Asia/Kolkata")
 * @returns {string} UTC time in HH:MM:SS format
 */
function convertToUTC(time, date, userTimezone = 'UTC') {
  try {
    // Handle null/undefined inputs
    if (!time) {
      logger.warn('convertToUTC called with null time');
      return time;
    }

    // If already UTC, return as-is
    if (userTimezone === 'UTC') {
      return time;
    }

    // Normalize timezone name (handle deprecated names)
    let normalizedTimezone = userTimezone;
    if (userTimezone === 'Asia/Calcutta') {
      normalizedTimezone = 'Asia/Kolkata';
    }

    // ✅ FIX: Handle both string and Date object
    let dateStr;
    if (date instanceof Date) {
      dateStr = date.toISOString().split('T')[0];
    } else if (typeof date === 'string') {
      dateStr = date.split('T')[0]; // Handle ISO string
    } else {
      dateStr = new Date().toISOString().split('T')[0];
    }
    
    // THE CORRECT WAY:
    // Create a string representing the local date/time, then parse it with locale consideration
    
    // Step 1: Create localized date string
    const [year, month, day] = dateStr.split('-');
    const localDateTimeString = `${year}-${month}-${day}T${time}`;
    
    // Step 2: To convert local time to UTC, we need to know the offset
    // We create a Date with the local time, get its string in the user's timezone,
    // then parse that back to get the UTC equivalent
    
    // Create a formatter for the user's timezone
    const options = {
      timeZone: normalizedTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    };
    
    // Parse the input time
    const [inputHours, inputMinutes, inputSeconds = '00'] = time.split(':');
    
    // Create multiple reference points to calculate offset
    // We'll use a known UTC time and see how it appears in the user's timezone
    const utcTestDate = new Date(`${dateStr}T12:00:00Z`);
    
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(utcTestDate);
    
    // Extract the components
    const localHour = parseInt(parts.find(p => p.type === 'hour').value);
    const localMinute = parseInt(parts.find(p => p.type === 'minute').value);
    
    // Calculate the offset in minutes
    // If UTC is 12:00 and local shows 17:30, offset is +330 minutes (IST = UTC+5:30)
    const utcTestMinutes = 12 * 60; // Our test time
    const localMinutes = localHour * 60 + localMinute;
    const offsetMinutes = localMinutes - utcTestMinutes;
    
    // Now convert the user's input time to UTC by subtracting the offset
    const userInputMinutes = parseInt(inputHours) * 60 + parseInt(inputMinutes);
    const utcTotalMinutes = userInputMinutes - offsetMinutes;
    
    // Handle day overflow/underflow
    let finalUtcMinutes = utcTotalMinutes;
    if (finalUtcMinutes < 0) {
      finalUtcMinutes += 1440; // Add 24 hours
    } else if (finalUtcMinutes >= 1440) {
      finalUtcMinutes -= 1440; // Subtract 24 hours
    }
    
    const utcHours = Math.floor(finalUtcMinutes / 60);
    const utcMinutes = finalUtcMinutes % 60;
    const utcSeconds = parseInt(inputSeconds);
    
    const result = `${String(utcHours).padStart(2, '0')}:${String(utcMinutes).padStart(2, '0')}:${String(utcSeconds).padStart(2, '0')}`;
    
    logger.info('Time converted to UTC', {
      input: { time, date, timezone: userTimezone },
      output: result,
      calculatedOffset: `${offsetMinutes} minutes`
    });
    
    return result;
  } catch (error) {
    logger.error('Error converting time to UTC', {
      error: error.message,
      time,
      date,
      timezone: userTimezone
    });
    // Return original time as fallback
    return time;
  }
}

/**
 * Convert UTC time to user's local timezone for display
 * @param {string} time - UTC time in HH:MM:SS format
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {string} userTimezone - Target IANA timezone
 * @returns {string} Local time in HH:MM:SS format
 */
function convertFromUTC(time, date, userTimezone = 'UTC') {
  try {
    // Handle null/undefined inputs
    if (!time) {
      console.log('[convertFromUTC] Called with null time');
      logger.warn('convertFromUTC called with null time');
      return time;
    }

    // If target is UTC, return as-is
    if (userTimezone === 'UTC') {
      console.log('[convertFromUTC] Target is UTC, returning as-is:', time);
      return time;
    }

    console.log('[convertFromUTC] Converting:', { time, date, timezone: userTimezone });

    // Create UTC date
    // ✅ FIX: Handle both string and Date object with validation
    let dateStr;
    if (date instanceof Date) {
      // Validate Date object before calling toISOString()
      if (isNaN(date.getTime())) {
        console.log('[convertFromUTC] Invalid Date object, using current date');
        logger.warn('convertFromUTC received invalid Date object', { date });
        dateStr = new Date().toISOString().split('T')[0];
      } else {
        dateStr = date.toISOString().split('T')[0];
      }
    } else if (typeof date === 'string' && date.length >= 10) {
      dateStr = date.split('T')[0]; // Handle ISO string
      // Validate the date string format (YYYY-MM-DD)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        console.log('[convertFromUTC] Invalid date string format, using current date');
        logger.warn('convertFromUTC received invalid date string', { date });
        dateStr = new Date().toISOString().split('T')[0];
      }
    } else {
      console.log('[convertFromUTC] No valid date provided, using current date');
      dateStr = new Date().toISOString().split('T')[0];
    }

    const utcDateTimeStr = `${dateStr}T${time}Z`; // Z indicates UTC
    const utcDate = new Date(utcDateTimeStr);

    // Validate the resulting UTC date
    if (isNaN(utcDate.getTime())) {
      console.log('[convertFromUTC] Invalid UTC date created, returning original time');
      logger.warn('convertFromUTC created invalid UTC date', { utcDateTimeStr, time, date });
      return time;
    }

    console.log('[convertFromUTC] UTC Date object:', utcDate.toISOString());
    
    // Convert to user's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: userTimezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    const parts = formatter.formatToParts(utcDate);
    const hour = parts.find(p => p.type === 'hour').value;
    const minute = parts.find(p => p.type === 'minute').value;
    const second = parts.find(p => p.type === 'second').value;
    
    const result = `${hour}:${minute}:${second}`;
    
    console.log('[convertFromUTC] RESULT:', result);
    
    logger.info('Time converted from UTC', {
      input: { time, date, timezone: userTimezone },
      output: result
    });
    
    return result;
  } catch (error) {
    console.error('[convertFromUTC] ERROR:', error);
    logger.error('Error converting time from UTC', {
      error: error.message,
      time,
      date,
      timezone: userTimezone
    });
    // Return original time as fallback
    return time;
  }
}

/**
 * Format time for display with timezone indicator (12-hour format)
 * @param {string} time - Time in HH:MM:SS format
 * @param {string} timezone - IANA timezone
 * @param {string} timezoneAbbr - Timezone abbreviation (e.g., "EST", "IST")
 * @returns {string} Formatted time (e.g., "2:00 PM EST")
 */
function formatTimeWithTimezone(time, timezone, timezoneAbbr) {
  try {
    if (!time) return '';
    
    // Parse time
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours, 10);
    const minute = parseInt(minutes, 10);
    
    // Convert to 12-hour format
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    
    // Format
    const formattedTime = `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
    
    // Add timezone if provided
    if (timezoneAbbr) {
      return `${formattedTime} ${timezoneAbbr}`;
    }
    
    return formattedTime;
  } catch (error) {
    logger.error('Error formatting time with timezone', {
      error: error.message,
      time,
      timezone
    });
    return time;
  }
}

/**
 * Check if a date-time in one timezone conflicts with another date-time range
 * Both times should be in UTC for accurate comparison
 * @param {string} checkDate - Date to check (YYYY-MM-DD)
 * @param {string} checkStart - Start time to check (HH:MM:SS UTC)
 * @param {string} checkEnd - End time to check (HH:MM:SS UTC)
 * @param {string} existingDate - Existing booking date (YYYY-MM-DD)
 * @param {string} existingStart - Existing start time (HH:MM:SS UTC)
 * @param {string} existingEnd - Existing end time (HH:MM:SS UTC)
 * @param {number} bufferMinutes - Buffer time in minutes (default: 60)
 * @returns {boolean} True if there's a conflict
 */
function hasTimeConflict(
  checkDate,
  checkStart,
  checkEnd,
  existingDate,
  existingStart,
  existingEnd,
  bufferMinutes = 60
) {
  try {
    // Different dates = no conflict
    if (checkDate !== existingDate) {
      return false;
    }
    
    // Create date objects for comparison (all in UTC)
    const checkStartTime = new Date(`${checkDate}T${checkStart}Z`);
    const checkEndTime = new Date(`${checkDate}T${checkEnd}Z`);
    const existingStartTime = new Date(`${existingDate}T${existingStart}Z`);
    const existingEndTime = new Date(`${existingDate}T${existingEnd}Z`);
    
    // Add buffer to existing booking
    const bufferMs = bufferMinutes * 60 * 1000;
    const existingStartWithBuffer = new Date(existingStartTime.getTime() - bufferMs);
    const existingEndWithBuffer = new Date(existingEndTime.getTime() + bufferMs);
    
    // Check if times overlap
    const hasConflict = checkStartTime < existingEndWithBuffer && checkEndTime > existingStartWithBuffer;
    
    return hasConflict;
  } catch (error) {
    logger.error('Error checking time conflict', {
      error: error.message,
      checkDate,
      checkStart,
      checkEnd,
      existingDate,
      existingStart,
      existingEnd
    });
    return false; // Fail safe - allow booking if error
  }
}

/**
 * Get current UTC time in HH:MM:SS format
 * @returns {string} Current UTC time
 */
function getCurrentUTCTime() {
  const now = new Date();
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Get current UTC date in YYYY-MM-DD format
 * @returns {string} Current UTC date
 */
function getCurrentUTCDate() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Validate timezone string
 * @param {string} timezone - IANA timezone string
 * @returns {boolean} True if valid
 */
function validateTimezone(timezone) {
  try {
    if (!timezone) return false;
    
    // Try to use the timezone with Intl.DateTimeFormat
    Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch (error) {
    logger.warn('Invalid timezone', { timezone, error: error.message });
    return false;
  }
}

/**
 * Get timezone abbreviation (e.g., "IST", "EST")
 * @param {string} timezone - IANA timezone
 * @param {Date} date - Date object (defaults to now)
 * @returns {string} Timezone abbreviation
 */
function getTimezoneAbbreviation(timezone, date = new Date()) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short'
    });
    
    const parts = formatter.formatToParts(date);
    const tzPart = parts.find(part => part.type === 'timeZoneName');
    
    return tzPart ? tzPart.value : timezone;
  } catch (error) {
    logger.error('Error getting timezone abbreviation', {
      error: error.message,
      timezone
    });
    return timezone;
  }
}

/**
 * Convert a booking time slot from companion's timezone to UTC
 * This is specifically for recurring availability slots
 * @param {Object} slot - Availability slot
 * @param {string} slot.day_of_week - Day of week (e.g., "monday")
 * @param {string} slot.start_time - Start time in HH:MM:SS (local)
 * @param {string} slot.end_time - End time in HH:MM:SS (local)
 * @param {string} companionTimezone - Companion's timezone
 * @returns {Object} Slot with UTC times
 */
function convertAvailabilitySlotToUTC(slot, companionTimezone) {
  try {
    // For recurring weekly slots, we use a reference date (e.g., a Monday)
    // to calculate the offset, then apply it to the times
    const referenceDates = {
      monday: '2025-01-06',    // A Monday
      tuesday: '2025-01-07',   // A Tuesday
      wednesday: '2025-01-08', // A Wednesday
      thursday: '2025-01-09',  // A Thursday
      friday: '2025-01-10',    // A Friday
      saturday: '2025-01-11',  // A Saturday
      sunday: '2025-01-12'     // A Sunday
    };
    
    const referenceDate = referenceDates[slot.day_of_week.toLowerCase()];
    
    if (!referenceDate) {
      throw new Error(`Invalid day_of_week: ${slot.day_of_week}`);
    }
    
    const utcStartTime = convertToUTC(slot.start_time, referenceDate, companionTimezone);
    const utcEndTime = convertToUTC(slot.end_time, referenceDate, companionTimezone);
    
    return {
      ...slot,
      start_time: utcStartTime,
      end_time: utcEndTime,
      companion_timezone: companionTimezone,
      is_utc: true
    };
  } catch (error) {
    logger.error('Error converting availability slot to UTC', {
      error: error.message,
      slot,
      companionTimezone
    });
    return slot; // Return original on error
  }
}

/**
 * Convert a UTC availability slot to companion's local timezone for display
 * @param {Object} slot - Availability slot with UTC times
 * @param {string} companionTimezone - Companion's timezone
 * @returns {Object} Slot with local times
 */
function convertAvailabilitySlotFromUTC(slot, companionTimezone) {
  try {
    const referenceDates = {
      monday: '2025-01-06',
      tuesday: '2025-01-07',
      wednesday: '2025-01-08',
      thursday: '2025-01-09',
      friday: '2025-01-10',
      saturday: '2025-01-11',
      sunday: '2025-01-12'
    };
    
    const referenceDate = referenceDates[slot.day_of_week.toLowerCase()];
    
    if (!referenceDate) {
      throw new Error(`Invalid day_of_week: ${slot.day_of_week}`);
    }
    
    const localStartTime = convertFromUTC(slot.start_time, referenceDate, companionTimezone);
    const localEndTime = convertFromUTC(slot.end_time, referenceDate, companionTimezone);
    
    return {
      ...slot,
      start_time: localStartTime,
      end_time: localEndTime
    };
  } catch (error) {
    logger.error('Error converting availability slot from UTC', {
      error: error.message,
      slot,
      companionTimezone
    });
    return slot; // Return original on error
  }
}

module.exports = {
  convertToUTC,
  convertFromUTC,
  formatTimeWithTimezone,
  hasTimeConflict,
  getCurrentUTCTime,
  getCurrentUTCDate,
  validateTimezone,
  getTimezoneAbbreviation,
  convertAvailabilitySlotToUTC,
  convertAvailabilitySlotFromUTC
};

