/**
 * Address Validation Service
 * Provides secure address verification for meeting locations
 * Ensures only verified, safe addresses are accepted for bookings
 */

export interface ValidatedAddress {
  displayName: string;
  placeId: number;
  osmId: number;
  osmType: string;
  lat: number;
  lon: number;
  placeType?: string;
  address?: {
    road?: string;
    house_number?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  isVerified: boolean;
  verificationTimestamp?: number;
}

// Dangerous keywords that indicate unsafe locations
const BLOCKED_KEYWORDS = [
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
  'residential',
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

// Safe venue types for meetings
const SAFE_VENUE_TYPES = [
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
  'coworking',
  'public'
];

// Types of places that are definitely not safe
const UNSAFE_PLACE_TYPES = [
  'house',
  'home',
  'residential',
  'apartment',
  'flat',
  'condo',
  'dwelling',
  'accommodation',
  'lodging',
  'hostel',
  'dormitory'
];

export class AddressValidationService {
  /**
   * Check if an address contains dangerous keywords
   */
  static containsBlockedKeywords(address: string): string | null {
    const lowerAddress = address.toLowerCase();

    for (const keyword of BLOCKED_KEYWORDS) {
      if (lowerAddress.includes(keyword)) {
        return keyword;
      }
    }

    return null;
  }

  /**
   * Check if the venue type is safe for meetings
   */
  static isSafeVenueType(address: string, placeType?: string): boolean {
    const lowerAddress = address.toLowerCase();
    const lowerType = placeType?.toLowerCase() || '';

    // Check for unsafe place types first
    for (const unsafeType of UNSAFE_PLACE_TYPES) {
      if (lowerType.includes(unsafeType) || lowerAddress.includes(unsafeType)) {
        // Exception: Hotels are safe even though they contain 'hostel'
        if (lowerAddress.includes('hotel')) {
          continue;
        }
        return false;
      }
    }

    // Check for safe venue types
    for (const safeType of SAFE_VENUE_TYPES) {
      if (lowerType.includes(safeType) || lowerAddress.includes(safeType)) {
        return true;
      }
    }

    // Check for business/commercial districts - these are generally safe
    const commercialIndicators = [
      'financial district',
      'business district',
      'downtown',
      'city center',
      'civic center',
      'commercial',
      'corporate',
      'tower',
      'building',
      'suite',
      'floor',
      'manhattan', // Major city centers
      'midtown',
      'wall street'
    ];

    for (const indicator of commercialIndicators) {
      if (lowerAddress.includes(indicator)) {
        return true;
      }
    }

    // Check if it's in a recognized commercial/public area with a street address
    const hasStreetNumber = /\d+/.test(address); // Has a number (likely street number)
    const publicIndicators = [
      'street', 'avenue', 'road', 'boulevard', 'highway',
      'drive', 'lane', 'way', 'court', 'place',
      'center', 'centre', 'plaza', 'market', 'public'
    ];

    // If it has a street number and is on a named street, it's likely a valid public location
    if (hasStreetNumber) {
      for (const indicator of publicIndicators) {
        if (lowerAddress.includes(indicator)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Validate that address has minimum required components
   */
  static hasRequiredComponents(address: ValidatedAddress): boolean {
    // Must have coordinates
    if (!address.lat || !address.lon) {
      return false;
    }

    // Must have a place ID from OpenStreetMap
    if (!address.placeId || !address.osmId) {
      return false;
    }

    // Must have a display name
    if (!address.displayName || address.displayName.length < 10) {
      return false;
    }

    // Should have at least city or road in address components
    if (address.address) {
      const hasLocation = address.address.road || address.address.city;
      if (!hasLocation) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate coordinates are within reasonable bounds
   */
  static areCoordinatesValid(lat: number, lon: number): boolean {
    // Check if coordinates are valid numbers
    if (isNaN(lat) || isNaN(lon)) {
      return false;
    }

    // Check latitude bounds (-90 to 90)
    if (lat < -90 || lat > 90) {
      return false;
    }

    // Check longitude bounds (-180 to 180)
    if (lon < -180 || lon > 180) {
      return false;
    }

    // Check for common fake coordinates
    if (lat === 0 && lon === 0) {
      return false; // Null Island
    }

    return true;
  }

  /**
   * Main validation function for addresses
   */
  static validateAddress(address: ValidatedAddress): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for blocked keywords
    const blockedKeyword = this.containsBlockedKeywords(address.displayName);
    if (blockedKeyword) {
      errors.push(`Address contains unsafe keyword: "${blockedKeyword}". Please select a public venue.`);
    }

    // Check required components
    if (!this.hasRequiredComponents(address)) {
      errors.push('Address is incomplete or invalid. Please select from the suggested addresses.');
    }

    // Validate coordinates
    if (!this.areCoordinatesValid(address.lat, address.lon)) {
      errors.push('Invalid location coordinates. Please select a valid address.');
    }

    // Check if address is verified from OpenStreetMap
    if (!address.isVerified) {
      errors.push('Address must be verified. Please select from the dropdown suggestions.');
    }

    // Only warn about venue type if:
    // 1. Address is not verified OR
    // 2. It's verified but looks suspiciously residential
    if (!address.isVerified) {
      // For unverified addresses, check venue type more strictly
      if (!this.isSafeVenueType(address.displayName, address.placeType)) {
        warnings.push('This location may not be a public venue. Please ensure you select a safe, public meeting place.');
      }
    } else {
      // For verified addresses, only warn if it explicitly looks residential
      const lowerAddress = address.displayName.toLowerCase();
      const residentialIndicators = ['apartment', 'apt', 'unit', 'residence', 'residential'];

      for (const indicator of residentialIndicators) {
        if (lowerAddress.includes(indicator)) {
          warnings.push('This appears to be a residential address. For safety, please meet in a public venue instead.');
          break;
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Create a validated address from OpenStreetMap data
   */
  static createValidatedAddress(osmPlace: any): ValidatedAddress {
    return {
      displayName: osmPlace.display_name,
      placeId: osmPlace.place_id,
      osmId: osmPlace.osm_id,
      osmType: osmPlace.osm_type,
      lat: parseFloat(osmPlace.lat),
      lon: parseFloat(osmPlace.lon),
      placeType: osmPlace.type || osmPlace.class,
      address: osmPlace.address,
      isVerified: true,
      verificationTimestamp: Date.now()
    };
  }

  /**
   * Get safety tips for users
   */
  static getSafetyTips(): string[] {
    return [
      'Always meet in public, well-lit places',
      'Choose busy cafes, restaurants, or shopping centers',
      'Avoid private residences or secluded locations',
      'Consider meeting during daytime hours',
      'Let someone know where you\'re going',
      'Trust your instincts - if a location feels unsafe, choose another'
    ];
  }

  /**
   * Get suggested safe venue types
   */
  static getSuggestedVenues(): string[] {
    return [
      'Coffee shops and cafes',
      'Restaurants',
      'Shopping malls',
      'Hotel lobbies',
      'Public libraries',
      'Parks (during daylight)',
      'Museums or galleries',
      'Community centers'
    ];
  }

  /**
   * Format validation error for display
   */
  static formatValidationError(errors: string[]): string {
    if (errors.length === 0) return '';
    if (errors.length === 1) return errors[0];
    return 'Multiple validation errors: ' + errors.join('; ');
  }
}

export default AddressValidationService;