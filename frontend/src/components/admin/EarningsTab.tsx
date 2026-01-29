/**
 * Admin Earnings Tab Component
 * Displays earnings summary, companion earnings, and payment transactions
 */

import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import {
  FaDollarSign,
  FaChartLine,
  FaUsers,
  FaExchangeAlt,
  FaChevronLeft,
  FaChevronRight
} from 'react-icons/fa';
import { adminApi, type EarningsSummary, type CompanionEarnings, type PaymentTransaction } from '../../api/admin';

type SubTab = 'overview' | 'companions' | 'transactions';

const EarningsTab = () => {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('overview');
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [companionEarnings, setCompanionEarnings] = useState<CompanionEarnings[]>([]);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Pagination for companions
  const [companionPagination, setCompanionPagination] = useState({
    total: 0,
    limit: 20,
    offset: 0
  });

  // Pagination for transactions
  const [transactionPagination, setTransactionPagination] = useState({
    total: 0,
    limit: 20,
    offset: 0
  });

  // Transaction filters
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');

  useEffect(() => {
    fetchSummary();
  }, []);

  useEffect(() => {
    if (activeSubTab === 'companions') {
      fetchCompanionEarnings();
    } else if (activeSubTab === 'transactions') {
      fetchTransactions();
    }
  }, [activeSubTab, companionPagination.offset, transactionPagination.offset, paymentStatusFilter]);

  const fetchSummary = async () => {
    try {
      setIsLoading(true);
      const data = await adminApi.getEarningsSummary();
      setSummary(data);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to load earnings summary');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCompanionEarnings = async () => {
    try {
      setIsLoading(true);
      const data = await adminApi.getEarningsByCompanion(
        companionPagination.limit,
        companionPagination.offset
      );
      setCompanionEarnings(data.companions);
      setCompanionPagination(prev => ({ ...prev, total: data.pagination.total }));
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to load companion earnings');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTransactions = async () => {
    try {
      setIsLoading(true);
      const data = await adminApi.getPaymentTransactions({
        status: paymentStatusFilter || undefined,
        limit: transactionPagination.limit,
        offset: transactionPagination.offset
      });
      setTransactions(data.transactions);
      setTransactionPagination(prev => ({ ...prev, total: data.pagination.total }));
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to load transactions');
    } finally {
      setIsLoading(false);
    }
  };

  const getPaymentStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800';
      case 'authorized': return 'bg-blue-100 text-blue-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'refunded': return 'bg-purple-100 text-purple-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading && !summary) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-[#312E81]"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Earnings Report</h1>
      <p className="text-gray-600 mb-8">View platform earnings, companion payouts, and transactions</p>

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveSubTab('overview')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeSubTab === 'overview'
              ? 'bg-[#312E81] text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <FaChartLine className="inline mr-2" />
          Overview
        </button>
        <button
          onClick={() => setActiveSubTab('companions')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeSubTab === 'companions'
              ? 'bg-[#312E81] text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <FaUsers className="inline mr-2" />
          Companion Earnings
        </button>
        <button
          onClick={() => setActiveSubTab('transactions')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeSubTab === 'transactions'
              ? 'bg-[#312E81] text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <FaExchangeAlt className="inline mr-2" />
          Transactions
        </button>
      </div>

      {/* Overview Tab */}
      {activeSubTab === 'overview' && summary && (
        <div>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-gray-500 text-sm">Gross Revenue</p>
                <FaDollarSign className="text-[#312E81] text-xl" />
              </div>
              <p className="text-3xl font-bold text-gray-900">
                ${(summary.summary.grossRevenue || 0).toFixed(2)}
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-gray-500 text-sm">Platform Commission</p>
                <FaChartLine className="text-green-600 text-xl" />
              </div>
              <p className="text-3xl font-bold text-green-600">
                ${(summary.summary.platformCommission || 0).toFixed(2)}
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-gray-500 text-sm">Companion Payouts</p>
                <FaUsers className="text-blue-600 text-xl" />
              </div>
              <p className="text-3xl font-bold text-blue-600">
                ${(summary.summary.companionPayouts || 0).toFixed(2)}
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-gray-500 text-sm">Total Bookings</p>
                <FaExchangeAlt className="text-purple-600 text-xl" />
              </div>
              <p className="text-3xl font-bold text-purple-600">
                {summary.summary.totalBookings || 0}
              </p>
            </div>
          </div>

          {/* Secondary Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <p className="text-gray-500 text-sm">Captured Revenue</p>
              <p className="text-xl font-bold text-green-600">
                ${(summary.summary.capturedRevenue || 0).toFixed(2)}
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <p className="text-gray-500 text-sm">Pending Capture</p>
              <p className="text-xl font-bold text-yellow-600">
                ${(summary.summary.pendingCapture || 0).toFixed(2)}
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
              <p className="text-gray-500 text-sm">Refunded Amount</p>
              <p className="text-xl font-bold text-red-600">
                ${(summary.summary.refundedAmount || 0).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Monthly Trend */}
          {summary.monthlyTrend && summary.monthlyTrend.length > 0 && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Revenue Trend</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Bookings</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Gross Revenue</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Platform Commission</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {summary.monthlyTrend.map((month) => (
                      <tr key={month.month}>
                        <td className="px-4 py-3 text-sm text-gray-900">{month.month}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{month.bookingCount}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                          ${(month.grossRevenue || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm text-green-600 font-medium">
                          ${(month.platformCommission || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Top Companions */}
          {summary.topCompanions && summary.topCompanions.length > 0 && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Earning Companions</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Companion</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Bookings</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total Earnings</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Net Earnings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {summary.topCompanions.map((companion) => (
                      <tr key={companion.id}>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900">{companion.name}</div>
                          <div className="text-xs text-gray-500">{companion.email}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{companion.bookingCount}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                          ${(companion.totalEarnings || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm text-green-600 font-medium">
                          ${(companion.companionEarnings || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Companions Tab */}
      {activeSubTab === 'companions' && (
        <div>
          {companionEarnings.length === 0 ? (
            <div className="bg-white p-12 rounded-xl shadow-sm text-center">
              <FaUsers className="text-gray-300 text-6xl mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Companion Earnings</h3>
              <p className="text-gray-600">No companions have earned yet</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Companion</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bookings</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Completed</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gross</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Net</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Paid Out</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pending</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stripe</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {companionEarnings.map((companion) => (
                        <tr key={companion.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-gray-900">{companion.name}</div>
                            <div className="text-xs text-gray-500">{companion.email}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{companion.totalBookings || 0}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{companion.completedBookings || 0}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                            ${(companion.grossEarnings || 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-sm text-green-600 font-medium">
                            ${(companion.netEarnings || 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-sm text-blue-600 font-medium">
                            ${(companion.paidOut || 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-sm text-yellow-600 font-medium">
                            ${(companion.pendingPayout || 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              companion.stripeAccountStatus === 'active'
                                ? 'bg-green-100 text-green-800'
                                : companion.stripeAccountId
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {companion.stripeAccountStatus || (companion.stripeAccountId ? 'Pending' : 'Not Set')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <p className="text-sm text-gray-600">
                  Showing {companionPagination.offset + 1} to {Math.min(companionPagination.offset + companionPagination.limit, companionPagination.total)} of {companionPagination.total}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCompanionPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
                    disabled={companionPagination.offset === 0}
                    className="px-3 py-1 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    <FaChevronLeft />
                  </button>
                  <button
                    onClick={() => setCompanionPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
                    disabled={companionPagination.offset + companionPagination.limit >= companionPagination.total}
                    className="px-3 py-1 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    <FaChevronRight />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Transactions Tab */}
      {activeSubTab === 'transactions' && (
        <div>
          {/* Filter */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
            <select
              value={paymentStatusFilter}
              onChange={(e) => {
                setPaymentStatusFilter(e.target.value);
                setTransactionPagination(prev => ({ ...prev, offset: 0 }));
              }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#312E81] focus:border-transparent"
            >
              <option value="">All Payment Statuses</option>
              <option value="pending">Pending</option>
              <option value="authorized">Authorized</option>
              <option value="paid">Paid</option>
              <option value="refunded">Refunded</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          {transactions.length === 0 ? (
            <div className="bg-white p-12 rounded-xl shadow-sm text-center">
              <FaExchangeAlt className="text-gray-300 text-6xl mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Transactions</h3>
              <p className="text-gray-600">No payment transactions found</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Booking</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Companion</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fee</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transfer</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {transactions.map((tx) => (
                        <tr key={tx.bookingId} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">#{tx.bookingId}</td>
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-gray-900">{tx.clientName}</div>
                            <div className="text-xs text-gray-500">{tx.clientEmail}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-gray-900">{tx.companionName}</div>
                            <div className="text-xs text-gray-500">{tx.companionEmail}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                            ${(tx.totalAmount || 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-sm text-green-600 font-medium">
                            ${(tx.platformFeeAmount || 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getPaymentStatusBadgeColor(tx.paymentStatus || 'pending')}`}>
                              {tx.paymentStatus || 'pending'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              tx.transferStatus === 'completed'
                                ? 'bg-green-100 text-green-800'
                                : tx.transferStatus === 'pending'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {tx.transferStatus || 'N/A'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {new Date(tx.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <p className="text-sm text-gray-600">
                  Showing {transactionPagination.offset + 1} to {Math.min(transactionPagination.offset + transactionPagination.limit, transactionPagination.total)} of {transactionPagination.total}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setTransactionPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
                    disabled={transactionPagination.offset === 0}
                    className="px-3 py-1 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    <FaChevronLeft />
                  </button>
                  <button
                    onClick={() => setTransactionPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
                    disabled={transactionPagination.offset + transactionPagination.limit >= transactionPagination.total}
                    className="px-3 py-1 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    <FaChevronRight />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default EarningsTab;
