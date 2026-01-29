/**
 * Earnings API
 * API calls for companion earnings, payment history, and financial data
 */

import axios from 'axios';
import { API_CONFIG } from '../constants';

const api = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface EarningsSummary {
  totalEarnings: string;
  totalBookings: number;
  monthEarnings: string;
  monthBookings: number;
  monthFees: string;
  pendingEarnings: string;
  pendingBookings: number;
  hasPayoutAccount: boolean;
  payoutAccountActive: boolean;
}

export interface PaymentHistoryItem {
  id: number;
  bookingDate: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  totalAmount: string;
  platformFeeAmount: string;
  companionEarnings: string;
  paymentStatus: 'paid' | 'pending' | 'failed';
  paidAt: string | null;
  paymentReleasedAt: string | null;
  transferId: string | null;
  bookingStatus: string;
  serviceType: string | null;
  meetingLocation: string | null;
  clientName: string;
  clientEmail: string;
  clientPhoto: string | null;
  serviceCategoryName: string | null;
}

export interface UpcomingPayment {
  id: number;
  bookingDate: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  totalAmount: string;
  companionEarnings: string;
  platformFee: string;
  status: string;
  paymentStatus: string;
  serviceType: string | null;
  meetingLocation: string | null;
  meetingType: string;
  clientName: string;
  clientEmail: string;
  clientPhoto: string | null;
  serviceCategoryName: string | null;
}

export interface EarningsChartData {
  month: string;
  earnings: string;
  bookingsCount: number;
}

export const earningsApi = {
  /**
   * Get earnings summary
   */
  async getSummary(): Promise<EarningsSummary> {
    const response = await api.get('/earnings/summary');
    return response.data.data;
  },

  /**
   * Get payment history with pagination
   */
  async getHistory(params?: {
    limit?: number;
    offset?: number;
    status?: 'all' | 'paid' | 'pending' | 'failed';
  }): Promise<{
    payments: PaymentHistoryItem[];
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  }> {
    const response = await api.get('/earnings/history', { params });
    return response.data.data;
  },

  /**
   * Get upcoming payments
   */
  async getUpcoming(): Promise<{ upcomingPayments: UpcomingPayment[] }> {
    const response = await api.get('/earnings/upcoming');
    return response.data.data;
  },

  /**
   * Get earnings chart data
   */
  async getChartData(): Promise<{ chartData: EarningsChartData[] }> {
    const response = await api.get('/earnings/chart');
    return response.data.data;
  },
};

export default earningsApi;

