/**
 * Companion Routes
 * Updated for Veriff integration - only profile photos uploaded now
 */

const express = require('express');
const { submitApplication, getApplicationStatus, updateProfilePhoto, updateProfile, getApprovedCompanions, saveInterests, getCompanionInterests, getCompanionServices, uploadAdditionalPhoto1, uploadAdditionalPhoto2, startVeriffVerification, getVerificationStatus, createPayoutSetup, getPayoutStatus } = require('../controllers/companionController');
const authMiddleware = require('../middleware/auth');
const { uploadCompanionFiles, uploadProfilePhoto, uploadPhoto } = require('../config/multer');
// Rate limiting removed for testing/development

const router = express.Router();

// Get all approved companions (public endpoint - no auth required)
// Apply rate limiting to prevent scraping
router.get('/browse', getApprovedCompanions);

// All routes below require authentication
router.use(authMiddleware);

// Submit companion application (profile photo only - no government ID)
// Government ID verification now handled by Veriff API
router.post('/application', uploadCompanionFiles, submitApplication);

// Get application status
router.get('/application/status', getApplicationStatus);

// Update profile photo
router.post('/profile/photo', uploadPhoto, updateProfilePhoto);

// Upload additional photos (for 3-step verification)
router.post('/profile/additional-photo-1', uploadPhoto, uploadAdditionalPhoto1);
router.post('/profile/additional-photo-2', uploadPhoto, uploadAdditionalPhoto2);

// Update profile data (phone, bio, services, languages, hourly rate, address)
router.put('/profile', updateProfile);

// Veriff verification for companions
router.post('/verification/start-veriff', startVeriffVerification);
router.get('/verification/status', getVerificationStatus);

// Interests management
router.post('/interests', saveInterests);
router.get('/interests/:companionId', getCompanionInterests);

// Get companion's registered services
router.get('/services', getCompanionServices);

// Stripe Connect payout setup
router.post('/payout/setup', createPayoutSetup);
router.get('/payout/status', getPayoutStatus);

module.exports = router;
