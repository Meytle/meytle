-- Add timezone tracking columns for user location-based timezone detection
-- This migration adds columns to support automatic timezone detection from user's current address

-- Add timezone tracking columns
ALTER TABLE users
ADD COLUMN user_timezone VARCHAR(50) DEFAULT 'UTC' COMMENT 'IANA timezone (e.g., Asia/Kolkata, America/New_York)',
ADD COLUMN current_lat DECIMAL(10, 8) NULL COMMENT 'Current address latitude for timezone detection',
ADD COLUMN current_lon DECIMAL(11, 8) NULL COMMENT 'Current address longitude for timezone detection';

-- Add index for timezone queries (improves performance when filtering by timezone)
CREATE INDEX idx_user_timezone ON users (user_timezone);

