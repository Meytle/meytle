/**
 * Earnings Tab Component
 * Shows companion earnings, payment history, and upcoming payments
 */

import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import {
  FaMoneyBillWave,
  FaCalendarAlt,
  FaClock,
  FaCheckCircle,
  FaExclamationCircle,
  FaSpinner,
  FaExternalLinkAlt,
  FaFilter
} from 'react-icons/fa';
import { earningsApi, type EarningsSummary, type PaymentHistoryItem, type UpcomingPayment } from '../../api/earnings';
import { getImageUrl } from '../../utils/imageHelpers';
import { convertFromUTC, formatTime12Hour, getUserBrowserTimezone } from '../../utils/timeConverter';

const EarningsTab = () => {
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistoryItem[]>([]);
  const [upcomingPayments, setUpcomingPayments] = useState<UpcomingPayment[]>([]);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isLoadingUpcoming, setIsLoadingUpcoming] = useState(true);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'paid' | 'pending' | 'failed'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [userTimezone] = useState<string>(getUserBrowserTimezone());

  // Fetch earnings summary
  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setIsLoadingSummary(true);
        const data = await earningsApi.getSummary();
        setSummary(data);
      } catch (error: any) {
        console.error('Failed to fetch earnings summary:', error);
        toast.error(error.response?.data?.message || 'Failed to load earnings summary');
      } finally {
        setIsLoadingSummary(false);
      }
    };

    fetchSummary();
  }, []);

  // Fetch payment history
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setIsLoadingHistory(true);
        const data = await earningsApi.getHistory({ limit: 50, status: historyFilter });
        setPaymentHistory(data.payments);
      } catch (error: any) {
        console.error('Failed to fetch payment history:', error);
        toast.error(error.response?.data?.message || 'Failed to load payment history');
      } finally {
        setIsLoadingHistory(false);
      }
    };

    fetchHistory();
  }, [historyFilter]);

  // Fetch upcoming payments
  useEffect(() => {
    const fetchUpcoming = async () => {
      try {
        setIsLoadingUpcoming(true);
        const data = await earningsApi.getUpcoming();
        setUpcomingPayments(data.upcomingPayments);
      } catch (error: any) {
        console.error('Failed to fetch upcoming payments:', error);
        toast.error(error.response?.data?.message || 'Failed to load upcoming payments');
      } finally {
        setIsLoadingUpcoming(false);
      }
    };

    fetchUpcoming();
  }, []);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTime = (timeStr: string, date: string) => {
    // Convert from UTC to user's local timezone
    if (!timeStr || !timeStr.includes(':')) {
      return 'Time not available';
    }
    
    try {
      const localTime = convertFromUTC(timeStr, date, userTimezone);
      return formatTime12Hour(localTime);
    } catch (error) {
      console.error('Error formatting time:', error);
      return 'Time not available';
    }
  };

  const getPaymentStatusBadge = (status: string, releasedAt: string | null) => {
    if (status === 'paid' && releasedAt) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
          <FaCheckCircle /> Paid
        </span>
      );
    } else if (status === 'paid' && !releasedAt) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
          <FaClock /> Pending
        </span>
      );
    } else if (status === 'failed') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full">
          <FaExclamationCircle /> Failed
        </span>
      );
    }
    return null;
  };

  const [isSettingUp, setIsSettingUp] = useState(false);

  const openStripeExpressDashboard = () => {
    // Stripe Express Login - Redirects to companion's own dashboard
    // This is the correct URL for Express account holders to access their dashboard
    window.open('https://connect.stripe.com/express_login', '_blank');
    toast.success('Redirecting to Stripe login...');
  };

  const handleSetupPayout = async () => {
    setIsSettingUp(true);
    try {
      const { payoutApi } = await import('../../api/payout');
      const { url } = await payoutApi.createPayoutSetup();
      // Redirect to Stripe Connect onboarding
      window.location.href = url;
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to start payout setup');
      setIsSettingUp(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Earnings Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Earnings */}
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg shadow-sm p-6 border border-green-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-green-800">Total Earnings</h3>
            <FaMoneyBillWave className="text-green-600 text-xl" />
          </div>
          {isLoadingSummary ? (
            <div className="flex items-center gap-2">
              <FaSpinner className="animate-spin text-green-600" />
              <span className="text-sm text-green-600">Loading...</span>
            </div>
          ) : (
            <>
              <p className="text-3xl font-bold text-green-900">${summary?.totalEarnings || '0.00'}</p>
              <p className="text-sm text-green-700 mt-1">{summary?.totalBookings || 0} completed bookings</p>
            </>
          )}
        </div>

        {/* This Month */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg shadow-sm p-6 border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-blue-800">This Month</h3>
            <FaCalendarAlt className="text-blue-600 text-xl" />
          </div>
          {isLoadingSummary ? (
            <div className="flex items-center gap-2">
              <FaSpinner className="animate-spin text-blue-600" />
              <span className="text-sm text-blue-600">Loading...</span>
            </div>
          ) : (
            <>
              <p className="text-3xl font-bold text-blue-900">${summary?.monthEarnings || '0.00'}</p>
              <p className="text-sm text-blue-700 mt-1">{summary?.monthBookings || 0} bookings</p>
            </>
          )}
        </div>

        {/* Pending Earnings */}
        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg shadow-sm p-6 border border-yellow-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-yellow-800">Pending</h3>
            <FaClock className="text-yellow-600 text-xl" />
          </div>
          {isLoadingSummary ? (
            <div className="flex items-center gap-2">
              <FaSpinner className="animate-spin text-yellow-600" />
              <span className="text-sm text-yellow-600">Loading...</span>
            </div>
          ) : (
            <>
              <p className="text-3xl font-bold text-yellow-900">${summary?.pendingEarnings || '0.00'}</p>
              <p className="text-sm text-yellow-700 mt-1">{summary?.pendingBookings || 0} bookings in progress</p>
            </>
          )}
        </div>
      </div>

      {/* Payout Account Status */}
      {!isLoadingSummary && summary && (
        <div className={`rounded-lg shadow-sm p-6 border ${
          summary.payoutAccountActive
            ? 'bg-green-50 border-green-200'
            : 'bg-yellow-50 border-yellow-200'
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                {summary.payoutAccountActive ? (
                  <>
                    <FaCheckCircle className="text-green-600" />
                    <span className="text-green-900">Payout Account Active</span>
                  </>
                ) : summary.hasPayoutAccount ? (
                  <>
                    <FaClock className="text-yellow-600" />
                    <span className="text-yellow-900">Payout Account Pending</span>
                  </>
                ) : (
                  <>
                    <FaExclamationCircle className="text-red-600" />
                    <span className="text-red-900">Payout Account Not Set Up</span>
                  </>
                )}
              </h3>
              <p className={`text-sm ${
                summary.payoutAccountActive ? 'text-green-700' : 'text-yellow-700'
              }`}>
                {summary.payoutAccountActive
                  ? 'Your earnings are automatically transferred to your connected bank account after each completed booking.'
                  : summary.hasPayoutAccount
                  ? 'Your payout account is being verified. This usually takes 1-2 business days.'
                  : 'Please set up your payout account to receive earnings.'}
              </p>
            </div>
            {/* Show different button based on account status */}
            {!summary.hasPayoutAccount ? (
              <button
                onClick={handleSetupPayout}
                disabled={isSettingUp}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSettingUp ? 'Starting...' : 'Setup Payout Now'}
              </button>
            ) : (
              <button
                onClick={openStripeExpressDashboard}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                <FaExternalLinkAlt />
                Stripe Dashboard
              </button>
            )}
          </div>
        </div>
      )}

      {/* Upcoming Payments */}
      {upcomingPayments.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Upcoming Payments</h3>
            <p className="text-sm text-gray-600 mt-1">Payments from confirmed bookings</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date & Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">You'll Earn</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoadingUpcoming ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                      <FaSpinner className="animate-spin inline-block mr-2" />
                      Loading upcoming payments...
                    </td>
                  </tr>
                ) : (
                  upcomingPayments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{formatDate(payment.bookingDate)}</div>
                        <div className="text-sm text-gray-500">{formatTime(payment.startTime, payment.bookingDate)} - {formatTime(payment.endTime, payment.bookingDate)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="h-10 w-10 flex-shrink-0">
                            <img
                              className="h-10 w-10 rounded-full object-cover"
                              src={payment.clientPhoto ? getImageUrl(payment.clientPhoto) : '/default-avatar.png'}
                              alt={payment.clientName}
                            />
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{payment.clientName}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{payment.serviceCategoryName || payment.serviceType || 'General'}</div>
                        <div className="text-sm text-gray-500">{payment.meetingLocation || payment.meetingType}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-semibold text-green-600">${payment.companionEarnings}</div>
                        <div className="text-xs text-gray-500">from ${payment.totalAmount}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                          {payment.status === 'confirmed' ? 'Confirmed' : 'Pending'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payment History */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Payment History</h3>
            <p className="text-sm text-gray-600 mt-1">Your recent payments and earnings</p>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm font-medium"
            >
              <FaFilter />
              Filter: {historyFilter === 'all' ? 'All' : historyFilter.charAt(0).toUpperCase() + historyFilter.slice(1)}
            </button>
            {showFilters && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                {['all', 'paid', 'pending', 'failed'].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => {
                      setHistoryFilter(filter as any);
                      setShowFilters(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${
                      historyFilter === filter ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                    }`}
                  >
                    {filter === 'all' ? 'All Payments' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Fee</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">You Earned</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoadingHistory ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    <FaSpinner className="animate-spin inline-block mr-2" />
                    Loading payment history...
                  </td>
                </tr>
              ) : paymentHistory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    No payment history found
                  </td>
                </tr>
              ) : (
                paymentHistory.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{formatDate(payment.bookingDate)}</div>
                      <div className="text-sm text-gray-500">{formatTime(payment.startTime, payment.bookingDate)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-8 w-8 flex-shrink-0">
                          <img
                            className="h-8 w-8 rounded-full object-cover"
                            src={payment.clientPhoto ? getImageUrl(payment.clientPhoto) : '/default-avatar.png'}
                            alt={payment.clientName}
                          />
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900">{payment.clientName}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{payment.serviceCategoryName || payment.serviceType || 'General'}</div>
                      <div className="text-xs text-gray-500">{payment.durationHours}h</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      ${payment.totalAmount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">
                      -${payment.platformFeeAmount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-green-600">
                      ${payment.companionEarnings}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {getPaymentStatusBadge(payment.paymentStatus, payment.paymentReleasedAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default EarningsTab;

