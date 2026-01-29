/**
 * Browse Companions Page
 * Displays all approved companions with their profile information
 * Includes client identity verification requirements
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUser, FaMapMarkerAlt, FaCalendarAlt, FaStar, FaEye, FaUserTie, FaExchangeAlt, FaShieldAlt, FaClock, FaCheckCircle, FaTimesCircle, FaExclamationTriangle, FaVenusMars, FaChevronDown, FaTimes, FaUserCircle } from 'react-icons/fa';
import { API_CONFIG, ROUTES } from '../constants';
import axios from 'axios';
import LoadingSpinner from '../components/common/LoadingSpinner';
import QuickBookingModal from '../components/booking/QuickBookingModal';
import Badge from '../components/common/Badge';
import VerificationModal from '../components/VerificationModal';
import { useAuth } from '../hooks/useAuth';
import { companionsApi } from '../api/companions';
import { authApi } from '../api/auth';
import clientApi from '../api/client';
import type { Companion } from '../types';
import { toast } from 'react-hot-toast';
import FavoriteButton from '../components/common/FavoriteButton';
import { favoritesApi } from '../api/favorites';
import { computeCompletionFromProfile3 } from '../utils/profileHelpers';
import ProfileCompletionPrompt from '../components/client/ProfileCompletionPrompt';

type VerificationStatus = 'not_submitted' | 'pending' | 'approved' | 'rejected';

const BrowseCompanions = () => {
  const { user, isAuthenticated, switchRole, hasRole, signOut, checkAuth } = useAuth();
  const navigate = useNavigate();
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCompanion, setSelectedCompanion] = useState<Companion | null>(null);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [selectedGender, setSelectedGender] = useState<string>('');
  const [ageRange, setAgeRange] = useState<[number, number]>([18, 80]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);

  // Filter dropdown state - tracks which dropdown is open ('gender', 'age', 'location', or null)
  const [openDropdown, setOpenDropdown] = useState<'gender' | 'age' | 'location' | null>(null);
  const filterContainerRef = useRef<HTMLDivElement>(null);

  // Client verification states
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('not_submitted');
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [hasLocation, setHasLocation] = useState(false);
  const [checkingVerification, setCheckingVerification] = useState(false);
  
  // Profile completion check
  const [showCompletionPrompt, setShowCompletionPrompt] = useState(false);

  // Check if current user is a companion
  const isCompanion = user?.activeRole === 'companion';
  const isClient = user?.activeRole === 'client';
  const hasClientRole = hasRole && hasRole('client');

  // Get dashboard route based on user role
  const getDashboardRoute = () => {
    if (!user) return ROUTES.HOME;
    switch (user.activeRole) {
      case 'admin':
        return ROUTES.ADMIN_DASHBOARD;
      case 'companion':
        return ROUTES.COMPANION_DASHBOARD;
      case 'client':
        return ROUTES.CLIENT_DASHBOARD;
      default:
        return '/dashboard'; // Will use the redirect route
    }
  };

  // Check profile completion for clients FIRST (before anything else)
  useEffect(() => {
    let mounted = true;
    const checkCompletion = async () => {
      if (isAuthenticated && isClient) {
        try {
          const profile = await clientApi.getProfile();
          if (!mounted) return;
          const status = computeCompletionFromProfile3(profile);
          if (!status.isComplete) {
            setShowCompletionPrompt(true);
            return;
          }
          setShowCompletionPrompt(false);
        } catch {
          if (!mounted) return;
          // If profile cannot be fetched, require completion
          setShowCompletionPrompt(true);
        }
      }
    };
    checkCompletion();
    return () => { mounted = false; };
  }, [isAuthenticated, isClient]);

  // Check client verification status on mount
  useEffect(() => {
    if (isAuthenticated && isClient) {
      checkClientVerification();
      fetchFavoriteIds();
    } else {
      fetchCompanions();
    }
  }, [isAuthenticated, isClient]);

  useEffect(() => {
    // Allow browsing for approved, pending, or non-clients (guests/companions)
    if (verificationStatus === 'approved' || verificationStatus === 'pending' || !isAuthenticated || !isClient) {
      fetchCompanions();
    }
  }, [verificationStatus]); // Removed selectedInterests to prevent reload on filter change

  const checkClientVerification = async () => {
    try {
      setCheckingVerification(true);

      // Check verification status
      const status = await clientApi.getVerificationStatus();
      setVerificationStatus(status.verificationStatus || 'not_submitted');

      // Check if location is set (checking for proper address fields)
      const profile = await clientApi.getProfile();
      const hasAddress = !!(
        profile.verification?.city &&
        profile.verification?.state &&
        profile.verification?.country
      );
      setHasLocation(hasAddress);

      // Don't automatically show modal - let the UI handle it
      if (status.verificationStatus === 'not_submitted' || status.verificationStatus === 'rejected') {
        // Just set the status, don't open modal automatically
        // setShowVerificationModal(true); // Removed to keep header visible
      } else if (!hasAddress && status.verificationStatus !== 'approved') {
        toast.error('Add address in profile to browse');
        navigate('/client-profile');
      }

      // Fetch companions if approved OR pending (allow immediate browsing after submission)
      if (status.verificationStatus === 'approved' || status.verificationStatus === 'pending') {
        await fetchCompanions();
      }
    } catch (error) {
      console.error('Error checking verification:', error);
      // Don't load companions if verification check fails
      setVerificationStatus('not_submitted');
      // Don't automatically show modal - let UI handle it
      // setShowVerificationModal(true); // Removed to keep header visible
    } finally {
      setCheckingVerification(false);
      setIsLoading(false);
    }
  };

  const handleVerificationSuccess = () => {
    // Set to approved for immediate access
    setVerificationStatus('approved');
    setShowVerificationModal(false);
    toast.success('Verification submitted');
    // Companions will load automatically via useEffect watching verificationStatus
  };

  const fetchCompanions = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await companionsApi.getCompanions();

      if (response.status === 'success') {
        setCompanions(response.data);
      } else {
        setError('Failed to fetch companions');
      }
    } catch (error: any) {
      console.error('Error fetching companions:', error);
      setError(error.response?.data?.message || 'Failed to fetch companions');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFavoriteIds = async () => {
    if (!isAuthenticated) return;

    try {
      const ids = await favoritesApi.getFavoriteIds();
      setFavoriteIds(ids);
    } catch (error) {
      console.error('Error fetching favorite IDs:', error);
      // Silently fail - favorites feature will still work without initial state
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterContainerRef.current && !filterContainerRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    };

    if (openDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [openDropdown]);

  // Toggle dropdown (close others when opening a new one)
  const toggleDropdown = (dropdown: 'gender' | 'age' | 'location') => {
    setOpenDropdown(current => current === dropdown ? null : dropdown);
  };

  // Helper to get active filter display values
  const getGenderDisplay = () => {
    if (!selectedGender) return 'All';
    const genderMap: Record<string, string> = {
      'male': 'Male',
      'female': 'Female',
      'other': 'Other',
      'prefer_not_to_say': 'Prefer not to say'
    };
    return genderMap[selectedGender] || 'All';
  };

  const getAgeDisplay = () => {
    if (ageRange[0] === 18 && ageRange[1] === 80) return 'All ages';
    return `${ageRange[0]}-${ageRange[1]} years`;
  };

  const getLocationDisplay = () => {
    const totalSelected = selectedCountries.length + selectedStates.length + selectedCities.length;
    if (totalSelected === 0) return 'All locations';
    if (totalSelected === 1) {
      return selectedCities[0] || selectedStates[0] || selectedCountries[0];
    }
    return `${totalSelected} selected`;
  };

  // Check if any filters are active
  const hasActiveFilters = selectedGender || ageRange[0] !== 18 || ageRange[1] !== 80 || selectedCountries.length > 0 || selectedStates.length > 0 || selectedCities.length > 0;

  // Safe accessor for companions array with fallback
  const safeCompanions = companions || [];
  
  // Extract unique locations for dropdowns
  const uniqueCountries = [...new Set(safeCompanions.map(c => c.country).filter((x): x is string => Boolean(x)))].sort();
  const uniqueStates = [...new Set(safeCompanions
    .filter(c => selectedCountries.length === 0 || selectedCountries.includes(c.country || ''))
    .map(c => c.state).filter((x): x is string => Boolean(x)))].sort();
  const uniqueCities = [...new Set(safeCompanions
    .filter(c => (selectedCountries.length === 0 || selectedCountries.includes(c.country || '')) &&
                 (selectedStates.length === 0 || selectedStates.includes(c.state || '')))
    .map(c => c.city).filter((x): x is string => Boolean(x)))].sort();

  const filteredCompanions = safeCompanions
    .filter(companion => {
      // Filter by gender if selected
      if (selectedGender && companion.gender !== selectedGender) {
        return false;
      }

      // Filter by age range
      if (companion.age < ageRange[0] || companion.age > ageRange[1]) {
        return false;
      }

      // Filter by location (multi-select - match ANY selected)
      if (selectedCountries.length > 0 && !selectedCountries.includes(companion.country || '')) {
        return false;
      }
      if (selectedStates.length > 0 && !selectedStates.includes(companion.state || '')) {
        return false;
      }
      if (selectedCities.length > 0 && !selectedCities.includes(companion.city || '')) {
        return false;
      }

      return true;
    });

  const formatJoinDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Recently';
      }
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long'
      });
    } catch (error) {
      return 'Recently';
    }
  };

  const handleBookCompanion = (companion: Companion) => {
    // Redirect to signin if not authenticated
    if (!isAuthenticated) {
      navigate('/signin');
      return;
    }

    // Convert CompanionData to Companion type for the modal
    const companionForBooking: Companion = {
      id: companion.id,
      name: companion.name,
      age: companion.age,
      location: companion.location || 'Winnipeg', // Use actual location or default
      description: companion.bio || 'Professional companion',
      // Backend returns averageRating as string, convert to number for Companion type's rating field
      rating: parseFloat((companion as any).averageRating) || 0,
      reviewCount: companion.reviewCount || 0,
      responseTime: '30 minutes',
      imageUrl: companion.profilePhotoUrl ? `${API_CONFIG.BASE_URL.replace('/api', '')}${companion.profilePhotoUrl}` : '',
      profilePhotoUrl: companion.profilePhotoUrl,
      isVerified: true,
      isAvailable: true,
      interests: companion.interests || [],
      joinedDate: companion.joinedDate
    };

    setSelectedCompanion(companionForBooking);
    setIsBookingModalOpen(true);
  };

  const handleViewProfile = (companionId: number) => {
    // Redirect to signin if not authenticated
    if (!isAuthenticated) {
      navigate('/signin');
      return;
    }

    // Navigate to profile page
    navigate(`/companion/${companionId}`);
  };

  const handleBookingCreated = (bookingId: number) => {
    console.log('Booking created with ID:', bookingId);
    // You could show a success message or redirect to bookings page
  };

  const handleSwitchToClient = async () => {
    try {
      await switchRole('client');
      toast.success('Switched to client mode');
      // Page will refresh automatically after role switch
    } catch (error) {
      toast.error('Failed to switch role. Please try again.');
    }
  };

  if (isLoading || checkingVerification) {
    return (
      <div className="py-32 px-4">
        <div className="flex justify-center">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-32 px-4">
        <div className="text-center max-w-md mx-auto">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Oops! Something went wrong</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={fetchCompanions}
            className="bg-[#312E81] text-white px-6 py-2 rounded-lg hover:bg-[#1E1B4B] transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Show verification requirement for unverified clients (including pending)
  if (isAuthenticated && isClient && (verificationStatus === 'not_submitted' || verificationStatus === 'rejected' || verificationStatus === 'pending')) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          {verificationStatus === 'pending' ? (
            // Pending Review - Clean simple design
            <>
              <div className="mb-8">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-100 rounded-full mb-6">
                  <FaClock className="text-blue-600 text-4xl" />
                </div>
                <h1 className="text-3xl font-bold text-gray-900 mb-3">Under Review</h1>
                <p className="text-gray-600 text-lg">
                  We're reviewing your profile.<br />
                  Usually takes 24 hours.
                </p>
              </div>
              <button
                onClick={() => navigate('/client-dashboard')}
                className="px-8 py-3 bg-gray-100 text-gray-700 font-medium rounded-full hover:bg-gray-200 transition-colors"
              >
                Back to Dashboard
              </button>
            </>
          ) : verificationStatus === 'rejected' ? (
            // Rejected - Allow resubmission via modal
            <>
              <div className="mb-8">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-red-100 rounded-full mb-6">
                  <FaTimesCircle className="text-red-600 text-4xl" />
                </div>
                <h1 className="text-4xl font-bold text-gray-900 mb-3">Try Again</h1>
                <p className="text-gray-600 text-lg">
                  Your verification was not approved.<br />
                  Please submit new documents.
                </p>
              </div>

              {/* Resubmit Verification Button */}
              <div className="mb-6">
                <button
                  onClick={() => setShowVerificationModal(true)}
                  className="relative inline-flex items-center justify-center px-10 py-4 bg-gradient-to-r from-[#312E81] to-[#4338CA] text-white font-semibold text-lg rounded-2xl hover:from-[#3730A3] hover:to-[#4F46E5] transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105"
                >
                  <span>Resubmit Verification</span>
                </button>
              </div>

              <button
                onClick={() => navigate('/client-dashboard')}
                className="text-gray-500 hover:text-gray-700 font-medium transition-colors"
              >
                ← Back to Dashboard
              </button>
            </>
          ) : (
            // Not started - Clean CTA design
            <>
              <div className="mb-8">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-[#f0effe] rounded-full mb-6">
                  <FaShieldAlt className="text-[#312E81] text-4xl" />
                </div>
                <h1 className="text-4xl font-bold text-gray-900 mb-3">Almost There!</h1>
                <p className="text-gray-600 text-lg">
                  Complete your profile to start browsing
                </p>
              </div>

              {/* Highlighted CTA Button */}
              <div className="mb-6">
                <button
                  onClick={() => navigate('/client-profile')}
                  className="relative inline-flex items-center justify-center px-10 py-4 bg-gradient-to-r from-[#312E81] to-[#4338CA] text-white font-semibold text-lg rounded-2xl hover:from-[#3730A3] hover:to-[#4F46E5] transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105"
                >
                  <span className="mr-2">Complete Profile</span>
                  <span className="text-white/70 text-sm">• 2 min</span>
                </button>
              </div>

              <button
                onClick={() => navigate('/client-dashboard')}
                className="text-gray-500 hover:text-gray-700 font-medium transition-colors"
              >
                ← Back to Dashboard
              </button>
            </>
          )}
        </div>

        {/* Verification Modal - Only opens when button clicked */}
        <VerificationModal
          isOpen={showVerificationModal}
          onClose={() => setShowVerificationModal(false)}
          onSuccess={handleVerificationSuccess}
        />
      </div>
    );
  }

  // Show verification status for clients
  if (isAuthenticated && isClient) {
    // Check email verification FIRST (most important security check)
    if (!user?.emailVerified) {
      return (
        <div className="py-12 px-4">
          <div className="max-w-md mx-auto">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 text-center">
              <div className="mb-6">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-amber-100 rounded-full">
                  <FaExclamationTriangle className="text-amber-600 text-4xl" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">
                Email Verification Required
              </h2>
              <p className="text-gray-600 mb-6">
                Please verify your email address before browsing companions. Check your inbox for the verification link we sent when you signed up.
              </p>
              <div className="space-y-3">
                <button
                  onClick={async () => {
                    try {
                      const response = await authApi.resendVerificationEmail();
                      const message = response?.data?.message || 'Verification email sent! Check your inbox.';
                      toast.success(message);

                      // If already verified, refresh auth state to update UI
                      if (response?.data?.alreadyVerified) {
                        await checkAuth();
                      }
                    } catch (error) {
                      toast.error('Failed to send verification email');
                    }
                  }}
                  className="w-full px-6 py-3 bg-[#312E81] text-white rounded-lg hover:bg-[#1E1B4B] transition-colors font-medium"
                >
                  Resend Verification Email
                </button>
                <button
                  onClick={() => navigate('/client-dashboard')}
                  className="w-full px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Check location requirement
    if (!hasLocation && verificationStatus === 'approved') {
      return (
        <div className="py-12 px-4">
          <div className="max-w-md mx-auto">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 text-center">
              <div className="mb-6">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-100 rounded-full">
                  <FaMapMarkerAlt className="text-[#312E81] text-4xl" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">
                Location Required
              </h2>
              <p className="text-gray-600 mb-6">
                Please add your current location to your profile before browsing companions. This helps us show you companions in your area.
              </p>
              <button
                onClick={() => navigate('/client-profile')}
                className="w-full px-6 py-3 bg-[#312E81] text-white rounded-lg hover:bg-[#1E1B4B] transition-colors font-medium"
              >
                Update Profile Location
              </button>
            </div>
          </div>
        </div>
      );
    }
  }

  // Show simplified view for companions - clear message with options
  if (isAuthenticated && isCompanion) {
    return (
      <div className="py-12 px-4">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 text-center">
            {/* Icon */}
            <div className="mb-6">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-[#f0effe] rounded-full">
                <FaUserTie className="text-[#312E81] text-4xl" />
              </div>
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              Join as a Client to Browse Companions
            </h2>

            {/* Description */}
            <p className="text-gray-600 mb-6">
              As a companion, you need to switch to client mode to browse and book other companions.
              This ensures a professional boundary between service providers.
            </p>

            {/* Actions */}
            <div className="space-y-3">
              {hasClientRole ? (
                <>
                  <button
                    onClick={handleSwitchToClient}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#312E81] text-white rounded-lg hover:bg-[#1E1B4B] transition-colors font-medium"
                  >
                    <FaExchangeAlt />
                    Switch to Client Mode
                  </button>
                  <button
                    onClick={() => navigate('/companion-dashboard')}
                    className="w-full px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                  >
                    Back to Dashboard
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-500 mb-4">
                    You don't have a client account. To browse companions, you need to create a separate client account.
                    <br />
                    <strong className="text-gray-700">You will be logged out to create a new account.</strong>
                  </p>
                  <button
                    onClick={async () => {
                      // Actually sign out the user first
                      await signOut();
                      // Then redirect to signup page
                      navigate('/signup');
                    }}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#312E81] text-white rounded-lg hover:bg-[#1E1B4B] transition-colors font-medium"
                  >
                    <FaUser />
                    Create Client Account
                  </button>
                  <button
                    onClick={() => navigate('/companion-dashboard')}
                    className="w-full px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                  >
                    Back to Dashboard
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show profile completion prompt if client's profile is incomplete
  if (showCompletionPrompt) {
    return <ProfileCompletionPrompt />;
  }

  // Normal view for clients and non-authenticated users
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - Always Visible */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Browse Companions</h1>
              <p className="mt-1 text-sm text-gray-500">
                Find your perfect companion for memorable experiences
              </p>
            </div>
            {isAuthenticated && (
              <button
                onClick={() => navigate(getDashboardRoute())}
                className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium transition-colors"
              >
                ← Back to Dashboard
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Horizontal Filter Bar - Visible for all users */}
        <div ref={filterContainerRef} className="mb-6 relative">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* Gender Filter Button */}
                <div className="relative">
                  <button
                    onClick={() => toggleDropdown('gender')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all duration-200 ${
                      openDropdown === 'gender'
                        ? 'border-[#312E81] bg-[#F5F3FF] text-[#312E81]'
                        : selectedGender
                        ? 'border-[#312E81] bg-[#312E81] text-white shadow-sm'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-[#312E81] hover:bg-gray-50'
                    }`}
                  >
                    <FaVenusMars className="text-sm" />
                    <span className="text-sm font-medium">Gender: {getGenderDisplay()}</span>
                    <FaChevronDown className={`text-xs transition-transform duration-200 ${openDropdown === 'gender' ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Gender Dropdown */}
                  {openDropdown === 'gender' && (
                    <div className="absolute top-full left-0 mt-2 w-[calc(100vw-2rem)] sm:w-64 max-w-[280px] bg-white rounded-lg shadow-lg border border-gray-200 p-3 z-50">
                      <div className="flex flex-wrap gap-2">
                        {[
                          { value: '', label: 'All' },
                          { value: 'male', label: 'Male' },
                          { value: 'female', label: 'Female' },
                          { value: 'other', label: 'Other' },
                          { value: 'prefer_not_to_say', label: 'Prefer not to say' }
                        ].map((option) => (
                          <button
                            key={option.value}
                            onClick={() => {
                              setSelectedGender(option.value);
                              setOpenDropdown(null);
                            }}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                              selectedGender === option.value
                                ? 'bg-[#312E81] text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Age Filter Button */}
                <div className="relative">
                  <button
                    onClick={() => toggleDropdown('age')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all duration-200 ${
                      openDropdown === 'age'
                        ? 'border-[#312E81] bg-[#F5F3FF] text-[#312E81]'
                        : ageRange[0] !== 18 || ageRange[1] !== 80
                        ? 'border-[#312E81] bg-[#312E81] text-white shadow-sm'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-[#312E81] hover:bg-gray-50'
                    }`}
                  >
                    <FaCalendarAlt className="text-sm" />
                    <span className="text-sm font-medium">Age: {getAgeDisplay()}</span>
                    <FaChevronDown className={`text-xs transition-transform duration-200 ${openDropdown === 'age' ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Age Dropdown */}
                  {openDropdown === 'age' && (
                    <div className="absolute top-full left-0 mt-2 w-[calc(100vw-2rem)] sm:w-80 max-w-[320px] bg-white rounded-lg shadow-lg border border-gray-200 p-4 z-50">
                      <div className="space-y-4">
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <label className="block text-xs text-gray-600 mb-1 font-medium">Min: {ageRange[0]}</label>
                            <input
                              type="range"
                              min="18"
                              max="80"
                              value={ageRange[0]}
                              onChange={(e) => {
                                const newMin = Number(e.target.value);
                                if (newMin <= ageRange[1]) {
                                  setAgeRange([newMin, ageRange[1]]);
                                }
                              }}
                              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#312E81]"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs text-gray-600 mb-1 font-medium">Max: {ageRange[1]}</label>
                            <input
                              type="range"
                              min="18"
                              max="80"
                              value={ageRange[1]}
                              onChange={(e) => {
                                const newMax = Number(e.target.value);
                                if (newMax >= ageRange[0]) {
                                  setAgeRange([ageRange[0], newMax]);
                                }
                              }}
                              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#312E81]"
                            />
                          </div>
                        </div>
                        <div className="bg-[#F5F3FF] rounded-lg px-4 py-2 text-center border border-[#312E81]">
                          <span className="text-sm font-bold text-[#312E81]">
                            {ageRange[0]} - {ageRange[1]} years
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Location Filter Button */}
                <div className="relative">
                  <button
                    onClick={() => toggleDropdown('location')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all duration-200 ${
                      openDropdown === 'location'
                        ? 'border-[#312E81] bg-[#F5F3FF] text-[#312E81]'
                        : selectedCountries.length > 0 || selectedStates.length > 0 || selectedCities.length > 0
                        ? 'border-[#312E81] bg-[#312E81] text-white shadow-sm'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-[#312E81] hover:bg-gray-50'
                    }`}
                  >
                    <FaMapMarkerAlt className="text-sm" />
                    <span className="text-sm font-medium">Location: {getLocationDisplay()}</span>
                    <FaChevronDown className={`text-xs transition-transform duration-200 ${openDropdown === 'location' ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Location Dropdown */}
                  {openDropdown === 'location' && (
                    <div className="absolute top-full left-0 mt-2 w-[calc(100vw-2rem)] sm:w-80 max-w-[320px] bg-white rounded-lg shadow-lg border border-gray-200 p-4 z-50 max-h-96 overflow-y-auto">
                      <div className="space-y-4">
                        {/* Countries */}
                        <div>
                          <label className="block text-xs text-gray-600 mb-2 font-medium">Country</label>
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {uniqueCountries.map((country) => (
                              <label key={country} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedCountries.includes(country)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedCountries(prev => [...prev, country]);
                                    } else {
                                      setSelectedCountries(prev => prev.filter(c => c !== country));
                                      // Clear dependent selections
                                      setSelectedStates([]);
                                      setSelectedCities([]);
                                    }
                                  }}
                                  className="w-4 h-4 text-[#312E81] border-gray-300 rounded focus:ring-[#312E81]"
                                />
                                <span className="text-sm text-gray-700">{country}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* States - show when countries selected */}
                        {uniqueStates.length > 0 && (
                          <div>
                            <label className="block text-xs text-gray-600 mb-2 font-medium">State/Province</label>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                              {uniqueStates.map((state) => (
                                <label key={state} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={selectedStates.includes(state)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedStates(prev => [...prev, state]);
                                      } else {
                                        setSelectedStates(prev => prev.filter(s => s !== state));
                                        // Clear dependent city selections
                                        setSelectedCities([]);
                                      }
                                    }}
                                    className="w-4 h-4 text-[#312E81] border-gray-300 rounded focus:ring-[#312E81]"
                                  />
                                  <span className="text-sm text-gray-700">{state}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Cities - show when states selected */}
                        {uniqueCities.length > 0 && (
                          <div>
                            <label className="block text-xs text-gray-600 mb-2 font-medium">City</label>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                              {uniqueCities.map((city) => (
                                <label key={city} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={selectedCities.includes(city)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedCities(prev => [...prev, city]);
                                      } else {
                                        setSelectedCities(prev => prev.filter(c => c !== city));
                                      }
                                    }}
                                    className="w-4 h-4 text-[#312E81] border-gray-300 rounded focus:ring-[#312E81]"
                                  />
                                  <span className="text-sm text-gray-700">{city}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex gap-2 pt-2 border-t border-gray-200">
                          <button
                            onClick={() => {
                              setSelectedCountries([]);
                              setSelectedStates([]);
                              setSelectedCities([]);
                            }}
                            className="flex-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            Clear
                          </button>
                          <button
                            onClick={() => setOpenDropdown(null)}
                            className="flex-1 px-3 py-2 text-sm bg-[#312E81] text-white rounded-lg hover:bg-[#1E1B4B] transition-colors"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Clear All Button */}
                {hasActiveFilters && (
                  <button
                    onClick={() => {
                      setSelectedGender('');
                      setAgeRange([18, 80]);
                      setSelectedCountries([]);
                      setSelectedStates([]);
                      setSelectedCities([]);
                      setOpenDropdown(null);
                    }}
                    className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors duration-200"
                  >
                    <FaTimes className="text-xs" />
                    <span className="text-sm font-medium">Clear All</span>
                  </button>
                )}
              </div>
            </div>
          </div>

        {/* Results Count */}
        <div className="mb-6">
          <p className="text-gray-600">
            Showing {filteredCompanions.length} companion{filteredCompanions.length !== 1 ? 's' : ''}
            {hasActiveFilters && ' (filtered)'}
          </p>
        </div>

        {/* Companions Grid */}
        {filteredCompanions.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-6xl mb-4">👥</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {hasActiveFilters ? 'No matching companions' : 'No companions available'}
            </h3>
            <p className="text-gray-600">
              {hasActiveFilters
                ? 'Try adjusting your filters to see more companions'
                : 'Check back later for new companions'
              }
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {filteredCompanions.map((companion) => {
              // Extract the name from email if name looks like an email
              const displayName = companion.name && companion.name.includes('@')
                ? companion.email?.split('@')[0] || companion.name.split('@')[0] || 'Companion'
                : companion.name || 'Companion';

              // Helper function to format gender display
              const formatGender = (gender?: string) => {
                if (!gender) return null;
                const genderMap: Record<string, string> = {
                  'male': 'Male',
                  'female': 'Female',
                  'other': 'Other',
                  'prefer_not_to_say': 'Prefer not to say'
                };
                return genderMap[gender] || gender;
              };

              return (
                <div
                  key={companion.id}
                  className="bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-[transform,shadow] duration-300 hover:-translate-y-1 overflow-hidden flex flex-col h-full"
                >
                  {/* Profile Photo - Modern, larger */}
                  <div className="relative h-64 bg-gradient-to-br from-[#f0effe] via-[#fef3f3] to-[#f0effe]">
                    {companion.profilePhotoUrl ? (
                      <img
                        src={`${API_CONFIG.BASE_URL.replace('/api', '')}${companion.profilePhotoUrl}`}
                        alt={displayName}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          target.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div className={`${companion.profilePhotoUrl ? 'hidden' : ''} absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#312E81] to-[#FFCCCB]`}>
                      <FaUser className="text-white text-6xl opacity-70" />
                    </div>

                    {/* Favorite button overlay */}
                    {isAuthenticated && (
                      <div className="absolute top-4 right-4">
                        <FavoriteButton
                          companionId={companion.id}
                          companionName={displayName}
                          initialFavorited={favoriteIds.includes(companion.id)}
                          size="md"
                          className="bg-white/95 backdrop-blur-sm hover:bg-white shadow-lg"
                          onToggle={(isFavorited) => {
                            if (isFavorited) {
                              setFavoriteIds(prev => [...prev, companion.id]);
                            } else {
                              setFavoriteIds(prev => prev.filter(id => id !== companion.id));
                            }
                          }}
                        />
                      </div>
                    )}

                    {/* Verified Badge */}
                    {companion.isVerified && (
                      <div className="absolute top-4 left-4">
                        <div className="flex items-center gap-1.5 bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-md">
                          <FaCheckCircle className="text-green-500" size={14} />
                          <span className="text-xs font-semibold text-gray-700">Verified</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Profile Info - Enhanced Layout */}
                  <div className="p-6 flex flex-col flex-1">
                    {/* Name */}
                    <div className="mb-3">
                      <h3 className="text-2xl font-bold text-gray-900 capitalize leading-tight">
                        {displayName}
                      </h3>
                    </div>

                    {/* Info Row: Age • Gender • Location */}
                    <div className="flex items-center flex-wrap gap-2 mb-4 text-sm text-gray-600">
                      {/* Age */}
                      <div className="flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-lg">
                        <FaCalendarAlt className="text-[#312E81]" size={12} />
                        <span className="font-medium">{companion.age} years</span>
                      </div>

                      {/* Gender */}
                      {companion.gender && (
                        <div className="flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-lg">
                          <FaVenusMars className="text-[#312E81]" size={12} />
                          <span className="font-medium">{formatGender(companion.gender)}</span>
                        </div>
                      )}

                      {/* Location */}
                      {companion.location && (
                        <div className="flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-lg">
                          <FaMapMarkerAlt className="text-[#312E81]" size={12} />
                          <span className="font-medium truncate max-w-[150px]">{companion.location}</span>
                        </div>
                      )}
                    </div>

                    {/* Bio Snippet */}
                    {companion.bio && (
                      <div className="mb-4 flex-grow">
                        <p className="text-sm text-gray-600 line-clamp-2">
                          {companion.bio.length > 100 
                            ? `${companion.bio.substring(0, 100)}...` 
                            : companion.bio
                          }
                        </p>
                      </div>
                    )}

                    {/* Action Button - Modern Gradient */}
                    <div className="mt-auto">
                      {isAuthenticated && user?.id === companion.id ? (
                        <button
                          disabled
                          className="w-full bg-gray-100 text-gray-400 py-3 px-4 rounded-xl cursor-not-allowed font-semibold text-sm border-2 border-gray-200"
                        >
                          Your Profile
                        </button>
                      ) : (
                        <button
                          onClick={() => handleViewProfile(companion.id)}
                          className="w-full bg-gradient-to-r from-[#312E81] to-[#1E1B4B] text-white py-3 px-4 rounded-xl hover:from-[#1E1B4B] hover:to-[#312E81] transition-[colors,transform,shadow] duration-200 hover:scale-[1.02] font-semibold text-sm shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                        >
                          <FaEye className="text-base" />
                          <span>View Full Profile</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Booking Modal */}
      {selectedCompanion && (
        <QuickBookingModal
          companion={selectedCompanion}
          isOpen={isBookingModalOpen}
          onClose={() => setIsBookingModalOpen(false)}
          onBookingCreated={handleBookingCreated}
        />
      )}

      {/* Verification Modal for Clients */}
      {isAuthenticated && isClient && (
        <VerificationModal
          isOpen={showVerificationModal}
          onClose={() => setShowVerificationModal(false)}
          onSuccess={handleVerificationSuccess}
        />
      )}
    </div>
  );
};

export default BrowseCompanions;