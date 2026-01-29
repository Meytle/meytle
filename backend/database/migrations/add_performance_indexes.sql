-- Database Performance Optimization
-- Adds indexes for frequently queried columns

-- Bookings table indexes
-- Index for companion bookings by date and status
CREATE INDEX IF NOT EXISTS idx_bookings_companion_date_status 
  ON bookings(companion_id, booking_date, status);

-- Index for client bookings by date and status
CREATE INDEX IF NOT EXISTS idx_bookings_client_date_status 
  ON bookings(client_id, booking_date, status);

-- Index for finding booking conflicts (companion, date, time range)
CREATE INDEX IF NOT EXISTS idx_bookings_companion_datetime 
  ON bookings(companion_id, booking_date, start_time, end_time);

-- Index for booking status queries
CREATE INDEX IF NOT EXISTS idx_bookings_status 
  ON bookings(status, booking_date);

-- Index for pending bookings
CREATE INDEX IF NOT EXISTS idx_bookings_companion_status 
  ON bookings(companion_id, status);

-- Booking requests table indexes
-- Index for companion's incoming requests
CREATE INDEX IF NOT EXISTS idx_booking_requests_companion_status 
  ON booking_requests(companion_id, status, created_at DESC);

-- Index for client's sent requests
CREATE INDEX IF NOT EXISTS idx_booking_requests_client_status 
  ON booking_requests(client_id, status, created_at DESC);

-- Index for expired requests cleanup
CREATE INDEX IF NOT EXISTS idx_booking_requests_expires 
  ON booking_requests(expires_at, status);

-- Companion availability table indexes
-- Index for finding availability by companion and day
CREATE INDEX IF NOT EXISTS idx_companion_availability_companion_day 
  ON companion_availability(companion_id, day_of_week, is_available);

-- Index for finding available companions
CREATE INDEX IF NOT EXISTS idx_companion_availability_day_time 
  ON companion_availability(day_of_week, start_time, end_time, is_available);

-- Booking reviews table indexes
-- Index for companion reviews
CREATE INDEX IF NOT EXISTS idx_booking_reviews_reviewee 
  ON booking_reviews(reviewee_id, created_at DESC);

-- Index for checking if booking has review
CREATE INDEX IF NOT EXISTS idx_booking_reviews_booking 
  ON booking_reviews(booking_id);

-- Index for reviewer's reviews
CREATE INDEX IF NOT EXISTS idx_booking_reviews_reviewer 
  ON booking_reviews(reviewer_id, created_at DESC);

-- Index for rating queries
CREATE INDEX IF NOT EXISTS idx_booking_reviews_rating 
  ON booking_reviews(reviewee_id, rating);

-- Notifications table indexes
-- Index for user notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_read 
  ON notifications(user_id, is_read, created_at DESC);

-- Index for unread count
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread 
  ON notifications(user_id, is_read);

-- Index for notification type filtering
CREATE INDEX IF NOT EXISTS idx_notifications_type 
  ON notifications(user_id, type, created_at DESC);

-- Companion applications table indexes
-- Index for application status queries
CREATE INDEX IF NOT EXISTS idx_companion_applications_status 
  ON companion_applications(status, created_at DESC);

-- Index for user application lookup
CREATE INDEX IF NOT EXISTS idx_companion_applications_user 
  ON companion_applications(user_id, status);

-- User roles table indexes
-- Index for role lookup
CREATE INDEX IF NOT EXISTS idx_user_roles_user_role 
  ON user_roles(user_id, role, is_active);

-- Index for active roles
CREATE INDEX IF NOT EXISTS idx_user_roles_active 
  ON user_roles(role, is_active);

-- Companion interests table indexes
-- Index for companion interests
CREATE INDEX IF NOT EXISTS idx_companion_interests_companion 
  ON companion_interests(companion_id);

-- Index for interest search
CREATE INDEX IF NOT EXISTS idx_companion_interests_interest 
  ON companion_interests(interest_name, companion_id);

-- Favorite companions table indexes  
-- Index for user's favorites
CREATE INDEX IF NOT EXISTS idx_favorite_companions_user 
  ON favorite_companions(user_id, created_at DESC);

-- Index for checking if favorite exists
CREATE INDEX IF NOT EXISTS idx_favorite_companions_pair 
  ON favorite_companions(user_id, companion_id);

-- Service categories table indexes
-- Index for active categories
CREATE INDEX IF NOT EXISTS idx_service_categories_active 
  ON service_categories(is_active, name);

-- Availability audit log indexes
-- Index for companion audit history
CREATE INDEX IF NOT EXISTS idx_availability_audit_companion 
  ON availability_audit_log(companion_id, created_at DESC);

-- Messages table indexes (if exists)
CREATE INDEX IF NOT EXISTS idx_messages_sender 
  ON messages(sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_receiver 
  ON messages(receiver_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation 
  ON messages(sender_id, receiver_id, created_at);

-- Users table indexes for common queries
-- Index for email login
CREATE INDEX IF NOT EXISTS idx_users_email 
  ON users(email);

-- Index for role queries
CREATE INDEX IF NOT EXISTS idx_users_role 
  ON users(role);

-- Index for rating queries
CREATE INDEX IF NOT EXISTS idx_users_rating 
  ON users(average_rating DESC, review_count DESC);

-- Notification preferences index
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user 
  ON notification_preferences(user_id);

-- Composite index for booking search with multiple criteria
CREATE INDEX IF NOT EXISTS idx_bookings_search 
  ON bookings(companion_id, booking_date, status, start_time);

CREATE INDEX IF NOT EXISTS idx_bookings_client_search 
  ON bookings(client_id, booking_date, status, start_time);

