/**
 * Earnings Controller
 * Handles companion earnings, payment history, and financial summaries
 */

const { pool } = require('../config/database');
const logger = require('../services/logger');
const { sendSuccess, sendError, sendNotFound } = require('../utils/responseHelpers');
const asyncHandler = require('../utils/asyncHandler');
const { transformToFrontend } = require('../utils/transformer');

/**
 * Get earnings summary for companion
 * @route GET /api/earnings/summary
 */
const getEarningsSummary = asyncHandler(async (req, res) => {
  const companionId = req.user.id;

  // Verify user is a companion
  if (req.user.role !== 'companion') {
    return sendError(res, 403, 'Access denied. Companion role required.');
  }

  // Get total earnings (all time - completed bookings with payment released)
  const [totalEarnings] = await pool.execute(
    `SELECT 
       COALESCE(SUM(total_amount * 0.85), 0) as total_earnings,
       COUNT(*) as total_bookings
     FROM bookings
     WHERE companion_id = ?
       AND status = 'completed'
       AND payment_status = 'paid'
       AND payment_released_at IS NOT NULL`,
    [companionId]
  );

  // Get this month's earnings
  const [monthEarnings] = await pool.execute(
    `SELECT 
       COALESCE(SUM(total_amount * 0.85), 0) as month_earnings,
       COUNT(*) as month_bookings
     FROM bookings
     WHERE companion_id = ?
       AND status = 'completed'
       AND payment_status = 'paid'
       AND payment_released_at IS NOT NULL
       AND MONTH(payment_released_at) = MONTH(CURRENT_DATE())
       AND YEAR(payment_released_at) = YEAR(CURRENT_DATE())`,
    [companionId]
  );

  // Get pending earnings (confirmed bookings not yet completed)
  const [pendingEarnings] = await pool.execute(
    `SELECT 
       COALESCE(SUM(total_amount * 0.85), 0) as pending_earnings,
       COUNT(*) as pending_bookings
     FROM bookings
     WHERE companion_id = ?
       AND (status = 'confirmed' OR status = 'payment_held')
       AND payment_status IN ('pending', 'paid', 'authorized')
       AND payment_released_at IS NULL`,
    [companionId]
  );

  // Get this month's platform fees
  const [monthFees] = await pool.execute(
    `SELECT 
       COALESCE(SUM(platform_fee_amount), 0) as month_fees
     FROM bookings
     WHERE companion_id = ?
       AND status = 'completed'
       AND payment_released_at IS NOT NULL
       AND MONTH(payment_released_at) = MONTH(CURRENT_DATE())
       AND YEAR(payment_released_at) = YEAR(CURRENT_DATE())`,
    [companionId]
  );

  // Get payout account status
  const [payoutStatus] = await pool.execute(
    `SELECT stripe_account_id, stripe_account_status
     FROM users
     WHERE id = ?`,
    [companionId]
  );

  const hasPayoutAccount = !!payoutStatus[0].stripe_account_id;
  const payoutAccountActive = payoutStatus[0].stripe_account_status === 'active';

  logger.controllerInfo('earningsController', 'getEarningsSummary', 'Earnings summary retrieved', {
    companionId,
    totalEarnings: totalEarnings[0].total_earnings,
    monthEarnings: monthEarnings[0].month_earnings
  });

  return sendSuccess(res, {
    totalEarnings: parseFloat(totalEarnings[0].total_earnings).toFixed(2),
    totalBookings: totalEarnings[0].total_bookings,
    monthEarnings: parseFloat(monthEarnings[0].month_earnings).toFixed(2),
    monthBookings: monthEarnings[0].month_bookings,
    monthFees: parseFloat(monthFees[0].month_fees).toFixed(2),
    pendingEarnings: parseFloat(pendingEarnings[0].pending_earnings).toFixed(2),
    pendingBookings: pendingEarnings[0].pending_bookings,
    hasPayoutAccount,
    payoutAccountActive
  });
});

/**
 * Get payment history for companion
 * @route GET /api/earnings/history
 */
const getPaymentHistory = asyncHandler(async (req, res) => {
  const companionId = req.user.id;
  const { limit = 50, offset = 0, status = 'all' } = req.query;

  // Verify user is a companion
  if (req.user.role !== 'companion') {
    return sendError(res, 403, 'Access denied. Companion role required.');
  }

  // Parse and validate limit/offset to prevent NaN
  const parsedLimit = parseInt(limit) || 50;
  const parsedOffset = parseInt(offset) || 0;

  // Build WHERE clause based on status filter
  // ✅ CRITICAL FIX: Only show COMPLETED bookings in payment history
  // 'confirmed' bookings are still pending completion and should only appear in "Upcoming Payments"
  let whereClause = `WHERE b.companion_id = ? AND b.status = 'completed' AND b.payment_status IN ('paid', 'authorized')`;
  
  if (status === 'paid') {
    // Only show payments that have been released to companion
    whereClause += ` AND b.payment_released_at IS NOT NULL`;
  } else if (status === 'pending') {
    // Completed meetings where payment capture succeeded but hasn't been transferred yet
    whereClause += ` AND b.payment_released_at IS NULL`;
  } else if (status === 'failed') {
    whereClause += ` AND b.payment_status = 'failed'`;
  } else {
    // Default 'all' status - no additional filter needed (already filtered by payment_status IN paid, authorized)
  }
  // Note: LIMIT and OFFSET use direct values (not ?) because MySQL prepared statements don't support placeholders for these
  const [payments] = await pool.execute(
    `SELECT 
       b.id,
       b.booking_date,
       b.start_time,
       b.end_time,
       b.duration_hours,
       b.total_amount,
       b.platform_fee_amount,
       (b.total_amount * 0.85) as companion_earnings,
       b.payment_status,
       b.paid_at,
       b.payment_released_at,
       b.transfer_id,
       b.status as booking_status,
       b.service_type,
       b.meeting_location,
       client.name as client_name,
       client.email as client_email,
       cv.profile_photo_url as client_photo,
       sc.name as service_category_name
     FROM bookings b
     JOIN users client ON b.client_id = client.id
     LEFT JOIN client_verifications cv ON client.id = cv.user_id
     LEFT JOIN service_categories sc ON b.service_category_id = sc.id
     ${whereClause}
     ORDER BY 
       CASE 
         WHEN b.payment_released_at IS NOT NULL THEN b.payment_released_at
         ELSE b.booking_date
       END DESC
     LIMIT ${parsedLimit} OFFSET ${parsedOffset}`,
    [companionId]
  );

  // Get total count for pagination
  const [countResult] = await pool.execute(
    `SELECT COUNT(*) as total
     FROM bookings b
     ${whereClause}`,
    [companionId]
  );

  logger.controllerInfo('earningsController', 'getPaymentHistory', 'Payment history retrieved', {
    companionId,
    count: payments.length,
    status
  });

  return sendSuccess(res, {
    payments: payments.map(payment => transformToFrontend({
      ...payment,
      companion_earnings: parseFloat(payment.companion_earnings).toFixed(2),
      total_amount: parseFloat(payment.total_amount).toFixed(2),
      platform_fee_amount: payment.platform_fee_amount 
        ? parseFloat(payment.platform_fee_amount).toFixed(2) 
        : parseFloat(payment.total_amount * 0.15).toFixed(2)
    })),
    pagination: {
      total: countResult[0].total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: countResult[0].total > (parseInt(offset) + payments.length)
    }
  });
});

/**
 * Get upcoming payments (from confirmed bookings)
 * @route GET /api/earnings/upcoming
 */
const getUpcomingPayments = asyncHandler(async (req, res) => {
  const companionId = req.user.id;

  // Verify user is a companion
  if (req.user.role !== 'companion') {
    return sendError(res, 403, 'Access denied. Companion role required.');
  }

  // Get confirmed bookings that haven't been completed yet
  const [upcomingPayments] = await pool.execute(
    `SELECT 
       b.id,
       b.booking_date,
       b.start_time,
       b.end_time,
       b.duration_hours,
       b.total_amount,
       (b.total_amount * 0.85) as companion_earnings,
       (b.total_amount * 0.15) as platform_fee,
       b.status,
       b.payment_status,
       b.service_type,
       b.meeting_location,
       b.meeting_type,
       client.name as client_name,
       client.email as client_email,
       cv.profile_photo_url as client_photo,
       sc.name as service_category_name
     FROM bookings b
     JOIN users client ON b.client_id = client.id
     LEFT JOIN client_verifications cv ON client.id = cv.user_id
     LEFT JOIN service_categories sc ON b.service_category_id = sc.id
     WHERE b.companion_id = ?
       AND b.status IN ('pending', 'payment_held', 'confirmed')
       AND b.payment_status != 'awaiting_payment'
       AND b.booking_date >= CURDATE()
     ORDER BY b.booking_date ASC, b.start_time ASC
     LIMIT 20`,
    [companionId]
  );

  logger.controllerInfo('earningsController', 'getUpcomingPayments', 'Upcoming payments retrieved', {
    companionId,
    count: upcomingPayments.length
  });

  return sendSuccess(res, {
    upcomingPayments: upcomingPayments.map(payment => transformToFrontend({
      ...payment,
      companion_earnings: parseFloat(payment.companion_earnings).toFixed(2),
      total_amount: parseFloat(payment.total_amount).toFixed(2),
      platform_fee: parseFloat(payment.platform_fee).toFixed(2)
    }))
  });
});

/**
 * Get earnings chart data (monthly breakdown for the past 12 months)
 * @route GET /api/earnings/chart
 */
const getEarningsChart = asyncHandler(async (req, res) => {
  const companionId = req.user.id;

  // Verify user is a companion
  if (req.user.role !== 'companion') {
    return sendError(res, 403, 'Access denied. Companion role required.');
  }

  // Get monthly earnings for the past 12 months
  const [chartData] = await pool.execute(
    `SELECT 
       DATE_FORMAT(payment_released_at, '%Y-%m') as month,
       COALESCE(SUM(total_amount * 0.85), 0) as earnings,
       COUNT(*) as bookings_count
     FROM bookings
     WHERE companion_id = ?
       AND status = 'completed'
       AND payment_status = 'paid'
       AND payment_released_at IS NOT NULL
       AND payment_released_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
     GROUP BY DATE_FORMAT(payment_released_at, '%Y-%m')
     ORDER BY month ASC`,
    [companionId]
  );

  logger.controllerInfo('earningsController', 'getEarningsChart', 'Earnings chart data retrieved', {
    companionId,
    months: chartData.length
  });

  return sendSuccess(res, {
    chartData: chartData.map(month => ({
      month: month.month,
      earnings: parseFloat(month.earnings).toFixed(2),
      bookingsCount: month.bookings_count
    }))
  });
});

module.exports = {
  getEarningsSummary,
  getPaymentHistory,
  getUpcomingPayments,
  getEarningsChart
};
