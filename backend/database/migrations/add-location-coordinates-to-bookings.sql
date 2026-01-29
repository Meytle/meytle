-- Add location coordinates to bookings table
-- This brings the bookings table in line with booking_requests table
-- Allows proper storage of verified map locations

ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS meeting_location_lat DECIMAL(10, 8) NULL AFTER meeting_location,
ADD COLUMN IF NOT EXISTS meeting_location_lon DECIMAL(11, 8) NULL AFTER meeting_location_lat,
ADD COLUMN IF NOT EXISTS meeting_location_place_id VARCHAR(255) NULL AFTER meeting_location_lon;

-- Add index for location-based queries
CREATE INDEX IF NOT EXISTS idx_bookings_location 
ON bookings(meeting_location_lat, meeting_location_lon);

