/**
 * Core type definitions for the application
 * Centralized types to avoid duplication and ensure consistency
 */

export type UserRole = 'client' | 'companion' | 'admin';

export interface User {
  id: number;
  name: string;
  email: string;
  role: string; // For compatibility with some responses
  roles?: UserRole[];
  activeRole?: UserRole;
  emailVerified?: boolean;
  createdAt?: string;
  profilePicture?: string;
  additionalPhoto?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  verificationStatus?: 'not_submitted' | 'pending' | 'approved' | 'rejected';
  timezone?: string; // IANA timezone (e.g., "Asia/Kolkata")
  userTimezone?: string; // Alternative field name used in some responses
  addressLat?: number;
  addressLon?: number;
}

export interface SignUpData {
  name: string;
  email: string;
  password: string;
  roles: UserRole[];
}

export interface SignInData {
  email: string;
  password: string;
}

export interface AuthResponse {
  status: string;
  token: string;
  data: {
    user: User;
  };
}

export interface SignUpFormData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  roles: UserRole[];
}

// Service/Activity Types
export interface Service {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  isPopular?: boolean;
}

export interface Interest {
  id: number;
  name: string;
  icon?: string;
}

export interface Companion {
  id: number;
  name: string;
  email?: string;
  age: number;
  gender?: string;
  location: string;
  city?: string;
  state?: string;
  country?: string;
  description?: string;
  bio?: string;
  rating: number;
  averageRating?: number | string; // Backend returns this as string, but can be number
  reviewCount: number;
  responseTime: string;
  imageUrl?: string;
  profilePhotoUrl?: string;
  additionalPhoto1Url?: string;
  additionalPhoto2Url?: string;
  isVerified: boolean;
  isAvailable: boolean;
  interests: string[];
  services?: string[];
  joinedDate?: string;
  servicesOffered?: string[];
  languages?: string[];
  hourlyRate?: number;
  addressLat?: number | null;
  addressLon?: number | null;
}

export interface Booking {
  id: number;
  companionId?: number;
  clientId?: number;
  bookingDate: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  totalAmount: number;
  status: 'pending' | 'payment_held' | 'confirmed' | 'meeting_started' | 'cancelled' | 'completed' | 'no_show';
  specialRequests?: string;
  meetingLocation?: string;
  meetingType?: string;
  createdAt: string;
  paymentStatus?: string;
  paymentMethod?: string;
  paymentIntentId?: string;
  paidAt?: string;
  serviceCategoryId?: number;
  serviceCategoryName?: string;
  serviceCategoryPrice?: number;
  customServiceName?: string;
  customServiceDescription?: string;
  isCustomService?: boolean;
  platformFeeAmount?: number;
  transferId?: string;
  transferStatus?: string;
  hasReview?: boolean;
  hasCompanionReview?: boolean;
  companionName?: string;
  companionEmail?: string;
  companionPhoto?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhoto?: string;
  cancelledBy?: 'client' | 'companion';
  cancellationReason?: string;
  cancelledAt?: string;
}

export interface Message {
  id: number;
  bookingId: number;
  senderId: number;
  receiverId: number;
  messageText: string;
  createdAt: string;
  readAt?: string;
}

export interface AvailabilitySlot {
  id?: number | string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  services?: string[] | string;
}

export interface TimeSlot {
  startTime: string;
  endTime: string;
}

export interface BookingFormData {
  companionId: number;
  bookingDate: string;
  startTime: string;
  endTime: string;
  specialRequests?: string;
  meetingLocation?: string;
  meetingLocationLat?: number;
  meetingLocationLon?: number;
  meetingLocationPlaceId?: number;
  meetingType?: MeetingType;
  serviceCategoryId?: number;
  bookingTimezone?: string; // User's timezone when booking was created (e.g., "Asia/Kolkata")
  customService?: {
    name: string;
    description?: string;
  };
}

export interface RoleSwitchData {
  role: UserRole;
}

export interface InterestData {
  interests: string[];
}

// Service Category Types
export interface ServiceCategory {
  id: number;
  name: string;
  description?: string;
  basePrice: number;
  isActive: boolean;
}

export interface ServiceCategoryFormData {
  name: string;
  description?: string;
  basePrice: number;
}

// Meeting types
export type MeetingType = 'in_person' | 'virtual';

// Booking Date Info
export interface BookingDateInfo {
  date: string;
  bookings: Array<{
    id: number;
    bookingDate: string;
    startTime: string;
    endTime: string;
    status: string;
  }>;
  bookingCount: number;
  isFullyBooked: boolean;
  isPartiallyBooked: boolean;
}

// Payment Update Data
export interface PaymentUpdateData {
  paymentStatus: string;
  paymentMethod: string;
  paymentIntentId?: string;
}

// Stripe Account
export interface StripeAccount {
  accountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  status?: string;
  requirements?: {
    currentlyDue: string[];
    eventuallyDue: string[];
    pastDue: string[];
  };
}

// Profile Update Data
export interface UpdateProfileData {
  name?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  addressLat?: number;
  addressLon?: number;
  profilePicture?: string;
  additionalPhoto?: string;
  bio?: string;
  interests?: string[];
}

// Profile Completion Status
export interface ProfileCompletionStatus {
  hasProfilePicture: boolean;
  hasAdditionalPhoto: boolean;
  hasAddress: boolean;
  hasBio: boolean;
  hasInterests: boolean;
  completionPercentage: number;
}

// Create Booking Response
export interface CreateBookingResponse {
  bookingId: number;
  totalAmount: number;
  durationHours: number;
  clientSecret?: string;
  requiresPayment?: boolean;
}

// Get Bookings Response
export interface GetBookingsResponse {
  bookings: Booking[];
  userTimezone?: string;
}

