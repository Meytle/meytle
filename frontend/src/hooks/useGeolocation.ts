/**
 * useGeolocation Hook
 * Provides access to browser geolocation API
 */

import { useState, useCallback } from 'react';

interface GeolocationCoordinates {
  latitude: number;
  longitude: number;
}

interface GeolocationState {
  location: GeolocationCoordinates | null;
  error: string | null;
  loading: boolean;
}

interface UseGeolocationReturn extends GeolocationState {
  requestLocation: () => Promise<GeolocationCoordinates | null>;
  clearError: () => void;
}

/**
 * Hook to access user's geolocation
 * @returns {UseGeolocationReturn} Location state and request function
 */
export const useGeolocation = (): UseGeolocationReturn => {
  const [location, setLocation] = useState<GeolocationCoordinates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  /**
   * Request user's current location
   * @returns {Promise<GeolocationCoordinates | null>} Coordinates or null if error
   */
  const requestLocation = useCallback(async (): Promise<GeolocationCoordinates | null> => {
    // Check if geolocation is supported
    if (!navigator.geolocation) {
      const errorMsg = 'Geolocation is not supported by your browser';
      setError(errorMsg);
      setLocation(null);
      return null;
    }

    setLoading(true);
    setError(null);

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        // Success callback
        (position) => {
          const coords: GeolocationCoordinates = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };

          setLocation(coords);
          setError(null);
          setLoading(false);
          resolve(coords);
        },
        // Error callback
        (error) => {
          let errorMessage = 'Failed to get your location';

          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Location permission denied. Please enable location access in your browser settings.';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Location information is unavailable. Please try again.';
              break;
            case error.TIMEOUT:
              errorMessage = 'Location request timed out. Please try again.';
              break;
            default:
              errorMessage = `Failed to get location: ${error.message}`;
          }

          setError(errorMessage);
          setLocation(null);
          setLoading(false);
          resolve(null);
        },
        // Options
        {
          enableHighAccuracy: true, // Request high accuracy
          timeout: 10000, // 10 second timeout
          maximumAge: 0 // Don't use cached location
        }
      );
    });
  }, []);

  /**
   * Clear any existing error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    location,
    error,
    loading,
    requestLocation,
    clearError
  };
};

