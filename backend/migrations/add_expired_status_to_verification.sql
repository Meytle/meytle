-- Add 'expired' status to booking_verification.verification_status ENUM
-- This is used when the OTP verification window expires (10 minutes after meeting start)

ALTER TABLE booking_verification
MODIFY COLUMN verification_status ENUM('pending', 'verified', 'failed', 'expired') DEFAULT 'pending';

