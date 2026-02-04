/**
 * Booking Helper Utilities
 * Helper functions for booking status checks and auto-completion
 */

import type { Booking } from '../types';

/**
 * Check if a booking's end time has passed
 * NOTE: Database stores times in UTC, so we must compare in UTC
 */
export const isBookingPastEndTime = (bookingDate: string, endTime: string): boolean => {
  try {
    const now = new Date();
    
    // Parse end time (stored as UTC in database)
    const [hours, minutes] = endTime.split(':');
    const endHour = parseInt(hours, 10);
    const endMinute = parseInt(minutes, 10);
    
    if (isNaN(endHour) || isNaN(endMinute)) {
      return false;
    }
    
    // Create UTC date object for the booking end time
    // bookingDate format: "YYYY-MM-DD"
    const [year, month, day] = bookingDate.split('-').map(Number);
    
    // Date.UTC creates a timestamp in UTC (not local time)
    const bookingEndTimeUTC = new Date(Date.UTC(year, month - 1, day, endHour, endMinute, 0, 0));
    
    // Compare current time (in UTC) with booking end time (in UTC)
    return now > bookingEndTimeUTC;
  } catch (error) {
    console.error('Error checking booking end time:', error);
    return false;
  }
};

/**
 * Check if a booking should be auto-completed
 * Confirmed, payment_held, or meeting_started bookings past their end time should be auto-completed
 */
export const shouldAutoComplete = (booking: Booking): boolean => {
  return (
    (booking.status === 'confirmed' || booking.status === 'payment_held' || booking.status === 'meeting_started') &&
    !!booking.bookingDate &&
    !!booking.endTime &&
    isBookingPastEndTime(booking.bookingDate, booking.endTime)
  );
};

/**
 * Sort bookings by priority for dashboard display
 * Priority: Upcoming confirmed > Pending > Completed (recent) > Cancelled
 */
export const sortBookingsByPriority = (bookings: Booking[]): Booking[] => {
  return [...bookings].sort((a, b) => {
    const now = new Date();
    const aDate = new Date(a.bookingDate);
    const bDate = new Date(b.bookingDate);
    
    // Priority order: confirmed/payment_held upcoming, pending, completed, cancelled
    const statusPriority: Record<string, number> = {
      confirmed: 1,
      payment_held: 1, // Same priority as confirmed
      pending: 2,
      completed: 3,
      cancelled: 4,
      no_show: 5
    };
    
    const aPriority = statusPriority[a.status] || 999;
    const bPriority = statusPriority[b.status] || 999;
    
    // If different status priorities, sort by that
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }
    
    // Within same status, sort by date
    // Upcoming bookings: ascending (soonest first)
    // Past bookings (completed/cancelled): descending (most recent first)
    if (a.status === 'confirmed' || a.status === 'payment_held' || a.status === 'pending') {
      // For upcoming: soonest first
      return aDate.getTime() - bDate.getTime();
    } else {
      // For completed/cancelled: most recent first
      return bDate.getTime() - aDate.getTime();
    }
  });
};



