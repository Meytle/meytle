/**
 * Admin API Module
 * Handles all admin-related API calls for bookings, earnings, and user management
 */

import axios from 'axios';
import { API_CONFIG } from '../constants';

// Configure axios instance with credentials support
const api = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Types
export interface BookingFilters {
  status?: string;
  paymentStatus?: string;
  clientId?: number;
  companionId?: number;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface AdminBooking {
  id: number;
  bookingDate: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  totalAmount: number;
  platformFeeAmount: number;
  paymentStatus: string;
  paymentIntentId: string | null;
  status: string;
  otpVerifiedAt: string | null;
  createdAt: string;
  meetingLocation: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  adminResolved: boolean;
  adminResolutionType: string | null;
  clientId: number;
  clientName: string;
  clientEmail: string;
  companionId: number;
  companionName: string;
  companionEmail: string;
  serviceCategoryName: string | null;
}

export interface BookingStats {
  overview: {
    totalBookings: number;
    completed: number;
    confirmed: number;
    cancelled: number;
    pending: number;
    noShow: number;
    totalRevenue: number;
    totalPlatformFees: number;
    avgBookingValue: number;
  };
  monthlyTrend: Array<{
    month: string;
    count: number;
    revenue: number;
  }>;
}

export interface EarningsSummary {
  summary: {
    totalBookings: number;
    grossRevenue: number;
    platformCommission: number;
    companionPayouts: number;
    capturedRevenue: number;
    pendingCapture: number;
    refundedAmount: number;
  };
  monthlyTrend: Array<{
    month: string;
    grossRevenue: number;
    platformCommission: number;
    bookingCount: number;
  }>;
  topCompanions: Array<{
    id: number;
    name: string;
    email: string;
    bookingCount: number;
    totalEarnings: number;
    companionEarnings: number;
  }>;
}

export interface CompanionEarnings {
  id: number;
  name: string;
  email: string;
  stripeAccountId: string | null;
  stripeAccountStatus: string | null;
  totalBookings: number;
  completedBookings: number;
  grossEarnings: number;
  netEarnings: number;
  paidOut: number;
  pendingPayout: number;
}

export interface PaymentTransaction {
  bookingId: number;
  paymentIntentId: string;
  totalAmount: number;
  platformFeeAmount: number;
  paymentStatus: string;
  transferId: string | null;
  transferStatus: string | null;
  bookingDate: string;
  createdAt: string;
  cancelledAt: string | null;
  clientName: string;
  clientEmail: string;
  companionName: string;
  companionEmail: string;
}

export interface EnhancedUser {
  id: number;
  name: string;
  email: string;
  role: string;
  emailVerified: boolean;
  isBanned: boolean;
  banReason: string | null;
  createdAt: string;
  averageRating: number | null;
  reviewCount: number;
  stripeAccountStatus: string | null;
  totalBookings: number;
}

export interface BannedUser {
  id: number;
  name: string;
  email: string;
  role: string;
  banReason: string;
  bannedAt: string;
  banExpiresAt: string | null;
  bannedByName: string;
}

export interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore?: boolean;
}

// API Functions
export const adminApi = {
  // =====================================================
  // BOOKINGS MANAGEMENT
  // =====================================================

  /**
   * Get all bookings with optional filters
   */
  async getAllBookings(filters: BookingFilters = {}): Promise<{
    bookings: AdminBooking[];
    pagination: Pagination;
  }> {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.paymentStatus) params.append('paymentStatus', filters.paymentStatus);
    if (filters.clientId) params.append('clientId', String(filters.clientId));
    if (filters.companionId) params.append('companionId', String(filters.companionId));
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.limit) params.append('limit', String(filters.limit));
    if (filters.offset) params.append('offset', String(filters.offset));

    const response = await api.get(`/admin/bookings?${params.toString()}`);
    return response.data.data;
  },

  /**
   * Get booking statistics
   */
  async getBookingStats(): Promise<BookingStats> {
    const response = await api.get('/admin/bookings/stats');
    return response.data.data;
  },

  /**
   * Admin cancel a booking
   */
  async cancelBooking(bookingId: number, reason: string, refund: boolean = true): Promise<void> {
    await api.post(`/admin/bookings/${bookingId}/cancel`, { reason, refund });
  },

  // =====================================================
  // EARNINGS MANAGEMENT
  // =====================================================

  /**
   * Get earnings summary
   */
  async getEarningsSummary(startDate?: string, endDate?: string): Promise<EarningsSummary> {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const response = await api.get(`/admin/earnings/summary?${params.toString()}`);
    return response.data.data;
  },

  /**
   * Get earnings by companion
   */
  async getEarningsByCompanion(limit: number = 50, offset: number = 0): Promise<{
    companions: CompanionEarnings[];
    pagination: Pagination;
  }> {
    const response = await api.get(`/admin/earnings/by-companion?limit=${limit}&offset=${offset}`);
    return response.data.data;
  },

  /**
   * Get payment transactions
   */
  async getPaymentTransactions(filters: {
    status?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{
    transactions: PaymentTransaction[];
    pagination: Pagination;
  }> {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.limit) params.append('limit', String(filters.limit));
    if (filters.offset) params.append('offset', String(filters.offset));

    const response = await api.get(`/admin/earnings/transactions?${params.toString()}`);
    return response.data.data;
  },

  // =====================================================
  // USER MANAGEMENT
  // =====================================================

  /**
   * Get enhanced user list
   */
  async getUsersEnhanced(filters: {
    role?: string;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{
    users: EnhancedUser[];
    pagination: Pagination;
  }> {
    const params = new URLSearchParams();
    if (filters.role) params.append('role', filters.role);
    if (filters.status) params.append('status', filters.status);
    if (filters.search) params.append('search', filters.search);
    if (filters.limit) params.append('limit', String(filters.limit));
    if (filters.offset) params.append('offset', String(filters.offset));

    const response = await api.get(`/admin/users/enhanced?${params.toString()}`);
    return response.data.data;
  },

  /**
   * Get banned users
   */
  async getBannedUsers(): Promise<BannedUser[]> {
    const response = await api.get('/admin/users/banned');
    return response.data.data;
  },

  /**
   * Ban a user
   */
  async banUser(userId: number, reason: string, durationDays?: number): Promise<void> {
    await api.post(`/admin/users/${userId}/ban`, { reason, durationDays });
  },

  /**
   * Unban a user
   */
  async unbanUser(userId: number): Promise<void> {
    await api.post(`/admin/users/${userId}/unban`);
  },
};

export default adminApi;
