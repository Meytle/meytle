/**
 * Client Dashboard Page
 * Dashboard for client users with tabs: Overview, Bookings, Custom Requests
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useSocket } from '../../context/SocketContext';
import { useOTPVerification } from '../../hooks/useOTPVerification';
import type { Booking } from '../../types';
import { getImageUrl } from '../../utils/imageHelpers';
import { formatTimeRange } from '../../utils/timeConverter';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import CancellationModal from '../../components/booking/CancellationModal';
import OTPVerificationModal from '../../components/booking/OTPVerificationModal';
import ChatBox from '../../components/messaging/ChatBox';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ROUTES } from '../../constants';
import { bookingApi } from '../../api/booking';
import { authApi } from '../../api/auth';
import clientApi from '../../api/client';
import {
  FaCalendarAlt,
  FaIdCard,
  FaSearch,
  FaUser,
  FaHeart,
  FaCreditCard,
  FaUserTie,
  FaMoneyBillWave,
  FaClock,
  FaCheckCircle,
  FaExclamationCircle,
  FaExclamationTriangle,
  FaChevronRight,
  FaUserCircle,
  FaBan,
  FaComments,
  FaBell,
  FaHistory,
  FaChevronDown,
  FaMapMarkerAlt
} from 'react-icons/fa';
import ErrorBoundary from '../../components/ErrorBoundary';
import AsyncErrorBoundary, { useAsyncError } from '../../components/AsyncErrorBoundary';
import logger, { logComponentError } from '../../utils/logger';
import { shouldAutoComplete, sortBookingsByPriority } from '../../utils/bookingHelpers';
import PendingReviewBanner from '../../components/PendingReviewBanner';

type VerificationStatus = 'not_submitted' | 'pending' | 'approved' | 'rejected';

// Booking Request type matching the API response structure
type BookingRequest = {
  id: number;
  clientId: number;
  companionId: number;
  requestedDate: string;
  preferredTime?: string;
  startTime?: string;
  endTime?: string;
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
  cancellationReason?: string;
  cancelledBy?: 'client' | 'companion';
  cancelledAt?: string;
};

const ClientDashboard = () => {
  const { user, checkAuth } = useAuth();
  const { throwError } = useAsyncError();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Initialize activeTab from URL parameter, default to 'overview'
  const tabFromUrl = searchParams.get('tab') as 'overview' | 'bookings' | null;
  const [activeTab, setActiveTab] = useState<'overview' | 'bookings'>(
    tabFromUrl && ['overview', 'bookings'].includes(tabFromUrl) ? tabFromUrl : 'overview'
  );
  const [bookingFilter, setBookingFilter] = useState<'all' | 'pending' | 'confirmed' | 'completed' | 'cancelled'>('all');
  const [expandedWeekdays, setExpandedWeekdays] = useState<Set<string>>(new Set());
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('not_submitted');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(true);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<BookingRequest | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [userTimezone, setUserTimezone] = useState<string>('UTC');
  const [showChatBox, setShowChatBox] = useState(false);
  const [chatBooking, setChatBooking] = useState<Booking | null>(null);
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [isProfileComplete, setIsProfileComplete] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Used to trigger data refresh from socket events
  const navigate = useNavigate();
  const openChatProcessedRef = useRef<number | null>(null); // Track which booking ID was already opened via URL

  // Real-time socket connection - using shared SocketContext (no duplicate connections)
  const { isConnected: socketConnected, lastBookingEvent } = useSocket();

  // Handle booking events from shared socket connection
  // Only refresh data for events that actually change the bookings list
  useEffect(() => {
    if (!lastBookingEvent) return;

    const { type, data } = lastBookingEvent;
    console.log('📣 [ClientDashboard] Booking event received:', type);

    // Show appropriate toast based on event type
    switch (type) {
      case 'approved':
        toast.success(`Booking with ${data.companionName} approved`);
        break;
      case 'cancelled':
        toast.error(`Booking cancelled`);
        break;
      case 'request_accepted':
        toast.success('Request accepted');
        break;
      case 'request_rejected':
        toast.error('Request declined');
        break;
      case 'request_cancelled':
        toast.error('Request cancelled');
        break;
      case 'otp_sent':
        // Don't show toast - OTP modal handles this
        break;
      case 'expired':
        toast.error('Booking expired');
        break;
    }

    // Only refresh data for events that actually change bookings list
    // DON'T refresh for: otp_sent, payment_captured, verification_extended
    // These events don't change the booking lists and cause unnecessary re-renders
    const eventsRequiringRefresh = ['approved', 'cancelled', 'request_accepted', 'request_rejected', 'request_cancelled', 'expired', 'created'];
    if (eventsRequiringRefresh.includes(type)) {
      setRefreshTrigger(prev => prev + 1);
    }
  }, [lastBookingEvent]);

  // Refresh auth state when redirected from email verification
  useEffect(() => {
    const verified = searchParams.get('verified');
    if (verified) {
      checkAuth(); // Refresh user data from cookies
      // Clean up the URL parameter
      setSearchParams(prev => {
        const newParams = new URLSearchParams(prev);
        newParams.delete('verified');
        return newParams;
      }, { replace: true });
    }
  }, [searchParams, checkAuth, setSearchParams]);

  // OTP Verification Modal - auto-triggers for bookings requiring verification
  const { showModal: showOTPModal, currentBooking: otpBooking, handleVerificationComplete } = useOTPVerification(bookings, 'client');

  // ✅ FIX: Memoize the OTP completion callback to prevent unnecessary re-renders
  const handleOTPComplete = useCallback(() => {
    handleVerificationComplete();
    fetchBookings();
  }, [handleVerificationComplete]);

  // Function to change tab and update URL
  const changeTab = (tab: 'overview' | 'bookings') => {
    setActiveTab(tab);
    // Only update URL if tab parameter is different (prevents unnecessary re-renders)
    const currentTab = searchParams.get('tab');
    if (currentTab !== tab) {
      setSearchParams(prev => {
        const newParams = new URLSearchParams(prev);
        newParams.set('tab', tab);
        return newParams;
      }, { replace: true });
    }
  };

  // Safe accessors with fallbacks
  const safeBookings = bookings || [];
  const safeBookingRequests = bookingRequests || [];

  // Handle openChat URL parameter
  useEffect(() => {
    const openChatParam = searchParams.get('openChat');
    if (openChatParam && bookings.length > 0) {
      const bookingId = parseInt(openChatParam);
      
      // Only process if we haven't already processed this booking ID
      if (openChatProcessedRef.current !== bookingId) {
        const booking = bookings.find(b => b.id === bookingId);
        
        if (booking) {
          openChatProcessedRef.current = bookingId; // Mark as processed
          setChatBooking(booking);
          setShowChatBox(true);
          
          // Remove the parameter from URL
          const newSearchParams = new URLSearchParams(searchParams);
          newSearchParams.delete('openChat');
          setSearchParams(newSearchParams, { replace: true });
        }
      }
    }
  }, [searchParams, bookings]);

  useEffect(() => {
    // Initial fetch
    fetchBookings();
    fetchBookingRequests();
    fetchVerificationStatus();
    checkProfileCompletion();

    // ✅ No polling needed - real-time updates via Socket.IO handle everything
    // fetchBookings and fetchBookingRequests are called on mount and when socket events
    // increment refreshTrigger, triggering automatic re-fetch without infinite loops
  }, [refreshTrigger]);

  const checkProfileCompletion = async () => {
    try {
      const response = await clientApi.getProfile();
      const profile = response.user;
      const verification = response.verification;
      
      console.log('🔍 Dashboard: Checking profile completion:', {
        user: profile,
        verification: verification
      });
      
      // Check if profile is complete (has address, photos, and ID verified)
      // Use verification data from client_verifications table
      // Required: city, state, country (postalCode is optional)
      const hasAddress = !!(
        verification?.city && 
        verification?.state && 
        verification?.country
      );
      const hasProfilePic = !!(verification?.profilePhotoUrl || profile?.profilePicture);
      const isIdVerified = verification?.verificationStatus === 'approved';
      
      console.log('📊 Dashboard: Profile completion check:', {
        hasAddress,
        hasProfilePic,
        isIdVerified,
        verificationStatus: verification?.verificationStatus
      });
      
      const profileComplete = hasAddress && hasProfilePic && isIdVerified;
      setIsProfileComplete(!!profileComplete);
      
      console.log('✅ Dashboard: Profile complete:', profileComplete);
    } catch (error) {
      console.error('Error checking profile completion:', error);
      // If error, assume profile is not complete
      setIsProfileComplete(false);
    }
  };

  const fetchBookings = async () => {
    try {
      setIsLoadingBookings(true);
      const response = await bookingApi.getBookings();
      
      // Handle new response format {bookings: [], userTimezone: ''}
      const fetchedBookings = Array.isArray(response) ? response : response.bookings;
      const timezone = Array.isArray(response) ? 'UTC' : (response.userTimezone || 'UTC');
      
      setUserTimezone(timezone);
      logger.info('Client received bookings', { 
        bookingsCount: fetchedBookings?.length || 0,
        timezone 
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
      logComponentError('ClientDashboard', error, { action: 'fetchBookings' });
      toast.error('Failed to load bookings');
      throwError(error);
    } finally {
      setIsLoadingBookings(false);
    }
  };

  // Helpers for status display and formatting
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <FaClock className="text-yellow-500" />;
      case 'confirmed':
        return <FaCheckCircle className="text-green-500" />;
      case 'meeting_started':
        return <FaCheckCircle className="text-purple-500" />;
      case 'completed':
        return <FaCheckCircle className="text-[#312E81]" />;
      case 'cancelled':
        return <FaExclamationCircle className="text-red-500" />;
      default:
        return <FaExclamationCircle className="text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'meeting_started':
        return 'bg-purple-100 text-purple-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Awaiting Approval';
      case 'confirmed':
        return 'Approved';
      case 'meeting_started':
        return 'In Progress';
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
      if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return 'Time not available';
      }
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 || 12;
      return `${displayHour}:${minutes} ${ampm}`;
    } catch (error) {
      return 'Time not available';
    }
  };

  const fetchBookingRequests = async () => {
    try {
      setIsLoadingRequests(true);
      const response = await bookingApi.getBookingRequests({ role: 'client' });
      
      // Handle response format {requests: [], userTimezone: ''}
      const requests = Array.isArray(response) ? response : (response.requests || []);
      const timezone = Array.isArray(response) ? userTimezone : (response.userTimezone || userTimezone);
      
      // Update timezone if provided (should be same as bookings, but just in case)
      if (timezone && timezone !== 'UTC') {
        setUserTimezone(timezone);
      }
      
      logger.info('Client received booking requests', { 
        requestsCount: requests?.length || 0,
        timezone 
      });
      setBookingRequests(requests);
    } catch (error) {
      logComponentError('ClientDashboard', error, { action: 'fetchBookingRequests' });
      // Don't show error toast for booking requests, just log it
    } finally {
      setIsLoadingRequests(false);
    }
  };

  const fetchVerificationStatus = async () => {
    try {
      const status = await clientApi.getVerificationStatus();
      setVerificationStatus(status.verificationStatus || 'not_submitted');
    } catch (error) {
      logComponentError('ClientDashboard', error, { action: 'fetchVerificationStatus' });
      // Default to not_submitted if there's an error
      setVerificationStatus('not_submitted');
    }
  };

  const handleBrowseCompanions = () => {
    navigate('/browse-companions');
  };

  const handleCancelBooking = (booking: Booking) => {
    setSelectedBooking(booking);
    setSelectedRequest(null);
    setShowCancellationModal(true);
  };

  const handleOpenChat = (booking: Booking) => {
    setChatBooking(booking);
    setShowChatBox(true);
  };

  const handleCancelRequest = (request: BookingRequest) => {
    setSelectedRequest(request);
    setSelectedBooking(null);
    setShowCancellationModal(true);
  };

  const handleResendVerification = async () => {
    try {
      setIsResendingEmail(true);
      const response = await authApi.resendVerificationEmail();
      // Use backend message to avoid duplicate toasts
      const message = response?.data?.message || 'Verification email sent!';
      toast.success(message);

      // If already verified, refresh auth state to update UI
      if (response?.data?.alreadyVerified) {
        await checkAuth();
      }
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to send verification email';
      toast.error(message);
    } finally {
      setIsResendingEmail(false);
    }
  };

  const handleConfirmCancellation = async (reason: string) => {
    try {
      setIsCancelling(true);

      if (selectedBooking) {
        // Cancel regular booking
        await bookingApi.cancelBooking(selectedBooking.id, reason);
        toast.success('Booking cancelled successfully');
      } else if (selectedRequest) {
        // Cancel booking request
        await bookingApi.cancelBookingRequest(selectedRequest.id, reason);
        toast.success('Request cancelled successfully');
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
      
      // Check for 3-hour restriction error
      if (error.response?.status === 400 && error.response?.data?.hoursRemaining !== undefined) {
        toast.error(error.response.data.message);
      } else {
        toast.error(error.response?.data?.message || 'Failed to cancel');
      }
    } finally {
      setIsCancelling(false);
    }
  };

  // Initialize expanded weekdays when bookings load and filter is 'all'
  useEffect(() => {
    if (bookingFilter === 'all' && safeBookings.length > 0) {
      const weekdaysWithBookings = new Set<string>();
      safeBookings.forEach(booking => {
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
  }, [bookings, bookingFilter]);

  // Helper function to check if a booking is in the future
  const isBookingUpcoming = (booking: Booking): boolean => {
    if (!booking.bookingDate || !booking.startTime) return false;
    
    // Combine date and time for accurate comparison
    const bookingDateTime = new Date(`${booking.bookingDate}T${booking.startTime}`);
    const now = new Date();
    
    return bookingDateTime > now;
  };

  // Helper functions for filtering bookings
  const confirmedBookings = safeBookings.filter(b => b.status === 'confirmed' || b.status === 'meeting_started');
  const completedBookings = safeBookings.filter(b => b.status === 'completed');
  const cancelledBookings = safeBookings.filter(b => b.status === 'cancelled');
  
  // Pending bookings for overview section only
  const pendingBookings = safeBookings.filter(b => b.status === 'pending');
  
  const pendingRequests = safeBookingRequests.filter(r => r.status === 'pending');
  
  // Recent bookings: show most recent bookings (excluding pending) - same as companion dashboard
  // Sort by date descending (most recent first), then take first 2 for preview
  const recentBookings = safeBookings
    .filter(b => b.status !== 'pending') // Exclude pending as they're shown separately
    .sort((a, b) => new Date(b.bookingDate).getTime() - new Date(a.bookingDate).getTime());
  
  const recentBookingsPreview = recentBookings.slice(0, 2);
  
  const getFilteredBookings = () => {
    if (bookingFilter === 'all') return safeBookings;
    // Include meeting_started with confirmed (it's an active meeting)
    if (bookingFilter === 'confirmed') {
      return safeBookings.filter(b => b.status === 'confirmed' || b.status === 'meeting_started');
    }
    return safeBookings.filter(b => b.status === bookingFilter);
  };

  const filteredBookings = getFilteredBookings();

  // Group bookings by day of week for weekly view (when filter === 'all')
  const groupBookingsByWeekday = (bookings: Booking[]) => {
    const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const grouped: { [key: string]: Booking[] } = {};

    // Initialize all weekdays with empty arrays
    weekdays.forEach(day => {
      grouped[day] = [];
    });

    // Add special group for invalid dates
    grouped['Unknown'] = [];

    // Group bookings by their weekday
    bookings.forEach(booking => {
      const bookingDate = booking.bookingDate;
      
      // Handle null, undefined, empty, or invalid dates
      if (!bookingDate || bookingDate === 'null' || bookingDate === '') {
        grouped['Unknown'].push(booking);
        return;
      }

      const date = new Date(bookingDate);
      
      if (isNaN(date.getTime())) {
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
        const aDate = new Date(a.bookingDate);
        const bDate = new Date(b.bookingDate);

        if (isNaN(aDate.getTime()) || isNaN(bDate.getTime())) return 0;

        // Add time components
        const aStartTime = a.startTime || '00:00';
        const bStartTime = b.startTime || '00:00';

        const [aHours, aMinutes] = aStartTime.split(':').map(Number);
        const [bHours, bMinutes] = bStartTime.split(':').map(Number);

        aDate.setHours(aHours || 0, aMinutes || 0, 0, 0);
        bDate.setHours(bHours || 0, bMinutes || 0, 0, 0);

        return bDate.getTime() - aDate.getTime(); // Newest first
      });
    });

    return grouped;
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

  // Show full-page loader until user data and initial bookings are loaded
  // This prevents flash of empty content during navigation
  if (!user || isLoadingBookings) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">My Dashboard</h1>
              <p className="mt-1 text-xs sm:text-sm text-gray-500">Manage your bookings and activity</p>
            </div>
            {/* Real-time Connection Indicator */}
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              <span className={`text-xs font-medium ${socketConnected ? 'text-green-700' : 'text-gray-500'}`}>
                {socketConnected ? 'Live' : 'Connecting...'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Email Verification Banner */}
        {!!user && !user.emailVerified && (
          <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg">
            <div className="flex items-start">
              <FaExclamationTriangle className="text-yellow-400 text-xl mt-0.5 mr-3 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-yellow-800 mb-1">
                  Email Verification Required
                </h3>
                <p className="text-sm text-yellow-700 mb-3">
                  Please verify your email address to access all features. Check your inbox for the verification link.
                </p>
                <button
                  onClick={handleResendVerification}
                  disabled={isResendingEmail}
                  className="inline-flex items-center px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isResendingEmail ? 'Sending...' : 'Resend Verification Email'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Profile Completion Banner */}
        {!!user && !isProfileComplete && (
          <div className="mb-6 bg-blue-50 border-l-4 border-blue-400 p-4 rounded-lg">
            <div className="flex items-start">
              <FaExclamationTriangle className="text-blue-400 text-xl mt-0.5 mr-3 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-blue-800 mb-1">
                  Complete Your Profile
                </h3>
                <p className="text-sm text-blue-700 mb-3">
                  Complete your profile to enhance your experience. Add your address, upload photos, and verify your identity.
                </p>
                <button
                  onClick={() => navigate(ROUTES.CLIENT_PROFILE)}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
                >
                  Complete Profile
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pending Review Banner */}
        {!!user && user.emailVerified && isProfileComplete && (
          <PendingReviewBanner 
            onReviewsUpdated={() => {
              // Refresh bookings after review is submitted
              fetchBookings();
            }}
          />
        )}

        {/* Tab Navigation */}
        <div className="mb-8">
          <nav className="flex space-x-8">
            <button
              onClick={() => changeTab('overview')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'border-[#312E81] text-[#312E81]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <FaUser className="w-4 h-4" />
                Overview
              </div>
            </button>
            <button
              onClick={() => changeTab('bookings')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'bookings'
                  ? 'border-[#312E81] text-[#312E81]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <FaCalendarAlt className="w-4 h-4" />
                Bookings
              </div>
            </button>
          </nav>
        </div>

        {/* Tab Content - Keep mounted, hide with CSS to prevent remount */}
        <div className={activeTab === 'overview' ? '' : 'hidden'}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Pending Approvals - HIGHEST PRIORITY (Needs Action) */}
              {!isLoadingBookings && pendingBookings.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm p-6 border-2 border-yellow-200 bg-yellow-50/30">
                  <div className="mb-6">
                    <div className="flex items-center gap-3 mb-2">
                      <FaClock className="text-yellow-600 text-xl" />
                      <h2 className="text-xl font-bold text-gray-900">Pending Approvals</h2>
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-full">
                        {pendingBookings.length} Pending
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 ml-8">
                      Bookings waiting for companion approval
                    </p>
                  </div>

                  <div className="space-y-4">
                    {pendingBookings.slice(0, 2).map((booking) => (
                      <div
                        key={booking.id}
                        className="border border-yellow-200 rounded-lg p-4 bg-yellow-50/50 hover:bg-yellow-100/50 cursor-pointer transition-colors"
                        onClick={() => {
                          setBookingFilter('pending');
                          changeTab('bookings');
                        }}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center gap-3 flex-1">
                            {booking.companionPhoto ? (
                              <img
                                src={getImageUrl(booking.companionPhoto)}
                                alt={booking.companionName || 'Companion'}
                                className="w-12 h-12 rounded-full object-cover border-2 border-yellow-300"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                }}
                              />
                            ) : null}
                            <div className={`w-12 h-12 rounded-full bg-gradient-to-r from-[#312E81] to-[#FFCCCB] flex items-center justify-center ${booking.companionPhoto ? 'hidden' : ''}`}>
                              <FaUser className="text-white text-sm" />
                            </div>
                            <div>
                              <h4 className="font-semibold text-gray-900">{booking.companionName || 'Companion'}</h4>
                              <p className="text-sm text-gray-600">
                                {formatDate(booking.bookingDate)} at {formatTimeRange(booking.startTime, booking.endTime, booking.bookingDate, userTimezone)}
                              </p>
                            </div>
                          </div>
                          <span className="text-sm font-bold text-gray-900">${(booking.totalAmount || 0).toFixed(2)}</span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-sm text-yellow-700 font-medium">
                            Click to view details
                          </span>
                          <FaChevronRight className="text-yellow-600" />
                        </div>
                      </div>
                    ))}
                    {pendingBookings.length > 2 && (
                      <button
                        onClick={() => {
                          setBookingFilter('pending');
                          changeTab('bookings');
                        }}
                        className="w-full text-center text-sm text-yellow-700 hover:text-yellow-800 font-medium py-2"
                      >
                        View all {pendingBookings.length} pending →
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Custom Time Requests */}
              {!isLoadingRequests && bookingRequests.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                  <div className="mb-6">
                    <div className="flex items-center gap-3 mb-2">
                      <FaBell className="text-[#312E81] text-xl" />
                      <h2 className="text-xl font-bold text-gray-900">Custom Time Requests</h2>
                      {pendingRequests.length > 0 && (
                        <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-semibold rounded-full">
                          {pendingRequests.length} Pending
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 ml-8">
                      Your custom booking requests for specific times
                    </p>
                  </div>

                  <div className="space-y-4">
                    {bookingRequests.filter(r => r.status !== 'accepted').slice(0, 2).map((request) => (
                      <div key={request.id} className="border-2 border-[#FFCCCB] bg-[#FFF5F5] rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center gap-3 flex-1">
                            {request.companionPhoto ? (
                              <img
                                src={getImageUrl(request.companionPhoto)}
                                alt={request.companionName || 'Companion'}
                                className="w-10 h-10 rounded-full object-cover border-2 border-[#FFCCCB]"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                                  if (fallback) fallback.classList.remove('hidden');
                                }}
                              />
                            ) : null}
                            <div className={`w-10 h-10 rounded-full bg-gradient-to-r from-[#312E81] to-[#FFCCCB] flex items-center justify-center flex-shrink-0 ${request.companionPhoto ? 'hidden' : ''}`}>
                              <span className="text-white font-semibold text-sm">
                                {request.companionName?.charAt(0) || 'C'}
                              </span>
                            </div>
                            <div>
                              <h4 className="font-semibold text-gray-900">{request.companionName || 'Companion'}</h4>
                              <p className="text-sm text-gray-600">{formatDate(request.requestedDate)}</p>
                            </div>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            request.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            request.status === 'accepted' ? 'bg-green-100 text-green-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {request.status === 'pending' ? 'Awaiting Response' :
                             request.status === 'accepted' ? 'Accepted' : 'Declined'}
                          </span>
                        </div>

                        <div className="space-y-1 text-sm text-gray-600 mb-3">
                          {request.startTime && request.endTime && (
                            <p>
                              <FaClock className="inline mr-1 text-xs" />
                              {formatTimeRange(request.startTime, request.endTime, request.requestedDate, userTimezone)}
                            </p>
                          )}
                          {request.specialRequests && (
                            <p className="italic text-gray-500">"{request.specialRequests}"</p>
                          )}
                        </div>

                        {request.status === 'pending' && (
                          <button
                            onClick={() => handleCancelRequest(request)}
                            className="text-xs px-3 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50 transition-colors"
                          >
                            Cancel Request
                          </button>
                        )}
                      </div>
                    ))}
                    {bookingRequests.filter(r => r.status !== 'accepted').length > 2 && (
                      <button
                        onClick={() => changeTab('bookings')}
                        className="w-full text-center text-sm text-purple-700 hover:text-purple-800 font-medium py-2"
                      >
                        View all {bookingRequests.filter(r => r.status !== 'accepted').length} requests →
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Recent Bookings */}
              <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-2">
                    <FaHistory className="text-[#312E81] text-xl" />
                    <h2 className="text-xl font-bold text-gray-900">Recent Bookings</h2>
                  </div>
                  <p className="text-sm text-gray-500 ml-8">
                    Your most recent confirmed bookings
                  </p>
                </div>

                {isLoadingBookings ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#312E81]" />
                  </div>
                ) : recentBookingsPreview.length === 0 ? (
                  <div className="text-center py-12">
                    <FaCalendarAlt className="mx-auto text-6xl text-gray-300 mb-4" />
                    <p className="text-gray-500 text-lg">No bookings yet</p>
                    <p className="text-gray-400 text-sm mt-2">
                      Book a companion to see your bookings here
                    </p>
                    <button
                      onClick={handleBrowseCompanions}
                      className="mt-4 px-4 py-2 bg-gradient-to-r from-[#312E81] to-[#FFCCCB] text-white rounded-lg hover:shadow-lg transition-all"
                    >
                      Browse Companions
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {recentBookingsPreview.map((booking) => (
                      <div key={booking.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center gap-3 flex-1">
                            {booking.companionPhoto ? (
                              <img 
                                src={getImageUrl(booking.companionPhoto)}
                                alt={booking.companionName || 'Companion'}
                                className="w-10 h-10 rounded-full object-cover border-2 border-gray-200"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                }}
                              />
                            ) : null}
                            <div className={`w-10 h-10 rounded-full bg-gradient-to-r from-[#312E81] to-[#FFCCCB] flex items-center justify-center ${booking.companionPhoto ? 'hidden' : ''}`}>
                              <FaUser className="text-white text-sm" />
                            </div>
                            <div>
                            <h4 className="font-semibold text-gray-900">{booking.companionName || 'Companion'}</h4>
                            <p className="text-sm text-gray-600">
                              {formatDate(booking.bookingDate)} at {formatTimeRange(booking.startTime, booking.endTime, booking.bookingDate, userTimezone)}
                            </p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              booking.status === 'completed' ? 'bg-green-100 text-green-700' :
                              booking.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
                              booking.status === 'meeting_started' ? 'bg-purple-100 text-purple-700' :
                              booking.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                              booking.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {booking.status === 'meeting_started' ? 'In Progress' : booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                            </span>
                            <span className="text-sm font-bold text-gray-900">${(booking.totalAmount || 0).toFixed(2)}</span>
                          </div>
                        </div>

                        {booking.meetingLocation && (
                          <p className="text-sm text-gray-600 mb-2 flex items-center gap-1">
                            <FaMapMarkerAlt className="w-3 h-3 text-red-500" />
                            {booking.meetingLocation}
                          </p>
                        )}

                        <button
                          onClick={() => {
                            setBookingFilter('all');
                            changeTab('bookings');
                          }}
                          className="text-xs text-[#312E81] hover:text-[#1E1B4B] font-medium flex items-center gap-1"
                        >
                          View Details <FaChevronRight className="text-[10px]" />
                        </button>
                      </div>
                    ))}
                    {recentBookings.length > 2 && (
                      <button
                        onClick={() => {
                          setBookingFilter('all');
                          changeTab('bookings');
                        }}
                        className="w-full text-center text-sm text-[#312E81] hover:text-[#1E1B4B] font-medium py-2"
                      >
                        View all {recentBookings.length} bookings →
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Sidebar */}
            <div className="space-y-6">
              {/* Quick Actions */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Quick Actions</h2>
                <div className="space-y-3">
                  {/* Highlighted Primary Action */}
                  <button
                    onClick={handleBrowseCompanions}
                    className="w-full flex items-center gap-3 p-3 bg-gradient-to-r from-[#312E81] to-[#4338CA] rounded-lg hover:from-[#3730A3] hover:to-[#4F46E5] hover:shadow-lg transition-all duration-200 group"
                  >
                    <FaSearch className="text-xl text-white/80 group-hover:text-white transition-colors" />
                    <div className="text-left flex-1">
                      <h3 className="font-semibold text-white text-sm">Browse Companions</h3>
                      <p className="text-xs text-white/70">Find your perfect match</p>
                    </div>
                  </button>

                  <button
                    onClick={() => changeTab('bookings')}
                    className="w-full flex items-center gap-3 p-3 border-2 border-gray-200 rounded-lg hover:border-[#312E81] hover:bg-[#312E81]/10 hover:shadow-[0_0_15px_rgba(255,204,203,0.3)] transition-all duration-200 group"
                  >
                    <FaCalendarAlt className="text-xl text-gray-400 group-hover:text-[#312E81] transition-colors" />
                    <div className="text-left flex-1">
                      <h3 className="font-semibold text-gray-900 text-sm">My Bookings</h3>
                      <p className="text-xs text-gray-500">View your bookings</p>
                    </div>
                  </button>

                  <button
                    onClick={() => navigate('/favorites')}
                    className="w-full flex items-center gap-3 p-3 border-2 border-gray-200 rounded-lg hover:border-[#FFCCCB] hover:bg-[#FFCCCB]/10 hover:shadow-[0_0_15px_rgba(255,204,203,0.3)] transition-all duration-200 group"
                  >
                    <FaHeart className="text-xl text-gray-400 group-hover:text-[#FF9F9F] transition-colors" />
                    <div className="text-left flex-1">
                      <h3 className="font-semibold text-gray-900 text-sm">My Favorites</h3>
                      <p className="text-xs text-gray-500">Saved companions</p>
                    </div>
                  </button>

                  <button
                    onClick={() => navigate(ROUTES.CLIENT_PROFILE)}
                    className="w-full flex items-center gap-3 p-3 border-2 border-gray-200 rounded-lg hover:border-[#312E81] hover:bg-[#312E81]/10 hover:shadow-[0_0_15px_rgba(255,204,203,0.3)] transition-all duration-200 group"
                  >
                    <FaUser className="text-xl text-gray-400 group-hover:text-[#312E81] transition-colors" />
                    <div className="text-left flex-1">
                      <h3 className="font-semibold text-gray-900 text-sm">My Profile</h3>
                      <p className="text-xs text-gray-500">Edit your information</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Quick Stats</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                    <span className="text-gray-600 text-sm">Total Bookings</span>
                    <span className="text-2xl font-bold text-gray-900">{bookings.length}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                    <span className="text-gray-600 text-sm">Upcoming</span>
                    <span className="text-2xl font-bold text-[#312E81]">
                      {safeBookings.filter(b => 
                        (b.status === 'confirmed' || b.status === 'pending') && 
                        isBookingUpcoming(b)
                      ).length}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 text-sm">Completed</span>
                    <span className="text-2xl font-bold text-success-600">
                      {bookings.filter(b => b.status === 'completed').length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Become a Companion - Info Banner */}
              <div className="bg-gradient-to-br from-[#F5F4FB] to-[#FFF0F0] rounded-lg shadow-md border-2 border-[#312E81]/20 p-6">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-[#312E81] to-[#FFCCCB] rounded-full flex items-center justify-center">
                    <FaUserTie className="text-white text-xl" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-1">Want to Earn?</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      Become a companion and start earning money!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={activeTab === 'bookings' ? '' : 'hidden'}>
          <div className="space-y-6">
            {/* Bookings Section with Filters */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
              {/* Header - Stacks on mobile, inline on desktop */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <FaCalendarAlt className="text-[#312E81] text-xl" />
                  <h2 className="text-xl font-bold text-gray-900">My Bookings</h2>
                </div>

                {/* Filter Buttons */}
                <div className="flex items-center gap-2">
                  {/* Scrollable filter tabs */}
                  <div className="flex gap-2 items-center overflow-x-auto pb-2 sm:pb-0 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-thin scrollbar-thumb-gray-300">
                    <button
                    onClick={() => setBookingFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                      bookingFilter === 'all'
                        ? 'bg-[#312E81] text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setBookingFilter('pending')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                      bookingFilter === 'pending'
                        ? 'bg-[#312E81] text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <span className="sm:hidden">Pending</span>
                    <span className="hidden sm:inline">Pending Approvals</span>
                  </button>
                  <button
                    onClick={() => setBookingFilter('confirmed')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                      bookingFilter === 'confirmed'
                        ? 'bg-[#312E81] text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Confirmed
                  </button>
                  <button
                    onClick={() => setBookingFilter('completed')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                      bookingFilter === 'completed'
                        ? 'bg-[#312E81] text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Completed
                  </button>
                  <button
                    onClick={() => setBookingFilter('cancelled')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                      bookingFilter === 'cancelled'
                        ? 'bg-[#312E81] text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Cancelled
                    </button>
                  </div>
                </div>
              </div>

              {/* Filtered Bookings List */}
              {isLoadingBookings ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse">
                      <div className="bg-gray-200 rounded-lg h-32"></div>
                    </div>
                  ))}
                </div>
              ) : bookings.length === 0 ? (
                <div className="text-center py-12">
                  <FaCalendarAlt className="mx-auto text-6xl text-gray-300 mb-4" />
                  <p className="text-gray-500 text-lg">No bookings yet</p>
                  <p className="text-gray-400 text-sm mt-2">
                    Start browsing companions to make your first booking
                  </p>
                  <button
                    onClick={handleBrowseCompanions}
                    className="mt-6 px-6 py-2.5 bg-gradient-to-r from-[#312E81] to-[#FFCCCB] text-white font-medium rounded-lg hover:from-[#1E1B4B] hover:to-[#FFCCCB] hover:shadow-[0_0_25px_rgba(255,204,203,0.5)] transition-all duration-200 shadow-md hover:shadow-lg"
                  >
                    Browse Companions
                  </button>
                </div>
              ) : filteredBookings.length === 0 ? (
                <div className="text-center py-12">
                  <FaCalendarAlt className="mx-auto text-6xl text-gray-300 mb-4" />
                  <p className="text-gray-500 text-lg">No {bookingFilter} bookings</p>
                  <p className="text-gray-400 text-sm mt-2">
                    Try selecting a different filter
                  </p>
                </div>
              ) : bookingFilter === 'all' ? (
                // Weekly grouped view for 'all' filter
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
                    const groupedBookings = groupBookingsByWeekday(filteredBookings);
                    const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

                    return weekdays.map(weekday => {
                      const weekdayBookings = groupedBookings[weekday];
                      const isExpanded = expandedWeekdays.has(weekday);
                      const hasBookings = weekdayBookings.length > 0;

                      return (
                        <div key={weekday} className="border border-gray-200 rounded-lg overflow-hidden">
                          {/* Clickable Weekday Header */}
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

                          {/* Collapsible Bookings Content */}
                          {hasBookings && (
                            <div className={`divide-y divide-gray-100 overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                              {weekdayBookings.map(booking => (
                                <div key={booking.id} className="p-4 hover:bg-gray-50 transition-colors">
                                  <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                      {booking.companionPhoto ? (
                                        <img 
                                          src={getImageUrl(booking.companionPhoto)}
                                          alt={booking.companionName || 'Companion'}
                                          className="w-10 h-10 rounded-full object-cover"
                                        />
                                      ) : (
                                      <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#312E81] to-[#FFCCCB] flex items-center justify-center text-white font-semibold">
                                        {booking.companionName?.charAt(0) || 'C'}
                                      </div>
                                      )}
                                      <div>
                                        <h3 className="font-semibold text-gray-900">{booking.companionName || 'Companion'}</h3>
                                        <p className="text-sm text-gray-500">{formatDate(booking.bookingDate)}</p>
                                      </div>
                                    </div>
                                    <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${getStatusColor(booking.status)}`}>
                                      {getStatusIcon(booking.status)}
                                      {getStatusLabel(booking.status)}
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                      <FaClock className="w-4 h-4" />
                                      <span>{formatTimeRange(booking.startTime, booking.endTime, booking.bookingDate, userTimezone)}</span>
                                    </div>
                                    <div className="text-sm text-gray-600">
                                      <span className="font-medium">${(booking.totalAmount || 0).toFixed(2)}</span>
                                      <span className="ml-1">({booking.durationHours || 0}h)</span>
                                    </div>
                                  </div>

                                  {booking.meetingLocation && (
                                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                                      <FaMapMarkerAlt className="w-4 h-4 text-red-500" />
                                      <span>{booking.meetingLocation}</span>
                                    </div>
                                  )}

                                  {booking.specialRequests && (
                                    <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                                      <p className="text-sm text-gray-600 italic">"{booking.specialRequests}"</p>
                                    </div>
                                  )}

                                  {/* Cancellation Details */}
                                  {booking.status === 'cancelled' && booking.cancellationReason && (
                                    <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
                                      <div className="flex items-start gap-2">
                                        <FaBan className="w-4 h-4 text-red-600 mt-0.5" />
                                        <div>
                                          <p className="text-sm font-medium text-red-800">
                                            Cancelled by {booking.cancelledBy === 'client' ? 'You' : 'Companion'}
                                          </p>
                                          <p className="text-sm italic text-red-700">
                                            "{booking.cancellationReason}"
                                          </p>
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
                                    {/* Note: "Leave Review" button removed - reviews only via dashboard banner */}
                                    <button
                                      onClick={() => navigate(`/companion/${booking.companionId}`)}
                                      className="flex items-center gap-2 px-3 py-1 bg-[#312E81] text-white rounded-lg hover:bg-[#312E81]/90 transition-colors text-sm"
                                    >
                                      <FaUserCircle className="w-3 h-3" />
                                      View Profile
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}

                  {/* Unknown dates section */}
                  {(() => {
                    const groupedBookings = groupBookingsByWeekday(filteredBookings);
                    const unknownBookings = groupedBookings['Unknown'] || [];
                    
                    if (unknownBookings.length === 0) return null;

                    return (
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-gradient-to-r from-[#f9f8ff] to-blue-50 px-4 py-3">
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-gray-900">Unknown date</h3>
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
                                  {booking.companionPhoto ? (
                                    <img 
                                      src={getImageUrl(booking.companionPhoto)}
                                      alt={booking.companionName || 'Companion'}
                                      className="w-10 h-10 rounded-full object-cover"
                                    />
                                  ) : (
                                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#312E81] to-[#FFCCCB] flex items-center justify-center text-white font-semibold">
                                    {booking.companionName?.charAt(0) || 'C'}
                                  </div>
                                  )}
                                  <div>
                                    <h3 className="font-semibold text-gray-900">{booking.companionName || 'Companion'}</h3>
                                    <p className="text-sm text-gray-500">Date not available</p>
                                  </div>
                                </div>
                                <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${getStatusColor(booking.status)}`}>
                                  {getStatusIcon(booking.status)}
                                  {getStatusLabel(booking.status)}
                                </span>
                              </div>
                              {/* Info Grid: Time, Price, Location */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                  <FaClock className="w-4 h-4" />
                                  <span>{formatTimeRange(booking.startTime, booking.endTime, booking.bookingDate, userTimezone)}</span>
                                </div>
                                <div className="text-sm text-gray-600">
                                  <span className="font-medium">${(booking.totalAmount || 0).toFixed(2)}</span>
                                  <span className="ml-1">({booking.durationHours || 0}h)</span>
                                </div>
                                {booking.meetingLocation && (
                                  <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <FaMapMarkerAlt className="w-4 h-4 text-red-500" />
                                    <span>{booking.meetingLocation}</span>
                                  </div>
                                )}
                              </div>

                              {/* Action Buttons */}
                              <div className="flex gap-2 flex-wrap">
                                {booking.status === 'confirmed' && (
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
                                <button
                                  onClick={() => navigate(`/companion/${booking.companionId}`)}
                                  className="flex items-center gap-2 px-3 py-1 bg-[#312E81] text-white rounded-lg hover:bg-[#312E81]/90 transition-colors text-sm"
                                >
                                  <FaUserCircle className="w-3 h-3" />
                                  View Profile
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                // Simple list view for other filters (confirmed, completed, cancelled)
                <div className="space-y-4">
                  {filteredBookings.map((booking) => (
                    <div key={booking.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      {/* Header: Avatar + Name + Status Badge */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {booking.companionPhoto ? (
                            <img
                              src={getImageUrl(booking.companionPhoto)}
                              alt={booking.companionName || 'Companion'}
                              className="w-10 h-10 rounded-full object-cover border-2 border-gray-200"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#312E81] to-[#FFCCCB] flex items-center justify-center text-white font-semibold">
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
                        <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${getStatusColor(booking.status)}`}>
                          {getStatusIcon(booking.status)}
                          {getStatusLabel(booking.status)}
                        </span>
                      </div>

                      {/* Info Grid: Time, Price, Location */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <FaClock className="w-4 h-4" />
                          <span>{formatTimeRange(booking.startTime, booking.endTime, booking.bookingDate, userTimezone)}</span>
                        </div>
                        <div className="text-sm text-gray-600">
                          <span className="font-medium">${(booking.totalAmount || 0).toFixed(2)}</span>
                          <span className="ml-1">({booking.durationHours || 0}h)</span>
                        </div>
                        {booking.meetingLocation && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <FaMapMarkerAlt className="w-4 h-4 text-red-500" />
                            <span>{booking.meetingLocation}</span>
                          </div>
                        )}
                      </div>

                      {/* Cancellation details */}
                      {booking.status === 'cancelled' && booking.cancellationReason && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <div className="flex items-start gap-2">
                            <FaBan className="w-4 h-4 text-red-500 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-red-800">
                                Cancelled by {booking.cancelledBy === 'client' ? 'You' : 'Companion'}
                              </p>
                              <p className="text-sm text-red-600">"{booking.cancellationReason}"</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Action Buttons - Bottom Left */}
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
                        <button
                          onClick={() => navigate(`/companion/${booking.companionId}`)}
                          className="flex items-center gap-2 px-3 py-1 bg-[#312E81] text-white rounded-lg hover:bg-[#312E81]/90 transition-colors text-sm"
                        >
                          <FaUserCircle className="w-3 h-3" />
                          View Profile
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Custom Time Requests Section - Only show non-accepted requests */}
            {bookingRequests.filter(r => r.status !== 'accepted').length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-2">
                    <FaBell className="text-purple-600 text-xl" />
                    <h2 className="text-xl font-bold text-gray-900">Custom Time Requests ({bookingRequests.filter(r => r.status !== 'accepted').length})</h2>
                  </div>
                  <p className="text-sm text-gray-500 ml-8">
                    All your custom booking requests
                  </p>
                </div>

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
                                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#312E81] to-[#FFCCCB] flex items-center justify-center text-white font-semibold">
                                    {request.companionName?.charAt(0) || 'C'}
                                  </div>
                                  )}
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h3 className="font-semibold text-gray-900">
                                        {request.companionName || 'Companion'}
                                      </h3>
                                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">
                                        Custom Request
                                      </span>
                                    </div>
                                    <p className="text-sm text-gray-500">
                                      {formatDate(request.requestedDate)}
                                    </p>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                  {request.startTime && request.endTime && (
                                    <div className="flex items-center gap-2">
                                      <FaClock className="text-gray-400" />
                                      <span className="text-gray-600">
                                        {formatTimeRange(request.startTime, request.endTime, request.requestedDate, userTimezone)}
                                      </span>
                                    </div>
                                  )}
                                  {request.durationHours && (
                                    <div className="flex items-center gap-2">
                                      <FaClock className="text-gray-400" />
                                      <span className="text-gray-600">
                                        {request.durationHours} hour{request.durationHours > 1 ? 's' : ''}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {request.specialRequests && (
                                  <p className="text-sm text-gray-600 mt-2 italic">
                                    "{request.specialRequests}"
                                  </p>
                                )}
                              </div>

                              <div className="flex flex-col items-end gap-3">
                                <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${
                                  request.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                  request.status === 'accepted' ? 'bg-green-100 text-green-800' :
                                  request.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {request.status === 'pending' ? 'Awaiting Response' : 
                                   request.status === 'accepted' ? 'Accepted' : 
                                   request.status === 'rejected' ? 'Declined' : 
                                   request.status}
                                </span>

                                {/* Cancellation details for requests */}
                                {request.status === 'rejected' && request.cancellationReason && (
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
        bookingStatus={selectedBooking?.status === 'confirmed' ? 'confirmed' : 'pending'}
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

      {/* OTP Verification Modal - Shows automatically at meeting time */}
      {/* Key prop ensures React doesn't remount on parent re-renders - only when booking changes */}
      {showOTPModal && otpBooking && (
        <OTPVerificationModal
          key={`otp-modal-${otpBooking.id}`}
          bookingId={otpBooking.id}
          companionName={otpBooking.companionName || 'Companion'}
          meetingStartTime={new Date(`${otpBooking.bookingDate}T${otpBooking.startTime}Z`)}
          onVerificationComplete={handleOTPComplete}
        />
      )}
    </div>
  );
};

const ClientDashboardWithErrorBoundary = () => (
  <ErrorBoundary level="page" showDetails={false}>
    <AsyncErrorBoundary maxRetries={3} retryDelay={1000}>
      <ClientDashboard />
    </AsyncErrorBoundary>
  </ErrorBoundary>
);

export default ClientDashboardWithErrorBoundary;
