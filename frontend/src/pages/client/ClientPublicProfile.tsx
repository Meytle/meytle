/**
 * Client Public Profile Page
 * Shows limited client information for companions to view
 * No sensitive information like contact details or address
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  FaUser,
  FaStar,
  FaCalendar,
  FaArrowLeft,
  FaHeart
} from 'react-icons/fa';
import clientApi from '../../api/client';
import { API_CONFIG } from '../../constants';
import { getImageUrl } from '../../utils/imageHelpers';

interface ClientPublicProfileData {
  id: number;
  name: string;
  profilePhotoUrl?: string;
  bio?: string;
  interests: string[];
  memberSince: string;
  stats: {
    totalReviews: number;
    averageRating: number;
  };
  reviews: Array<{
    id: number;
    rating: number;
    reviewText: string;
    createdAt: string;
    reviewerName: string;
    bookingDate: string;
  }>;
}

const ClientPublicProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ClientPublicProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!id) {
        toast.error('Invalid client ID');
        navigate(-1);
        return;
      }

      try {
        const data = await clientApi.getClientPublicProfile(parseInt(id));
        setProfile(data);
      } catch (error: any) {
        console.error('Error fetching client profile:', error);
        toast.error('Failed to load client profile');
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [id, navigate]);

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  const formatMemberSince = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long'
      });
    } catch {
      return 'Recently';
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <FaStar
            key={star}
            className={`${
              star <= rating ? 'text-yellow-500' : 'text-gray-300'
            } text-sm`}
          />
        ))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#312E81]"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center py-20">
            <FaUser className="mx-auto text-6xl text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg">Client profile not found</p>
            <button
              onClick={() => navigate(-1)}
              className="mt-4 text-[#312E81] hover:underline"
            >
              Go back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const profilePhotoUrl = profile.profilePhotoUrl
    ? profile.profilePhotoUrl.startsWith('http')
      ? profile.profilePhotoUrl
      : `${API_CONFIG.BASE_URL.replace('/api', '')}${profile.profilePhotoUrl}`
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back Button */}
        <button
          onClick={() => navigate(-1)}
          className="mb-6 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <FaArrowLeft />
          <span>Back</span>
        </button>

        {/* Profile Header */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Profile Photo */}
            <div className="w-32 h-32 rounded-full overflow-hidden bg-gradient-to-br from-[#4A47A3] to-[#312E81] flex items-center justify-center text-white text-4xl font-bold flex-shrink-0">
              {profilePhotoUrl ? (
                <img
                  src={getImageUrl(profilePhotoUrl)}
                  alt={profile.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                profile.name.charAt(0).toUpperCase()
              )}
            </div>

            {/* Basic Info */}
            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {profile.name}
              </h1>
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-3">
                <span className="inline-block bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-medium">
                  Client
                </span>
                <span className="text-gray-500 text-sm flex items-center gap-1">
                  <FaCalendar className="text-xs" />
                  Member since {formatMemberSince(profile.memberSince)}
                </span>
              </div>

              {/* Rating */}
              {profile.stats.totalReviews > 0 && (
                <div className="flex items-center justify-center sm:justify-start gap-3">
                  <div className="flex items-center gap-2">
                    {renderStars(Math.round(profile.stats.averageRating))}
                    <span className="text-lg font-semibold text-gray-900">
                      {profile.stats.averageRating.toFixed(1)}
                    </span>
                  </div>
                  <span className="text-gray-500 text-sm">
                    ({profile.stats.totalReviews} review{profile.stats.totalReviews !== 1 ? 's' : ''})
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Bio */}
          {profile.bio && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">About</h3>
              <p className="text-gray-600">{profile.bio}</p>
            </div>
          )}

          {/* Interests */}
          {profile.interests && profile.interests.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Interests</h3>
              <div className="flex flex-wrap gap-2">
                {profile.interests.map((interest, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-sm"
                  >
                    {interest}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Reviews Section */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <FaHeart className="text-red-500" />
            Reviews
          </h2>

          {profile.reviews.length === 0 ? (
            <div className="text-center py-12">
              <FaStar className="mx-auto text-6xl text-gray-300 mb-4" />
              <p className="text-gray-500">No reviews yet</p>
            </div>
          ) : (
            <div className="space-y-6">
              {profile.reviews.map((review) => (
                <div
                  key={review.id}
                  className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        {renderStars(review.rating)}
                        <span className="font-semibold text-gray-900">
                          {review.reviewerName}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">
                        Booking on {formatDate(review.bookingDate)}
                      </p>
                    </div>
                    <span className="text-xs text-gray-400">
                      {formatDate(review.createdAt)}
                    </span>
                  </div>
                  <p className="text-gray-700">{review.reviewText}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClientPublicProfile;
