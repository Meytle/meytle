/**
 * Detailed Booking Modal Component
 * Multi-step booking wizard in a modal popup with Google Places integration
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaTimes,
  FaCalendarAlt,
  FaClock,
  FaServicestack,
  FaMapMarkerAlt,
  FaDollarSign,
  FaArrowRight,
  FaArrowLeft,
  FaCheckCircle,
  FaSpinner,
  FaExclamationCircle
} from 'react-icons/fa';
import { toast } from 'react-hot-toast';
import { bookingApi } from '../../api/booking';
import { serviceCategoryApi } from '../../api/serviceCategory';
import AddressSearch from '../common/AddressSearch';
import AutoResizeTextarea from '../common/AutoResizeTextarea';
import PaymentConfirmationModal from '../payment/PaymentConfirmationModal';
import { useModalRegistration } from '../../context/ModalContext';
import { getTimezoneDisplayName } from '../../utils/timezoneHelpers';
import type { ServiceCategory, AvailabilitySlot } from '../../types';
import type { ValidatedAddress } from '../../services/addressValidation';
import logger from '../../utils/logger';

interface DetailedBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  companionId: number;
  companionName: string;
  selectedDate: Date;
  selectedTimeSlot: {
    start: string;
    end: string;
    services?: string[];
  };
  companionServices?: string[];
  hourlyRate?: number;
  onBookingCreated?: (bookingId: number) => void;
}

interface TimeSlot {
  start: string;
  end: string;
  services?: string[] | string;
}

interface BookingData {
  selectedTime: TimeSlot | null;
  selectedService: string;
  meetingLocation: string;
  placeDetails?: any; // Using any to avoid Google Maps type dependency
  validatedAddress?: ValidatedAddress;
  specialRequests: string;
}

const DetailedBookingModal: React.FC<DetailedBookingModalProps> = ({
  isOpen,
  onClose,
  companionId,
  companionName,
  selectedDate,
  selectedTimeSlot,
  companionServices = [],
  hourlyRate = 75,
  onBookingCreated
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ⭐ Payment state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentData, setPaymentData] = useState<{
    bookingId: number;
    clientSecret: string;
    totalAmount: number;
    bookingDate: string;
    bookingTime: string;
    paymentIntentId?: string;
    bookingPayload?: any;
  } | null>(null);

  // Ref to prevent duplicate submissions
  const submissionInProgress = useRef(false);

  // Register modal with global modal context (handles scroll prevention automatically)
  useModalRegistration('detailed-booking-modal', isOpen);

  const [bookingData, setBookingData] = useState<BookingData>({
    selectedTime: selectedTimeSlot,
    selectedService: '',
    meetingLocation: '',
    placeDetails: undefined,
    specialRequests: ''
  });

  // Get available services based on selected time slot
  const getAvailableServices = () => {
    if (bookingData.selectedTime?.services) {
      // Parse services if they're a string
      const services = typeof bookingData.selectedTime.services === 'string'
        ? JSON.parse(bookingData.selectedTime.services)
        : bookingData.selectedTime.services;

      // Filter out empty strings and return unique services
      return Array.from(new Set(services.filter((s: string) => s && s.trim() !== '')));
    }

    // Fallback to companion's general services if no slot-specific services
    return companionServices;
  };

  const totalSteps = 3;

  // Fetch service categories when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchServiceCategories();
    }
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(1);
      setBookingData({
        selectedTime: selectedTimeSlot,
        selectedService: '',
        meetingLocation: '',
        placeDetails: undefined,
        specialRequests: ''
      });
    }
  }, [isOpen, selectedTimeSlot]);


  const fetchServiceCategories = async () => {
    setIsLoadingServices(true);
    try {
      const categories = await serviceCategoryApi.getAllCategories(true);
      setServiceCategories(categories);
    } catch (error) {
      console.error('Error fetching service categories:', error);
    } finally {
      setIsLoadingServices(false);
    }
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const calculateDuration = (start: string, end: string) => {
    const startTime = new Date(`2000-01-01 ${start}`);
    const endTime = new Date(`2000-01-01 ${end}`);
    return (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
  };

  const calculateTotal = () => {
    if (!bookingData.selectedTime) return { subtotal: 0, serviceFee: 0, total: 0 };

    const duration = calculateDuration(bookingData.selectedTime.start, bookingData.selectedTime.end);
    const subtotal = duration * hourlyRate;
    const serviceFee = subtotal * 0.10; // 10% platform fee
    const total = subtotal + serviceFee;

    return { subtotal, serviceFee, total, duration };
  };

  const handleNext = () => {
    // Validate current step before proceeding
    if (currentStep === 1) {
      if (!bookingData.selectedService) {
        toast.error('Please select a service');
        return;
      }
    }
    if (currentStep === 2) {
      if (!bookingData.meetingLocation) {
        toast.error('Please provide a meeting location');
        return;
      }
      // Check if address is validated
      if (!bookingData.validatedAddress) {
        toast.error('Please select a verified address from the suggestions for safety');
        return;
      }
      // Check if validated address has required fields
      if (!bookingData.validatedAddress.lat || !bookingData.validatedAddress.lon) {
        toast.error('Selected address is missing location coordinates. Please select another address.');
        return;
      }
    }

    setCurrentStep(prev => Math.min(prev + 1, totalSteps));
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    // Prevent duplicate submissions with multiple checks
    if (submissionInProgress.current || isSubmitting) {
      logger.info('Submission already in progress, skipping duplicate call');
      return;
    }

    // Validate required data before submission
    if (!bookingData.selectedTime) {
      toast.error('Please select a time slot');
      return;
    }

    if (!bookingData.meetingLocation) {
      toast.error('Please enter a meeting location');
      return;
    }

    // REMOVED: Check for unreviewed bookings before allowing new booking
    // This check has been disabled to allow clients to make bookings without completing reviews
    /*
    try {
      const unreviewedData = await bookingApi.getPendingReviews();
      const count = unreviewedData.pendingReviews.length;
      if (count > 0) {
        toast.error(`You have ${count} unreviewed completed booking${count === 1 ? '' : 's'}. Please submit your review${count === 1 ? '' : 's'} before creating a new booking.`, {
          duration: 5000
        });
        return;
      }
    } catch (error: any) {
      console.error('Error checking unreviewed bookings:', error);
      // Don't block booking if check fails - let backend handle it
    }
    */

    // Set submission flag immediately
    submissionInProgress.current = true;
    setIsSubmitting(true);

    try {
      // Format date in local timezone to avoid timezone shift
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      // Calculate duration in hours
      const [startHour, startMin] = bookingData.selectedTime.start.split(':').map(Number);
      const [endHour, endMin] = bookingData.selectedTime.end.split(':').map(Number);
      const durationHours = (endHour * 60 + endMin - (startHour * 60 + startMin)) / 60;
      
      // Calculate total amount (companion hourly rate * duration)
      const totalAmount = Math.round(durationHours * hourlyRate * 100) / 100;

      // Get user's timezone (from localStorage or browser)
      const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      // Build location object for payment intent
      const location = {
        address: bookingData.meetingLocation,
        lat: bookingData.validatedAddress?.lat,
        lng: bookingData.validatedAddress?.lon,
        placeId: bookingData.validatedAddress?.placeId,
        type: 'in_person' as const
      };

      // Payload for Step 1 - createPaymentIntent (uses location object)
      const paymentIntentPayload = {
        companionId: companionId,
        bookingDate: dateStr,
        startTime: bookingData.selectedTime.start,
        endTime: bookingData.selectedTime.end,
        location, // Object with address, lat, lng, placeId
        durationHours,
        totalAmount,
        clientTimezone,
        serviceType: bookingData.selectedService || 'Companionship',
        specialRequests: bookingData.specialRequests || undefined
      };

      // Payload for Step 2 - createBookingWithPayment (uses flat fields)
      const bookingWithPaymentPayload = {
        companionId: companionId,
        bookingDate: dateStr,
        startTime: bookingData.selectedTime.start,
        endTime: bookingData.selectedTime.end,
        durationHours,
        totalAmount,
        bookingTimezone: clientTimezone,
        meetingLocation: bookingData.meetingLocation,
        meetingLocationLat: bookingData.validatedAddress?.lat,
        meetingLocationLon: bookingData.validatedAddress?.lon,
        meetingLocationPlaceId: bookingData.validatedAddress?.placeId,
        meetingType: 'in_person' as const,
        serviceCategoryId: bookingData.selectedService ? undefined : 1,
        specialRequests: bookingData.specialRequests || undefined
      };

      // ⭐ NEW TWO-STEP FLOW: Step 1 - Create Payment Intent (NO booking yet)
      const paymentIntentResult = await bookingApi.createPaymentIntent(paymentIntentPayload);

      if (paymentIntentResult && paymentIntentResult.clientSecret) {
        // Store payment data including paymentIntentId for Step 2
        setPaymentData({
          bookingId: 0, // No booking yet - will be created after payment
          clientSecret: paymentIntentResult.clientSecret,
          totalAmount: paymentIntentResult.totalAmount,
          bookingDate: dateStr,
          bookingTime: `${bookingData.selectedTime.start} - ${bookingData.selectedTime.end}`,
          paymentIntentId: paymentIntentResult.paymentIntentId,
          bookingPayload: bookingWithPaymentPayload // Step 2 payload with flat fields
        });
        setShowPaymentModal(true);
        // Don't close the booking modal yet - payment modal will handle navigation
      } else {
        throw new Error('Failed to create payment intent');
      }
    } catch (error: any) {
      console.error('Error creating booking:', error);

      // Extract error details
      const errorMessage = error.response?.data?.errors?.join(', ') ||
                          error.response?.data?.message ||
                          error.message ||
                          'Failed to create booking';

      // Use a unique toast ID to prevent duplicate error toasts
      toast.error(errorMessage, {
        id: `booking-error-${Date.now()}`
      });

      // Don't close modal on error - let user fix issues
    } finally {
      // Always reset submission state
      setIsSubmitting(false);
      submissionInProgress.current = false;
    }
  };

  const renderStepIndicator = () => {
    const steps = [
      { number: 1, title: 'Service' },
      { number: 2, title: 'Location' },
      { number: 3, title: 'Review' }
    ];

    return (
      <div className="flex items-center justify-center gap-8 mb-8">
        {steps.map((step, index) => (
          <div key={step.number} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${
                  currentStep >= step.number
                    ? 'bg-[#312E81] text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {currentStep > step.number ? (
                  <FaCheckCircle className="w-5 h-5" />
                ) : (
                  step.number
                )}
              </div>
              <span className={`text-xs mt-1 ${
                currentStep >= step.number ? 'text-[#312E81]' : 'text-gray-500'
              }`}>
                {step.title}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`w-24 h-0.5 mx-2 transition-colors ${
                  currentStep > step.number ? 'bg-[#312E81]' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  if (!isOpen) return null;

  const { subtotal, serviceFee, total, duration } = calculateTotal();

  return (
    <AnimatePresence>
      {isOpen && !showPaymentModal && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-md z-[60]"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[95vh] overflow-y-auto">
              {/* Header */}
              <div className="bg-gradient-to-r from-[#312E81] to-[#FFCCCB] px-6 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-white">
                    Book {companionName}
                  </h2>
                  <button
                    onClick={onClose}
                    className="text-white hover:text-gray-200 transition-colors"
                  >
                    <FaTimes className="w-6 h-6" />
                  </button>
                </div>
                <p className="text-white/80 mt-1">
                  {selectedDate.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })} at {selectedTimeSlot.start}
                </p>
              </div>

              {/* Content */}
              <div className="p-6">
                {renderStepIndicator()}

                <div>
                  <AnimatePresence mode="wait">
                  {/* Step 1: Service Selection */}
                  {currentStep === 1 && (
                    <motion.div
                      key="step1"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-4"
                    >
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <FaServicestack className="text-[#312E81]" />
                        Select Service
                      </h3>

                      {isLoadingServices ? (
                        <div className="flex items-center justify-center py-8">
                          <FaSpinner className="w-6 h-6 text-[#312E81] animate-spin" />
                        </div>
                      ) : (
                        <>
                          {(() => {
                            const availableServices = getAvailableServices();

                            return (
                              <>
                                {availableServices.length > 0 ? (
                                  <div className="space-y-3">
                                    {availableServices.map((service, index) => (
                                      <label
                                        key={index}
                                        className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all hover:bg-gray-50 ${
                                          bookingData.selectedService === String(service)
                                            ? 'border-[#312E81] bg-purple-50'
                                            : 'border-gray-200'
                                        }`}
                                      >
                                        <input
                                          type="radio"
                                          name="service"
                                          value={String(service)}
                                          checked={bookingData.selectedService === String(service)}
                                          onChange={(e) => {
                                            setBookingData(prev => ({
                                              ...prev,
                                              selectedService: e.target.value
                                            }));
                                          }}
                                          className="sr-only"
                                        />
                                        <div className={`w-5 h-5 rounded-full border-2 mr-3 flex items-center justify-center ${
                                          bookingData.selectedService === String(service)
                                            ? 'border-[#312E81]'
                                            : 'border-gray-300'
                                        }`}>
                                          {bookingData.selectedService === String(service) && (
                                            <div className="w-3 h-3 rounded-full bg-[#312E81]" />
                                          )}
                                        </div>
                                        <span className="flex-1 text-gray-700 font-medium">
                                          {String(service)}
                                        </span>
                                        {bookingData.selectedService === String(service) && (
                                          <FaCheckCircle className="text-[#312E81] ml-2" />
                                        )}
                                      </label>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-center py-8 text-gray-500">
                                    No services available for this time slot
                                  </div>
                                )}

                                {availableServices.length === 0 && (
                                  <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                                    <p className="text-sm text-amber-800">
                                      No specific services are configured for this time slot.
                                      Please use the "Request Custom Booking" option to specify your needs.
                                    </p>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </>
                      )}
                    </motion.div>
                  )}

                  {/* Step 2: Location */}
                  {currentStep === 2 && (
                    <motion.div
                      key="step2"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-4"
                    >
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <FaMapMarkerAlt className="text-[#312E81]" />
                        Meeting Location
                      </h3>

                      <AddressSearch
                        value={bookingData.meetingLocation}
                        onChange={(address, placeDetails, validatedAddress) => {
                          setBookingData(prev => ({
                            ...prev,
                            meetingLocation: address,
                            placeDetails: placeDetails,
                            validatedAddress: validatedAddress
                          }));
                        }}
                        label="Where would you like to meet?"
                        placeholder="Search for a location..."
                        required
                        showMap={true}
                        className="mb-4"
                      />
                    </motion.div>
                  )}

                  {/* Step 3: Review */}
                  {currentStep === 3 && (
                    <motion.div
                      key="step3"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <FaCheckCircle className="text-[#312E81]" />
                        Review & Confirm
                      </h3>

                      <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                        {/* Date & Time */}
                        <div className="flex justify-between items-start">
                          <div className="flex items-start gap-3">
                            <FaCalendarAlt className="text-gray-500 mt-1" />
                            <div>
                              <p className="font-semibold text-gray-900">Date & Time</p>
                              <p className="text-sm text-gray-600">
                                {selectedDate.toLocaleDateString('en-US', {
                                  weekday: 'long',
                                  month: 'long',
                                  day: 'numeric'
                                })}
                              </p>
                              <p className="text-sm text-gray-600">
                                {bookingData.selectedTime && `${formatTime(bookingData.selectedTime.start)} - ${formatTime(bookingData.selectedTime.end)}`}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                Duration: {duration} hours • {getTimezoneDisplayName()}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Service */}
                        <div className="flex justify-between items-start border-t pt-4">
                          <div className="flex items-start gap-3">
                            <FaServicestack className="text-gray-500 mt-1" />
                            <div>
                              <p className="font-semibold text-gray-900">Service</p>
                              <p className="text-sm text-gray-600">
                                {bookingData.selectedService || 'Not selected'}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Location */}
                        <div className="flex justify-between items-start border-t pt-4">
                          <div className="flex items-start gap-3">
                            <FaMapMarkerAlt className="text-gray-500 mt-1" />
                            <div>
                              <p className="font-semibold text-gray-900">Location</p>
                              <p className="text-sm text-gray-600">
                                {bookingData.meetingLocation}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Pricing */}
                        <div className="border-t pt-4">
                          <div className="flex items-start gap-3">
                            <FaDollarSign className="text-gray-500 mt-1" />
                            <div className="flex-1">
                              <p className="font-semibold text-gray-900 mb-2">Price Breakdown</p>
                              <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Service ({duration} hours × ${hourlyRate})</span>
                                  <span className="font-medium">${subtotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Platform Fee (10%)</span>
                                  <span className="font-medium">${serviceFee.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between pt-2 border-t text-base font-bold">
                                  <span>Total</span>
                                  <span className="text-[#312E81]">${total.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-gray-50 border-t flex justify-between flex-shrink-0">
                <button
                  onClick={currentStep === 1 ? onClose : handleBack}
                  className="px-6 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                  disabled={isSubmitting}
                >
                  <FaArrowLeft />
                  {currentStep === 1 ? 'Cancel' : 'Back'}
                </button>

                {currentStep < totalSteps ? (
                  <button
                    onClick={handleNext}
                    className="px-6 py-2 bg-[#312E81] text-white rounded-lg hover:bg-[#1E1B4B] hover:shadow-[0_0_15px_rgba(255,204,203,0.3)] transition-all flex items-center gap-2"
                  >
                    Next
                    <FaArrowRight />
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="px-6 py-2 bg-gradient-to-r from-[#312E81] to-[#FFCCCB] text-white rounded-lg hover:shadow-[0_0_15px_rgba(255,204,203,0.3)] flex items-center gap-2 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <FaSpinner className="animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <FaCheckCircle />
                        Confirm Booking
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
      
      {/* ⭐ Payment Confirmation Modal */}
      {paymentData && (
        <PaymentConfirmationModal
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false);
            setPaymentData(null); // Clear payment data
            // Don't close booking modal - let user go back to edit form
          }}
          bookingId={paymentData.bookingId}
          clientSecret={paymentData.clientSecret}
          amount={paymentData.totalAmount}
          companionName={companionName}
          bookingDate={paymentData.bookingDate}
          bookingTime={paymentData.bookingTime}
          onPaymentSuccess={async () => {
            // ⭐ NEW TWO-STEP FLOW: Step 2 - Create booking after payment authorization
            try {
              if (!paymentData.paymentIntentId || !paymentData.bookingPayload) {
                throw new Error('Missing payment data');
              }

              const result = await bookingApi.createBookingWithPayment({
                ...paymentData.bookingPayload,
                paymentIntentId: paymentData.paymentIntentId
              });

              toast.success('Payment authorized successfully! Your booking is now pending companion approval.');
              if (onBookingCreated && result.bookingId) {
                onBookingCreated(result.bookingId);
              }
              setShowPaymentModal(false); // Close payment modal first
              onClose(); // Then close booking modal
            } catch (error: any) {
              const errorMsg = error.response?.data?.message || error.message || 'Failed to create booking';
              toast.error(errorMsg);
              throw error; // Re-throw so PaymentConfirmationModal can handle it
            }
          }}
        />
      )}
    </AnimatePresence>
  );
};

export default DetailedBookingModal;