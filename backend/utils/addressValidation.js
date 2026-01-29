/**
 * Address Validation Helper for Backend
 * Provides server-side validation for meeting locations
 */

// Dangerous keywords that indicate unsafe locations
const DANGEROUS_KEYWORDS = [
  'basement',
  'cellar',
  'attic',
  'bedroom',
  'my house',
  'my home',
  'my place',
  'my apartment',
  'my room',
  'private room',
  'private residence',
  'fake street',
  'fake address',
  'nowhere',
  'abandoned',
  'warehouse',
  'storage',
  'garage',
  'shed',
  'cabin',
  'motel room',
  'back alley',
  'dark alley'
];

// Safe venue indicators
const SAFE_VENUE_INDICATORS = [
  'restaurant',
  'cafe',
  'coffee',
  'hotel',
  'mall',
  'shopping',
  'park',
  'library',
  'museum',
  'gallery',
  'theatre',
  'cinema',
  'store',
  'shop',
  'plaza',
  'square',
  'station',
  'airport',
  'university',
  'college',
  'hospital',
  'clinic',
  'gym',
  'fitness',
  'community',
  'convention',
  'business',
  'office',
  'public'
];

/**
 * Check if an address contains dangerous keywords
 * @param {string} address - The address to check
 * @returns {string|null} - The dangerous keyword found, or null
 */
const checkDangerousKeywords = (address) => {
  if (!address) return null;

  const lowerAddress = address.toLowerCase();

  for (const keyword of DANGEROUS_KEYWORDS) {
    if (lowerAddress.includes(keyword)) {
      return keyword;
    }
  }

  return null;
};

/**
 * Check if the address appears to be a safe venue
 * @param {string} address - The address to check
 * @returns {boolean} - True if the address appears to be a safe venue
 */
const isSafeVenue = (address) => {
  if (!address) return false;

  const lowerAddress = address.toLowerCase();

  // Check for safe venue indicators
  for (const indicator of SAFE_VENUE_INDICATORS) {
    if (lowerAddress.includes(indicator)) {
      return true;
    }
  }

  // Check for public location indicators
  const publicIndicators = ['street', 'avenue', 'road', 'boulevard', 'highway', 'center', 'centre'];
  for (const indicator of publicIndicators) {
    if (lowerAddress.includes(indicator)) {
      return true;
    }
  }

  return false;
};

/**
 * Validate address structure
 * @param {string} address - The address to validate
 * @returns {object} - Validation result with isValid and errors
 */
const validateAddressStructure = (address) => {
  const errors = [];

  if (!address || typeof address !== 'string') {
    errors.push('Address is required');
    return { isValid: false, errors };
  }

  const trimmedAddress = address.trim();

  // Check minimum length
  if (trimmedAddress.length < 10) {
    errors.push('Address is too short. Please provide a complete address.');
  }

  // Check for basic structure (should have numbers or commas for proper formatting)
  const hasNumbers = /\d/.test(trimmedAddress);
  const hasCommas = trimmedAddress.includes(',');
  const hasSpaces = trimmedAddress.includes(' ');

  if (!hasNumbers && !hasCommas) {
    errors.push('Address must include street number and proper formatting');
  }

  if (!hasSpaces) {
    errors.push('Address appears to be invalid (missing spaces)');
  }

  // Check for suspicious patterns
  if (trimmedAddress.toLowerCase() === 'test' ||
      trimmedAddress.toLowerCase() === 'testing' ||
      trimmedAddress.toLowerCase() === 'asdf' ||
      trimmedAddress.toLowerCase() === 'qwerty') {
    errors.push('Please provide a real address');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate coordinates if provided
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {object} - Validation result
 */
const validateCoordinates = (lat, lon) => {
  const errors = [];

  // If coordinates are provided, validate them
  if (lat !== undefined && lon !== undefined) {
    // Check if coordinates are valid numbers
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);

    if (isNaN(latitude) || isNaN(longitude)) {
      errors.push('Invalid coordinates provided');
    } else {
      // Check latitude bounds (-90 to 90)
      if (latitude < -90 || latitude > 90) {
        errors.push('Invalid latitude value');
      }

      // Check longitude bounds (-180 to 180)
      if (longitude < -180 || longitude > 180) {
        errors.push('Invalid longitude value');
      }

      // Check for null island (0,0) which is often a default/error value
      if (latitude === 0 && longitude === 0) {
        errors.push('Invalid location coordinates (null island)');
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Main validation function for booking addresses
 * @param {object} data - Booking data including address and coordinates
 * @returns {object} - Complete validation result
 */
const validateBookingAddress = (data) => {
  const {
    meetingLocation,
    meetingType,
    meeting_location_lat,
    meeting_location_lon,
    meeting_location_place_id
  } = data;

  const errors = [];
  const warnings = [];

  // Skip validation for virtual meetings
  if (meetingType === 'virtual') {
    return { isValid: true, errors: [], warnings: [] };
  }

  // Check for dangerous keywords
  const dangerousKeyword = checkDangerousKeywords(meetingLocation);
  if (dangerousKeyword) {
    errors.push(`Unsafe location detected: "${dangerousKeyword}". Please select a public venue.`);
  }

  // Validate address structure
  const structureValidation = validateAddressStructure(meetingLocation);
  if (!structureValidation.isValid) {
    errors.push(...structureValidation.errors);
  }

  // Check if it appears to be a safe venue
  if (!isSafeVenue(meetingLocation) && errors.length === 0) {
    warnings.push('Location may not be a public venue. Please ensure you select a safe, public meeting place.');
  }

  // Validate coordinates if provided
  if (meeting_location_lat !== undefined || meeting_location_lon !== undefined) {
    const coordValidation = validateCoordinates(meeting_location_lat, meeting_location_lon);
    if (!coordValidation.isValid) {
      errors.push(...coordValidation.errors);
    }
  }

  // If place_id is provided, it should be a positive number
  if (meeting_location_place_id !== undefined && meeting_location_place_id !== null) {
    const placeId = parseInt(meeting_location_place_id);
    if (isNaN(placeId) || placeId <= 0) {
      warnings.push('Invalid place identifier');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

module.exports = {
  checkDangerousKeywords,
  isSafeVenue,
  validateAddressStructure,
  validateCoordinates,
  validateBookingAddress
};