/**
 * Admin Routes
 * Protected routes for admin operations
 * 
 * NOTE: Manual approval/rejection routes disabled with Veriff integration
 * Applications and verifications are now auto-approved
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const {
  getDashboardStats,
  getApplications,
  // approveApplication,    // DISABLED: Auto-approval with Veriff
  // rejectApplication,      // DISABLED: Auto-approval with Veriff
  getUsers,
  deleteUser,
  checkAvailabilityIntegrity,
  getAvailabilityAuditLogs,
  cleanupAvailabilityData,
  getClientVerifications,
  // approveClientVerification,  // DISABLED: Auto-approval with Veriff
  // rejectClientVerification,    // DISABLED: Auto-approval with Veriff
  getDisputedBookings,
  adminRefundBooking,
  adminCapturePayment,
  adminMarkResolved,
  // Bookings management
  getAllBookings,
  getBookingStats,
  adminCancelBooking,
  // Earnings management
  getEarningsSummary,
  getEarningsByCompanion,
  getPaymentTransactions,
  // User management
  banUser,
  unbanUser,
  getBannedUsers,
  getUsersEnhanced,
  // Verification audit
  getVerificationAttempts,
  // Transfer management
  getPendingTransfers,
  getAdminNotifications,
  markNotificationRead,
  processTransferManually,
  getPlatformStripeInfo
} = require('../controllers/adminController');

// Apply auth middleware to all admin routes
router.use(auth);
router.use(adminAuth);

// Dashboard stats
router.get('/dashboard/stats', getDashboardStats);

// Application management (read-only - auto-approved applications)
router.get('/applications', getApplications);
// DISABLED: Manual approval routes (applications are auto-approved with Veriff)
// router.put('/applications/:applicationId/approve', approveApplication);
// router.put('/applications/:applicationId/reject', rejectApplication);

// User management
router.get('/users', getUsers);
router.delete('/users/:userId', deleteUser);

// Client verification management (read-only - auto-approved verifications)
router.get('/client-verifications', getClientVerifications);
// DISABLED: Manual verification routes (verifications are auto-approved with Veriff)
// router.put('/client-verifications/:id/approve', approveClientVerification);
// router.put('/client-verifications/:id/reject', rejectClientVerification);

// Data integrity management
router.get('/availability/integrity-check', checkAvailabilityIntegrity);
router.get('/availability/audit-logs', getAvailabilityAuditLogs);
router.post('/availability/cleanup', cleanupAvailabilityData);

// Booking dispute management
router.get('/disputes', getDisputedBookings);
router.post('/disputes/:bookingId/refund', adminRefundBooking);
router.post('/disputes/:bookingId/capture', adminCapturePayment);
router.post('/disputes/:bookingId/resolve', adminMarkResolved);

// =====================================================
// BOOKINGS MANAGEMENT ROUTES
// =====================================================
router.get('/bookings', getAllBookings);
router.get('/bookings/stats', getBookingStats);
router.post('/bookings/:bookingId/cancel', adminCancelBooking);

// =====================================================
// OTP VERIFICATION AUDIT ROUTES
// =====================================================
router.get('/verification-attempts', getVerificationAttempts);

// =====================================================
// EARNINGS MANAGEMENT ROUTES
// =====================================================
router.get('/earnings/summary', getEarningsSummary);
router.get('/earnings/by-companion', getEarningsByCompanion);
router.get('/earnings/transactions', getPaymentTransactions);

// =====================================================
// USER MANAGEMENT ROUTES (Enhanced)
// =====================================================
router.get('/users/enhanced', getUsersEnhanced);
router.get('/users/banned', getBannedUsers);
router.post('/users/:userId/ban', banUser);
router.post('/users/:userId/unban', unbanUser);

// =====================================================
// TRANSFER MANAGEMENT ROUTES
// For handling failed transfers (cross-border, etc.)
// =====================================================
router.get('/transfers/pending', getPendingTransfers);
router.post('/transfers/:bookingId/process', processTransferManually);

// =====================================================
// ADMIN NOTIFICATIONS ROUTES
// =====================================================
router.get('/notifications', getAdminNotifications);
router.put('/notifications/:notificationId/read', markNotificationRead);

// =====================================================
// STRIPE PLATFORM INFO
// =====================================================
router.get('/stripe/platform-info', getPlatformStripeInfo);

module.exports = router;






















