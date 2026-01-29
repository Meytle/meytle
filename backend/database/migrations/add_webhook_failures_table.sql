-- Add webhook_failures table for monitoring and debugging
-- This table stores all failed webhook events for manual review and retry

USE meetgo_db;

CREATE TABLE IF NOT EXISTS webhook_failures (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(255) NOT NULL COMMENT 'Stripe event type (e.g., payment_intent.succeeded)',
  event_id VARCHAR(255) NULL COMMENT 'Stripe event ID',
  provider VARCHAR(50) NOT NULL DEFAULT 'stripe' COMMENT 'Webhook provider (stripe, veriff, etc.)',
  payload JSON NULL COMMENT 'Full webhook payload',
  error_message TEXT NULL COMMENT 'Error message when processing failed',
  error_stack TEXT NULL COMMENT 'Full error stack trace',
  retry_count INT DEFAULT 0 COMMENT 'Number of retry attempts',
  last_retry_at TIMESTAMP NULL COMMENT 'Last retry attempt timestamp',
  resolved BOOLEAN DEFAULT FALSE COMMENT 'Whether the failure was manually resolved',
  resolved_at TIMESTAMP NULL COMMENT 'When the failure was resolved',
  resolved_by INT NULL COMMENT 'Admin user who resolved it',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_event_type (event_type),
  INDEX idx_provider (provider),
  INDEX idx_resolved (resolved),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Stores failed webhook events for monitoring and debugging';

-- Show table structure
DESCRIBE webhook_failures;

