/**
 * Messages API
 * Handles chat messaging between clients and companions
 */

import axios from 'axios';
import type { Message } from '../types';
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

// Response interceptor for automatic transformation
api.interceptors.response.use(
  (response) => {
    // Automatically transform snake_case to camelCase
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
    return Promise.reject(error);
  }
);

export const messagesApi = {
  /**
   * Send a message for a booking
   * Returns the created message for instant UI update
   */
  async sendMessage(bookingId: number, messageText: string): Promise<Message> {
    const response = await api.post('/messages/send', {
      bookingId,
      messageText
    });
    return response.data.data; // Backend returns message in 'data' field
  },

  /**
   * Get all messages for a booking
   * Backend returns messages in camelCase (transformed automatically)
   */
  async getMessages(bookingId: number): Promise<Message[]> {
    const response = await api.get(`/messages/${bookingId}`);
    return response.data.messages || [];
  },

  /**
   * Get unread message count for current user
   */
  async getUnreadCount(): Promise<number> {
    const response = await api.get('/messages/unread/count');
    return response.data.unreadCount || 0;
  }
};

export default messagesApi;

