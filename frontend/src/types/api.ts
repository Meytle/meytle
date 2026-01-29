/**
 * API Response Type Definitions
 * These interfaces match the exact snake_case field names returned by the backend API
 * DO NOT use these directly in components - use the transformed types from frontend.ts instead
 */

// ============= BOOKING TYPES =============

export interface ApiBooking {
  id: number;
  booking_date: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  total_amount: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  special_requests?: string;
  meeting_location?: string;
  meeting_type?: string;
  created_at: string;
  payment_status?: string;
  payment_method?: string;
  payment_intent_id?: string;
  paid_at?: string;
  service_category_id?: number;
  service_category_name?: string;
  service_category_price?: number;
  platform_fee_amount?: number;
  transfer_id?: string;
  transfer_status?: string;
  has_review?: boolean;
  companion_name?: string;
  companion_email?: string;
  companion_photo?: string;
  client_name?: string;
  client_email?: string;
  client_id?: number;
  companion_id?: number;
}

export interface ApiBookingRequest {
  id: number;
  client_id: number;
  companion_id: number;
  requested_date: string;
  preferred_time?: string;
  duration_hours: number;
  service_category_id?: number;
  meeting_type: 'in_person' | 'virtual';
  special_requests?: string;
  meeting_location?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  companion_response?: string;
  suggested_date?: string;
  suggested_start_time?: string;
  suggested_end_time?: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
  responded_at?: string;
  client_name?: string;
  client_email?: string;
  client_photo?: string;
  companion_name?: string;
  companion_email?: string;
  companion_photo?: string;
  service_category_name?: string;
  service_price?: number;
}

export interface ApiBookingReview {
  id: number;
  rating: number;
  review_text: string;
  created_at: string;
  reviewer_name: string;
  reviewer_photo?: string;
  booking_date: string;
  service_id?: number;
}

// ============= AVAILABILITY TYPES =============

export interface ApiAvailabilitySlot {
  id?: number | string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  is_available: boolean;
  services?: string[] | string;
  companion_id?: number;
}

// ============= USER/APPLICATION TYPES =============

export interface ApiUser {
  id: number;
  name: string;
  email: string;
  role: string;
  active_role?: string;
  created_at: string;
  email_verified?: boolean;
}

export interface ApiCompanionApplication {
  id: number;
  user_id: number;
  name: string;
  email: string;
  profile_photo_url: string;
  government_id_url: string;
  date_of_birth: string;
  government_id_number: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  created_at: string;
  hourly_rate?: number;
  services_offered?: string[];
  joined_date?: string;
}

export interface ApiClientVerification {
  id: number;
  user_id: number;
  profile_photo_url?: string;
  id_document_url?: string;
  date_of_birth?: string;
  government_id_number?: string;
  phone_number?: string;
  location?: string;
  address_line?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  bio?: string;
  verification_status: 'not_submitted' | 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  verified_at?: string;
  reviewed_at?: string;
  created_at?: string;
  updated_at?: string;
}

// ============= COMPANION TYPES =============

export interface ApiCompanion {
  id: number;
  name: string;
  email?: string;
  age: number;
  location: string;
  description?: string;
  bio?: string;
  rating: number;
  review_count: number;
  response_time: string;
  image_url?: string;
  profile_photo_url?: string;
  is_verified: boolean;
  is_available: boolean;
  interests: string[];
  services?: string[];
  joined_date?: string;
  services_offered?: string[];
  languages?: string[];
  hourly_rate?: number;
}

// ============= NOTIFICATION TYPES =============

export interface ApiNotification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: string;
  action_url?: string;
  is_read: boolean;
  read_at?: string;
  created_at: string;
}

export interface ApiNotificationPreferences {
  email_enabled: boolean;
  push_enabled: boolean;
  booking_notifications: boolean;
  payment_notifications: boolean;
  marketing_notifications: boolean;
}

// ============= SERVICE CATEGORY TYPES =============

export interface ApiServiceCategory {
  id: number;
  name: string;
  description?: string;
  base_price: number;
  is_active: boolean;
}

// ============= FAVORITE TYPES =============

export interface ApiFavoriteCompanion {
  id: number;
  name: string;
  age?: number;
  location?: string;
  bio?: string;
  profile_photo_url?: string;
  hourly_rate?: number;
  average_rating?: number;
  review_count?: number;
  is_verified?: boolean;
  favorited_at: string;
}

// ============= DASHBOARD STATS TYPES =============

export interface ApiDashboardStats {
  users: {
    total: number;
    clients: number;
    companions: number;
  };
  pending_applications: number;
  pending_client_verifications: number;
  bookings: {
    total: number;
    avg_rating: number;
  };
  earnings: {
    total: number;
    commission: number;
  };
}

// ============= STRIPE TYPES =============

export interface ApiStripeAccount {
  account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  status?: string;
  requirements?: {
    currently_due: string[];
    eventually_due: string[];
    past_due: string[];
  };
}