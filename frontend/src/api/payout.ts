/**
 * Payout API for Stripe Connect
 */

import axios from 'axios';
import { API_CONFIG } from '../constants';

// Configure axios instance with credentials support
const api = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  withCredentials: true, // Important for cookie-based auth
  headers: {
    'Content-Type': 'application/json',
  },
});

export const payoutApi = {
  /**
   * Create Stripe Connect onboarding link
   */
  async createPayoutSetup(): Promise<{ url: string }> {
    const response = await api.post('/companion/payout/setup');
    return response.data.data;
  },

  /**
   * Get payout account status
   */
  async getPayoutStatus(): Promise<{
    hasStripeAccount: boolean;
    accountStatus: 'not_created' | 'pending' | 'active' | 'rejected';
    detailsSubmitted: boolean;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
  }> {
    const response = await api.get('/companion/payout/status');
    return response.data.data;
  }
};

export default payoutApi;

