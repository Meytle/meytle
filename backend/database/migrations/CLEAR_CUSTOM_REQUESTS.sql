-- ================================================================
-- Clear All Custom Booking Requests and Related Data
-- Run these queries in your MySQL database to start fresh
-- ================================================================

-- 1. First, check what you have (OPTIONAL - just to see before deleting)
SELECT COUNT(*) as total_requests FROM booking_requests;
SELECT COUNT(*) as total_bookings FROM bookings WHERE service_type = 'Custom Request' OR service_type LIKE '%Custom%';

-- ================================================================
-- DELETION QUERIES (Run these to clear the data)
-- ================================================================

-- 2. Delete all booking requests
DELETE FROM booking_requests;

-- 3. (OPTIONAL) If you also want to delete bookings created from custom requests
-- WARNING: Only uncomment if you want to delete ALL bookings with 'Custom Request' service type
-- DELETE FROM bookings WHERE service_type = 'Custom Request' OR service_type LIKE '%Custom%';

-- 4. (OPTIONAL) If you want to delete ALL bookings (not recommended unless testing)
-- WARNING: This deletes ALL bookings in the system
-- DELETE FROM bookings;

-- 5. Reset auto-increment IDs (OPTIONAL - starts IDs from 1 again)
ALTER TABLE booking_requests AUTO_INCREMENT = 1;
-- ALTER TABLE bookings AUTO_INCREMENT = 1;

-- ================================================================
-- VERIFY DELETION (Run these to confirm everything is cleared)
-- ================================================================

-- 6. Verify booking_requests table is empty
SELECT COUNT(*) as remaining_requests FROM booking_requests;

-- 7. Verify custom bookings are cleared (if you deleted them)
-- SELECT COUNT(*) as remaining_custom_bookings FROM bookings WHERE service_type = 'Custom Request';

-- ================================================================
-- DONE! You can now test with fresh custom booking requests
-- ================================================================

