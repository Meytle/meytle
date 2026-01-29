/**
 * Database Migration Runner
 * Runs SQL migration files
 */

const fs = require('fs').promises;
const path = require('path');
const { pool } = require('../config/database');
const logger = require('../services/logger');

/**
 * Run a SQL migration file
 * @param {string} filename - Migration filename
 */
async function runMigration(filename) {
  try {
    const filePath = path.join(__dirname, 'migrations', filename);
    const sql = await fs.readFile(filePath, 'utf8');

    // Split by semicolon but handle CREATE VIEW statements properly
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    logger.info(`Running migration: ${filename}`);
    logger.info(`Found ${statements.length} statements to execute`);

    let successCount = 0;
    let errorCount = 0;

    for (const statement of statements) {
      try {
        await pool.query(statement);
        successCount++;
        
        // Log first 100 characters of statement for tracking
        const preview = statement.substring(0, 100).replace(/\s+/g, ' ');
        logger.info(`✓ Executed: ${preview}${statement.length > 100 ? '...' : ''}`);
      } catch (error) {
        errorCount++;
        
        // Some errors are acceptable (e.g., index already exists)
        if (error.code === 'ER_DUP_KEYNAME' || error.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
          logger.warn(`⚠ Skipped (already exists): ${statement.substring(0, 100)}`);
        } else {
          logger.error(`✗ Error executing statement: ${error.message}`);
          logger.error(`Statement: ${statement.substring(0, 200)}`);
          // Don't throw - continue with other statements
        }
      }
    }

    logger.info(`Migration completed: ${filename}`);
    logger.info(`Success: ${successCount}, Errors: ${errorCount}, Total: ${statements.length}`);

    return {
      success: true,
      successCount,
      errorCount,
      totalStatements: statements.length
    };
  } catch (error) {
    logger.error(`Failed to run migration ${filename}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Run all migrations
 */
async function runAllMigrations() {
  try {
    logger.info('Starting database migrations...');

    // Run migrations in order
    const migrations = [
      'add_performance_indexes.sql',
      'create_performance_views.sql'
    ];

    for (const migration of migrations) {
      await runMigration(migration);
    }

    logger.info('All migrations completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Migration process failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runAllMigrations();
}

module.exports = {
  runMigration,
  runAllMigrations
};

