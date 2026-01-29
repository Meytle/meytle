-- Add booking_timezone column to bookings table
-- This stores the timezone for each booking to handle proper time display

ALTER TABLE bookings
ADD COLUMN booking_timezone VARCHAR(100) DEFAULT 'UTC' AFTER meeting_type;

