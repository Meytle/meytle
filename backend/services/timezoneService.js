/**
 * Timezone Service
 * Converts GPS coordinates to IANA timezone identifiers
 * Uses geo-tz library for offline timezone detection
 */

const geoTz = require('geo-tz');
const logger = require('./logger');

/**
 * Get timezone from GPS coordinates
 * @param {number} lat - Latitude (-90 to 90)
 * @param {number} lon - Longitude (-180 to 180)
 * @returns {string} IANA timezone identifier (e.g., "Asia/Kolkata", "America/New_York")
 */
function getTimezoneFromCoordinates(lat, lon) {
  try {
    // Validate coordinates
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      logger.warn('Invalid coordinate types', { lat: typeof lat, lon: typeof lon });
      return 'UTC';
    }

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      logger.warn('Coordinates out of range', { lat, lon });
      return 'UTC';
    }

    // geo-tz.find returns array of possible timezones
    // Usually just one, but can be multiple for border areas
    const timezones = geoTz.find(lat, lon);
    
    if (timezones && timezones.length > 0) {
      const timezone = timezones[0]; // Take first timezone
      
      logger.info('Timezone detected from coordinates', {
        lat,
        lon,
        timezone,
        alternativesCount: timezones.length
      });
      
      return timezone;
    } else {
      logger.warn('No timezone found for coordinates, using UTC fallback', { lat, lon });
      return 'UTC';
    }
  } catch (error) {
    logger.error('Error getting timezone from coordinates', {
      error: error.message,
      stack: error.stack,
      lat,
      lon
    });
    return 'UTC'; // Safe fallback
  }
}

/**
 * Validate timezone string
 * @param {string} timezone - IANA timezone to validate
 * @returns {boolean} True if valid timezone
 */
function isValidTimezone(timezone) {
  try {
    // Test if timezone is valid by trying to use it
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get timezone from city/state/country (without GPS coordinates)
 * @param {string} city - City name
 * @param {string} state - State/province name
 * @param {string} country - Country name
 * @returns {string} IANA timezone identifier
 */
function getTimezoneFromLocation(city, state, country) {
  try {
    // Normalize inputs
    const normalizedCountry = country?.toLowerCase().trim();
    const normalizedState = state?.toLowerCase().trim();
    const normalizedCity = city?.toLowerCase().trim();

    logger.info('Detecting timezone from location', { city, state, country });

    // Country-based timezone mapping (most countries have one primary timezone)
    const countryTimezones = {
      'india': 'Asia/Kolkata',
      'united states': 'America/New_York', // Default to Eastern, will refine by state
      'usa': 'America/New_York',
      'united kingdom': 'Europe/London',
      'uk': 'Europe/London',
      'canada': 'America/Toronto',
      'australia': 'Australia/Sydney',
      'germany': 'Europe/Berlin',
      'france': 'Europe/Paris',
      'japan': 'Asia/Tokyo',
      'china': 'Asia/Shanghai',
      'brazil': 'America/Sao_Paulo',
      'mexico': 'America/Mexico_City',
      'russia': 'Europe/Moscow',
      'south africa': 'Africa/Johannesburg',
      'uae': 'Asia/Dubai',
      'united arab emirates': 'Asia/Dubai',
      'singapore': 'Asia/Singapore',
      'thailand': 'Asia/Bangkok',
      'pakistan': 'Asia/Karachi',
      'bangladesh': 'Asia/Dhaka',
      'sri lanka': 'Asia/Colombo',
      'nepal': 'Asia/Kathmandu',
      'spain': 'Europe/Madrid',
      'italy': 'Europe/Rome',
      'netherlands': 'Europe/Amsterdam',
      'switzerland': 'Europe/Zurich',
      'sweden': 'Europe/Stockholm',
      'norway': 'Europe/Oslo',
      'denmark': 'Europe/Copenhagen',
      'poland': 'Europe/Warsaw',
      'turkey': 'Europe/Istanbul',
      'south korea': 'Asia/Seoul',
      'indonesia': 'Asia/Jakarta',
      'philippines': 'Asia/Manila',
      'vietnam': 'Asia/Ho_Chi_Minh',
      'malaysia': 'Asia/Kuala_Lumpur',
      'new zealand': 'Pacific/Auckland',
      'argentina': 'America/Argentina/Buenos_Aires',
      'chile': 'America/Santiago',
      'colombia': 'America/Bogota',
      'peru': 'America/Lima',
      'egypt': 'Africa/Cairo',
      'nigeria': 'Africa/Lagos',
      'kenya': 'Africa/Nairobi'
    };

    // US state timezone mapping
    const usStateTimezones = {
      'alabama': 'America/Chicago',
      'alaska': 'America/Anchorage',
      'arizona': 'America/Phoenix',
      'arkansas': 'America/Chicago',
      'california': 'America/Los_Angeles',
      'colorado': 'America/Denver',
      'connecticut': 'America/New_York',
      'delaware': 'America/New_York',
      'florida': 'America/New_York',
      'georgia': 'America/New_York',
      'hawaii': 'Pacific/Honolulu',
      'idaho': 'America/Boise',
      'illinois': 'America/Chicago',
      'indiana': 'America/Indianapolis',
      'iowa': 'America/Chicago',
      'kansas': 'America/Chicago',
      'kentucky': 'America/New_York',
      'louisiana': 'America/Chicago',
      'maine': 'America/New_York',
      'maryland': 'America/New_York',
      'massachusetts': 'America/New_York',
      'michigan': 'America/Detroit',
      'minnesota': 'America/Chicago',
      'mississippi': 'America/Chicago',
      'missouri': 'America/Chicago',
      'montana': 'America/Denver',
      'nebraska': 'America/Chicago',
      'nevada': 'America/Los_Angeles',
      'new hampshire': 'America/New_York',
      'new jersey': 'America/New_York',
      'new mexico': 'America/Denver',
      'new york': 'America/New_York',
      'north carolina': 'America/New_York',
      'north dakota': 'America/Chicago',
      'ohio': 'America/New_York',
      'oklahoma': 'America/Chicago',
      'oregon': 'America/Los_Angeles',
      'pennsylvania': 'America/New_York',
      'rhode island': 'America/New_York',
      'south carolina': 'America/New_York',
      'south dakota': 'America/Chicago',
      'tennessee': 'America/Chicago',
      'texas': 'America/Chicago',
      'utah': 'America/Denver',
      'vermont': 'America/New_York',
      'virginia': 'America/New_York',
      'washington': 'America/Los_Angeles',
      'west virginia': 'America/New_York',
      'wisconsin': 'America/Chicago',
      'wyoming': 'America/Denver'
    };

    // For USA, check state first
    if (normalizedCountry === 'united states' || normalizedCountry === 'usa') {
      if (normalizedState && usStateTimezones[normalizedState]) {
        logger.info('Timezone detected from US state', { state, timezone: usStateTimezones[normalizedState] });
        return usStateTimezones[normalizedState];
      }
    }

    // Check country mapping
    if (normalizedCountry && countryTimezones[normalizedCountry]) {
      logger.info('Timezone detected from country', { country, timezone: countryTimezones[normalizedCountry] });
      return countryTimezones[normalizedCountry];
    }

    // Fallback to UTC
    logger.warn('Could not detect timezone from location, using UTC', { city, state, country });
    return 'UTC';

  } catch (error) {
    logger.error('Error detecting timezone from location', {
      error: error.message,
      city,
      state,
      country
    });
    return 'UTC';
  }
}

/**
 * Get timezone abbreviation (e.g., "EST", "IST", "PST")
 * @param {string} timezone - IANA timezone
 * @returns {string} Timezone abbreviation
 */
function getTimezoneAbbreviation(timezone) {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short'
    });
    const parts = formatter.formatToParts(now);
    const timeZonePart = parts.find(part => part.type === 'timeZoneName');
    return timeZonePart?.value || timezone;
  } catch (error) {
    logger.error('Error getting timezone abbreviation', { timezone, error: error.message });
    return timezone;
  }
}

/**
 * Get timezone offset in hours for a given timezone
 * @param {string} timezone - IANA timezone
 * @returns {number} Offset in hours (e.g., 5.5 for IST, -5 for EST)
 */
function getTimezoneOffset(timezone) {
  try {
    const now = new Date();
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const offsetMs = tzDate.getTime() - utcDate.getTime();
    return offsetMs / (1000 * 60 * 60); // Convert to hours
  } catch (error) {
    logger.error('Error getting timezone offset', { timezone, error: error.message });
    return 0;
  }
}

module.exports = {
  getTimezoneFromCoordinates,
  getTimezoneFromLocation,
  isValidTimezone,
  getTimezoneAbbreviation,
  getTimezoneOffset
};

