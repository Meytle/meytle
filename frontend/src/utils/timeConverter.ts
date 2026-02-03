/**
 * Time Converter Utility
 * Handles conversion between UTC (stored in backend) and user's local timezone for display
 */

/**
 * Convert UTC time to user's local timezone for display
 * @param utcTime - Time in HH:MM:SS format (UTC)
 * @param date - Date in YYYY-MM-DD format
 * @param userTimezone - Target IANA timezone (e.g., "Asia/Kolkata")
 * @returns Local time in HH:MM:SS format
 */
export function convertFromUTC(
  utcTime: string,
  date: string,
  userTimezone: string = 'UTC'
): string {
  try {
    if (!utcTime || !date) {
      console.log('🕐 convertFromUTC: Missing utcTime or date', { utcTime, date });
      return utcTime;
    }

    // If timezone is UTC, return as-is
    if (userTimezone === 'UTC') {
      console.log('🕐 convertFromUTC: Timezone is UTC, returning as-is', { utcTime });
      return utcTime;
    }

    // Create UTC date
    const utcDateTimeStr = `${date}T${utcTime}Z`; // Z indicates UTC
    const utcDate = new Date(utcDateTimeStr);

    console.log('🕐 convertFromUTC: Created UTC date', { utcDateTimeStr, utcDate: utcDate.toISOString() });

    // Convert to user's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: userTimezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(utcDate);
    const hour = parts.find(p => p.type === 'hour')?.value || '00';
    const minute = parts.find(p => p.type === 'minute')?.value || '00';
    const second = parts.find(p => p.type === 'second')?.value || '00';

    const result = `${hour}:${minute}:${second}`;
    console.log('🕐 convertFromUTC: Result', { input: utcTime, output: result, userTimezone });

    return result;
  } catch (error) {
    console.error('Error converting time from UTC:', error);
    return utcTime; // Return original on error
  }
}

/**
 * Convert user's local time to UTC for sending to backend
 * @param localTime - Time in HH:MM:SS format (user's timezone)
 * @param date - Date in YYYY-MM-DD format
 * @param userTimezone - Source IANA timezone
 * @returns UTC time in HH:MM:SS format
 */
export function convertToUTC(
  localTime: string,
  date: string,
  userTimezone: string = 'UTC'
): string {
  try {
    if (!localTime || !date) return localTime;
    
    // If timezone is UTC, return as-is
    if (userTimezone === 'UTC') return localTime;

    // Create date in user's timezone
    const localDateTimeStr = `${date}T${localTime}`;
    
    // Parse as if it's in the user's timezone
    // We need to create a Date object that represents this time in the user's timezone
    const localDate = new Date(localDateTimeStr);
    
    // Get the time in user's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: userTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    // Create a date as if it's in UTC, then get UTC time
    // This is a workaround to handle timezone conversion properly
    const [year, month, day] = date.split('-');
    const [hour, minute, second] = localTime.split(':');
    
    // Create date string in user's timezone
    const dateInUserTZ = new Date(
      `${year}-${month}-${day}T${hour}:${minute}:${second || '00'}`
    );
    
    // Get the UTC equivalent
    const utcFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    // Calculate offset and convert
    const userOffset = getTimezoneOffset(userTimezone, dateInUserTZ);
    const utcTime = new Date(dateInUserTZ.getTime() - (userOffset * 60 * 1000));
    
    const utcHour = String(utcTime.getUTCHours()).padStart(2, '0');
    const utcMinute = String(utcTime.getUTCMinutes()).padStart(2, '0');
    const utcSecond = String(utcTime.getUTCSeconds()).padStart(2, '0');
    
    return `${utcHour}:${utcMinute}:${utcSecond}`;
  } catch (error) {
    console.error('Error converting time to UTC:', error);
    return localTime; // Return original on error
  }
}

/**
 * Get timezone offset in minutes
 */
function getTimezoneOffset(timezone: string, date: Date): number {
  try {
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
    return (tzDate.getTime() - utcDate.getTime()) / (1000 * 60);
  } catch (error) {
    return 0;
  }
}

/**
 * Format time in 12-hour format with AM/PM
 * @param time - Time in HH:MM:SS format
 * @returns Formatted time string (e.g., "2:00 PM")
 */
export function formatTime12Hour(time: string): string {
  try {
    if (!time) return '';
    
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours, 10);
    const minute = parseInt(minutes, 10);
    
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    
    return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
  } catch (error) {
    return time;
  }
}

/**
 * Format time with timezone indicator
 * @param time - Time in HH:MM:SS format
 * @param timezone - IANA timezone
 * @returns Formatted time with timezone (e.g., "2:00 PM IST")
 */
export function formatTimeWithTimezone(time: string, timezone: string): string {
  try {
    const formattedTime = formatTime12Hour(time);
    const tzAbbr = getTimezoneAbbreviation(timezone);
    
    return `${formattedTime} ${tzAbbr}`;
  } catch (error) {
    return time;
  }
}

/**
 * Get timezone abbreviation (e.g., "EST", "IST", "PST")
 * @param timezone - IANA timezone
 * @returns Timezone abbreviation
 */
export function getTimezoneAbbreviation(timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short'
    });
    const parts = formatter.formatToParts(now);
    const tzPart = parts.find(part => part.type === 'timeZoneName');
    return tzPart?.value || timezone;
  } catch (error) {
    return timezone;
  }
}

/**
 * Get user's browser timezone
 * @returns IANA timezone string
 */
export function getUserBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (error) {
    return 'UTC';
  }
}

/**
 * Format a time range with timezone conversion and display
 * Converts UTC times from backend to user's local timezone
 * @param startTime - Start time in HH:MM:SS format (UTC)
 * @param endTime - End time in HH:MM:SS format (UTC)
 * @param date - Date in YYYY-MM-DD format
 * @param userTimezone - User's IANA timezone
 * @returns Formatted time range (e.g., "2:00 PM - 6:00 PM IST")
 */
export function formatTimeRange(
  startTime: string,
  endTime: string,
  date: string,
  userTimezone: string = 'UTC'
): string {
  try {
    if (!startTime || !endTime) return '';

    console.log('🕐 formatTimeRange input:', { startTime, endTime, date, userTimezone });

    // Convert UTC times to user's local timezone
    const localStartTime = convertFromUTC(startTime, date, userTimezone);
    const localEndTime = convertFromUTC(endTime, date, userTimezone);

    console.log('🕐 After UTC conversion:', { localStartTime, localEndTime });

    // Format in 12-hour format
    const formattedStart = formatTime12Hour(localStartTime);
    const formattedEnd = formatTime12Hour(localEndTime);

    // Get timezone abbreviation
    const tzAbbr = getTimezoneAbbreviation(userTimezone);

    console.log('🕐 formatTimeRange output:', `${formattedStart} - ${formattedEnd} ${tzAbbr}`);

    return `${formattedStart} - ${formattedEnd} ${tzAbbr}`;
  } catch (error) {
    console.error('Error formatting time range:', error);
    return `${startTime} - ${endTime}`;
  }
}
