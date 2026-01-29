/**
 * OTP Verification Modal
 * Simplified, focused modal for meeting verification
 * GPS check with user confirmation for location mismatch
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { API_CONFIG } from '../../constants';
import { useModalRegistration } from '../../context/ModalContext';
import { useSocket } from '../../context/SocketContext';

interface LocationConfirmation {
  distance: number;
  distanceFormatted: string;
  minutesRemaining: number;
  userLocation: { lat: number; lon: number };
  meetingLocation: { lat: number; lon: number; address: string };
}

interface OTPVerificationModalProps {
  bookingId: number;
  companionName: string;
  meetingStartTime: Date;
  onVerificationComplete: () => void;
}

const OTPVerificationModal: React.FC<OTPVerificationModalProps> = ({
  bookingId,
  companionName,
  meetingStartTime,
  onVerificationComplete
}) => {
  const [otpCode, setOtpCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [hasGPSPermission, setHasGPSPermission] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationSuccess, setVerificationSuccess] = useState<string | null>(null);
  const [userAlreadyVerified, setUserAlreadyVerified] = useState(false);
  const [userAddress, setUserAddress] = useState<string>('Getting location...');
  const [timerStarted, setTimerStarted] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const handleTimeoutRef = useRef<() => void>(() => {});
  const isMountedRef = useRef(true); // Track if component is mounted to prevent stale async operations
  const visibilityHandlerRef = useRef<(() => void) | null>(null); // Stable reference for visibility handler

  // Location confirmation state (when GPS shows user is far but they claim to be there)
  const [locationConfirmation, setLocationConfirmation] = useState<LocationConfirmation | null>(null);
  const [pendingCoords, setPendingCoords] = useState<{ lat: number; lon: number } | null>(null);

  useModalRegistration('otp-verification-modal', true);

  // Get socket for listening to meeting_verified event
  const { lastBookingEvent } = useSocket();

  // Listen for socket events related to this booking
  // - meeting_verified: Close modal when both parties have verified
  // - verification_extended: Update timer when extension is granted
  // - expired: Close modal when verification window expires
  // - cancelled: Close modal when booking is cancelled
  useEffect(() => {
    if (!lastBookingEvent) return;

    const { data, type } = lastBookingEvent;

    // Check if this event is for THIS booking
    if (data?.bookingId !== bookingId) return;

    if (type === 'meeting_verified') {
      console.log('[OTPVerificationModal] Received meeting_verified event, closing modal', {
        bookingId,
        eventData: data
      });
      // Stop the timer immediately
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setVerificationSuccess('Meeting verified! Both parties confirmed.');
      // Close modal after showing success message
      setTimeout(() => {
        onVerificationCompleteRef.current();
      }, 1500);
    } else if (type === 'verification_extended') {
      console.log('[OTPVerificationModal] Received verification_extended event, updating timer', {
        bookingId,
        newSecondsRemaining: data.newSecondsRemaining
      });
      // Update the timer with new seconds remaining
      if (data.newSecondsRemaining) {
        setTimeRemaining(data.newSecondsRemaining);
      }
    } else if (type === 'expired') {
      console.log('[OTPVerificationModal] Received expired event, closing modal', {
        bookingId,
        eventData: data
      });
      // Stop the timer immediately
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setVerificationError('Verification window expired. Booking has been cancelled.');
      // Close modal after showing error message
      setTimeout(() => {
        onVerificationCompleteRef.current();
      }, 2000);
    } else if (type === 'cancelled') {
      console.log('[OTPVerificationModal] Received cancelled event, closing modal', {
        bookingId,
        eventData: data
      });
      // Stop the timer immediately
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setVerificationError('Booking has been cancelled.');
      // Close modal after showing error message
      setTimeout(() => {
        onVerificationCompleteRef.current();
      }, 2000);
    }
  }, [lastBookingEvent, bookingId]);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Reverse geocode to get address from coordinates
  const getUserAddress = async (lat: number, lon: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`
      );
      const data = await response.json();
      return data.display_name?.split(',').slice(0, 3).join(', ') || 'Your current location';
    } catch {
      return 'Your current location';
    }
  };

  // Use ref to store onVerificationComplete to avoid stale closure issues
  const onVerificationCompleteRef = useRef(onVerificationComplete);
  useEffect(() => {
    onVerificationCompleteRef.current = onVerificationComplete;
  }, [onVerificationComplete]);

  // Fetch verification status on mount
  useEffect(() => {
    const fetchVerificationStatus = async () => {
      try {
        const response = await axios.get(
          `${API_CONFIG.BASE_URL}/booking/${bookingId}/verification-status`,
          { withCredentials: true }
        );

        // Check if still mounted after async call
        if (!isMountedRef.current) return;

        const { secondsRemaining, userVerified, bothVerified } = response.data.data;

        // If both verified, close modal - meeting can begin
        if (bothVerified) {
          onVerificationCompleteRef.current();
          return;
        }

        // If only this user verified, show waiting state (don't close modal)
        if (userVerified) {
          setUserAlreadyVerified(true);
          setVerificationSuccess('You are verified! Waiting for other party to verify.');
        }

        setTimeRemaining(Math.max(0, secondsRemaining));
      } catch (error) {
        console.error('Error fetching verification status:', error);
        if (isMountedRef.current) {
          setTimeRemaining(600);
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoadingStatus(false);
        }
      }
    };

    fetchVerificationStatus();
  }, [bookingId]);

  // Handle verification timeout
  const handleTimeout = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (!isMountedRef.current) return;
    setVerificationError('Time expired! Booking will be cancelled.');

    try {
      await axios.post(
        `${API_CONFIG.BASE_URL}/booking/${bookingId}/expire-verification`,
        {},
        { withCredentials: true }
      );
    } catch (error) {
      console.error('Failed to expire booking:', error);
    }

    if (isMountedRef.current) {
      setTimeout(() => onVerificationCompleteRef.current(), 3000);
    }
  }, [bookingId]);

  // Keep handleTimeoutRef current
  useEffect(() => {
    handleTimeoutRef.current = handleTimeout;
  }, [handleTimeout]);

  // Start timer when timeRemaining becomes available
  useEffect(() => {
    if (timeRemaining !== null && !timerStarted) {
      setTimerStarted(true);
    }
  }, [timeRemaining, timerStarted]);

  // Countdown timer with visibility handling
  // Timer pauses when tab is hidden and resumes when visible
  useEffect(() => {
    if (!timerStarted) return;

    const startTimer = () => {
      // Don't start timer if component unmounted
      if (!isMountedRef.current) return;

      if (timerRef.current) clearInterval(timerRef.current);

      timerRef.current = setInterval(() => {
        // Check if still mounted before updating state
        if (!isMountedRef.current) {
          if (timerRef.current) clearInterval(timerRef.current);
          return;
        }

        setTimeRemaining((prev) => {
          if (prev === null || prev <= 1) {
            handleTimeoutRef.current();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    };

    const stopTimer = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    // Sync time remaining with server to handle tab switch accurately
    const syncTimeWithServer = async () => {
      // Check if still mounted before making async call
      if (!isMountedRef.current) return;

      try {
        const response = await axios.get(
          `${API_CONFIG.BASE_URL}/booking/${bookingId}/verification-status`,
          { withCredentials: true }
        );

        // CRITICAL: Check if still mounted after async call completes
        if (!isMountedRef.current) {
          console.log('[OTPVerificationModal] Component unmounted during sync, aborting');
          return;
        }

        const { secondsRemaining, bothVerified } = response.data.data;

        if (bothVerified) {
          // Both verified while tab was hidden - close modal
          console.log('[OTPVerificationModal] Both verified while tab was hidden, closing');
          stopTimer();
          setVerificationSuccess('Meeting verified! Both parties confirmed.');
          setTimeout(() => onVerificationCompleteRef.current(), 1500);
          return;
        }

        if (secondsRemaining <= 0) {
          // Time expired while tab was hidden
          console.log('[OTPVerificationModal] Time expired while tab was hidden');
          handleTimeoutRef.current();
          return;
        }

        setTimeRemaining(Math.max(0, secondsRemaining));
        startTimer();
      } catch (error) {
        console.error('[OTPVerificationModal] Failed to sync time with server:', error);
        // Only resume timer if still mounted
        if (isMountedRef.current) {
          startTimer();
        }
      }
    };

    // Handle page visibility changes - store in ref for stable reference
    const handleVisibilityChange = () => {
      // Don't process if component unmounted
      if (!isMountedRef.current) return;

      if (document.hidden) {
        console.log('[OTPVerificationModal] Tab hidden, pausing timer');
        stopTimer();
      } else {
        console.log('[OTPVerificationModal] Tab visible, syncing with server');
        syncTimeWithServer();
      }
    };

    // Store handler in ref for cleanup - ensures we remove the exact same function reference
    visibilityHandlerRef.current = handleVisibilityChange;
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Start the timer initially
    startTimer();

    return () => {
      stopTimer();
      // Remove using the ref to ensure exact same function reference
      if (visibilityHandlerRef.current) {
        document.removeEventListener('visibilitychange', visibilityHandlerRef.current);
        visibilityHandlerRef.current = null;
      }
    };
  }, [timerStarted, bookingId]);

  // Request GPS on mount
  useEffect(() => {
    requestGPSPermission();
  }, []);

  const requestGPSPermission = () => {
    if (!navigator.geolocation) {
      if (isMountedRef.current) {
        setGpsError('GPS not supported');
      }
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        // Check mounted before setting state
        if (!isMountedRef.current) return;

        setHasGPSPermission(true);
        setGpsError(null);

        const address = await getUserAddress(position.coords.latitude, position.coords.longitude);

        // CRITICAL: Check mounted again after async getUserAddress completes
        if (isMountedRef.current) {
          setUserAddress(address);
        }
      },
      (error) => {
        // Check mounted before setting state
        if (!isMountedRef.current) return;

        setHasGPSPermission(false);
        setGpsError(
          error.code === error.PERMISSION_DENIED ? 'Please enable location access' :
          error.code === error.POSITION_UNAVAILABLE ? 'Location unavailable' :
          'Location request timed out'
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleVerify = async (confirmLocation: boolean = false) => {
    setVerificationError(null);
    setVerificationSuccess(null);

    if (!confirmLocation) {
      setLocationConfirmation(null);
    }

    if (!otpCode || otpCode.length !== 6) {
      setVerificationError('Enter a valid 6-digit code');
      return;
    }

    if (!hasGPSPermission) {
      setVerificationError('GPS permission required');
      requestGPSPermission();
      return;
    }

    setIsVerifying(true);

    try {
      let latitude: number, longitude: number;

      if (confirmLocation && pendingCoords) {
        latitude = pendingCoords.lat;
        longitude = pendingCoords.lon;
      } else {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
          });
        });

        // Check mounted after async geolocation
        if (!isMountedRef.current) return;

        latitude = position.coords.latitude;
        longitude = position.coords.longitude;

        const address = await getUserAddress(latitude, longitude);

        // Check mounted after async getUserAddress
        if (isMountedRef.current) {
          setUserAddress(address);
        }
      }

      const response = await axios.post(
        `${API_CONFIG.BASE_URL}/booking/${bookingId}/verify-otp`,
        { otpCode, latitude, longitude, confirmLocation },
        { withCredentials: true }
      );

      // Check if still mounted after async call
      if (!isMountedRef.current) return;

      // Handle confirmation required response (GPS shows far, asking user to confirm)
      if (response.data.type === 'CONFIRM_LOCATION') {
        const data = response.data.data as LocationConfirmation;
        setLocationConfirmation(data);
        setPendingCoords({ lat: latitude, lon: longitude });
        setIsVerifying(false);
        return;
      }

      const { bothVerified, message } = response.data.data;

      setLocationConfirmation(null);
      setPendingCoords(null);

      if (bothVerified) {
        setVerificationSuccess('Verified! Meeting can begin.');
        setTimeout(() => onVerificationCompleteRef.current(), 2000);
      } else {
        setVerificationSuccess(message || 'Verified! Waiting for other party.');
      }

    } catch (error: any) {
      // Check if still mounted
      if (!isMountedRef.current) return;

      console.error('Verification failed:', error);

      // Clear location confirmation so error message can be displayed
      setLocationConfirmation(null);
      setPendingCoords(null);

      const errorMessage = error.response?.data?.message || '';

      // Handle "already verified" as success, not error
      if (errorMessage.toLowerCase().includes('already verified')) {
        setUserAlreadyVerified(true);
        setVerificationSuccess('You are verified! Waiting for other party to verify.');
        setVerificationError(null);
      } else if (errorMessage.includes('INVALID_OTP|')) {
        const parts = errorMessage.split('|');
        setVerificationError(parts[1] || 'Invalid code. Check your email.');
        setOtpCode('');
      } else {
        setVerificationError(errorMessage || 'Verification failed');
      }
    } finally {
      if (isMountedRef.current) {
        setIsVerifying(false);
      }
    }
  };

  const handleConfirmLocation = () => {
    handleVerify(true);
  };

  const handleCancelConfirmation = () => {
    setLocationConfirmation(null);
    setPendingCoords(null);
  };

  // Prevent escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, []);

  // CRITICAL: Comprehensive cleanup on unmount
  // This ensures all timers and resources are cleaned up when modal closes
  useEffect(() => {
    // Set mounted flag on mount
    isMountedRef.current = true;
    console.log('[OTPVerificationModal] Modal mounted for booking:', bookingId);

    return () => {
      // CRITICAL: Set mounted flag to false FIRST to prevent any pending async operations
      isMountedRef.current = false;
      console.log('[OTPVerificationModal] Modal unmounting, cleaning up for booking:', bookingId);

      // Clear the timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      // Note: visibilitychange listener is cleaned up by its own effect
    };
  }, [bookingId]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]" />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">

          {/* Header with Timer */}
          <div className="bg-gradient-to-r from-[#312E81] to-[#FFCCCB] p-4 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🔐</span>
                <div>
                  <h2 className="font-bold">Meeting Verification</h2>
                  <p className="text-xs text-white/80">with {companionName}</p>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-2xl font-mono font-bold ${timeRemaining !== null && timeRemaining < 120 ? 'text-yellow-300' : ''}`}>
                  {isLoadingStatus ? '--:--' : timeRemaining !== null ? formatTime(timeRemaining) : '--:--'}
                </div>
                <div className="text-xs text-white/70">remaining</div>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-4">

            {/* GPS Status */}
            {gpsError ? (
              <div className="flex items-center justify-between bg-red-50 rounded-lg px-3 py-2">
                <span className="text-sm text-red-700">📍 {gpsError}</span>
                <button onClick={requestGPSPermission} className="text-xs text-red-600 underline">
                  Retry
                </button>
              </div>
            ) : hasGPSPermission ? (
              <div className="flex items-center gap-2 text-green-700 text-sm bg-green-50 rounded-lg px-3 py-2">
                <span>✓</span> GPS enabled
              </div>
            ) : (
              <div className="flex items-center gap-2 text-blue-700 text-sm bg-blue-50 rounded-lg px-3 py-2">
                <span className="animate-pulse">📡</span> Getting location...
              </div>
            )}

            {/* Location Confirmation Dialog */}
            {locationConfirmation && (
              <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 space-y-3">
                <div className="flex items-center gap-2 text-yellow-800 font-medium">
                  <span>⚠️</span> GPS Location Mismatch
                </div>
                <p className="text-sm text-gray-700">
                  GPS shows you are <strong>{locationConfirmation.distanceFormatted}</strong> away from the meeting location.
                </p>
                <p className="text-sm text-gray-600">
                  This could be due to inaccurate GPS. Are you actually at the meeting location?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleConfirmLocation}
                    disabled={isVerifying}
                    className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {isVerifying ? 'Verifying...' : "Yes, I'm here"}
                  </button>
                  <button
                    onClick={handleCancelConfirmation}
                    disabled={isVerifying}
                    className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-400 disabled:opacity-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Error */}
            {verificationError && !locationConfirmation && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                ⚠️ {verificationError}
              </div>
            )}

            {/* Success */}
            {verificationSuccess && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
                ✅ {verificationSuccess}
              </div>
            )}

            {/* OTP Input - hide if already verified */}
            {!userAlreadyVerified && (
              <div>
                <input
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && otpCode.length === 6 && handleVerify()}
                  placeholder="Enter 6-digit code"
                  className="w-full px-4 py-3 text-center text-xl font-mono tracking-[0.5em] border-2 border-gray-200 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all"
                  disabled={isVerifying || isLoadingStatus}
                  autoFocus
                />
                <p className="text-xs text-gray-500 text-center mt-1">Code sent to your email</p>
              </div>
            )}

            {/* Verify Button */}
            {!locationConfirmation && !userAlreadyVerified && (
              <button
                onClick={() => handleVerify(false)}
                disabled={isVerifying || otpCode.length !== 6 || !hasGPSPermission || isLoadingStatus}
                className="w-full bg-gradient-to-r from-[#312E81] to-[#FFCCCB] text-white py-3 rounded-lg font-semibold hover:from-[#252275] hover:to-[#FFB8B8] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isVerifying ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Verifying...
                  </span>
                ) : (
                  'Verify Meeting'
                )}
              </button>
            )}

          </div>
        </div>
      </div>
    </>
  );
};

export default OTPVerificationModal;
