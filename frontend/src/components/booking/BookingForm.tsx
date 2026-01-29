/**
 * Booking Form Component
 * Form for creating new bookings
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCalendar, FaClock, FaMapMarkerAlt, FaComments, FaDollarSign, FaCheck, FaArrowRight, FaArrowLeft, FaClipboardList, FaGlobe } from 'react-icons/fa';
import { toast } from 'react-hot-toast';
import Calendar from '../calendar/Calendar';
import TimeSlotPicker from '../calendar/TimeSlotPicker';
import StepIndicator from './StepIndicator';
import MonthlyAvailabilityWidget from './MonthlyAvailabilityWidget';
import { bookingApi } from '../../api/booking';
import { serviceCategoryApi } from '../../api/serviceCategory';
import { BOOKING_CONSTANTS, BOOKING_STEPS, ROUTES, MEETING_TYPES } from '../../constants';
import Badge from '../common/Badge';
import Button from '../common/Button';
import AutoResizeTextarea from '../common/AutoResizeTextarea';
import AddressSearch from '../common/AddressSearch';
import PaymentConfirmationModal from '../payment/PaymentConfirmationModal';
import { getTimezoneDisplayName } from '../../utils/timezoneHelpers';
import type { BookingFormData, TimeSlot, BookingDateInfo, ServiceCategory, MeetingType } from '../../types';
import type { ValidatedAddress} from '../../services/addressValidation';

interface BookingFormProps {
  companionId: number;
  companionName: string;
  onBookingCreated: (bookingId: number) => void;
  onCancel: () => void;
  className?: string;
}

const BookingForm = ({ 
  companionId, 
  companionName, 
  onBookingCreated, 
  onCancel,
  className = ''
}: BookingFormProps) => {
  const navigate = useNavigate();
  const isMounted = useRef(true);
  const timeSlotSectionRef = useRef<HTMLDivElement>(null);

  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<ServiceCategory | null>(null);
  const [meetingType] = useState<MeetingType>(MEETING_TYPES.IN_PERSON);
  const [stepValidation, setStepValidation] = useState({ step1: false, step2: false, step3: false, step4: false });

  // Existing booking state
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<TimeSlot | null>(null);
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // New state for booking data
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [monthBookings, setMonthBookings] = useState<Array<{ id: number; bookingDate: string; startTime: string; endTime: string; status: string }>>([]);
  const [bookingsByDate, setBookingsByDate] = useState<Record<string, BookingDateInfo>>({});
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);
  
  // ⭐ Payment state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentData, setPaymentData] = useState<{
    paymentIntentId: string;
    bookingData: BookingFormData;
    clientSecret: string;
    totalAmount: number;
    bookingDate: string;
    bookingTime: string;
  } | null>(null);
  
  const [formData, setFormData] = useState<{
    specialRequests: string;
    meetingLocation: string;
    validatedAddress?: ValidatedAddress;
  }>({
    specialRequests: '',
    meetingLocation: '',
    validatedAddress: undefined
  });

  // Helper function to create local date keys (YYYY-MM-DD) without timezone issues
  const localDateKey = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper function to calculate date range for a month
  const getMonthDateRange = (date: Date): { startDate: string; endDate: string } => {
    const year = date.getFullYear();
    const month = date.getMonth();
    
    // First day of month
    const firstDay = new Date(year, month, 1);
    // Last day of month
    const lastDay = new Date(year, month + 1, 0);
    
    // Extend range to include overflow days from previous/next months
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    const endDate = new Date(lastDay);
    endDate.setDate(endDate.getDate() + (6 - lastDay.getDay()));
    
    return {
      startDate: localDateKey(startDate),
      endDate: localDateKey(endDate)
    };
  };

  // Fetch bookings for current month
  const fetchMonthBookings = async () => {
    if (!companionId) return;
    
    if (!isMounted.current) return;
    setIsLoadingBookings(true);
    try {
      const { startDate, endDate } = getMonthDateRange(currentMonth);
      const bookings = await bookingApi.getCompanionBookingsByDateRange(companionId, startDate, endDate);
      if (!isMounted.current) return;
      setMonthBookings(bookings);
      await processBookingData(bookings);
    } catch (error: any) {
      console.error('Error fetching month bookings:', error);
      if (isMounted.current) {
        toast.error('Failed to load booking data');
      }
    } finally {
      if (isMounted.current) {
        setIsLoadingBookings(false);
      }
    }
  };

  // Process bookings into date-based structure
  const processBookingData = async (bookings: Array<{ id: number; bookingDate: string; startTime: string; endTime: string; status: string }>) => {
    if (!isMounted.current) return;

    const bookingsByDateMap: Record<string, BookingDateInfo> = {};
    
    // Group bookings by date
    bookings.forEach(booking => {
      const dateStr = booking.bookingDate;
      if (!bookingsByDateMap[dateStr]) {
        bookingsByDateMap[dateStr] = {
          date: dateStr,
          bookings: [],
          bookingCount: 0,
          isFullyBooked: false,
          isPartiallyBooked: false
        };
      }

      bookingsByDateMap[dateStr].bookings.push(booking);
      bookingsByDateMap[dateStr].bookingCount++;
    });
    
    // Determine if dates are fully or partially booked
    for (const dateInfo of Object.values(bookingsByDateMap)) {
      if (dateInfo.bookingCount > 0) {
        dateInfo.isPartiallyBooked = true;
        
        // Check if fully booked by comparing against available slots
        try {
          const availableSlots = await bookingApi.getAvailableTimeSlots(companionId, dateInfo.date);
          const remaining = availableSlots.availableSlots.length;
          
          // Mark as fully booked if no slots remain and there are bookings
          // remaining === 0 indicates no slots remain after bookings
          // The extra bookingCount > 0 guards against marking unscheduled days as "fully booked by bookings"
          if (remaining === 0 && dateInfo.bookingCount > 0) {
            dateInfo.isFullyBooked = true;
          }
        } catch (error) {
          console.error('Error checking availability for date:', dateInfo.date, error);
          // If we can't check availability, don't mark as fully booked
        }
      }
    }
    
    if (isMounted.current) {
      setBookingsByDate(bookingsByDateMap);
    }
  };

  // Cleanup effect to set isMounted to false on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Fetch service categories on component mount
  useEffect(() => {
    const fetchCategories = async () => {
      setIsLoadingCategories(true);
      try {
        const categories = await serviceCategoryApi.getAllCategories(true);
        setServiceCategories(categories);

        // Always set a default service selection - first available category
        // This prevents the validation error when moving through steps
        if (categories.length > 0) {
          // Only set default if user hasn't already made a selection
          if (!selectedCategory) {
            setSelectedCategory(categories[0]);
            if (import.meta.env.DEV) {
              console.log('Auto-selected first service category:', categories[0].name);
            }
          }
        } else {
          // No categories available, guide user to custom service
          if (import.meta.env.DEV) {
            console.log('No service categories available, custom service will be encouraged');
          }
        }
      } catch (error: any) {
        console.error('Error fetching service categories:', error);
        toast.error('Failed to load service categories');
        // If no categories available, default to standard service
        setServiceCategories([]);
      } finally {
        setIsLoadingCategories(false);
      }
    };

    fetchCategories();
  }, []);

  // Fetch bookings when month changes
  useEffect(() => {
    if (companionId) {
      fetchMonthBookings();
    }
  }, [currentMonth, companionId]);

  // Fetch available time slots when date is selected
  useEffect(() => {
    if (selectedDate) {
      fetchAvailableSlots();
    } else {
      setAvailableSlots([]);
      setSelectedTimeSlot(null);
    }
  }, [selectedDate, companionId]);

  const fetchAvailableSlots = async () => {
    if (!selectedDate) return;

    if (!isMounted.current) return;
    setIsLoadingSlots(true);
    try {
      const dateString = localDateKey(selectedDate);
      const response = await bookingApi.getAvailableTimeSlots(companionId, dateString);
      if (!isMounted.current) return;

      // Filter out past time slots if booking for today (client-side backup protection)
      const now = new Date();
      const isToday = selectedDate.toDateString() === now.toDateString();

      let filteredSlots = response.availableSlots;
      if (isToday) {
        // Add 30 minute buffer for booking process
        const bufferTime = new Date(now.getTime() + 30 * 60000);
        filteredSlots = response.availableSlots.filter((slot: TimeSlot) => {
          const [hours, minutes] = slot.startTime.split(':').map(Number);
          const slotDateTime = new Date(selectedDate);
          slotDateTime.setHours(hours, minutes, 0, 0);
          return slotDateTime > bufferTime;
        });

        // If no future slots available for today, show a message
        if (filteredSlots.length === 0 && response.availableSlots.length > 0) {
          toast('No available time slots remaining for today. Please select a future date.', {
            icon: 'ℹ️',
          });
        }
      }

      setAvailableSlots(filteredSlots);
    } catch (error: any) {
      console.error('Error fetching available slots:', error);
      if (isMounted.current) {
        toast.error('Failed to load available time slots');
      }
    } finally {
      if (isMounted.current) {
        setIsLoadingSlots(false);
      }
    }
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setSelectedTimeSlot(null);
    // Smooth scroll to time slot section
    setTimeout(() => {
      timeSlotSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleTimeSlotSelect = (slot: TimeSlot) => {
    setSelectedTimeSlot(slot);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleLocationChange = (
    address: string,
    placeDetails?: any,
    validatedAddress?: ValidatedAddress
  ) => {
    setFormData(prev => ({
      ...prev,
      meetingLocation: address,
      validatedAddress: validatedAddress
    }));
  };

  // Step validation functions
  const validateStep1 = () => {
    if (!selectedDate || !selectedTimeSlot) {
      return false;
    }
    
    // Validate duration constraints
    const duration = calculateDuration(selectedTimeSlot.startTime, selectedTimeSlot.endTime);
    return duration >= BOOKING_CONSTANTS.MIN_BOOKING_HOURS && duration <= BOOKING_CONSTANTS.MAX_BOOKING_HOURS;
  };

  const validateStep2 = () => {
    // Always require a predefined service selection
    // If no categories available, we'll use the fallback standard rate
    // But still need either a category selected or custom service
    return selectedCategory !== null || serviceCategories.length === 0;
  };

  const validateStep3 = () => {
    // Require verified location for in-person meetings
    if (meetingType === MEETING_TYPES.IN_PERSON) {
      if (!formData.meetingLocation.trim()) {
        return false;
      }
      // Must have validated address for safety
      if (!formData.validatedAddress) {
        return false;
      }
    }
    return true;
  };

  const validateStep4 = () => {
    return true; // Step 4 was removed (payment integration)
  };

  // Update step validation when dependencies change
  useEffect(() => {
    setStepValidation({
      step1: validateStep1(),
      step2: validateStep2(),
      step3: validateStep3(),
      step4: validateStep4()
    });
  }, [selectedDate, selectedTimeSlot, selectedCategory]);

  // Navigation functions
  const handleNext = () => {
    if (currentStep === 1 && !validateStep1()) {
      if (!selectedDate || !selectedTimeSlot) {
        toast.error('Please select a date and time slot');
      } else {
        const duration = calculateDuration(selectedTimeSlot.startTime, selectedTimeSlot.endTime);
        if (duration < BOOKING_CONSTANTS.MIN_BOOKING_HOURS) {
          toast.error(`Booking duration must be at least ${BOOKING_CONSTANTS.MIN_BOOKING_HOURS} hour(s)`);
        } else if (duration > BOOKING_CONSTANTS.MAX_BOOKING_HOURS) {
          toast.error(`Booking duration cannot exceed ${BOOKING_CONSTANTS.MAX_BOOKING_HOURS} hours`);
        }
      }
      return;
    }
    if (currentStep === 2 && !validateStep2()) {
      toast.error('Please select a service category');
      return;
    }
    if (currentStep === 3 && !validateStep3()) {
      if (meetingType === MEETING_TYPES.IN_PERSON) {
        if (!formData.meetingLocation.trim()) {
          toast.error('Please enter a meeting location');
        } else if (!formData.validatedAddress) {
          toast.error('Please select a verified address from the map for safety');
        }
      }
      return;
    }
    if (currentStep === 3) {
      // When moving from step 3, trigger booking creation
      handleSubmit({preventDefault: () => {}} as React.FormEvent<HTMLFormElement>);
      return;
    }
    if (currentStep < BOOKING_STEPS.TOTAL_STEPS) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleStepClick = (step: number) => {
    if (step < currentStep && stepValidation[`step${step}` as keyof typeof stepValidation]) {
      setCurrentStep(step);
    }
  };

  const calculateDuration = (startTime: string, endTime: string) => {
    const start = new Date(`2000-01-01 ${startTime}`);
    const end = new Date(`2000-01-01 ${endTime}`);
    return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  };

  const calculateTotal = () => {
    if (!selectedTimeSlot) return { subtotal: 0, serviceFee: 0, total: 0, duration: 0 };

    const duration = calculateDuration(selectedTimeSlot.startTime, selectedTimeSlot.endTime);
    // Use category price
    const hourlyRate = selectedCategory?.basePrice || 35;
    // Align rounding with backend: round each component to 2 decimals
    const rawSubtotal = duration * hourlyRate;
    const subtotal = Math.round(rawSubtotal * 100) / 100;
    const rawServiceFee = subtotal * BOOKING_CONSTANTS.SERVICE_FEE_PERCENTAGE;
    const serviceFee = Math.round(rawServiceFee * 100) / 100;
    const total = Math.round((subtotal + serviceFee) * 100) / 100;

    return { subtotal, serviceFee, total, duration };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedDate || !selectedTimeSlot) {
      toast.error('Please select a date and time slot');
      return;
    }

    // Validate service selection
    if (!selectedCategory && serviceCategories.length > 0) {
      toast.error('Please select a service category');
      return;
    }

    if (!isMounted.current) return;
    setIsSubmitting(true);
    try {
      const bookingData: BookingFormData = {
        companionId,
        bookingDate: localDateKey(selectedDate),
        startTime: selectedTimeSlot.startTime,
        endTime: selectedTimeSlot.endTime,
        specialRequests: formData.specialRequests || undefined,
        meetingLocation: formData.meetingLocation || undefined,
        meetingLocationLat: formData.validatedAddress?.lat,
        meetingLocationLon: formData.validatedAddress?.lon,
        meetingLocationPlaceId: formData.validatedAddress?.placeId,
        meetingType: meetingType,
        // Use selected category ID, or undefined if no categories available (backend will use default)
        serviceCategoryId: selectedCategory?.id || (serviceCategories.length === 0 ? undefined : selectedCategory?.id)
      };

      // ⭐ NEW FLOW: Create payment intent first (no booking in DB yet!)
      const result = await bookingApi.createPaymentIntent(bookingData);

      if (!isMounted.current) return;

      // ⭐ Show payment modal with payment intent details
      if (result.clientSecret) {
        setPaymentData({
          paymentIntentId: result.paymentIntentId,
          bookingData, // Store booking data for later
          clientSecret: result.clientSecret,
          totalAmount: result.totalAmount,
          bookingDate: localDateKey(selectedDate),
          bookingTime: `${selectedTimeSlot.startTime} - ${selectedTimeSlot.endTime}`
        });
        setShowPaymentModal(true);
      } else {
        toast.error("Payment initialization failed. Please try again.");
      }
      
    } catch (error: any) {
      console.error('Error creating booking:', error);
      if (isMounted.current) {
        const errorMessage = error.response?.data?.message || 'Failed to create booking';
        toast.error(errorMessage);
      }
    } finally {
      if (isMounted.current) {
        setIsSubmitting(false);
      }
    }
  };

  // Payment handlers removed - will be implemented later

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  // Compute props for Calendar component
  const disabledDates = Object.entries(bookingsByDate)
    .filter(([_, info]) => info.isFullyBooked)
    .map(([dateStr]) => {
      // Parse date string into components to avoid timezone issues
      const [year, month, day] = dateStr.split('-').map(Number);
      return new Date(year, month - 1, day);
    });
  
  const partialDates = Object.entries(bookingsByDate)
    .filter(([_, info]) => info.isPartiallyBooked)
    .map(([dateStr]) => {
      // Parse date string into components to avoid timezone issues
      const [year, month, day] = dateStr.split('-').map(Number);
      return new Date(year, month - 1, day);
    });
  
  const bookingCounts = Object.entries(bookingsByDate)
    .reduce((acc, [dateStr, info]) => ({ ...acc, [dateStr]: info.bookingCount }), {} as Record<string, number>);

  // Compute unavailableSlots for TimeSlotPicker
  const unavailableSlots: TimeSlot[] = selectedDate
    ? (bookingsByDate[localDateKey(selectedDate)]?.bookings.map(b => ({
        startTime: b.startTime,
        endTime: b.endTime
      })) || [])
    : [];


  const totalCalculation = calculateTotal();

  return (
    <div className={`max-w-4xl mx-auto ${className}`}>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Book {companionName}
          </h2>
          <p className="text-gray-600">
            Complete the steps below to create your booking
          </p>
        </div>

        {/* Step Indicator - New Horizontal Design */}
        <StepIndicator currentStep={currentStep} />

        {/* Monthly Availability Preview */}
        {currentStep === 1 && (
          <div className="mb-6">
            <MonthlyAvailabilityWidget
              companionId={companionId}
              selectedDate={selectedDate || undefined}
              onDateSelect={(date) => setSelectedDate(date)}
            />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Step 1: Date & Time Selection */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FaCalendar className="w-5 h-5 text-[#312E81]" />
                  Select Date
                </h3>
                <Calendar
                  selectedDate={selectedDate || undefined}
                  onDateSelect={handleDateSelect}
                  disabledDates={disabledDates}
                  partialDates={partialDates}
                  bookingCounts={bookingCounts}
                  onMonthChange={(year, month) => setCurrentMonth(new Date(year, month))}
                  minDate={new Date()}
                  className="max-w-md"
                />
              </div>

              {selectedDate && (
                <div ref={timeSlotSectionRef}>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <FaClock className="w-5 h-5" />
                    Select Time for {formatDate(selectedDate)}
                  </h3>
                  <TimeSlotPicker
                    availableSlots={availableSlots}
                    unavailableSlots={unavailableSlots}
                    selectedSlot={selectedTimeSlot || undefined}
                    onSlotSelect={handleTimeSlotSelect}
                    isLoading={isLoadingSlots}
                    basePrice={35}
                    categoryPrice={selectedCategory?.basePrice}
                  />
                  {/* Timezone Indicator */}
                  <div className="mt-3 flex items-center gap-2 text-sm text-gray-600 bg-blue-50 px-3 py-2 rounded-lg">
                    <FaGlobe className="w-4 h-4 text-blue-600" />
                    <span>All times shown in your local timezone: <strong className="text-gray-900">{getTimezoneDisplayName()}</strong></span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Service Details */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FaComments className="w-5 h-5" />
                  Service Category
                </h3>
                
                {isLoadingCategories ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#312E81]"></div>
                    <span className="ml-2 text-gray-600">Loading categories...</span>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      {/* Service Categories */}
                      {serviceCategories.length > 0 ? (
                        <>
                          {serviceCategories.map((category) => (
                            <label
                              key={category.id}
                              className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all hover:bg-gray-50 ${
                                selectedCategory?.id === category.id
                                  ? 'border-[#312E81] bg-purple-50'
                                  : 'border-gray-200'
                              }`}
                            >
                              <input
                                type="radio"
                                name="serviceSelection"
                                checked={selectedCategory?.id === category.id}
                                onChange={() => {
                                  setSelectedCategory(category);
                                }}
                                className="sr-only"
                              />
                              <div className={`w-5 h-5 rounded-full border-2 mr-3 flex items-center justify-center ${
                                selectedCategory?.id === category.id
                                  ? 'border-[#312E81]'
                                  : 'border-gray-300'
                              }`}>
                                {selectedCategory?.id === category.id && (
                                  <div className="w-3 h-3 rounded-full bg-[#312E81]" />
                                )}
                              </div>
                              <span className="flex-1">{category.name}</span>
                              <span className="text-[#312E81] font-semibold">${category.basePrice}/hr</span>
                            </label>
                          ))}
                        </>
                      ) : (
                        <div className="text-center py-4 text-gray-500">
                          No services available. Please contact support.
                        </div>
                      )}
                    </div>

                    {!selectedCategory && serviceCategories.length > 0 && (
                      <p className="text-sm text-amber-600 mt-2">
                        ⚠️ Please select a service category
                      </p>
                    )}
                  </>
                )}

                {/* Show category details for predefined services */}
                {selectedCategory && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-semibold text-gray-900 mb-2">{selectedCategory.name}</h4>
                    {selectedCategory.description && (
                      <p className="text-sm text-gray-600 mb-2">{selectedCategory.description}</p>
                    )}
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <FaDollarSign className="w-4 h-4" />
                      <span>Base Rate: ${selectedCategory.basePrice}/hour</span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FaMapMarkerAlt className="w-5 h-5" />
                  Meeting Type
                </h3>
                <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                  <FaMapMarkerAlt className="w-5 h-5 text-[#312E81]" />
                  <span className="text-gray-700">In-Person Meeting</span>
                  <Badge variant="info" size="sm">Default</Badge>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Review & Book */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FaCheck className="w-5 h-5" />
                  Booking Summary
                </h3>
                
                <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">Date & Time</h4>
                      <div className="space-y-1 text-sm text-gray-600">
                        <div>Date: {selectedDate && formatDate(selectedDate)}</div>
                        <div>Time: {selectedTimeSlot?.startTime} - {selectedTimeSlot?.endTime}</div>
                        <div>Duration: {totalCalculation.duration} hours</div>
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">Service Details</h4>
                      <div className="space-y-1 text-sm text-gray-600">
                        <div>Category: {selectedCategory?.name || 'Standard'}</div>
                        <div>Meeting Type: In-Person</div>
                        <div>Rate: ${selectedCategory?.basePrice || 35}/hour</div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="font-semibold text-gray-900 mb-3">Price Breakdown</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Subtotal ({totalCalculation.duration} hours × ${selectedCategory?.basePrice || 35}):</span>
                        <span>${totalCalculation.subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Service Fee (10%):</span>
                        <span>${totalCalculation.serviceFee.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-lg border-t pt-2">
                        <span>Total:</span>
                        <span className="flex items-center gap-1">
                          <FaDollarSign className="w-4 h-4" />
                          {totalCalculation.total.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <AddressSearch
                    value={formData.meetingLocation}
                    onChange={handleLocationChange}
                    placeholder="Search for a safe, public meeting location..."
                    label="Meeting Location"
                    required={true}
                    showMap={true}
                    requireVerification={true}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    For your safety, please select a verified public location from the map
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Payment step removed - will be implemented later */}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-6 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="flex-1"
            >
              Cancel
            </Button>
            
            {currentStep > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                icon={<FaArrowLeft className="w-4 h-4" />}
                iconPosition="left"
                className="flex-1"
              >
                Back
              </Button>
            )}
            
            {currentStep < BOOKING_STEPS.TOTAL_STEPS ? (
              <Button
                type="button"
                variant="primary"
                onClick={handleNext}
                disabled={!stepValidation[`step${currentStep}` as keyof typeof stepValidation]}
                icon={<FaArrowRight className="w-4 h-4" />}
                iconPosition="right"
                className="flex-1"
              >
                Next
              </Button>
            ) : (
              <Button
                type="submit"
                variant="primary"
                disabled={!stepValidation.step1 || !stepValidation.step2 || isSubmitting}
                loading={isSubmitting}
                className="flex-1"
              >
                {isSubmitting ? 'Creating Booking...' : 'Create Booking'}
              </Button>
            )}
          </div>
        </form>
      </div>

      {/* ⭐ Payment Confirmation Modal */}
      {paymentData && (
        <PaymentConfirmationModal
          isOpen={showPaymentModal}
          onClose={() => {
            // ⭐ NEW FLOW: No cleanup needed! No booking in DB yet
            console.log('✅ Payment modal closed - no booking created');
            setShowPaymentModal(false);
            navigate('/client-dashboard');
          }}
          bookingId={0} // Not used in new flow
          clientSecret={paymentData.clientSecret}
          amount={paymentData.totalAmount}
          companionName={companionName}
          bookingDate={paymentData.bookingDate}
          bookingTime={paymentData.bookingTime}
          onPaymentSuccess={async () => {
            // ⭐ NEW FLOW: Create booking AFTER payment authorization
            const booking = await bookingApi.createBookingWithPayment({
              ...paymentData.bookingData,
              paymentIntentId: paymentData.paymentIntentId
            });
            toast.success('Payment authorized');
            navigate('/client-dashboard');
            onBookingCreated(booking.bookingId);
          }}
        />
      )}
    </div>
  );
};

export default BookingForm;

