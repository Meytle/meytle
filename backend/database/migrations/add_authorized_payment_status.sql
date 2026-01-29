-- Migration: Add 'authorized' status to payment_status ENUM
-- This represents when payment is authorized (card hold) but not yet captured
-- Date: 2025-11-22

-- Update bookings table
ALTER TABLE bookings 
MODIFY COLUMN payment_status ENUM('unpaid','pending','authorized','paid','failed','refunded','cancelled') 
DEFAULT 'unpaid';

-- Update booking_requests table  
ALTER TABLE booking_requests 
MODIFY COLUMN payment_status ENUM('pending','authorized','paid','failed','refunded') 
DEFAULT 'pending';

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings(payment_status);
CREATE INDEX IF NOT EXISTS idx_booking_requests_payment_status ON booking_requests(payment_status);

