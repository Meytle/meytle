/**
 * Admin Controller
 * Handles admin operations for managing applications and users
 */

const { pool } = require('../config/database');
const { createNotification, notificationTemplates } = require('../services/notificationService');
const { transformToFrontend, transformArrayToFrontend } = require('../utils/transformer');
const logger = require('../services/logger');

/**
 * Get admin dashboard statistics
 */
const getDashboardStats = async (req, res) => {
  try {
    // Get total users count
    const [usersCount] = await pool.execute(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN role = 'client' THEN 1 ELSE 0 END) as clients,
        SUM(CASE WHEN role = 'companion' THEN 1 ELSE 0 END) as companions
      FROM users`
    );

    // Get pending applications count
    const [pendingApps] = await pool.execute(
      `SELECT COUNT(*) as count FROM companion_applications WHERE status = 'pending'`
    );

    // Get pending client verifications count
    const [pendingClientVerifs] = await pool.execute(
      `SELECT COUNT(*) as count FROM client_verifications WHERE verification_status = 'pending'`
    );

    // Get total bookings count
    const [bookingsCount] = await pool.execute(
      `SELECT COUNT(*) as total FROM bookings`
    );

    // Get average rating from reviews
    const [avgRatingResult] = await pool.execute(
      `SELECT COALESCE(AVG(rating), 0) as avgRating FROM booking_reviews`
    );

    // Get total platform earnings (commission from captured payments)
    const [earningsResult] = await pool.execute(
      `SELECT
        COALESCE(SUM(total_amount), 0) as totalRevenue,
        COALESCE(SUM(platform_fee), 0) as totalCommission
      FROM payments
      WHERE payment_status = 'captured'`
    );

    res.json({
      status: 'success',
      data: {
        users: {
          total: usersCount[0].total,
          clients: usersCount[0].clients,
          companions: usersCount[0].companions
        },
        pendingApplications: pendingApps[0].count,
        pendingClientVerifications: pendingClientVerifs[0].count,
        bookings: {
          total: bookingsCount[0].total,
          avgRating: parseFloat(avgRatingResult[0].avgRating) || 0
        },
        earnings: {
          total: parseFloat(earningsResult[0].totalRevenue) || 0,
          commission: parseFloat(earningsResult[0].totalCommission) || 0
        }
      }
    });
  } catch (error) {
    logger.controllerError('adminController', 'getDashboardStats', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch dashboard statistics'
    });
  }
};

/**
 * Get all companion applications (with filters)
 */
const getApplications = async (req, res) => {
  try {
    const { status } = req.query;

    let query = `
      SELECT 
        ca.*,
        u.name,
        u.email
      FROM companion_applications ca
      JOIN users u ON ca.user_id = u.id
    `;

    const params = [];

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      query += ' WHERE ca.status = ?';
      params.push(status);
    }

    query += ' ORDER BY ca.created_at DESC';

    const [applications] = await pool.execute(query, params);

    res.json({
      status: 'success',
      data: transformArrayToFrontend(applications)
    });
  } catch (error) {
    logger.controllerError('adminController', 'getApplications', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch applications'
    });
  }
};

/**
 * Approve companion application
 */
const approveApplication = async (req, res) => {
  try {
    const { applicationId } = req.params;

    // Get application details
    const [applications] = await pool.execute(
      'SELECT user_id FROM companion_applications WHERE id = ?',
      [applicationId]
    );

    if (applications.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Application not found'
      });
    }

    const userId = applications[0].user_id;

    // Update application status
    await pool.execute(
      `UPDATE companion_applications
       SET status = 'approved', reviewed_at = NOW()
       WHERE id = ?`,
      [applicationId]
    );

    // Update user role to companion in users table
    await pool.execute(
      `UPDATE users SET role = 'companion' WHERE id = ?`,
      [userId]
    );

    // Check if companion role exists in user_roles table
    const [existingRole] = await pool.execute(
      'SELECT * FROM user_roles WHERE user_id = ? AND role = ?',
      [userId, 'companion']
    );

    if (existingRole.length === 0) {
      // Add companion role to user_roles table
      await pool.execute(
        'INSERT INTO user_roles (user_id, role, is_active) VALUES (?, ?, TRUE)',
        [userId, 'companion']
      );
      logger.controllerInfo('adminController', 'approveApplication', 'Added companion role to user_roles', { userId });
    } else {
      // Ensure the companion role is active
      await pool.execute(
        'UPDATE user_roles SET is_active = TRUE WHERE user_id = ? AND role = ?',
        [userId, 'companion']
      );
      logger.controllerInfo('adminController', 'approveApplication', 'Activated companion role', { userId });
    }

    logger.controllerInfo('adminController', 'approveApplication', 'Application approved', { applicationId, userId });

    // Send notification to the companion
    try {
      const notificationData = notificationTemplates.applicationApproved();
      await createNotification(
        userId,
        notificationData.type,
        notificationData.title,
        notificationData.message,
        notificationData.actionUrl
      );
      logger.controllerInfo('adminController', 'approveApplication', 'Notification sent about application approval', { userId });
    } catch (notificationError) {
      logger.controllerError('adminController', 'approveApplication', notificationError, req);
      // Don't fail the whole operation if notification fails
    }

    res.json({
      status: 'success',
      message: 'Application approved successfully'
    });
  } catch (error) {
    logger.controllerError('adminController', 'approveApplication', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to approve application'
    });
  }
};

/**
 * Reject companion application
 */
const rejectApplication = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { reason } = req.body;

    // Check if application exists and get user ID
    const [applications] = await pool.execute(
      'SELECT id, user_id FROM companion_applications WHERE id = ?',
      [applicationId]
    );

    if (applications.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Application not found'
      });
    }

    const userId = applications[0].user_id;

    // Update application status
    await pool.execute(
      `UPDATE companion_applications
       SET status = 'rejected', rejection_reason = ?, reviewed_at = NOW()
       WHERE id = ?`,
      [reason || 'Application rejected by admin', applicationId]
    );

    logger.controllerInfo('adminController', 'rejectApplication', 'Application rejected', { applicationId, reason });

    // Send notification to the companion
    try {
      const notificationData = notificationTemplates.applicationRejected(reason || 'Application needs improvements');
      await createNotification(
        userId,
        notificationData.type,
        notificationData.title,
        notificationData.message,
        notificationData.actionUrl
      );
      logger.controllerInfo('adminController', 'rejectApplication', 'Notification sent about application rejection', { userId });
    } catch (notificationError) {
      logger.controllerError('adminController', 'rejectApplication', notificationError, req);
      // Don't fail the whole operation if notification fails
    }

    res.json({
      status: 'success',
      message: 'Application rejected successfully'
    });
  } catch (error) {
    logger.controllerError('adminController', 'rejectApplication', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to reject application'
    });
  }
};

/**
 * Get all users
 */
const getUsers = async (req, res) => {
  try {
    const { role } = req.query;

    let query = 'SELECT id, name, email, role, created_at FROM users';
    const params = [];

    if (role && ['client', 'companion', 'admin'].includes(role)) {
      query += ' WHERE role = ?';
      params.push(role);
    }

    query += ' ORDER BY created_at DESC';

    const [users] = await pool.execute(query, params);

    res.json({
      status: 'success',
      data: transformArrayToFrontend(users)
    });
  } catch (error) {
    logger.controllerError('adminController', 'getUsers', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch users'
    });
  }
};

/**
 * Delete user
 */
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user exists
    const [users] = await pool.execute('SELECT id, role FROM users WHERE id = ?', [userId]);

    if (users.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Prevent deleting admin users
    if (users[0].role === 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Cannot delete admin users'
      });
    }

    // Delete user (cascade will handle related records)
    await pool.execute('DELETE FROM users WHERE id = ?', [userId]);

    logger.controllerInfo('adminController', 'deleteUser', 'User deleted successfully', { userId });

    res.json({
      status: 'success',
      message: 'User deleted successfully'
    });
  } catch (error) {
    logger.controllerError('adminController', 'deleteUser', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete user'
    });
  }
};

/**
 * Check data integrity for companion availability
 * Admin-only endpoint to verify no data cross-contamination
 */
const checkAvailabilityIntegrity = async (req, res) => {
  try {
    logger.controllerInfo('adminController', 'checkAvailabilityIntegrity', 'Admin checking availability data integrity', { adminId: req.user?.id });

    // Call the stored procedure to check integrity
    const [results] = await pool.execute('CALL check_availability_integrity()');

    // Format the results
    const integrityReport = {
      orphanedRecords: results[0] || [],
      invalidRoles: results[1] || [],
      duplicateSlots: results[2] || [],
      overlappingSlots: results[3] || []
    };

    // Check if any issues were found
    const hasIssues = Object.values(integrityReport).some(
      issues => issues.length > 0 && issues[0].issue_count > 0
    );

    res.json({
      status: 'success',
      data: {
        hasIssues,
        report: integrityReport,
        checkedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.controllerError('adminController', 'checkAvailabilityIntegrity', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to check data integrity',
      error: error.message
    });
  }
};

/**
 * Get availability audit logs
 * Admin-only endpoint to view all availability changes
 */
const getAvailabilityAuditLogs = async (req, res) => {
  try {
    const { companionId, startDate, endDate, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT
        aal.*,
        u1.name as companion_name,
        u1.email as companion_email,
        u2.name as changed_by_name,
        u2.email as changed_by_email
      FROM availability_audit_log aal
      LEFT JOIN users u1 ON aal.companion_id = u1.id
      LEFT JOIN users u2 ON aal.changed_by_id = u2.id
      WHERE 1=1
    `;
    const queryParams = [];

    if (companionId) {
      query += ' AND aal.companion_id = ?';
      queryParams.push(companionId);
    }

    if (startDate) {
      query += ' AND aal.changed_at >= ?';
      queryParams.push(startDate);
    }

    if (endDate) {
      query += ' AND aal.changed_at <= ?';
      queryParams.push(endDate);
    }

    const safeLimit = parseInt(limit);
    const safeOffset = parseInt(offset);
    query += ` ORDER BY aal.changed_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;

    const [logs] = await pool.execute(query, queryParams);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM availability_audit_log aal
      WHERE 1=1
    `;
    const countParams = [];

    if (companionId) {
      countQuery += ' AND aal.companion_id = ?';
      countParams.push(companionId);
    }

    if (startDate) {
      countQuery += ' AND aal.changed_at >= ?';
      countParams.push(startDate);
    }

    if (endDate) {
      countQuery += ' AND aal.changed_at <= ?';
      countParams.push(endDate);
    }

    const [countResult] = await pool.execute(countQuery, countParams);
    const total = countResult[0].total;

    res.json({
      status: 'success',
      data: {
        logs: transformArrayToFrontend(logs),
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: parseInt(offset) + parseInt(limit) < total
        }
      }
    });
  } catch (error) {
    logger.controllerError('adminController', 'getAvailabilityAuditLogs', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch audit logs',
      error: error.message
    });
  }
};

/**
 * Clean up invalid availability data
 * Admin-only endpoint to fix data issues
 */
const cleanupAvailabilityData = async (req, res) => {
  try {
    const { dryRun = true } = req.body;

    logger.controllerInfo('adminController', 'cleanupAvailabilityData', 'Starting availability data cleanup', { dryRun, adminId: req.user?.id });

    const issues = [];

    // 1. Find and remove orphaned records
    const [orphaned] = await pool.execute(`
      SELECT ca.*
      FROM companion_availability ca
      LEFT JOIN users u ON ca.companion_id = u.id
      WHERE u.id IS NULL
    `);

    if (orphaned.length > 0) {
      issues.push({
        type: 'orphaned',
        count: orphaned.length,
        records: orphaned
      });

      if (!dryRun) {
        await pool.execute(`
          DELETE ca FROM companion_availability ca
          LEFT JOIN users u ON ca.companion_id = u.id
          WHERE u.id IS NULL
        `);
      }
    }

    // 2. Find and remove availability for non-companions
    const [invalidRole] = await pool.execute(`
      SELECT ca.*
      FROM companion_availability ca
      LEFT JOIN user_roles ur ON ca.companion_id = ur.user_id AND ur.role = 'companion'
      WHERE ur.user_id IS NULL
    `);

    if (invalidRole.length > 0) {
      issues.push({
        type: 'invalid_role',
        count: invalidRole.length,
        records: invalidRole
      });

      if (!dryRun) {
        await pool.execute(`
          DELETE ca FROM companion_availability ca
          LEFT JOIN user_roles ur ON ca.companion_id = ur.user_id AND ur.role = 'companion'
          WHERE ur.user_id IS NULL
        `);
      }
    }

    // 3. Remove duplicate slots (keep the most recent)
    const [duplicates] = await pool.execute(`
      SELECT companion_id, day_of_week, start_time, COUNT(*) as cnt
      FROM companion_availability
      GROUP BY companion_id, day_of_week, start_time
      HAVING cnt > 1
    `);

    if (duplicates.length > 0) {
      issues.push({
        type: 'duplicates',
        count: duplicates.length,
        records: duplicates
      });

      if (!dryRun) {
        for (const dup of duplicates) {
          // Keep only the most recent one
          await pool.execute(`
            DELETE FROM companion_availability
            WHERE companion_id = ? AND day_of_week = ? AND start_time = ?
            AND id NOT IN (
              SELECT id FROM (
                SELECT MAX(id) as id
                FROM companion_availability
                WHERE companion_id = ? AND day_of_week = ? AND start_time = ?
              ) as keeper
            )
          `, [dup.companion_id, dup.day_of_week, dup.start_time,
              dup.companion_id, dup.day_of_week, dup.start_time]);
        }
      }
    }

    const cleanupResult = {
      dryRun,
      issuesFound: issues.length > 0,
      issues,
      message: dryRun
        ? 'Dry run completed. No data was modified.'
        : 'Cleanup completed. Invalid data has been removed.'
    };

    // Log the cleanup action
    if (!dryRun && issues.length > 0) {
      await pool.execute(
        `INSERT INTO availability_audit_log
         (companion_id, action, old_data, new_data, changed_by_id, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          0, // System action
          'ADMIN_CLEANUP',
          JSON.stringify(issues),
          null,
          req.user.id,
          req.ip || req.connection.remoteAddress,
          'Admin Dashboard'
        ]
      );
    }

    res.json({
      status: 'success',
      data: cleanupResult
    });
  } catch (error) {
    logger.controllerError('adminController', 'cleanupAvailabilityData', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to cleanup availability data',
      error: error.message
    });
  }
};

/**
 * Get client verifications for admin review
 */
const getClientVerifications = async (req, res) => {
  try {
    const { status = 'pending' } = req.query;

    const query = `
      SELECT
        cv.id,
        cv.user_id,
        cv.profile_photo_url,
        cv.id_document_url,
        cv.date_of_birth,
        cv.government_id_number,
        cv.phone_number,
        cv.location,
        cv.address_line,
        cv.city,
        cv.state,
        cv.country,
        cv.postal_code,
        cv.bio,
        cv.verification_status,
        cv.rejection_reason,
        cv.created_at,
        cv.verified_at,
        cv.reviewed_at,
        u.name,
        u.email
      FROM client_verifications cv
      INNER JOIN users u ON cv.user_id = u.id
      WHERE cv.verification_status = ?
      ORDER BY cv.created_at ASC
    `;

    const [verifications] = await pool.execute(query, [status]);

    res.json({
      status: 'success',
      data: transformArrayToFrontend(verifications)
    });
  } catch (error) {
    logger.controllerError('adminController', 'getClientVerifications', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch client verifications',
      error: error.message
    });
  }
};

/**
 * Approve client verification
 */
const approveClientVerification = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if verification exists
    const [verification] = await pool.execute(
      'SELECT * FROM client_verifications WHERE id = ?',
      [id]
    );

    if (verification.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Client verification not found'
      });
    }

    // Update verification status
    await pool.execute(
      `UPDATE client_verifications
       SET verification_status = 'approved',
           verified_at = CURRENT_TIMESTAMP,
           reviewed_at = CURRENT_TIMESTAMP,
           rejection_reason = NULL
       WHERE id = ?`,
      [id]
    );

    logger.controllerInfo('adminController', 'approveClientVerification', 'Client verification approved', { verificationId: id, adminId: req.user?.id });

    res.json({
      status: 'success',
      message: 'Client verification approved successfully'
    });
  } catch (error) {
    logger.controllerError('adminController', 'approveClientVerification', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to approve client verification',
      error: error.message
    });
  }
};

/**
 * Reject client verification
 */
const rejectClientVerification = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        status: 'error',
        message: 'Rejection reason is required'
      });
    }

    // Check if verification exists
    const [verification] = await pool.execute(
      'SELECT * FROM client_verifications WHERE id = ?',
      [id]
    );

    if (verification.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Client verification not found'
      });
    }

    // Update verification status
    await pool.execute(
      `UPDATE client_verifications
       SET verification_status = 'rejected',
           reviewed_at = CURRENT_TIMESTAMP,
           rejection_reason = ?
       WHERE id = ?`,
      [reason, id]
    );

    logger.controllerInfo('adminController', 'rejectClientVerification', 'Client verification rejected', { verificationId: id, adminId: req.user?.id, reason });

    res.json({
      status: 'success',
      message: 'Client verification rejected'
    });
  } catch (error) {
    logger.controllerError('adminController', 'rejectClientVerification', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to reject client verification',
      error: error.message
    });
  }
};

/**
 * Get disputed bookings (no OTP verification after meeting time)
 * Admin-only endpoint to review payment disputes
 */
const getDisputedBookings = async (req, res) => {
  try {
    const { limit = 50, offset = 0, status = 'all' } = req.query;

    let query = `
      SELECT
        b.id,
        b.booking_date,
        b.start_time,
        b.end_time,
        b.duration_hours,
        b.total_amount,
        b.platform_fee_amount,
        b.payment_status,
        b.payment_intent_id,
        b.status as booking_status,
        b.otp_verified_at,
        b.created_at,
        b.meeting_location,
        b.special_requests,
        client.id as client_id,
        client.name as client_name,
        client.email as client_email,
        companion.id as companion_id,
        companion.name as companion_name,
        companion.email as companion_email,
        companion.stripe_account_id as companion_stripe_account_id,
        sc.name as service_category_name
      FROM bookings b
      JOIN users client ON b.client_id = client.id
      JOIN users companion ON b.companion_id = companion.id
      LEFT JOIN service_categories sc ON b.service_category_id = sc.id
      WHERE b.status = 'confirmed'
        AND b.payment_intent_id IS NOT NULL
        AND b.otp_verified_at IS NULL
        AND CONCAT(b.booking_date, ' ', b.end_time) < NOW()
    `;

    const params = [];

    // Optional: filter by resolution status
    if (status === 'unresolved') {
      query += ' AND b.admin_resolved = FALSE';
    } else if (status === 'resolved') {
      query += ' AND b.admin_resolved = TRUE';
    }

    const safeLimit = parseInt(limit);
    const safeOffset = parseInt(offset);
    query += ` ORDER BY b.booking_date DESC, b.start_time DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;

    const [disputes] = await pool.execute(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM bookings b
      WHERE b.status = 'confirmed'
        AND b.payment_intent_id IS NOT NULL
        AND b.otp_verified_at IS NULL
        AND CONCAT(b.booking_date, ' ', b.end_time) < NOW()
    `;

    if (status === 'unresolved') {
      countQuery += ' AND b.admin_resolved = FALSE';
    } else if (status === 'resolved') {
      countQuery += ' AND b.admin_resolved = TRUE';
    }

    const [countResult] = await pool.execute(countQuery);
    const total = countResult[0].total;

    logger.controllerInfo('adminController', 'getDisputedBookings', 'Fetched disputed bookings', {
      count: disputes.length,
      total,
      adminId: req.user?.id
    });

    res.json({
      status: 'success',
      data: {
        disputes: transformArrayToFrontend(disputes),
        pagination: {
          total,
          limit: safeLimit,
          offset: safeOffset,
          hasMore: safeOffset + safeLimit < total
        }
      }
    });
  } catch (error) {
    logger.controllerError('adminController', 'getDisputedBookings', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch disputed bookings',
      error: error.message
    });
  }
};

/**
 * Admin resolves dispute - Issue full refund to client
 */
const adminRefundBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { reason } = req.body;

    const stripeService = require('../services/stripeService');
    const { createNotification } = require('../services/notificationService');

    // Get booking details
    const [bookings] = await pool.execute(
      `SELECT
         b.*,
         client.email as client_email,
         client.name as client_name,
         companion.email as companion_email,
         companion.name as companion_name
       FROM bookings b
       JOIN users client ON b.client_id = client.id
       JOIN users companion ON b.companion_id = companion.id
       WHERE b.id = ?`,
      [bookingId]
    );

    if (bookings.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found'
      });
    }

    const booking = bookings[0];

    // Verify it's a disputed booking
    if (!booking.payment_intent_id) {
      return res.status(400).json({
        status: 'error',
        message: 'No payment to refund'
      });
    }

    // Cancel authorization (full refund)
    await stripeService.cancelAuthorization(bookingId);

    // Update booking status
    await pool.execute(
      `UPDATE bookings
       SET status = 'cancelled',
           cancelled_at = NOW(),
           cancelled_by = 'admin',
           cancellation_reason = ?,
           admin_resolved = TRUE,
           admin_resolution_type = 'refunded',
           admin_resolved_by = ?,
           admin_resolved_at = NOW()
       WHERE id = ?`,
      [reason || 'Admin resolved: Full refund issued', req.user.id, bookingId]
    );

    // Send notifications
    try {
      await createNotification(
        booking.client_id,
        'booking_refunded',
        'Booking Refunded',
        `Your booking on ${booking.booking_date} has been refunded. Reason: ${reason || 'Admin decision'}`,
        `/client/bookings/${bookingId}`
      );

      await createNotification(
        booking.companion_id,
        'booking_cancelled',
        'Booking Cancelled by Admin',
        `Booking on ${booking.booking_date} was cancelled by admin. No payment will be received.`,
        `/companion/dashboard?tab=bookings`
      );
    } catch (notifError) {
      logger.controllerError('adminController', 'adminRefundBooking', notifError, req);
    }

    logger.controllerInfo('adminController', 'adminRefundBooking', 'Admin refunded booking', {
      bookingId,
      adminId: req.user.id,
      reason
    });

    res.json({
      status: 'success',
      message: 'Booking refunded successfully',
      data: {
        bookingId,
        action: 'refunded',
        amount: booking.total_amount
      }
    });
  } catch (error) {
    logger.controllerError('adminController', 'adminRefundBooking', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to refund booking',
      error: error.message
    });
  }
};

/**
 * Admin resolves dispute - Capture payment and pay companion
 */
const adminCapturePayment = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { reason } = req.body;

    const stripeService = require('../services/stripeService');
    const { createNotification } = require('../services/notificationService');

    // Get booking details
    const [bookings] = await pool.execute(
      `SELECT
         b.*,
         client.email as client_email,
         client.name as client_name,
         companion.email as companion_email,
         companion.name as companion_name,
         companion.stripe_account_id as companion_stripe_account_id
       FROM bookings b
       JOIN users client ON b.client_id = client.id
       JOIN users companion ON b.companion_id = companion.id
       WHERE b.id = ?`,
      [bookingId]
    );

    if (bookings.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found'
      });
    }

    const booking = bookings[0];

    // Verify it's a disputed booking
    if (!booking.payment_intent_id) {
      return res.status(400).json({
        status: 'error',
        message: 'No payment intent found'
      });
    }

    if (!booking.companion_stripe_account_id) {
      return res.status(400).json({
        status: 'error',
        message: 'Companion does not have a payout account set up'
      });
    }

    // Capture payment
    await stripeService.capturePayment(bookingId);

    // Transfer to companion
    await stripeService.transferToCompanion(bookingId);

    // Update booking status
    await pool.execute(
      `UPDATE bookings
       SET status = 'completed',
           payment_released_at = NOW(),
           admin_resolved = TRUE,
           admin_resolution_type = 'paid_companion',
           admin_resolved_by = ?,
           admin_resolved_at = NOW(),
           admin_resolution_notes = ?
       WHERE id = ?`,
      [req.user.id, reason || 'Admin verified meeting occurred', bookingId]
    );

    // Send notifications
    try {
      await createNotification(
        booking.client_id,
        'booking_completed',
        'Booking Completed',
        `Your booking on ${booking.booking_date} has been completed and payment processed.`,
        `/client/bookings/${bookingId}`
      );

      await createNotification(
        booking.companion_id,
        'payment_released',
        'Payment Released',
        `Payment for booking on ${booking.booking_date} has been released to your account.`,
        `/companion/dashboard?tab=earnings`
      );
    } catch (notifError) {
      logger.controllerError('adminController', 'adminCapturePayment', notifError, req);
    }

    logger.controllerInfo('adminController', 'adminCapturePayment', 'Admin captured payment', {
      bookingId,
      adminId: req.user.id,
      amount: booking.total_amount,
      reason
    });

    res.json({
      status: 'success',
      message: 'Payment captured and transferred successfully',
      data: {
        bookingId,
        action: 'captured',
        clientCharged: booking.total_amount,
        companionPaid: booking.total_amount * 0.9,
        platformFee: booking.total_amount * 0.1
      }
    });
  } catch (error) {
    logger.controllerError('adminController', 'adminCapturePayment', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to capture payment',
      error: error.message
    });
  }
};

/**
 * Admin marks dispute as resolved without payment action
 */
const adminMarkResolved = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { notes } = req.body;

    // Update booking
    await pool.execute(
      `UPDATE bookings
       SET admin_resolved = TRUE,
           admin_resolution_type = 'no_action',
           admin_resolved_by = ?,
           admin_resolved_at = NOW(),
           admin_resolution_notes = ?
       WHERE id = ?`,
      [req.user.id, notes || 'Manually marked as resolved', bookingId]
    );

    logger.controllerInfo('adminController', 'adminMarkResolved', 'Admin marked dispute as resolved', {
      bookingId,
      adminId: req.user.id,
      notes
    });

    res.json({
      status: 'success',
      message: 'Dispute marked as resolved'
    });
  } catch (error) {
    logger.controllerError('adminController', 'adminMarkResolved', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to mark dispute as resolved',
      error: error.message
    });
  }
};

/**
 * =====================================================
 * BOOKINGS MANAGEMENT ENDPOINTS
 * =====================================================
 */

/**
 * Get all bookings with filters
 */
const getAllBookings = async (req, res) => {
  try {
    const {
      status,
      paymentStatus,
      clientId,
      companionId,
      startDate,
      endDate,
      limit = 50,
      offset = 0
    } = req.query;

    let query = `
      SELECT
        b.id,
        b.booking_date,
        b.start_time,
        b.end_time,
        b.duration_hours,
        b.total_amount,
        b.platform_fee_amount,
        b.payment_status,
        b.payment_intent_id,
        b.status,
        b.otp_verified_at,
        b.created_at,
        b.meeting_location,
        b.cancelled_by,
        b.cancellation_reason,
        b.admin_resolved,
        b.admin_resolution_type,
        client.id as client_id,
        client.name as client_name,
        client.email as client_email,
        companion.id as companion_id,
        companion.name as companion_name,
        companion.email as companion_email,
        sc.name as service_category_name
      FROM bookings b
      JOIN users client ON b.client_id = client.id
      JOIN users companion ON b.companion_id = companion.id
      LEFT JOIN service_categories sc ON b.service_category_id = sc.id
      WHERE 1=1
    `;

    const params = [];

    if (status) {
      query += ' AND b.status = ?';
      params.push(status);
    }

    if (paymentStatus) {
      query += ' AND b.payment_status = ?';
      params.push(paymentStatus);
    }

    if (clientId) {
      query += ' AND b.client_id = ?';
      params.push(clientId);
    }

    if (companionId) {
      query += ' AND b.companion_id = ?';
      params.push(companionId);
    }

    if (startDate) {
      query += ' AND b.booking_date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND b.booking_date <= ?';
      params.push(endDate);
    }

    const safeLimit = parseInt(limit) || 50;
    const safeOffset = parseInt(offset) || 0;
    query += ' ORDER BY b.created_at DESC LIMIT ? OFFSET ?';
    params.push(safeLimit, safeOffset);

    // Use pool.query() instead of pool.execute() - execute() has strict type requirements for LIMIT/OFFSET
    const [bookings] = await pool.query(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total FROM bookings b WHERE 1=1
    `;
    const countParams = [];

    if (status) {
      countQuery += ' AND b.status = ?';
      countParams.push(status);
    }
    if (paymentStatus) {
      countQuery += ' AND b.payment_status = ?';
      countParams.push(paymentStatus);
    }
    if (clientId) {
      countQuery += ' AND b.client_id = ?';
      countParams.push(clientId);
    }
    if (companionId) {
      countQuery += ' AND b.companion_id = ?';
      countParams.push(companionId);
    }
    if (startDate) {
      countQuery += ' AND b.booking_date >= ?';
      countParams.push(startDate);
    }
    if (endDate) {
      countQuery += ' AND b.booking_date <= ?';
      countParams.push(endDate);
    }

    const [countResult] = await pool.execute(countQuery, countParams);
    const total = countResult[0].total;

    res.json({
      status: 'success',
      data: {
        bookings: transformArrayToFrontend(bookings),
        pagination: {
          total,
          limit: safeLimit,
          offset: safeOffset,
          hasMore: safeOffset + safeLimit < total
        }
      }
    });
  } catch (error) {
    logger.controllerError('adminController', 'getAllBookings', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch bookings'
    });
  }
};

/**
 * Get booking statistics
 */
const getBookingStats = async (req, res) => {
  try {
    const [stats] = await pool.execute(`
      SELECT
        COUNT(*) as total_bookings,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) as no_show,
        SUM(total_amount) as total_revenue,
        SUM(platform_fee_amount) as total_platform_fees,
        AVG(total_amount) as avg_booking_value
      FROM bookings
    `);

    // Get bookings by month for the last 6 months
    const [monthlyStats] = await pool.execute(`
      SELECT
        DATE_FORMAT(booking_date, '%Y-%m') as month,
        COUNT(*) as count,
        SUM(total_amount) as revenue
      FROM bookings
      WHERE booking_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
      GROUP BY DATE_FORMAT(booking_date, '%Y-%m')
      ORDER BY month DESC
    `);

    res.json({
      status: 'success',
      data: {
        overview: stats[0],
        monthlyTrend: monthlyStats
      }
    });
  } catch (error) {
    logger.controllerError('adminController', 'getBookingStats', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch booking statistics'
    });
  }
};

/**
 * Admin cancel booking
 */
const adminCancelBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { reason, refund = true } = req.body;

    const stripeService = require('../services/stripeService');

    // Get booking
    const [bookings] = await pool.execute(
      'SELECT * FROM bookings WHERE id = ?',
      [bookingId]
    );

    if (bookings.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found'
      });
    }

    const booking = bookings[0];

    // If payment was made and refund is requested
    if (refund && booking.payment_intent_id && booking.payment_status !== 'refunded') {
      try {
        await stripeService.cancelAuthorization(bookingId);
      } catch (stripeError) {
        logger.controllerError('adminController', 'adminCancelBooking', stripeError, req);
      }
    }

    // Update booking
    await pool.execute(
      `UPDATE bookings
       SET status = 'cancelled',
           cancelled_at = NOW(),
           cancelled_by = 'admin',
           cancellation_reason = ?,
           payment_status = ?
       WHERE id = ?`,
      [reason || 'Cancelled by admin', refund ? 'refunded' : booking.payment_status, bookingId]
    );

    logger.controllerInfo('adminController', 'adminCancelBooking', 'Booking cancelled', {
      bookingId,
      adminId: req.user.id,
      reason,
      refund
    });

    res.json({
      status: 'success',
      message: 'Booking cancelled successfully'
    });
  } catch (error) {
    logger.controllerError('adminController', 'adminCancelBooking', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to cancel booking'
    });
  }
};

/**
 * =====================================================
 * EARNINGS MANAGEMENT ENDPOINTS
 * =====================================================
 */

/**
 * Get earnings summary
 */
const getEarningsSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let dateFilter = '';
    const params = [];

    if (startDate && endDate) {
      dateFilter = 'AND b.booking_date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }

    // Get overall earnings
    const [earnings] = await pool.execute(`
      SELECT
        COUNT(*) as total_bookings,
        SUM(total_amount) as gross_revenue,
        SUM(platform_fee_amount) as platform_commission,
        SUM(total_amount - platform_fee_amount) as companion_payouts,
        SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END) as captured_revenue,
        SUM(CASE WHEN payment_status = 'authorized' THEN total_amount ELSE 0 END) as pending_capture,
        SUM(CASE WHEN payment_status = 'refunded' THEN total_amount ELSE 0 END) as refunded_amount
      FROM bookings b
      WHERE status IN ('completed', 'confirmed') ${dateFilter}
    `, params);

    // Get earnings by month
    const [monthlyEarnings] = await pool.execute(`
      SELECT
        DATE_FORMAT(booking_date, '%Y-%m') as month,
        SUM(total_amount) as gross_revenue,
        SUM(platform_fee_amount) as platform_commission,
        COUNT(*) as booking_count
      FROM bookings
      WHERE status IN ('completed', 'confirmed')
        AND booking_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(booking_date, '%Y-%m')
      ORDER BY month DESC
    `);

    // Get top earning companions
    const [topCompanions] = await pool.execute(`
      SELECT
        u.id,
        u.name,
        u.email,
        COUNT(b.id) as booking_count,
        SUM(b.total_amount) as total_earnings,
        SUM(b.total_amount - b.platform_fee_amount) as companion_earnings
      FROM bookings b
      JOIN users u ON b.companion_id = u.id
      WHERE b.status IN ('completed', 'confirmed')
      GROUP BY u.id
      ORDER BY total_earnings DESC
      LIMIT 10
    `);

    res.json({
      status: 'success',
      data: {
        summary: earnings[0],
        monthlyTrend: monthlyEarnings,
        topCompanions: transformArrayToFrontend(topCompanions)
      }
    });
  } catch (error) {
    logger.controllerError('adminController', 'getEarningsSummary', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch earnings summary'
    });
  }
};

/**
 * Get earnings by companion
 */
const getEarningsByCompanion = async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const safeLimit = parseInt(limit) || 50;
    const safeOffset = parseInt(offset) || 0;

    // Use pool.query() instead of pool.execute() - execute() has strict type requirements for LIMIT/OFFSET
    const [companions] = await pool.query(`
      SELECT
        u.id,
        u.name,
        u.email,
        u.stripe_account_id,
        u.stripe_account_status,
        COUNT(b.id) as total_bookings,
        SUM(CASE WHEN b.status = 'completed' THEN 1 ELSE 0 END) as completed_bookings,
        SUM(b.total_amount) as gross_earnings,
        SUM(b.total_amount - b.platform_fee_amount) as net_earnings,
        SUM(CASE WHEN b.transfer_status = 'completed' THEN (b.total_amount - b.platform_fee_amount) ELSE 0 END) as paid_out,
        SUM(CASE WHEN b.transfer_status = 'pending' OR b.transfer_status IS NULL THEN (b.total_amount - b.platform_fee_amount) ELSE 0 END) as pending_payout
      FROM users u
      LEFT JOIN bookings b ON u.id = b.companion_id AND b.status IN ('completed', 'confirmed')
      WHERE u.role = 'companion'
      GROUP BY u.id
      ORDER BY gross_earnings DESC
      LIMIT ? OFFSET ?
    `, [safeLimit, safeOffset]);

    // Get total count
    const [countResult] = await pool.execute(
      'SELECT COUNT(*) as total FROM users WHERE role = ?',
      ['companion']
    );

    res.json({
      status: 'success',
      data: {
        companions: transformArrayToFrontend(companions),
        pagination: {
          total: countResult[0].total,
          limit: safeLimit,
          offset: safeOffset
        }
      }
    });
  } catch (error) {
    logger.controllerError('adminController', 'getEarningsByCompanion', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch companion earnings'
    });
  }
};

/**
 * Get payment transactions
 */
const getPaymentTransactions = async (req, res) => {
  try {
    const { status, startDate, endDate, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT
        b.id as booking_id,
        b.payment_intent_id,
        b.total_amount,
        b.platform_fee_amount,
        b.payment_status,
        b.transfer_id,
        b.transfer_status,
        b.booking_date,
        b.created_at,
        b.cancelled_at,
        client.name as client_name,
        client.email as client_email,
        companion.name as companion_name,
        companion.email as companion_email
      FROM bookings b
      JOIN users client ON b.client_id = client.id
      JOIN users companion ON b.companion_id = companion.id
      WHERE b.payment_intent_id IS NOT NULL
    `;

    const params = [];

    if (status) {
      query += ' AND b.payment_status = ?';
      params.push(status);
    }

    if (startDate) {
      query += ' AND b.created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND b.created_at <= ?';
      params.push(endDate);
    }

    const safeLimit = parseInt(limit) || 50;
    const safeOffset = parseInt(offset) || 0;
    query += ' ORDER BY b.created_at DESC LIMIT ? OFFSET ?';
    params.push(safeLimit, safeOffset);

    // Use pool.query() instead of pool.execute() - execute() has strict type requirements for LIMIT/OFFSET
    const [transactions] = await pool.query(query, params);

    // Get count
    let countQuery = `
      SELECT COUNT(*) as total FROM bookings b
      WHERE b.payment_intent_id IS NOT NULL
    `;
    const countParams = [];

    if (status) {
      countQuery += ' AND b.payment_status = ?';
      countParams.push(status);
    }
    if (startDate) {
      countQuery += ' AND b.created_at >= ?';
      countParams.push(startDate);
    }
    if (endDate) {
      countQuery += ' AND b.created_at <= ?';
      countParams.push(endDate);
    }

    const [countResult] = await pool.execute(countQuery, countParams);

    res.json({
      status: 'success',
      data: {
        transactions: transformArrayToFrontend(transactions),
        pagination: {
          total: countResult[0].total,
          limit: safeLimit,
          offset: safeOffset
        }
      }
    });
  } catch (error) {
    logger.controllerError('adminController', 'getPaymentTransactions', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch payment transactions'
    });
  }
};

/**
 * =====================================================
 * USER MANAGEMENT ENDPOINTS
 * =====================================================
 */

/**
 * Ban/suspend user
 */
const banUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason, durationDays } = req.body;

    // Check if user exists
    const [users] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);

    if (users.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    if (users[0].role === 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Cannot ban admin users'
      });
    }

    // Calculate ban expiry using SQL DATE_ADD for proper timezone handling
    const parsedDuration = durationDays !== undefined && durationDays !== null && durationDays !== ''
      ? parseInt(durationDays)
      : null;

    // Update user - use SQL DATE_ADD to avoid timezone issues
    // Check for null explicitly since 0 is a valid duration (though unusual)
    if (parsedDuration !== null && !isNaN(parsedDuration)) {
      await pool.execute(
        `UPDATE users
         SET is_banned = TRUE,
             ban_reason = ?,
             banned_at = NOW(),
             ban_expires_at = DATE_ADD(NOW(), INTERVAL ? DAY),
             banned_by = ?
         WHERE id = ?`,
        [reason || 'Banned by admin', parsedDuration, req.user.id, userId]
      );
    } else {
      // Permanent ban - no expiry
      await pool.execute(
        `UPDATE users
         SET is_banned = TRUE,
             ban_reason = ?,
             banned_at = NOW(),
             ban_expires_at = NULL,
             banned_by = ?
         WHERE id = ?`,
        [reason || 'Banned by admin', req.user.id, userId]
      );
    }

    logger.controllerInfo('adminController', 'banUser', 'User banned', {
      userId,
      adminId: req.user.id,
      reason,
      durationDays
    });

    res.json({
      status: 'success',
      message: `User ${durationDays ? `suspended for ${durationDays} days` : 'permanently banned'}`
    });
  } catch (error) {
    logger.controllerError('adminController', 'banUser', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to ban user'
    });
  }
};

/**
 * Unban user
 */
const unbanUser = async (req, res) => {
  try {
    const { userId } = req.params;

    await pool.execute(
      `UPDATE users
       SET is_banned = FALSE,
           ban_reason = NULL,
           banned_at = NULL,
           ban_expires_at = NULL,
           banned_by = NULL
       WHERE id = ?`,
      [userId]
    );

    logger.controllerInfo('adminController', 'unbanUser', 'User unbanned', {
      userId,
      adminId: req.user.id
    });

    res.json({
      status: 'success',
      message: 'User unbanned successfully'
    });
  } catch (error) {
    logger.controllerError('adminController', 'unbanUser', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to unban user'
    });
  }
};

/**
 * Get banned users
 */
const getBannedUsers = async (req, res) => {
  try {
    const [users] = await pool.execute(`
      SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        u.ban_reason,
        u.banned_at,
        u.ban_expires_at,
        admin.name as banned_by_name
      FROM users u
      LEFT JOIN users admin ON u.banned_by = admin.id
      WHERE u.is_banned = TRUE
      ORDER BY u.banned_at DESC
    `);

    res.json({
      status: 'success',
      data: transformArrayToFrontend(users)
    });
  } catch (error) {
    logger.controllerError('adminController', 'getBannedUsers', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch banned users'
    });
  }
};

/**
 * Get enhanced user list with more details
 */
const getUsersEnhanced = async (req, res) => {
  try {
    const { role, status, search, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        u.email_verified,
        u.is_banned,
        u.ban_reason,
        u.created_at,
        u.average_rating,
        u.review_count,
        u.stripe_account_status,
        (SELECT COUNT(*) FROM bookings WHERE client_id = u.id OR companion_id = u.id) as total_bookings
      FROM users u
      WHERE 1=1
    `;

    const params = [];

    if (role) {
      query += ' AND u.role = ?';
      params.push(role);
    }

    if (status === 'banned') {
      query += ' AND u.is_banned = TRUE';
    } else if (status === 'active') {
      query += ' AND u.is_banned = FALSE';
    }

    if (search) {
      query += ' AND (u.name LIKE ? OR u.email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const safeLimit = parseInt(limit) || 50;
    const safeOffset = parseInt(offset) || 0;
    query += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
    params.push(safeLimit, safeOffset);

    // Use pool.query() instead of pool.execute() - execute() has strict type requirements for LIMIT/OFFSET
    const [users] = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM users u WHERE 1=1';
    const countParams = [];

    if (role) {
      countQuery += ' AND u.role = ?';
      countParams.push(role);
    }
    if (status === 'banned') {
      countQuery += ' AND u.is_banned = TRUE';
    } else if (status === 'active') {
      countQuery += ' AND u.is_banned = FALSE';
    }
    if (search) {
      countQuery += ' AND (u.name LIKE ? OR u.email LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`);
    }

    const [countResult] = await pool.execute(countQuery, countParams);

    res.json({
      status: 'success',
      data: {
        users: transformArrayToFrontend(users),
        pagination: {
          total: countResult[0].total,
          limit: safeLimit,
          offset: safeOffset
        }
      }
    });
  } catch (error) {
    logger.controllerError('adminController', 'getUsersEnhanced', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch users'
    });
  }
};

/**
 * Get verification attempts for admin audit
 * Shows all OTP verification attempts with location data
 */
const getVerificationAttempts = async (req, res) => {
  try {
    const {
      bookingId,
      userId,
      success,
      startDate,
      endDate,
      limit = 50,
      offset = 0
    } = req.query;

    // Sanitize limit/offset to prevent SQL injection
    const safeLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 200);
    const safeOffset = Math.max(parseInt(offset) || 0, 0);

    let query = `
      SELECT
        va.id,
        va.booking_id,
        va.user_id,
        va.user_role,
        va.attempt_type,
        va.user_lat,
        va.user_lon,
        va.meeting_lat,
        va.meeting_lon,
        va.distance_meters,
        va.success,
        va.failure_reason,
        va.ip_address,
        va.created_at,
        u.name as user_name,
        u.email as user_email,
        b.booking_date,
        b.start_time,
        b.meeting_location
      FROM verification_attempts va
      LEFT JOIN users u ON va.user_id = u.id
      LEFT JOIN bookings b ON va.booking_id = b.id
      WHERE 1=1
    `;
    const params = [];

    if (bookingId) {
      query += ' AND va.booking_id = ?';
      params.push(bookingId);
    }

    if (userId) {
      query += ' AND va.user_id = ?';
      params.push(userId);
    }

    if (success !== undefined && success !== '') {
      query += ' AND va.success = ?';
      params.push(success === 'true' || success === '1' ? 1 : 0);
    }

    if (startDate) {
      query += ' AND va.created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND va.created_at <= ?';
      params.push(endDate + ' 23:59:59');
    }

    query += ` ORDER BY va.created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;

    const [attempts] = await pool.execute(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM verification_attempts va
      WHERE 1=1
    `;
    const countParams = [];

    if (bookingId) {
      countQuery += ' AND va.booking_id = ?';
      countParams.push(bookingId);
    }

    if (userId) {
      countQuery += ' AND va.user_id = ?';
      countParams.push(userId);
    }

    if (success !== undefined && success !== '') {
      countQuery += ' AND va.success = ?';
      countParams.push(success === 'true' || success === '1' ? 1 : 0);
    }

    if (startDate) {
      countQuery += ' AND va.created_at >= ?';
      countParams.push(startDate);
    }

    if (endDate) {
      countQuery += ' AND va.created_at <= ?';
      countParams.push(endDate + ' 23:59:59');
    }

    const [countResult] = await pool.execute(countQuery, countParams);

    // Format the data for frontend
    const formattedAttempts = attempts.map(a => ({
      id: a.id,
      bookingId: a.booking_id,
      userId: a.user_id,
      userName: a.user_name,
      userEmail: a.user_email,
      userRole: a.user_role,
      attemptType: a.attempt_type,
      userLocation: {
        lat: parseFloat(a.user_lat),
        lon: parseFloat(a.user_lon)
      },
      meetingLocation: {
        lat: parseFloat(a.meeting_lat),
        lon: parseFloat(a.meeting_lon),
        address: a.meeting_location
      },
      distanceMeters: a.distance_meters,
      distanceFormatted: a.distance_meters >= 1000
        ? `${(a.distance_meters / 1000).toFixed(1)} km`
        : `${a.distance_meters} m`,
      success: !!a.success,
      failureReason: a.failure_reason,
      ipAddress: a.ip_address,
      bookingDate: a.booking_date,
      bookingStartTime: a.start_time,
      createdAt: a.created_at
    }));

    res.json({
      status: 'success',
      data: {
        attempts: formattedAttempts,
        pagination: {
          total: countResult[0].total,
          limit: safeLimit,
          offset: safeOffset
        }
      }
    });
  } catch (error) {
    logger.controllerError('adminController', 'getVerificationAttempts', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch verification attempts'
    });
  }
};

/**
 * =====================================================
 * PENDING TRANSFERS MANAGEMENT
 * =====================================================
 */

/**
 * Get all pending transfers (transfers that failed and need manual processing)
 * This is for handling cross-border transfer failures and other transfer issues
 */
const getPendingTransfers = async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const safeLimit = parseInt(limit) || 50;
    const safeOffset = parseInt(offset) || 0;

    // Get pending transfers from bookings table
    const [transfers] = await pool.query(`
      SELECT
        b.id as booking_id,
        b.total_amount,
        b.platform_fee_amount,
        b.companion_amount,
        b.payment_status,
        b.transfer_status,
        b.transfer_failure_reason,
        b.payment_intent_id,
        b.status as booking_status,
        b.booking_date,
        b.paid_at,
        b.created_at,
        companion.id as companion_id,
        companion.name as companion_name,
        companion.email as companion_email,
        companion.stripe_account_id as companion_stripe_account,
        client.name as client_name,
        client.email as client_email,
        ce.transfer_status as earnings_status
      FROM bookings b
      JOIN users companion ON b.companion_id = companion.id
      JOIN users client ON b.client_id = client.id
      LEFT JOIN companion_earnings ce ON b.id = ce.booking_id
      WHERE b.payment_status = 'paid'
        AND (b.transfer_status = 'pending' OR b.transfer_status = 'failed' OR b.transfer_status IS NULL)
        AND b.status = 'completed'
      ORDER BY b.paid_at DESC
      LIMIT ? OFFSET ?
    `, [safeLimit, safeOffset]);

    // Get total count
    const [[{ total }]] = await pool.execute(`
      SELECT COUNT(*) as total
      FROM bookings b
      WHERE b.payment_status = 'paid'
        AND (b.transfer_status = 'pending' OR b.transfer_status = 'failed' OR b.transfer_status IS NULL)
        AND b.status = 'completed'
    `);

    // Get summary stats
    const [[stats]] = await pool.execute(`
      SELECT
        COUNT(*) as pending_count,
        COALESCE(SUM(companion_amount), 0) as total_pending_amount
      FROM bookings
      WHERE payment_status = 'paid'
        AND (transfer_status = 'pending' OR transfer_status = 'failed' OR transfer_status IS NULL)
        AND status = 'completed'
    `);

    res.json({
      status: 'success',
      data: {
        transfers: transformArrayToFrontend(transfers),
        stats: {
          pendingCount: stats.pending_count || 0,
          totalPendingAmount: parseFloat(stats.total_pending_amount) || 0
        },
        pagination: {
          total,
          limit: safeLimit,
          offset: safeOffset
        }
      }
    });
  } catch (error) {
    logger.controllerError('adminController', 'getPendingTransfers', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch pending transfers'
    });
  }
};

/**
 * Get admin notifications (transfer failures, etc.)
 */
const getAdminNotifications = async (req, res) => {
  try {
    const { type, unreadOnly, limit = 50, offset = 0 } = req.query;
    const safeLimit = parseInt(limit) || 50;
    const safeOffset = parseInt(offset) || 0;

    let query = 'SELECT * FROM admin_notifications WHERE 1=1';
    const params = [];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    if (unreadOnly === 'true') {
      query += ' AND is_read = FALSE';
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(safeLimit, safeOffset);

    const [notifications] = await pool.query(query, params);

    // Get unread count
    const [[{ unreadCount }]] = await pool.execute(
      'SELECT COUNT(*) as unreadCount FROM admin_notifications WHERE is_read = FALSE'
    );

    res.json({
      status: 'success',
      data: {
        notifications: transformArrayToFrontend(notifications.map(n => ({
          ...n,
          data: typeof n.data === 'string' ? JSON.parse(n.data) : n.data
        }))),
        unreadCount,
        pagination: {
          limit: safeLimit,
          offset: safeOffset
        }
      }
    });
  } catch (error) {
    logger.controllerError('adminController', 'getAdminNotifications', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch admin notifications'
    });
  }
};

/**
 * Mark admin notification as read
 */
const markNotificationRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const adminId = req.user.id;

    await pool.execute(
      'UPDATE admin_notifications SET is_read = TRUE, read_at = NOW(), read_by = ? WHERE id = ?',
      [adminId, notificationId]
    );

    res.json({
      status: 'success',
      message: 'Notification marked as read'
    });
  } catch (error) {
    logger.controllerError('adminController', 'markNotificationRead', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update notification'
    });
  }
};

/**
 * Manually process a pending transfer
 * This allows admin to retry or mark as manually processed
 */
const processTransferManually = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { action, notes } = req.body; // action: 'retry' | 'mark_processed' | 'mark_failed'
    const adminId = req.user.id;

    if (!action || !['retry', 'mark_processed', 'mark_failed'].includes(action)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid action. Must be: retry, mark_processed, or mark_failed'
      });
    }

    // Get booking details
    const [[booking]] = await pool.execute(
      `SELECT b.*, u.stripe_account_id as companion_stripe_account
       FROM bookings b
       JOIN users u ON b.companion_id = u.id
       WHERE b.id = ?`,
      [bookingId]
    );

    if (!booking) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found'
      });
    }

    if (action === 'retry') {
      // Retry the transfer using stripeService
      const stripeService = require('../services/stripeService');
      const result = await stripeService.transferToCompanion(bookingId);

      if (result.success) {
        logger.info('Admin retried transfer successfully', {
          bookingId,
          adminId,
          transferId: result.transferId
        });

        return res.json({
          status: 'success',
          message: 'Transfer completed successfully',
          data: {
            transferId: result.transferId,
            companionEarnings: result.companionEarnings
          }
        });
      } else {
        return res.json({
          status: 'partial',
          message: result.message,
          data: {
            requiresManualProcessing: result.requiresManualProcessing,
            reason: result.reason
          }
        });
      }
    } else if (action === 'mark_processed') {
      // Mark as manually processed (admin paid outside Stripe)
      // Use parameterized query to prevent SQL injection
      const adminNote = ` | Manually processed by admin ${adminId}: ${notes || 'No notes'}`;
      await pool.execute(
        `UPDATE bookings
         SET transfer_status = 'completed',
             transfer_failure_reason = CONCAT(COALESCE(transfer_failure_reason, ''), ?),
             updated_at = NOW()
         WHERE id = ?`,
        [adminNote, bookingId]
      );

      await pool.execute(
        `UPDATE companion_earnings
         SET transfer_status = 'completed',
             updated_at = NOW()
         WHERE booking_id = ?`,
        [bookingId]
      );

      logger.info('Admin marked transfer as manually processed', {
        bookingId,
        adminId,
        notes
      });

      return res.json({
        status: 'success',
        message: 'Transfer marked as manually processed'
      });
    } else if (action === 'mark_failed') {
      // Mark as permanently failed
      // Use parameterized query to prevent SQL injection
      const adminNote = ` | Marked failed by admin ${adminId}: ${notes || 'No notes'}`;
      await pool.execute(
        `UPDATE bookings
         SET transfer_status = 'failed',
             transfer_failure_reason = CONCAT(COALESCE(transfer_failure_reason, ''), ?),
             updated_at = NOW()
         WHERE id = ?`,
        [adminNote, bookingId]
      );

      await pool.execute(
        `UPDATE companion_earnings
         SET transfer_status = 'failed',
             updated_at = NOW()
         WHERE booking_id = ?`,
        [bookingId]
      );

      logger.info('Admin marked transfer as failed', {
        bookingId,
        adminId,
        notes
      });

      return res.json({
        status: 'success',
        message: 'Transfer marked as failed'
      });
    }
  } catch (error) {
    logger.controllerError('adminController', 'processTransferManually', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to process transfer'
    });
  }
};

/**
 * Get platform Stripe account info
 */
const getPlatformStripeInfo = async (req, res) => {
  try {
    const stripeService = require('../services/stripeService');
    const platformInfo = await stripeService.getPlatformAccountInfo();

    res.json({
      status: 'success',
      data: {
        country: platformInfo?.country || 'Unknown',
        businessType: platformInfo?.businessType || 'Unknown',
        chargesEnabled: platformInfo?.chargesEnabled || false,
        payoutsEnabled: platformInfo?.payoutsEnabled || false,
        note: 'Connected accounts must be created in the same country to enable direct transfers.'
      }
    });
  } catch (error) {
    logger.controllerError('adminController', 'getPlatformStripeInfo', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch platform Stripe info'
    });
  }
};

module.exports = {
  getDashboardStats,
  getApplications,
  approveApplication,
  rejectApplication,
  getUsers,
  deleteUser,
  checkAvailabilityIntegrity,
  getAvailabilityAuditLogs,
  cleanupAvailabilityData,
  getClientVerifications,
  approveClientVerification,
  rejectClientVerification,
  getDisputedBookings,
  adminRefundBooking,
  adminCapturePayment,
  adminMarkResolved,
  // New endpoints
  getAllBookings,
  getBookingStats,
  adminCancelBooking,
  getEarningsSummary,
  getEarningsByCompanion,
  getPaymentTransactions,
  banUser,
  unbanUser,
  getBannedUsers,
  getUsersEnhanced,
  getVerificationAttempts,
  // Transfer management
  getPendingTransfers,
  getAdminNotifications,
  markNotificationRead,
  processTransferManually,
  getPlatformStripeInfo
};






















