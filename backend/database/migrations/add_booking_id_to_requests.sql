-- Add booking_id column to link booking_requests to bookings
-- This allows tracking which booking was created from which custom request

ALTER TABLE booking_requests
ADD COLUMN booking_id INT NULL AFTER id,
ADD FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
ADD INDEX idx_booking_id (booking_id);

