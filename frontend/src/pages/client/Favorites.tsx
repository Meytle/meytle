/**
 * Favorites Page
 * Displays all favorite companions for the client
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  FaHeart,
  FaStar,
  FaMapMarkerAlt,
  FaSearch,
  FaFilter,
  FaUserPlus,
  FaCalendarAlt
} from 'react-icons/fa';
import { favoritesApi } from '../../api/favorites';
import type { FavoriteCompanion } from '../../api/favorites';
import FavoriteButton from '../../components/common/FavoriteButton';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import QuickBookingModal from '../../components/booking/QuickBookingModal';
import type { Companion } from '../../types';
import { API_CONFIG, ROUTES } from '../../constants';
import { useAuth } from '../../hooks/useAuth';
import { getImageUrl } from '../../utils/imageHelpers';

const Favorites: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [favorites, setFavorites] = useState<FavoriteCompanion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'rating' | 'recent'>('recent');
  const [selectedCompanion, setSelectedCompanion] = useState<Companion | null>(null);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);

  useEffect(() => {
    fetchFavorites();
  }, []);

  const fetchFavorites = async () => {
    try {
      setIsLoading(true);
      const data = await favoritesApi.getFavorites();
      setFavorites(data);
    } catch (error) {
      console.error('Error fetching favorites:', error);
      toast.error('Failed to load favorites');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveFavorite = (companionId: number) => {
    setFavorites(prev => prev.filter(fav => fav.id !== companionId));
  };

  const handleBookCompanion = (e: React.MouseEvent, companion: FavoriteCompanion) => {
    e.stopPropagation(); // Prevent any parent click handlers

    // Redirect to signin if not authenticated
    if (!isAuthenticated) {
      navigate('/signin');
      return;
    }

    // Convert FavoriteCompanion to Companion type for the modal
    const companionForBooking: Companion = {
      id: companion.id,
      name: companion.name,
      age: 0, // Age not available in favorites, using default
      location: companion.location || 'Location not specified',
      description: companion.bio || 'Professional companion',
      rating: companion.averageRating || 0,
      reviewCount: companion.reviewCount || 0,
      responseTime: '30 minutes',
      imageUrl: companion.profilePhotoUrl ? `${API_CONFIG.BASE_URL.replace('/api', '')}${companion.profilePhotoUrl}` : '',
      isVerified: companion.isVerified || false,
      isAvailable: true,
      interests: [] // Required property, not available in favorites data
    };

    setSelectedCompanion(companionForBooking);
    setIsBookingModalOpen(true);
  };

  const handleBookingCreated = (bookingId: number) => {
    console.log('Booking created with ID:', bookingId);
    // Success toast is handled by the modal itself
  };

  const filteredAndSortedFavorites = React.useMemo(() => {
    let filtered = favorites;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(companion =>
        companion.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        companion.location?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply sorting
    const sorted = [...filtered];
    switch (sortBy) {
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'rating':
        sorted.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));
        break;
      case 'recent':
      default:
        // Already sorted by favorited_at desc from API
        break;
    }

    return sorted;
  }, [favorites, searchTerm, sortBy]);

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }).map((_, index) => (
      <FaStar
        key={index}
        className={`${
          index < Math.floor(rating)
            ? 'text-yellow-400'
            : 'text-gray-300'
        }`}
      />
    ));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">My Favorites</h1>
              <p className="mt-1 text-sm text-gray-500">
                {favorites.length} favorite companion{favorites.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => navigate(ROUTES.CLIENT_DASHBOARD)}
              className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium transition-colors"
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search and Filter Bar */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search favorites by name or location..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#312E81] focus:border-[#312E81]"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#312E81] focus:border-[#312E81]"
              >
                <option value="recent">Recently Added</option>
                <option value="name">Name (A-Z)</option>
                <option value="rating">Highest Rated</option>
              </select>
            </div>
          </div>
        </div>

        {/* Favorites Grid */}
        {filteredAndSortedFavorites.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAndSortedFavorites.map((companion) => (
              <div
                key={companion.id}
                className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow flex flex-col h-full"
              >
                {/* Image */}
                <div className="relative h-48 bg-gradient-to-br from-[#4A47A3] to-[#FFCCCB]">
                  {companion.profilePhotoUrl ? (
                    <img
                      src={getImageUrl(companion.profilePhotoUrl)}
                      alt={companion.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center">
                        <span className="text-3xl text-white font-bold">
                          {companion.name.charAt(0)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Favorite Button */}
                  <div className="absolute top-3 right-3">
                    <FavoriteButton
                      companionId={companion.id}
                      companionName={companion.name}
                      initialFavorited={true}
                      size="md"
                      className="bg-white/90 hover:bg-white shadow-md"
                      onToggle={(isFavorited) => {
                        if (!isFavorited) {
                          handleRemoveFavorite(companion.id);
                        }
                      }}
                    />
                  </div>

                  {/* Verified Badge */}
                  {companion.isVerified && (
                    <div className="absolute top-3 left-3 bg-white/90 px-2 py-1 rounded-full">
                      <span className="text-xs font-semibold text-green-600">
                        ✓ Verified
                      </span>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-5 flex flex-col flex-1">
                  {/* Top section - flexible content */}
                  <div className="flex-grow">
                    <div className="mb-3">
                    <h3 className="text-lg font-bold text-gray-900 mb-1">
                      {companion.name}
                    </h3>
                    {companion.location && (
                      <p className="text-sm text-gray-600 flex items-center gap-1">
                        <FaMapMarkerAlt className="text-xs" />
                        {companion.location}
                      </p>
                    )}
                  </div>

                  {/* Bio */}
                  {companion.bio && (
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                      {companion.bio}
                    </p>
                  )}

                  {/* Rating and Price */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {companion.averageRating ? (
                        <>
                          <div className="flex items-center gap-0.5">
                            {renderStars(companion.averageRating)}
                          </div>
                          <span className="text-sm text-gray-600 ml-1">
                            ({companion.reviewCount || 0})
                          </span>
                        </>
                      ) : (
                        <span className="text-sm text-gray-500">No reviews yet</span>
                      )}
                    </div>
                    {companion.hourlyRate && (
                      <div className="text-right">
                        <span className="text-lg font-bold text-[#312E81]">
                          ${companion.hourlyRate}
                        </span>
                        <span className="text-xs text-gray-500">/hr</span>
                      </div>
                    )}
                  </div>
                  </div>

                  {/* Book Now Button - Always at bottom */}
                  <div className="mt-auto pt-4 border-t">
                    <button
                      onClick={(e) => handleBookCompanion(e, companion)}
                      className="w-full bg-gradient-to-r from-[#312E81] to-[#FFCCCB] text-white py-3 rounded-lg hover:shadow-lg hover:shadow-[0_0_15px_rgba(255,204,203,0.3)] transition-all duration-300 font-semibold flex items-center justify-center gap-2"
                    >
                      <FaCalendarAlt />
                      Book Now
                    </button>
                    <p className="text-xs text-gray-500 text-center mt-2">
                      Added {new Date(companion.favoritedAt).toLocaleDateString('en-US', {
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
        ) : searchTerm ? (
          <div className="text-center py-16">
            <FaSearch className="mx-auto text-6xl text-gray-300 mb-4" />
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              No favorites found
            </h3>
            <p className="text-gray-600">
              No favorites match your search "{searchTerm}"
            </p>
            <button
              onClick={() => setSearchTerm('')}
              className="mt-4 px-4 py-2 bg-[#312E81] text-white rounded-lg hover:bg-[#1E1B4B] hover:shadow-[0_0_15px_rgba(255,204,203,0.3)]"
            >
              Clear Search
            </button>
          </div>
        ) : (
          <div className="text-center py-16">
            <FaHeart className="mx-auto text-6xl text-gray-300 mb-4" />
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              No favorites yet
            </h3>
            <p className="text-gray-600 mb-6">
              Start exploring and add companions to your favorites!
            </p>
            <button
              onClick={() => navigate('/browse-companions')}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#312E81] to-[#FFCCCB] text-white rounded-lg hover:shadow-lg hover:shadow-[0_0_15px_rgba(255,204,203,0.3)] transition-all"
            >
              <FaUserPlus />
              Browse Companions
            </button>
          </div>
        )}
      </main>

      {/* Booking Modal */}
      {selectedCompanion && (
        <QuickBookingModal
          isOpen={isBookingModalOpen}
          onClose={() => setIsBookingModalOpen(false)}
          companion={selectedCompanion}
          onBookingCreated={handleBookingCreated}
        />
      )}
    </div>
  );
};

export default Favorites;