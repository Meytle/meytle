/**
 * Notification API Client
 * Handles notification-related API calls
 */

import axios from 'axios';
import { API_CONFIG } from '../constants';
import { transformKeysSnakeToCamel, transformKeysCamelToSnake } from '../types/transformers';

// Configure axios instance with credentials support
const api = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Always send cookies with requests
});

// Types
export interface Notification {
  id: number;
  userId: number;
  type: 'booking' | 'application' | 'payment' | 'account' | 'system';
  title: string;
  message: string;
  actionUrl?: string;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}

export interface NotificationPreferences {
  emailEnabled: boolean;
  pushEnabled: boolean;
  bookingNotifications: boolean;
  paymentNotifications: boolean;
  marketingNotifications: boolean;
}

export interface NotificationsResponse {
  status: string;
  data: {
    notifications: Notification[];
    count: number;
  };
}

export interface UnreadCountResponse {
  status: string;
  data: {
    unreadCount: number;
  };
}

export interface PreferencesResponse {
  status: string;
  data: {
    preferences: NotificationPreferences;
  };
}

// API Functions
const notificationApi = {
  /**
   * Get user notifications
   */
  getNotifications: async (limit: number = 20, offset: number = 0, unreadOnly: boolean = false) => {
    const response = await api.get('/notifications', {
      params: { limit, offset, unreadOnly }
    });
    return {
      status: response.data.status,
      data: {
        notifications: response.data.data.notifications, // Backend already transformed to camelCase
        count: response.data.data.count
      }
    };
  },

  /**
   * Get unread notification count
   */
  getUnreadCount: async () => {
    const response = await api.get('/notifications/unread-count');
    return response.data; // Backend already transformed to camelCase
  },

  /**
   * Mark notification as read
   */
  markAsRead: async (notificationId: number) => {
    const response = await api.put(`/notifications/${notificationId}/read`);
    return response.data; // Backend already transformed to camelCase
  },

  /**
   * Mark all notifications as read
   */
  markAllAsRead: async () => {
    const response = await api.put('/notifications/mark-all-read');
    return response.data; // Backend already transformed to camelCase
  },

  /**
   * Delete notification
   */
  deleteNotification: async (notificationId: number) => {
    const response = await api.delete(`/notifications/${notificationId}`);
    return response.data; // Backend already transformed to camelCase
  },

  /**
   * Get notification preferences
   */
  getPreferences: async () => {
    const response = await api.get('/notifications/preferences');
    return {
      status: response.data.status,
      data: {
        preferences: response.data.data.preferences // Backend already transformed to camelCase
      }
    };
  },

  /**
   * Update notification preferences
   */
  updatePreferences: async (preferences: Partial<NotificationPreferences>) => {
    const transformedPrefs = transformKeysCamelToSnake(preferences);
    const response = await api.put('/notifications/preferences', transformedPrefs);
    return response.data; // Backend already transformed to camelCase
  },

  /**
   * Create test notification (development only)
   */
  createTestNotification: async (title: string, message: string, type: string = 'system', actionUrl?: string) => {
    const transformedData = transformKeysCamelToSnake({ title, message, type, actionUrl });
    const response = await api.post('/notifications/test', transformedData);
    return response.data; // Backend already transformed to camelCase
  }
};

export default notificationApi;