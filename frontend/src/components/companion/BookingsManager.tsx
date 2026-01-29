/**
 * Bookings Manager Component
 * Allows companions to view and manage their bookings
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCalendar, FaCalendarAlt, FaClock, FaUser, FaMapMarkerAlt, FaComments, FaCheck, FaTimes, FaEye, FaDollarSign, FaChevronDown, FaChevronRight, FaChevronUp, FaExclamationTriangle, FaUserCircle, FaBan } from 'react-icons/fa';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuth';
import { bookingApi } from '../../api/booking';
import type { Booking } from '../../types';
import { safeParseDate } from '../../utils/dateHelpers';
import { getImageUrl } from '../../utils/imageHelpers';
import { ROUTES } from '../../constants';
import CancellationModal from '../booking/CancellationModal';
import ChatBox from '../messaging/ChatBox';
// Note: ReviewModal import removed - companions do not review clients
import { shouldAutoComplete } from '../../utils/bookingHelpers';
import { convertFromUTC, formatTime12Hour, getUserBrowserTimezone } from '../../utils/timeConverter';

interface BookingsManagerProps {
  className?: string;
  initialFilter?: 'all' | 'pending' | 'confirmed' | 'completed' | 'approvals' | 'cancelled';
  refreshTrigger?: number; // External refresh trigger from parent
}

const BookingsManager = ({ className = '', initialFilter = 'all', refreshTrigger: externalRefreshTrigger = 0 }: BookingsManagerProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [allBookings, setAllBookings] = useState<Booking[]>([]); // Store ALL bookings
  const [pendingApprovals, setPendingApprovals] = useState<Booking[]>([]);
  const [bookingRequests, setBookingRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingApprovals, setIsLoadingApprovals] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed' | 'completed' | 'approvals' | 'cancelled'>(initialFilter);
  const [internalRefreshTrigger, setInternalRefreshTrigger] = useState(0); // Track internal refreshes (user actions)
  const [expandedWeekdays, setExpandedWeekdays] = useState<Set<string>>(new Set());
  const [roleWarning, setRoleWarning] = useState<string | null>(null);
  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showPendingCancellationModal, setShowPendingCancellationModal] = useState(false);
  const [selectedPendingRequest, setSelectedPendingRequest] = useState<Booking | null>(null);
  const [showChatBox, setShowChatBox] = useState(false);
  const [chatBooking, setChatBooking] = useState<Booking | null>(null);
  // Note: Companions do NOT review clients - review-related state removed
  
  // Get user's timezone for time conversion
  const [userTimezone] = useState<string>(getUserBrowserTimezone());

  // Safe accessors with fallbacks - ensure always arrays
  const safeAllBookings = Array.isArray(allBookings) ? allBookings : [];
  const safePendingApprovals = Array.isArray(pendingApprovals) ? pendingApprovals : [];

  // Client-side filtering - no API call on tab change!
  const filteredBookings = useMemo(() => {
    if (filter === 'all' || filter === 'approvals') {
      return safeAllBookings;
    }
    // Include meeting_started with confirmed (it's an active meeting)
    if (filter === 'confirmed') {
      return safeAllBookings.filter(booking => booking.status === 'confirmed' || booking.status === 'meeting_started');
    }
    return safeAllBookings.filter(booking => booking.status === filter);
  }, [safeAllBookings, filter]);

  // Alias for backward compatibility with existing code
  const safeBookings = filteredBookings;

  // Set initial filter from props
  useEffect(() => {
    console.log('🔍 BookingsManager: Initial filter effect', {
      initialFilter,
      currentFilter: filter,
      shouldUpdate: initialFilter && initialFilter !== filter
    });
    if (initialFilter && initialFilter !== filter) {
      console.log('🔍 BookingsManager: Setting initial filter', {
        initialFilter,
        currentFilter: filter
      });
      setFilter(initialFilter);
    }
  }, [initialFilter]);

  // Verify user is in companion role
  useEffect(() => {
    if (user) {
      if (import.meta.env.DEV) {
        console.log('🔍 BookingsManager: Checking user role', {
          activeRole: user.activeRole,
          roles: user.roles,
          userId: user.id
        });
      }

      if (user.activeRole !== 'companion') {
        const warning = `Warning: You are currently in ${user.activeRole || 'unknown'} role. Bookings may not display correctly.`;
        if (import.meta.env.DEV) {
          console.warn('⚠️ BookingsManager:', warning, {
            activeRole: user.activeRole,
            expectedRole: 'companion',
            allRoles: user.roles
          });
        }
        setRoleWarning(warning);

        // Still attempt to fetch, but warn the user
        if (!user.roles?.includes('companion')) {
          toast.error('You do not have companion access to view bookings');
        }
      } else {
        if (import.meta.env.DEV) {
          console.log('✅ BookingsManager: User is in companion role');
        }
        setRoleWarning(null);
      }
    }
  }, [user?.id, user?.activeRole]); // ✅ FIX: Only depend on specific properties, not entire user object

  // Fetch ALL data on mount and when refreshTrigger changes (external or internal)
  // Tab switching does NOT trigger fetches - client-side filtering only!
  useEffect(() => {
    console.log('🔍 [BookingsManager] Refresh triggered!', {
      externalRefreshTrigger,
      internalRefreshTrigger,
      timestamp: new Date().toISOString()
    });
    // Fetch both bookings and pending approvals on mount
    fetchBookings();
    fetchPendingApprovals();
  }, [externalRefreshTrigger, internalRefreshTrigger]); // Refetch on mount or explicit refresh trigger (external or internal)

  // NOTE: Removed aggressive 60-second backup polling - it was causing
  // unnecessary API calls and re-renders every minute.
  // Real-time updates are handled via Socket.io events (refreshTrigger prop).
  // If data fails to load, users can switch tabs or navigate to trigger a refetch.

  // Initialize expanded weekdays based on bookings
  useEffect(() => {
    if (filter === 'all' && safeAllBookings.length > 0) {
      const weekdaysWithBookings = new Set<string>();
      safeAllBookings.forEach(booking => {
        const bookingDate = booking.bookingDate;
        if (bookingDate) {
          const date = new Date(bookingDate);
          if (!isNaN(date.getTime())) {
            const weekdayName = date.toLocaleDateString('en-US', { weekday: 'long' });
            weekdaysWithBookings.add(weekdayName);
          }
        }
      });
      setExpandedWeekdays(weekdaysWithBookings);
    }
  }, [safeAllBookings, filter]);

  const fetchBookings = async () => {
    try {
      setIsLoading(true);
      // Always fetch ALL bookings - filtering is done client-side
      const params = {};

      // Enhanced logging with role information
      console.log('📚 Fetching ALL companion bookings', {
        params,
        userRole: user?.activeRole,
        expectedRole: 'companion',
        userId: user?.id,
        timestamp: new Date().toISOString()
      });

      const response = await bookingApi.getBookings(params);
      
      // Handle response format (array or object with bookings property)
      const bookingsData: Booking[] = Array.isArray(response) 
        ? response 
        : (response as any).bookings || [];

      console.log('📊 Received bookings:', {
        rawResponse: response,
        processedData: bookingsData,
        count: bookingsData?.length || 0,
        bookingIds: bookingsData?.map((b: Booking) => b.id),
        isArray: Array.isArray(bookingsData),
        userRole: user?.activeRole,
        isEmpty: bookingsData?.length === 0
      });

      if (bookingsData?.length === 0 && user?.activeRole !== 'companion') {
        console.warn('⚠️ No bookings returned - possible role mismatch!', {
          activeRole: user?.activeRole,
          shouldBe: 'companion'
        });
      }

      // Check for bookings that need auto-completion
      const bookingsToComplete = (bookingsData || []).filter(shouldAutoComplete);
      
      if (bookingsToComplete.length > 0) {
        console.log('Auto-completing past bookings', { count: bookingsToComplete.length });
        
        // Auto-complete past bookings in background
        Promise.all(
          bookingsToComplete.map(booking => 
            bookingApi.updateBookingStatus(booking.id, 'completed')
              .then(() => console.log('Auto-completed booking', { bookingId: booking.id }))
              .catch(err => console.warn('Failed to auto-complete booking', { bookingId: booking.id, error: err }))
          )
        );
        
        // ✅ FIX: Update status locally instead of refetching
        // This prevents double API calls and reload flickers
        const updatedBookings = bookingsData.map(booking =>
          bookingsToComplete.some(b => b.id === booking.id)
            ? { ...booking, status: 'completed' as const }
            : booking
        );
        setAllBookings(updatedBookings);
      } else {
        setAllBookings(bookingsData);
      }
    } catch (error: any) {
      console.error('Error fetching bookings:', error);
      toast.error('Failed to load bookings');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPendingApprovals = async () => {
    try {
      console.log('🔍 fetchPendingApprovals: Starting to fetch pending approvals and requests');
      setIsLoadingApprovals(true);
      
      // Fetch both regular bookings AND custom booking requests
      const [bookingsResponse, requestsResponse] = await Promise.all([
        bookingApi.getPendingBookingsForCompanion(),
        bookingApi.getBookingRequests({ role: 'companion', status: 'pending' })
      ]);
      
      // Handle bookings response
      const approvalsData: Booking[] = Array.isArray(bookingsResponse) 
        ? bookingsResponse 
        : (bookingsResponse as any).pendingBookings || [];
      
      // Handle requests response
      const requestsData = Array.isArray(requestsResponse) ? requestsResponse : [];
      
      console.log('📥 fetchPendingApprovals: Received data', {
        bookingsCount: approvalsData.length,
        requestsCount: requestsData.length
      });
      
      setPendingApprovals(approvalsData);
      setBookingRequests(requestsData);
      console.log('✅ fetchPendingApprovals: Data set successfully');
    } catch (error: any) {
      console.error('❌ fetchPendingApprovals: Error fetching pending approvals', error);
      toast.error('Failed to load pending approvals');
    } finally {
      setIsLoadingApprovals(false);
    }
  };

  const updateBookingStatus = async (bookingId: number, status: string) => {
    try {
      await bookingApi.updateBookingStatus(bookingId, status);
      toast.success(`Booking ${status} successfully`);
      setInternalRefreshTrigger(prev => prev + 1); // Trigger refetch
    } catch (error: any) {
      console.error('Error updating booking status:', error);
      toast.error('Failed to update booking status');
    }
  };

  const handleApproveBooking = async (bookingId: number) => {
    try {
      await bookingApi.approveBooking(bookingId);
      toast.success('Booking approved successfully');
      setInternalRefreshTrigger(prev => prev + 1); // Trigger refetch
    } catch (error: any) {
      console.error('Error approving booking:', error);
      toast.error('Failed to approve booking');
    }
  };

  const handleRejectBooking = async (bookingId: number) => {
    try {
      await bookingApi.rejectBooking(bookingId);
      toast.success('Booking rejected');
      setInternalRefreshTrigger(prev => prev + 1); // Trigger refetch
    } catch (error: any) {
      console.error('Error rejecting booking:', error);
      toast.error('Failed to reject booking');
    }
  };

  const handleCancelPendingRequest = (booking: Booking) => {
    setSelectedPendingRequest(booking);
    setShowPendingCancellationModal(true);
  };

  const handleConfirmPendingCancellation = async (reason: string) => {
    try {
      setIsCancelling(true);

      if (selectedPendingRequest) {
        await bookingApi.rejectBooking(selectedPendingRequest.id, reason);
        toast.success('Booking request cancelled successfully');

        // Trigger refetch
        setInternalRefreshTrigger(prev => prev + 1);
      }

      // Close modal
      setShowPendingCancellationModal(false);
      setSelectedPendingRequest(null);
    } catch (error: any) {
      console.error('Error cancelling pending request:', error);

      // Check for 3-hour restriction error
      if (error.response?.status === 400 && error.response?.data?.hoursRemaining !== undefined) {
        toast.error(error.response.data.message);
      } else {
        toast.error(error.response?.data?.message || 'Failed to cancel request');
      }
    } finally {
      setIsCancelling(false);
    }
  };

  const handleCancelBooking = (booking: Booking) => {
    setSelectedBooking(booking);
    setShowCancellationModal(true);
  };

  const handleOpenChat = (booking: Booking) => {
    setChatBooking(booking);
    setShowChatBox(true);
  };

  // Note: Companions do NOT review clients - review handlers removed

  const handleConfirmCancellation = async (reason: string) => {
    try {
      setIsCancelling(true);

      if (selectedBooking) {
        await bookingApi.cancelBooking(selectedBooking.id, reason);
        toast.success('Booking cancelled successfully');

        // Trigger refetch
        setInternalRefreshTrigger(prev => prev + 1);
      }

      // Close modal
      setShowCancellationModal(false);
      setSelectedBooking(null);
    } catch (error: any) {
      console.error('Error cancelling booking:', error);

      // Check for 3-hour restriction error
      if (error.response?.status === 400 && error.response?.data?.hoursRemaining !== undefined) {
        toast.error(error.response.data.message);
      } else {
        toast.error(error.response?.data?.message || 'Failed to cancel booking');
      }
    } finally {
      setIsCancelling(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { color: 'bg-yellow-100 text-yellow-800', label: 'Pending' },
      confirmed: { color: 'bg-green-100 text-green-800', label: 'Confirmed' },
      meeting_started: { color: 'bg-purple-100 text-purple-800', label: 'In Progress' },
      cancelled: { color: 'bg-red-100 text-red-800', label: 'Cancelled' },
      completed: { color: 'bg-blue-100 text-blue-800', label: 'Completed' },
      no_show: { color: 'bg-gray-100 text-gray-800', label: 'No Show' }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const getPaymentStatusBadge = (paymentStatus?: string) => {
    const statusConfig = {
      unpaid: { color: 'bg-gray-100 text-gray-800', label: 'Unpaid' },
      pending: { color: 'bg-yellow-100 text-yellow-800', label: 'Pending' },
      paid: { color: 'bg-green-100 text-green-800', label: 'Paid' },
      failed: { color: 'bg-red-100 text-red-800', label: 'Failed' },
      refunded: { color: 'bg-blue-100 text-blue-800', label: 'Refunded' }
    };

    const config = statusConfig[paymentStatus as keyof typeof statusConfig] || statusConfig.unpaid;
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const formatDate = (dateString: string | null | undefined) => {
    // Handle null, undefined, or empty date
    if (!dateString || dateString === 'null' || dateString === '') {
      return 'Date not available';
    }

    // Try to parse the date - handle various formats
    let parsedDate: Date;
    
    // Handle MySQL date format (YYYY-MM-DD)
    if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      parsedDate = new Date(dateString + 'T00:00:00');
    } else {
      parsedDate = new Date(dateString);
    }

    // Check if the date is valid
    if (isNaN(parsedDate.getTime())) {
      return 'Date not available';
    }

    // Format valid date - SHORT format for consistency with Client dashboard
    return parsedDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  /**
   * Format time with timezone conversion
   * Converts from UTC (stored in DB) to user's local timezone
   * @param timeString - Time in HH:MM:SS format (UTC)
   * @param date - Date in YYYY-MM-DD format
   * @returns Formatted time in 12-hour format (e.g., "10:30 PM")
   */
  const formatTime = (timeString: string, date?: string) => {
    // Handle null, undefined, or empty time
    if (!timeString || !timeString.includes(':')) {
      return 'Time not available';
    }

    try {
      // Convert from UTC to user's local timezone
      const localTime = date 
        ? convertFromUTC(timeString, date, userTimezone)
        : timeString; // Fallback if no date provided (shouldn't happen)
      
      // Format in 12-hour format
      return formatTime12Hour(localTime);
    } catch (error) {
      console.error('Error formatting time:', error);
      return 'Time not available';
    }
  };

  const canUpdateStatus = (currentStatus: string, newStatus: string) => {
    const validTransitions: { [key: string]: string[] } = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['completed', 'cancelled', 'no_show'],
      cancelled: [],
      completed: [],
      no_show: []
    };

    return validTransitions[currentStatus]?.includes(newStatus) || false;
  };

  // Group bookings by day of week for weekly view
  const groupBookingsByWeekday = (bookings: Booking[]) => {
    const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const grouped: { [key: string]: Booking[] } = {};

    // Initialize all weekdays with empty arrays
    weekdays.forEach(day => {
      grouped[day] = [];
    });

    // Add a special group for invalid dates
    grouped['Unknown'] = [];

    // Group bookings by their weekday
    bookings.forEach(booking => {
      const bookingDate = booking.bookingDate;
      
      // Debug logging to see what we're getting
      console.log('🔍 Processing booking:', {
        id: booking.id,
        bookingDate,
        type: typeof bookingDate,
        isNull: bookingDate === null,
        isUndefined: bookingDate === undefined,
        isEmpty: bookingDate === '',
        isStringNull: bookingDate === 'null'
      });
      
      // Handle null, undefined, empty, or invalid dates
      if (!bookingDate || bookingDate === 'null' || bookingDate === '') {
        console.log('📅 Adding to Unknown group due to invalid date');
        grouped['Unknown'].push(booking);
        return;
      }

      // Try to parse the date using safeParseDate helper
      const date = safeParseDate(bookingDate);

      if (!date) {
        console.log('📅 Failed to parse date:', bookingDate);
        grouped['Unknown'].push(booking);
        return;
      }

      const weekdayName = date.toLocaleDateString('en-US', { weekday: 'long' });
      if (grouped[weekdayName]) {
        grouped[weekdayName].push(booking);
      } else {
        // Fallback to Unknown if weekday name is unexpected
        grouped['Unknown'].push(booking);
      }
    });

    // Sort bookings within each day by date and time (newest first)
    Object.keys(grouped).forEach(day => {
      grouped[day].sort((a, b) => {
        // Handle invalid dates
        const aDate = safeParseDate(a.bookingDate);
        const bDate = safeParseDate(b.bookingDate);

        if (!aDate || !bDate) return 0;

        // Add time components
        const aStartTime = a.startTime || '00:00';
        const bStartTime = b.startTime || '00:00';

        const [aHours, aMinutes] = aStartTime.split(':').map(Number);
        const [bHours, bMinutes] = bStartTime.split(':').map(Number);

        aDate.setHours(aHours || 0, aMinutes || 0, 0, 0);
        bDate.setHours(bHours || 0, bMinutes || 0, 0, 0);

        return bDate.getTime() - aDate.getTime();
      });
    });

    return grouped;
  };

  const getWeekdayIcon = (weekday: string) => {
    const icons: { [key: string]: string } = {
      'Monday': '🗓️',
      'Tuesday': '📅',
      'Wednesday': '📆',
      'Thursday': '🗒️',
      'Friday': '📋',
      'Saturday': '🎯',
      'Sunday': '🌟'
    };
    return icons[weekday] || '📅';
  };

  const toggleWeekdayExpansion = (weekday: string) => {
    setExpandedWeekdays(prev => {
      const newSet = new Set(prev);
      if (newSet.has(weekday)) {
        newSet.delete(weekday);
      } else {
        newSet.add(weekday);
      }
      return newSet;
    });
  };

  const expandAllWeekdays = () => {
    setExpandedWeekdays(new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']));
  };

  const collapseAllWeekdays = () => {
    setExpandedWeekdays(new Set());
  };

  if (isLoading) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
      {/* Role Warning Display */}
      {roleWarning && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
          <FaExclamationTriangle className="text-yellow-600 flex-shrink-0" />
          <div>
            <p className="text-sm text-yellow-800 font-medium">{roleWarning}</p>
            <p className="text-xs text-yellow-600 mt-1">
              Please ensure you are in companion role to view your bookings correctly.
            </p>
          </div>
        </div>
      )}

      {/* Header - Stacks on mobile, inline on desktop */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <FaCalendarAlt className="text-[#312E81] text-xl" />
          <h2 className="text-xl font-bold text-gray-900">My Bookings</h2>
        </div>

        {/* Filter Buttons - Horizontal scroll on mobile */}
        <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-thin scrollbar-thumb-gray-300">
          {(['all', 'approvals', 'confirmed', 'completed', 'cancelled'] as const).map(status => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                filter === status
                  ? 'bg-[#312E81] text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {status === 'approvals' ? (
                <>
                  <span className="sm:hidden">Pending</span>
                  <span className="hidden sm:inline">Pending Approvals</span>
                </>
              ) : (
                status.charAt(0).toUpperCase() + status.slice(1)
              )}
            </button>
          ))}
        </div>
      </div>

      {filter === 'approvals' ? (
        // Pending Approvals View
        (() => {
          console.log('🔍 BookingsManager: Rendering approvals view', {
            isLoadingApprovals,
            pendingApprovalsLength: safePendingApprovals.length,
            pendingApprovals: safePendingApprovals
          });
          return isLoadingApprovals ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#312E81]" />
            </div>
          ) : (safePendingApprovals.length === 0 && bookingRequests.length === 0) ? (
            <div className="text-center py-12">
              <FaCalendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No pending approvals</h3>
              <p className="text-gray-600">
                You don't have any bookings or custom requests waiting for your approval.
              </p>
            </div>
          ) : (
          <div className="space-y-6">
            {/* Regular Bookings Section */}
            {safePendingApprovals.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <FaCalendar className="text-[#312E81]" />
                  Regular Bookings ({safePendingApprovals.length})
                </h3>
                {safePendingApprovals.map(booking => (
              <div key={booking.id} className="border-2 border-orange-200 bg-orange-50 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {booking.clientPhoto ? (
                      <img
                        src={getImageUrl(booking.clientPhoto)}
                        alt={booking.clientName || 'Client'}
                        className="w-10 h-10 rounded-full object-cover border-2 border-orange-200"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-r from-orange-500 to-red-500 flex items-center justify-center ${booking.clientPhoto ? 'hidden' : ''}`}>
                      <FaUser className="text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{booking.clientName || 'Unknown Client'}</h3>
                      <p className="text-sm text-gray-600">{booking.clientEmail || 'No email'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                      Awaiting Approval
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <FaCalendar className="w-4 h-4" />
                    <span>{formatDate(booking.bookingDate)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <FaClock className="w-4 h-4" />
                    <span>{formatTime(booking.startTime, booking.bookingDate)} - {formatTime(booking.endTime, booking.bookingDate)}</span>
                  </div>
                  {(booking.meetingLocation) && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <FaMapMarkerAlt className="w-4 h-4" />
                      <span>{booking.meetingLocation}</span>
                    </div>
                  )}
                  <div className="text-sm text-gray-600">
                    <span className="font-medium">${(booking.totalAmount || 0).toFixed(2)}</span>
                    <span className="ml-1">({booking.durationHours || 0}h)</span>
                  </div>
                </div>

                {booking.specialRequests && (
                  <div className="mb-4 p-3 bg-white rounded-lg">
                    <div className="flex items-start gap-2">
                      <FaComments className="w-4 h-4 text-gray-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-700">Special Requests:</p>
                        <p className="text-sm text-gray-600">{booking.specialRequests}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Approval/Cancellation Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApproveBooking(booking.id)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#312E81] text-white rounded-lg hover:bg-[#1E1B4B] hover:shadow-[0_0_20px_rgba(255,204,203,0.6)] transition-all duration-300 text-sm font-medium"
                  >
                    <FaCheck className="w-4 h-4" />
                    Approve Booking
                  </button>
                  <button
                    onClick={() => handleCancelPendingRequest(booking)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white border-2 border-red-500 text-red-600 rounded-lg hover:bg-red-50 transition-all duration-300 text-sm font-medium"
                  >
                    <FaBan className="w-4 h-4" />
                    Cancel Request
                  </button>
                </div>
              </div>
                ))}
              </div>
            )}

            {/* Custom Booking Requests Section */}
            {bookingRequests.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <FaCalendarAlt className="text-[#312E81]" />
                  Custom Time Requests ({bookingRequests.length})
                </h3>
                <p className="text-sm text-gray-600 -mt-2">
                  Requests for times outside your regular availability
                </p>
                {bookingRequests.map((request: any) => (
                  <div key={request.id} className="border-2 border-purple-200 bg-purple-50 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        {request.clientPhoto ? (
                          <img
                            src={getImageUrl(request.clientPhoto)}
                            alt={request.clientName || 'Client'}
                            className="w-10 h-10 rounded-full object-cover border-2 border-purple-200"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                            <FaUser className="text-white" />
                          </div>
                        )}
                        <div>
                          <h3 className="font-semibold text-gray-900">{request.clientName || 'Unknown Client'}</h3>
                          <p className="text-sm text-gray-600">{request.clientEmail || 'No email'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {request.extraAmount > 0 && (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            +${request.extraAmount} tip
                          </span>
                        )}
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                          Custom Request
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <FaCalendar className="w-4 h-4" />
                        <span>{formatDate(request.requestedDate)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <FaClock className="w-4 h-4" />
                        <span>{formatTime(request.startTime, request.requestedDate || request.bookingDate)} - {formatTime(request.endTime, request.requestedDate || request.bookingDate)}</span>
                        <span className="ml-2 text-xs text-gray-500">({request.durationHours}h)</span>
                      </div>
                      {request.serviceType && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <FaUser className="w-4 h-4" />
                          <span>{request.serviceType}</span>
                        </div>
                      )}
                      {request.meetingLocation && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <FaMapMarkerAlt className="w-4 h-4" />
                          <span>{request.meetingLocation}</span>
                        </div>
                      )}
                    </div>

                    {request.specialRequests && (
                      <div className="mb-4 p-3 bg-white rounded-lg">
                        <div className="flex items-start gap-2">
                          <FaComments className="w-4 h-4 text-gray-500 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-gray-700">Special Requests:</p>
                            <p className="text-sm text-gray-600">{request.specialRequests}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          try {
                            await bookingApi.updateBookingRequestStatus(request.id, { status: 'accepted' });
                            toast.success('Custom request accepted!');
                            setInternalRefreshTrigger(prev => prev + 1);
                          } catch (error) {
                            console.error('Error accepting request:', error);
                            toast.error('Failed to accept request');
                          }
                        }}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#312E81] text-white rounded-lg hover:bg-[#1E1B4B] hover:shadow-[0_0_20px_rgba(255,204,203,0.6)] transition-all duration-300 text-sm font-medium"
                      >
                        <FaCheck className="w-4 h-4" />
                        Accept
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await bookingApi.updateBookingRequestStatus(request.id, { status: 'rejected' });
                            toast.success('Request declined');
                            setInternalRefreshTrigger(prev => prev + 1);
                          } catch (error) {
                            console.error('Error declining request:', error);
                            toast.error('Failed to decline request');
                          }
                        }}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white border-2 border-red-500 text-red-600 rounded-lg hover:bg-red-50 transition-all duration-300 text-sm font-medium"
                      >
                        <FaTimes className="w-4 h-4" />
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          );
        })()
      ) : safeBookings.length === 0 ? (
        <div className="text-center py-12">
          <FaCalendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No bookings found</h3>
          <p className="text-gray-600">
            {filter === 'all'
              ? "You don't have any bookings yet. Set your availability to start receiving bookings!"
              : `No ${filter} bookings found`
            }
          </p>
        </div>
      ) : filter === 'all' ? (
        // Weekly view for 'All' tab
        <div className="space-y-4">
          {/* Expand/Collapse All Controls */}
          <div className="flex items-center justify-end gap-2 mb-2">
            <button
              onClick={expandAllWeekdays}
              className="text-xs text-[#312E81] hover:text-[#1E1B4B] font-medium px-2 py-1 rounded hover:bg-[#f0effe] transition-colors"
            >
              Expand All
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={collapseAllWeekdays}
              className="text-xs text-[#312E81] hover:text-[#1E1B4B] font-medium px-2 py-1 rounded hover:bg-[#f0effe] transition-colors"
            >
              Collapse All
            </button>
          </div>

          {(() => {
            const groupedBookings = groupBookingsByWeekday(safeBookings);
            const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

            const weekdaySections = weekdays.map(weekday => {
              const weekdayBookings = groupedBookings[weekday];
              const isExpanded = expandedWeekdays.has(weekday);
              const hasBookings = weekdayBookings.length > 0;

              return (
                <div key={weekday} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Clickable Header */}
                  <button
                    onClick={() => hasBookings && toggleWeekdayExpansion(weekday)}
                    className={`w-full bg-gradient-to-r from-[#f9f8ff] to-blue-50 px-4 py-3 text-left ${hasBookings ? 'cursor-pointer hover:from-[#f0effe] hover:to-blue-100' : 'cursor-default'}`}
                    disabled={!hasBookings}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {hasBookings && (
                          <span className={`text-gray-500 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`}>
                            <FaChevronDown className="w-3 h-3" />
                          </span>
                        )}
                        <h3 className="font-semibold text-gray-900">{weekday}</h3>
                      </div>
                      <span className={`px-2 py-1 ${hasBookings ? 'bg-white' : 'bg-gray-100'} rounded-full text-xs font-medium text-gray-600`}>
                        {weekdayBookings.length} booking{weekdayBookings.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </button>

                  {/* Collapsible Content */}
                  {hasBookings && (
                  <div className={`divide-y divide-gray-100 overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                    {groupedBookings[weekday].map(booking => (
                      <div key={booking.id} className="p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            {booking.clientPhoto ? (
                              <img
                                src={getImageUrl(booking.clientPhoto)}
                                alt={booking.clientName}
                                className="w-10 h-10 rounded-full object-cover border-2 border-gray-200"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                }}
                              />
                            ) : null}
                            <div className={`w-10 h-10 rounded-full bg-gradient-to-r from-[#312E81] to-[#FFCCCB] flex items-center justify-center ${booking.clientPhoto ? 'hidden' : ''}`}>
                              <FaUser className="text-white" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-gray-900">{booking.clientName}</h3>
                              <p className="text-sm text-gray-600">{booking.clientEmail}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {getStatusBadge(booking.status)}
                            {booking.status === 'completed' && getPaymentStatusBadge(booking.paymentStatus)}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <FaCalendar className="w-4 h-4" />
                            <span>{formatDate(booking.bookingDate)}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <FaClock className="w-4 h-4" />
                            <span>{formatTime(booking.startTime, booking.bookingDate)} - {formatTime(booking.endTime, booking.bookingDate)}</span>
                          </div>
                          {(booking.meetingLocation) && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <FaMapMarkerAlt className="w-4 h-4" />
                              <span>{booking.meetingLocation}</span>
                            </div>
                          )}
                          <div className="text-sm text-gray-600">
                            <span className="font-medium">${(booking.totalAmount || 0).toFixed(2)}</span>
                            <span className="ml-1">({booking.durationHours || 0}h)</span>
                          </div>
                        </div>

                        {booking.specialRequests && (
                          <div className="mb-4 p-3 bg-white rounded-lg">
                            <div className="flex items-start gap-2">
                              <FaComments className="w-4 h-4 text-gray-500 mt-0.5" />
                              <div>
                                <p className="text-sm font-medium text-gray-700">Special Requests:</p>
                                <p className="text-sm text-gray-600">{booking.specialRequests}</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Cancellation Details */}
                        {booking.status === 'cancelled' && booking.cancellationReason && (
                          <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
                            <div className="flex items-start gap-2">
                              <FaBan className="w-4 h-4 text-red-600 mt-0.5" />
                              <div>
                                <p className="text-sm font-medium text-red-800">
                                  Cancelled by {booking.cancelledBy === 'companion' ? 'You' : 'Client'}
                                </p>
                                <p className="text-sm italic text-red-700">
                                  "{booking.cancellationReason}"
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Transfer Information (for completed bookings) */}
                        {booking.status === 'completed' && booking.transferStatus && (
                          <div className="mb-4 p-3 bg-green-50 rounded-lg">
                            <div className="flex items-start gap-2">
                              <FaDollarSign className="w-4 h-4 text-green-600 mt-0.5" />
                              <div>
                                <p className="text-sm font-medium text-green-800">Payout Information:</p>
                                <p className="text-sm text-green-700">
                                  {booking.transferStatus === 'completed'
                                    ? `Transfer completed! Platform fee: $${booking.platformFeeAmount?.toFixed(2) || '0.00'}, Amount received: $${((booking.totalAmount || 0) - (booking.platformFeeAmount || 0)).toFixed(2)}`
                                    : booking.transferStatus === 'failed'
                                    ? 'Transfer failed. Please contact support.'
                                    : 'Transfer is being processed...'
                                  }
                                </p>
                                {booking.transferId && (
                                  <p className="text-xs text-green-600 mt-1">Transfer ID: {booking.transferId}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-2 flex-wrap">
                          {(booking.status === 'confirmed' || booking.status === 'meeting_started') && (
                            <button
                              onClick={() => handleOpenChat(booking)}
                              className="flex items-center gap-2 px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                            >
                              <FaComments className="w-3 h-3" />
                              Open Chat
                            </button>
                          )}
                          {(booking.status === 'pending' || booking.status === 'confirmed') && (
                            <button
                              onClick={() => handleCancelBooking(booking)}
                              className="flex items-center gap-2 px-3 py-1 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-sm"
                            >
                              <FaBan className="w-3 h-3" />
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  )}
                </div>
              );
            });

            // Render bookings with unknown/invalid dates so they are not hidden
            const unknownBookings = groupedBookings['Unknown'] || [];
            const unknownSection = unknownBookings.length > 0 && (
              <div key="Unknown" className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gradient-to-r from-[#f9f8ff] to-blue-50 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">Unknown date</h3>
                    </div>
                    <span className="px-2 py-1 bg-white rounded-full text-xs font-medium text-gray-600">
                      {unknownBookings.length} booking{unknownBookings.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <div className="divide-y divide-gray-100">
                  {unknownBookings.map(booking => (
                    <div key={booking.id} className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#312E81] to-[#FFCCCB] flex items-center justify-center">
                            <FaUser className="text-white" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900">{booking.clientName || booking.companionName || 'Unknown'}</h3>
                            <p className="text-sm text-gray-600">Date not available</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(booking.status)}
                          {booking.status === 'completed' && getPaymentStatusBadge(booking.paymentStatus)}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <FaClock className="w-4 h-4" />
                          <span>{formatTime(booking.startTime, booking.bookingDate)} - {formatTime(booking.endTime, booking.bookingDate)}</span>
                        </div>
                        {booking.meetingLocation && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <FaMapMarkerAlt className="w-4 h-4" />
                            <span>{booking.meetingLocation}</span>
                          </div>
                        )}
                        <div className="text-sm text-gray-600">
                          <span className="font-medium">${(booking.totalAmount || 0).toFixed(2)}</span>
                          <span className="ml-1">({booking.durationHours || 0}h)</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );

            return (
              <>
                {weekdaySections}
                {unknownSection}
              </>
            );
          })()}
        </div>
      ) : (
        // Chronological view for other tabs (Pending, Confirmed, Completed)
        <div className="space-y-4">
          {safeBookings.map(booking => (
            <div key={booking.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {booking.clientPhoto ? (
                    <img
                      src={getImageUrl(booking.clientPhoto)}
                      alt={booking.clientName}
                      className="w-10 h-10 rounded-full object-cover border-2 border-gray-200"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                  ) : null}
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-r from-[#312E81] to-[#FFCCCB] flex items-center justify-center ${booking.clientPhoto ? 'hidden' : ''}`}>
                    <FaUser className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{booking.clientName}</h3>
                    <p className="text-sm text-gray-600">{booking.clientEmail}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(booking.status)}
                  {booking.status === 'completed' && getPaymentStatusBadge(booking.paymentStatus)}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <FaCalendar className="w-4 h-4" />
                  <span>{formatDate(booking.bookingDate)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <FaClock className="w-4 h-4" />
                  <span>{formatTime(booking.startTime, booking.bookingDate)} - {formatTime(booking.endTime, booking.bookingDate)}</span>
                </div>
                {booking.meetingLocation && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <FaMapMarkerAlt className="w-4 h-4" />
                    <span>{booking.meetingLocation}</span>
                  </div>
                )}
                <div className="text-sm text-gray-600">
                  <span className="font-medium">${(booking.totalAmount || 0).toFixed(2)}</span>
                  <span className="ml-1">({booking.durationHours || 0}h)</span>
                </div>
              </div>

              {booking.specialRequests && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-start gap-2">
                    <FaComments className="w-4 h-4 text-gray-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Special Requests:</p>
                      <p className="text-sm text-gray-600">{booking.specialRequests}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Transfer Information (for completed bookings) */}
              {booking.status === 'completed' && booking.transferStatus && (
                <div className="mb-4 p-3 bg-green-50 rounded-lg">
                  <div className="flex items-start gap-2">
                    <FaDollarSign className="w-4 h-4 text-green-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-green-800">Payout Information:</p>
                      <p className="text-sm text-green-700">
                        {booking.transferStatus === 'completed'
                          ? `Transfer completed! Platform fee: $${booking.platformFeeAmount?.toFixed(2) || '0.00'}, Amount received: $${((booking.totalAmount || 0) - (booking.platformFeeAmount || 0)).toFixed(2)}`
                          : booking.transferStatus === 'failed'
                          ? 'Transfer failed. Please contact support.'
                          : 'Transfer is being processed...'
                        }
                      </p>
                      {booking.transferId && (
                        <p className="text-xs text-green-600 mt-1">Transfer ID: {booking.transferId}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 flex-wrap">
                {(booking.status === 'confirmed' || booking.status === 'meeting_started') && (
                  <button
                    onClick={() => handleOpenChat(booking)}
                    className="flex items-center gap-2 px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                  >
                    <FaComments className="w-3 h-3" />
                    Open Chat
                  </button>
                )}
                {(booking.status === 'pending' || booking.status === 'confirmed') && (
                  <button
                    onClick={() => handleCancelBooking(booking)}
                    className="flex items-center gap-2 px-3 py-1 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-sm"
                  >
                    <FaBan className="w-3 h-3" />
                    Cancel
                  </button>
                )}
                {/* Note: Companions do NOT leave reviews for clients */}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cancellation Modal for Confirmed Bookings */}
      <CancellationModal
        isOpen={showCancellationModal}
        onClose={() => {
          setShowCancellationModal(false);
          setSelectedBooking(null);
        }}
        onConfirm={handleConfirmCancellation}
        userRole="companion"
        bookingType="booking"
        bookingStatus={selectedBooking?.status === 'confirmed' ? 'confirmed' : 'pending'}
        isSubmitting={isCancelling}
      />

      {/* Cancellation Modal for Pending Requests */}
      <CancellationModal
        isOpen={showPendingCancellationModal}
        onClose={() => {
          setShowPendingCancellationModal(false);
          setSelectedPendingRequest(null);
        }}
        onConfirm={handleConfirmPendingCancellation}
        userRole="companion"
        bookingType="request"
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
          clientName={chatBooking.clientName}
        />
      )}

      {/* Note: Companions do NOT review clients - review modal removed */}
    </div>
  );
};

export default BookingsManager;

