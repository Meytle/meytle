/**
 * Database Configuration and Connection
 */

const mysql = require('mysql2');
const logger = require('../services/logger');
const { ENABLE_VERBOSE_DB_LOGGING, dbLog } = require('./database-logging-wrapper');

// Database configuration - no hardcoded passwords allowed
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD, // No default - must be provided
  database: process.env.DB_NAME || 'meytle_db',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 50, // Reasonable limit to prevent memory issues
  decimalNumbers: true,
  // Additional pool settings for better performance
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
};

// Create connection pool with error handling
const pool = mysql.createPool(dbConfig);

// Get promise-based pool
const promisePool = pool.promise();

// Pool event handlers for monitoring
// Only log verbose pool operations in debug mode

pool.on('connection', (connection) => {
  // Only log in verbose mode
  if (ENABLE_VERBOSE_DB_LOGGING) {
    logger.info('New database connection established', { operation: 'pool', threadId: connection.threadId });
  }

  // Set session variables for better performance
  connection.query("SET time_zone = '+00:00'");
  connection.query('SET SESSION sql_mode = "STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION"');
});

pool.on('acquire', (connection) => {
  // Only log in verbose mode - these fire on every query and create noise
  if (ENABLE_VERBOSE_DB_LOGGING) {
    logger.debug('Connection acquired from pool', { operation: 'pool', threadId: connection.threadId });
  }
});

pool.on('release', (connection) => {
  // Only log in verbose mode - these fire on every query and create noise
  if (ENABLE_VERBOSE_DB_LOGGING) {
    logger.debug('Connection released back to pool', { operation: 'pool', threadId: connection.threadId });
  }
});

pool.on('enqueue', () => {
  // Always log when waiting for connections - this indicates pool exhaustion
  logger.warn('Waiting for available connection slot - pool may be exhausted', { operation: 'pool' });
});

// Handle pool errors
pool.on('error', (err) => {
  logger.dbError('pool', err, null);
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    logger.dbError('pool', new Error('Database connection was closed'), null);
  }
  if (err.code === 'ER_CON_COUNT_ERROR') {
    logger.dbError('pool', new Error('Database has too many connections'), null);
  }
  if (err.code === 'ECONNREFUSED') {
    logger.dbError('pool', new Error('Database connection was refused'), null);
  }
});

// Test database connection with retry logic
const testConnection = async (retries = 3, delay = 5000) => {
  for (let i = 0; i < retries; i++) {
    try {
      const connection = await mysql.createConnection({
        host: dbConfig.host,
        user: dbConfig.user,
        password: dbConfig.password,
        port: dbConfig.port,
        connectTimeout: 10000 // 10 second timeout
      });

      await connection.promise().query('SELECT 1');
      logger.dbInfo('testConnection', 'MySQL Server connected successfully', {});
      await connection.end();
      return true;
    } catch (error) {
      logger.dbError('testConnection', error, null, { attempt: i + 1, retries });

      if (i < retries - 1) {
        logger.dbInfo('testConnection', `Retrying in ${delay / 1000} seconds`, { attempt: i + 1 });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  logger.dbError('testConnection', new Error(`Could not establish database connection after ${retries} attempts`), null);
  return false;
};

// Health check function for monitoring
const checkPoolHealth = async () => {
  try {
    const result = await promisePool.query('SELECT 1');
    const poolStats = {
      allConnections: pool._allConnections.length,
      freeConnections: pool._freeConnections.length,
      connectionQueue: pool._connectionQueue.length,
      isHealthy: true
    };
    return poolStats;
  } catch (error) {
    return {
      isHealthy: false,
      error: error.message
    };
  }
};

// Graceful shutdown handler
const closePool = async () => {
  try {
    await promisePool.end();
    logger.dbInfo('closePool', 'Database pool closed gracefully', {});
  } catch (error) {
    logger.dbError('closePool', error, null);
  }
};

// Initialize database schema
const initializeDatabase = async () => {
  const startTime = Date.now();
  dbLog.summary('Initializing database schema...', { operation: 'initializeDatabase' });
  
  try {
    // Create database if it doesn't exist
    const connection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      port: dbConfig.port
    });

    await connection.promise().query(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`);
    dbLog.info('initializeDatabase', `Database '${dbConfig.database}' ready`, {});
    await connection.end();

    // Create users table
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('client', 'companion', 'admin') NOT NULL DEFAULT 'client',
        email_verified BOOLEAN NOT NULL DEFAULT FALSE,
        email_verification_token VARCHAR(255) NULL,
        email_verification_expires TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_role (role),
        INDEX idx_email_verified (email_verified),
        INDEX idx_verification_token (email_verification_token)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    dbLog.info('initializeDatabase', 'Users table ready', {});

    // Ensure users table has email verification columns and indexes (for existing databases)
    try {
      // Check and add columns conditionally without IF NOT EXISTS (for older MySQL versions)
      const dbName = dbConfig.database;

      const [[{ count_verified }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_verified FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email_verified'`,
        [dbName]
      );
      if (Number(count_verified) === 0) {
        await promisePool.query(
          `ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE`
        );
      }

      const [[{ count_token }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_token FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email_verification_token'`,
        [dbName]
      );
      if (Number(count_token) === 0) {
        await promisePool.query(
          `ALTER TABLE users ADD COLUMN email_verification_token VARCHAR(255) NULL`
        );
      }

      const [[{ count_expires }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_expires FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email_verification_expires'`,
        [dbName]
      );
      if (Number(count_expires) === 0) {
        await promisePool.query(
          `ALTER TABLE users ADD COLUMN email_verification_expires TIMESTAMP NULL`
        );
      }

      // Check and add indexes conditionally
      const [[{ idx_verified }]] = await promisePool.query(
        `SELECT COUNT(*) AS idx_verified FROM information_schema.STATISTICS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_email_verified'`,
        [dbName]
      );
      if (Number(idx_verified) === 0) {
        await promisePool.query(
          `ALTER TABLE users ADD INDEX idx_email_verified (email_verified)`
        );
      }

      const [[{ idx_token }]] = await promisePool.query(
        `SELECT COUNT(*) AS idx_token FROM information_schema.STATISTICS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_verification_token'`,
        [dbName]
      );
      if (Number(idx_token) === 0) {
        await promisePool.query(
          `ALTER TABLE users ADD INDEX idx_verification_token (email_verification_token)`
        );
      }
    } catch (migrationError) {
      logger.dbError('initializeDatabase', migrationError, null, { migration: 'users_table' });
    }

    // Add review-related columns to users table
    try {
      const [reviewColumns] = await promisePool.query(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'users'
         AND COLUMN_NAME IN ('average_rating', 'review_count')`,
        [dbConfig.database]
      );

      const existingReviewColumns = reviewColumns.map(col => col.COLUMN_NAME);

      if (!existingReviewColumns.includes('average_rating')) {
        await promisePool.query(
          `ALTER TABLE users
           ADD COLUMN average_rating DECIMAL(2,1) DEFAULT 0.0`
        );
        logger.dbInfo('Added average_rating column to users table', { operation: 'initializeDatabase' });
      }

      if (!existingReviewColumns.includes('review_count')) {
        await promisePool.query(
          `ALTER TABLE users
           ADD COLUMN review_count INT DEFAULT 0`
        );
        logger.dbInfo('Added review_count column to users table', { operation: 'initializeDatabase' });
      }

      // Add index for companion rating queries (check if exists first)
      try {
        const [indexExists] = await promisePool.query(
          `SELECT COUNT(1) IndexExists
           FROM INFORMATION_SCHEMA.STATISTICS
           WHERE table_schema = DATABASE()
           AND table_name = 'users'
           AND index_name = 'idx_users_rating'`
        );

        if (!indexExists[0].IndexExists) {
          await promisePool.query(
            `CREATE INDEX idx_users_rating ON users(average_rating, review_count)`
          );
          logger.dbInfo('Added idx_users_rating index to users table', { operation: 'initializeDatabase' });
        }
      } catch (indexError) {
        // Index might already exist, ignore the error
        logger.dbInfo('Index idx_users_rating might already exist', { operation: 'initializeDatabase' });
      }

    } catch (reviewMigrationError) {
      logger.dbError('initializeDatabase', reviewMigrationError, null, { migration: 'review_columns' });
    }

    // Add profile_picture column to users table
    try {
      const [[{ count_profile_picture }]] = await promisePool.query(
        `SELECT COUNT(*) as count_profile_picture FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'profile_picture'`,
        [dbConfig.database]
      );
      
      if (Number(count_profile_picture) === 0) {
        await promisePool.query(
          `ALTER TABLE users ADD COLUMN profile_picture VARCHAR(500) NULL`
        );
        dbLog.info('initializeDatabase', 'Added profile_picture column to users table', {});
      }
    } catch (profilePictureError) {
      if (profilePictureError.code !== 'ER_DUP_FIELDNAME') {
        logger.dbError('initializeDatabase', profilePictureError, null, { migration: 'profile_picture' });
      }
    }

    // Add address fields to users table for profile completion
    try {
      const addressFields = ['address', 'city', 'state', 'zip_code'];
      
      for (const field of addressFields) {
        const [[{ count }]] = await promisePool.query(
          `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
          [dbConfig.database, field]
        );
        
        if (Number(count) === 0) {
          await promisePool.query(
            `ALTER TABLE users ADD COLUMN ${field} VARCHAR(255) NULL`
          );
          dbLog.info('initializeDatabase', `Added ${field} column to users table`, {});
        }
      }
    } catch (addressError) {
      if (addressError.code !== 'ER_DUP_FIELDNAME') {
        logger.dbError('initializeDatabase', addressError, null, { migration: 'address_fields' });
      }
    }

    // Add ban/suspend fields to users table for admin user management
    try {
      // Whitelist of valid ban field definitions to prevent DDL injection
      const VALID_BAN_FIELDS = {
        'is_banned': 'BOOLEAN DEFAULT FALSE',
        'ban_reason': 'VARCHAR(500) NULL',
        'banned_at': 'TIMESTAMP NULL',
        'ban_expires_at': 'TIMESTAMP NULL',
        'banned_by': 'INT NULL'
      };

      const banFields = [
        { name: 'is_banned', type: 'BOOLEAN DEFAULT FALSE' },
        { name: 'ban_reason', type: 'VARCHAR(500) NULL' },
        { name: 'banned_at', type: 'TIMESTAMP NULL' },
        { name: 'ban_expires_at', type: 'TIMESTAMP NULL' },
        { name: 'banned_by', type: 'INT NULL' }
      ];

      for (const field of banFields) {
        // Validate field against whitelist before any DDL execution
        if (!VALID_BAN_FIELDS[field.name] || VALID_BAN_FIELDS[field.name] !== field.type) {
          throw new Error(`Invalid ban field definition: ${field.name}`);
        }

        const [[{ count }]] = await promisePool.query(
          `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
          [dbConfig.database, field.name]
        );

        if (Number(count) === 0) {
          // Escape column name with backticks (strip any existing backticks to prevent injection)
          const escapedName = '`' + field.name.replace(/`/g, '') + '`';
          await promisePool.query(
            `ALTER TABLE users ADD COLUMN ${escapedName} ${field.type}`
          );
          dbLog.info('initializeDatabase', `Added ${field.name} column to users table`, {});
        }
      }

      // Add index for banned users queries
      try {
        const [[{ idx_banned }]] = await promisePool.query(
          `SELECT COUNT(*) AS idx_banned FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_banned'`,
          [dbConfig.database]
        );
        if (Number(idx_banned) === 0) {
          await promisePool.query(
            `ALTER TABLE users ADD INDEX idx_users_banned (is_banned)`
          );
          dbLog.info('initializeDatabase', 'Added idx_users_banned index to users table', {});
        }
      } catch (indexError) {
        // Index might already exist
      }
    } catch (banError) {
      if (banError.code !== 'ER_DUP_FIELDNAME') {
        logger.dbError('initializeDatabase', banError, null, { migration: 'ban_fields' });
      }
    }

    // Add Stripe-related columns to users table for companion payouts
    try {
      const dbName = dbConfig.database;

      // Whitelist of valid Stripe field definitions
      const VALID_STRIPE_FIELDS = {
        'stripe_account_id': 'VARCHAR(255) NULL',
        'stripe_account_status': "ENUM('not_created', 'pending', 'active', 'restricted', 'rejected') DEFAULT 'not_created'",
        'stripe_onboarding_completed': 'BOOLEAN DEFAULT FALSE'
      };

      const stripeFields = [
        { name: 'stripe_account_id', type: 'VARCHAR(255) NULL' },
        { name: 'stripe_account_status', type: "ENUM('not_created', 'pending', 'active', 'restricted', 'rejected') DEFAULT 'not_created'" },
        { name: 'stripe_onboarding_completed', type: 'BOOLEAN DEFAULT FALSE' }
      ];

      for (const field of stripeFields) {
        // Validate field against whitelist
        if (!VALID_STRIPE_FIELDS[field.name] || VALID_STRIPE_FIELDS[field.name] !== field.type) {
          throw new Error(`Invalid stripe field definition: ${field.name}`);
        }

        const [[{ count }]] = await promisePool.query(
          `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
          [dbName, field.name]
        );

        if (Number(count) === 0) {
          const escapedName = '`' + field.name.replace(/`/g, '') + '`';
          await promisePool.query(
            `ALTER TABLE users ADD COLUMN ${escapedName} ${field.type}`
          );
          dbLog.info('initializeDatabase', `Added ${field.name} column to users table`, {});
        }
      }

      // Add index for stripe_account_id
      const [[{ idx_stripe }]] = await promisePool.query(
        `SELECT COUNT(*) AS idx_stripe FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_stripe_account'`,
        [dbName]
      );
      if (Number(idx_stripe) === 0) {
        await promisePool.query(
          `ALTER TABLE users ADD INDEX idx_users_stripe_account (stripe_account_id)`
        );
        dbLog.info('initializeDatabase', 'Added idx_users_stripe_account index to users table', {});
      }
    } catch (stripeError) {
      if (stripeError.code !== 'ER_DUP_FIELDNAME') {
        logger.dbError('initializeDatabase', stripeError, null, { migration: 'users_stripe_fields' });
      }
    }

    // Create companion_applications table
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS companion_applications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        profile_photo_url VARCHAR(500),
        government_id_url VARCHAR(500),
        date_of_birth DATE NOT NULL,
        government_id_number VARCHAR(100),
        phone_number VARCHAR(50),
        address_line VARCHAR(255),
        city VARCHAR(100),
        state VARCHAR(100),
        country VARCHAR(100),
        postal_code VARCHAR(20),
        bio TEXT,
        services_offered TEXT,
        languages TEXT,
        hourly_rate DECIMAL(10,2) DEFAULT 25.00,
        status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
        rejection_reason TEXT,
        reviewed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    // Alter table to make government_id_number and address fields nullable (if table already exists)
    try {
      await promisePool.query(`
        ALTER TABLE companion_applications 
        MODIFY COLUMN government_id_number VARCHAR(100) NULL,
        MODIFY COLUMN address_line VARCHAR(255) NULL,
        MODIFY COLUMN city VARCHAR(100) NULL,
        MODIFY COLUMN state VARCHAR(100) NULL,
        MODIFY COLUMN country VARCHAR(100) NULL,
        MODIFY COLUMN postal_code VARCHAR(20) NULL
      `);
      dbLog.info('initializeDatabase', 'Companion applications table columns updated to nullable', {});
    } catch (alterError) {
      // If ALTER fails (columns already nullable or don't exist), that's okay
      dbLog.info('initializeDatabase', 'ALTER TABLE skipped (columns may already be correct)', { error: alterError.message });
    }
    
    // Add missing columns if they don't exist (one by one to handle existing columns gracefully)
    const columnsToAdd = [
      { name: 'phone_number', definition: 'VARCHAR(50) NULL' },
      { name: 'services_offered', definition: 'TEXT NULL' },
      { name: 'languages', definition: 'TEXT NULL' },
      { name: 'hourly_rate', definition: 'DECIMAL(10,2) DEFAULT 25.00' },
      { name: 'additional_photo_1_url', definition: 'VARCHAR(500) NULL' },
      { name: 'additional_photo_2_url', definition: 'VARCHAR(500) NULL' },
      { name: 'verification_status', definition: "ENUM('not_started', 'pending', 'approved', 'rejected') DEFAULT 'not_started'" },
      { name: 'veriff_session_id', definition: 'VARCHAR(255) NULL' },
      { name: 'verification_completed_at', definition: 'TIMESTAMP NULL' }
    ];
    
    for (const column of columnsToAdd) {
      try {
        await promisePool.query(`ALTER TABLE companion_applications ADD COLUMN ${column.name} ${column.definition}`);
        dbLog.info('initializeDatabase', `Added column ${column.name} to companion_applications`, {});
      } catch (addColError) {
        // Column already exists (ER_DUP_FIELDNAME) or other error - that's okay
        if (addColError.code === 'ER_DUP_FIELDNAME') {
          dbLog.info('initializeDatabase', `Column ${column.name} already exists`, {});
        } else {
          dbLog.info('initializeDatabase', `Could not add column ${column.name}`, { error: addColError.message });
        }
      }
    }
    
    dbLog.info('initializeDatabase', 'Companion applications table ready', {});

    // Create client_verifications table
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS client_verifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        profile_photo_url VARCHAR(500),
        id_document_url VARCHAR(500),
        date_of_birth DATE,
        government_id_number VARCHAR(100),
        phone_number VARCHAR(50),
        location VARCHAR(255),
        address_line VARCHAR(255),
        city VARCHAR(100),
        state VARCHAR(100),
        country VARCHAR(100),
        postal_code VARCHAR(20),
        bio TEXT,
        gender ENUM('male', 'female', 'other', 'prefer_not_to_say') NULL,
        verification_status ENUM('not_submitted', 'pending', 'approved', 'rejected') NOT NULL DEFAULT 'not_submitted',
        rejection_reason TEXT,
        verified_at TIMESTAMP NULL,
        reviewed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_verification_status (verification_status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    dbLog.info('initializeDatabase', 'Client verifications table ready', {});

    // Add new columns to existing client_verifications table (migration)
    try {
      const dbName = dbConfig.database;

      // Add address_line column
      const [[{ count_address_line }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_address_line FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'client_verifications' AND COLUMN_NAME = 'address_line'`,
        [dbName]
      );
      if (Number(count_address_line) === 0) {
        await promisePool.query(
          `ALTER TABLE client_verifications ADD COLUMN address_line VARCHAR(255) NULL AFTER location`
        );
        dbLog.info('initializeDatabase', 'Added address_line column to client_verifications', {});
      }

      // Add city column
      const [[{ count_city }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_city FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'client_verifications' AND COLUMN_NAME = 'city'`,
        [dbName]
      );
      if (Number(count_city) === 0) {
        await promisePool.query(
          `ALTER TABLE client_verifications ADD COLUMN city VARCHAR(100) NULL AFTER address_line`
        );
        dbLog.info('initializeDatabase', 'Added city column to client_verifications', {});
      }

      // Add state column
      const [[{ count_state }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_state FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'client_verifications' AND COLUMN_NAME = 'state'`,
        [dbName]
      );
      if (Number(count_state) === 0) {
        await promisePool.query(
          `ALTER TABLE client_verifications ADD COLUMN state VARCHAR(100) NULL AFTER city`
        );
        dbLog.info('initializeDatabase', 'Added state column to client_verifications', {});
      }

      // Add country column
      const [[{ count_country }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_country FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'client_verifications' AND COLUMN_NAME = 'country'`,
        [dbName]
      );
      if (Number(count_country) === 0) {
        await promisePool.query(
          `ALTER TABLE client_verifications ADD COLUMN country VARCHAR(100) NULL AFTER state`
        );
        dbLog.info('initializeDatabase', 'Added country column to client_verifications', {});
      }

      // Add postal_code column
      const [[{ count_postal }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_postal FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'client_verifications' AND COLUMN_NAME = 'postal_code'`,
        [dbName]
      );
      if (Number(count_postal) === 0) {
        await promisePool.query(
          `ALTER TABLE client_verifications ADD COLUMN postal_code VARCHAR(20) NULL AFTER country`
        );
        dbLog.info('initializeDatabase', 'Added postal_code column to client_verifications', {});
      }

      // Add rejection_reason column
      const [[{ count_rejection }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_rejection FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'client_verifications' AND COLUMN_NAME = 'rejection_reason'`,
        [dbName]
      );
      if (Number(count_rejection) === 0) {
        await promisePool.query(
          `ALTER TABLE client_verifications ADD COLUMN rejection_reason TEXT NULL AFTER verification_status`
        );
        dbLog.info('initializeDatabase', 'Added rejection_reason column to client_verifications', {});
      }

      // Add reviewed_at column
      const [[{ count_reviewed }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_reviewed FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'client_verifications' AND COLUMN_NAME = 'reviewed_at'`,
        [dbName]
      );
      if (Number(count_reviewed) === 0) {
        await promisePool.query(
          `ALTER TABLE client_verifications ADD COLUMN reviewed_at TIMESTAMP NULL AFTER verified_at`
        );
        dbLog.info('initializeDatabase', 'Added reviewed_at column to client_verifications', {});
      }

    } catch (migrationError) {
      logger.dbError('initializeDatabase', migrationError, null, { migration: 'client_verifications_table' });
    }

    // Create companion_availability table
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS companion_availability (
        id INT AUTO_INCREMENT PRIMARY KEY,
        companion_id INT NOT NULL,
        day_of_week ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday') NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        is_available BOOLEAN NOT NULL DEFAULT TRUE,
        services JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (companion_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_companion_id (companion_id),
        INDEX idx_day_of_week (day_of_week),
        UNIQUE KEY unique_companion_day_time (companion_id, day_of_week, start_time)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    dbLog.info('initializeDatabase', 'Companion availability table ready', {});

    // Add services column to existing companion_availability table (migration)
    try {
      const dbName = dbConfig.database;
      const [[{ count_services }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_services FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companion_availability' AND COLUMN_NAME = 'services'`,
        [dbName]
      );
      if (Number(count_services) === 0) {
        await promisePool.query(
          `ALTER TABLE companion_availability ADD COLUMN services JSON NULL`
        );
        dbLog.info('initializeDatabase', 'Added services column to companion_availability table', {});
      }
    } catch (migrationError) {
      logger.dbError('initializeDatabase', migrationError, null, { migration: 'companion_availability_services' });
    }

    // Create service_categories table
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS service_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT NULL,
        base_price DECIMAL(10,2) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_is_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    dbLog.info('initializeDatabase', 'Service categories table ready', {});

    // Drop redundant idx_name index if it exists (migration for existing databases)
    try {
      const dbName = dbConfig.database;
      const [[{ idx_name_exists }]] = await promisePool.query(
        `SELECT COUNT(*) AS idx_name_exists FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'service_categories' AND INDEX_NAME = 'idx_name'`,
        [dbName]
      );
      if (Number(idx_name_exists) > 0) {
        await promisePool.query(
          `ALTER TABLE service_categories DROP INDEX idx_name`
        );
        dbLog.info('initializeDatabase', 'Dropped redundant idx_name index from service_categories', {});
      }
    } catch (migrationError) {
      logger.dbError('initializeDatabase', migrationError, null, { migration: 'drop_idx_name' });
    }

    // Create bookings table
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        companion_id INT NOT NULL,
        booking_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        duration_hours DECIMAL(3,1) NOT NULL,
        service_type VARCHAR(255) NULL,
        hourly_rate DECIMAL(10,2) NULL,
        base_amount DECIMAL(10,2) NULL,
        extra_amount DECIMAL(10,2) DEFAULT 0,
        total_amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'USD',
        status ENUM('pending', 'pending_payment', 'payment_held', 'confirmed', 'meeting_started', 'completed', 'cancelled', 'rejected', 'no_show', 'expired') NOT NULL DEFAULT 'pending',
        special_requests TEXT,
        meeting_location VARCHAR(255),
        meeting_location_lat DECIMAL(10, 8) NULL,
        meeting_location_lon DECIMAL(11, 8) NULL,
        meeting_location_place_id VARCHAR(255) NULL,
        meeting_type ENUM('in_person', 'virtual') NULL DEFAULT 'in_person',
        payment_status ENUM('unpaid', 'pending', 'authorized', 'paid', 'failed', 'refunded', 'cancelled') NULL DEFAULT 'unpaid',
        payment_method VARCHAR(50) NULL,
        payment_intent_id VARCHAR(255) NULL,
        paid_at TIMESTAMP NULL,
        service_category_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (companion_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (service_category_id) REFERENCES service_categories(id) ON DELETE SET NULL,
        CONSTRAINT chk_no_self_booking CHECK (client_id != companion_id),
        INDEX idx_client_id (client_id),
        INDEX idx_companion_id (companion_id),
        INDEX idx_booking_date (booking_date),
        INDEX idx_status (status),
        INDEX idx_created_at (created_at),
        INDEX idx_service_category_id (service_category_id),
        INDEX idx_payment_status (payment_status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    dbLog.info('initializeDatabase', 'Bookings table ready', {});

    // Create booking_requests table for when no time slots are available
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS booking_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        booking_id INT NULL,
        client_id INT NOT NULL,
        companion_id INT NOT NULL,
        requested_date DATE NOT NULL,
        preferred_time VARCHAR(100) NULL,
        start_time TIME NULL,
        end_time TIME NULL,
        duration_hours INT DEFAULT 1,
        service_category_id INT NULL,
        service_type VARCHAR(255) NULL,
        extra_amount DECIMAL(10, 2) DEFAULT 0,
        meeting_type ENUM('in_person', 'virtual') DEFAULT 'in_person',
        special_requests TEXT NULL,
        meeting_location VARCHAR(255) NULL,
        meeting_location_lat DECIMAL(10, 8) NULL,
        meeting_location_lon DECIMAL(11, 8) NULL,
        meeting_location_place_id VARCHAR(255) NULL,
        status ENUM('pending', 'accepted', 'rejected', 'expired') DEFAULT 'pending',
        companion_response TEXT NULL,
        suggested_date DATE NULL,
        suggested_start_time TIME NULL,
        suggested_end_time TIME NULL,
        expires_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        responded_at TIMESTAMP NULL,
        FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (companion_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (service_category_id) REFERENCES service_categories(id) ON DELETE SET NULL,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
        INDEX idx_client_id (client_id),
        INDEX idx_companion_id (companion_id),
        INDEX idx_status (status),
        INDEX idx_requested_date (requested_date),
        INDEX idx_created_at (created_at),
        INDEX idx_booking_id (booking_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    dbLog.info('initializeDatabase', 'Booking requests table ready', {});

    // Check if booking_id column exists in booking_requests (migration for existing databases)
    const [bookingIdColumn] = await promisePool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'booking_requests' 
        AND COLUMN_NAME = 'booking_id'
    `);

    if (bookingIdColumn.length === 0) {
      await promisePool.query(`
        ALTER TABLE booking_requests 
        ADD COLUMN booking_id INT NULL AFTER id,
        ADD FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
        ADD INDEX idx_booking_id (booking_id)
      `);
      dbLog.info('initializeDatabase', 'Added booking_id column to booking_requests table', {});
    }

    // Create booking_verification table for OTP and location verification
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS booking_verification (
        id INT AUTO_INCREMENT PRIMARY KEY,
        booking_id INT NOT NULL UNIQUE,
        client_otp VARCHAR(6) NOT NULL,
        companion_otp VARCHAR(6) NOT NULL,
        otp_sent_at TIMESTAMP NULL,
        client_otp_entered BOOLEAN DEFAULT FALSE,
        companion_otp_entered BOOLEAN DEFAULT FALSE,
        verification_status ENUM('pending', 'verified', 'failed', 'expired') DEFAULT 'pending',
        client_location_lat DECIMAL(10,8) NULL,
        client_location_lon DECIMAL(11,8) NULL,
        companion_location_lat DECIMAL(10,8) NULL,
        companion_location_lon DECIMAL(11,8) NULL,
        location_verified BOOLEAN DEFAULT FALSE,
        distance_from_meeting_client DECIMAL(10,2) NULL COMMENT 'Distance in meters',
        distance_from_meeting_companion DECIMAL(10,2) NULL COMMENT 'Distance in meters',
        verified_at TIMESTAMP NULL,
        failed_reason TEXT NULL,
        otp_attempt_count_client INT DEFAULT 0,
        otp_attempt_count_companion INT DEFAULT 0,
        client_verified_at TIMESTAMP NULL,
        companion_verified_at TIMESTAMP NULL,
        client_verification_lat DECIMAL(10,8) NULL,
        client_verification_lon DECIMAL(11,8) NULL,
        companion_verification_lat DECIMAL(10,8) NULL,
        companion_verification_lon DECIMAL(11,8) NULL,
        both_verified_at TIMESTAMP NULL,
        extension_used BOOLEAN DEFAULT FALSE,
        extension_requested_by ENUM('client', 'companion') NULL,
        extension_requested_at TIMESTAMP NULL,
        verification_deadline TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
        INDEX idx_booking_id (booking_id),
        INDEX idx_verification_status (verification_status),
        INDEX idx_otp_sent_at (otp_sent_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    dbLog.info('initializeDatabase', 'Booking verification table ready', {});

    // Add extension columns to booking_verification if they don't exist (migration)
    const extensionColumns = [
      { name: 'extension_used', definition: 'BOOLEAN DEFAULT FALSE' },
      { name: 'extension_requested_by', definition: "ENUM('client', 'companion') NULL" },
      { name: 'extension_requested_at', definition: 'TIMESTAMP NULL' },
      { name: 'verification_deadline', definition: 'TIMESTAMP NULL' },
      { name: 'client_verified_at', definition: 'TIMESTAMP NULL' },
      { name: 'companion_verified_at', definition: 'TIMESTAMP NULL' },
      { name: 'client_verification_lat', definition: 'DECIMAL(10,8) NULL' },
      { name: 'client_verification_lon', definition: 'DECIMAL(11,8) NULL' },
      { name: 'companion_verification_lat', definition: 'DECIMAL(10,8) NULL' },
      { name: 'companion_verification_lon', definition: 'DECIMAL(11,8) NULL' },
      { name: 'both_verified_at', definition: 'TIMESTAMP NULL' }
    ];

    for (const col of extensionColumns) {
      try {
        const [columns] = await promisePool.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_verification' AND COLUMN_NAME = ?`,
          [col.name]
        );
        if (columns.length === 0) {
          await promisePool.query(`ALTER TABLE booking_verification ADD COLUMN ${col.name} ${col.definition}`);
          dbLog.info('initializeDatabase', `Added column ${col.name} to booking_verification`, {});
        }
      } catch (colErr) {
        dbLog.warn('initializeDatabase', `Error adding column ${col.name}`, { error: colErr.message });
      }
    }
    dbLog.info('initializeDatabase', 'Extension columns migration complete', {})

    // Create messages table for chat functionality
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        booking_id INT NOT NULL,
        sender_id INT NOT NULL,
        receiver_id INT NOT NULL,
        message_text TEXT NOT NULL,
        is_flagged BOOLEAN DEFAULT FALSE,
        flagged_reason VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        read_at TIMESTAMP NULL,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_booking_messages (booking_id),
        INDEX idx_sender (sender_id),
        INDEX idx_receiver (receiver_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    dbLog.info('initializeDatabase', 'Messages table ready', {});

    // Add missing columns to existing booking_requests table (migration)
    // MySQL doesn't support IF NOT EXISTS with ALTER TABLE, so we catch the error if column exists
    try {
      await promisePool.query(`
        ALTER TABLE booking_requests 
        ADD COLUMN extra_amount DECIMAL(10, 2) DEFAULT 0 AFTER service_category_id
      `);
      dbLog.info('initializeDatabase', 'Added extra_amount column to booking_requests', {});
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        dbLog.info('initializeDatabase', 'extra_amount column already exists', {});
      } else {
        dbLog.info('initializeDatabase', 'Could not add extra_amount column', { error: err.message });
      }
    }

    try {
      await promisePool.query(`
        ALTER TABLE booking_requests 
        ADD COLUMN service_type VARCHAR(255) NULL AFTER extra_amount
      `);
      dbLog.info('initializeDatabase', 'Added service_type column to booking_requests', {});
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        dbLog.info('initializeDatabase', 'service_type column already exists', {});
      } else {
        dbLog.info('initializeDatabase', 'Could not add service_type column', { error: err.message });
      }
    }

    try {
      await promisePool.query(`
        ALTER TABLE booking_requests 
        ADD COLUMN meeting_location_lat DECIMAL(10, 8) NULL AFTER meeting_location
      `);
      dbLog.info('initializeDatabase', 'Added meeting_location_lat column', {});
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        dbLog.info('initializeDatabase', 'meeting_location_lat column already exists', {});
      }
    }

    try {
      await promisePool.query(`
        ALTER TABLE booking_requests 
        ADD COLUMN meeting_location_lon DECIMAL(11, 8) NULL AFTER meeting_location_lat
      `);
      dbLog.info('initializeDatabase', 'Added meeting_location_lon column', {});
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        dbLog.info('initializeDatabase', 'meeting_location_lon column already exists', {});
      }
    }

    try {
      await promisePool.query(`
        ALTER TABLE booking_requests 
        ADD COLUMN meeting_location_place_id VARCHAR(255) NULL AFTER meeting_location_lon
      `);
      dbLog.info('initializeDatabase', 'Added meeting_location_place_id column', {});
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        dbLog.info('initializeDatabase', 'meeting_location_place_id column already exists', {});
      }
    }

    // Add service_category_id column to existing bookings table (migration)
    try {
      const dbName = dbConfig.database;

      const [[{ count_category_id }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_category_id FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'service_category_id'`,
        [dbName]
      );
      if (Number(count_category_id) === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD COLUMN service_category_id INT NULL`
        );
      }

      // Add foreign key constraint
      const [[{ count_fk }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_fk FROM information_schema.TABLE_CONSTRAINTS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bookings' AND CONSTRAINT_NAME = 'fk_bookings_service_category'`,
        [dbName]
      );
      if (Number(count_fk) === 0) {
        await promisePool.query(
          `ALTER TABLE bookings 
           ADD CONSTRAINT fk_bookings_service_category 
           FOREIGN KEY (service_category_id) REFERENCES service_categories(id) ON DELETE SET NULL`
        );
      }

      // Add index on service_category_id
      const [[{ idx_category }]] = await promisePool.query(
        `SELECT COUNT(*) AS idx_category FROM information_schema.STATISTICS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bookings' AND INDEX_NAME = 'idx_service_category_id'`,
        [dbName]
      );
      if (Number(idx_category) === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD INDEX idx_service_category_id (service_category_id)`
        );
      }
    } catch (migrationError) {
      logger.dbError('initializeDatabase', migrationError, null, { migration: 'bookings_service_category_id' });
    }

    // Add meeting_type column to existing bookings table (migration)
    try {
      const dbName = dbConfig.database;

      const [[{ count_meeting_type }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_meeting_type FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'meeting_type'`,
        [dbName]
      );
      if (Number(count_meeting_type) === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD COLUMN meeting_type ENUM('in_person', 'virtual') NULL DEFAULT 'in_person'`
        );
      }

      // Add index on meeting_type
      const [[{ idx_meeting_type }]] = await promisePool.query(
        `SELECT COUNT(*) AS idx_meeting_type FROM information_schema.STATISTICS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bookings' AND INDEX_NAME = 'idx_meeting_type'`,
        [dbName]
      );
      if (Number(idx_meeting_type) === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD INDEX idx_meeting_type (meeting_type)`
        );
      }
    } catch (migrationError) {
      logger.dbError('initializeDatabase', migrationError, null, { migration: 'bookings_meeting_type' });
    }

    // Add payment-related columns to existing bookings table (migration)
    try {
      const dbName = dbConfig.database;

      // Add payment_status column
      const [[{ count_payment_status }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_payment_status FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'payment_status'`,
        [dbName]
      );
      if (Number(count_payment_status) === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD COLUMN payment_status ENUM('unpaid', 'pending', 'paid', 'failed', 'refunded') NOT NULL DEFAULT 'unpaid'`
        );
      }

      // Add payment_method column
      const [[{ count_payment_method }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_payment_method FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'payment_method'`,
        [dbName]
      );
      if (Number(count_payment_method) === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD COLUMN payment_method VARCHAR(50) NULL`
        );
      }

      // Add payment_intent_id column
      const [[{ count_payment_intent_id }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_payment_intent_id FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'payment_intent_id'`,
        [dbName]
      );
      if (Number(count_payment_intent_id) === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD COLUMN payment_intent_id VARCHAR(255) NULL`
        );
      }

      // Add paid_at column
      const [[{ count_paid_at }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_paid_at FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'paid_at'`,
        [dbName]
      );
      if (Number(count_paid_at) === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD COLUMN paid_at TIMESTAMP NULL`
        );
      }

      // Add index on payment_status
      const [[{ idx_payment_status }]] = await promisePool.query(
        `SELECT COUNT(*) AS idx_payment_status FROM information_schema.STATISTICS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bookings' AND INDEX_NAME = 'idx_payment_status'`,
        [dbName]
      );
      if (Number(idx_payment_status) === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD INDEX idx_payment_status (payment_status)`
        );
      }
    } catch (migrationError) {
      logger.dbError('initializeDatabase', migrationError, null, { migration: 'bookings_payment_fields' });
    }

    // Add cancellation-related columns to bookings table (migration)
    try {
      const dbName = dbConfig.database;

      // Add cancelled_by column
      const [[{ count_cancelled_by }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_cancelled_by FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'cancelled_by'`,
        [dbName]
      );
      if (Number(count_cancelled_by) === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD COLUMN cancelled_by ENUM('client', 'companion') NULL`
        );
        dbLog.info('initializeDatabase', 'Added cancelled_by column to bookings', {});
      }

      // Add cancellation_reason column
      const [[{ count_cancellation_reason }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_cancellation_reason FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'cancellation_reason'`,
        [dbName]
      );
      if (Number(count_cancellation_reason) === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD COLUMN cancellation_reason VARCHAR(500) NULL`
        );
        dbLog.info('initializeDatabase', 'Added cancellation_reason column to bookings', {});
      }

      // Add cancelled_at column
      const [[{ count_cancelled_at }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_cancelled_at FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'cancelled_at'`,
        [dbName]
      );
      if (Number(count_cancelled_at) === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD COLUMN cancelled_at TIMESTAMP NULL`
        );
        dbLog.info('initializeDatabase', 'Added cancelled_at column to bookings', {});
      }

      // Add cancellation_fee column (for future payment integration)
      const [[{ count_cancellation_fee }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_cancellation_fee FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'cancellation_fee'`,
        [dbName]
      );
      if (Number(count_cancellation_fee) === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD COLUMN cancellation_fee DECIMAL(10,2) DEFAULT 0 COMMENT 'Future: Cancellation fee when payment is integrated'`
        );
        dbLog.info('initializeDatabase', 'Added cancellation_fee column to bookings', {});
      }
    } catch (migrationError) {
      logger.dbError('initializeDatabase', migrationError, null, { migration: 'bookings_cancellation_fields' });
    }

    // Add verification-related columns to bookings table (migration)
    try {
      const dbName = dbConfig.database;

      // Add chat_enabled_at column
      const [[{ count_chat_enabled_at }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_chat_enabled_at FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'chat_enabled_at'`,
        [dbName]
      );
      if (Number(count_chat_enabled_at) === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD COLUMN chat_enabled_at TIMESTAMP NULL COMMENT 'When chat access was granted (3h before meeting)'`
        );
        dbLog.info('initializeDatabase', 'Added chat_enabled_at column to bookings', {});
      }

      // Add payment_released_at column
      const [[{ count_payment_released_at }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_payment_released_at FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'payment_released_at'`,
        [dbName]
      );
      if (Number(count_payment_released_at) === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD COLUMN payment_released_at TIMESTAMP NULL COMMENT 'When payment was transferred to companion'`
        );
        dbLog.info('initializeDatabase', 'Added payment_released_at column to bookings', {});
      }

      // Add verification_required column
      const [[{ count_verification_required }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_verification_required FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'verification_required'`,
        [dbName]
      );
      if (Number(count_verification_required) === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD COLUMN verification_required BOOLEAN DEFAULT TRUE COMMENT 'Can be false for virtual meetings'`
        );
        dbLog.info('initializeDatabase', 'Added verification_required column to bookings', {});
      }
    } catch (migrationError) {
      logger.dbError('initializeDatabase', migrationError, null, { migration: 'bookings_verification_fields' });
    }

    // Add cancellation-related columns to booking_requests table (migration)
    try {
      const dbName = dbConfig.database;

      // Add cancelled_by column
      const [[{ count_cancelled_by }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_cancelled_by FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'booking_requests' AND COLUMN_NAME = 'cancelled_by'`,
        [dbName]
      );
      if (Number(count_cancelled_by) === 0) {
        await promisePool.query(
          `ALTER TABLE booking_requests ADD COLUMN cancelled_by ENUM('client', 'companion') NULL`
        );
        dbLog.info('initializeDatabase', 'Added cancelled_by column to booking_requests', {});
      }

      // Add cancellation_reason column
      const [[{ count_cancellation_reason }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_cancellation_reason FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'booking_requests' AND COLUMN_NAME = 'cancellation_reason'`,
        [dbName]
      );
      if (Number(count_cancellation_reason) === 0) {
        await promisePool.query(
          `ALTER TABLE booking_requests ADD COLUMN cancellation_reason VARCHAR(500) NULL`
        );
        dbLog.info('initializeDatabase', 'Added cancellation_reason column to booking_requests', {});
      }

      // Add cancelled_at column
      const [[{ count_cancelled_at }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_cancelled_at FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'booking_requests' AND COLUMN_NAME = 'cancelled_at'`,
        [dbName]
      );
      if (Number(count_cancelled_at) === 0) {
        await promisePool.query(
          `ALTER TABLE booking_requests ADD COLUMN cancelled_at TIMESTAMP NULL`
        );
        dbLog.info('initializeDatabase', 'Added cancelled_at column to booking_requests', {});
      }

      // Add 'cancelled' status to booking_requests status ENUM if not exists
      // Note: This is tricky with MySQL ENUM, so we'll handle it in application logic
      dbLog.info('initializeDatabase', 'Booking request cancellation status will use "rejected" for now', {});
    } catch (migrationError) {
      logger.dbError('initializeDatabase', migrationError, null, { migration: 'booking_requests_cancellation_fields' });
    }

    // Add address-related columns to companion_applications table (migration)
    try {
      const dbName = dbConfig.database;

      // Add address_line column
      const [[{ count_address_line }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_address_line FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companion_applications' AND COLUMN_NAME = 'address_line'`,
        [dbName]
      );
      if (Number(count_address_line) === 0) {
        await promisePool.query(
          `ALTER TABLE companion_applications ADD COLUMN address_line VARCHAR(255) NULL`
        );
      }

      // Add city column
      const [[{ count_city }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_city FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companion_applications' AND COLUMN_NAME = 'city'`,
        [dbName]
      );
      if (Number(count_city) === 0) {
        await promisePool.query(
          `ALTER TABLE companion_applications ADD COLUMN city VARCHAR(100) NULL`
        );
      }

      // Add state column
      const [[{ count_state }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_state FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companion_applications' AND COLUMN_NAME = 'state'`,
        [dbName]
      );
      if (Number(count_state) === 0) {
        await promisePool.query(
          `ALTER TABLE companion_applications ADD COLUMN state VARCHAR(100) NULL`
        );
      }

      // Add country column
      const [[{ count_country }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_country FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companion_applications' AND COLUMN_NAME = 'country'`,
        [dbName]
      );
      if (Number(count_country) === 0) {
        await promisePool.query(
          `ALTER TABLE companion_applications ADD COLUMN country VARCHAR(100) NULL`
        );
      }

      // Add postal_code column
      const [[{ count_postal_code }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_postal_code FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companion_applications' AND COLUMN_NAME = 'postal_code'`,
        [dbName]
      );
      if (Number(count_postal_code) === 0) {
        await promisePool.query(
          `ALTER TABLE companion_applications ADD COLUMN postal_code VARCHAR(20) NULL`
        );
      }

      // Add bio column
      const [[{ count_bio }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_bio FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companion_applications' AND COLUMN_NAME = 'bio'`,
        [dbName]
      );
      if (Number(count_bio) === 0) {
        await promisePool.query(
          `ALTER TABLE companion_applications ADD COLUMN bio TEXT NULL`
        );
      }

    } catch (migrationError) {
      logger.dbError('initializeDatabase', migrationError, null, { migration: 'companion_applications_address_fields' });
    }

    // Add profile-related columns to companion_applications table (migration)
    try {
      const dbName = dbConfig.database;

      // Add hourly_rate column
      const [[{ count_hourly_rate }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_hourly_rate FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companion_applications' AND COLUMN_NAME = 'hourly_rate'`,
        [dbName]
      );
      if (Number(count_hourly_rate) === 0) {
        await promisePool.query(
          `ALTER TABLE companion_applications ADD COLUMN hourly_rate DECIMAL(10,2) DEFAULT 50.00`
        );
      }

      // Add currency column
      const [[{ count_currency }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_currency FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companion_applications' AND COLUMN_NAME = 'currency'`,
        [dbName]
      );
      if (Number(count_currency) === 0) {
        await promisePool.query(
          `ALTER TABLE companion_applications ADD COLUMN currency VARCHAR(3) DEFAULT 'USD'`
        );
      }

      // Add gender column
      const [[{ count_gender }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_gender FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companion_applications' AND COLUMN_NAME = 'gender'`,
        [dbName]
      );
      if (Number(count_gender) === 0) {
        await promisePool.query(
          `ALTER TABLE companion_applications ADD COLUMN gender ENUM('male', 'female', 'other') NULL AFTER date_of_birth`
        );
      }

      // Add languages column (JSON)
      const [[{ count_languages }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_languages FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companion_applications' AND COLUMN_NAME = 'languages'`,
        [dbName]
      );
      if (Number(count_languages) === 0) {
        await promisePool.query(
          `ALTER TABLE companion_applications ADD COLUMN languages JSON NULL`
        );
      }

      // Add services_offered column (JSON)
      const [[{ count_services }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_services FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companion_applications' AND COLUMN_NAME = 'services_offered'`,
        [dbName]
      );
      if (Number(count_services) === 0) {
        await promisePool.query(
          `ALTER TABLE companion_applications ADD COLUMN services_offered JSON NULL`
        );
      }

      // Add phone_number column (increased size for country codes)
      const [[{ count_phone }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_phone FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companion_applications' AND COLUMN_NAME = 'phone_number'`,
        [dbName]
      );
      if (Number(count_phone) === 0) {
        await promisePool.query(
          `ALTER TABLE companion_applications ADD COLUMN phone_number VARCHAR(30) NULL`
        );
      } else {
        // Update existing column to support longer phone numbers with country codes
        await promisePool.query(
          `ALTER TABLE companion_applications MODIFY COLUMN phone_number VARCHAR(30) NULL`
        );
      }
    } catch (migrationError) {
      logger.dbError('initializeDatabase', migrationError, null, { migration: 'companion_profile_fields' });
    }

    // Add additional companion profile columns (migration)
    try {
      const dbName = dbConfig.database;

      // Add services_offered column
      const [[{ count_services_offered }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_services_offered FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companion_applications' AND COLUMN_NAME = 'services_offered'`,
        [dbName]
      );
      if (Number(count_services_offered) === 0) {
        await promisePool.query(
          `ALTER TABLE companion_applications ADD COLUMN services_offered JSON NULL`
        );
      }

      // Add languages column
      const [[{ count_languages }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_languages FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companion_applications' AND COLUMN_NAME = 'languages'`,
        [dbName]
      );
      if (Number(count_languages) === 0) {
        await promisePool.query(
          `ALTER TABLE companion_applications ADD COLUMN languages JSON NULL`
        );
      }

      // Add hourly_rate column
      const [[{ count_hourly_rate }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_hourly_rate FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companion_applications' AND COLUMN_NAME = 'hourly_rate'`,
        [dbName]
      );
      if (Number(count_hourly_rate) === 0) {
        await promisePool.query(
          `ALTER TABLE companion_applications ADD COLUMN hourly_rate DECIMAL(10,2) NULL`
        );
      }
    } catch (migrationError) {
      logger.dbError('initializeDatabase', migrationError, null, { migration: 'additional_companion_profile_fields' });
    }

    // Add Stripe-related columns to companion_applications table (migration)
    try {
      const dbName = dbConfig.database;

      // Add stripe_account_id column
      const [[{ count_stripe_account_id }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_stripe_account_id FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companion_applications' AND COLUMN_NAME = 'stripe_account_id'`,
        [dbName]
      );
      if (Number(count_stripe_account_id) === 0) {
        await promisePool.query(
          `ALTER TABLE companion_applications ADD COLUMN stripe_account_id VARCHAR(255) NULL`
        );
      }

      // Add stripe_account_status column
      const [[{ count_stripe_account_status }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_stripe_account_status FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companion_applications' AND COLUMN_NAME = 'stripe_account_status'`,
        [dbName]
      );
      if (Number(count_stripe_account_status) === 0) {
        await promisePool.query(
          `ALTER TABLE companion_applications ADD COLUMN stripe_account_status ENUM('not_created', 'pending', 'active', 'rejected') DEFAULT 'not_created'`
        );
      }

      // Add stripe_onboarding_completed column
      const [[{ count_stripe_onboarding_completed }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_stripe_onboarding_completed FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companion_applications' AND COLUMN_NAME = 'stripe_onboarding_completed'`,
        [dbName]
      );
      if (Number(count_stripe_onboarding_completed) === 0) {
        await promisePool.query(
          `ALTER TABLE companion_applications ADD COLUMN stripe_onboarding_completed BOOLEAN DEFAULT FALSE`
        );
      }

      // Add indexes on Stripe columns
      const [[{ idx_stripe_account_id }]] = await promisePool.query(
        `SELECT COUNT(*) AS idx_stripe_account_id FROM information_schema.STATISTICS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companion_applications' AND INDEX_NAME = 'idx_stripe_account_id'`,
        [dbName]
      );
      if (Number(idx_stripe_account_id) === 0) {
        await promisePool.query(
          `ALTER TABLE companion_applications ADD INDEX idx_stripe_account_id (stripe_account_id)`
        );
      }

      const [[{ idx_stripe_account_status }]] = await promisePool.query(
        `SELECT COUNT(*) AS idx_stripe_account_status FROM information_schema.STATISTICS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companion_applications' AND INDEX_NAME = 'idx_stripe_account_status'`,
        [dbName]
      );
      if (Number(idx_stripe_account_status) === 0) {
        await promisePool.query(
          `ALTER TABLE companion_applications ADD INDEX idx_stripe_account_status (stripe_account_status)`
        );
      }
    } catch (migrationError) {
      logger.dbError('initializeDatabase', migrationError, null, { migration: 'companion_applications_stripe_fields' });
    }

    // Add Stripe transfer-related columns to bookings table (migration)
    try {
      const dbName = dbConfig.database;

      // Add transfer_id column
      const [[{ count_transfer_id }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_transfer_id FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'transfer_id'`,
        [dbName]
      );
      if (Number(count_transfer_id) === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD COLUMN transfer_id VARCHAR(255) NULL`
        );
      }

      // Add platform_fee_amount column
      const [[{ count_platform_fee_amount }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_platform_fee_amount FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'platform_fee_amount'`,
        [dbName]
      );
      if (Number(count_platform_fee_amount) === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD COLUMN platform_fee_amount DECIMAL(10,2) NULL`
        );
      }

      // Add transfer_status column
      const [[{ count_transfer_status }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_transfer_status FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'transfer_status'`,
        [dbName]
      );
      if (Number(count_transfer_status) === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD COLUMN transfer_status ENUM('pending', 'completed', 'failed') NULL`
        );
      }

      // Add index on transfer_id
      const [[{ idx_transfer_id }]] = await promisePool.query(
        `SELECT COUNT(*) AS idx_transfer_id FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bookings' AND INDEX_NAME = 'idx_transfer_id'`,
        [dbName]
      );
      if (Number(idx_transfer_id) === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD INDEX idx_transfer_id (transfer_id)`
        );
      }

      // Add companion_amount column (companion's share after platform fee)
      const [[{ count_companion_amount }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_companion_amount FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'companion_amount'`,
        [dbName]
      );
      if (Number(count_companion_amount) === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD COLUMN companion_amount DECIMAL(10,2) NULL COMMENT 'Companion share after platform fee deduction'`
        );
        dbLog.info('initializeDatabase', 'Added companion_amount column to bookings table', {});
      }

      // Add refund_amount column
      const [[{ count_refund_amount }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_refund_amount FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'refund_amount'`,
        [dbName]
      );
      if (Number(count_refund_amount) === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD COLUMN refund_amount DECIMAL(10,2) NULL`
        );
        dbLog.info('initializeDatabase', 'Added refund_amount column to bookings table', {});
      }

      // Add refunded_at column
      const [[{ count_refunded_at }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_refunded_at FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'refunded_at'`,
        [dbName]
      );
      if (Number(count_refunded_at) === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD COLUMN refunded_at TIMESTAMP NULL`
        );
        dbLog.info('initializeDatabase', 'Added refunded_at column to bookings table', {});
      }

      // Add capture_failure_reason column
      const [[{ count_capture_failure }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_capture_failure FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'capture_failure_reason'`,
        [dbName]
      );
      if (Number(count_capture_failure) === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD COLUMN capture_failure_reason VARCHAR(500) NULL`
        );
        dbLog.info('initializeDatabase', 'Added capture_failure_reason column to bookings table', {});
      }

      // Add transfer_failure_reason column (for cross-border and other transfer failures)
      const [[{ count_transfer_failure }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_transfer_failure FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'transfer_failure_reason'`,
        [dbName]
      );
      if (Number(count_transfer_failure) === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD COLUMN transfer_failure_reason TEXT NULL COMMENT 'Reason for transfer failure (cross-border, etc.)'`
        );
        dbLog.info('initializeDatabase', 'Added transfer_failure_reason column to bookings table', {});
      }
    } catch (migrationError) {
      logger.dbError('initializeDatabase', migrationError, null, { migration: 'bookings_stripe_transfer_fields' });
    }

    // Create admin_notifications table for alerting admins about issues requiring attention
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS admin_notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type VARCHAR(50) NOT NULL COMMENT 'Notification type: transfer_failure, verification_issue, etc.',
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        data JSON NULL COMMENT 'Additional data as JSON',
        is_read BOOLEAN DEFAULT FALSE,
        read_at TIMESTAMP NULL,
        read_by INT NULL COMMENT 'Admin user ID who read it',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_type (type),
        INDEX idx_is_read (is_read),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    dbLog.info('initializeDatabase', 'Admin notifications table ready', {});

    // Create companion_earnings table for tracking earnings and payouts
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS companion_earnings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        companion_id INT NOT NULL,
        booking_id INT NOT NULL,
        gross_amount DECIMAL(10,2) NOT NULL COMMENT 'Total booking amount',
        platform_fee DECIMAL(10,2) NOT NULL COMMENT 'Platform fee (15%)',
        net_amount DECIMAL(10,2) NOT NULL COMMENT 'Amount after platform fee (85%)',
        transfer_id VARCHAR(255) NULL COMMENT 'Stripe transfer ID',
        transfer_status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
        available_at TIMESTAMP NULL COMMENT 'When funds become available for payout (48h hold)',
        paid_out BOOLEAN DEFAULT FALSE,
        payout_id VARCHAR(255) NULL COMMENT 'Stripe payout ID when paid out',
        paid_out_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (companion_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
        INDEX idx_companion_earnings (companion_id),
        INDEX idx_booking_earnings (booking_id),
        INDEX idx_transfer_status (transfer_status),
        INDEX idx_available_at (available_at),
        INDEX idx_paid_out (paid_out),
        UNIQUE KEY unique_booking_earning (booking_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    dbLog.info('initializeDatabase', 'Companion earnings table ready', {});

    // Add Veriff-related columns to companion_applications table (migration)
    // Remove government_id_url for security (no longer storing sensitive documents locally)
    try {
      const dbName = dbConfig.database;
      dbLog.info('initializeDatabase', 'Starting Veriff fields migration for companion_applications', {});

      // Add nationality column
      const [[{ count_nationality }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_nationality FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companion_applications' AND COLUMN_NAME = 'nationality'`,
        [dbName]
      );
      if (Number(count_nationality) === 0) {
        await promisePool.query(
          `ALTER TABLE companion_applications ADD COLUMN nationality VARCHAR(100) NULL`
        );
        dbLog.info('initializeDatabase', 'Added nationality column to companion_applications', {});
      }

      // Add document_type column
      const [[{ count_document_type }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_document_type FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companion_applications' AND COLUMN_NAME = 'document_type'`,
        [dbName]
      );
      if (Number(count_document_type) === 0) {
        await promisePool.query(
          `ALTER TABLE companion_applications ADD COLUMN document_type ENUM('passport', 'drivers_license', 'id_card', 'residence_permit') NULL`
        );
        dbLog.info('initializeDatabase', 'Added document_type column to companion_applications', {});
      }

      // Add document_expiration_date column
      const [[{ count_document_expiration_date }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_document_expiration_date FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companion_applications' AND COLUMN_NAME = 'document_expiration_date'`,
        [dbName]
      );
      if (Number(count_document_expiration_date) === 0) {
        await promisePool.query(
          `ALTER TABLE companion_applications ADD COLUMN document_expiration_date DATE NULL`
        );
        dbLog.info('initializeDatabase', 'Added document_expiration_date column to companion_applications', {});
      }

      // Add document_country_issue column
      const [[{ count_document_country_issue }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_document_country_issue FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companion_applications' AND COLUMN_NAME = 'document_country_issue'`,
        [dbName]
      );
      if (Number(count_document_country_issue) === 0) {
        await promisePool.query(
          `ALTER TABLE companion_applications ADD COLUMN document_country_issue VARCHAR(100) NULL`
        );
        dbLog.info('initializeDatabase', 'Added document_country_issue column to companion_applications', {});
      }

      // Add verification_session_id column (for future Veriff integration)
      const [[{ count_verification_session_id }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_verification_session_id FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companion_applications' AND COLUMN_NAME = 'verification_session_id'`,
        [dbName]
      );
      if (Number(count_verification_session_id) === 0) {
        await promisePool.query(
          `ALTER TABLE companion_applications ADD COLUMN verification_session_id VARCHAR(255) NULL COMMENT 'Veriff session ID for future API integration'`
        );
        dbLog.info('initializeDatabase', 'Added verification_session_id column to companion_applications', {});
      }

      // Add verification_completed_at column
      const [[{ count_verification_completed_at }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_verification_completed_at FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companion_applications' AND COLUMN_NAME = 'verification_completed_at'`,
        [dbName]
      );
      if (Number(count_verification_completed_at) === 0) {
        await promisePool.query(
          `ALTER TABLE companion_applications ADD COLUMN verification_completed_at TIMESTAMP NULL`
        );
        dbLog.info('initializeDatabase', 'Added verification_completed_at column to companion_applications', {});
      }

      // NOTE: government_id_url column removal is intentionally NOT automated
      // This requires manual intervention to ensure data is backed up first
      // Use: ALTER TABLE companion_applications DROP COLUMN government_id_url;
      dbLog.info('initializeDatabase', 'IMPORTANT: government_id_url should be removed manually after data backup', {});

    } catch (migrationError) {
      logger.dbError('initializeDatabase', migrationError, null, { migration: 'companion_applications_veriff_fields' });
    }

    // Add Veriff-related columns to client_verifications table (migration)
    try {
      const dbName = dbConfig.database;
      dbLog.info('initializeDatabase', 'Starting Veriff fields migration for client_verifications', {});

      // Add nationality column
      const [[{ count_nationality }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_nationality FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'client_verifications' AND COLUMN_NAME = 'nationality'`,
        [dbName]
      );
      if (Number(count_nationality) === 0) {
        await promisePool.query(
          `ALTER TABLE client_verifications ADD COLUMN nationality VARCHAR(100) NULL`
        );
        dbLog.info('initializeDatabase', 'Added nationality column to client_verifications', {});
      }

      // Add document_type column
      const [[{ count_document_type }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_document_type FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'client_verifications' AND COLUMN_NAME = 'document_type'`,
        [dbName]
      );
      if (Number(count_document_type) === 0) {
        await promisePool.query(
          `ALTER TABLE client_verifications ADD COLUMN document_type ENUM('passport', 'drivers_license', 'id_card', 'residence_permit') NULL`
        );
        dbLog.info('initializeDatabase', 'Added document_type column to client_verifications', {});
      }

      // Add document_expiration_date column
      const [[{ count_document_expiration_date }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_document_expiration_date FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'client_verifications' AND COLUMN_NAME = 'document_expiration_date'`,
        [dbName]
      );
      if (Number(count_document_expiration_date) === 0) {
        await promisePool.query(
          `ALTER TABLE client_verifications ADD COLUMN document_expiration_date DATE NULL`
        );
        dbLog.info('initializeDatabase', 'Added document_expiration_date column to client_verifications', {});
      }

      // Add document_country_issue column
      const [[{ count_document_country_issue }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_document_country_issue FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'client_verifications' AND COLUMN_NAME = 'document_country_issue'`,
        [dbName]
      );
      if (Number(count_document_country_issue) === 0) {
        await promisePool.query(
          `ALTER TABLE client_verifications ADD COLUMN document_country_issue VARCHAR(100) NULL`
        );
        dbLog.info('initializeDatabase', 'Added document_country_issue column to client_verifications', {});
      }

      // Add verification_session_id column (for future Veriff integration)
      const [[{ count_verification_session_id }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_verification_session_id FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'client_verifications' AND COLUMN_NAME = 'verification_session_id'`,
        [dbName]
      );
      if (Number(count_verification_session_id) === 0) {
        await promisePool.query(
          `ALTER TABLE client_verifications ADD COLUMN verification_session_id VARCHAR(255) NULL COMMENT 'Veriff session ID for future API integration'`
        );
        dbLog.info('initializeDatabase', 'Added verification_session_id column to client_verifications', {});
      }

      // Add verification_completed_at column
      const [[{ count_verification_completed_at }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_verification_completed_at FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'client_verifications' AND COLUMN_NAME = 'verification_completed_at'`,
        [dbName]
      );
      if (Number(count_verification_completed_at) === 0) {
        await promisePool.query(
          `ALTER TABLE client_verifications ADD COLUMN verification_completed_at TIMESTAMP NULL`
        );
        dbLog.info('initializeDatabase', 'Added verification_completed_at column to client_verifications', {});
      }

      // NOTE: id_document_url column removal is intentionally NOT automated
      // This requires manual intervention to ensure data is backed up first
      // Use: ALTER TABLE client_verifications DROP COLUMN id_document_url;
      dbLog.info('initializeDatabase', 'IMPORTANT: id_document_url should be removed manually after data backup', {});

    } catch (migrationError) {
      logger.dbError('initializeDatabase', migrationError, null, { migration: 'client_verifications_veriff_fields' });
    }

    // Add time columns to booking_requests table (migration)
    try {
      const dbName = dbConfig.database;

      // Check and add start_time column
      const [[{ count_start_time }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_start_time FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'booking_requests' AND COLUMN_NAME = 'start_time'`,
        [dbName]
      );
      if (Number(count_start_time) === 0) {
        await promisePool.query(
          `ALTER TABLE booking_requests ADD COLUMN start_time TIME NULL AFTER preferred_time`
        );
        dbLog.info('initializeDatabase', 'Added start_time column to booking_requests table', {});
      }

      // Check and add end_time column
      const [[{ count_end_time }]] = await promisePool.query(
        `SELECT COUNT(*) AS count_end_time FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'booking_requests' AND COLUMN_NAME = 'end_time'`,
        [dbName]
      );
      if (Number(count_end_time) === 0) {
        await promisePool.query(
          `ALTER TABLE booking_requests ADD COLUMN end_time TIME NULL AFTER start_time`
        );
        dbLog.info('initializeDatabase', 'Added end_time column to booking_requests table', {});
      }
    } catch (migrationError) {
      logger.dbError('initializeDatabase', migrationError, null, { migration: 'booking_requests_time_columns' });
    }

    // Add custom service fields to bookings table for client-specified services
    try {
      // Add custom_service_name column
      const [[{ count_custom_service_name }]] = await promisePool.query(
        `SELECT COUNT(*) as count FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'bookings'
         AND COLUMN_NAME = 'custom_service_name'`
      );

      if (count_custom_service_name === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD COLUMN custom_service_name VARCHAR(255) NULL`
        );
        dbLog.info('initializeDatabase', 'Added custom_service_name column to bookings table', {});
      }

      // Add custom_service_description column
      const [[{ count_custom_service_description }]] = await promisePool.query(
        `SELECT COUNT(*) as count FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'bookings'
         AND COLUMN_NAME = 'custom_service_description'`
      );

      if (count_custom_service_description === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD COLUMN custom_service_description TEXT NULL`
        );
        dbLog.info('initializeDatabase', 'Added custom_service_description column to bookings table', {});
      }

      // Add is_custom_service column for easier querying
      const [[{ count_is_custom_service }]] = await promisePool.query(
        `SELECT COUNT(*) as count FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'bookings'
         AND COLUMN_NAME = 'is_custom_service'`
      );

      if (count_is_custom_service === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD COLUMN is_custom_service BOOLEAN NOT NULL DEFAULT FALSE`
        );
        dbLog.info('initializeDatabase', 'Added is_custom_service column to bookings table', {});
      }

      // Add index on is_custom_service for efficient filtering
      const [[{ idx_is_custom_service }]] = await promisePool.query(
        `SELECT COUNT(*) as count FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'bookings'
         AND INDEX_NAME = 'idx_is_custom_service'`
      );

      if (idx_is_custom_service === 0) {
        await promisePool.query(
          `ALTER TABLE bookings ADD INDEX idx_is_custom_service (is_custom_service)`
        );
        dbLog.info('initializeDatabase', 'Added index on is_custom_service', {});
      }
    } catch (migrationError) {
      logger.dbError('initializeDatabase', migrationError, null, { migration: 'bookings_custom_service_fields' });
    }

    // Create booking_reviews table
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS booking_reviews (
        id INT AUTO_INCREMENT PRIMARY KEY,
        booking_id INT NOT NULL,
        reviewer_id INT NOT NULL,
        reviewee_id INT NOT NULL,
        rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
        review_text TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
        FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (reviewee_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_booking_reviewer (booking_id, reviewer_id),
        INDEX idx_booking_id (booking_id),
        INDEX idx_reviewee_id (reviewee_id),
        INDEX idx_rating (rating)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    dbLog.info('initializeDatabase', 'Booking reviews table ready', {});

    // Create user_roles table for dual role support
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS user_roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        role ENUM('client', 'companion', 'admin') NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_role (role),
        INDEX idx_is_active (is_active),
        UNIQUE KEY unique_user_role (user_id, role)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    dbLog.info('initializeDatabase', 'User roles table ready', {});

    // Create companion_interests table
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS companion_interests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        companion_id INT NOT NULL,
        interest_name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (companion_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_companion_id (companion_id),
        INDEX idx_interest_name (interest_name),
        UNIQUE KEY unique_companion_interest (companion_id, interest_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    dbLog.info('initializeDatabase', 'Companion interests table ready', {});

    // Create favorite_companions table for clients to save their favorite companions
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS favorite_companions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        companion_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (companion_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_client_id (client_id),
        INDEX idx_companion_id (companion_id),
        UNIQUE KEY unique_favorite (client_id, companion_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    dbLog.info('initializeDatabase', 'Favorite companions table ready', {});

    // Create notifications table
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        type ENUM('booking', 'application', 'payment', 'account', 'system', 'review') NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        action_url VARCHAR(500),
        is_read BOOLEAN DEFAULT FALSE,
        read_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_unread (user_id, is_read),
        INDEX idx_created (created_at DESC)
      )
    `);
    dbLog.info('initializeDatabase', 'Notifications table ready', {});

    // Create notification preferences table
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL UNIQUE,
        email_enabled BOOLEAN DEFAULT TRUE,
        push_enabled BOOLEAN DEFAULT FALSE,
        booking_notifications BOOLEAN DEFAULT TRUE,
        payment_notifications BOOLEAN DEFAULT TRUE,
        marketing_notifications BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    dbLog.info('initializeDatabase', 'Notification preferences table ready', {});

    // Create webhook_failures table for monitoring and debugging
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS webhook_failures (
        id INT AUTO_INCREMENT PRIMARY KEY,
        event_type VARCHAR(255) NOT NULL COMMENT 'Webhook event type (e.g., payment_intent.succeeded)',
        event_id VARCHAR(255) NULL COMMENT 'External event ID',
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
      COMMENT='Stores failed webhook events for monitoring and debugging'
    `);
    dbLog.info('initializeDatabase', 'Webhook failures table ready', {});

    // Drop and recreate audit log table to fix constraint issues
    try {
      await promisePool.query('DROP TABLE IF EXISTS availability_audit_log');
    } catch (err) {
      // Ignore if table doesn't exist
    }

    // Create audit log table for tracking data changes
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS availability_audit_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        companion_id INT NOT NULL,
        action VARCHAR(50) NOT NULL,
        old_data JSON,
        new_data JSON,
        changed_by_id INT DEFAULT NULL,
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ip_address VARCHAR(45),
        user_agent TEXT,
        INDEX idx_companion_audit (companion_id),
        INDEX idx_changed_at (changed_at),
        FOREIGN KEY (companion_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (changed_by_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    dbLog.info('initializeDatabase', 'Created availability_audit_log table', {});

    // Create verification attempts table for audit trail
    await promisePool.query(`
      CREATE TABLE IF NOT EXISTS verification_attempts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        booking_id INT NOT NULL,
        user_id INT NOT NULL,
        user_role ENUM('client', 'companion') NOT NULL,
        attempt_type ENUM('verify', 'extend') NOT NULL,
        user_lat DECIMAL(10, 8) NOT NULL,
        user_lon DECIMAL(11, 8) NOT NULL,
        meeting_lat DECIMAL(10, 8) NOT NULL,
        meeting_lon DECIMAL(11, 8) NOT NULL,
        distance_meters INT NOT NULL,
        success BOOLEAN NOT NULL DEFAULT FALSE,
        failure_reason VARCHAR(255) NULL,
        ip_address VARCHAR(45) NULL,
        user_agent TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_booking_attempts (booking_id),
        INDEX idx_user_attempts (user_id),
        INDEX idx_created_at (created_at),
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    dbLog.info('initializeDatabase', 'Created verification_attempts table', {});

    // Drop existing triggers if they exist (for clean updates)
    try {
      await promisePool.query('DROP TRIGGER IF EXISTS validate_availability_insert');
      await promisePool.query('DROP TRIGGER IF EXISTS validate_availability_update');
      await promisePool.query('DROP TRIGGER IF EXISTS prevent_cross_companion_update');
    } catch (err) {
      // Ignore errors if triggers don't exist
    }

    // Create trigger to validate companion_id on INSERT
    await promisePool.query(`
      CREATE TRIGGER validate_availability_insert
      BEFORE INSERT ON companion_availability
      FOR EACH ROW
      BEGIN
        -- Ensure companion_id exists and has companion role
        DECLARE companion_exists INT DEFAULT 0;

        SELECT COUNT(*) INTO companion_exists
        FROM user_roles
        WHERE user_id = NEW.companion_id
        AND role = 'companion'
        AND is_active = TRUE;

        IF companion_exists = 0 THEN
          SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Invalid companion_id or user is not an active companion';
        END IF;
      END
    `);
    dbLog.info('initializeDatabase', 'Created trigger: validate_availability_insert', {});

    // Create trigger to prevent updating to different companion_id
    await promisePool.query(`
      CREATE TRIGGER prevent_cross_companion_update
      BEFORE UPDATE ON companion_availability
      FOR EACH ROW
      BEGIN
        IF OLD.companion_id != NEW.companion_id THEN
          SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Cannot change companion_id of existing availability record';
        END IF;
      END
    `);
    dbLog.info('initializeDatabase', 'Created trigger: prevent_cross_companion_update', {});

    // Create data integrity check stored procedure for admin use
    await promisePool.query(`
      CREATE PROCEDURE IF NOT EXISTS check_availability_integrity()
      BEGIN
        -- Check for orphaned availability records
        SELECT
          'Orphaned Records' as check_type,
          COUNT(*) as issue_count,
          GROUP_CONCAT(DISTINCT ca.companion_id) as affected_companions
        FROM companion_availability ca
        LEFT JOIN users u ON ca.companion_id = u.id
        WHERE u.id IS NULL;

        -- Check for companions without proper role
        SELECT
          'Invalid Role' as check_type,
          COUNT(*) as issue_count,
          GROUP_CONCAT(DISTINCT ca.companion_id) as affected_companions
        FROM companion_availability ca
        LEFT JOIN user_roles ur ON ca.companion_id = ur.user_id AND ur.role = 'companion'
        WHERE ur.user_id IS NULL;

        -- Check for duplicate time slots
        SELECT
          'Duplicate Slots' as check_type,
          COUNT(*) as issue_count,
          GROUP_CONCAT(DISTINCT companion_id) as affected_companions
        FROM (
          SELECT companion_id, day_of_week, start_time, COUNT(*) as cnt
          FROM companion_availability
          GROUP BY companion_id, day_of_week, start_time
          HAVING cnt > 1
        ) duplicates;

        -- Check for overlapping time slots
        SELECT
          'Overlapping Slots' as check_type,
          COUNT(*) as issue_count,
          GROUP_CONCAT(DISTINCT a1.companion_id) as affected_companions
        FROM companion_availability a1
        JOIN companion_availability a2
          ON a1.companion_id = a2.companion_id
          AND a1.day_of_week = a2.day_of_week
          AND a1.id != a2.id
        WHERE a1.start_time < a2.end_time AND a1.end_time > a2.start_time;
      END
    `);
    dbLog.info('initializeDatabase', 'Created stored procedure: check_availability_integrity', {});

    // Migrate existing users to user_roles table
    try {
      const [existingUsers] = await promisePool.query(`
        SELECT id, role FROM users WHERE role IS NOT NULL
      `);

      for (const user of existingUsers) {
        // Check if user already has entries in user_roles
        const [existingRoles] = await promisePool.query(`
          SELECT COUNT(*) as count FROM user_roles WHERE user_id = ?
        `, [user.id]);

        if (existingRoles[0].count === 0) {
          // Create user_roles entry for existing user
          await promisePool.query(`
            INSERT INTO user_roles (user_id, role, is_active) VALUES (?, ?, TRUE)
          `, [user.id, user.role]);
        }
      }
      if (ENABLE_VERBOSE_DB_LOGGING) {
        dbLog.info('initializeDatabase', 'Migrated existing users to user_roles table', {});
      }
    } catch (migrationError) {
      logger.dbError('initializeDatabase', migrationError, null, { migration: 'user_roles' });
    }

    const endTime = Date.now();
    dbLog.summary(`Database initialization completed in ${endTime - startTime}ms`, { operation: 'initializeDatabase' });
    return true;
  } catch (error) {
    logger.dbError('initializeDatabase', error, null);
    throw error;
  }
};

module.exports = {
  pool: promisePool,
  testConnection,
  initializeDatabase,
  checkPoolHealth,
  closePool
};
