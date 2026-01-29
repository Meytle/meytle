/**
 * Admin Bookings Tab Component
 * Displays and manages all bookings with filtering and actions
 */

import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import {
  FaCalendarCheck,
  FaTimes,
  FaSearch,
  FaFilter,
  FaEye,
  FaChevronLeft,
  FaChevronRight
} from 'react-icons/fa';
import { adminApi, type AdminBooking, type BookingStats } from '../../api/admin';

const BookingsTab = () => {
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [stats, setStats] = useState<BookingStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<AdminBooking | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 20,
    offset: 0
  });

  useEffect(() => {
    fetchData();
  }, [statusFilter, paymentStatusFilter, pagination.offset]);

  const fetchData = async () => {
    try {
      setIsLoading(true);

      const [bookingsData, statsData] = await Promise.all([
        adminApi.getAllBookings({
          status: statusFilter || undefined,
          paymentStatus: paymentStatusFilter || undefined,
          limit: pagination.limit,
          offset: pagination.offset
        }),
        adminApi.getBookingStats()
      ]);

      setBookings(bookingsData.bookings);
      setPagination(prev => ({ ...prev, total: bookingsData.pagination.total }));
      setStats(statsData);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to load bookings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelBooking = async () => {
    if (!selectedBooking || !cancelReason.trim()) {
      toast.error('Please provide a cancellation reason');
      return;
    }

    try {
      await adminApi.cancelBooking(selectedBooking.id, cancelReason, true);
      toast.success('Booking cancelled successfully');
      setShowCancelModal(false);
      setSelectedBooking(null);
      setCancelReason('');
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to cancel booking');
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'confirmed': return 'bg-blue-100 text-blue-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'no_show': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
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

  const totalPages = Math.ceil(pagination.total / pagination.limit);
  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;

  if (isLoading && bookings.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-[#312E81]"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Bookings Management</h1>
      <p className="text-gray-600 mb-8">View and manage all bookings on the platform</p>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <p className="text-gray-500 text-sm">Total</p>
            <p className="text-2xl font-bold text-gray-900">{stats.overview.totalBookings || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <p className="text-gray-500 text-sm">Completed</p>
            <p className="text-2xl font-bold text-green-600">{stats.overview.completed || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <p className="text-gray-500 text-sm">Confirmed</p>
            <p className="text-2xl font-bold text-blue-600">{stats.overview.confirmed || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <p className="text-gray-500 text-sm">Cancelled</p>
            <p className="text-2xl font-bold text-red-600">{stats.overview.cancelled || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <p className="text-gray-500 text-sm">Total Revenue</p>
            <p className="text-2xl font-bold text-gray-900">${(stats.overview.totalRevenue || 0).toFixed(2)}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <p className="text-gray-500 text-sm">Platform Fees</p>
            <p className="text-2xl font-bold text-[#312E81]">${(stats.overview.totalPlatformFees || 0).toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <FaFilter className="text-gray-400" />
            <span className="text-gray-600 font-medium">Filters:</span>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPagination(prev => ({ ...prev, offset: 0 }));
            }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#312E81] focus:border-transparent"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="no_show">No Show</option>
          </select>

          <select
            value={paymentStatusFilter}
            onChange={(e) => {
              setPaymentStatusFilter(e.target.value);
              setPagination(prev => ({ ...prev, offset: 0 }));
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

          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by client or companion..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#312E81] focus:border-transparent"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bookings Table */}
      {bookings.length === 0 ? (
        <div className="bg-white p-12 rounded-xl shadow-sm text-center">
          <FaCalendarCheck className="text-gray-300 text-6xl mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Bookings Found</h3>
          <p className="text-gray-600">No bookings match your current filters</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Companion</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date/Time</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {bookings
                    .filter(b =>
                      !searchTerm ||
                      b.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      b.companionName.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map((booking) => (
                    <tr key={booking.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">#{booking.id}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">{booking.clientName}</div>
                        <div className="text-xs text-gray-500">{booking.clientEmail}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">{booking.companionName}</div>
                        <div className="text-xs text-gray-500">{booking.companionEmail}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900">
                          {new Date(booking.bookingDate).toLocaleDateString()}
                        </div>
                        <div className="text-xs text-gray-500">
                          {booking.startTime} - {booking.endTime}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">
                          ${(booking.totalAmount || 0).toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-500">
                          Fee: ${(booking.platformFeeAmount || 0).toFixed(2)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(booking.status)}`}>
                          {booking.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getPaymentStatusBadgeColor(booking.paymentStatus || 'pending')}`}>
                          {booking.paymentStatus || 'pending'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setSelectedBooking(booking)}
                            className="text-[#312E81] hover:text-[#1E1B4B] p-1"
                            title="View Details"
                          >
                            <FaEye />
                          </button>
                          {booking.status !== 'cancelled' && booking.status !== 'completed' && (
                            <button
                              onClick={() => {
                                setSelectedBooking(booking);
                                setShowCancelModal(true);
                              }}
                              className="text-red-600 hover:text-red-800 p-1"
                              title="Cancel Booking"
                            >
                              <FaTimes />
                            </button>
                          )}
                        </div>
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
              Showing {pagination.offset + 1} to {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total} bookings
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
                disabled={currentPage === 1}
                className="px-3 py-1 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <FaChevronLeft />
              </button>
              <span className="text-sm text-gray-600">
                Page {currentPage} of {totalPages || 1}
              </span>
              <button
                onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
                disabled={currentPage >= totalPages}
                className="px-3 py-1 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <FaChevronRight />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Booking Detail Modal */}
      {selectedBooking && !showCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Booking #{selectedBooking.id}</h2>
              <button
                onClick={() => setSelectedBooking(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <FaTimes size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold text-gray-700">Client</h3>
                  <p className="text-gray-900">{selectedBooking.clientName}</p>
                  <p className="text-gray-500 text-sm">{selectedBooking.clientEmail}</p>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-700">Companion</h3>
                  <p className="text-gray-900">{selectedBooking.companionName}</p>
                  <p className="text-gray-500 text-sm">{selectedBooking.companionEmail}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold text-gray-700">Date & Time</h3>
                  <p className="text-gray-900">{new Date(selectedBooking.bookingDate).toLocaleDateString()}</p>
                  <p className="text-gray-500 text-sm">{selectedBooking.startTime} - {selectedBooking.endTime}</p>
                  <p className="text-gray-500 text-sm">{selectedBooking.durationHours} hours</p>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-700">Payment</h3>
                  <p className="text-gray-900 font-medium">${(selectedBooking.totalAmount || 0).toFixed(2)}</p>
                  <p className="text-gray-500 text-sm">Platform fee: ${(selectedBooking.platformFeeAmount || 0).toFixed(2)}</p>
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getPaymentStatusBadgeColor(selectedBooking.paymentStatus || 'pending')}`}>
                    {selectedBooking.paymentStatus || 'pending'}
                  </span>
                </div>
              </div>

              {selectedBooking.meetingLocation && (
                <div>
                  <h3 className="font-semibold text-gray-700">Meeting Location</h3>
                  <p className="text-gray-900">{selectedBooking.meetingLocation}</p>
                </div>
              )}

              {selectedBooking.serviceCategoryName && (
                <div>
                  <h3 className="font-semibold text-gray-700">Service Category</h3>
                  <p className="text-gray-900">{selectedBooking.serviceCategoryName}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold text-gray-700">Status</h3>
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(selectedBooking.status)}`}>
                    {selectedBooking.status}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-700">Created</h3>
                  <p className="text-gray-900">{new Date(selectedBooking.createdAt).toLocaleString()}</p>
                </div>
              </div>

              {selectedBooking.cancelledBy && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold text-red-700">Cancellation Info</h3>
                  <p className="text-gray-900">Cancelled by: {selectedBooking.cancelledBy}</p>
                  {selectedBooking.cancellationReason && (
                    <p className="text-gray-600">Reason: {selectedBooking.cancellationReason}</p>
                  )}
                </div>
              )}

              {selectedBooking.paymentIntentId && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold text-gray-700">Stripe Payment Intent</h3>
                  <p className="text-gray-500 text-sm font-mono">{selectedBooking.paymentIntentId}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-6 border-t mt-6">
              <button
                onClick={() => setSelectedBooking(null)}
                className="flex-1 border-2 border-gray-300 text-gray-700 py-2 px-4 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
              {selectedBooking.status !== 'cancelled' && selectedBooking.status !== 'completed' && (
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="flex-1 bg-red-500 text-white py-2 px-4 rounded-lg font-medium hover:bg-red-600 transition-colors"
                >
                  Cancel Booking
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancelModal && selectedBooking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex justify-between items-start mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Cancel Booking</h2>
              <button
                onClick={() => {
                  setShowCancelModal(false);
                  setCancelReason('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <FaTimes size={24} />
              </button>
            </div>

            <p className="text-gray-600 mb-4">
              Are you sure you want to cancel booking #{selectedBooking.id}? This will also issue a refund to the client.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cancellation Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-[#312E81] focus:border-transparent"
                rows={3}
                placeholder="Enter reason for cancellation..."
                required
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCancelModal(false);
                  setCancelReason('');
                }}
                className="flex-1 border-2 border-gray-300 text-gray-700 py-2 px-4 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Keep Booking
              </button>
              <button
                onClick={handleCancelBooking}
                className="flex-1 bg-red-500 text-white py-2 px-4 rounded-lg font-medium hover:bg-red-600 transition-colors"
              >
                Cancel & Refund
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookingsTab;
