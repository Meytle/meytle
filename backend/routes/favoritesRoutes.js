/**
 * Favorites Routes
 */

const express = require('express');
const {
  addFavorite,
  removeFavorite,
  getFavorites,
  checkFavorite,
  getFavoriteIds
} = require('../controllers/favoritesController');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Favorites management
router.get('/ids', getFavoriteIds); // Get all favorite IDs (for bulk checking)
router.get('/', getFavorites); // Get all favorites
router.post('/:companionId', addFavorite); // Add to favorites
router.delete('/:companionId', removeFavorite); // Remove from favorites
router.get('/check/:companionId', checkFavorite); // Check if favorited

module.exports = router;