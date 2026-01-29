-- Add GPS location tracking for OTP verification
-- This allows us to verify users were actually at the meeting location

ALTER TABLE booking_verification
ADD COLUMN client_verified_at DATETIME DEFAULT NULL COMMENT 'When client verified their OTP',
ADD COLUMN client_verification_lat DECIMAL(10, 8) DEFAULT NULL COMMENT 'Client GPS latitude at verification',
ADD COLUMN client_verification_lon DECIMAL(11, 8) DEFAULT NULL COMMENT 'Client GPS longitude at verification',
ADD COLUMN companion_verified_at DATETIME DEFAULT NULL COMMENT 'When companion verified their OTP',
ADD COLUMN companion_verification_lat DECIMAL(10, 8) DEFAULT NULL COMMENT 'Companion GPS latitude at verification',
ADD COLUMN companion_verification_lon DECIMAL(11, 8) DEFAULT NULL COMMENT 'Companion GPS longitude at verification',
ADD COLUMN both_verified_at DATETIME DEFAULT NULL COMMENT 'When both parties successfully verified';

-- Add index for faster verification status lookups
CREATE INDEX idx_verification_status ON booking_verification(verification_status, both_verified_at);

