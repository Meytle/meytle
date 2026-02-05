/**
 * Authentication API Module
 * Handles all authentication-related API calls
 * Uses HTTP-only cookies for secure token storage
 */

import axios from 'axios';
import type { SignUpData, SignInData, AuthResponse, RoleSwitchData } from '../types';
import { API_CONFIG } from '../constants';
import { transformKeysSnakeToCamel } from '../types/transformers';

// Configure axios instance with credentials support
const api = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Always send cookies with requests
});

// Response interceptor for automatic transformation and error handling
api.interceptors.response.use(
  (response) => {
    // Transform snake_case to camelCase if needed (backend usually does this, but ensure consistency)
    if (response.data && response.data.data) {
      response.data.data = transformKeysSnakeToCamel(response.data.data);
    }
    if (response.data) {
      response.data = transformKeysSnakeToCamel(response.data);
    }
    return response;
  },
  (error) => {
    // Transform error response data as well
    if (error.response?.data) {
      error.response.data = transformKeysSnakeToCamel(error.response.data);
    }
    
    // Handle authentication errors
    if (error.response?.status === 401) {
      const errorMessage = error.response?.data?.message || '';

      // Log only in development
      if (import.meta.env.DEV) {
        console.log('🔍 401 Error Details:', {
          url: error.config?.url || '',
          message: errorMessage,
        });
      }

      // Check if token is expired or missing
      const isTokenExpired =
        errorMessage === 'Token expired. Please sign in again.';

      const isNoToken =
        errorMessage === 'No token provided. Please authenticate.';

      // For expired tokens, dispatch event for auth context to handle
      if (isTokenExpired || isNoToken) {
        if (import.meta.env.DEV) {
          console.log('🔒 Authentication issue detected:', errorMessage);
        }
        // Dispatch a custom event that AuthContext can listen to
        window.dispatchEvent(new Event('auth-expired'));
      }
    }

    // Handle email not verified errors (403 with EMAIL_NOT_VERIFIED code)
    if (error.response?.status === 403 && error.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
      if (import.meta.env.DEV) {
        console.log('📧 Email not verified - triggering verification modal');
      }
      // Dispatch event for AuthContext to show OTP modal
      window.dispatchEvent(new Event('email-not-verified'));
    }

    return Promise.reject(error);
  }
);

export const authApi = {
  /**
   * Sign up a new user
   * Backend sets HTTP-only cookies automatically
   */
  async signUp(userData: SignUpData): Promise<AuthResponse> {
    try {
      console.log('📤 Sending sign-up request:', userData);
      const response = await api.post('/auth/signup', userData);
      console.log('📥 Sign-up response received:', response.data);

      // Backend sets cookies automatically - no localStorage needed
      console.log('✅ Authentication cookies set by server');

      return response.data;
    } catch (error: any) {
      console.error('❌ Sign-up API error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      throw error;
    }
  },

  /**
   * Sign in an existing user
   * Backend sets HTTP-only cookies automatically
   */
  async signIn(credentials: SignInData): Promise<AuthResponse> {
    const response = await api.post('/auth/login', credentials);

    // Backend sets cookies automatically - no localStorage needed
    console.log('✅ Authentication cookies set by server');

    return response.data;
  },

  /**
   * Sign out the current user
   * Just needs to call the server, which will clear the cookies
   */
  async signOut(): Promise<void> {
    // Server will clear the HTTP-only cookies
    // We just need to make the request
    try {
      await api.post('/auth/signout');
    } catch (error) {
      // Even if the server call fails, we consider the user logged out
      console.log('Sign out request failed, but treating as logged out');
    }
  },

  /**
   * Get the current authenticated user from cookies
   */
  getCurrentUser() {
    // Try to get user data from the userData cookie
    const userDataCookie = document.cookie
      .split('; ')
      .find(row => row.startsWith('userData='));

    if (userDataCookie) {
      try {
        const userData = JSON.parse(decodeURIComponent(userDataCookie.split('=')[1]));
        return userData;
      } catch (error) {
        console.error('Failed to parse user data from cookie:', error);
        return null;
      }
    }
    return null;
  },

  /**
   * Check if user is authenticated by checking for cookies
   */
  isAuthenticated() {
    // Check if we have the userData cookie
    return document.cookie.includes('userData=');
  },

  /**
   * Check if companion has submitted application
   */
  async checkCompanionApplication(): Promise<boolean> {
    try {
      console.log('📋 Checking companion application status...');
      const response = await api.get('/companion/application/status');
      console.log('✅ Application exists');
      return true;
    } catch (error: any) {
      // 404 means no application exists (this is expected for new companions)
      if (error.response?.status === 404) {
        console.log('📝 No application found (normal for new companions)');
        return false;
      }

      // Any other error - log it but return false
      console.log('⚠️ Error checking application:', {
        status: error.response?.status,
        message: error.response?.data?.message
      });
      return false;
    }
  },

  /**
   * Switch user's active role
   * Backend will update the cookies with new role
   */
  async switchRole(roleData: RoleSwitchData): Promise<AuthResponse> {
    const response = await api.post('/auth/switch-role', roleData);

    // Backend sets updated cookies automatically
    console.log('✅ Role switched, cookies updated by server');

    return response.data;
  },

  /**
   * Verify email with OTP code
   */
  async verifyOTP(otp: string): Promise<any> {
    const response = await api.post('/auth/verify-email', { otp });
    return response.data;
  },

  /**
   * Resend email verification OTP
   */
  async resendVerification(): Promise<any> {
    const response = await api.post('/auth/resend-verification');
    return response.data;
  },

  /**
   * @deprecated Use resendVerification instead
   */
  async resendVerificationEmail(): Promise<any> {
    return this.resendVerification();
  },

  /**
   * Get user profile from backend (refreshes cookies with latest data)
   */
  async getProfile(): Promise<any> {
    const response = await api.get('/auth/profile');
    return response.data;
  },
};

export default authApi;
