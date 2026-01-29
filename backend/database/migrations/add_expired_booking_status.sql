-- Migration: Add 'expired' status to booking status ENUM
-- This represents bookings that expired because companion didn't approve before meeting time
-- Date: 2025-11-22

-- Update bookings table to include 'expired' status
ALTER TABLE bookings 
MODIFY COLUMN status ENUM('pending','confirmed','completed','cancelled','no_show','expired') 
DEFAULT 'pending';

-- Add index for performance (check if exists first)
CREATE INDEX idx_bookings_status ON bookings(status);

-- Note: Expired bookings are automatically created by the booking expiry scheduler
-- when a pending booking is not approved before the meeting start time

