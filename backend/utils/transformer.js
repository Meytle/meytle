/**
 * Shared transformation utilities for converting database snake_case to frontend camelCase
 * This ensures consistent field naming across all API responses
 */

/**
 * Convert snake_case string to camelCase
 * @param {string} str - The snake_case string to convert
 * @returns {string} The camelCase version of the string
 */
const snakeToCamel = (str) => {
  if (!str) return str;
  // Handle both letters AND numbers after underscores
  return str.replace(/_([a-z0-9])/gi, (match, char) => char.toUpperCase());
};

/**
 * Transform a single object from snake_case to camelCase
 * @param {Object} obj - The object with snake_case keys
 * @returns {Object} New object with camelCase keys
 */
const transformToFrontend = (obj) => {
  if (!obj) return obj;
  if (typeof obj !== 'object') return obj;

  // Convert Date objects to YYYY-MM-DD format strings
  if (obj instanceof Date) {
    const year = obj.getFullYear();
    const month = String(obj.getMonth() + 1).padStart(2, '0');
    const day = String(obj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => transformToFrontend(item));
  }

  const transformed = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = snakeToCamel(key);
    // Handle Date objects in values
    if (value instanceof Date) {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      transformed[camelKey] = `${year}-${month}-${day}`;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      transformed[camelKey] = transformToFrontend(value);
    } else if (Array.isArray(value)) {
      transformed[camelKey] = value.map(item => transformToFrontend(item));
    } else {
      transformed[camelKey] = value;
    }
  }

  return transformed;
};

/**
 * Transform an array of objects from snake_case to camelCase
 * @param {Array} array - Array of objects with snake_case keys
 * @returns {Array} Array of objects with camelCase keys
 */
const transformArrayToFrontend = (array) => {
  if (!Array.isArray(array)) return array;
  return array.map(item => transformToFrontend(item));
};

/**
 * Transform paginated response maintaining pagination structure
 * @param {Object} response - Paginated response object
 * @returns {Object} Transformed paginated response
 */
const transformPaginatedResponse = (response) => {
  if (!response) return response;

  const transformed = {
    data: transformArrayToFrontend(response.data || response.results || []),
    total: response.total || response.totalCount || 0,
    page: response.page || response.currentPage || 1,
    limit: response.limit || response.pageSize || 10,
    totalPages: response.total_pages || response.totalPages || 1
  };

  // Add any additional metadata
  if (response.has_next !== undefined) {
    transformed.hasNext = response.has_next;
  }
  if (response.has_prev !== undefined) {
    transformed.hasPrev = response.has_prev;
  }

  return transformed;
};

module.exports = {
  snakeToCamel,
  transformToFrontend,
  transformArrayToFrontend,
  transformPaginatedResponse
};