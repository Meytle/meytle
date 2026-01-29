-- Check if the booking was created
SELECT 
  b.id,
  b.client_id,
  b.companion_id,
  b.booking_date,
  b.start_time,
  b.end_time,
  b.service_type,
  b.total_amount,
  b.currency,
  b.status,
  b.created_at,
  c.name as client_name,
  comp.name as companion_name
FROM bookings b
JOIN users c ON b.client_id = c.id
JOIN users comp ON b.companion_id = comp.id
WHERE b.id = 5;

-- Check the custom time request status
SELECT 
  id,
  client_id,
  companion_id,
  requested_date,
  start_time,
  end_time,
  service_type,
  status,
  created_at
FROM booking_requests
WHERE id = 6 OR id = 7;

-- Check notifications
SELECT 
  id,
  user_id,
  type,
  title,
  message,
  is_read,
  created_at
FROM notifications
ORDER BY created_at DESC
LIMIT 5;

