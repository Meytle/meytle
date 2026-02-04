/**
 * Client Bookings Page
 * Comprehensive booking management with filters/tabs for clients
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useSocket } from '../../hooks/useSocket';
import { bookingApi } from '../../api/booking';
import type { Booking } from '../../types';
import { shouldAutoComplete, sortBookingsByPriority } from '../../utils/bookingHelpers';
import { getImageUrl } from '../../utils/imageHelpers';
import { formatTimeRange } from '../../utils/timeConverter';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import CancellationModal from '../../components/booking/CancellationModal';
import ChatBox from '../../components/messaging/ChatBox';
// Note: ReviewModal removed - reviews only via dashboard banner
import {
  FaList,
  FaClock,
  FaCheckCircle,
  FaCheck,
  FaBan,
  FaCalendarAlt,
  FaMoneyBillWave,
  FaUserCircle,
  FaComments,
  FaExclamationCircle,
  FaSync
} from 'react-icons/fa';
import logger, { logComponentError } from '../../utils/logger';

type FilterType = 'all' | 'pending' | 'confirmed' | 'completed' | 'cancelled';

const ClientBookings = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingRequests, setBookingRequests] = useState<any[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showChatBox, setShowChatBox] = useState(false);
  const [chatBooking, setChatBooking] = useState<Booking | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [userTimezone, setUserTimezone] = useState<string>(() =>
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  );
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  // Note: Review state removed - reviews only via dashboard banner

  // Real-time socket connection - Memoized to prevent infinite reconnection loops
  const socketHandlers = useMemo(() => ({
    onBookingApproved: (data: any) => {
      console.log('📣 [ClientBookings] Booking approved:', data);
      toast.success('Your booking was approved!');
      setRefreshTrigger(prev => prev + 1);
    },
    onBookingCancelled: (data: any) => {
      console.log('📣 [ClientBookings] Booking cancelled:', data);
      toast.error('A booking was cancelled');
      setRefreshTrigger(prev => prev + 1);
    },
    onRequestAccepted: (data: any) => {
      console.log('📣 [ClientBookings] Request accepted:', data);
      toast.success(data.message || 'Your custom request was accepted!', { icon: '🎉' });
      setRefreshTrigger(prev => prev + 1);
    },
    onRequestRejected: (data: any) => {
      console.log('📣 [ClientBookings] Request rejected:', data);
      toast.error(`Request declined: ${data.companionResponse}`);
      setRefreshTrigger(prev => prev + 1);
    },
    onRequestCancelled: (data: any) => {
      console.log('📣 [ClientBookings] Request cancelled:', data);
      toast(`Request cancelled`, { icon: '❌' });
      setRefreshTrigger(prev => prev + 1);
    },
    onOtpSent: (data: any) => {
      console.log('📣 [ClientBookings] OTP sent:', data);
      toast.success(`OTP sent! Meeting starts in ${data.minutesUntilStart} minutes.`, { icon: '🔐' });
      setRefreshTrigger(prev => prev + 1);
    }
  }), []);

  useSocket(socketHandlers);

  const tabs = [
    { id: 'all' as FilterType, label: 'All Bookings', icon: FaList },
    { id: 'pending' as FilterType, label: 'Pending', icon: FaClock },
    { id: 'confirmed' as FilterType, label: 'Confirmed', icon: FaCheckCircle },
    { id: 'completed' as FilterType, label: 'Completed', icon: FaCheck },
    { id: 'cancelled' as FilterType, label: 'Cancelled', icon: FaBan }
  ];

  useEffect(() => {
    // Initial fetch
    fetchBookings();
    fetchBookingRequests();

    // ✅ No polling needed - real-time updates via Socket.IO handle everything
    // Data refreshes automatically when socket events increment refreshTrigger
  }, [refreshTrigger]);

  const handleManualRefresh = async () => {
    try {
      setIsRefreshing(true);
      await Promise.all([fetchBookings(), fetchBookingRequests()]);
      toast.success('Bookings refreshed');
    } catch (error) {
      toast.error('Failed to refresh');
    } finally {
      setIsRefreshing(false);
    }
  };

  const fetchBookings = async () => {
    try {
      setIsLoading(true);
      const response = await bookingApi.getBookings();
      
      // Handle new response format {bookings: [], userTimezone: ''}
      const fetchedBookings = Array.isArray(response) ? response : response.bookings;

      // Only update timezone if server provides a valid one, otherwise keep browser timezone
      const serverTimezone = !Array.isArray(response) ? response.userTimezone : null;
      if (serverTimezone && serverTimezone !== 'UTC') {
        setUserTimezone(serverTimezone);
      }
      logger.info('Client Bookings page: Fetched bookings', {
        count: fetchedBookings?.length || 0,
        serverTimezone: serverTimezone || 'using browser timezone'
      });
      
      // Check for bookings that need auto-completion
      const bookingsToComplete = (fetchedBookings || []).filter(shouldAutoComplete);
      
      if (bookingsToComplete.length > 0) {
        logger.info('Auto-completing past bookings', { count: bookingsToComplete.length });
        
        // Auto-complete past bookings
        for (const booking of bookingsToComplete) {
          try {
            await bookingApi.updateBookingStatus(booking.id, 'completed');
            logger.info('Auto-completed booking', { bookingId: booking.id });
          } catch (err) {
            logger.warn('Failed to auto-complete booking', { bookingId: booking.id, error: err });
          }
        }
        
        // Refetch to get updated statuses
        const updatedResponse = await bookingApi.getBookings();
        const updatedBookings = Array.isArray(updatedResponse) ? updatedResponse : updatedResponse.bookings;
        setBookings(updatedBookings || []);
      } else {
        setBookings(fetchedBookings || []);
      }
    } catch (error) {
      logComponentError('ClientBookings', error, { action: 'fetchBookings' });
      toast.error('Failed to load bookings');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBookingRequests = async () => {
    try {
      const response = await bookingApi.getBookingRequests({ role: 'client' });
      const requests = Array.isArray(response) ? response : (response.requests || []);
      logger.info('Client Bookings page: Fetched booking requests', { count: requests?.length || 0 });
      setBookingRequests(requests);
    } catch (error) {
      logComponentError('ClientBookings', error, { action: 'fetchBookingRequests' });
    }
  };

  const handleCancelBooking = (booking: Booking) => {
    setSelectedBooking(booking);
    setSelectedRequest(null);
    setShowCancellationModal(true);
  };

  const handleCancelRequest = (request: any) => {
    setSelectedRequest(request);
    setSelectedBooking(null);
    setShowCancellationModal(true);
  };

  const handleOpenChat = (booking: Booking) => {
    setChatBooking(booking);
    setShowChatBox(true);
  };

  // Note: Review handlers removed - reviews only via dashboard banner

  const handleConfirmCancellation = async (reason: string) => {
    try {
      setIsCancelling(true);

      if (selectedBooking) {
        await bookingApi.cancelBooking(selectedBooking.id, reason);
        toast.success('Booking cancelled successfully');
      } else if (selectedRequest) {
        await bookingApi.cancelBookingRequest(selectedRequest.id, reason);
        toast.success('Booking request cancelled successfully');
      }

      // Refresh data
      await fetchBookings();
      await fetchBookingRequests();

      // Close modal
      setShowCancellationModal(false);
      setSelectedBooking(null);
      setSelectedRequest(null);
    } catch (error: any) {
      console.error('Error cancelling:', error);
      toast.error(error.response?.data?.message || 'Failed to cancel. Please try again.');
    } finally {
      setIsCancelling(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'payment_held':
      case 'confirmed':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'completed':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'cancelled':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'payment_held':
      case 'confirmed':
        return <FaCheckCircle />;
      case 'pending':
        return <FaClock />;
      case 'completed':
        return <FaCheck />;
      case 'cancelled':
        return <FaBan />;
      default:
        return <FaExclamationCircle />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status.toLowerCase()) {
      case 'payment_held':
      case 'confirmed':
        return 'Confirmed';
      case 'pending':
        return 'Pending';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  const formatDate = (date: string) => {
    if (!date) return 'Date not available';
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) return 'Date not available';
    return parsedDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (time: string) => {
    if (!time || !time.includes(':')) return 'Time not available';
    try {
      const [hours, minutes] = time.split(':');
      const hour = parseInt(hours);
      const minute = parseInt(minutes);
      if (isNaN(hour) || isNaN(minute)) return 'Time not available';
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 || 12;
      return `${displayHour}:${minutes} ${ampm}`;
    } catch {
      return 'Time not available';
    }
  };

  // Filter bookings based on selected tab
  // Include payment_held with confirmed (payment authorized = confirmed)
  const filteredBookings = filter === 'all'
    ? sortBookingsByPriority(bookings)
    : filter === 'confirmed'
      ? sortBookingsByPriority(bookings.filter(b => b.status === 'confirmed' || b.status === 'payment_held'))
      : sortBookingsByPriority(bookings.filter(b => b.status === filter));

  if (isLoading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">My Bookings</h1>
              <p className="mt-1 text-sm text-gray-500">Manage all your bookings in one place</p>
            </div>
            <div className="flex gap-2 items-center">
              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="p-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
                title="Refresh bookings"
              >
                <FaSync className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => navigate('/client-dashboard')}
                className="px-4 py-2 text-sm font-medium text-[#312E81] hover:bg-[#312E81]/10 rounded-lg transition-colors"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Custom Time Requests Section - Only show non-accepted requests */}
        {bookingRequests.filter(r => r.status !== 'accepted').length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <FaClock className="text-[#312E81]" />
              Custom Time Requests ({bookingRequests.filter(r => r.status !== 'accepted').length})
            </h2>
            <div className="space-y-4">
              {bookingRequests.filter(r => r.status !== 'accepted').map((request) => (
                <div key={request.id} className="border-2 border-[#FFCCCB] bg-[#FFF5F5] rounded-lg p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        {request.companionPhoto ? (
                          <img 
                            src={getImageUrl(request.companionPhoto)}
                            alt={request.companionName || 'Companion'}
                            className="w-12 h-12 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#4A47A3] to-[#FFC7C7] flex items-center justify-center text-white font-semibold">
                            {request.companionName?.charAt(0) || 'C'}
                          </div>
                        )}
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            {request.companionName || 'Companion'}
                          </h3>
                          <p className="text-sm text-gray-500">
                            {formatDate(request.requestedDate)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div className="flex items-center gap-2">
                          <FaClock className="text-gray-400" />
                          <span className="text-gray-600">
                            {formatTimeRange(request.startTime, request.endTime, request.bookingDate, userTimezone)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <FaMoneyBillWave className="text-gray-400" />
                          <span className="text-gray-900 font-semibold">
                            ${request.totalAmount || 0}
                          </span>
                        </div>
                      </div>

                      {request.meetingLocation && (
                        <p className="text-sm text-gray-600 mt-2">
                          📍 {request.meetingLocation}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${getStatusColor(request.status || 'pending')}`}>
                        {getStatusIcon(request.status || 'pending')}
                        {getStatusLabel(request.status || 'pending')}
                      </span>

                      {/* Cancellation details */}
                      {request.status === 'cancelled' && request.cancellationReason && (
                        <div className="text-right">
                          <p className="text-xs text-gray-600">
                            Cancelled by {request.cancelledBy === 'client' ? 'You' : 'Companion'}
                          </p>
                          <p className="text-xs italic text-gray-500 mt-1">
                            "{request.cancellationReason}"
                          </p>
                        </div>
                      )}

                      <div className="flex gap-2">
                        {request.status === 'pending' && (
                          <button
                            onClick={() => handleCancelRequest(request)}
                            className="text-xs px-3 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50 transition-colors flex items-center gap-1"
                          >
                            <FaBan className="text-xs" />
                            Cancel
                          </button>
                        )}
                        <button
                          onClick={() => navigate(`/companion/${request.companionId}`)}
                          className="text-xs px-3 py-1 bg-[#312E81] text-white rounded hover:bg-[#312E81]/90 transition-colors flex items-center gap-1"
                        >
                          <FaUserCircle className="text-xs" />
                          View Profile
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px overflow-x-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const count = tab.id === 'all' ? bookings.length : bookings.filter(b => b.status === tab.id).length;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setFilter(tab.id)}
                    className={`
                      flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                      ${filter === tab.id
                        ? 'border-[#312E81] text-[#312E81] bg-[#312E81]/5'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }
                    `}
                  >
                    <Icon className="text-base" />
                    {tab.label}
                    <span className={`
                      ml-1 px-2 py-0.5 rounded-full text-xs
                      ${filter === tab.id ? 'bg-[#312E81] text-white' : 'bg-gray-200 text-gray-600'}
                    `}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Bookings List */}
          <div className="p-6">
            {filteredBookings.length === 0 ? (
              <div className="text-center py-12">
                <FaCalendarAlt className="mx-auto text-6xl text-gray-300 mb-4" />
                <p className="text-gray-500 text-lg">No {filter !== 'all' && filter} bookings found</p>
                <p className="text-gray-400 text-sm mt-2">
                  {filter === 'all' 
                    ? 'Start browsing companions to make your first booking'
                    : `You don't have any ${filter} bookings`
                  }
                </p>
                {filter === 'all' && (
                  <button
                    onClick={() => navigate('/browse-companions')}
                    className="mt-6 px-6 py-2.5 bg-gradient-to-r from-[#312E81] to-[#FFCCCB] text-white font-medium rounded-lg hover:from-[#1E1B4B] hover:to-[#FFCCCB] hover:shadow-[0_0_25px_rgba(255,204,203,0.5)] transition-all duration-200 shadow-md hover:shadow-lg"
                  >
                    Browse Companions
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredBookings.map((booking) => (
                  <div key={booking.id} className="border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          {booking.companionPhoto ? (
                            <img 
                              src={getImageUrl(booking.companionPhoto)}
                              alt={booking.companionName || 'Companion'}
                              className="w-12 h-12 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#4A47A3] to-[#FFC7C7] flex items-center justify-center text-white font-semibold">
                              {booking.companionName?.charAt(0) || 'C'}
                            </div>
                          )}
                          <div>
                            <h3 className="font-semibold text-gray-900">
                              {booking.companionName || 'Companion'}
                            </h3>
                            <p className="text-sm text-gray-500">
                              {formatDate(booking.bookingDate)}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                          <div className="flex items-center gap-2">
                            <FaClock className="text-gray-400" />
                            <span className="text-gray-600">
                              {formatTimeRange(booking.startTime, booking.endTime, booking.bookingDate, userTimezone)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <FaMoneyBillWave className="text-gray-400" />
                            <span className="text-gray-900 font-semibold">
                              ${booking.totalAmount}
                            </span>
                          </div>
                        </div>

                        {booking.meetingLocation && (
                          <p className="text-sm text-gray-600 mt-2">
                            📍 {booking.meetingLocation}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${getStatusColor(booking.status)}`}>
                          {getStatusIcon(booking.status)}
                          {getStatusLabel(booking.status)}
                        </span>

                        {/* Cancellation details */}
                        {booking.status === 'cancelled' && booking.cancellationReason && (
                          <div className="text-right">
                            <p className="text-xs text-gray-600">
                              Cancelled by {booking.cancelledBy === 'client' ? 'You' : 'Companion'}
                            </p>
                            <p className="text-xs italic text-gray-500 mt-1">
                              "{booking.cancellationReason}"
                            </p>
                          </div>
                        )}

                        <div className="flex gap-2 flex-wrap">
                          {(booking.status === 'confirmed' || booking.status === 'payment_held') && (
                            <button
                              onClick={() => handleOpenChat(booking)}
                              className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center gap-1"
                            >
                              <FaComments className="text-xs" />
                              Open Chat
                            </button>
                          )}
                          {(booking.status === 'pending' || booking.status === 'confirmed' || booking.status === 'payment_held') && (
                            <button
                              onClick={() => handleCancelBooking(booking)}
                              className="text-xs px-3 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50 transition-colors flex items-center gap-1"
                            >
                              <FaBan className="text-xs" />
                              Cancel
                            </button>
                          )}
                          {/* Note: "Leave Review" button removed - reviews only via dashboard banner */}
                          <button
                            onClick={() => navigate(`/companion/${booking.companionId}`)}
                            className="text-xs px-3 py-1 bg-[#312E81] text-white rounded hover:bg-[#312E81]/90 transition-colors flex items-center gap-1"
                          >
                            <FaUserCircle className="text-xs" />
                            View Profile
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Cancellation Modal */}
      <CancellationModal
        isOpen={showCancellationModal}
        onClose={() => {
          setShowCancellationModal(false);
          setSelectedBooking(null);
          setSelectedRequest(null);
        }}
        onConfirm={handleConfirmCancellation}
        userRole="client"
        bookingType={selectedBooking ? 'booking' : 'request'}
        bookingStatus={(selectedBooking?.status === 'confirmed' || selectedBooking?.status === 'payment_held') ? 'confirmed' : 'pending'}
        isSubmitting={isCancelling}
      />

      {/* Chat Box */}
      {chatBooking && (
        <ChatBox
          isOpen={showChatBox}
          onClose={() => {
            setShowChatBox(false);
            setChatBooking(null);
          }}
          bookingId={chatBooking.id}
          companionName={chatBooking.companionName}
        />
      )}

      {/* Note: ReviewModal removed - reviews only via dashboard banner */}
    </div>
  );
};

export default ClientBookings;



