-- Add 'review' to notifications type ENUM
ALTER TABLE notifications 
MODIFY COLUMN type ENUM('booking', 'application', 'payment', 'account', 'system', 'review') NOT NULL;

-- Verify the change
DESCRIBE notifications;

