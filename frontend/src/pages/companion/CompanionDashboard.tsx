 /**
 * Companion Dashboard
 * Shows application status, bookings, and profile management
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useSocket } from '../../context/SocketContext';
import { useOTPVerification } from '../../hooks/useOTPVerification';
import {
  FaCalendar,
  FaUser,
  FaStar,
  FaClock,
  FaCheckCircle,
  FaTimesCircle,
  FaFileAlt,
  FaBell,
  FaHistory,
  FaComments,
  FaMoneyBillWave,
  FaCog,
  FaBookOpen,
  FaMapMarkerAlt,
  FaChevronRight,
  FaExclamationTriangle
} from 'react-icons/fa';
import { useAuth } from '../../hooks/useAuth';
import { formatTimeRange } from '../../utils/timeConverter';
import axios from 'axios';
import { API_CONFIG, ROUTES } from '../../constants';
import { authApi } from '../../api/auth';
// Removed localStorage import - using cookies instead
import WeeklyAvailabilityCalendar from '../../components/companion/WeeklyAvailabilityCalendar';
import BookingsManager from '../../components/companion/BookingsManager';
import OTPVerificationModal from '../../components/booking/OTPVerificationModal';
import { bookingApi } from '../../api/booking';
import type { Booking } from '../../types';
// Stripe integration removed - will be implemented later
import ErrorBoundary from '../../components/ErrorBoundary';
import AsyncErrorBoundary, { useAsyncError } from '../../components/AsyncErrorBoundary';
import logger, { logComponentError } from '../../utils/logger';
import { transformKeysSnakeToCamel } from '../../types/transformers';
import { shouldAutoComplete, sortBookingsByPriority } from '../../utils/bookingHelpers';
import { getImageUrl } from '../../utils/imageHelpers';
import PayoutSetupCard from '../../components/companion/PayoutSetupCard';
import EarningsTab from '../../components/companion/EarningsTab';

interface ApplicationStatus {
  status: 'pending' | 'approved' | 'rejected';
  appliedDate: string;
  reviewedDate?: string;
  rejectionReason?: string;
}

interface BookingRequest {
  id: number;
  clientName: string;
  clientEmail?: string;
  clientPhoto?: string;
  requestedDate: string;
  startTime?: string;
  endTime?: string;
  durationHours: number;
  serviceType?: string;
  extraAmount?: number;
  meetingLocation?: string;
  specialRequests?: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

interface Review {
  id: number;
  rating: number;
  reviewText: string;
  createdAt: string;
  reviewerName: string;
  reviewerPhoto?: string;
  bookingDate: string;
  serviceId?: number;
}

const CompanionDashboard = () => {
  const { user, switchRole, checkAuth } = useAuth();
  const navigate = useNavigate();
  const { throwError } = useAsyncError();
  const [searchParams, setSearchParams] = useSearchParams();
  const [applicationStatus, setApplicationStatus] = useState<ApplicationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // 🔒 FIX: Prevent role switch from being called multiple times (prevents reload loop)
  const roleSwitchAttempted = useRef(false);

  // 🔒 FIX: Debounce refresh trigger to prevent rapid cascades from multiple socket events
  const refreshDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Real-time socket connection - using shared SocketContext (no duplicate connections)
  const { isConnected: socketConnected, lastBookingEvent } = useSocket();

  // Log socket connection status for debugging
  useEffect(() => {
    console.log('🔌 [CompanionDashboard] Socket status:', socketConnected ? 'CONNECTED' : 'DISCONNECTED');
  }, [socketConnected]);

  // Handle booking events from shared socket connection
  // Only refresh data for events that actually change the bookings list
  useEffect(() => {
    if (!lastBookingEvent) return;

    const { type, data } = lastBookingEvent;
    console.log('📣 [CompanionDashboard] Booking event received:', type);

    // Show appropriate toast based on event type
    switch (type) {
      case 'created':
        toast.success(`New booking from ${data.clientName}`);
        break;
      case 'request_created':
        toast.success(`New request from ${data.clientName}`);
        break;
      case 'request_cancelled':
        toast.error(`Request cancelled`);
        break;
      case 'otp_sent':
        // Don't show toast - OTP modal handles this
        break;
      case 'payment_captured':
        toast.success(`Payment captured - $${data.companionEarnings?.toFixed(2) || '0.00'} earned`);
        break;
      case 'expired':
        toast.error('Booking expired');
        break;
      case 'earnings_updated':
        toast.success('Earnings updated');
        break;
      // availability_updated, request_accepted, request_rejected - handled silently
    }

    // Only refresh data for events that actually change bookings list
    // DON'T refresh for: otp_sent, payment_captured, verification_extended, earnings_updated
    // These events don't change the pending/booking lists and cause unnecessary re-renders
    const eventsRequiringRefresh = ['created', 'request_created', 'request_cancelled', 'expired', 'approved', 'cancelled', 'rejected'];
    if (eventsRequiringRefresh.includes(type)) {
      // 🔒 FIX: Debounce refresh to prevent rapid cascades from multiple socket events
      if (refreshDebounceRef.current) {
        clearTimeout(refreshDebounceRef.current);
      }
      refreshDebounceRef.current = setTimeout(() => {
        setRefreshTrigger(prev => prev + 1);
      }, 500); // 500ms debounce - batches rapid events together
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

  // Initialize activeTab from URL parameter, default to 'overview'
  const tabFromUrl = searchParams.get('tab') as 'overview' | 'availability' | 'bookings' | 'earnings' | null;
  const [activeTab, setActiveTab] = useState<'overview' | 'availability' | 'bookings' | 'earnings'>(
    tabFromUrl && ['overview', 'availability', 'bookings', 'earnings'].includes(tabFromUrl) ? tabFromUrl : 'overview'
  );
  const [bookingFilter, setBookingFilter] = useState<'all' | 'pending' | 'confirmed' | 'completed' | 'approvals'>('approvals');
  // Stripe state removed - will be implemented later
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [roleReady, setRoleReady] = useState(false);
  const [isResendingEmail, setIsResendingEmail] = useState(false);

  // State for Overview tab bookings and reviews
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);
  const [recentReviews, setRecentReviews] = useState<Review[]>([]);
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);
  const [pendingBookings, setPendingBookings] = useState<Booking[]>([]);
  const [isLoadingPending, setIsLoadingPending] = useState(false);
  const [isProfileComplete, setIsProfileComplete] = useState(false); // Default false = show banner
  const [userTimezone, setUserTimezone] = useState<string>(() =>
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  );
  
  // ✅ FIX: Separate state for OTP verification - fetch ALL confirmed bookings, not just recent 10
  const [otpBookings, setOtpBookings] = useState<Booking[]>([]);

  // OTP Verification Modal - auto-triggers for bookings requiring verification
  const { showModal: showOTPModal, currentBooking: otpBooking, handleVerificationComplete } = useOTPVerification(otpBookings, 'companion');

  // ✅ FIX: Memoize the OTP completion callback to prevent unnecessary re-renders
  const handleOTPComplete = useCallback(() => {
    handleVerificationComplete();
    setRefreshTrigger(prev => prev + 1);
  }, [handleVerificationComplete]);
  
  // Monitor socket connection status
  useEffect(() => {
    console.log(`🔌 [CompanionDashboard] Socket connection status: ${socketConnected ? 'CONNECTED ✅' : 'DISCONNECTED ❌'}`);
    if (!socketConnected) {
      console.warn('⚠️ [CompanionDashboard] Socket disconnected - real-time updates will not work until reconnection');
    }
  }, [socketConnected]);

  // Safe accessors with fallbacks
  const safeBookingRequests = bookingRequests || [];
  const safePendingBookings = pendingBookings || [];
  const safeAllBookings = allBookings || [];
  const safeRecentReviews = recentReviews || [];

  // Function to change tab and update URL
  const changeTab = (tab: 'overview' | 'availability' | 'bookings' | 'earnings') => {
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

  // Auto-switch to companion role when dashboard loads
  // 🔒 FIX: Use guard ref to prevent multiple switch attempts (prevents reload loop)
  useEffect(() => {
    const ensureCompanionRole = async () => {
      // Guard: only attempt switch once per component mount
      if (roleSwitchAttempted.current) {
        return;
      }

      if (user && user.activeRole !== 'companion' && user.roles?.includes('companion')) {
        roleSwitchAttempted.current = true; // Mark as attempted BEFORE the async call
        try {
          logger.info('Starting role switch to companion', {
            component: 'CompanionDashboard',
            userId: user?.id,
            currentRole: user.activeRole,
            allRoles: user.roles
          });

          // 🔒 FIX: Skip navigation since we're already on the dashboard
          await switchRole('companion', { skipNavigation: true });

          logger.info('Successfully switched to companion role', {
            component: 'CompanionDashboard',
            userId: user?.id,
            newRole: 'companion'
          });

          setRoleReady(true);
        } catch (error) {
          logComponentError('CompanionDashboard', error, { action: 'switchRole' });
          setRoleReady(false);
          toast.error('Failed to switch to companion role. Please try refreshing the page.');
        }
      } else if (user && user.activeRole === 'companion') {
        logger.info('Already in companion role', {
          component: 'CompanionDashboard',
          userId: user?.id
        });
        setRoleReady(true);
      } else if (user && !user.roles?.includes('companion')) {
        logger.warn('User does not have companion role', {
          component: 'CompanionDashboard',
          userId: user?.id,
          roles: user.roles
        });
        setRoleReady(false);
        toast.error('You do not have companion access');
      }
    };
    ensureCompanionRole();
  }, [user?.activeRole]); // 🔒 FIX: Minimal dependency - only re-run when activeRole changes

  // Fetch actual application status from API
  useEffect(() => {
    const fetchApplicationStatus = async () => {
      console.log('🔍 fetchApplicationStatus: Starting to fetch application status', {
        userId: user?.id,
        userRole: user?.activeRole
      });

      try {
        // Use withCredentials to send cookies automatically
        const response = await axios.get(
          `${API_CONFIG.BASE_URL}/companion/application/status`,
          {
            withCredentials: true,
          }
        );

        console.log('📥 fetchApplicationStatus: Received application status response', {
          status: response.status,
          data: response.data
        });

        const app = transformKeysSnakeToCamel(response.data.data.application);
        const applicationStatusData = {
          status: app.status,
          appliedDate: new Date(app.createdAt).toLocaleDateString('en-US', {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric'
          }),
          reviewedDate: app.reviewedAt ? new Date(app.reviewedAt).toLocaleDateString('en-US', {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric'
          }) : undefined,
          rejectionReason: app.rejectionReason,
        };

        console.log('📥 fetchApplicationStatus: Setting application status', applicationStatusData);
        setApplicationStatus(applicationStatusData);

        // Check profile completion status (3 steps required)
        // Required: city, state, country (postalCode is optional)
        const hasAddress = !!(app.city && app.state && app.country);
        const hasPhotos = !!(app.profilePhotoUrl && app.additionalPhoto1Url && app.additionalPhoto2Url);
        const hasVerification = app.verificationStatus === 'approved';
        const profileComplete = hasAddress && hasPhotos && hasVerification;
        setIsProfileComplete(!!profileComplete);

        // Stripe account status check removed - will be implemented later
      } catch (error: any) {
        console.error('❌ fetchApplicationStatus: Error fetching application status', error);
        logComponentError('CompanionDashboard', error, { action: 'fetchApplicationStatus' });
        // If no application found (404), redirect to application form
        if (error.response?.status === 404) {
          console.log('📝 No application found - redirecting to application form');
          logger.info('No application found - redirecting to application form', {
            component: 'CompanionDashboard',
            userId: user?.id
          });
          navigate(ROUTES.COMPANION_APPLICATION, { replace: true });
          return;
        }
        // For other errors, throw to AsyncErrorBoundary
        throwError(error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchApplicationStatus();
  }, []);

  // Fetch booking requests with auto-refresh
  useEffect(() => {
    const fetchBookingRequests = async () => {
      if (applicationStatus?.status !== 'approved') return;

      setIsLoadingRequests(true);
      try {
        const response = await bookingApi.getBookingRequests({
          role: 'companion',
          status: 'pending'
        });
        
        // Handle response format {requests: [], userTimezone: ''}
        const requests = Array.isArray(response) ? response : (response.requests || []);
        setBookingRequests(requests as BookingRequest[]);
      } catch (error) {
        logComponentError('CompanionDashboard', error, { action: 'fetchBookingRequests' });
      } finally {
        setIsLoadingRequests(false);
      }
    };

    // Initial fetch
    fetchBookingRequests();

    // ✅ No polling needed - real-time updates via Socket.IO handle new requests
    // fetchBookingRequests is called on mount and refreshes on socket events via refreshTrigger
  }, [applicationStatus?.status, refreshTrigger]);

  // Fetch confirmed bookings for OTP verification
  // Runs on mount and when booking status changes (via socket events)
  // NO polling needed - useOTPVerification hook checks time internally
  const fetchOTPBookings = useCallback(async () => {
    if (user?.activeRole !== 'companion') return;

    try {
      const response = await bookingApi.getBookings({ status: 'confirmed' });
      const bookingsData: Booking[] = Array.isArray(response) ? response : (response as any).bookings || [];

      console.log('🔐 [CompanionDashboard] Fetched confirmed bookings for OTP:', {
        count: bookingsData.length,
        bookingIds: bookingsData.map(b => b.id)
      });

      setOtpBookings(bookingsData);
    } catch (error) {
      console.error('❌ [CompanionDashboard] Error fetching OTP bookings:', error);
    }
  }, [user?.activeRole]);

  // Fetch OTP bookings on mount
  useEffect(() => {
    fetchOTPBookings();
  }, [fetchOTPBookings]);

  // Also fetch when booking events fire (new booking approved, cancelled, etc.)
  useEffect(() => {
    if (refreshTrigger > 0) {
      fetchOTPBookings();
    }
  }, [refreshTrigger, fetchOTPBookings]);

  // Fetch overview data when user is companion
  // The fetch functions have their own guards for applicationStatus
  useEffect(() => {
    if (user?.activeRole === 'companion') {
      console.log('🔄 [CompanionDashboard] Fetching initial data for companion');
      fetchAllBookings();
      fetchPendingBookings();
      fetchRecentReviews();
    }
  }, [user?.activeRole]);

  // Also fetch when applicationStatus changes to approved (handles race condition)
  useEffect(() => {
    if (applicationStatus?.status === 'approved') {
      console.log('🔄 [CompanionDashboard] Application status approved - ensuring data is loaded');
      fetchAllBookings();
      fetchPendingBookings();
      fetchRecentReviews();
    }
  }, [applicationStatus?.status]);

  // Refresh pending bookings when socket events fire (new booking, request created, etc.)
  // This ensures the Overview tab shows real-time updates without needing reload
  useEffect(() => {
    // Only refresh if this isn't the initial mount (refreshTrigger > 0 means socket event fired)
    if (user?.activeRole === 'companion' && refreshTrigger > 0) {
      console.log('🔄 [CompanionDashboard] Socket event triggered - refreshing data');
      fetchPendingBookings();
      fetchAllBookings();
      fetchRecentReviews();
    }
  }, [refreshTrigger, user?.activeRole]);

  // Handle accepting/rejecting booking requests
  const handleRequestAction = async (requestId: number, action: 'accepted' | 'rejected') => {
    try {
      await bookingApi.updateBookingRequestStatus(requestId, { status: action });
      
      if (action === 'accepted') {
        toast.success('Request accepted');
      } else {
        toast.success('Request declined');
      }

      // Refresh booking requests
      const response = await bookingApi.getBookingRequests({
        role: 'companion',
        status: 'pending'
      });
      const requests = Array.isArray(response) ? response : (response.requests || []);
      setBookingRequests(requests as BookingRequest[]);

      // If accepted, also refresh pending bookings to show the new booking
      if (action === 'accepted') {
        fetchPendingBookings();
        fetchAllBookings();
      }
    } catch (error) {
      logComponentError('CompanionDashboard', error, { action: `${action}BookingRequest` });
      toast.error(`Failed to ${action} booking request`);
    }
  };

  // Fetch companion's bookings for Overview tab (excluding pending)
  const fetchAllBookings = async () => {
    if (user?.activeRole !== 'companion' || applicationStatus?.status !== 'approved') {
      console.log('🔍 fetchAllBookings: Skipping - not approved companion', {
        userRole: user?.activeRole,
        applicationStatus: applicationStatus?.status
      });
      return;
    }

    console.log('🔍 fetchAllBookings: Starting to fetch bookings', {
      userId: user?.id,
      userRole: user?.activeRole,
      applicationStatus: applicationStatus?.status
    });

    setIsLoadingBookings(true);
    try {
      // Fetch recent bookings (exclude pending, they're shown in separate section)
      // Limit to recent bookings for overview, full list available in Bookings tab
      const response = await bookingApi.getBookings({ limit: 10 });
      
      // Handle new response format {bookings: [], userTimezone: ''}
      const bookingsData: Booking[] = Array.isArray(response) ? response : (response as any).bookings || [];

      // Only update timezone if server provides a valid one, otherwise keep browser timezone
      const serverTimezone = !Array.isArray(response) ? (response as any).userTimezone : null;
      if (serverTimezone && serverTimezone !== 'UTC') {
        setUserTimezone(serverTimezone);
      }
      console.log('📥 fetchAllBookings: Received bookings data', {
        totalBookings: bookingsData.length,
        serverTimezone: serverTimezone || 'using browser timezone',
        bookings: bookingsData
      });
      
      // Check for bookings that need auto-completion
      const bookingsToComplete = bookingsData.filter(shouldAutoComplete);
      
      if (bookingsToComplete.length > 0) {
        logger.info('Auto-completing past bookings', { count: bookingsToComplete.length });
        
        // Auto-complete past bookings in background (non-blocking)
        Promise.all(
          bookingsToComplete.map(booking => 
            bookingApi.updateBookingStatus(booking.id, 'completed')
              .then(() => logger.info('Auto-completed booking', { bookingId: booking.id }))
              .catch(err => logger.warn('Failed to auto-complete booking', { bookingId: booking.id, error: err }))
          )
        );
        
        // ✅ FIX: Update status locally instead of refetching
        // This prevents double API calls and reload flickers
        const updatedBookings = bookingsData.map(booking => 
          bookingsToComplete.some(b => b.id === booking.id)
            ? { ...booking, status: 'completed' as const }
            : booking
        );
        const nonPendingBookings = updatedBookings.filter((b: Booking) => b.status?.toLowerCase() !== 'pending');
        setAllBookings(nonPendingBookings);
      } else {
        // Filter out pending bookings as they'll be shown in a separate section
        const nonPendingBookings = bookingsData.filter((b: Booking) => b.status?.toLowerCase() !== 'pending');
        console.log('📥 fetchAllBookings: Filtered non-pending bookings', {
          nonPendingCount: nonPendingBookings.length,
          nonPendingBookings
        });
        
        setAllBookings(nonPendingBookings);
      }
    } catch (error) {
      console.error('❌ fetchAllBookings: Error fetching bookings', error);
      logComponentError('CompanionDashboard', error, { action: 'fetchAllBookings' });
    } finally {
      setIsLoadingBookings(false);
    }
  };

  // Fetch pending bookings that need approval
  const fetchPendingBookings = async () => {
    if (user?.activeRole !== 'companion' || applicationStatus?.status !== 'approved') {
      console.log('🔍 fetchPendingBookings: Skipping - not approved companion', {
        userRole: user?.activeRole,
        applicationStatus: applicationStatus?.status
      });
      return;
    }

    console.log('🔍 fetchPendingBookings: Starting to fetch pending bookings', {
      userId: user?.id,
      userRole: user?.activeRole
    });

    setIsLoadingPending(true);
    try {
      const response = await bookingApi.getPendingBookingsForCompanion();
      
      // Handle new response format {pendingBookings: [], pendingCount: 0, userTimezone: ''}
      const pendingData: Booking[] = Array.isArray(response) ? response : (response as any).pendingBookings || [];

      // Only update timezone if server provides a valid one, otherwise keep browser timezone
      const serverTz = !Array.isArray(response) ? (response as any).userTimezone : null;
      if (serverTz && serverTz !== 'UTC') {
        setUserTimezone(serverTz);
      }
      console.log('📥 fetchPendingBookings: Received pending bookings data', {
        pendingCount: pendingData.length,
        serverTimezone: serverTz || 'using browser timezone',
        pendingBookings: pendingData
      });
      setPendingBookings(pendingData);
    } catch (error) {
      console.error('❌ fetchPendingBookings: Error fetching pending bookings', error);
      logComponentError('CompanionDashboard', error, { action: 'fetchPendingBookings' });
    } finally {
      setIsLoadingPending(false);
    }
  };

  // Handle approving/rejecting pending bookings
  const handleBookingApproval = async (bookingId: number, action: 'approve' | 'reject') => {
    try {
      if (action === 'approve') {
        await bookingApi.approveBooking(bookingId);
        toast.success('Booking approved successfully');
      } else {
        await bookingApi.rejectBooking(bookingId);
        toast.success('Booking rejected');
      }

      // Refresh pending bookings and all bookings
      await fetchPendingBookings();
      await fetchAllBookings();
    } catch (error) {
      logComponentError('CompanionDashboard', error, { action: `${action}Booking` });
      toast.error(`Failed to ${action} booking`);
    }
  };

  const handleResendVerification = async () => {
    try {
      setIsResendingEmail(true);
      const response = await authApi.resendVerificationEmail();
      const message = response?.data?.message || 'Verification email sent! Please check your inbox.';
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

  // Fetch companion's reviews for Overview tab
  const fetchRecentReviews = async () => {
    if (user?.activeRole !== 'companion' || !user?.id || applicationStatus?.status !== 'approved') return;

    setIsLoadingReviews(true);
    try {
      // Debug authentication state
      console.log('🔍 Fetching reviews for companion:', {
        userId: user.id,
        userActiveRole: user.activeRole,
        userRoles: user.roles,
        isAuthenticated: !!user,
        cookies: document.cookie
      });

      const reviewsData = await bookingApi.getCompanionReviews(user.id, 1, 3);
      setRecentReviews(reviewsData.reviews);
    } catch (error) {
      console.error('❌ Error fetching reviews:', error);
      logComponentError('CompanionDashboard', error, { action: 'fetchRecentReviews' });
    } finally {
      setIsLoadingReviews(false);
    }
  };

  // Stripe onboarding functions removed - will be implemented later
  // Application status functions removed - auto-approval implemented

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#312E81] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
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
                  Complete your profile to start accepting bookings. Add your address, upload photos, and verify your identity.
                </p>
                <button
                  onClick={() => navigate(ROUTES.COMPANION_PROFILE)}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
                >
                  Complete Profile
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Note: Companions do NOT review clients - only clients review companions */}

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
              onClick={() => changeTab('availability')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'availability'
                  ? 'border-[#312E81] text-[#312E81]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <FaClock className="w-4 h-4" />
                Availability
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
                <FaCalendar className="w-4 h-4" />
                Bookings
              </div>
            </button>
            <button
              onClick={() => changeTab('earnings')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'earnings'
                  ? 'border-[#312E81] text-[#312E81]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <FaMoneyBillWave className="w-4 h-4" />
                Earnings
              </div>
            </button>
          </nav>
        </div>

        {/* Tab Content - Keep components mounted but hidden to prevent reload on tab switch */}
        <div className={activeTab === 'overview' ? '' : 'hidden'}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Bookings & Reviews */}
          <div className="lg:col-span-2 space-y-6">
            {/* Pending Approvals - HIGHEST PRIORITY (Needs Immediate Action) */}
            {!isLoadingPending && safePendingBookings.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6 border-2 border-yellow-200 bg-yellow-50/30">
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-2">
                    <FaClock className="text-yellow-600 text-xl" />
                    <h2 className="text-xl font-bold text-gray-900">Pending Approvals</h2>
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-full">
                      {safePendingBookings.length} Pending
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 ml-8">
                    Regular bookings waiting for your approval
                  </p>
                </div>

                <div className="space-y-4">
                  {safePendingBookings.slice(0, 2).map((booking) => (
                    <div
                      key={booking.id}
                      className="border border-yellow-200 rounded-lg p-4 bg-yellow-50/50 hover:bg-yellow-100/50 cursor-pointer transition-colors"
                      onClick={() => {
                        setBookingFilter('approvals');
                        changeTab('bookings');
                      }}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3 flex-1">
                          {booking.clientPhoto ? (
                            <img
                              src={getImageUrl(booking.clientPhoto)}
                              alt={booking.clientName || 'Client'}
                              className="w-12 h-12 rounded-full object-cover border-2 border-yellow-300 flex-shrink-0"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                          ) : null}
                          <div className={`w-12 h-12 rounded-full bg-gradient-to-r from-[#312E81] to-[#4C1D95] flex items-center justify-center flex-shrink-0 ${booking.clientPhoto ? 'hidden' : ''}`}>
                            <FaUser className="text-white text-lg" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-gray-900">{booking.clientName || 'Client'}</h4>
                            <p className="text-sm text-gray-600">
                              {new Date(booking.bookingDate).toLocaleDateString('en-US', {
                                weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })} at {formatTimeRange(booking.startTime, booking.endTime, booking.bookingDate, userTimezone)}
                          </p>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-gray-900 flex-shrink-0">${booking.totalAmount}</span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-sm text-yellow-700 font-medium">
                          Click to view details
                        </span>
                        <FaChevronRight className="text-yellow-600" />
                      </div>
                    </div>
                  ))}
                  {safePendingBookings.length > 2 && (
                    <button
                      onClick={() => {
                        setBookingFilter('approvals');
                        changeTab('bookings');
                      }}
                      className="w-full text-center text-sm text-yellow-700 hover:text-yellow-800 font-medium py-2"
                    >
                      View all {safePendingBookings.length} pending approvals →
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Custom Time Requests - Only show non-accepted requests */}
            {!isLoadingRequests && safeBookingRequests.filter(r => r.status !== 'accepted').length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-2">
                    <FaBell className="text-[#312E81] text-xl" />
                    <h2 className="text-xl font-bold text-gray-900">Custom Time Requests</h2>
                    <span className="px-2 py-1 bg-red-100 text-red-600 text-xs font-semibold rounded-full">
                      {safeBookingRequests.filter(r => r.status !== 'accepted').length} New
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 ml-8">
                    Requests for times outside your regular availability
                  </p>
                </div>

                <div className="space-y-4">
                  {safeBookingRequests.filter(r => r.status !== 'accepted').slice(0, 2).map((request) => (
                    <div key={request.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3 flex-1">
                          {request.clientPhoto ? (
                            <img
                              src={getImageUrl(request.clientPhoto)}
                              alt={request.clientName || 'Client'}
                              className="w-10 h-10 rounded-full object-cover border-2 border-purple-200"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                                if (fallback) fallback.classList.remove('hidden');
                              }}
                            />
                          ) : null}
                          <div className={`w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 ${request.clientPhoto ? 'hidden' : ''}`}>
                            <span className="text-white font-semibold text-sm">
                              {request.clientName?.charAt(0) || 'C'}
                            </span>
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">{request.clientName}</h4>
                            <p className="text-sm text-gray-600">
                              {new Date(request.requestedDate).toLocaleDateString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })}
                            </p>
                          </div>
                        </div>
                        {request.extraAmount && request.extraAmount > 0 && (
                          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded">
                            +${request.extraAmount} tip
                          </span>
                        )}
                      </div>

                      <div className="space-y-2 text-sm text-gray-600 mb-3">
                        {request.startTime && request.endTime && (
                          <p>
                            <FaClock className="inline mr-1" />
                            {formatTimeRange(request.startTime, request.endTime, request.requestedDate, userTimezone)}
                          </p>
                        )}
                        {request.serviceType && (
                          <p>
                            <FaFileAlt className="inline mr-1" />
                            {request.serviceType}
                          </p>
                        )}
                        {request.meetingLocation && (
                          <p>
                            <FaMapMarkerAlt className="inline mr-1" />
                            {request.meetingLocation}
                          </p>
                        )}
                        {request.specialRequests && (
                          <p className="italic">"{request.specialRequests}"</p>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRequestAction(request.id, 'accepted')}
                          className="flex-1 px-3 py-2 bg-[#312E81] text-white font-medium rounded-lg hover:bg-[#252270] transition-colors"
                        >
                          <FaCheckCircle className="inline mr-1" />
                          Accept
                        </button>
                        <button
                          onClick={() => handleRequestAction(request.id, 'rejected')}
                          className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <FaTimesCircle className="inline mr-1" />
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                  {safeBookingRequests.filter(r => r.status !== 'accepted').length > 2 && (
                    <button
                      onClick={() => changeTab('bookings')}
                      className="w-full text-center text-sm text-purple-700 hover:text-purple-800 font-medium py-2"
                    >
                      View all {safeBookingRequests.filter(r => r.status !== 'accepted').length} requests →
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* All Bookings */}
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <FaHistory className="text-[#312E81] text-xl" />
                  <h2 className="text-xl font-bold text-gray-900">Recent Bookings</h2>
                </div>
                {safeAllBookings.length > 2 && (
                  <button
                    onClick={() => {
                      setBookingFilter('all');
                      changeTab('bookings');
                    }}
                    className="text-sm text-[#312E81] hover:text-[#312E81]/80 font-medium flex items-center gap-1"
                  >
                    View all ({safeAllBookings.length}) <FaChevronRight className="text-xs" />
                  </button>
                )}
              </div>
              {isLoadingBookings ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-20 bg-gray-100 rounded-lg"></div>
                    </div>
                  ))}
                </div>
              ) : safeAllBookings.length > 0 ? (
                <div className="space-y-3">
                  {sortBookingsByPriority(safeAllBookings).slice(0, 2).map((booking) => (
                    <div key={booking.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-3 flex-1">
                          {booking.clientPhoto ? (
                            <img
                              src={getImageUrl(booking.clientPhoto)}
                              alt={booking.clientName || 'Client'}
                              className="w-10 h-10 rounded-full object-cover border-2 border-gray-200"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                          ) : null}
                          <div className={`w-10 h-10 rounded-full bg-gradient-to-r from-[#312E81] to-[#312E81] flex items-center justify-center ${booking.clientPhoto ? 'hidden' : ''}`}>
                            <FaUser className="text-white text-sm" />
                          </div>
                        <div>
                          <p className="font-medium text-gray-900">{booking.clientName || 'Client'}</p>
                          <p className="text-sm text-gray-600">
                            {new Date(booking.bookingDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })} at {formatTimeRange(booking.startTime, booking.endTime, booking.bookingDate, userTimezone)}
                        </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            booking.status === 'completed' ? 'bg-green-100 text-green-700' :
                            booking.status === 'confirmed' || booking.status === 'payment_held' ? 'bg-blue-100 text-blue-700' :
                            booking.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                            booking.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {booking.status === 'payment_held' ? 'Confirmed' : booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                          </span>
                          <span className="text-sm font-bold text-gray-900">${booking.totalAmount}</span>
                        </div>
                      </div>
                      {booking.meetingLocation && (
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <FaMapMarkerAlt className="text-xs" />
                          {booking.meetingLocation}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <FaHistory className="mx-auto text-6xl text-gray-300 mb-4" />
                  <p className="text-gray-500 text-lg">No bookings yet</p>
                  <p className="text-gray-400 text-sm mt-2">
                    Your bookings will appear here once clients book your services
                  </p>
                </div>
              )}
            </div>

            {/* Recent Reviews */}
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <FaComments className="text-[#312E81] text-xl" />
                  <h2 className="text-xl font-bold text-gray-900">Recent Reviews</h2>
                </div>
                {safeRecentReviews.length >= 3 && (
                  <button
                    onClick={() => {
                      setBookingFilter('all');
                      changeTab('bookings');
                    }}
                    className="text-sm text-[#312E81] hover:text-[#312E81]/80 font-medium"
                  >
                    View all →
                  </button>
                )}
              </div>
              {isLoadingReviews ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-24 bg-gray-100 rounded-lg"></div>
                    </div>
                  ))}
                </div>
              ) : safeRecentReviews.length > 0 ? (
                <div className="space-y-3">
                  {safeRecentReviews.map((review) => (
                    <div key={review.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        {review.reviewerPhoto ? (
                          <img
                            src={review.reviewerPhoto}
                            alt={review.reviewerName}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                            <FaUser className="text-gray-400 text-sm" />
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <p className="font-medium text-gray-900">{review.reviewerName}</p>
                            <div className="flex items-center gap-1">
                              {[...Array(5)].map((_, i) => (
                                <FaStar
                                  key={i}
                                  className={`text-sm ${
                                    i < review.rating ? 'text-yellow-500' : 'text-gray-300'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 line-clamp-2 mb-1">
                            {review.reviewText}
                          </p>
                          <p className="text-xs text-gray-400">
                            {new Date(review.createdAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <FaComments className="mx-auto text-6xl text-gray-300 mb-4" />
                  <p className="text-gray-500 text-lg">No reviews yet</p>
                  <p className="text-gray-400 text-sm mt-2">
                    Client reviews will appear here after completed bookings
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Application Status & Quick Actions */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Quick Actions</h2>
              <div className="space-y-3">
                <button
                  onClick={() => navigate(ROUTES.COMPANION_PROFILE)}
                  className="w-full flex items-center gap-3 p-3 border-2 border-gray-200 rounded-lg hover:border-[#312E81] hover:bg-[#312E81]/10 hover:shadow-[0_0_15px_rgba(255,204,203,0.3)] transition-all duration-200 group"
                >
                  <FaUser className="text-xl text-gray-400 group-hover:text-[#312E81] transition-colors" />
                  <div className="text-left flex-1">
                    <h3 className="font-semibold text-gray-900 text-sm">Edit Profile</h3>
                    <p className="text-xs text-gray-500">Manage your information</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setBookingFilter('all');
                    changeTab('bookings');
                  }}
                  className="w-full flex items-center gap-3 p-3 border-2 border-gray-200 rounded-lg hover:border-[#312E81] hover:bg-[#312E81]/10 hover:shadow-[0_0_15px_rgba(255,204,203,0.3)] transition-all duration-200 group"
                >
                  <FaCalendar className="text-xl text-gray-400 group-hover:text-[#312E81] transition-colors" />
                  <div className="text-left flex-1">
                    <h3 className="font-semibold text-gray-900 text-sm">View Bookings</h3>
                    <p className="text-xs text-gray-500">Manage your bookings</p>
                  </div>
                </button>

                <button
                  onClick={() => changeTab('availability')}
                  className="w-full flex items-center gap-3 p-3 border-2 border-gray-200 rounded-lg hover:border-[#22c55e] hover:bg-[#22c55e]/10 hover:shadow-[0_0_15px_rgba(255,204,203,0.3)] transition-all duration-200 group"
                >
                  <FaClock className="text-xl text-gray-400 group-hover:text-[#22c55e] transition-colors" />
                  <div className="text-left flex-1">
                    <h3 className="font-semibold text-gray-900 text-sm">Set Availability</h3>
                    <p className="text-xs text-gray-500">Update your hours</p>
                  </div>
                </button>

                {/* View Earnings */}
                <button
                  onClick={() => changeTab('earnings')}
                  className="w-full flex items-center gap-3 p-3 border-2 border-gray-200 rounded-lg hover:border-[#FFCCCB] hover:bg-[#FFCCCB]/10 hover:shadow-[0_0_15px_rgba(255,204,203,0.3)] transition-all duration-200 group"
                >
                  <FaMoneyBillWave className="text-xl text-gray-400 group-hover:text-[#FF9F9F] transition-colors" />
                  <div className="text-left flex-1">
                    <h3 className="font-semibold text-gray-900 text-sm">View Earnings</h3>
                    <p className="text-xs text-gray-500">Track your income</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Quick Stats</h3>

              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Total Bookings</span>
                  <span className="text-lg font-semibold text-gray-900">{safeAllBookings.length}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Pending Approvals</span>
                  <span className="text-lg font-semibold text-yellow-600">{safePendingBookings.length}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-600">Total Reviews</span>
                  <span className="text-lg font-semibold text-gray-900">{safeRecentReviews.length}</span>
                </div>
              </div>
            </div>

            {/* Payout Setup */}
            <PayoutSetupCard />
          </div>
        </div>
        </div>

        <div className={activeTab === 'availability' ? '' : 'hidden'}>
          <WeeklyAvailabilityCalendar />
        </div>

        <div className={activeTab === 'bookings' ? '' : 'hidden'}>
          <BookingsManager initialFilter={bookingFilter} refreshTrigger={refreshTrigger} />
        </div>

        <div className={activeTab === 'earnings' ? '' : 'hidden'}>
          <EarningsTab />
        </div>
      </main>

      {/* OTP Verification Modal - Shows automatically at meeting time */}
      {/* Key prop ensures React doesn't remount on parent re-renders - only when booking changes */}
      {showOTPModal && otpBooking && (
        <OTPVerificationModal
          key={`otp-modal-${otpBooking.id}`}
          bookingId={otpBooking.id}
          companionName={otpBooking.clientName || 'Client'}
          meetingStartTime={new Date(`${otpBooking.bookingDate}T${otpBooking.startTime}Z`)}
          onVerificationComplete={handleOTPComplete}
        />
      )}
    </div>
  );
};

// Wrap with Error Boundaries
const CompanionDashboardWithErrorBoundary = () => (
  <ErrorBoundary level="page" showDetails={false}>
    <AsyncErrorBoundary maxRetries={3} retryDelay={1000}>
      <CompanionDashboard />
    </AsyncErrorBoundary>
  </ErrorBoundary>
);

export default CompanionDashboardWithErrorBoundary;