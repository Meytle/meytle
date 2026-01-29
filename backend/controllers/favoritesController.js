/**
 * Favorites Controller
 * Handles favorite companions functionality for clients
 */

const { pool } = require('../config/database');
const { transformToFrontend, transformArrayToFrontend } = require('../utils/transformer');

/**
 * Add a companion to favorites
 * @route POST /api/favorites/:companionId
 */
const addFavorite = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { companionId } = req.params;
    const clientId = req.user.id;

    // Validate that companion exists and is approved
    const [companion] = await connection.query(
      `SELECT u.id, u.name, ca.status
       FROM users u
       LEFT JOIN companion_applications ca ON u.id = ca.user_id
       WHERE u.id = ? AND u.role = 'companion'`,
      [companionId]
    );

    if (!companion || companion.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Companion not found'
      });
    }

    if (companion[0].status !== 'approved') {
      return res.status(400).json({
        status: 'error',
        message: 'This companion is not available'
      });
    }

    // Check if already favorited
    const [existing] = await connection.query(
      'SELECT id FROM favorite_companions WHERE client_id = ? AND companion_id = ?',
      [clientId, companionId]
    );

    if (existing && existing.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Companion is already in favorites'
      });
    }

    // Add to favorites
    await connection.query(
      'INSERT INTO favorite_companions (client_id, companion_id) VALUES (?, ?)',
      [clientId, companionId]
    );

    res.status(201).json({
      status: 'success',
      message: 'Companion added to favorites',
      data: {
        companionId: parseInt(companionId),
        companionName: companion[0].name
      }
    });

  } catch (error) {
    console.error('Error adding favorite:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to add favorite',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

/**
 * Remove a companion from favorites
 * @route DELETE /api/favorites/:companionId
 */
const removeFavorite = async (req, res) => {
  try {
    const { companionId } = req.params;
    const clientId = req.user.id;

    const [result] = await pool.execute(
      'DELETE FROM favorite_companions WHERE client_id = ? AND companion_id = ?',
      [clientId, companionId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Favorite not found'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Companion removed from favorites'
    });

  } catch (error) {
    console.error('Error removing favorite:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to remove favorite',
      error: error.message
    });
  }
};

/**
 * Get all favorite companions for a client
 * @route GET /api/favorites
 */
const getFavorites = async (req, res) => {
  try {
    const clientId = req.user.id;

    // ⚠️ PRIVACY: Do NOT include companion email in favorites list
    const [favorites] = await pool.execute(
      `SELECT
        u.id,
        u.name,
        ca.bio,
        CONCAT(COALESCE(ca.city, ''), IF(ca.city AND ca.country, ', ', ''), COALESCE(ca.country, '')) as location,
        ca.profile_photo_url,
        ca.hourly_rate,
        ca.currency,
        u.average_rating,
        u.review_count,
        u.email_verified as is_verified,
        fc.created_at as favorited_at
      FROM favorite_companions fc
      JOIN users u ON fc.companion_id = u.id
      LEFT JOIN companion_applications ca ON u.id = ca.user_id
      WHERE fc.client_id = ? AND ca.status = 'approved'
      ORDER BY fc.created_at DESC`,
      [clientId]
    );

    res.status(200).json({
      status: 'success',
      data: transformArrayToFrontend(favorites)
    });

  } catch (error) {
    console.error('Error fetching favorites:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch favorites',
      error: error.message
    });
  }
};

/**
 * Check if a companion is favorited
 * @route GET /api/favorites/check/:companionId
 */
const checkFavorite = async (req, res) => {
  try {
    const { companionId } = req.params;
    const clientId = req.user.id;

    const [result] = await pool.execute(
      'SELECT id FROM favorite_companions WHERE client_id = ? AND companion_id = ?',
      [clientId, companionId]
    );

    res.status(200).json({
      status: 'success',
      data: {
        isFavorited: result.length > 0
      }
    });

  } catch (error) {
    console.error('Error checking favorite:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to check favorite status',
      error: error.message
    });
  }
};

/**
 * Get favorite companions IDs for bulk checking
 * @route GET /api/favorites/ids
 */
const getFavoriteIds = async (req, res) => {
  try {
    const clientId = req.user.id;

    const [results] = await pool.execute(
      'SELECT companion_id FROM favorite_companions WHERE client_id = ?',
      [clientId]
    );

    const favoriteIds = results.map(row => row.companion_id);

    res.status(200).json({
      status: 'success',
      data: favoriteIds
    });

  } catch (error) {
    console.error('Error fetching favorite IDs:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch favorite IDs',
      error: error.message
    });
  }
};

module.exports = {
  addFavorite,
  removeFavorite,
  getFavorites,
  checkFavorite,
  getFavoriteIds
};