/**
 * Type transformation utilities
 * Converts between snake_case API responses and camelCase frontend types
 */

/**
 * Convert a snake_case string to camelCase
 */
export const snakeToCamel = (str: string): string => {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
};

/**
 * Convert a camelCase string to snake_case
 */
export const camelToSnake = (str: string): string => {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
};

/**
 * Transform an object's keys from snake_case to camelCase
 * Handles nested objects and arrays recursively
 */
export function transformKeysSnakeToCamel<T = any>(obj: any): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (obj instanceof Date) {
    return obj as any;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => transformKeysSnakeToCamel(item)) as any;
  }

  if (typeof obj === 'object') {
    const transformed: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const camelKey = snakeToCamel(key);
      transformed[camelKey] = transformKeysSnakeToCamel(value);
    }
    return transformed;
  }

  return obj;
}

/**
 * Transform an object's keys from camelCase to snake_case
 * Handles nested objects and arrays recursively
 */
export function transformKeysCamelToSnake<T = any>(obj: any): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (obj instanceof Date) {
    return obj as any;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => transformKeysCamelToSnake(item)) as any;
  }

  if (typeof obj === 'object') {
    const transformed: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const snakeKey = camelToSnake(key);
      transformed[snakeKey] = transformKeysCamelToSnake(value);
    }
    return transformed;
  }

  return obj;
}

// ============= TYPE-SPECIFIC TRANSFORMERS =============

import type * as Api from './api';
import type * as Frontend from './index';

/**
 * Transform API booking to frontend booking
 */
export function transformApiBooking(apiBooking: Api.ApiBooking): Frontend.Booking {
  return transformKeysSnakeToCamel<Frontend.Booking>(apiBooking);
}

/**
 * Transform frontend booking to API booking
 */
export function transformFrontendBooking(booking: Partial<Frontend.Booking>): Partial<Api.ApiBooking> {
  return transformKeysCamelToSnake<Partial<Api.ApiBooking>>(booking);
}

/**
 * Transform API availability slot to frontend
 */
export function transformApiAvailabilitySlot(apiSlot: Api.ApiAvailabilitySlot): Frontend.AvailabilitySlot {
  return transformKeysSnakeToCamel<Frontend.AvailabilitySlot>(apiSlot);
}

/**
 * Transform frontend availability slot to API
 */
export function transformFrontendAvailabilitySlot(slot: Frontend.AvailabilitySlot): Api.ApiAvailabilitySlot {
  return transformKeysCamelToSnake<Api.ApiAvailabilitySlot>(slot);
}

/**
 * Transform API user to frontend user
 */
export function transformApiUser(apiUser: Api.ApiUser): Frontend.User {
  const transformed = transformKeysSnakeToCamel<any>(apiUser);
  // Special handling for activeRole vs active_role
  if (transformed.activeRole === undefined && transformed.role) {
    transformed.activeRole = transformed.role;
  }
  // Ensure roles is an array
  if (!transformed.roles && transformed.role) {
    transformed.roles = [transformed.role];
  }
  return transformed;
}

/**
 * Transform API companion to frontend companion
 */
export function transformApiCompanion(apiCompanion: Api.ApiCompanion): Frontend.Companion {
  return transformKeysSnakeToCamel<Frontend.Companion>(apiCompanion);
}

/**
 * Transform API service category to frontend
 */
export function transformApiServiceCategory(apiCategory: Api.ApiServiceCategory): Frontend.ServiceCategory {
  return transformKeysSnakeToCamel<Frontend.ServiceCategory>(apiCategory);
}

/**
 * Transform arrays of API responses
 */
export function transformApiArray<T, U>(
  array: T[],
  transformer: (item: T) => U
): U[] {
  return array.map(item => transformer(item));
}

// ============= VALIDATION HELPERS =============

/**
 * Check if an object has snake_case keys
 */
export function hasSnakeCaseKeys(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false;

  return Object.keys(obj).some(key => key.includes('_'));
}

/**
 * Log a warning in development if an object has snake_case keys
 */
export function warnIfSnakeCase(obj: any, context: string) {
  if (process.env.NODE_ENV === 'development' && hasSnakeCaseKeys(obj)) {
    console.warn(
      `⚠️ Snake_case keys detected in ${context}. This should be transformed to camelCase.`,
      obj
    );
  }
}

/**
 * Type guard to check if a value is an API response (has snake_case)
 */
export function isApiResponse(obj: any): boolean {
  return hasSnakeCaseKeys(obj);
}

/**
 * Type guard to check if a value is a frontend type (has camelCase)
 */
export function isFrontendType(obj: any): boolean {
  return !hasSnakeCaseKeys(obj);
}