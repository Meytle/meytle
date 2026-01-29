-- Add missing columns to booking_requests table
-- These columns are needed for storing location coordinates and service type

ALTER TABLE booking_requests 
ADD COLUMN IF NOT EXISTS meeting_location_lat DECIMAL(10, 8) NULL AFTER meeting_location,
ADD COLUMN IF NOT EXISTS meeting_location_lon DECIMAL(11, 8) NULL AFTER meeting_location_lat,
ADD COLUMN IF NOT EXISTS meeting_location_place_id VARCHAR(255) NULL AFTER meeting_location_lon;

-- Note: service_type column already exists in the schema, but may need to be added if missing
-- Check if it exists first, then add if needed

