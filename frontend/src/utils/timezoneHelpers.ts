/**
 * Timezone Helper Utilities
 * Detects and formats user timezone information
 */

import { API_CONFIG } from '../constants';

/**
 * Get user's current timezone
 * Returns IANA timezone identifier (e.g., "Asia/Kolkata", "America/New_York")
 */
export const getUserTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (error) {
    console.error('Failed to detect timezone:', error);
    return 'UTC'; // Fallback to UTC
  }
};

/**
 * Get timezone from location coordinates via backend API
 * @param lat Latitude
 * @param lon Longitude
 * @returns Promise<string> IANA timezone (e.g., "Asia/Kolkata")
 */
export const getTimezoneFromLocation = async (
  lat: number,
  lon: number
): Promise<string> => {
  try {
    const response = await fetch(
      `${API_CONFIG.BASE_URL}/api/timezone/from-coordinates?lat=${lat}&lon=${lon}`
    );
    const data = await response.json();
    
    if (data.success && data.data && data.data.timezone) {
      console.log('🌍 Timezone detected from location:', data.data.timezone);
      return data.data.timezone;
    }
    
    console.warn('Failed to get timezone from location, using browser timezone');
    return getUserTimezone(); // Fallback to browser timezone
  } catch (error) {
    console.error('Error getting timezone from location:', error);
    return getUserTimezone(); // Fallback to browser timezone
  }
};

/**
 * Get timezone offset in hours (e.g., +5.5 for IST, -5 for EST)
 */
export const getTimezoneOffset = (): number => {
  const offset = new Date().getTimezoneOffset();
  return -offset / 60; // Negative because getTimezoneOffset returns negative for ahead of UTC
};

/**
 * Get formatted timezone display name (e.g., "Asia/Kolkata (UTC+5:30)")
 */
export const getTimezoneDisplayName = (): string => {
  const timezone = getUserTimezone();
  const offset = getTimezoneOffset();
  const hours = Math.floor(Math.abs(offset));
  const minutes = Math.abs((offset % 1) * 60);
  const sign = offset >= 0 ? '+' : '-';
  
  let offsetStr = `UTC${sign}${hours}`;
  if (minutes > 0) {
    offsetStr += `:${minutes.toString().padStart(2, '0')}`;
  }
  
  return `${timezone} (${offsetStr})`;
};

/**
 * Get short timezone abbreviation for display (e.g., "IST", "EST")
 * Note: This uses the browser's formatting and may not always return standard abbreviations
 */
export const getTimezoneAbbreviation = (): string => {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZoneName: 'short'
    });
    const parts = formatter.formatToParts(new Date());
    const timeZonePart = parts.find(part => part.type === 'timeZoneName');
    return timeZonePart?.value || 'UTC';
  } catch (error) {
    return 'UTC';
  }
};

/**
 * Check if current timezone observes Daylight Saving Time
 */
export const observesDST = (): boolean => {
  const jan = new Date(new Date().getFullYear(), 0, 1).getTimezoneOffset();
  const jul = new Date(new Date().getFullYear(), 6, 1).getTimezoneOffset();
  return jan !== jul;
};

/**
 * Format time with timezone indicator for display
 * @param time - Time string (e.g., "14:30")
 * @param showTimezone - Whether to show timezone abbreviation
 */
export const formatTimeWithTimezone = (time: string, showTimezone: boolean = true): string => {
  if (!showTimezone) return time;
  const tz = getTimezoneAbbreviation();
  return `${time} ${tz}`;
};

/**
 * Get all timezone information in one object
 */
export const getTimezoneInfo = () => {
  return {
    timezone: getUserTimezone(),
    offset: getTimezoneOffset(),
    displayName: getTimezoneDisplayName(),
    abbreviation: getTimezoneAbbreviation(),
    observesDST: observesDST()
  };
};

