/**
 * Authentication Controller
 * Handles user signup and login
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const config = require('../config/config');
const { sendWelcomeVerificationEmail, generateVerificationToken, generateOTP, sendOTPEmail } = require('../services/emailService');
const { transformToFrontend } = require('../utils/transformer');
const logger = require('../services/logger');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createNotification, notificationTemplates } = require('../services/notificationService');

/**
 * Sign up a new user
 */
const signup = async (req, res) => {
  try {
    const { name, email, password, roles } = req.body;

    // Log incoming signup request
    logger.authInfo('signup_request', null, 'Signup request received', {
      name: name ? `${name.substring(0, 3)}***` : 'missing',
      email: email ? `${email.split('@')[0].substring(0, 3)}***@${email.split('@')[1] || ''}` : 'missing',
      passwordLength: password ? password.length : 0,
      roles: roles,
      hasAllFields: !!(name && email && password && roles)
    });

    // Validate required fields
    if (!name || !email || !password || !roles) {
      logger.authInfo('signup_validation_failed', null, 'Missing required fields', {
        hasName: !!name,
        hasEmail: !!email,
        hasPassword: !!password,
        hasRoles: !!roles
      });
      return res.status(400).json({
        status: 'error',
        message: 'Please provide all required fields: name, email, password, and roles'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide a valid email address'
      });
    }

    // Validate roles (support both single role and array of roles)
    const roleArray = Array.isArray(roles) ? roles : [roles];
    const validRoles = ['client', 'companion', 'admin'];
    
    for (const role of roleArray) {
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          status: 'error',
          message: `Invalid role: ${role}. Must be one of: ${validRoles.join(', ')}`
        });
      }
    }

    // Validate password strength
    if (password.length < 8) {
      logger.authInfo('signup_validation_failed', null, 'Password too short', { passwordLength: password.length });
      return res.status(400).json({
        status: 'error',
        message: 'Password must be at least 8 characters long'
      });
    }

    // Check password complexity
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    logger.authInfo('password_validation', null, 'Password validation', {
      length: password.length,
      hasUpperCase,
      hasLowerCase,
      hasNumbers,
      hasSpecialChar,
      isValid: hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar
    });

    if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
      logger.authInfo('signup_validation_failed', null, 'Password complexity failed');
      return res.status(400).json({
        status: 'error',
        message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      });
    }

    // Check if user already exists
    logger.authInfo('email_check', null, 'Checking if email exists', { email });
    const [existingUsers] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      logger.authInfo('signup_validation_failed', null, 'Email already exists in database', { email });
      return res.status(400).json({
        status: 'error',
        message: 'User with this email already exists'
      });
    }
    logger.authInfo('email_check', null, 'Email is available', { email });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate 6-digit OTP verification code
    const verificationToken = generateOTP();
    const verificationExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Use the first role as the primary role for backward compatibility
    const primaryRole = roleArray[0];

    // Insert user into database
    const [result] = await pool.execute(
      'INSERT INTO users (name, email, password, role, email_verification_token, email_verification_expires) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email, hashedPassword, primaryRole, verificationToken, verificationExpires]
    );

    const userId = result.insertId;

    // Insert roles into user_roles table
    for (const role of roleArray) {
      await pool.execute(
        'INSERT INTO user_roles (user_id, role, is_active) VALUES (?, ?, TRUE)',
        [userId, role]
      );
    }

    // Send OTP verification email
    try {
      await sendOTPEmail(email, name, verificationToken);
      logger.authInfo('otp_email_sent', userId, 'OTP verification email sent', { email });
    } catch (emailError) {
      logger.authError('otp_email_failed', emailError, userId);
      // Don't fail signup if email fails, but warn the user
    }

    // Generate JWT token with roles array
    const token = jwt.sign(
      { id: userId, email, roles: roleArray, activeRole: primaryRole },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    // Set HTTP-only cookie with the token
    res.cookie('auth_token', token, {
      httpOnly: true,        // Can't be accessed by JavaScript
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'lax',       // CSRF protection with better compatibility
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Also set user data in a separate cookie (not httpOnly so frontend can read it)
    const userData = transformToFrontend({
      id: userId,
      name,
      email,
      roles: roleArray,
      activeRole: primaryRole,
      email_verified: false // Not verified until user clicks email link
    });
    res.cookie('userData', JSON.stringify(userData), {
      httpOnly: false,       // Frontend needs to read this
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Return user data (also include token for backwards compatibility)
    const responseData = {
      status: 'success',
      token, // Still send token for now (will remove after frontend update)
      data: {
        user: userData
      },
      message: 'Account created successfully!'
    };

    logger.authInfo('signup_success', userId, 'Signup successful, setting cookies and sending response', {
      email,
      roles: roleArray,
      activeRole: primaryRole,
      tokenLength: token.length
    });

    // Send welcome notification to new user
    try {
      const notificationData = notificationTemplates.welcomeMessage(name, primaryRole);
      await createNotification(
        userId,
        notificationData.type,
        notificationData.title,
        notificationData.message,
        notificationData.actionUrl
      );
    } catch (notifyError) {
      logger.controllerWarn('authController', 'signup', 'Failed to send welcome notification', {
        userId,
        error: notifyError.message
      });
    }

    res.status(201).json(responseData);
  } catch (error) {
    logger.controllerError('authController', 'signup', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create account. Please try again.',
      error: error.message
    });
  }
};

/**
 * Sign in an existing user
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide email and password'
      });
    }

    // Find user by email with their roles
    const [users] = await pool.execute(
      'SELECT id, name, email, password, role, email_verified FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password'
      });
    }

    const user = users[0];

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password'
      });
    }

    // Get all active roles for the user
    const [userRoles] = await pool.execute(
      'SELECT role FROM user_roles WHERE user_id = ? AND is_active = TRUE',
      [user.id]
    );

    const roles = userRoles.map(role => role.role);

    // Intelligently determine the active role
    // If user has companion role, prefer it over client role
    let activeRole = user.role; // Default to primary role

    // Check if user has companion role and prioritize it
    if (roles.includes('companion')) {
      logger.authInfo('role_selection', user.id, 'User has companion role, setting as activeRole', { email: user.email });
      activeRole = 'companion';
    } else if (roles.includes('admin')) {
      logger.authInfo('role_selection', user.id, 'User has admin role, setting as activeRole', { email: user.email });
      activeRole = 'admin';
    }

    // Generate JWT token with roles array
    const token = jwt.sign(
      { id: user.id, email: user.email, roles, activeRole },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    // Set HTTP-only cookie with the token
    res.cookie('auth_token', token, {
      httpOnly: true,        // Can't be accessed by JavaScript
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'lax',       // CSRF protection with better compatibility
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Also set user data in a separate cookie (not httpOnly so frontend can read it)
    const userData = transformToFrontend({
      id: user.id,
      name: user.name,
      email: user.email,
      roles,
      activeRole,
      email_verified: !!user.email_verified // Ensure boolean, not 0/1
    });
    res.cookie('userData', JSON.stringify(userData), {
      httpOnly: false,       // Frontend needs to read this
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Return user data (also include token for backwards compatibility)
    res.status(200).json({
      status: 'success',
      token, // Still send token for now (will remove after frontend update)
      data: {
        user: userData
      }
    });
  } catch (error) {
    logger.controllerError('authController', 'login', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to sign in. Please try again.',
      error: error.message
    });
  }
};

/**
 * Get current user profile
 */
const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const [users] = await pool.execute(
      'SELECT id, name, email, role, email_verified, timezone, created_at FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Get all active roles for the user
    const [userRoles] = await pool.execute(
      'SELECT role FROM user_roles WHERE user_id = ? AND is_active = TRUE',
      [userId]
    );

    const roles = userRoles.map(role => role.role);
    const user = users[0];

    // Update userData cookie with fresh data from database - use transformToFrontend for consistency
    const userData = transformToFrontend({
      id: user.id,
      name: user.name,
      email: user.email,
      roles,
      activeRole: user.role,
      email_verified: !!user.email_verified, // Ensure boolean, not 0/1
      timezone: user.timezone || 'UTC'
    });
    res.cookie('userData', JSON.stringify(userData), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.status(200).json({
      status: 'success',
      data: {
        user: userData // Use transformed userData for consistent response
      }
    });
  } catch (error) {
    logger.controllerError('authController', 'getProfile', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch profile',
      error: error.message
    });
  }
};

/**
 * Verify email address
 */
const verifyEmail = async (req, res) => {
  try {
    const { otp, token } = req.body;
    const otpCode = otp || token; // Support both 'otp' and legacy 'token' field

    if (!otpCode) {
      return res.status(400).json({
        status: 'error',
        message: 'Verification code is required'
      });
    }

    // Get user from authenticated request or find by OTP
    let userId = req.user?.id;
    let user;

    if (userId) {
      // User is authenticated - verify their OTP
      const [users] = await pool.execute(
        'SELECT id, name, email, role, email_verification_token, email_verification_expires, otp_attempts FROM users WHERE id = ? AND email_verified = FALSE',
        [userId]
      );
      if (users.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'User not found or already verified'
        });
      }
      user = users[0];
    } else {
      // Legacy flow - find user by OTP token
      const [users] = await pool.execute(
        'SELECT id, name, email, role, email_verification_token, email_verification_expires, otp_attempts FROM users WHERE email_verification_token = ? AND email_verified = FALSE',
        [otpCode]
      );
      if (users.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid verification code'
        });
      }
      user = users[0];
    }

    // Check if too many wrong attempts (max 5)
    const attempts = user.otp_attempts || 0;
    if (attempts >= 5) {
      return res.status(400).json({
        status: 'error',
        message: 'Too many wrong attempts. Please request a new code.',
        requiresResend: true
      });
    }

    // Check if OTP matches (for authenticated users)
    if (userId && user.email_verification_token !== otpCode) {
      // Increment attempt counter
      await pool.execute(
        'UPDATE users SET otp_attempts = COALESCE(otp_attempts, 0) + 1 WHERE id = ?',
        [user.id]
      );
      const remainingAttempts = 4 - attempts;
      return res.status(400).json({
        status: 'error',
        message: `Invalid verification code. ${remainingAttempts > 0 ? `${remainingAttempts} attempts remaining.` : 'Please request a new code.'}`,
        remainingAttempts: Math.max(0, remainingAttempts)
      });
    }

    // Check if OTP is expired
    if (new Date() > new Date(user.email_verification_expires)) {
      return res.status(400).json({
        status: 'error',
        message: 'Verification code has expired. Please request a new one.',
        expired: true
      });
    }

    // Update user as verified and reset attempts
    await pool.execute(
      'UPDATE users SET email_verified = TRUE, email_verification_token = NULL, email_verification_expires = NULL, otp_attempts = 0 WHERE id = ?',
      [user.id]
    );

    // Get all user roles
    const [userRoles] = await pool.execute(
      'SELECT role FROM user_roles WHERE user_id = ? AND is_active = TRUE',
      [user.id]
    );
    const roles = userRoles.map(r => r.role);

    // Generate new JWT token with updated verification status
    const jwtToken = jwt.sign(
      { id: user.id, email: user.email, roles, activeRole: user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    // Update cookies with verified status
    res.cookie('auth_token', jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    const userData = transformToFrontend({
      id: user.id,
      name: user.name,
      email: user.email,
      roles,
      activeRole: user.role,
      email_verified: true // NOW VERIFIED
    });

    res.cookie('userData', JSON.stringify(userData), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(200).json({
      status: 'success',
      message: 'Email verified successfully!',
      data: {
        user: userData
      }
    });
  } catch (error) {
    logger.controllerError('authController', 'verifyEmail', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to verify email',
      error: error.message
    });
  }
};

/**
 * Resend verification email
 */
const resendVerification = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user details
    const [users] = await pool.execute(
      'SELECT id, name, email, role, email_verified FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    const user = users[0];

    if (user.email_verified) {
      // Email already verified - update cookie and return success
      // Get user roles
      const [userRoles] = await pool.execute(
        'SELECT role FROM user_roles WHERE user_id = ? AND is_active = TRUE',
        [userId]
      );
      const roles = userRoles.map(r => r.role);

      // Update userData cookie with verified status - use transformToFrontend for consistency
      const userData = transformToFrontend({
        id: user.id,
        name: user.name,
        email: user.email,
        roles,
        activeRole: user.role,
        email_verified: true
      });
      res.cookie('userData', JSON.stringify(userData), {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      return res.status(200).json({
        status: 'success',
        message: 'Your email is already verified!',
        alreadyVerified: true
      });
    }

    // Generate new 6-digit OTP
    const verificationToken = generateOTP();
    const verificationExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update user with new OTP and reset attempts
    await pool.execute(
      'UPDATE users SET email_verification_token = ?, email_verification_expires = ?, otp_attempts = 0 WHERE id = ?',
      [verificationToken, verificationExpires, userId]
    );

    // Send OTP verification email
    try {
      await sendOTPEmail(user.email, user.name, verificationToken);
      logger.authInfo('otp_email_resent', userId, 'OTP verification email resent', { email: user.email });
    } catch (emailError) {
      logger.authError('otp_email_failed', emailError, userId);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to send verification email'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Verification email sent successfully!'
    });
  } catch (error) {
    logger.controllerError('authController', 'resendVerification', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to resend verification email',
      error: error.message
    });
  }
};

/**
 * Switch user's active role
 */
const switchRole = async (req, res) => {
  try {
    const userId = req.user.id;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({
        status: 'error',
        message: 'Role is required'
      });
    }

    // Check if user has this role
    const [userRoles] = await pool.execute(
      'SELECT role FROM user_roles WHERE user_id = ? AND role = ? AND is_active = TRUE',
      [userId, role]
    );

    if (userRoles.length === 0) {
      return res.status(403).json({
        status: 'error',
        message: 'You do not have permission to switch to this role'
      });
    }

    // Update user's primary role in users table
    await pool.execute(
      'UPDATE users SET role = ? WHERE id = ?',
      [role, userId]
    );

    // Get all user roles for new token
    const [allUserRoles] = await pool.execute(
      'SELECT role FROM user_roles WHERE user_id = ? AND is_active = TRUE',
      [userId]
    );

    const roles = allUserRoles.map(r => r.role);

    // Get user's full data for the cookie
    const [users] = await pool.execute(
      'SELECT id, name, email, email_verified FROM users WHERE id = ?',
      [userId]
    );
    const user = users[0];

    // Generate new JWT token with updated active role
    const token = jwt.sign(
      { id: userId, email: req.user.email, roles, activeRole: role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    // Set updated HTTP-only cookie with new token
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    // Update user data cookie with new active role
    const userData = transformToFrontend({
      id: userId,
      name: user.name,
      email: user.email,
      roles,
      activeRole: role,
      email_verified: !!user.email_verified // Ensure boolean, not 0/1
    });
    res.cookie('userData', JSON.stringify(userData), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(200).json({
      status: 'success',
      token, // Still send token for backward compatibility
      data: {
        user: userData
      },
      message: `Successfully switched to ${role} role`
    });
  } catch (error) {
    logger.controllerError('authController', 'switchRole', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to switch role',
      error: error.message
    });
  }
};

/**
 * Sign out the current user by clearing cookies
 */
const signout = async (req, res) => {
  try {
    // Clear the auth token cookie
    res.cookie('auth_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: new Date(0) // Expire immediately
    });

    // Clear the user data cookie
    res.cookie('userData', '', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: new Date(0) // Expire immediately
    });

    res.status(200).json({
      status: 'success',
      message: 'Successfully signed out'
    });
  } catch (error) {
    logger.controllerError('authController', 'signout', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to sign out',
      error: error.message
    });
  }
};

/**
 * Delete user account
 * Requires email confirmation for safety
 */
const deleteAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;
    const { email } = req.body;

    // Verify email confirmation matches
    if (!email || email !== userEmail) {
      return res.status(400).json({
        status: 'error',
        message: 'Email confirmation does not match. Please enter your correct email address.'
      });
    }

    // Check if user has a Stripe Connect account and delete it first
    const [userCheck] = await pool.query(
      'SELECT stripe_account_id FROM users WHERE id = ? AND stripe_account_id IS NOT NULL',
      [userId]
    );

    if (userCheck.length > 0 && userCheck[0].stripe_account_id) {
      try {
        await stripe.accounts.del(userCheck[0].stripe_account_id);
        logger.authInfo('stripe_account_deleted', userId, 'Stripe Connect account deleted', {
          stripeAccountId: userCheck[0].stripe_account_id
        });
      } catch (stripeError) {
        logger.authError('stripe_account_deletion_failed', stripeError, userId, {
          stripeAccountId: userCheck[0].stripe_account_id,
          errorMessage: stripeError.message
        });
        // Continue with account deletion even if Stripe deletion fails
        // Better to delete user data than leave it because of external service error
      }
    }

    // Start transaction for safe deletion
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      logger.authInfo('account_deletion_start', userId, 'Starting account deletion', { email: userEmail });

      // Delete from companion-related tables
      await connection.query('DELETE FROM companion_interests WHERE companion_id = ?', [userId]);
      await connection.query('DELETE FROM companion_applications WHERE user_id = ?', [userId]);

      // Delete from client-related tables
      await connection.query('DELETE FROM client_verifications WHERE user_id = ?', [userId]);

      // Delete from booking-related tables
      await connection.query('DELETE FROM booking_reviews WHERE reviewer_id = ? OR reviewee_id = ?', [userId, userId]);
      await connection.query('DELETE FROM bookings WHERE client_id = ? OR companion_id = ?', [userId, userId]);

      // Delete from user_roles table
      await connection.query('DELETE FROM user_roles WHERE user_id = ?', [userId]);

      // Finally, delete the user account
      await connection.query('DELETE FROM users WHERE id = ?', [userId]);

      // Commit transaction
      await connection.commit();
      logger.authInfo('account_deletion_success', userId, 'Account deleted successfully');

      res.status(200).json({
        status: 'success',
        message: 'Your account has been permanently deleted.'
      });
    } catch (error) {
      // Rollback transaction on error
      await connection.rollback();
      logger.authError('account_deletion_transaction_error', error, userId);
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.controllerError('authController', 'deleteAccount', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete account. Please try again.',
      error: error.message
    });
  }
};

module.exports = {
  signup,
  login,
  signout,
  getProfile,
  verifyEmail,
  resendVerification,
  switchRole,
  deleteAccount
};
