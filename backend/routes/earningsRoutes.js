/**
 * Earnings Routes
 * Routes for companion earnings, payment history, and financial data
 */

const express = require('express');
const router = express.Router();
const {
  getEarningsSummary,
  getPaymentHistory,
  getUpcomingPayments,
  getEarningsChart
} = require('../controllers/earningsController');

// All routes are protected and require companion role
// Authentication middleware is applied in server.js

/**
 * GET /api/earnings/summary
 * Get earnings summary (total, this month, pending)
 */
router.get('/summary', getEarningsSummary);

/**
 * GET /api/earnings/history
 * Get payment history with pagination and filters
 * Query params: limit, offset, status (all|paid|pending|failed)
 */
router.get('/history', getPaymentHistory);

/**
 * GET /api/earnings/upcoming
 * Get upcoming payments from confirmed bookings
 */
router.get('/upcoming', getUpcomingPayments);

/**
 * GET /api/earnings/chart
 * Get monthly earnings chart data (past 12 months)
 */
router.get('/chart', getEarningsChart);

module.exports = router;

