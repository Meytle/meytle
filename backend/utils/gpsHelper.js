/**
 * GPS Helper Utilities
 * Calculate distances between GPS coordinates using Haversine formula
 */

const logger = require('../services/logger');

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in meters
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  try {
    // Validate inputs
    if (!isValidCoordinate(lat1, lon1) || !isValidCoordinate(lat2, lon2)) {
      throw new Error('Invalid GPS coordinates provided');
    }

    const R = 6371000; // Earth's radius in meters
    
    const φ1 = (lat1 * Math.PI) / 180; // Convert to radians
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = R * c; // Distance in meters

    logger.info('GPS distance calculated', {
      point1: { lat: lat1, lon: lon1 },
      point2: { lat: lat2, lon: lon2 },
      distanceMeters: Math.round(distance)
    });

    return distance;
  } catch (error) {
    logger.error('Error calculating GPS distance', {
      error: error.message,
      lat1,
      lon1,
      lat2,
      lon2
    });
    throw error;
  }
}

/**
 * Validate GPS coordinates
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {boolean} True if valid
 */
function isValidCoordinate(lat, lon) {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180 &&
    !isNaN(lat) &&
    !isNaN(lon)
  );
}

/**
 * Check if user is within acceptable range of meeting location
 * @param {number} userLat - User's current latitude
 * @param {number} userLon - User's current longitude
 * @param {number} meetingLat - Meeting location latitude
 * @param {number} meetingLon - Meeting location longitude
 * @param {number} maxDistanceMeters - Maximum allowed distance (default 100m)
 * @returns {object} { isNearby: boolean, distance: number }
 */
function isNearMeetingLocation(userLat, userLon, meetingLat, meetingLon, maxDistanceMeters = 100) {
  try {
    const distance = calculateDistance(userLat, userLon, meetingLat, meetingLon);
    const isNearby = distance <= maxDistanceMeters;

    logger.info('Proximity check result', {
      userLocation: { lat: userLat, lon: userLon },
      meetingLocation: { lat: meetingLat, lon: meetingLon },
      distance: Math.round(distance),
      maxDistance: maxDistanceMeters,
      isNearby
    });

    return {
      isNearby,
      distance: Math.round(distance)
    };
  } catch (error) {
    logger.error('Error checking proximity to meeting location', {
      error: error.message
    });
    // In case of error, fail safely by allowing verification
    // (Don't want to block legitimate users due to GPS issues)
    return {
      isNearby: true,
      distance: 0,
      error: error.message
    };
  }
}

module.exports = {
  calculateDistance,
  isValidCoordinate,
  isNearMeetingLocation
};

