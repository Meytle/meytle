/**
 * Verification Modal
 * Handles OTP verification and location capture for meeting safety
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaMapMarkerAlt, FaCheckCircle, FaTimesCircle, FaSpinner } from 'react-icons/fa';
import { useGeolocation } from '../../hooks/useGeolocation';
import { submitOTP, getVerificationStatus } from '../../api/verification';
import type { Booking } from '../../types';

interface VerificationModalProps {
  booking: Booking;
  userRole: 'client' | 'companion';
  isOpen: boolean;
  onClose: () => void;
  onVerificationComplete?: () => void;
}

const VerificationModal: React.FC<VerificationModalProps> = ({
  booking,
  userRole,
  isOpen,
  onClose,
  onVerificationComplete
}) => {
  const [otpInput, setOtpInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<string>('pending');
  const [waitingForOther, setWaitingForOther] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  
  const { location, error: locationError, loading: locationLoading, requestLocation } = useGeolocation();

  // Poll verification status when waiting for other party
  useEffect(() => {
    if (!isOpen || !waitingForOther) return;

    const pollInterval = setInterval(async () => {
      try {
        const status = await getVerificationStatus(booking.id);
        
        if (status.verificationStatus === 'verified') {
          setVerificationStatus('verified');
          setWaitingForOther(false);
          setSuccess('Verification successful! Both parties are at the meeting location.');
          
          if (onVerificationComplete) {
            setTimeout(() => {
              onVerificationComplete();
            }, 2000);
          }
        } else if (status.verificationStatus === 'failed') {
          setVerificationStatus('failed');
          setWaitingForOther(false);
          setError(status.failedReason || 'Verification failed');
        }
      } catch (err) {
        console.error('Failed to poll verification status:', err);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [isOpen, waitingForOther, booking.id, onVerificationComplete]);

  // Request location on modal open
  useEffect(() => {
    if (isOpen && !location) {
      requestLocation();
    }
  }, [isOpen, location, requestLocation]);

  const handleOTPChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, ''); // Only digits
    if (value.length <= 6) {
      setOtpInput(value);
      setError(null);
    }
  };

  const handleSubmit = async () => {
    // Validate OTP
    if (otpInput.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    // Check location
    if (!location) {
      setError('Location is required for verification. Please enable location access.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await submitOTP(booking.id, otpInput, location);

      if (response.verified) {
        // Both parties verified successfully
        setVerificationStatus('verified');
        setSuccess(response.message || 'Verification successful!');
        
        if (onVerificationComplete) {
          setTimeout(() => {
            onVerificationComplete();
          }, 2000);
        }
      } else if (response.waitingForOther) {
        // This party verified, waiting for other
        setWaitingForOther(true);
        setSuccess(response.message || 'Verification recorded. Waiting for the other party...');
      } else {
        setError(response.message || 'Verification failed');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to verify. Please try again.';
      setError(errorMessage);
      
      // Handle remaining attempts
      if (err.response?.data?.remainingAttempts !== undefined) {
        setRemainingAttempts(err.response.data.remainingAttempts);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetryLocation = () => {
    requestLocation();
  };

  const handleClose = () => {
    if (submitting || waitingForOther) return;
    setOtpInput('');
    setError(null);
    setSuccess(null);
    setWaitingForOther(false);
    onClose();
  };

  if (!isOpen) return null;

  const otherRole = userRole === 'client' ? 'companion' : 'client';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative"
        >
          {/* Close Button */}
          {!submitting && !waitingForOther && (
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <FaTimes size={24} />
            </button>
          )}

          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <FaCheckCircle className="text-white" size={32} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Meeting Verification</h2>
            <p className="text-gray-600 mt-2">
              For your safety, both parties must verify they are at the meeting location
            </p>
          </div>

          {/* Status Messages */}
          {verificationStatus === 'verified' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4 flex items-start space-x-3">
              <FaCheckCircle className="text-green-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-green-800 font-medium">Verification Successful!</p>
                <p className="text-green-700 text-sm mt-1">{success}</p>
              </div>
            </div>
          )}

          {verificationStatus === 'failed' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start space-x-3">
              <FaTimesCircle className="text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-red-800 font-medium">Verification Failed</p>
                <p className="text-red-700 text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          {waitingForOther && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 flex items-start space-x-3">
              <FaSpinner className="text-blue-500 flex-shrink-0 mt-0.5 animate-spin" />
              <div className="flex-1">
                <p className="text-blue-800 font-medium">Waiting for {otherRole}...</p>
                <p className="text-blue-700 text-sm mt-1">{success}</p>
              </div>
            </div>
          )}

          {error && !verificationStatus && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-800 text-sm">{error}</p>
              {remainingAttempts !== null && remainingAttempts > 0 && (
                <p className="text-red-700 text-xs mt-1">
                  {remainingAttempts} attempt{remainingAttempts !== 1 ? 's' : ''} remaining
                </p>
              )}
            </div>
          )}

          {/* OTP Input Section */}
          {!verificationStatus && !waitingForOther && (
            <div className="space-y-4">
              {/* Instructions */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <p className="text-purple-900 text-sm font-medium">
                  📧 Check your email for the 6-digit verification code
                </p>
                <p className="text-purple-700 text-xs mt-1">
                  Enter the code that your {otherRole} received
                </p>
              </div>

              {/* OTP Input */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Enter Verification Code
                </label>
                <input
                  type="text"
                  value={otpInput}
                  onChange={handleOTPChange}
                  placeholder="000000"
                  maxLength={6}
                  className="w-full px-4 py-3 text-center text-2xl font-mono tracking-widest border-2 border-purple-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  disabled={submitting}
                />
              </div>

              {/* Location Status */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <FaMapMarkerAlt className={location ? 'text-green-500' : 'text-gray-400'} />
                    <span className="text-sm font-medium text-gray-900">Location</span>
                  </div>
                  {location && (
                    <span className="text-xs text-green-600 font-medium">✓ Captured</span>
                  )}
                </div>

                {locationLoading && (
                  <p className="text-sm text-gray-600">Getting your location...</p>
                )}

                {locationError && !location && (
                  <div className="text-sm space-y-2">
                    <p className="text-red-600">{locationError}</p>
                    <button
                      onClick={handleRetryLocation}
                      className="text-purple-600 hover:text-purple-700 font-medium underline"
                    >
                      Try Again
                    </button>
                  </div>
                )}

                {location && (
                  <p className="text-xs text-gray-600 mt-1">
                    Lat: {location.latitude.toFixed(6)}, Lon: {location.longitude.toFixed(6)}
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={submitting || !location || otpInput.length !== 6}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3 rounded-xl font-semibold hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {submitting ? (
                  <>
                    <FaSpinner className="animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <span>Verify Location & Code</span>
                )}
              </button>
            </div>
          )}

          {/* Close button when verified/failed */}
          {(verificationStatus === 'verified' || verificationStatus === 'failed') && (
            <button
              onClick={handleClose}
              className="w-full mt-4 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
            >
              Close
            </button>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default VerificationModal;

