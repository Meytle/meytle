/**
 * Client Bookings List Component
 * Displays a list of bookings for the client with actions
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  FaClock,
  FaCheckCircle,
  FaTimesCircle,
  FaExclamationCircle,
  FaMoneyBillWave,
  FaMapMarkerAlt,
  FaStar,
  FaCommentAlt,
  FaEye,
  FaBan,
  FaUserCircle
} from 'react-icons/fa';
import type { Booking } from '../../types';
import { bookingApi } from '../../api/booking';
import ReviewModal from './ReviewModal';

interface ClientBookingsListProps {
  bookings: Booking[];
  onBookingUpdate?: () => void;
  isLoading?: boolean;
}

const ClientBookingsList: React.FC<ClientBookingsListProps> = ({
  bookings,
  onBookingUpdate,
  isLoading = false
}) => {
  const navigate = useNavigate();
  const [cancellingBookingId, setCancellingBookingId] = useState<number | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewBooking, setReviewBooking] = useState<Booking | null>(null);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <FaClock className="text-yellow-500" />;
      case 'confirmed':
        return <FaCheckCircle className="text-green-500" />;
      case 'completed':
        return <FaCheckCircle className="text-[#312E81]" />;
      case 'cancelled':
        return <FaTimesCircle className="text-red-500" />;
      case 'no_show':
        return <FaExclamationCircle className="text-orange-500" />;
      default:
        return <FaExclamationCircle className="text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'confirmed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'completed':
        return 'bg-blue-100 text-blue-800 border-[#d5d3f7]';
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'no_show':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatDate = (date: string) => {
    const bookingDate = new Date(date);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Check if it's today
    if (bookingDate.toDateString() === today.toDateString()) {
      return 'Today';
    }
    // Check if it's tomorrow
    if (bookingDate.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    }

    return bookingDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (time: string) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const calculateDuration = (startTime: string, endTime: string) => {
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);

    const startTotalMinutes = startHours * 60 + startMinutes;
    const endTotalMinutes = endHours * 60 + endMinutes;
    const durationMinutes = endTotalMinutes - startTotalMinutes;

    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;

    if (hours > 0 && minutes > 0) {
      return `${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''}`;
    } else {
      return `${minutes} minutes`;
    }
  };

  const handleCancelBooking = async () => {
    if (!selectedBooking) return;

    try {
      setCancellingBookingId(selectedBooking.id);
      await bookingApi.updateBookingStatus(selectedBooking.id, 'cancelled');
      toast.success('Booking cancelled successfully');
      setShowCancelModal(false);
      setSelectedBooking(null);
      setCancellationReason('');
      if (onBookingUpdate) {
        onBookingUpdate();
      }
    } catch (error) {
      console.error('Error cancelling booking:', error);
      toast.error('Failed to cancel booking');
    } finally {
      setCancellingBookingId(null);
    }
  };

  const openCancelModal = (booking: Booking) => {
    setSelectedBooking(booking);
    setShowCancelModal(true);
  };

  const handleViewProfile = (companionId: number) => {
    // Navigate to companion profile page
    navigate(`/companion/${companionId}`);
  };

  const handleLeaveReview = (booking: Booking) => {
    setReviewBooking(booking);
    setShowReviewModal(true);
  };

  const handleSubmitReview = async (review: { rating: number; comment: string }) => {
    if (!reviewBooking) return;

    try {
      await bookingApi.createReview(reviewBooking.id, review);
      toast.success('Review submitted successfully!');
      setShowReviewModal(false);
      setReviewBooking(null);

      // Refresh bookings to update review status
      if (onBookingUpdate) {
        onBookingUpdate();
      }
    } catch (error) {
      console.error('Error submitting review:', error);
      toast.error('Failed to submit review. Please try again.');
      throw error; // Re-throw for ReviewModal to handle
    }
  };

  const isUpcoming = (booking: Booking) => {
    const bookingDate = new Date(booking.bookingDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return bookingDate >= today && ['pending', 'confirmed'].includes(booking.status);
  };

  const isPast = (booking: Booking) => {
    const bookingDate = new Date(booking.bookingDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return bookingDate < today || ['completed', 'cancelled', 'no_show'].includes(booking.status);
  };

  // Separate bookings into upcoming and past
  const upcomingBookings = bookings.filter(isUpcoming);
  const pastBookings = bookings.filter(isPast);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="bg-gray-200 rounded-lg h-40"></div>
          </div>
        ))}
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="text-center py-16 bg-gray-50 rounded-lg">
        <FaClock className="mx-auto text-6xl text-gray-300 mb-4" />
        <h3 className="text-xl font-semibold text-gray-700 mb-2">No bookings yet</h3>
        <p className="text-gray-500 mb-6">
          Start browsing companions to make your first booking
        </p>
        <button
          onClick={() => navigate('/browse-companions')}
          className="px-6 py-3 bg-gradient-to-r from-[#312E81] to-[#FFCCCB] text-white font-medium rounded-lg hover:from-[#1E1B4B] hover:to-[#FFCCCB] hover:shadow-[0_0_25px_rgba(255,204,203,0.5)] transition-all duration-200 shadow-md"
        >
          Browse Companions
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Upcoming Bookings */}
        {upcomingBookings.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FaClock className="text-[#312E81]" />
              Upcoming Bookings ({upcomingBookings.length})
            </h3>
            <div className="space-y-4">
              {upcomingBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="bg-white border-2 border-gray-200 rounded-xl p-6 hover:shadow-lg transition-all duration-200 hover:border-[#312E81] hover:shadow-[0_0_15px_rgba(255,204,203,0.3)]"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                    {/* Companion Info */}
                    <div className="flex items-start gap-4 flex-1">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#4A47A3] to-[#FFCCCB] flex items-center justify-center text-white text-xl font-bold shadow-md">
                        {booking.companionName?.charAt(0) || 'C'}
                      </div>
                      <div className="flex-1">
                        <h4 className="text-lg font-semibold text-gray-900">
                          {booking.companionName || 'Companion'}
                        </h4>
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <FaClock className="text-gray-400" />
                            <span className="font-medium text-gray-900">
                              {formatDate(booking.bookingDate)}
                            </span>
                            <span className="text-gray-500">•</span>
                            <span>
                              {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
                            </span>
                            <span className="text-xs text-gray-500">
                              ({calculateDuration(booking.startTime, booking.endTime)})
                            </span>
                          </div>
                          {booking.meetingLocation && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <FaMapMarkerAlt className="text-gray-400" />
                              <span>{booking.meetingLocation}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-sm">
                            <FaMoneyBillWave className="text-green-500" />
                            <span className="font-semibold text-gray-900">
                              ${booking.totalAmount}
                            </span>
                            {booking.paymentStatus === 'paid' && (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                Paid
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Status and Actions */}
                    <div className="flex flex-col items-end gap-3">
                      <span className={`px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 border ${getStatusColor(booking.status)}`}>
                        {getStatusIcon(booking.status)}
                        {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                      </span>

                      <div className="flex gap-2">
                        {['pending', 'confirmed'].includes(booking.status) && (
                          <button
                            onClick={() => openCancelModal(booking)}
                            disabled={cancellingBookingId === booking.id}
                            className="px-4 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-2"
                          >
                            <FaBan className="text-xs" />
                            Cancel
                          </button>
                        )}
                        {booking.companionId && (
                          <button
                            onClick={() => handleViewProfile(booking.companionId!)}
                            className="px-4 py-2 text-sm bg-[#312E81] text-white rounded-lg hover:bg-[#312E81]/90 transition-colors flex items-center gap-2"
                          >
                            <FaUserCircle className="text-xs" />
                            View Profile
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Past Bookings */}
        {pastBookings.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FaCheckCircle className="text-gray-600" />
              Past Bookings ({pastBookings.length})
            </h3>
            <div className="space-y-4">
              {pastBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="bg-gray-50 border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                    {/* Companion Info */}
                    <div className="flex items-start gap-4 flex-1">
                      <div className="w-14 h-14 rounded-full bg-gray-300 flex items-center justify-center text-white text-lg font-bold">
                        {booking.companionName?.charAt(0) || 'C'}
                      </div>
                      <div className="flex-1">
                        <h4 className="text-lg font-semibold text-gray-900">
                          {booking.companionName || 'Companion'}
                        </h4>
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <span>{formatDate(booking.bookingDate)}</span>
                            <span className="text-gray-400">•</span>
                            <span>
                              {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <FaMoneyBillWave className="text-gray-400" />
                            <span>${booking.totalAmount}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Status and Actions */}
                    <div className="flex flex-col items-end gap-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${getStatusColor(booking.status)}`}>
                        {getStatusIcon(booking.status)}
                        {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                      </span>

                      <div className="flex gap-2">
                        {booking.status === 'completed' && !booking.hasReview && (
                          <button
                            onClick={() => handleLeaveReview(booking)}
                            className="px-3 py-1.5 text-sm bg-[#312E81] text-white rounded-lg hover:bg-[#1E1B4B] hover:shadow-[0_0_15px_rgba(255,204,203,0.3)] transition-colors flex items-center gap-2"
                          >
                            <FaStar className="text-xs" />
                            Review
                          </button>
                        )}
                        {booking.companionId && (
                          <button
                            onClick={() => handleViewProfile(booking.companionId!)}
                            className="px-3 py-1.5 text-sm bg-[#312E81] text-white rounded-lg hover:bg-[#312E81]/90 transition-colors flex items-center gap-2"
                          >
                            <FaUserCircle className="text-xs" />
                            View Profile
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Cancel Booking Modal */}
      {showCancelModal && selectedBooking && (() => {
        // Prevent background scroll
        React.useEffect(() => {
          document.body.style.overflow = 'hidden';
          return () => {
            document.body.style.overflow = 'unset';
          };
        }, []);

        return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Cancel Booking</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to cancel your booking with {selectedBooking.companionName} on {formatDate(selectedBooking.bookingDate)}?
            </p>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for cancellation (optional)
              </label>
              <textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#312E81] focus:border-transparent"
                rows={3}
                placeholder="Let us know why you're cancelling..."
              />
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-yellow-800">
                <strong>Cancellation Policy:</strong> Cancellations made less than 24 hours before the booking may incur a fee.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCancelModal(false);
                  setSelectedBooking(null);
                  setCancellationReason('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Keep Booking
              </button>
              <button
                onClick={handleCancelBooking}
                disabled={cancellingBookingId === selectedBooking.id}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancellingBookingId === selectedBooking.id ? 'Cancelling...' : 'Cancel Booking'}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Review Modal */}
      {reviewBooking && (
        <ReviewModal
          isOpen={showReviewModal}
          onClose={() => {
            setShowReviewModal(false);
            setReviewBooking(null);
          }}
          bookingId={reviewBooking.id}
          companionName={reviewBooking.companionName || 'Companion'}
          companionPhoto={reviewBooking.companionPhoto}
          onSubmit={handleSubmitReview}
        />
      )}
    </>
  );
};

export default ClientBookingsList;