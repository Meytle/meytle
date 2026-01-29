-- Add confirmed_at column to bookings table
-- This tracks when a companion confirmed/approved a booking

ALTER TABLE bookings 
ADD COLUMN confirmed_at DATETIME DEFAULT NULL AFTER status;

-- Add index for performance
CREATE INDEX idx_confirmed_at ON bookings(confirmed_at);

-- Update existing confirmed bookings to set confirmed_at = updated_at
UPDATE bookings 
SET confirmed_at = updated_at 
WHERE status = 'confirmed' AND confirmed_at IS NULL;

