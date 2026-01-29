/**
 * Image URL Helper Functions
 * Ensures consistent image URL construction across the application
 */

import { API_CONFIG } from '../constants';

/**
 * Constructs a full image URL from a relative path
 * @param relativePath - Relative path from backend (e.g., /uploads/profiles/123.jpg)
 * @returns Full URL to the image
 * 
 * Examples:
 * - Input: "/uploads/profiles/123.jpg"
 * - If BASE_URL is "/api" → Output: "/uploads/profiles/123.jpg"
 * - If BASE_URL is "http://localhost:3000/api" → Output: "http://localhost:3000/uploads/profiles/123.jpg"
 */
export const getImageUrl = (relativePath?: string | null): string => {
  if (!relativePath) return '';
  
  // If it's already a full URL (starts with http:// or https://), return as is
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    return relativePath;
  }
  
  // If it's a data URL (base64), return as is
  if (relativePath.startsWith('data:')) {
    return relativePath;
  }
  
  // Get the base URL without /api suffix
  const baseUrl = API_CONFIG.BASE_URL.replace('/api', '');
  
  // Ensure relativePath starts with /
  const normalizedPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  
  // If base URL is empty (meaning it was just '/api'), return path as is
  if (!baseUrl) {
    return normalizedPath;
  }
  
  // Combine base URL with path
  return `${baseUrl}${normalizedPath}`;
};

/**
 * Constructs image URLs for multiple paths
 * @param paths - Array of relative paths
 * @returns Array of full URLs
 */
export const getImageUrls = (paths: (string | null | undefined)[]): string[] => {
  return paths
    .filter((path): path is string => !!path)
    .map(path => getImageUrl(path))
    .filter(url => url !== '');
};

/**
 * Get companion profile images in order (main photo first, then additional)
 * @param profilePhotoUrl - Main profile photo
 * @param additionalPhoto1Url - First additional photo
 * @param additionalPhoto2Url - Second additional photo
 * @returns Array of full image URLs
 */
export const getCompanionImages = (
  profilePhotoUrl?: string | null,
  additionalPhoto1Url?: string | null,
  additionalPhoto2Url?: string | null
): string[] => {
  return getImageUrls([profilePhotoUrl, additionalPhoto1Url, additionalPhoto2Url]);
};

