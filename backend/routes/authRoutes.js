/**
 * Authentication Routes
 */

const express = require('express');
const { signup, login, signout, getProfile, verifyEmail, resendVerification, switchRole, deleteAccount } = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');
const { optionalAuthMiddleware } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
// Rate limiting removed for testing/development
const { validateSignup, validateLogin } = require('../middleware/validation');

const router = express.Router();

// Public routes with validation (no IP-based signup restrictions for demo)
router.post('/signup', validateSignup, asyncHandler(signup));
router.post('/login', validateLogin, asyncHandler(login));
router.post('/signout', asyncHandler(signout));
router.post('/verify-email', optionalAuthMiddleware, asyncHandler(verifyEmail)); // Optional auth for OTP verification

// Protected routes
router.get('/profile', authMiddleware, asyncHandler(getProfile));
router.post('/resend-verification', authMiddleware, asyncHandler(resendVerification));
router.post('/switch-role', authMiddleware, asyncHandler(switchRole));
router.delete('/account', authMiddleware, asyncHandler(deleteAccount));

module.exports = router;
