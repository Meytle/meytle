/**
 * Booking Creation Page
 * Wrapper page for the BookingForm component with proper state management
 */

import { useLocation, useNavigate } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';
import BookingForm from '../../components/booking/BookingForm';
import { useAuth } from '../../hooks/useAuth';
import { toast } from 'react-hot-toast';
import { useEffect, useState } from 'react';

const BookingCreate = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [companionData, setCompanionData] = useState<{
    companionId: number;
    companionName: string;
    selectedDate?: string;
    selectedTimeSlot?: { startTime: string; endTime: string };
    hourlyRate?: number;
  } | null>(null);

  useEffect(() => {
    // Check if user is authenticated
    if (!isAuthenticated) {
      toast.error('Please login to create a booking');
      navigate('/signin');
      return;
    }

    // Extract companion data from navigation state
    if (location.state) {
      setCompanionData({
        companionId: location.state.companionId,
        companionName: location.state.companionName,
        selectedDate: location.state.selectedDate,
        selectedTimeSlot: location.state.selectedTimeSlot,
        hourlyRate: location.state.hourlyRate
      });
    } else {
      // No companion data provided, redirect back
      toast.error('No companion selected');
      navigate('/browse-companions');
    }
  }, [location.state, isAuthenticated, navigate]);

  const handleBookingCreated = (bookingId: number) => {
    // Success toast is handled by BookingForm component
    navigate('/client-dashboard');
  };

  const handleCancel = () => {
    navigate(-1); // Go back to previous page
  };

  if (!companionData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#312E81]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <FaArrowLeft />
            <span>Back to Companion Profile</span>
          </button>
        </div>

        {/* Page Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Create Your Booking</h1>
          <p className="text-gray-600 mt-2">
            Follow the steps below to book with {companionData.companionName}
          </p>
        </div>

        {/* Booking Form Component */}
        <BookingForm
          companionId={companionData.companionId}
          companionName={companionData.companionName}
          onBookingCreated={handleBookingCreated}
          onCancel={handleCancel}
        />

        {/* Pre-fill data if available */}
        {companionData.selectedDate && companionData.selectedTimeSlot && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                // This data will be used by BookingForm to pre-select date and time
                window.bookingPreFillData = ${JSON.stringify({
                  date: companionData.selectedDate,
                  timeSlot: companionData.selectedTimeSlot
                })};
              `
            }}
          />
        )}
      </div>
    </div>
  );
};

export default BookingCreate;