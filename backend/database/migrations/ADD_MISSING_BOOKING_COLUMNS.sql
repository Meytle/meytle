-- ================================================================
-- Add Missing Columns to Bookings Table
-- Run these queries to fix the 500 error
-- ================================================================

-- Add service_type column
ALTER TABLE bookings 
ADD COLUMN service_type VARCHAR(255) NULL AFTER duration_hours;

-- Add hourly_rate column
ALTER TABLE bookings 
ADD COLUMN hourly_rate DECIMAL(10,2) NULL AFTER service_type;

-- Add base_amount column
ALTER TABLE bookings 
ADD COLUMN base_amount DECIMAL(10,2) NULL AFTER hourly_rate;

-- Add extra_amount column
ALTER TABLE bookings 
ADD COLUMN extra_amount DECIMAL(10,2) DEFAULT 0 AFTER base_amount;

-- Add currency column
ALTER TABLE bookings 
ADD COLUMN currency VARCHAR(3) DEFAULT 'USD' AFTER total_amount;

-- Add meeting location coordinates
ALTER TABLE bookings 
ADD COLUMN meeting_location_lat DECIMAL(10, 8) NULL AFTER meeting_location;

ALTER TABLE bookings 
ADD COLUMN meeting_location_lon DECIMAL(11, 8) NULL AFTER meeting_location_lat;

ALTER TABLE bookings 
ADD COLUMN meeting_location_place_id VARCHAR(255) NULL AFTER meeting_location_lon;

-- Verify the columns were added
DESCRIBE bookings;

-- ================================================================
-- DONE! Now restart your backend server and try accepting a request
-- ================================================================

