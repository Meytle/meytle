-- ============================================
-- DATABASE MIGRATION: Fix Missing Columns
-- Date: 2024-11-10
-- Purpose: Add missing columns that cause 500 errors
-- ============================================

USE meytle_db;

-- ============================================
-- 1. Add 'gender' column to client_verifications
-- ============================================
SET @gender_exists = (
    SELECT COUNT(*) 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = 'meytle_db' 
    AND TABLE_NAME = 'client_verifications' 
    AND COLUMN_NAME = 'gender'
);

SET @sql_gender = IF(
    @gender_exists = 0,
    'ALTER TABLE client_verifications ADD COLUMN gender ENUM(''male'', ''female'', ''other'', ''prefer_not_to_say'') NULL AFTER bio',
    'SELECT ''Column gender already exists in client_verifications'' AS status'
);

PREPARE stmt_gender FROM @sql_gender;
EXECUTE stmt_gender;
DEALLOCATE PREPARE stmt_gender;

-- ============================================
-- 2. Add 'service_type' column to bookings (if missing)
-- ============================================
SET @service_type_exists = (
    SELECT COUNT(*) 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = 'meytle_db' 
    AND TABLE_NAME = 'bookings' 
    AND COLUMN_NAME = 'service_type'
);

SET @sql_service_type = IF(
    @service_type_exists = 0,
    'ALTER TABLE bookings ADD COLUMN service_type VARCHAR(255) NULL AFTER service_category_id',
    'SELECT ''Column service_type already exists in bookings'' AS status'
);

PREPARE stmt_service_type FROM @sql_service_type;
EXECUTE stmt_service_type;
DEALLOCATE PREPARE stmt_service_type;

-- ============================================
-- 3. Verify columns were added
-- ============================================
SELECT 
    'client_verifications' AS table_name,
    COLUMN_NAME AS column_name,
    COLUMN_TYPE AS column_type,
    IS_NULLABLE AS is_nullable
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = 'meytle_db' 
AND TABLE_NAME = 'client_verifications' 
AND COLUMN_NAME = 'gender'

UNION ALL

SELECT 
    'bookings' AS table_name,
    COLUMN_NAME AS column_name,
    COLUMN_TYPE AS column_type,
    IS_NULLABLE AS is_nullable
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = 'meytle_db' 
AND TABLE_NAME = 'bookings' 
AND COLUMN_NAME = 'service_type';

-- ============================================
-- Done!
-- ============================================

