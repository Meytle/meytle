/**
 * Custom Booking Request Modal Component
 * A 3-step wizard for requesting custom bookings when no time slots are available
 */

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  FaExclamationCircle,
  FaMoneyBillWave,
  FaComment,
} from "react-icons/fa";
import { toast } from "react-hot-toast";
import { bookingApi } from "../../api/booking";
import { serviceCategoryApi } from "../../api/serviceCategory";
import AddressSearch from "../common/AddressSearch";
import AutoResizeTextarea from "../common/AutoResizeTextarea";
import PaymentConfirmationModal from "../payment/PaymentConfirmationModal";
import { useModalRegistration } from "../../context/ModalContext";
import { convertToUTC } from "../../utils/timeConverter";
import type { ServiceCategory } from "../../types";
import type { ValidatedAddress } from "../../services/addressValidation";

// Time picker constants for 12-hour format with 30-minute intervals
const HOURS = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];
const MINUTES = ['00', '30'];
const PERIODS = ['AM', 'PM'];

// Convert 12h to 24h format for storage
const to24Hour = (hour: string, minute: string, period: string): string => {
  let h = parseInt(hour);
  if (period === 'AM' && h === 12) h = 0;
  if (period === 'PM' && h !== 12) h += 12;
  return `${h.toString().padStart(2, '0')}:${minute}`;
};

// Convert 24h to 12h format for display
// Rounds minutes to nearest valid option (00 or 30) to handle legacy data
const to12Hour = (time24: string): { hour: string; minute: string; period: string } => {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  let hour = h % 12;
  if (hour === 0) hour = 12;
  // Round to nearest 30-minute interval (0-29 → '00', 30-59 → '30')
  const minute = m < 30 ? '00' : '30';
  return { hour: hour.toString(), minute, period };
};

interface CustomBookingRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  companionId: number;
  companionName: string;
  companionServices?: string[];
  onRequestCreated?: (requestId: number) => void;
}

interface RequestFormData {
  // Step 1: Date, Time & Service
  selectedDate: Date;
  startTime: string;
  endTime: string;
  serviceType: string;
  serviceCategoryId?: number;
  extraAmount: string;

  // Step 2: Location (In Person Only)
  meetingType: "in_person";
  meetingLocation: string;
  placeDetails?: {
    formatted_address: string;
    lat?: number;
    lng?: number;
    place_id?: string;
  };
  validatedAddress?: ValidatedAddress;

  // Step 3: Additional Info
  specialRequests: string;
  durationHours?: number;
}

const CustomBookingRequestModal: React.FC<CustomBookingRequestModalProps> = ({
  isOpen,
  onClose,
  companionId,
  companionName,
  companionServices = [],
  onRequestCreated,
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>(
    [],
  );
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  
  // ⭐ Payment state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentData, setPaymentData] = useState<{
    paymentIntentId: string;
    requestData: any; // Full request data
    clientSecret: string;
    totalAmount: number;
    requestedDate: string;
  } | null>(null);

  // Register modal with global modal context (handles scroll prevention automatically)
  useModalRegistration("custom-booking-request-modal", isOpen);

  const [formData, setFormData] = useState<RequestFormData>({
    // Step 1
    selectedDate: new Date(),
    startTime: "10:00",
    endTime: "11:00",
    serviceType: "",
    serviceCategoryId: undefined,
    extraAmount: "0",

    // Step 2
    meetingType: "in_person",
    meetingLocation: "",

    // Step 3
    specialRequests: "",
    durationHours: 1,
  });

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
      setFormData({
        selectedDate: new Date(),
        startTime: "10:00",
        endTime: "11:00",
        serviceType: "",
        serviceCategoryId: undefined,
        extraAmount: "0",
        meetingType: "in_person",
        meetingLocation: "",
        specialRequests: "",
        durationHours: 1,
      });
    }
  }, [isOpen]);

  const fetchServiceCategories = async () => {
    setIsLoadingServices(true);
    try {
      const categories = await serviceCategoryApi.getAllCategories(true);
      setServiceCategories(categories);
    } catch (error) {
      console.error("Error fetching service categories:", error);
    } finally {
      setIsLoadingServices(false);
    }
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const calculateDuration = () => {
    const startTime = new Date(`2000-01-01 ${formData.startTime}`);
    const endTime = new Date(`2000-01-01 ${formData.endTime}`);
    return (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
  };

  const validateStep1 = (): boolean => {
    console.log("Validating Step 1 with data:", {
      selectedDate: formData.selectedDate,
      startTime: formData.startTime,
      endTime: formData.endTime,
      serviceType: formData.serviceType,
    });

    if (!formData.selectedDate) {
      toast.error("Please select a date");
      return false;
    }
    if (!formData.startTime || !formData.endTime) {
      toast.error("Please select both start and end times");
      return false;
    }
    if (formData.startTime >= formData.endTime) {
      toast.error("End time must be after start time");
      return false;
    }
    if (!formData.serviceType) {
      toast.error("Please select a service type from the dropdown");
      return false;
    }
    console.log("Step 1 validation passed");
    return true;
  };

  const validateStep2 = (): boolean => {
    // Always require meeting location (in person only)
    if (!formData.meetingLocation.trim()) {
      toast.error("Please enter a meeting location");
      return false;
    }

    // Check if address is validated
    if (!formData.validatedAddress) {
      toast.error(
        "Please select a verified address from the suggestions for safety",
      );
      return false;
    }

    // Check if validated address has required fields
    if (!formData.validatedAddress.lat || !formData.validatedAddress.lon) {
      toast.error(
        "Selected address is missing location coordinates. Please select another address.",
      );
      return false;
    }
    return true;
  };

  const handleNextStep = () => {
    console.log("Next step clicked. Current step:", currentStep);
    console.log("Current form data:", formData);

    if (currentStep === 1) {
      const isValid = validateStep1();
      console.log("Step 1 validation result:", isValid);
      if (!isValid) return;
    }

    if (currentStep === 2) {
      const isValid = validateStep2();
      console.log("Step 2 validation result:", isValid);
      if (!isValid) return;
    }

    setCurrentStep((prev) => Math.min(totalSteps, prev + 1));
    console.log("Moving to step:", Math.min(totalSteps, currentStep + 1));
  };

  const handlePrevStep = () => {
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  const handleSubmit = async () => {
    console.log("Submitting booking request with form data:", formData);
    
    // REMOVED: Check for unreviewed bookings before allowing new booking request
    // This check has been disabled to allow clients to make bookings without completing reviews
    /*
    try {
      const unreviewedData = await bookingApi.getPendingReviews();
      const count = unreviewedData.pendingReviews.length;
      if (count > 0) {
        toast.error(`You have ${count} unreviewed completed booking${count === 1 ? '' : 's'}. Please submit your review${count === 1 ? '' : 's'} before creating a new booking request.`, {
          duration: 5000
        });
        return;
      }
    } catch (error: any) {
      console.error('Error checking unreviewed bookings:', error);
      // Don't block booking if check fails - let backend handle it
    }
    */
    
    setIsSubmitting(true);

    try {
      // Format date in local timezone (NOT UTC) to avoid date shift bugs
      const year = formData.selectedDate.getFullYear();
      const month = String(formData.selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(formData.selectedDate.getDate()).padStart(2, '0');
      const localDateString = `${year}-${month}-${day}`;
      
      console.log('📅 Date conversion:', {
        selectedDate: formData.selectedDate,
        localDateString: localDateString,
        isoString: formData.selectedDate.toISOString(),
        warning: 'Using local date to avoid timezone shifts'
      });
      
      const requestData = {
        companionId,
        requestedDate: localDateString,
        startTime: formData.startTime,
        endTime: formData.endTime,
        durationHours: calculateDuration(),
        serviceCategoryId: formData.serviceCategoryId,
        serviceType: formData.serviceType,
        extraAmount: parseFloat(formData.extraAmount) || 0,
        meetingType: formData.meetingType,
        meetingLocation: formData.meetingLocation,
        meetingLocationLat: formData.validatedAddress?.lat,
        meetingLocationLon: formData.validatedAddress?.lon,
        meetingLocationPlaceId: formData.validatedAddress?.placeId,
        specialRequests: formData.specialRequests,
      };

      console.log("Sending request data:", requestData);

      // Detect client's timezone
      const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      console.log("Client timezone detected:", clientTimezone);

      // Convert local times to UTC for storage
      const startTimeUTC = convertToUTC(requestData.startTime, requestData.requestedDate, clientTimezone);
      const endTimeUTC = convertToUTC(requestData.endTime, requestData.requestedDate, clientTimezone);
      console.log("Times converted to UTC:", { startTimeUTC, endTimeUTC, original: { start: requestData.startTime, end: requestData.endTime } });

      // ⭐ NEW FLOW: Create payment intent first (no request in DB yet!)
      const response = await bookingApi.createRequestPaymentIntent({
        companionId: companionId,
        requestedDate: requestData.requestedDate,
        startTime: startTimeUTC,
        endTime: endTimeUTC,
        durationHours: requestData.durationHours || 1,
        serviceType: requestData.serviceType,
        extraAmount: requestData.extraAmount,
        clientTimezone: clientTimezone
      });
      console.log("Payment intent response:", response);

      // ⭐ Show payment modal with payment intent details
      if (response.clientSecret) {
        // Store request data with UTC times for later submission
        const requestDataWithUTC = {
          ...requestData,
          startTime: startTimeUTC,
          endTime: endTimeUTC,
          clientTimezone: clientTimezone
        };
        setPaymentData({
          paymentIntentId: response.paymentIntentId,
          requestData: requestDataWithUTC, // Store request data with UTC times
          clientSecret: response.clientSecret,
          totalAmount: response.totalAmount,
          requestedDate: requestData.requestedDate,
        });
        setShowPaymentModal(true);
      } else {
        // Shouldn't happen
        toast.error("Failed to create payment intent");
      }
    } catch (error: any) {
      console.error("Error creating booking request:", error);
      console.error("Error response:", error.response);
      toast.error(
        error.response?.data?.message || "Failed to create booking request",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLocationChange = (
    address: string,
    placeDetails?: any,
    validatedAddress?: ValidatedAddress,
  ) => {
    setFormData((prev) => ({
      ...prev,
      meetingLocation: address,
      validatedAddress: validatedAddress,
    }));
  };

  const renderCalendarDays = () => {
    const firstDay = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth(),
      1,
    ).getDay();
    const daysInMonth = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() + 1,
      0,
    ).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days = [];

    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} />);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(
        calendarMonth.getFullYear(),
        calendarMonth.getMonth(),
        day,
      );
      const isPast = date < today;
      const isSelected =
        formData.selectedDate &&
        date.toDateString() === formData.selectedDate.toDateString();

      days.push(
        <button
          key={day}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            if (!isPast) {
              setFormData({ ...formData, selectedDate: date });
            }
          }}
          disabled={isPast}
          className={`
            p-2 text-sm rounded-lg transition-all
            ${
              isPast
                ? "text-gray-300 cursor-not-allowed"
                : isSelected
                  ? "bg-[#312E81] text-white font-semibold"
                  : "hover:bg-gray-100 text-gray-700"
            }
          `}
        >
          {day}
        </button>,
      );
    }

    return days;
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center mb-6">
      {[1, 2, 3].map((step) => (
        <div key={step} className="flex items-center">
          <div
            className={`
              w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all
              ${
                currentStep >= step
                  ? "bg-[#312E81] text-white"
                  : "bg-gray-200 text-gray-500"
              }
            `}
          >
            {currentStep > step ? <FaCheckCircle /> : step}
          </div>
          {step < totalSteps && (
            <div
              className={`
                w-24 h-0.5 transition-all
                ${currentStep > step ? "bg-[#312E81]" : "bg-gray-200"}
              `}
            />
          )}
        </div>
      ))}
    </div>
  );

  return (
    <>
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-md z-[60]"
            onClick={onClose}
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          >
            <div
              className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-[#312E81] to-[#FFCCCB] text-white px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">
                      Request Custom Booking
                    </h2>
                    <p className="text-white/80 mt-1">with {companionName}</p>
                  </div>
                  <button
                    onClick={onClose}
                    className="text-white hover:text-gray-200 transition-colors p-2"
                  >
                    <FaTimes className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6">
                {/* Step Indicator */}
                {renderStepIndicator()}

                <div>
                  <AnimatePresence mode="wait">
                    {/* Step 1: Date, Time & Service */}
                    {currentStep === 1 && (
                      <motion.div
                        key="step1"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                      >
                        <div>
                          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <FaCalendarAlt className="text-[#312E81]" />
                            Select Date & Time
                          </h3>

                          {/* Date Selection */}
                          <div className="border border-gray-200 rounded-lg p-4 mb-4">
                            <div className="flex items-center justify-between mb-4">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  const newMonth = new Date(calendarMonth);
                                  newMonth.setMonth(newMonth.getMonth() - 1);
                                  if (
                                    newMonth >=
                                    new Date(
                                      new Date().getFullYear(),
                                      new Date().getMonth(),
                                      1,
                                    )
                                  ) {
                                    setCalendarMonth(newMonth);
                                  }
                                }}
                                disabled={
                                  calendarMonth.getMonth() ===
                                    new Date().getMonth() &&
                                  calendarMonth.getFullYear() ===
                                    new Date().getFullYear()
                                }
                                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
                              >
                                ←
                              </button>
                              <h4 className="text-lg font-semibold">
                                {calendarMonth.toLocaleDateString("en-US", {
                                  month: "long",
                                  year: "numeric",
                                })}
                              </h4>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  const newMonth = new Date(calendarMonth);
                                  newMonth.setMonth(newMonth.getMonth() + 1);
                                  setCalendarMonth(newMonth);
                                }}
                                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                              >
                                →
                              </button>
                            </div>

                            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-gray-500 mb-2">
                              {[
                                "Sun",
                                "Mon",
                                "Tue",
                                "Wed",
                                "Thu",
                                "Fri",
                                "Sat",
                              ].map((day) => (
                                <div key={day}>{day}</div>
                              ))}
                            </div>
                            <div className="grid grid-cols-7 gap-1">
                              {renderCalendarDays()}
                            </div>
                          </div>

                          {/* Time Selection - 30-minute intervals */}
                          <div className="flex gap-6">
                            <div className="flex-1">
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Start Time
                              </label>
                              <div className="flex items-center gap-1">
                                <select
                                  value={to12Hour(formData.startTime).hour}
                                  onChange={(e) => {
                                    const { minute, period } = to12Hour(formData.startTime);
                                    setFormData({
                                      ...formData,
                                      startTime: to24Hour(e.target.value, minute, period),
                                    });
                                  }}
                                  className="w-16 px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#312E81] focus:border-transparent text-center"
                                >
                                  {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                                <span className="text-gray-500 font-medium">:</span>
                                <select
                                  value={to12Hour(formData.startTime).minute}
                                  onChange={(e) => {
                                    const { hour, period } = to12Hour(formData.startTime);
                                    setFormData({
                                      ...formData,
                                      startTime: to24Hour(hour, e.target.value, period),
                                    });
                                  }}
                                  className="w-16 px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#312E81] focus:border-transparent text-center"
                                >
                                  {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                                <select
                                  value={to12Hour(formData.startTime).period}
                                  onChange={(e) => {
                                    const { hour, minute } = to12Hour(formData.startTime);
                                    setFormData({
                                      ...formData,
                                      startTime: to24Hour(hour, minute, e.target.value),
                                    });
                                  }}
                                  className="w-16 px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#312E81] focus:border-transparent text-center"
                                >
                                  {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                              </div>
                            </div>
                            <div className="flex-1">
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                End Time
                              </label>
                              <div className="flex items-center gap-1">
                                <select
                                  value={to12Hour(formData.endTime).hour}
                                  onChange={(e) => {
                                    const { minute, period } = to12Hour(formData.endTime);
                                    setFormData({
                                      ...formData,
                                      endTime: to24Hour(e.target.value, minute, period),
                                    });
                                  }}
                                  className="w-16 px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#312E81] focus:border-transparent text-center"
                                >
                                  {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                                <span className="text-gray-500 font-medium">:</span>
                                <select
                                  value={to12Hour(formData.endTime).minute}
                                  onChange={(e) => {
                                    const { hour, period } = to12Hour(formData.endTime);
                                    setFormData({
                                      ...formData,
                                      endTime: to24Hour(hour, e.target.value, period),
                                    });
                                  }}
                                  className="w-16 px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#312E81] focus:border-transparent text-center"
                                >
                                  {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                                <select
                                  value={to12Hour(formData.endTime).period}
                                  onChange={(e) => {
                                    const { hour, minute } = to12Hour(formData.endTime);
                                    setFormData({
                                      ...formData,
                                      endTime: to24Hour(hour, minute, e.target.value),
                                    });
                                  }}
                                  className="w-16 px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#312E81] focus:border-transparent text-center"
                                >
                                  {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Service Selection */}
                        <div>
                          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <FaServicestack className="text-[#312E81]" />
                            Select Service
                          </h3>

                          <div className="space-y-4">
                                {/* Standard Services */}
                                {serviceCategories.length > 0 && (
                                  <div>
                                    <h4 className="text-sm font-semibold text-gray-700 mb-2">
                                      Standard Services
                                    </h4>
                                    <div className="space-y-2">
                                      {serviceCategories.map((category) => (
                                        <label
                                          key={category.id}
                                          className={`flex items-center p-3 border-2 rounded-lg cursor-pointer transition-all hover:bg-gray-50 ${
                                            formData.serviceType ===
                                            category.name
                                              ? "border-[#312E81] bg-purple-50"
                                              : "border-gray-200"
                                          }`}
                                        >
                                          <input
                                            type="radio"
                                            name="serviceType"
                                            value={category.name}
                                            checked={
                                              formData.serviceType ===
                                              category.name
                                            }
                                            onChange={(e) => {
                                              const selectedValue =
                                                e.target.value;
                                              setFormData({
                                                ...formData,
                                                serviceType: selectedValue,
                                                serviceCategoryId: category.id,
                                              });
                                            }}
                                            className="sr-only"
                                          />
                                          <div
                                            className={`w-5 h-5 rounded-full border-2 mr-3 flex items-center justify-center ${
                                              formData.serviceType ===
                                              category.name
                                                ? "border-[#312E81]"
                                                : "border-gray-300"
                                            }`}
                                          >
                                            {formData.serviceType ===
                                              category.name && (
                                              <div className="w-3 h-3 rounded-full bg-[#312E81]" />
                                            )}
                                          </div>
                                          <span className="flex-1">
                                            {category.name}
                                          </span>
                                          <span className="text-[#312E81] font-semibold">
                                            ${category.basePrice}/hr
                                          </span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Companion's Specialties */}
                                {companionServices.length > 0 && (
                                  <div>
                                    <h4 className="text-sm font-semibold text-gray-700 mb-2">
                                      Companion's Specialties
                                    </h4>
                                    <div className="space-y-2">
                                      {companionServices.map(
                                        (service, index) => (
                                          <label
                                            key={`companion-${index}`}
                                            className={`flex items-center p-3 border-2 rounded-lg cursor-pointer transition-all hover:bg-gray-50 ${
                                              formData.serviceType === service
                                                ? "border-[#312E81] bg-purple-50"
                                                : "border-gray-200"
                                            }`}
                                          >
                                            <input
                                              type="radio"
                                              name="serviceType"
                                              value={service}
                                              checked={
                                                formData.serviceType === service
                                              }
                                              onChange={(e) => {
                                                setFormData({
                                                  ...formData,
                                                  serviceType: e.target.value,
                                                  serviceCategoryId: undefined,
                                                });
                                              }}
                                              className="sr-only"
                                            />
                                            <div
                                              className={`w-5 h-5 rounded-full border-2 mr-3 flex items-center justify-center ${
                                                formData.serviceType === service
                                                  ? "border-[#312E81]"
                                                  : "border-gray-300"
                                              }`}
                                            >
                                              {formData.serviceType ===
                                                service && (
                                                <div className="w-3 h-3 rounded-full bg-[#312E81]" />
                                              )}
                                            </div>
                                            <span className="flex-1">
                                              {service}
                                            </span>
                                          </label>
                                        ),
                                      )}
                                    </div>
                                  </div>
                                )}
                          </div>
                        </div>

                        {/* Extra Amount */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                            <FaMoneyBillWave className="text-[#312E81]" />
                            Extra Amount (Optional Tip/Bonus)
                          </label>
                          <div className="flex gap-2">
                            {["0", "5", "10", "15", "20", "25"].map(
                              (amount) => (
                                <button
                                  key={amount}
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setFormData({
                                      ...formData,
                                      extraAmount: amount,
                                    });
                                  }}
                                  className={`px-3 py-2 rounded-lg font-medium transition-all ${
                                    formData.extraAmount === amount
                                      ? "bg-[#312E81] text-white shadow-[0_0_15px_rgba(255,204,203,0.3)]"
                                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                  }`}
                                >
                                  ${amount}
                                </button>
                              ),
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* Step 2: Location */}
                    {currentStep === 2 && (
                      <motion.div
                        key="step2"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                      >
                        <div>
                          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <FaMapMarkerAlt className="text-[#312E81]" />
                            Meeting Details
                          </h3>

                          {/* Meeting Type */}
                          {/* Location Input - In Person Only */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Meeting Location
                            </label>
                            <AddressSearch
                              value={formData.meetingLocation}
                              onChange={handleLocationChange}
                              placeholder="Enter address or location name..."
                              className="w-full"
                            />
                            <p className="text-sm text-gray-500 mt-2">
                              Enter a specific address or general area (e.g.,
                              "Downtown Coffee Shop")
                            </p>
                          </div>
                        </div>
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
                        <div>
                          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <FaCheckCircle className="text-[#312E81]" />
                            Review Your Request
                          </h3>

                          {/* Summary */}
                          <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <div className="text-sm text-gray-500">
                                  Date
                                </div>
                                <div className="font-semibold">
                                  {formData.selectedDate.toLocaleDateString(
                                    "en-US",
                                    {
                                      weekday: "long",
                                      month: "long",
                                      day: "numeric",
                                      year: "numeric",
                                    },
                                  )}
                                </div>
                              </div>
                              <div>
                                <div className="text-sm text-gray-500">
                                  Time
                                </div>
                                <div className="font-semibold">
                                  {formatTime(formData.startTime)} -{" "}
                                  {formatTime(formData.endTime)}
                                </div>
                              </div>
                              <div>
                                <div className="text-sm text-gray-500">
                                  Duration
                                </div>
                                <div className="font-semibold">
                                  {calculateDuration()} hour
                                  {calculateDuration() !== 1 ? "s" : ""}
                                </div>
                              </div>
                              <div>
                                <div className="text-sm text-gray-500">
                                  Service
                                </div>
                                <div className="font-semibold">
                                  {formData.serviceType || "Not specified"}
                                </div>
                              </div>
                              <div>
                                <div className="text-sm text-gray-500">
                                  Meeting Type
                                </div>
                                <div className="font-semibold">
                                  In Person
                                </div>
                              </div>
                              {formData.meetingLocation && (
                                <div>
                                  <div className="text-sm text-gray-500">
                                    Location
                                  </div>
                                  <div className="font-semibold">
                                    {formData.meetingLocation}
                                  </div>
                                </div>
                              )}
                              {parseFloat(formData.extraAmount) > 0 && (
                                <div>
                                  <div className="text-sm text-gray-500">
                                    Extra Tip
                                  </div>
                                  <div className="font-semibold">
                                    ${formData.extraAmount}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Info Message */}
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <p className="text-sm text-blue-800">
                              <strong>{companionName}</strong> will be notified
                              of your request and can:
                            </p>
                            <ul className="list-disc list-inside text-sm text-blue-700 mt-2">
                              <li>Accept the request as-is</li>
                              <li>Decline if unavailable</li>
                            </ul>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Navigation Buttons */}
                <div className="flex justify-between mt-6 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (currentStep === 1) {
                        onClose();
                      } else {
                        handlePrevStep();
                      }
                    }}
                    className="px-6 py-3 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
                  >
                    <FaArrowLeft />
                    {currentStep === 1 ? "Cancel" : "Previous"}
                  </button>

                  {currentStep < totalSteps ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleNextStep();
                      }}
                      className="px-6 py-3 bg-[#312E81] text-white rounded-lg hover:bg-[#1E1B4B] hover:shadow-[0_0_15px_rgba(255,204,203,0.3)] transition-all flex items-center gap-2"
                    >
                      Next
                      <FaArrowRight />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSubmit();
                      }}
                      disabled={isSubmitting}
                      className="px-6 py-3 bg-[#312E81] text-white rounded-lg hover:bg-[#1E1B4B] hover:shadow-[0_0_15px_rgba(255,204,203,0.3)] transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <>
                          <FaSpinner className="animate-spin" />
                          Sending Request...
                        </>
                      ) : (
                        <>
                          <FaCheckCircle />
                          Send Request
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>

      {/* ⭐ Payment Confirmation Modal */}
      {paymentData && (
        <PaymentConfirmationModal
          isOpen={showPaymentModal}
          onClose={() => {
            // ⭐ User clicked X - close payment modal only, return to form
            console.log('✅ Payment modal closed - no request created');
            setShowPaymentModal(false);
            setPaymentData(null); // Clear payment data
            // Don't close booking modal - let user go back to edit form
          }}
          bookingId={0} // Not used in new flow
          clientSecret={paymentData.clientSecret}
          amount={paymentData.totalAmount}
          companionName={companionName}
          bookingDate={paymentData.requestedDate}
          bookingTime="Custom Time"
          onPaymentSuccess={async () => {
            try {
              // ⭐ NEW FLOW: Create request AFTER payment authorization
              const request = await bookingApi.createRequestWithPayment({
                ...paymentData.requestData,
                paymentIntentId: paymentData.paymentIntentId
              });
              toast.success('Payment authorized! Your request has been sent to the companion.');
              onRequestCreated?.(request.requestId);
              setShowPaymentModal(false); // Close payment modal first
              onClose(); // Then close booking modal
            } catch (error) {
              console.error('Error confirming payment:', error);
              toast.error('Failed to confirm payment. Please contact support.');
            }
          }}
        />
      )}
    </>
  );
};

export default CustomBookingRequestModal;
