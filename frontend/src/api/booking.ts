/**
 * Booking API Module
 * Handles all booking-related API calls
 * Uses HTTP-only cookies for authentication
 */

import axios from 'axios';
import type { Booking, AvailabilitySlot, TimeSlot, BookingFormData, CreateBookingResponse, GetBookingsResponse } from '../types';
import { API_CONFIG } from '../constants';
import { transformKeysCamelToSnake } from '../types/transformers';

// Configure axios instance with credentials support
const api = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Always send cookies with requests
});

// Add request interceptor for debugging (only in development)
if (import.meta.env.DEV) {
  api.interceptors.request.use(
    (config) => {
      console.log('📤 Booking API Request:', {
        url: config.url,
        method: config.method,
        withCredentials: config.withCredentials
      });
      return config;
    },
    (error) => {
      console.error('❌ Booking API Request Error:', error);
      return Promise.reject(error);
    }
  );

  // Add response interceptor for debugging
  api.interceptors.response.use(
    (response) => {
      console.log('📥 Booking API Response:', {
        url: response.config.url,
        status: response.status,
        data: response.data
      });
      return response;
    },
    (error) => {
      console.error('❌ Booking API Response Error:', {
        url: error.config?.url,
        status: error.response?.status,
        message: error.response?.data?.message
      });
      return Promise.reject(error);
    }
  );
}

export const bookingApi = {
  /**
   * Create a new booking (OLD - will be deprecated)
   */
  async createBooking(bookingData: BookingFormData): Promise<CreateBookingResponse> {
    const transformedData = transformKeysCamelToSnake(bookingData);
    const response = await api.post('/booking/create', transformedData);
    return response.data.data; // Backend already transformed to camelCase
  },

  /**
   * NEW FLOW - Step 1: Create payment intent (no booking in DB yet)
   * NOTE: This endpoint expects camelCase (no transformation needed)
   */
  async createPaymentIntent(bookingData: BookingFormData): Promise<{
    clientSecret: string;
    paymentIntentId: string;
    totalAmount: number;
    durationHours: number;
  }> {
    // Don't transform - backend createPaymentIntent expects camelCase
    const response = await api.post('/booking/create-payment-intent', bookingData);
    return response.data.data;
  },

  /**
   * NEW FLOW - Step 2: Create booking after payment authorization
   * NOTE: This endpoint expects camelCase (no transformation needed)
   */
  async createBookingWithPayment(bookingData: BookingFormData & { paymentIntentId: string }): Promise<{
    bookingId: number;
    status: string;
    paymentStatus: string;
    message: string;
  }> {
    // Don't transform - backend createBookingWithPayment expects camelCase
    const response = await api.post('/booking/create-with-payment', bookingData);
    return response.data.data;
  },

  /**
   * Get user's bookings
   */
  async getBookings(params?: { status?: string; limit?: number; offset?: number }): Promise<Booking[] | GetBookingsResponse> {
    const response = await api.get('/booking/my-bookings', { params });
    return response.data.data; // Backend already transformed to camelCase
  },

  /**
   * Get a single booking by ID
   */
  async getBookingById(bookingId: number): Promise<Booking> {
    const response = await api.get(`/booking/${bookingId}`);
    return response.data.data; // Backend already transformed to camelCase
  },

  /**
   * Update booking status
   */
  async updateBookingStatus(bookingId: number, status: string): Promise<void> {
    await api.put(`/booking/${bookingId}/status`, { status });
  },

  // Payment status update removed - will be implemented later

  /**
   * Get companion availability
   */
  async getCompanionAvailability(companionId: number, date?: string): Promise<AvailabilitySlot[]> {
    const params = date ? { date } : {};
    const response = await api.get(`/booking/availability/${companionId}`, { params });
    return response.data.data; // Backend already transformed to camelCase
  },

  /**
   * Set companion availability
   */
  async setCompanionAvailability(availability: AvailabilitySlot[], companionTimezone?: string): Promise<void> {
    const transformedAvailability = transformKeysCamelToSnake(availability);
    // Get timezone from browser if not provided
    const timezone = companionTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    await api.post('/booking/availability', { 
      availability: transformedAvailability,
      companionTimezone: timezone
    });
  },

  /**
   * Get available time slots for a companion on a specific date
   */
  async getAvailableTimeSlots(companionId: number, date: string): Promise<{ date: string; availableSlots: TimeSlot[] }> {
    const response = await api.get(`/booking/availability/${companionId}/slots`, {
      params: { date }
    });
    return response.data.data; // Backend already transformed to camelCase
  },

  /**
   * Get companion bookings by date range
   */
  async getCompanionBookingsByDateRange(companionId: number, startDate: string, endDate: string): Promise<Array<{ id: number; bookingDate: string; startTime: string; endTime: string; status: string }>> {
    const response = await api.get(`/booking/bookings/${companionId}/date-range`, {
      params: { startDate, endDate }
    });
    return response.data.data; // Backend already transformed to camelCase
  },

  /**
   * Submit a review for a booking
   */
  async createReview(bookingId: number, review: { rating: number; comment: string }): Promise<void> {
    await api.post(`/booking/${bookingId}/review`, review);
  },

  /**
   * Get reviews for a companion
   */
  async getCompanionReviews(companionId: number, page: number = 1, limit: number = 10): Promise<{
    reviews: Array<{
      id: number;
      rating: number;
      reviewText: string;
      createdAt: string;
      reviewerName: string;
      reviewerPhoto?: string;
      bookingDate: string;
      serviceId?: number;
    }>;
    stats: {
      total: number;
      distribution: {
        1: number;
        2: number;
        3: number;
        4: number;
        5: number;
      };
    };
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
  }> {
    const response = await api.get(`/booking/companion/${companionId}/reviews`, {
      params: { page, limit }
    });
    return response.data.data; // Backend already transformed to camelCase
  },

  /**
   * Check if a booking has been reviewed
   */
  async getBookingReview(bookingId: number): Promise<{
    hasReviewed: boolean;
    review?: {
      id: number;
      rating: number;
      reviewText: string;
      createdAt: string;
    };
  }> {
    try {
      const response = await api.get(`/booking/${bookingId}/review`);
      return response.data.data; // Backend already transformed to camelCase
    } catch (error: any) {
      if (error.response?.status === 404) {
        return { hasReviewed: false };
      }
      throw error;
    }
  },

  /**
   * Get companion's weekly availability pattern
   * Returns the regular weekly schedule for a companion
   */
  async getCompanionWeeklyAvailability(companionId: number): Promise<{
    weeklyPattern: {
      monday: Array<{ startTime: string; endTime: string; services: string[] }>;
      tuesday: Array<{ startTime: string; endTime: string; services: string[] }>;
      wednesday: Array<{ startTime: string; endTime: string; services: string[] }>;
      thursday: Array<{ startTime: string; endTime: string; services: string[] }>;
      friday: Array<{ startTime: string; endTime: string; services: string[] }>;
      saturday: Array<{ startTime: string; endTime: string; services: string[] }>;
      sunday: Array<{ startTime: string; endTime: string; services: string[] }>;
    };
    summary: {
      totalSlotsPerWeek: number;
      daysAvailable: number;
      availableDays: string[];
    };
  }> {
    const response = await api.get(`/booking/availability/${companionId}/weekly`);
    return response.data; // Backend already transformed to camelCase
  },

  /**
   * Get companion's availability for a date range
   * Returns available dates and their time slots for calendar display
   */
  async getCompanionAvailabilityForDateRange(companionId: number, startDate: string, endDate: string): Promise<{
    availabilityCalendar: {
      [date: string]: {
        dayOfWeek: string;
        totalSlots: number;
        availableSlots: number;
        bookedSlots: number;
        isAvailable: boolean;
        slots: Array<{ startTime: string; endTime: string; services: string[] }>;
      };
    };
  }> {
    const response = await api.get(`/booking/availability/${companionId}/calendar`, {
      params: { startDate, endDate }
    });
    return response.data; // Backend already transformed to camelCase
  },

  /**
   * Create a booking request when no time slots are available
   * Returns payment details for authorization
   */
  async createBookingRequest(requestData: {
    companionId: number;
    requestedDate: string;
    preferredTime?: string;
    startTime?: string;
    endTime?: string;
    durationHours?: number;
    serviceCategoryId?: number;
    serviceType?: string;
    extraAmount?: number;
    meetingType?: 'in_person' | 'virtual';
    specialRequests?: string;
    meetingLocation?: string;
    meetingLocationLat?: number;
    meetingLocationLon?: number;
    meetingLocationPlaceId?: number;
  }): Promise<{
    requestId: number;
    totalAmount: number;
    durationHours: number;
    clientSecret?: string;
    requiresPayment?: boolean;
  }> {
    console.log('API createBookingRequest called with:', requestData);
    const transformedData = transformKeysCamelToSnake(requestData);
    const response = await api.post('/booking/requests/create', transformedData);
    console.log('API response:', response.data);
    return response.data.data || response.data; // Backend already transformed to camelCase
  },

  /**
   * NEW FLOW - Step 1: Create payment intent for request (no request in DB yet)
   * NOTE: Backend expects camelCase (no transformation needed)
   */
  async createRequestPaymentIntent(requestData: {
    companionId: number;
    requestedDate: string;
    startTime: string;
    endTime: string;
    durationHours: number;
    serviceType?: string;
    extraAmount?: number;
    clientTimezone?: string;
  }): Promise<{
    clientSecret: string;
    paymentIntentId: string;
    totalAmount: number;
    durationHours: number;
  }> {
    // Don't transform - backend expects camelCase for new endpoints
    const response = await api.post('/booking/requests/create-payment-intent', requestData);
    return response.data.data;
  },

  /**
   * NEW FLOW - Step 2: Create request after payment authorization
   * NOTE: Backend expects camelCase (no transformation needed)
   */
  async createRequestWithPayment(requestData: {
    paymentIntentId: string;
    companionId: number;
    requestedDate: string;
    preferredTime?: string;
    startTime?: string;
    endTime?: string;
    durationHours?: number;
    serviceCategoryId?: number;
    serviceType?: string;
    extraAmount?: number;
    meetingType?: 'in_person' | 'virtual';
    specialRequests?: string;
    meetingLocation?: string;
    meetingLocationLat?: number;
    meetingLocationLon?: number;
    meetingLocationPlaceId?: number;
  }): Promise<{
    requestId: number;
    totalAmount: number;
    durationHours: number;
    status: string;
    paymentStatus: string;
    expiresAt: string;
    message: string;
  }> {
    // Don't transform - backend expects camelCase for new endpoints
    const response = await api.post('/booking/requests/create-with-payment', requestData);
    return response.data.data;
  },

  /**
   * Get booking requests for a user
   */
  async getBookingRequests(params?: {
    role?: 'client' | 'companion';
    status?: 'pending' | 'accepted' | 'rejected' | 'expired'
  }): Promise<{
    requests: Array<{
    id: number;
    clientId: number;
    companionId: number;
    requestedDate: string;
    preferredTime?: string;
    durationHours: number;
    serviceCategoryId?: number;
    meetingType: 'in_person' | 'virtual';
    specialRequests?: string;
    meetingLocation?: string;
    status: 'pending' | 'accepted' | 'rejected' | 'expired';
    companionResponse?: string;
    suggestedDate?: string;
    suggestedStartTime?: string;
    suggestedEndTime?: string;
    expiresAt?: string;
    createdAt: string;
    updatedAt: string;
    respondedAt?: string;
    clientName?: string;
    clientEmail?: string;
    clientPhoto?: string;
    companionName?: string;
    companionEmail?: string;
    companionPhoto?: string;
    serviceCategoryName?: string;
    servicePrice?: number;
      startTime?: string;
      endTime?: string;
      tipAmount?: number;
    }>;
    userTimezone?: string;
  }> {
    const response = await api.get('/booking/requests', { params });
    // Backend returns { status, data: { requests, userTimezone } }
    return response.data.data || { requests: [], userTimezone: 'UTC' };
  },

  /**
   * Get a single booking request by ID
   */
  async getBookingRequestById(requestId: number): Promise<{
    id: number;
    clientId: number;
    companionId: number;
    requestedDate: string;
    preferredTime?: string;
    durationHours: number;
    status: string;
    companionResponse?: string;
    suggestedDate?: string;
    suggestedStartTime?: string;
    suggestedEndTime?: string;
    clientName: string;
    companionName: string;
  }> {
    const response = await api.get(`/booking/requests/${requestId}`);
    return response.data.data.request; // Backend wraps in { status, data: { request } }
  },

  /**
   * Update booking request status (for companions)
   */
  async updateBookingRequestStatus(requestId: number, data: {
    status: 'accepted' | 'rejected';
    companionResponse?: string;
    suggestedDate?: string;
    suggestedStartTime?: string;
    suggestedEndTime?: string;
  }): Promise<void> {
    const transformedData = transformKeysCamelToSnake(data);
    await api.put(`/booking/requests/${requestId}/status`, transformedData);
  },

  /**
   * Get pending bookings for companion approval
   */
  async getPendingBookingsForCompanion(): Promise<{
    pendingBookings: Booking[];
    pendingCount: number;
    userTimezone?: string;
  }> {
    const response = await api.get('/booking/companion/pending');
    // Backend returns { status, data: { pendingBookings, pendingCount, userTimezone } }
    return response.data.data;
  },

  /**
   * Approve a booking (companion only)
   */
  async approveBooking(bookingId: number): Promise<void> {
    await api.put(`/booking/companion/approve/${bookingId}`);
  },

  /**
   * Reject/Cancel a booking request with reason (companion only)
   */
  async rejectBooking(bookingId: number, cancellationReason?: string): Promise<void> {
    await api.put(`/booking/companion/reject/${bookingId}`, {
      cancellationReason: cancellationReason || 'No reason provided'
    });
  },

  /**
   * Cancel a booking with reason
   */
  async cancelBooking(bookingId: number, cancellationReason: string): Promise<void> {
    await api.put(`/booking/${bookingId}/status`, {
      status: 'cancelled',
      cancellationReason
    });
  },

  /**
   * Cancel a booking request with reason
   */
  async cancelBookingRequest(requestId: number, cancellationReason: string): Promise<void> {
    await api.put(`/booking/requests/${requestId}/cancel`, {
      cancellationReason
    });
  },

  /**
   * Get pending reviews for the current user
   * Returns bookings that need to be reviewed
   */
  async getPendingReviews(): Promise<{
    pendingReviews: Array<{
      id: number;
      bookingDate: string;
      startTime: string;
      endTime: string;
      totalAmount: number;
      clientId: number;
      companionId: number;
      clientName: string;
      companionName: string;
      companionPhoto?: string;
      clientPhoto?: string;
      serviceCategoryName?: string;
      otherPartyName: string;
      otherPartyPhoto?: string;
    }>;
  }> {
    const response = await api.get('/booking/pending-reviews');
    return response.data.data; // Backend already transformed to camelCase
  },

  /**
   * Check if current user has pending reviews
   * Returns blocking status for new bookings/acceptances
   */
  async hasPendingReviews(): Promise<{
    hasPendingReviews: boolean;
    pendingCount: number;
  }> {
    const response = await api.get('/booking/reviews/has-pending');
    return response.data.data; // Backend already transformed to camelCase
  },

  /**
   * Confirm booking payment after Stripe authorization
   * This finalizes the booking and sends notification to companion
   */
  async confirmBookingPayment(bookingId: number): Promise<{
    message: string;
    bookingId: number;
    status: string;
  }> {
    const response = await api.post(`/booking/${bookingId}/confirm-payment`);
    return response.data.data;
  },

  /**
   * Cancel booking if payment is not completed
   * This removes the booking request before companion sees it
   */
  async cancelBookingPayment(bookingId: number): Promise<{
    message: string;
    bookingId: number;
  }> {
    const response = await api.post(`/booking/${bookingId}/cancel-payment`);
    return response.data.data;
  },

  /**
   * Confirm booking request payment after Stripe authorization
   * This sends notification to companion after payment is authorized
   */
  async confirmBookingRequestPayment(requestId: number): Promise<{
    message: string;
    requestId: number;
    companionName: string;
    requestedDate: string;
  }> {
    const response = await api.post(`/booking/requests/${requestId}/confirm-payment`);
    return response.data.data;
  },

  /**
   * Cancel booking request if payment is not completed
   * This removes the request before companion sees it
   */
  async cancelBookingRequestPayment(requestId: number): Promise<{
    message: string;
    requestId: number;
  }> {
    const response = await api.delete(`/booking/requests/${requestId}`);
    return response.data.data;
  }
};

export default bookingApi;

