/**
 * Companion Details Page
 * Displays detailed companion information for clients to view and book
 */

import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useSocket } from '../../hooks/useSocket';
import {
  FaArrowLeft,
  FaHeart,
  FaRegHeart,
  FaStar,
  FaMapMarkerAlt,
  FaClock,
  FaLanguage,
  FaMoneyBillWave,
  FaCalendarAlt,
  FaCheckCircle,
  FaUser,
  FaServicestack,
  FaComment,
  FaShieldAlt,
  FaAward,
  FaTimes,
  FaPaperPlane,
  FaShareAlt,
  FaChevronLeft,
  FaChevronRight,
  FaExpand
} from 'react-icons/fa';
import { useAuth } from '../../hooks/useAuth';
import { useModal } from '../../context/ModalContext';
import { bookingApi } from '../../api/booking';
import { companionsApi } from '../../api/companions';
import { serviceCategoryApi } from '../../api/serviceCategory';
import { favoritesApi } from '../../api/favorites';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import FavoriteButton from '../../components/common/FavoriteButton';
import DetailedBookingModal from '../../components/booking/DetailedBookingModal';
import CustomBookingRequestModal from '../../components/booking/CustomBookingRequestModal';
import { getCompanionImages } from '../../utils/imageHelpers';
import MonthlyAvailabilityWidget from '../../components/booking/MonthlyAvailabilityWidget';
import type { AvailabilitySlot, ServiceCategory } from '../../types';

interface CompanionProfileData {
  id: number;
  name: string;
  email: string;
  profilePhotoUrl: string;
  additionalPhoto1Url?: string;
  additionalPhoto2Url?: string;
  age: number;
  bio: string;
  interests: string[];
  servicesOffered: string[];
  languages: string[];
  hourlyRate: number;
  verified: boolean;
  joinedDate: string;
  location: string;
  averageRating?: number;
  reviewCount?: number;
}

const CompanionDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { isAnyModalOpen } = useModal();

  const [companion, setCompanion] = useState<CompanionProfileData | null>(null);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [activeTab, setActiveTab] = useState<'about' | 'availability' | 'reviews'>('about');
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewStats, setReviewStats] = useState<any>({
    total: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    average: 0
  });
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [currentReviewPage, setCurrentReviewPage] = useState(1);
  const [totalReviewPages, setTotalReviewPages] = useState(1);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showEnhancedBookingModal, setShowEnhancedBookingModal] = useState(false);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<{ start: string; end: string; services?: string[] } | null>(null);
  const [currentFunFact, setCurrentFunFact] = useState(0);
  const [isFavorited, setIsFavorited] = useState(false);

  // Image carousel state
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isImageFullscreen, setIsImageFullscreen] = useState(false);
  const [availabilityRefreshTrigger, setAvailabilityRefreshTrigger] = useState(0);
  const companionIdNumber = companion?.id ?? (id ? parseInt(id, 10) : 0);

  // Real-time socket connection for availability updates
  const socketHandlers = useMemo(() => ({
    onAvailabilityUpdated: (data: any) => {
      // Only refresh if viewing the companion whose availability was updated
      if (data.companionId && data.companionId === parseInt(id || '0')) {
        console.log('📣 [CompanionDetails] Availability updated for this companion');
        // Show appropriate message based on slot count
        const message = data.slotsCount === 0 
          ? 'All slots removed. Companion currently unavailable.' 
          : 'Availability updated! Showing latest slots.';
        toast.success(message, {
          duration: 4000,
          icon: '📅'
        });
        // Trigger availability refresh
        setAvailabilityRefreshTrigger(prev => prev + 1);
      }
    }
  }), [id]); // Only depends on id

  useSocket(socketHandlers);

  // Fetch companion profile and initial availability when ID changes
  useEffect(() => {
    if (id) {
      fetchCompanionProfile();
      fetchAvailability();
    }
  }, [id]); // Only depends on id - runs once on mount or when viewing different companion

  // Refresh ONLY availability when socket event fires (don't re-fetch profile)
  useEffect(() => {
    if (id && availabilityRefreshTrigger > 0) {
      // Only fetch availability, not the entire profile
      fetchAvailability();
    }
  }, [availabilityRefreshTrigger, id]); // Include id to prevent stale closure

  useEffect(() => {
    if (activeTab === 'reviews' && id) {
      fetchReviews();
    }
  }, [activeTab, currentReviewPage, id]);

  // Initialize reviewStats from companion data when companion is loaded
  useEffect(() => {
    if (companion && companion.averageRating !== undefined && companion.reviewCount !== undefined) {
      setReviewStats((prev: any) => ({
        ...prev,
        total: companion.reviewCount,
        average: companion.averageRating
      }));
    }
  }, [companion]);

  // Fun facts rotation
  useEffect(() => {
    const funFacts = [
      `Responds to 90% of requests within 2 hours`,
      `${Math.floor(Math.random() * 100) + 50} happy clients served`,
      `${Math.floor(Math.random() * 20) + 80}% booking success rate`,
      `Usually books up ${Math.floor(Math.random() * 3) + 2} days in advance`,
      `Top 10% rated companion on Meytle`,
    ];

    const interval = setInterval(() => {
      setCurrentFunFact((prev) => (prev + 1) % funFacts.length);
    }, 4000);

    return () => clearInterval(interval);
  }, []);


  // Check if companion is favorited
  useEffect(() => {
    const checkFavoriteStatus = async () => {
      if (!id || !user) return;

      try {
        const status = await favoritesApi.checkFavorite(parseInt(id));
        setIsFavorited(status);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error checking favorite status:', error);
        }
      }
    };

    checkFavoriteStatus();
  }, [id, user]);

  // Get all available images with proper URL construction
  const images = getCompanionImages(
    companion?.profilePhotoUrl,
    companion?.additionalPhoto1Url,
    companion?.additionalPhoto2Url
  );
  const totalImages = images.length;

  // Carousel navigation
  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % totalImages);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + totalImages) % totalImages);
  };

  const goToImage = (index: number) => {
    setCurrentImageIndex(index);
  };

  // Keyboard navigation for carousel
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (isImageFullscreen) {
        if (e.key === 'ArrowLeft') prevImage();
        if (e.key === 'ArrowRight') nextImage();
        if (e.key === 'Escape') setIsImageFullscreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isImageFullscreen, totalImages]);

  // Prevent body scroll when fullscreen is open
  useEffect(() => {
    if (isImageFullscreen) {
      // Save current scroll position
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
    } else {
      // Restore scroll position
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    }
  }, [isImageFullscreen]);

  const fetchCompanionProfile = async () => {
    try {
      setIsLoading(true);
      // For now, using the browse endpoint and finding the companion
      // TODO: Create dedicated profile endpoint
      const response = await companionsApi.getCompanions();
      const companions = response.data || [];
      const companionData = companions.find(c => c.id === parseInt(id!));

      if (companionData) {
        // Use actual data from API
        setCompanion({
          id: companionData.id,
          name: companionData.name,
          email: companionData.email || '',
          profilePhotoUrl: companionData.profilePhotoUrl || '',
          additionalPhoto1Url: companionData.additionalPhoto1Url || '',
          additionalPhoto2Url: companionData.additionalPhoto2Url || '',
          age: companionData.age,
          bio: companionData.bio || '',
          interests: companionData.interests || [],
          servicesOffered: companionData.servicesOffered || [],
          languages: companionData.languages || [],
          hourlyRate: companionData.hourlyRate || 0,
          verified: true, // All approved companions are verified
          location: companionData.location || '',
          joinedDate: companionData.joinedDate || new Date().toISOString(),
          // Backend returns averageRating as a STRING, convert to number
          averageRating: typeof companionData.averageRating === 'string' 
            ? parseFloat(companionData.averageRating) 
            : (companionData.averageRating || 0),
          reviewCount: companionData.reviewCount || 0
        });
      } else {
        toast.error('Companion not found');
        navigate('/browse-companions');
      }
    } catch (error) {
      console.error('Error fetching companion profile:', error);
      toast.error('Failed to load companion profile');
      // Set some default data to allow availability to still work
      if (id) {
        setCompanion({
          id: parseInt(id),
          name: 'Companion',
          email: '',
          profilePhotoUrl: '',
          age: 0,
          bio: '',
          interests: [],
          servicesOffered: [],
          languages: [],
          hourlyRate: 75,
          verified: false,
          joinedDate: new Date().toISOString(),
          location: ''
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAvailability = async () => {
    try {
      if (!id) return;
      const slots = await bookingApi.getCompanionAvailability(parseInt(id));
      setAvailability(slots || []);
      console.log(`Fetched ${slots?.length || 0} availability slots for companion ${id}`);
    } catch (error) {
      console.error('Error fetching availability:', error);
      // Set empty availability array to prevent undefined errors
      setAvailability([]);
      // Don't show error to user as availability might just not be set yet
    }
  };

  const fetchReviews = async () => {
    try {
      if (!id) return;
      setReviewsLoading(true);
      const response = await bookingApi.getCompanionReviews(parseInt(id), currentReviewPage, 5);
      setReviews(response.reviews);
      setReviewStats(response.stats);
      setTotalReviewPages(response.pagination.totalPages);
    } catch (error) {
      console.error('Error fetching reviews:', error);
      // Don't show error toast, just show empty reviews
      setReviews([]);
      // Keep the basic rating from companion data if available, don't reset to 0
      if (!companion || companion.reviewCount === 0) {
        setReviewStats({
          total: 0,
          distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          average: 0
        });
      }
      // If companion has ratings, they're already set from companion data - don't override
    } finally {
      setReviewsLoading(false);
    }
  };


  const handleRequestBooking = () => {
    if (!isAuthenticated) {
      toast.error('Please login to request a booking');
      navigate('/signin');
      return;
    }

    setShowRequestModal(true);
  };



  const getDayOfWeek = (date: Date) => {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[date.getDay()];
  };

  const getAvailableTimeSlots = () => {
    const dayOfWeek = getDayOfWeek(selectedDate);
    return availability.filter(slot =>
      slot.dayOfWeek === dayOfWeek && slot.isAvailable
    );
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const handleFavoriteToggle = async () => {
    if (!user) {
      toast.error('Please login to add favorites');
      navigate('/signin');
      return;
    }

    if (!id) return;

    try {
      if (isFavorited) {
        await favoritesApi.removeFavorite(parseInt(id));
        setIsFavorited(false);
        toast.success('Removed from favorites');
      } else {
        await favoritesApi.addFavorite(parseInt(id));
        setIsFavorited(true);
        toast.success('Added to favorites');
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      toast.error('Failed to update favorites');
    }
  };

  const handleCalendarDateSelect = (date: Date) => {
    setSelectedDate(date);
    setSelectedTimeSlot(null);
  };

  const renderStars = (rating: number) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;

    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars.push(<FaStar key={i} className="text-yellow-400" />);
      } else if (i === fullStars && hasHalfStar) {
        stars.push(<FaStar key={i} className="text-yellow-400 opacity-50" />);
      } else {
        stars.push(<FaStar key={i} className="text-gray-300" />);
      }
    }
    return stars;
  };

  if (isLoading) {
    return <LoadingSpinner fullScreen />;
  }

  if (!companion) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">Companion not found</h2>
          <button
            onClick={() => navigate('/browse-companions')}
            className="mt-4 px-6 py-2 bg-[#312E81] text-white rounded-lg hover:bg-[#1E1B4B] hover:shadow-[0_0_15px_rgba(255,204,203,0.3)]"
          >
            Browse Companions
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - normal scrolling with modal-aware hiding */}
      <div
        className={`bg-white border-b transition-opacity duration-300 ${
          isAnyModalOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <FaArrowLeft />
              <span>Back</span>
            </button>

            <FavoriteButton
              companionId={companion?.id || 0}
              companionName={companion?.name}
              size="lg"
              className="bg-white hover:bg-gray-100"
            />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="w-full">
          {/* Main Content - Full Width */}
          <div className="space-y-6">
            {/* Profile Header with Photo Gallery */}
            <div className="bg-white rounded-xl shadow-lg overflow-hidden">
              {/* Modern Image Carousel */}
              <div className="relative bg-gradient-to-br from-gray-100 to-gray-200">
                {totalImages > 0 ? (
                  <>
                    {/* Main Carousel Image */}
                    <div className="relative min-h-[300px] sm:min-h-[400px] md:min-h-[500px] max-h-[500px] sm:max-h-[600px] md:max-h-[700px] h-[350px] sm:h-[450px] md:h-[600px] overflow-hidden flex items-center justify-center">
                      <img
                        src={images[currentImageIndex]}
                        alt={`${companion.name}'s photo ${currentImageIndex + 1}`}
                        className="w-full h-full object-contain transition-opacity duration-500"
                        style={{ imageRendering: '-webkit-optimize-contrast', maxWidth: '100%', maxHeight: '100%' }}
                        loading="eager"
                        fetchPriority="high"
                      />

                      {/* Gradient Overlay at bottom for better text visibility */}
                      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

                      {/* Verified Badge */}
                      {companion.verified && (
                        <div className="absolute top-6 right-6 bg-green-500 text-white px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 shadow-xl backdrop-blur-sm bg-opacity-95">
                          <FaShieldAlt className="text-base" />
                          Verified
                        </div>
                      )}

                      {/* Navigation Arrows */}
                      {totalImages > 1 && (
                        <>
                          <button
                            onClick={prevImage}
                            className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-800 p-3 rounded-full shadow-lg transition-all duration-200 hover:scale-110 backdrop-blur-sm"
                            aria-label="Previous image"
                          >
                            <FaChevronLeft className="text-xl" />
                          </button>
                          <button
                            onClick={nextImage}
                            className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-800 p-3 rounded-full shadow-lg transition-all duration-200 hover:scale-110 backdrop-blur-sm"
                            aria-label="Next image"
                          >
                            <FaChevronRight className="text-xl" />
                          </button>
                        </>
                      )}

                      {/* Photo Counter */}
                      <div className="absolute top-6 left-6 bg-black/60 text-white px-4 py-2 rounded-full text-sm font-medium backdrop-blur-sm">
                        {currentImageIndex + 1} / {totalImages}
                      </div>

                      {/* Fullscreen Button */}
                      <button
                        onClick={() => setIsImageFullscreen(true)}
                        className="absolute top-6 left-24 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full transition-all duration-200 backdrop-blur-sm"
                        aria-label="View fullscreen"
                      >
                        <FaExpand className="text-base" />
                      </button>

                      {/* Dot Indicators */}
                      {totalImages > 1 && (
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
                          {images.map((_, index) => (
                            <button
                              key={index}
                              onClick={() => goToImage(index)}
                              className={`transition-all duration-300 rounded-full ${
                                index === currentImageIndex
                                  ? 'bg-white w-8 h-2'
                                  : 'bg-white/50 hover:bg-white/75 w-2 h-2'
                              }`}
                              aria-label={`Go to image ${index + 1}`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="relative h-[350px] sm:h-[450px] md:h-[600px] bg-gradient-to-br from-[#312E81] to-[#4A47A3] flex items-center justify-center">
                    <div className="w-32 h-32 sm:w-40 sm:h-40 md:w-48 md:h-48 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-sm">
                      <FaUser className="text-5xl sm:text-6xl md:text-8xl text-white/50" />
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900">{companion.name}</h1>
                    <div className="flex items-center gap-4 mt-2 text-gray-600">
                      {/* Only show location if it exists */}
                      {companion.location && companion.location.trim() !== '' && (
                        <span className="flex items-center gap-1">
                          <FaMapMarkerAlt />
                          {companion.location}
                        </span>
                      )}
                      {/* Only show member since if valid date */}
                      {companion.joinedDate && (
                        <span className="flex items-center gap-1">
                          <FaCalendarAlt />
                          Member since {!isNaN(new Date(companion.joinedDate).getFullYear()) ?
                            new Date(companion.joinedDate).getFullYear() :
                            new Date().getFullYear()}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 mt-4">
                      <div className="flex items-center gap-1">
                        {renderStars(reviewStats?.average || 0)}
                        <span className="ml-2 font-semibold">{reviewStats?.average || 0}</span>
                        <span className="text-gray-500">({reviewStats?.total || 0} reviews)</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    {companion.hourlyRate && companion.hourlyRate > 0 ? (
                      <>
                        <div className="text-3xl font-bold text-[#312E81]">
                          ${companion.hourlyRate}
                        </div>
                        <div className="text-sm text-gray-500">per hour</div>
                      </>
                    ) : (
                      <div className="text-sm text-gray-500">
                        Rate not set
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-xl shadow-lg">
              <div className="border-b">
                <div className="flex">
                  {(['about', 'availability', 'reviews'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`flex-1 px-6 py-4 font-medium capitalize transition-colors ${
                        activeTab === tab
                          ? 'text-[#312E81] border-b-2 border-[#312E81]'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-6">
                {/* About Tab - Keep mounted, hide with CSS to prevent remount */}
                <div className={activeTab === 'about' ? '' : 'hidden'}>
                  <div className="space-y-6">
                    {/* Only show About Me if bio exists */}
                    {companion.bio && companion.bio.trim() !== '' && (
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-3">About Me</h3>
                        <p className="text-gray-600 leading-relaxed">{companion.bio}</p>
                      </div>
                    )}

                    {/* Only show Services if they exist */}
                    {companion.servicesOffered && companion.servicesOffered.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                          <FaServicestack className="text-[#312E81]" />
                          Services Offered
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {companion.servicesOffered.map((service, index) => (
                            <span
                              key={index}
                              className="px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm"
                            >
                              {service}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Only show Languages if they exist */}
                    {companion.languages && companion.languages.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                          <FaLanguage className="text-[#312E81]" />
                          Languages
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {companion.languages.map((language, index) => (
                            <span
                              key={index}
                              className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                            >
                              {language}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Only show Interests if they exist */}
                    {companion.interests && companion.interests.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                          <FaHeart className="text-[#312E81]" />
                          Interests
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {companion.interests.map((interest, index) => (
                            <span
                              key={index}
                              className="px-3 py-1 bg-secondary-100 text-secondary-700 rounded-full text-sm"
                            >
                              {interest}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Show message if no info available */}
                    {(!companion.bio || companion.bio.trim() === '') &&
                     (!companion.servicesOffered || companion.servicesOffered.length === 0) &&
                     (!companion.languages || companion.languages.length === 0) &&
                     (!companion.interests || companion.interests.length === 0) && (
                      <div className="text-center py-8 text-gray-500">
                        No profile information available yet.
                      </div>
                    )}
                  </div>
                </div>

                {/* Availability Tab - Keep mounted, hide with CSS to prevent remount */}
                <div className={activeTab === 'availability' ? '' : 'hidden'}>
                  <div className="space-y-6">
                    {/* Monthly Availability Section */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                      <h3 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
                        <FaCalendarAlt className="text-[#312E81]" />
                        Monthly Availability
                      </h3>

                      <MonthlyAvailabilityWidget
                        companionId={companionIdNumber}
                        selectedDate={selectedDate}
                        onDateSelect={handleCalendarDateSelect}
                        refreshTrigger={availabilityRefreshTrigger}
                      />

                      <div className="mt-4 text-center text-sm text-gray-600">
                        Select a date to view detailed time slots below.
                      </div>
                    </div>

                    {/* Time Slot Selection Section */}
                    {selectedDate && (
                      <div className="bg-white rounded-xl border border-gray-200 p-6 mt-4">
                        <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                          <FaClock className="text-[#312E81]" />
                          Available Times for{' '}
                          {selectedDate.toLocaleDateString('en-US', {
                            weekday: 'long',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </h4>

                        {(() => {
                          const selectedDaySlots = getAvailableTimeSlots();

                          if (selectedDaySlots.length === 0) {
                            return (
                              <div className="text-center py-8 text-gray-500">
                                No available time slots for this day
                              </div>
                            );
                          }

                          return (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                              {selectedDaySlots.map((slot, slotIndex) => {
                                const isSelectedSlot = selectedTimeSlot?.start === slot.startTime &&
                                                      selectedTimeSlot?.end === slot.endTime;

                                // Parse services if it's a string
                                const services = slot.services
                                  ? (typeof slot.services === 'string'
                                      ? JSON.parse(slot.services)
                                      : slot.services)
                                  : [];

                                return (
                                  <button
                                    key={slotIndex}
                                    onClick={() => {
                                      setSelectedTimeSlot({
                                        start: slot.startTime,
                                        end: slot.endTime,
                                        services: services
                                      });
                                      setShowEnhancedBookingModal(true);
                                    }}
                                    className={`p-3 rounded-lg border-2 transition-all ${
                                      isSelectedSlot
                                        ? 'border-[#312E81] bg-primary-50 shadow-md'
                                        : 'border-gray-200 hover:border-[#312E81] hover:shadow-sm'
                                    }`}
                                  >
                                    <div className="text-center">
                                      <div className="font-medium text-gray-900">
                                        {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                                      </div>
                                      {services.length > 0 && (
                                        <div className="text-xs text-gray-500 mt-1">
                                          {services.slice(0, 2).join(', ')}
                                          {services.length > 2 && ` +${services.length - 2}`}
                                        </div>
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Request Custom Booking Button - Always visible at bottom */}
                    <div className="mt-8 pt-6 border-t border-gray-200">
                      <div className="text-center">
                        <h4 className="text-lg font-semibold text-gray-900 mb-2">
                          Need a Different Time?
                        </h4>
                        <p className="text-gray-600 mb-4">
                          Can't find a suitable time slot? Send a custom booking request
                        </p>
                        <button
                          onClick={handleRequestBooking}
                          className="px-8 py-3 bg-gradient-to-r from-[#312E81] to-[#1E1B4B] text-white font-semibold rounded-lg hover:shadow-[0_0_20px_rgba(255,204,203,0.3)] shadow-lg transition-all duration-300 flex items-center gap-2 mx-auto"
                        >
                          <FaCalendarAlt />
                          Request Custom Booking
                        </button>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Reviews Tab - Keep mounted, hide with CSS to prevent remount */}
                <div className={activeTab === 'reviews' ? '' : 'hidden'}>
                  <div className="space-y-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Reviews ({reviewStats?.total || 0})
                      </h3>
                    </div>

                    {/* Rating Summary */}
                    <div className="bg-gray-50 rounded-lg p-6">
                      <div className="flex items-center gap-8">
                        <div className="text-center">
                          <div className="text-4xl font-bold text-gray-900">{reviewStats?.average || 0}</div>
                          <div className="flex items-center gap-1 mt-2">
                            {renderStars(reviewStats?.average || 0)}
                          </div>
                          <div className="text-sm text-gray-500 mt-1">
                            {reviewStats?.total || 0} reviews
                          </div>
                        </div>

                        <div className="flex-1 space-y-2">
                          {[5, 4, 3, 2, 1].map(stars => {
                            const count = reviewStats?.distribution[stars] || 0;
                            const total = reviewStats?.total || 0;
                            const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                            return (
                              <div key={stars} className="flex items-center gap-3">
                                <span className="text-sm text-gray-600 w-4">{stars}</span>
                                <FaStar className="text-yellow-400 text-sm" />
                                <div className="flex-1 bg-gray-200 rounded-full h-2">
                                  <div
                                    className="bg-yellow-400 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                                <span className="text-sm text-gray-600 w-10 text-right">
                                  {count}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Real Reviews */}
                    {reviewsLoading ? (
                      <div className="space-y-4">
                        {[1, 2, 3].map(i => (
                          <div key={i} className="border-b pb-4 animate-pulse">
                            <div className="flex items-start gap-4">
                              <div className="w-10 h-10 rounded-full bg-gray-200" />
                              <div className="flex-1 space-y-3">
                                <div className="h-4 bg-gray-200 rounded w-1/4" />
                                <div className="h-3 bg-gray-200 rounded w-1/3" />
                                <div className="h-4 bg-gray-200 rounded w-full" />
                                <div className="h-4 bg-gray-200 rounded w-3/4" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : reviews.length > 0 ? (
                      <div className="space-y-4">
                        {reviews.map(review => (
                          <div key={review.id} className="border-b pb-4">
                            <div className="flex items-start gap-4">
                              {review.reviewerPhoto ? (
                                <img
                                  src={review.reviewerPhoto}
                                  alt={review.reviewerName}
                                  className="w-10 h-10 rounded-full object-cover"
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center">
                                  <FaUser className="text-gray-600" />
                                </div>
                              )}
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <h4 className="font-medium text-gray-900">{review.reviewerName}</h4>
                                    <div className="flex items-center gap-2 mt-1">
                                      <div className="flex items-center gap-1">
                                        {renderStars(review.rating)}
                                      </div>
                                      <span className="text-sm text-gray-500">
                                        • {new Date(review.createdAt).toLocaleDateString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          year: 'numeric'
                                        })}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                {review.reviewText && (
                                  <p className="mt-3 text-gray-600">
                                    {review.reviewText}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        No reviews yet. Be the first to book and review!
                      </div>
                    )}

                    {totalReviewPages > 1 && (
                      <div className="flex justify-center gap-2 mt-6">
                        <button
                          onClick={() => setCurrentReviewPage(prev => Math.max(1, prev - 1))}
                          disabled={currentReviewPage === 1}
                          className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Previous
                        </button>
                        <span className="px-4 py-2 text-sm">
                          Page {currentReviewPage} of {totalReviewPages}
                        </span>
                        <button
                          onClick={() => setCurrentReviewPage(prev => Math.min(totalReviewPages, prev + 1))}
                          disabled={currentReviewPage === totalReviewPages}
                          className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Custom Booking Request Modal */}
      <CustomBookingRequestModal
        isOpen={showRequestModal}
        onClose={() => setShowRequestModal(false)}
        companionId={companion?.id || 0}
        companionName={companion?.name || ''}
        companionServices={companion?.servicesOffered || []}
        onRequestCreated={(requestId) => {
          // Success toast is handled by the modal itself
          setShowRequestModal(false);
          // Optionally refresh or navigate
        }}
      />

      {/* Enhanced Booking Modal */}
      {showEnhancedBookingModal && selectedTimeSlot && (
        <DetailedBookingModal
          isOpen={showEnhancedBookingModal}
          onClose={() => setShowEnhancedBookingModal(false)}
          companionId={companion?.id || 0}
          companionName={companion?.name || ''}
          selectedDate={selectedDate}
          selectedTimeSlot={selectedTimeSlot}
          companionServices={companion?.servicesOffered || []}
          hourlyRate={companion?.hourlyRate || 75}
          onBookingCreated={(bookingId) => {
            // Success toast is handled by the modal itself
            // Navigate to booking confirmation or refresh data
            navigate(`/client-dashboard`);
          }}
        />
      )}

      {/* Fullscreen Image Modal with Blurred Background */}
      {isImageFullscreen && totalImages > 0 && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          {/* Blurred Background */}
          <div 
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url(${images[currentImageIndex]})`,
              filter: 'blur(40px)',
              transform: 'scale(1.1)',
            }}
          />
          
          {/* Dark Overlay for better contrast */}
          <div className="absolute inset-0 bg-black/60" />

          {/* Close Button */}
          <button
            onClick={() => setIsImageFullscreen(false)}
            className="absolute top-6 right-6 bg-white/20 hover:bg-white/30 text-white p-3 rounded-full backdrop-blur-md transition-all duration-200 z-10 shadow-lg"
            aria-label="Close fullscreen"
          >
            <FaTimes className="text-2xl" />
          </button>

          {/* Photo Counter */}
          <div className="absolute top-6 left-6 bg-white/20 text-white px-4 py-3 rounded-full text-base font-semibold backdrop-blur-md z-10 shadow-lg">
            {currentImageIndex + 1} / {totalImages}
          </div>

          {/* Navigation Arrows */}
          {totalImages > 1 && (
            <>
              <button
                onClick={prevImage}
                className="absolute left-6 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 text-white p-4 rounded-full backdrop-blur-md transition-all duration-200 hover:scale-110 z-10 shadow-lg"
                aria-label="Previous image"
              >
                <FaChevronLeft className="text-3xl" />
              </button>
              <button
                onClick={nextImage}
                className="absolute right-6 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 text-white p-4 rounded-full backdrop-blur-md transition-all duration-200 hover:scale-110 z-10 shadow-lg"
                aria-label="Next image"
              >
                <FaChevronRight className="text-3xl" />
              </button>
            </>
          )}

          {/* Main Image */}
          <img
            src={images[currentImageIndex]}
            alt={`${companion?.name}'s photo ${currentImageIndex + 1}`}
            className="relative max-w-[90vw] max-h-[90vh] object-contain z-10 rounded-lg shadow-2xl"
            style={{ imageRendering: '-webkit-optimize-contrast' }}
            loading="eager"
            fetchPriority="high"
          />

          {/* Dot Indicators */}
          {totalImages > 1 && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-3 z-10">
              {images.map((_, index) => (
                <button
                  key={index}
                  onClick={() => goToImage(index)}
                  className={`transition-all duration-300 rounded-full shadow-lg ${
                    index === currentImageIndex
                      ? 'bg-white w-10 h-3'
                      : 'bg-white/50 hover:bg-white/70 w-3 h-3'
                  }`}
                  aria-label={`Go to image ${index + 1}`}
                />
              ))}
            </div>
          )}

          {/* Instruction Text */}
          <div className="absolute bottom-8 right-8 text-white text-sm backdrop-blur-md bg-white/20 px-4 py-2 rounded-lg shadow-lg z-10">
            Press <kbd className="px-2 py-1 bg-white/10 rounded border border-white/20">ESC</kbd> to close • Use <kbd className="px-2 py-1 bg-white/10 rounded border border-white/20">←</kbd> <kbd className="px-2 py-1 bg-white/10 rounded border border-white/20">→</kbd> to navigate
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanionDetails;