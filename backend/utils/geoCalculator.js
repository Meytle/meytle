/**
 * Geo Calculator
 * Utilities for GPS location calculations
 */

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * 
 * The Haversine formula determines the great-circle distance between two points
 * on a sphere given their longitudes and latitudes.
 * 
 * @param {number} lat1 - Latitude of point 1 (in decimal degrees)
 * @param {number} lon1 - Longitude of point 1 (in decimal degrees)
 * @param {number} lat2 - Latitude of point 2 (in decimal degrees)
 * @param {number} lon2 - Longitude of point 2 (in decimal degrees)
 * @returns {number} Distance in meters
 * 
 * @example
 * const distance = calculateDistance(28.6139, 77.2090, 28.6143, 77.2095);
 * console.log(`Distance: ${distance.toFixed(2)} meters`);
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  // Validate inputs
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) {
    throw new Error('All coordinates must be provided');
  }

  // Convert to numbers if strings
  lat1 = Number(lat1);
  lon1 = Number(lon1);
  lat2 = Number(lat2);
  lon2 = Number(lon2);

  // Validate ranges
  if (lat1 < -90 || lat1 > 90 || lat2 < -90 || lat2 > 90) {
    throw new Error('Latitude must be between -90 and 90 degrees');
  }
  if (lon1 < -180 || lon1 > 180 || lon2 < -180 || lon2 > 180) {
    throw new Error('Longitude must be between -180 and 180 degrees');
  }

  // Earth's radius in meters
  const R = 6371000;

  // Convert latitude and longitude from degrees to radians
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  // Haversine formula
  // a = sin²(Δφ/2) + cos(φ1) * cos(φ2) * sin²(Δλ/2)
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  // c = 2 * atan2(√a, √(1−a))
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  // Distance in meters
  const distance = R * c;

  return distance;
};

/**
 * Check if a point is within a specified radius of a target point
 * 
 * @param {number} userLat - User's latitude
 * @param {number} userLon - User's longitude
 * @param {number} targetLat - Target location latitude
 * @param {number} targetLon - Target location longitude
 * @param {number} radiusMeters - Radius in meters (default: 100m)
 * @returns {boolean} True if user is within radius
 * 
 * @example
 * const isNearby = isWithinRadius(28.6139, 77.2090, 28.6143, 77.2095, 100);
 * console.log(`Is within 100m: ${isNearby}`);
 */
const isWithinRadius = (userLat, userLon, targetLat, targetLon, radiusMeters = 100) => {
  try {
    const distance = calculateDistance(userLat, userLon, targetLat, targetLon);
    return distance <= radiusMeters;
  } catch (error) {
    // If calculation fails, return false
    return false;
  }
};

/**
 * Calculate the midpoint between two GPS coordinates
 * Useful for finding a central meeting point
 * 
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {object} Object with lat and lon properties
 * 
 * @example
 * const midpoint = calculateMidpoint(28.6139, 77.2090, 28.6143, 77.2095);
 * console.log(`Midpoint: ${midpoint.lat}, ${midpoint.lon}`);
 */
const calculateMidpoint = (lat1, lon1, lat2, lon2) => {
  // Convert to radians
  const φ1 = (lat1 * Math.PI) / 180;
  const λ1 = (lon1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const λ2 = (lon2 * Math.PI) / 180;

  // Calculate midpoint
  const Bx = Math.cos(φ2) * Math.cos(λ2 - λ1);
  const By = Math.cos(φ2) * Math.sin(λ2 - λ1);

  const φ3 = Math.atan2(
    Math.sin(φ1) + Math.sin(φ2),
    Math.sqrt((Math.cos(φ1) + Bx) * (Math.cos(φ1) + Bx) + By * By)
  );
  const λ3 = λ1 + Math.atan2(By, Math.cos(φ1) + Bx);

  // Convert back to degrees
  const lat3 = (φ3 * 180) / Math.PI;
  const lon3 = (λ3 * 180) / Math.PI;

  return {
    lat: lat3,
    lon: lon3
  };
};

/**
 * Format distance for display
 * 
 * @param {number} meters - Distance in meters
 * @returns {string} Formatted distance string
 * 
 * @example
 * formatDistance(500); // "500m"
 * formatDistance(1500); // "1.5km"
 */
const formatDistance = (meters) => {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  } else {
    return `${(meters / 1000).toFixed(1)}km`;
  }
};

/**
 * Validate GPS coordinates
 * 
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {boolean} True if valid
 */
const isValidCoordinates = (lat, lon) => {
  if (lat == null || lon == null) return false;
  
  lat = Number(lat);
  lon = Number(lon);
  
  if (isNaN(lat) || isNaN(lon)) return false;
  
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
};

module.exports = {
  calculateDistance,
  isWithinRadius,
  calculateMidpoint,
  formatDistance,
  isValidCoordinates
};

