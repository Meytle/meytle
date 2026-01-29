-- Add payment-related columns to bookings table
-- Run this script to add all missing payment columns

USE meetgo_db;

-- Add payment_intent_id
ALTER TABLE bookings ADD COLUMN payment_intent_id VARCHAR(255) AFTER status;

-- Add payment_status
ALTER TABLE bookings ADD COLUMN payment_status ENUM('unpaid','pending','paid','failed','refunded','cancelled') DEFAULT 'unpaid' AFTER payment_intent_id;

-- Add paid_at
ALTER TABLE bookings ADD COLUMN paid_at TIMESTAMP NULL AFTER payment_status;

-- Add payment_released_at
ALTER TABLE bookings ADD COLUMN payment_released_at TIMESTAMP NULL AFTER paid_at;

-- Add transfer_id
ALTER TABLE bookings ADD COLUMN transfer_id VARCHAR(255) AFTER payment_released_at;

-- Add platform_fee_amount
ALTER TABLE bookings ADD COLUMN platform_fee_amount DECIMAL(10,2) AFTER transfer_id;

-- Add transfer_status
ALTER TABLE bookings ADD COLUMN transfer_status ENUM('pending','completed','failed') AFTER platform_fee_amount;

-- Add capture_failure_reason
ALTER TABLE bookings ADD COLUMN capture_failure_reason TEXT AFTER transfer_status;

-- Add refund_amount
ALTER TABLE bookings ADD COLUMN refund_amount DECIMAL(10,2) AFTER capture_failure_reason;

-- Add refunded_at
ALTER TABLE bookings ADD COLUMN refunded_at TIMESTAMP NULL AFTER refund_amount;

-- Add cancellation_fee
ALTER TABLE bookings ADD COLUMN cancellation_fee DECIMAL(10,2) AFTER refunded_at;

-- Show final structure
SHOW COLUMNS FROM bookings LIKE 'payment%';

