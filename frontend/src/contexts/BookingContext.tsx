/**
 * Booking Context
 * Centralized state management for the booking flow
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { bookingApi } from '../api/booking';
import type { BookingFormData, MeetingType } from '../types';

interface TimeSlot {
  startTime: string;
  endTime: string;
}

interface CompanionDetails {
  id: number;
  name: string;
  profilePhoto?: string;
  hourlyRate: number;
  bio?: string;
  location?: string;
  services?: string[];
  languages?: string[];
  interests?: string[];
}

interface ServiceCategory {
  id: number;
  name: string;
  description: string;
  basePrice: number;
  priceModifier: number;
  icon?: string;
}

interface BookingData {
  // Step 1: Date & Time
  selectedDate?: Date;
  selectedTimeSlot?: TimeSlot;
  duration?: number; // in hours

  // Step 2: Service Selection
  selectedService?: ServiceCategory;
  additionalServices?: ServiceCategory[];
  specialRequests?: string;

  // Step 3: Review & Confirmation
  totalPrice?: number;
  platformFee?: number;
  companionEarnings?: number;

  // Companion info
  companion?: CompanionDetails;
  companionId?: number;

  // Location & Meeting
  meetingLocation?: string;
  meetingType?: MeetingType;

  // Booking metadata
  bookingStatus?: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  paymentStatus?: 'unpaid' | 'paid' | 'refunded';
  bookingReference?: string;
}

interface AvailabilityCache {
  [key: string]: {
    data: any;
    timestamp: number;
  };
}

interface BookingContextType {
  // Booking data
  bookingData: BookingData;

  // Step navigation
  currentStep: number;
  totalSteps: number;

  // Actions
  updateBookingData: (data: Partial<BookingData>) => void;
  resetBookingData: () => void;
  nextStep: () => void;
  previousStep: () => void;
  goToStep: (step: number) => void;

  // Availability management
  availabilityCache: AvailabilityCache;
  fetchAvailability: (companionId: number, date: Date) => Promise<any>;
  clearAvailabilityCache: () => void;

  // Price calculation
  calculateTotalPrice: () => number;
  calculatePlatformFee: (total: number) => number;

  // Validation
  isStepValid: (step: number) => boolean;
  canProceedToNext: () => boolean;

  // Loading states
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  // Error handling
  error: string | null;
  setError: (error: string | null) => void;

  // Booking submission
  submitBooking: () => Promise<any>;

  // Session management
  saveToLocalStorage: () => void;
  loadFromLocalStorage: () => void;
  clearSession: () => void;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const PLATFORM_FEE_PERCENTAGE = 0.10; // 10%
const LOCAL_STORAGE_KEY = 'meytle_booking_session';

const initialBookingData: BookingData = {
  duration: 1,
  bookingStatus: 'pending',
  paymentStatus: 'unpaid'
};

const BookingContext = createContext<BookingContextType | undefined>(undefined);

export const useBooking = () => {
  const context = useContext(BookingContext);
  if (!context) {
    throw new Error('useBooking must be used within a BookingProvider');
  }
  return context;
};

export const BookingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [bookingData, setBookingData] = useState<BookingData>(initialBookingData);
  const [currentStep, setCurrentStep] = useState(1);
  const [availabilityCache, setAvailabilityCache] = useState<AvailabilityCache>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalSteps = 4; // Date/Time, Service, Review, Payment

  // Load session from localStorage on mount
  useEffect(() => {
    loadFromLocalStorage();
  }, []);

  // Save to localStorage on booking data change
  useEffect(() => {
    if (bookingData.companion || bookingData.selectedDate) {
      saveToLocalStorage();
    }
  }, [bookingData]);

  const updateBookingData = useCallback((data: Partial<BookingData>) => {
    setBookingData(prev => {
      const updated = { ...prev, ...data };

      // Auto-calculate prices when relevant data changes
      if (data.selectedService || data.duration || data.companion) {
        const baseRate = updated.companion?.hourlyRate || 0;
        const serviceModifier = updated.selectedService?.priceModifier || 1;
        const duration = updated.duration || 1;

        const subtotal = baseRate * serviceModifier * duration;
        const platformFee = subtotal * PLATFORM_FEE_PERCENTAGE;

        updated.totalPrice = subtotal;
        updated.platformFee = platformFee;
        updated.companionEarnings = subtotal - platformFee;
      }

      return updated;
    });
  }, []);

  const resetBookingData = useCallback(() => {
    setBookingData(initialBookingData);
    setCurrentStep(1);
    setError(null);
    clearAvailabilityCache();
    clearSession();
  }, []);

  const nextStep = useCallback(() => {
    if (canProceedToNext()) {
      setCurrentStep(prev => Math.min(prev + 1, totalSteps));
      setError(null);
    } else {
      setError('Please complete all required fields before proceeding');
      toast.error('Please complete all required fields');
    }
  }, [currentStep, bookingData]);

  const previousStep = useCallback(() => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
    setError(null);
  }, []);

  const goToStep = useCallback((step: number) => {
    if (step >= 1 && step <= totalSteps) {
      // Validate all previous steps
      for (let i = 1; i < step; i++) {
        if (!isStepValid(i)) {
          setError(`Please complete step ${i} first`);
          toast.error(`Please complete step ${i} first`);
          return;
        }
      }
      setCurrentStep(step);
      setError(null);
    }
  }, [bookingData]);

  const fetchAvailability = useCallback(async (companionId: number, date: Date) => {
    // Format date in local timezone to avoid timezone shift
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    const cacheKey = `${companionId}-${dateStr}`;

    // Check cache first
    const cached = availabilityCache[cacheKey];
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    try {
      setIsLoading(true);
      const response = await bookingApi.getCompanionAvailability(companionId, dateStr);

      // Cache the result
      setAvailabilityCache(prev => ({
        ...prev,
        [cacheKey]: {
          data: response,
          timestamp: Date.now()
        }
      }));

      return response;
    } catch (error: any) {
      console.error('Error fetching availability:', error);
      setError('Failed to fetch availability');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [availabilityCache]);

  const clearAvailabilityCache = useCallback(() => {
    setAvailabilityCache({});
  }, []);

  const calculateTotalPrice = useCallback(() => {
    if (!bookingData.companion) return 0;

    const baseRate = bookingData.companion.hourlyRate;
    const duration = bookingData.duration || 1;
    const serviceModifier = bookingData.selectedService?.priceModifier || 1;

    let total = baseRate * duration * serviceModifier;

    // Add additional services
    if (bookingData.additionalServices) {
      bookingData.additionalServices.forEach(service => {
        total += service.basePrice;
      });
    }

    return total;
  }, [bookingData]);

  const calculatePlatformFee = useCallback((total: number) => {
    return total * PLATFORM_FEE_PERCENTAGE;
  }, []);

  const isStepValid = useCallback((step: number): boolean => {
    switch (step) {
      case 1: // Date & Time
        return !!(bookingData.selectedDate && bookingData.selectedTimeSlot);

      case 2: // Service Selection
        return !!(bookingData.selectedService);

      case 3: // Review
        return !!(bookingData.totalPrice && bookingData.totalPrice > 0);

      case 4: // Payment
        return true; // Handled by payment component

      default:
        return false;
    }
  }, [bookingData]);

  const canProceedToNext = useCallback(() => {
    return isStepValid(currentStep);
  }, [currentStep, isStepValid]);

  const submitBooking = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Validate all required fields
      if (!bookingData.companionId || !bookingData.selectedDate || !bookingData.selectedTimeSlot) {
        throw new Error('Missing required booking information');
      }

      // Format date in local timezone to avoid timezone shift
      const year = bookingData.selectedDate.getFullYear();
      const month = String(bookingData.selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(bookingData.selectedDate.getDate()).padStart(2, '0');
      const localDateString = `${year}-${month}-${day}`;

      const bookingPayload: BookingFormData = {
        companionId: bookingData.companionId!,
        bookingDate: localDateString, // Use local date, not UTC
        startTime: bookingData.selectedTimeSlot.startTime,
        endTime: bookingData.selectedTimeSlot.endTime,
        specialRequests: bookingData.specialRequests,
        meetingLocation: bookingData.meetingLocation,
        meetingType: bookingData.meetingType,
        serviceCategoryId: bookingData.selectedService?.id
      };

      const response = await bookingApi.createBooking(bookingPayload);

      // Response is returned directly from the API
      updateBookingData({
        bookingReference: response.bookingId?.toString(),
        bookingStatus: 'pending'
      });

      // Clear session after successful booking
      setTimeout(() => {
        clearSession();
      }, 5000);

      return response;
    } catch (error: any) {
      console.error('Booking submission error:', error);
      setError(error.message || 'Failed to submit booking');
      toast.error(error.message || 'Failed to submit booking');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [bookingData]);

  const saveToLocalStorage = useCallback(() => {
    try {
      const sessionData = {
        bookingData,
        currentStep,
        timestamp: Date.now()
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sessionData));
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }
  }, [bookingData, currentStep]);

  const loadFromLocalStorage = useCallback(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const sessionData = JSON.parse(stored);

        // Check if session is still valid (24 hours)
        const isExpired = Date.now() - sessionData.timestamp > 24 * 60 * 60 * 1000;

        if (!isExpired && sessionData.bookingData) {
          // Convert date strings back to Date objects
          if (sessionData.bookingData.selectedDate) {
            sessionData.bookingData.selectedDate = new Date(sessionData.bookingData.selectedDate);
          }

          setBookingData(sessionData.bookingData);
          setCurrentStep(sessionData.currentStep || 1);

          toast.success('Previous booking session restored');
        } else {
          clearSession();
        }
      }
    } catch (error) {
      console.error('Failed to load from localStorage:', error);
      clearSession();
    }
  }, []);

  const clearSession = useCallback(() => {
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear localStorage:', error);
    }
  }, []);

  const value: BookingContextType = {
    bookingData,
    currentStep,
    totalSteps,
    updateBookingData,
    resetBookingData,
    nextStep,
    previousStep,
    goToStep,
    availabilityCache,
    fetchAvailability,
    clearAvailabilityCache,
    calculateTotalPrice,
    calculatePlatformFee,
    isStepValid,
    canProceedToNext,
    isLoading,
    setIsLoading,
    error,
    setError,
    submitBooking,
    saveToLocalStorage,
    loadFromLocalStorage,
    clearSession
  };

  return (
    <BookingContext.Provider value={value}>
      {children}
    </BookingContext.Provider>
  );
};

export default BookingContext;