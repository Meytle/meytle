/**
 * Date Utility Functions
 * Mirrors backend date helpers for consistency
 */

export interface AddressType {
  city?: string;
  state?: string;
  country?: string;
  addressLine?: string;
  postalCode?: string;
}

/**
 * Calculate age from date of birth
 * @param dateOfBirth - Date of birth in YYYY-MM-DD format or Date object
 * @returns Age in years or null if invalid
 */
export const calculateAge = (dateOfBirth: string | Date | null | undefined): number | null => {
  if (!dateOfBirth) return null;

  try {
    const dob = new Date(dateOfBirth);
    
    // Check for invalid date
    if (isNaN(dob.getTime())) {
      return null;
    }

    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();

    // Adjust age if birthday hasn't occurred this year yet
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }

    return age >= 0 ? age : null;
  } catch (error) {
    console.error('Error calculating age:', error);
    return null;
  }
};

/**
 * Check if a person is 18 or older
 * @param dateOfBirth - Date of birth in YYYY-MM-DD format or Date object
 * @returns True if 18 or older
 */
export const isAdult = (dateOfBirth: string | Date | null | undefined): boolean => {
  const age = calculateAge(dateOfBirth);
  return age !== null && age >= 18;
};

/**
 * Format address components into a display string
 * @param address - Address object
 * @returns Formatted location string (e.g., "San Francisco, CA, USA")
 */
export const formatLocation = (address: AddressType | null | undefined): string => {
  if (!address) return '';

  const parts: string[] = [];

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
 * @param address - Address object
 * @returns Formatted full address string
 */
export const formatFullAddress = (address: AddressType | null | undefined): string => {
  if (!address) return '';

  const parts: string[] = [];

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

/**
 * Format date for display
 * @param date - Date string or Date object
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted date string
 */
export const formatDate = (
  date: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = {}
): string => {
  if (!date) return 'Invalid Date';

  try {
    const parsed = new Date(date);

    if (isNaN(parsed.getTime())) {
      return 'Invalid Date';
    }

    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      ...options
    };

    return new Intl.DateTimeFormat('en-US', defaultOptions).format(parsed);
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid Date';
  }
};

/**
 * Check if a date is in the past
 * @param date - Date string or Date object
 * @returns True if date is in the past
 */
export const isPastDate = (date: string | Date | null | undefined): boolean => {
  if (!date) return true;

  try {
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) return true;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    parsed.setHours(0, 0, 0, 0);

    return parsed < today;
  } catch (error) {
    return true;
  }
};

/**
 * Check if a date is in the future
 * @param date - Date string or Date object
 * @returns True if date is in the future
 */
export const isFutureDate = (date: string | Date | null | undefined): boolean => {
  if (!date) return false;

  try {
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    parsed.setHours(0, 0, 0, 0);

    return parsed > today;
  } catch (error) {
    return false;
  }
};

/**
 * Format date for input field (YYYY-MM-DD)
 * @param date - Date string or Date object
 * @returns Formatted date string for input field
 */
export const formatDateForInput = (date: string | Date | null | undefined): string => {
  if (!date) return '';

  try {
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) return '';

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error('Error formatting date for input:', error);
    return '';
  }
};

/**
 * Get age display string
 * @param dateOfBirth - Date of birth
 * @returns Formatted age string (e.g., "28 years old")
 */
export const getAgeDisplay = (dateOfBirth: string | Date | null | undefined): string => {
  const age = calculateAge(dateOfBirth);
  
  if (age === null) {
    return 'Age unknown';
  }

  return `${age} year${age === 1 ? '' : 's'} old`;
};

/**
 * Validate minimum age
 * @param dateOfBirth - Date of birth
 * @param minimumAge - Minimum required age (default: 18)
 * @returns True if meets minimum age requirement
 */
export const meetsMinimumAge = (
  dateOfBirth: string | Date | null | undefined,
  minimumAge: number = 18
): boolean => {
  const age = calculateAge(dateOfBirth);
  return age !== null && age >= minimumAge;
};

