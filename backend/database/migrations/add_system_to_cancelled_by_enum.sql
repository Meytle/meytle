-- Add 'system' value to cancelled_by ENUM
-- This allows automated schedulers to cancel bookings

-- ISSUE: bookingExpiryScheduler.js was failing silently because it tried to set
--        cancelled_by = 'system' but the ENUM only allowed 'client' or 'companion'
-- 
-- RESULT: Payments were cancelled in Stripe, but booking status wasn't updated,
--         causing bookings to appear as "confirmed" even though payment was cancelled

ALTER TABLE bookings 
MODIFY COLUMN cancelled_by ENUM('client', 'companion', 'system') DEFAULT NULL;

-- Verify the change
SHOW COLUMNS FROM bookings LIKE 'cancelled_by';

