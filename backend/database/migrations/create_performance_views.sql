-- Database Views for Complex Repeated Queries
-- Optional views to simplify complex queries and improve performance

-- View for booking details with all related information
CREATE OR REPLACE VIEW booking_details_view AS
SELECT 
  b.id,
  b.client_id,
  b.companion_id,
  b.booking_date,
  b.start_time,
  b.end_time,
  b.duration_hours,
  b.total_amount,
  b.status,
  b.special_requests,
  b.meeting_location,
  b.meeting_type,
  b.created_at,
  b.updated_at,
  b.service_category_id,
  b.cancelled_by,
  b.cancellation_reason,
  b.cancelled_at,
  companion.name as companion_name,
  companion.email as companion_email,
  companion.average_rating as companion_rating,
  companion.review_count as companion_review_count,
  client.name as client_name,
  client.email as client_email,
  sc.name as service_name,
  sc.base_price as service_base_price,
  ca.profile_photo_url as companion_photo
FROM bookings b
JOIN users companion ON b.companion_id = companion.id
JOIN users client ON b.client_id = client.id
LEFT JOIN service_categories sc ON b.service_category_id = sc.id
LEFT JOIN companion_applications ca ON companion.id = ca.user_id;

-- View for companion profiles with all details
CREATE OR REPLACE VIEW companion_profiles_view AS
SELECT 
  u.id as companion_id,
  u.name,
  u.email,
  u.average_rating,
  u.review_count,
  u.created_at as joined_date,
  ca.profile_photo_url,
  ca.date_of_birth,
  ca.bio,
  ca.city,
  ca.state,
  ca.country,
  ca.services_offered,
  ca.languages,
  ca.hourly_rate,
  ca.status as application_status,
  TIMESTAMPDIFF(YEAR, ca.date_of_birth, CURDATE()) as age,
  (SELECT COUNT(*) FROM bookings WHERE companion_id = u.id AND status = 'completed') as completed_bookings,
  (SELECT COUNT(DISTINCT day_of_week) FROM companion_availability WHERE companion_id = u.id AND is_available = TRUE) as days_available
FROM users u
JOIN companion_applications ca ON u.id = ca.user_id
JOIN user_roles ur ON u.id = ur.user_id AND ur.role = 'companion' AND ur.is_active = TRUE
WHERE ca.status = 'approved';

-- View for review statistics per companion
CREATE OR REPLACE VIEW companion_review_stats_view AS
SELECT 
  reviewee_id as companion_id,
  COUNT(*) as total_reviews,
  ROUND(AVG(rating), 1) as average_rating,
  SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as five_star_count,
  SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as four_star_count,
  SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as three_star_count,
  SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as two_star_count,
  SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as one_star_count,
  MAX(created_at) as last_review_date
FROM booking_reviews
GROUP BY reviewee_id;

-- View for upcoming bookings
CREATE OR REPLACE VIEW upcoming_bookings_view AS
SELECT 
  b.id,
  b.client_id,
  b.companion_id,
  b.booking_date,
  b.start_time,
  b.end_time,
  b.status,
  b.meeting_location,
  b.meeting_type,
  companion.name as companion_name,
  client.name as client_name,
  CONCAT(b.booking_date, ' ', b.start_time) as booking_datetime
FROM bookings b
JOIN users companion ON b.companion_id = companion.id
JOIN users client ON b.client_id = client.id
WHERE b.booking_date >= CURDATE()
  AND b.status IN ('pending', 'confirmed')
ORDER BY b.booking_date, b.start_time;

-- View for pending booking requests
CREATE OR REPLACE VIEW pending_booking_requests_view AS
SELECT 
  br.id,
  br.client_id,
  br.companion_id,
  br.requested_date,
  br.preferred_time,
  br.start_time,
  br.end_time,
  br.duration_hours,
  br.meeting_type,
  br.special_requests,
  br.created_at,
  br.expires_at,
  client.name as client_name,
  client.email as client_email,
  companion.name as companion_name,
  companion.email as companion_email,
  sc.name as service_name
FROM booking_requests br
JOIN users client ON br.client_id = client.id
JOIN users companion ON br.companion_id = companion.id
LEFT JOIN service_categories sc ON br.service_category_id = sc.id
WHERE br.status = 'pending'
  AND br.expires_at > NOW()
ORDER BY br.created_at DESC;

-- View for companion availability summary
CREATE OR REPLACE VIEW companion_availability_summary_view AS
SELECT 
  companion_id,
  COUNT(*) as total_slots,
  COUNT(DISTINCT day_of_week) as available_days,
  GROUP_CONCAT(DISTINCT day_of_week ORDER BY 
    CASE day_of_week
      WHEN 'monday' THEN 1
      WHEN 'tuesday' THEN 2
      WHEN 'wednesday' THEN 3
      WHEN 'thursday' THEN 4
      WHEN 'friday' THEN 5
      WHEN 'saturday' THEN 6
      WHEN 'sunday' THEN 7
    END
  ) as available_days_list
FROM companion_availability
WHERE is_available = TRUE
GROUP BY companion_id;

-- View for user activity summary
CREATE OR REPLACE VIEW user_activity_summary_view AS
SELECT 
  u.id as user_id,
  u.name,
  u.email,
  u.role,
  u.created_at as joined_date,
  (SELECT COUNT(*) FROM bookings WHERE client_id = u.id) as total_bookings_as_client,
  (SELECT COUNT(*) FROM bookings WHERE companion_id = u.id) as total_bookings_as_companion,
  (SELECT COUNT(*) FROM booking_reviews WHERE reviewer_id = u.id) as reviews_given,
  (SELECT COUNT(*) FROM booking_reviews WHERE reviewee_id = u.id) as reviews_received,
  (SELECT COUNT(*) FROM notifications WHERE user_id = u.id AND is_read = FALSE) as unread_notifications,
  (SELECT MAX(created_at) FROM bookings WHERE client_id = u.id OR companion_id = u.id) as last_booking_date
FROM users u;

-- Note: Views are created with CREATE OR REPLACE to allow re-running this migration
-- IF your MySQL version doesn't support CREATE OR REPLACE VIEW, use DROP VIEW IF EXISTS before CREATE VIEW

