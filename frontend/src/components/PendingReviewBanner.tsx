/**
 * Pending Review Banner Component - CLIENTS ONLY
 * Displays a prompt for CLIENTS to review their companions after completed bookings
 * Blocks further bookings until reviews are submitted
 * Note: Only clients can review companions, not the other way around
 */

import React, { useState, useEffect } from 'react';
import { FaStar, FaExclamationCircle, FaTimes, FaUser } from 'react-icons/fa';
import { bookingApi } from '../api/booking';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import { useModalRegistration } from '../context/ModalContext';
import { formatTimeRange, getUserBrowserTimezone } from '../utils/timeConverter';

interface PendingReview {
  id: number;
  bookingDate: string;
  startTime: string;
  endTime: string;
  totalAmount: number;
  clientId: number;
  companionId: number;
  clientName: string;
  companionName: string;
  companionPhoto?: string;
  clientPhoto?: string;
  serviceCategoryName?: string;
  otherPartyName: string;
  otherPartyPhoto?: string;
}

interface PendingReviewBannerProps {
  onReviewsUpdated?: () => void;
}

const PendingReviewBanner: React.FC<PendingReviewBannerProps> = ({ onReviewsUpdated }) => {
  const { user } = useAuth();
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedReview, setSelectedReview] = useState<PendingReview | null>(null);
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [userTimezone] = useState<string>(getUserBrowserTimezone());

  // Register modal with global modal context (handles scroll prevention automatically)
  useModalRegistration('pending-review-modal', showModal);

  // Fetch pending reviews on mount
  useEffect(() => {
    fetchPendingReviews();
  }, []);

  const fetchPendingReviews = async () => {
    try {
      const response = await bookingApi.getPendingReviews();
      setPendingReviews(response.pendingReviews || []);
    } catch (error) {
      console.error('Failed to fetch pending reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReviewClick = (review: PendingReview) => {
    setSelectedReview(review);
    setShowModal(true);
    setRating(0);
    setComment('');
  };

  const handleSubmitReview = async () => {
    if (!selectedReview) return;

    if (rating === 0) {
      toast.error('Please select a star rating');
      return;
    }

    // Comment is now optional - only validate if provided
    if (comment.trim().length > 0 && comment.trim().length < 10) {
      toast.error('Review must be at least 10 characters if provided');
      return;
    }

    if (comment.length > 500) {
      toast.error('Review must be less than 500 characters');
      return;
    }

    setSubmitting(true);

    try {
      await bookingApi.createReview(selectedReview.id, {
        rating,
        comment: comment.trim() // Always send string (empty string if no comment)
      });

      toast.success('Review submitted successfully!');
      
      // Close modal first
      setShowModal(false);
      setSelectedReview(null);
      setRating(0);
      setComment('');

      // Re-fetch pending reviews from backend to ensure consistency
      await fetchPendingReviews();

      // Notify parent component
      if (onReviewsUpdated) {
        onReviewsUpdated();
      }
    } catch (error: any) {
      console.error('Failed to submit review:', error);
      const message = error.response?.data?.message || 'Failed to submit review';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return null; // Don't show anything while loading
  }

  if (pendingReviews.length === 0) {
    return null; // Don't show banner if no pending reviews
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  return (
    <>
      {/* Banner */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-l-4 border-amber-500 rounded-lg p-6 mb-6 shadow-md">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
              <FaExclamationCircle className="text-2xl text-amber-600" />
            </div>
          </div>
          
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Complete Your Pending Reviews
            </h3>
            <p className="text-gray-700 mb-4">
              You have <span className="font-bold text-amber-600">{pendingReviews.length}</span> booking{pendingReviews.length > 1 ? 's' : ''} waiting for your review.
              Please submit your review{pendingReviews.length > 1 ? 's' : ''} to continue making bookings.
            </p>

            {/* Pending Reviews List */}
            <div className="space-y-3">
              {pendingReviews.slice(0, 3).map((review) => (
                <div
                  key={review.id}
                  className="bg-white rounded-lg p-4 border border-amber-200 hover:border-amber-400 transition-all duration-200 cursor-pointer"
                  onClick={() => handleReviewClick(review)}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                      {review.otherPartyPhoto ? (
                        <img
                          src={review.otherPartyPhoto}
                          alt={review.otherPartyName}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#312E81] to-[#4A47A3] flex items-center justify-center">
                          <FaUser className="text-white text-lg" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {review.otherPartyName}
                      </p>
                      <p className="text-xs text-gray-600">
                        {formatDate(review.bookingDate)} • {formatTimeRange(review.startTime, review.endTime, review.bookingDate, userTimezone)}
                      </p>
                      {review.serviceCategoryName && (
                        <p className="text-xs text-gray-500 mt-1">
                          {review.serviceCategoryName}
                        </p>
                      )}
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReviewClick(review);
                      }}
                      className="flex-shrink-0 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg transition-colors duration-200"
                    >
                      Review Now
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {pendingReviews.length > 3 && (
              <p className="text-sm text-gray-600 mt-3">
                + {pendingReviews.length - 3} more booking{pendingReviews.length - 3 > 1 ? 's' : ''} to review
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Review Modal */}
      {showModal && selectedReview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/30 backdrop-blur-md">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col overscroll-contain">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0 z-10 rounded-t-xl">
              <h2 className="text-2xl font-bold text-gray-900">Leave a Review</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                disabled={submitting}
              >
                <FaTimes className="text-xl" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1 overscroll-contain">
              {/* Booking Details */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center gap-4">
                  {selectedReview.otherPartyPhoto ? (
                    <img
                      src={selectedReview.otherPartyPhoto}
                      alt={selectedReview.otherPartyName}
                      className="w-16 h-16 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#312E81] to-[#4A47A3] flex items-center justify-center">
                      <FaUser className="text-white text-2xl" />
                    </div>
                  )}
                  
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900">
                      {selectedReview.otherPartyName}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {formatDate(selectedReview.bookingDate)} • {formatTimeRange(selectedReview.startTime, selectedReview.endTime, selectedReview.bookingDate, userTimezone)}
                    </p>
                    {selectedReview.serviceCategoryName && (
                      <p className="text-sm text-gray-500 mt-1">
                        {selectedReview.serviceCategoryName}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Star Rating */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">
                  Rating <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoveredRating(star)}
                      onMouseLeave={() => setHoveredRating(0)}
                      className="transition-transform hover:scale-110 focus:outline-none"
                      disabled={submitting}
                    >
                      <FaStar
                        className={`text-4xl ${
                          star <= (hoveredRating || rating)
                            ? 'text-amber-400'
                            : 'text-gray-300'
                        }`}
                      />
                    </button>
                  ))}
                  {rating > 0 && (
                    <span className="ml-3 text-lg font-semibold text-gray-700">
                      {rating} / 5
                    </span>
                  )}
                </div>
              </div>

              {/* Review Comment */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Your Review <span className="text-gray-500 font-normal">(Optional)</span>
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Share your experience... (optional, 10-500 characters)"
                  rows={5}
                  maxLength={500}
                  disabled={submitting}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#312E81] focus:border-transparent resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-gray-500">
                    {comment.trim().length > 0 && comment.trim().length < 10 ? 'Minimum 10 characters if provided' : 'Optional'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {comment.length} / 500
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3 flex-shrink-0 rounded-b-xl">
              <button
                onClick={() => setShowModal(false)}
                disabled={submitting}
                className="px-6 py-2 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitReview}
                disabled={submitting || rating === 0}
                className="px-6 py-2 bg-[#312E81] text-white font-semibold rounded-lg hover:bg-[#1E1B4B] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Submitting...
                  </>
                ) : (
                  'Submit Review'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PendingReviewBanner;

