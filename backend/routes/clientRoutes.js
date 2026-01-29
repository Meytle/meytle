/**
 * Client Routes
 * Routes for client profile management and identity verification with Veriff integration
 */

const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const { uploadProfilePhoto } = require('../config/multer');
const {
  getProfile,
  updateProfile,
  updateProfilePhoto,
  submitVerification,
  getVerificationStatus
} = require('../controllers/clientController');

// All routes require authentication
router.use(protect);

// Profile routes
router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.post('/profile/photo', uploadProfilePhoto, updateProfilePhoto);

// Verification routes (no file upload - Veriff handles identity verification)
router.post('/verify-identity', submitVerification);
router.get('/verification-status', getVerificationStatus);

module.exports = router;

