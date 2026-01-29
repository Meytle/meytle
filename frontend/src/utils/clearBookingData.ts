/**
 * Utility to clear all booking-related data from browser storage
 */

export const clearBookingData = () => {
  try {
    // Clear booking session data
    localStorage.removeItem('meytle_booking_session');

    // Clear any booking-related cache keys
    const keysToRemove: string[] = [];

    // Find all localStorage keys that might be booking-related
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.includes('booking') ||
        key.includes('availability') ||
        key.includes('meytle_booking')
      )) {
        keysToRemove.push(key);
      }
    }

    // Remove all booking-related keys
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      console.log(`Removed localStorage key: ${key}`);
    });

    // Also clear sessionStorage if any booking data exists there
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && (
        key.includes('booking') ||
        key.includes('availability')
      )) {
        sessionStorage.removeItem(key);
        console.log(`Removed sessionStorage key: ${key}`);
      }
    }

    console.log('✅ All booking data cleared from browser storage');
    return true;
  } catch (error) {
    console.error('Error clearing booking data:', error);
    return false;
  }
};

// Function to get current booking data before clearing (for debugging)
export const getBookingDataBeforeClearing = () => {
  const bookingSession = localStorage.getItem('meytle_booking_session');

  const bookingRelatedKeys: Record<string, any> = {};

  // Collect all booking-related data
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (
      key.includes('booking') ||
      key.includes('availability') ||
      key.includes('meytle_booking')
    )) {
      bookingRelatedKeys[key] = localStorage.getItem(key);
    }
  }

  return {
    bookingSession: bookingSession ? JSON.parse(bookingSession) : null,
    otherBookingData: bookingRelatedKeys,
    totalKeysFound: Object.keys(bookingRelatedKeys).length
  };
};

// Auto-execute if this file is run directly (for testing)
if (typeof window !== 'undefined' && window.location.search.includes('clearBookingData=true')) {
  const dataBeforeClearing = getBookingDataBeforeClearing();
  console.log('Data before clearing:', dataBeforeClearing);

  const success = clearBookingData();

  if (success) {
    alert('All booking data has been cleared from your browser!');
  } else {
    alert('Error clearing booking data. Check console for details.');
  }
}