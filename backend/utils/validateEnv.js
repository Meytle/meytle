/**
 * Environment Variable Validation
 * Ensures all required environment variables are set before starting the application
 */

class EnvironmentValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Validate that a required environment variable exists
   * @param {string} varName - Name of the environment variable
   * @param {string} description - Description of what this variable is for
   * @returns {boolean} - Whether the variable exists
   */
  validateRequired(varName, description) {
    if (!process.env[varName]) {
      this.errors.push(`❌ Missing required environment variable: ${varName} - ${description}`);
      return false;
    }
    return true;
  }

  /**
   * Validate that an optional environment variable exists (warning only)
   * @param {string} varName - Name of the environment variable
   * @param {string} description - Description of what this variable is for
   * @returns {boolean} - Whether the variable exists
   */
  validateOptional(varName, description) {
    if (!process.env[varName]) {
      this.warnings.push(`⚠️  Missing optional environment variable: ${varName} - ${description}`);
      return false;
    }
    return true;
  }

  /**
   * Validate environment variable format
   * @param {string} varName - Name of the environment variable
   * @param {RegExp} pattern - Pattern to match
   * @param {string} format - Description of expected format
   * @returns {boolean} - Whether the variable matches the pattern
   */
  validateFormat(varName, pattern, format) {
    const value = process.env[varName];
    if (value && !pattern.test(value)) {
      this.errors.push(`❌ Invalid format for ${varName}: Expected ${format}, got "${value}"`);
      return false;
    }
    return true;
  }

  /**
   * Validate all required environment variables
   * @returns {boolean} - Whether all validations passed
   */
  validateAll() {
    console.log('\n🔍 Validating environment variables...\n');

    // Database Configuration (all required)
    this.validateRequired('DB_HOST', 'Database host address');
    this.validateRequired('DB_USER', 'Database username');
    this.validateRequired('DB_PASSWORD', 'Database password (no default allowed for security)');
    this.validateRequired('DB_NAME', 'Database name');

    // Optional database settings with defaults
    this.validateOptional('DB_PORT', 'Database port (defaults to 3306)');

    // Authentication (required)
    this.validateRequired('JWT_SECRET', 'JWT secret key for signing tokens (must be strong and unique)');

    // Server Configuration
    this.validateOptional('PORT', 'Server port (defaults to 5000)');
    this.validateOptional('NODE_ENV', 'Environment mode (development/production)');

    // CORS Configuration (required for production)
    if (process.env.NODE_ENV === 'production') {
      this.validateRequired('FRONTEND_URL', 'Frontend URL for CORS configuration (required in production)');
    } else {
      this.validateOptional('FRONTEND_URL', 'Frontend URL for CORS configuration');
    }

    // Stripe configuration removed - will be implemented later

    // Email Configuration (optional for now)
    this.validateOptional('RESEND_API_KEY', 'Resend API key for sending emails');
    this.validateOptional('RESEND_FROM_EMAIL', 'From email address for account emails (defaults to noreply@meytle.com)');
    this.validateOptional('EMAIL_MODE', 'Email mode (testing/production)');
    this.validateOptional('EMAIL_PRIORITY_MODE', 'Email priority mode: "production" (all emails) or "testing" (critical+high only). Defaults to production');

    if (process.env.EMAIL_MODE === 'testing') {
      this.validateRequired('TEST_EMAIL_RECIPIENT', 'Test email recipient (required when EMAIL_MODE=testing)');
    }

    // Validate JWT secret strength
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
      this.errors.push('❌ JWT_SECRET is too short. Use at least 32 characters for security.');
    }

    // Validate database password strength
    if (process.env.DB_PASSWORD && process.env.DB_PASSWORD.length < 8) {
      this.warnings.push('⚠️  DB_PASSWORD is weak. Consider using a stronger password.');
    }

    // Validate NODE_ENV values
    if (process.env.NODE_ENV && !['development', 'production', 'test'].includes(process.env.NODE_ENV)) {
      this.warnings.push(`⚠️  NODE_ENV has unexpected value: ${process.env.NODE_ENV}. Expected: development, production, or test`);
    }

    // Display results
    if (this.warnings.length > 0) {
      console.log('⚠️  Warnings found:\n');
      this.warnings.forEach(warning => console.log(warning));
      console.log('');
    }

    if (this.errors.length > 0) {
      console.log('❌ Validation errors found:\n');
      this.errors.forEach(error => console.log(error));
      console.log('\n📋 Required environment variables:');
      console.log('   - DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
      console.log('   - JWT_SECRET (min 32 characters)');
      console.log('   - RESEND_API_KEY');
      console.log('   - FRONTEND_URL (required in production)');
      console.log('\n💡 Create a .env file in the backend directory with these variables.');
      return false;
    }

    console.log('✅ All required environment variables are properly configured!\n');
    return true;
  }
}

/**
 * Main validation function to be called on application startup
 * @param {boolean} exitOnError - Whether to exit the process on validation errors
 * @returns {boolean} - Whether validation passed
 */
const validateEnvironment = (exitOnError = true) => {
  const validator = new EnvironmentValidator();
  const isValid = validator.validateAll();

  if (!isValid && exitOnError) {
    console.error('\n🛑 Application startup aborted due to missing environment variables.\n');
    process.exit(1);
  }

  return isValid;
};

module.exports = {
  validateEnvironment,
  EnvironmentValidator
};