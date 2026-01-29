/**
 * Companions API Module
 * Handles all companion-related API calls
 * Uses HTTP-only cookies for authentication
 */

import axios from 'axios';
import { API_CONFIG } from '../constants';
import type { Companion } from '../types';
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

// No request interceptor needed - cookies are sent automatically

export interface CompanionsResponse {
  status: string;
  data: Companion[];
}

export const companionsApi = {
  /**
   * Get all approved companions for browsing
   */
  async getCompanions(interests?: string[]): Promise<CompanionsResponse> {
    const params = interests ? { interests: interests.join(',') } : {};
    const response = await api.get('/companion/browse', { params });
    return {
      status: response.data.status,
      data: response.data.data // Backend already transformed to camelCase
    };
  },

  /**
   * Get single companion by ID
   */
  async getCompanionById(id: number): Promise<{ status: string; data: Companion }> {
    const response = await api.get(`/companion/${id}`);
    return {
      status: response.data.status,
      data: response.data.data // Backend already transformed to camelCase
    };
  },

  /**
   * Get companion interests
   */
  async getCompanionInterests(companionId: number): Promise<{ status: string; data: { interests: string[] } }> {
    const response = await api.get(`/companion/interests/${companionId}`);
    return response.data; // Backend already transformed to camelCase
  },

  /**
   * Update companion interests
   */
  async updateCompanionInterests(interests: string[]): Promise<{ status: string; message: string; data: { interests: string[] } }> {
    const response = await api.post('/companion/interests', { interests });
    return response.data; // Backend already transformed to camelCase
  },

  /**
   * Get companion's registered services
   */
  async getCompanionServices(): Promise<{ status: string; data: { services: string[] } }> {
    const response = await api.get('/companion/services');
    return response.data; // Backend already transformed to camelCase
  },

  /**
   * Get companion application status/profile
   */
  async getCompanionProfile(): Promise<{ status: string; data: any }> {
    // Add cache-busting parameter and headers to force fresh data
    const cacheBuster = `?_=${Date.now()}`;
    const response = await api.get(`/companion/application/status${cacheBuster}`, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    return response.data;
  },

  /**
   * Update companion profile (including address)
   */
  async updateCompanionProfile(profileData: any): Promise<{ status: string; message: string; data: any }> {
    const response = await api.put('/companion/profile', profileData);
    return response.data;
  },

  /**
   * Upload profile photo
   */
  async uploadProfilePhoto(file: File): Promise<{ status: string; message: string; data: any }> {
    const formData = new FormData();
    formData.append('photo', file);
    const response = await api.post('/companion/profile/profile-photo', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  /**
   * Upload additional photo 1
   */
  async uploadAdditionalPhoto1(file: File): Promise<{ status: string; message: string; data: any }> {
    const formData = new FormData();
    formData.append('photo', file);
    const response = await api.post('/companion/profile/additional-photo-1', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  /**
   * Upload additional photo 2
   */
  async uploadAdditionalPhoto2(file: File): Promise<{ status: string; message: string; data: any }> {
    const formData = new FormData();
    formData.append('photo', file);
    const response = await api.post('/companion/profile/additional-photo-2', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  /**
   * Start Veriff verification session
   */
  async startVeriffVerification(): Promise<{ status: string; message: string; data: { sessionId: string; sessionUrl: string } }> {
    const response = await api.post('/companion/verification/start-veriff');
    return response.data;
  },

  /**
   * Get verification status
   */
  async getVerificationStatus(): Promise<{ status: string; data: any }> {
    const response = await api.get('/companion/verification/status');
    return response.data;
  },
};

export default companionsApi;




