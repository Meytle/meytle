-- Migration: Add timezone columns and convert times to UTC
-- Purpose: Store all times in UTC, track user timezones
-- Date: 2025-11-23

-- Step 1: Add timezone column to companion_availability
ALTER TABLE companion_availability
ADD COLUMN companion_timezone VARCHAR(50) DEFAULT 'UTC' AFTER end_time;

-- Step 2: Add timezone columns to bookings (client_timezone and companion_timezone)
ALTER TABLE bookings
ADD COLUMN client_timezone VARCHAR(50) DEFAULT 'UTC' AFTER booking_timezone,
ADD COLUMN companion_timezone_stored VARCHAR(50) DEFAULT 'UTC' AFTER client_timezone;

-- Step 3: Add timezone column to custom_booking_requests if not exists
ALTER TABLE custom_booking_requests
ADD COLUMN IF NOT EXISTS client_timezone VARCHAR(50) DEFAULT 'UTC' AFTER end_time,
ADD COLUMN IF NOT EXISTS companion_timezone VARCHAR(50) DEFAULT 'UTC' AFTER client_timezone;

-- Step 4: Update existing companion_availability times from IST (UTC+5:30) to UTC
-- WARNING: This assumes existing times are in IST. Adjust if different.
-- Example: 19:00 IST -> 13:30 UTC (subtract 5 hours 30 minutes)

-- For now, we'll add a flag to mark which records have been migrated
ALTER TABLE companion_availability
ADD COLUMN is_utc TINYINT(1) DEFAULT 0 AFTER companion_timezone;

-- Mark all existing records as NOT migrated (need manual review)
UPDATE companion_availability SET is_utc = 0 WHERE is_utc IS NULL;

-- Step 5: Add index on timezone columns for better query performance
CREATE INDEX idx_companion_availability_timezone ON companion_availability(companion_timezone);
CREATE INDEX idx_bookings_client_timezone ON bookings(client_timezone);
CREATE INDEX idx_bookings_companion_timezone ON bookings(companion_timezone_stored);

-- Step 6: Verify booking_verification table has UTC timestamps
-- (No changes needed - DATETIME columns are already UTC by default in our setup)

-- Notes for manual migration:
-- 1. Identify the timezone of each companion from their address
-- 2. Convert their availability times from local to UTC
-- 3. Update companion_timezone column
-- 4. Set is_utc = 1 after conversion
-- 
-- Example query to convert IST to UTC:
-- UPDATE companion_availability 
-- SET 
--   start_time = SUBTIME(start_time, '05:30:00'),
--   end_time = SUBTIME(end_time, '05:30:00'),
--   companion_timezone = 'Asia/Kolkata',
--   is_utc = 1
-- WHERE companion_id = ? AND is_utc = 0;

