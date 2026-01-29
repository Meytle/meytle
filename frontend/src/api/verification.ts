/**
 * Verification API Client
 * Handles OTP and location verification requests
 */

import axios from 'axios';
import { API_CONFIG } from '../constants';
import { transformKeysCamelToSnake, transformKeysSnakeToCamel } from '../types/transformers';

// Configure axios instance
const api = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

interface UserLocation {
  latitude: number;
  longitude: number;
}

interface SubmitOTPRequest {
  bookingId: number;
  enteredOTP: string;
  userLocation: UserLocation;
}

interface SubmitOTPResponse {
  status: string;
  message: string;
  verified?: boolean;
  waitingForOther?: boolean;
  clientDistance?: number;
  companionDistance?: number;
  reason?: string;
  remainingAttempts?: number;
}

interface VerificationStatus {
  bookingId: number;
  otpSent: boolean;
  clientOtpEntered: boolean;
  companionOtpEntered: boolean;
  verificationStatus: 'pending' | 'verified' | 'failed';
  locationVerified: boolean;
  verifiedAt?: string;
  failedReason?: string;
  distanceFromMeetingClient?: number;
  distanceFromMeetingCompanion?: number;
}

interface VerificationStatusResponse {
  status: string;
  verificationStatus: VerificationStatus;
}

/**
 * Submit OTP code and location for verification
 * @param bookingId - Booking ID
 * @param otp - 6-digit OTP code
 * @param location - User's current GPS coordinates
 * @returns Response with verification result
 */
export const submitOTP = async (
  bookingId: number,
  otp: string,
  location: UserLocation
): Promise<SubmitOTPResponse> => {
  const requestData: SubmitOTPRequest = {
    bookingId,
    enteredOTP: otp,
    userLocation: location
  };

  const response = await api.post<SubmitOTPResponse>(
    '/verification/submit-otp',
    transformKeysCamelToSnake(requestData)
  );

  return transformKeysSnakeToCamel(response.data);
};

/**
 * Get verification status for a booking
 * @param bookingId - Booking ID
 * @returns Verification status
 */
export const getVerificationStatus = async (
  bookingId: number
): Promise<VerificationStatus> => {
  const response = await api.get<VerificationStatusResponse>(
    `/verification/status/${bookingId}`
  );

  const data = transformKeysSnakeToCamel(response.data);
  return data.verificationStatus;
};

export default {
  submitOTP,
  getVerificationStatus
};

