/**
 * Distance calculation utility using Haversine formula
 */

const EARTH_RADIUS_KM = 6371;

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param lat1 - First point latitude
 * @param lon1 - First point longitude
 * @param lat2 - Second point latitude
 * @param lon2 - Second point longitude
 * @returns Distance in kilometers
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRadians = (degrees: number) => degrees * (Math.PI / 180);

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Check if a location is within a safe distance from companion's area
 * @param companionLat - Companion's registered latitude
 * @param companionLon - Companion's registered longitude
 * @param meetingLat - Meeting location latitude
 * @param meetingLon - Meeting location longitude
 * @param thresholdKm - Maximum distance in km (default: 50)
 * @returns Object with distance info and warning status
 */
export function checkLocationDistance(
  companionLat: number | null | undefined,
  companionLon: number | null | undefined,
  meetingLat: number | null | undefined,
  meetingLon: number | null | undefined,
  thresholdKm: number = 50
): { distance: number | null; isFar: boolean; message: string } {
  // If any coordinates are missing, can't calculate
  if (!companionLat || !companionLon || !meetingLat || !meetingLon) {
    return {
      distance: null,
      isFar: false,
      message: 'Unable to verify distance'
    };
  }

  const distance = calculateDistanceKm(companionLat, companionLon, meetingLat, meetingLon);
  const isFar = distance > thresholdKm;

  return {
    distance: Math.round(distance),
    isFar,
    message: isFar
      ? `This location is ~${Math.round(distance)} km from the companion's area`
      : 'Verified Safe Location'
  };
}
