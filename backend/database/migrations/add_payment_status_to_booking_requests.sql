-- Add payment_status column to booking_requests table
-- This tracks whether payment has been authorized for custom booking requests

ALTER TABLE booking_requests 
ADD COLUMN payment_status ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending' 
AFTER status;

ALTER TABLE booking_requests 
ADD COLUMN payment_intent_id VARCHAR(255) NULL 
AFTER payment_status;

ALTER TABLE booking_requests 
ADD INDEX idx_payment_status (payment_status);

-- Update existing rows to 'pending' status (if any exist)
UPDATE booking_requests 
SET payment_status = 'pending' 
WHERE payment_status IS NULL;

