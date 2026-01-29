/**
 * Hook to manage OTP Verification Modal
 * Checks if user has a booking that needs verification and shows modal at the right time
 *
 * LIFECYCLE:
 * 1. Modal shows when: booking is confirmed, meeting time is within window, user hasn't verified
 * 2. Modal closes when: both verified, booking expired, booking cancelled
 * 3. Socket events that close modal: meeting_verified, expired, cancelled
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { API_CONFIG } from '../constants';
import { useSocket } from '../context/SocketContext';

interface Booking {
  id: number;
  status: string;
  bookingDate: string;
  startTime: string;
  companionName?: string;
  clientName?: string;
  verificationRequired?: boolean;
}

interface UseOTPVerificationReturn {
  showModal: boolean;
  currentBooking: Booking | null;
  handleVerificationComplete: () => void;
}

export const useOTPVerification = (bookings: Booking[], userRole: 'client' | 'companion'): UseOTPVerificationReturn => {
  const [showModal, setShowModal] = useState(false);
  const [currentBooking, setCurrentBooking] = useState<Booking | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const processedBookingIdRef = useRef<number | null>(null); // Track which booking we've shown modal for
  const isCheckingRef = useRef(false); // Prevent concurrent checks

  // 🔒 FIX: Use ref for bookings to prevent interval recreation on every bookings array change
  const bookingsRef = useRef<Booking[]>(bookings);
  bookingsRef.current = bookings;

  // Get socket events to close modal when needed
  const { lastBookingEvent } = useSocket();

  // Listen for socket events that should close the modal
  useEffect(() => {
    if (!lastBookingEvent || !currentBooking) return;

    const { type, data } = lastBookingEvent;

    // Only process events for the current booking
    if (data?.bookingId !== currentBooking.id) return;

    console.log('[useOTPVerification] Received socket event:', type, 'for booking:', data?.bookingId);

    // These events should close the modal
    if (type === 'meeting_verified' || type === 'expired' || type === 'cancelled') {
      console.log('[useOTPVerification] Closing modal due to socket event:', type);
      // Small delay to allow the modal to show the message first
      setTimeout(() => {
        setShowModal(false);
        setCurrentBooking(null);
        // Don't reset processedBookingIdRef - we don't want to re-show modal for same booking
      }, type === 'meeting_verified' ? 1500 : 2000);
    }
  }, [lastBookingEvent, currentBooking]);

  useEffect(() => {
    // Check every minute if a booking needs verification
    const checkForVerification = async () => {
      // Prevent concurrent checks
      if (isCheckingRef.current) return;
      // 🔒 FIX: Use ref to avoid stale closure and prevent interval recreation
      const currentBookings = bookingsRef.current;
      if (!currentBookings || currentBookings.length === 0) return;

      isCheckingRef.current = true;

      try {
        const now = new Date();

        // Find confirmed bookings that start within the next minute
        const bookingNeedingVerification = currentBookings.find((booking) => {
          if (booking.status !== 'confirmed') return false;
          if (!booking.verificationRequired) return false;

          // Parse booking start time (stored in UTC)
          const bookingStart = new Date(`${booking.bookingDate}T${booking.startTime}Z`);
          
          // Check if booking starts within the next 2 minutes (grace period)
          // and hasn't already passed by more than 10 minutes
          const diffMs = bookingStart.getTime() - now.getTime();
          const diffMinutes = diffMs / (1000 * 60);

          console.log('[useOTPVerification] Checking booking:', {
            bookingId: booking.id,
            bookingStart: bookingStart.toISOString(),
            now: now.toISOString(),
            diffMinutes: Math.round(diffMinutes)
          });

          // Show modal if booking starts in 0-2 minutes OR has already started but less than 10 minutes ago
          return diffMinutes >= -10 && diffMinutes <= 2;
        });

        // Only process if we found a booking AND we haven't already shown modal for this booking
        if (bookingNeedingVerification && processedBookingIdRef.current !== bookingNeedingVerification.id) {
          console.log('[useOTPVerification] Booking needs verification:', bookingNeedingVerification);
          
          // Check verification status first
          try {
            const response = await axios.get(
              `${API_CONFIG.BASE_URL}/booking/${bookingNeedingVerification.id}/verification-status`,
              { withCredentials: true }
            );

            const { userVerified, bothVerified } = response.data.data;

            // Only show modal if user hasn't verified yet
            if (!userVerified && !bothVerified) {
              processedBookingIdRef.current = bookingNeedingVerification.id; // Mark as processed
              setCurrentBooking(bookingNeedingVerification);
              setShowModal(true);
            } else if (bothVerified) {
              console.log('[useOTPVerification] Booking already verified by both parties');
              processedBookingIdRef.current = bookingNeedingVerification.id; // Mark as processed
            } else {
              console.log('[useOTPVerification] User already verified, waiting for other party');
              processedBookingIdRef.current = bookingNeedingVerification.id; // Mark as processed
            }
          } catch (error) {
            console.error('[useOTPVerification] Error checking verification status:', error);
            // Show modal anyway if we can't check status
            processedBookingIdRef.current = bookingNeedingVerification.id; // Mark as processed
            setCurrentBooking(bookingNeedingVerification);
            setShowModal(true);
          }
        }
      } finally {
        isCheckingRef.current = false;
      }
    };

    // Check immediately
    checkForVerification();

    // 🔒 FIX: Reduced from 30 seconds to 60 seconds to reduce API calls
    // The 2-minute window for showing modal means 60s check interval is sufficient
    checkIntervalRef.current = setInterval(checkForVerification, 60000);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 🔒 FIX: No dependencies - interval runs once on mount, uses bookingsRef.current for latest data

  // Memoize to prevent unnecessary re-renders in parent components
  const handleVerificationComplete = useCallback(() => {
    setShowModal(false);
    setCurrentBooking(null);
    // Don't reset processedBookingIdRef - we don't want to re-show modal for same booking
    console.log('[useOTPVerification] Verification complete, modal closed');
  }, []);

  return {
    showModal,
    currentBooking,
    handleVerificationComplete
  };
};

