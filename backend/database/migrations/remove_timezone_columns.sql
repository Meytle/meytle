-- Remove timezone-related columns that are no longer used
-- These columns were storing timezone data but it was never being read/used

-- 1. Remove booking_timezone from bookings table
ALTER TABLE bookings
DROP COLUMN IF EXISTS booking_timezone;

-- 2. Remove timezone from users table
ALTER TABLE users
DROP COLUMN IF EXISTS timezone;

-- 3. Remove address coordinates from client_verifications (only used for timezone detection)
ALTER TABLE client_verifications
DROP COLUMN IF EXISTS address_lat,
DROP COLUMN IF EXISTS address_lon;

-- 4. Remove address coordinates from companion_applications (only used for timezone detection)
ALTER TABLE companion_applications
DROP COLUMN IF EXISTS address_lat,
DROP COLUMN IF EXISTS address_lon;

