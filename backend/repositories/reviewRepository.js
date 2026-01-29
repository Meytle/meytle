/**
 * Review Repository
 * Centralized database queries for booking reviews
 */

const { pool } = require('../config/database');
const logger = require('../services/logger');

/**
 * Create a review with rating update transaction
 * @param {Object} reviewData - Review data
 * @param {Object} connection - Optional database connection for transaction
 * @returns {Promise<number>} Inserted review ID
 */
const create = async (reviewData, connection = null) => {
  const shouldManageTransaction = !connection;
  let conn = connection || await pool.getConnection();

  if (shouldManageTransaction) {
    await conn.beginTransaction();
  }

  try {
    const {
      bookingId,
      reviewerId,
      revieweeId,
      rating,
      reviewText
    } = reviewData;

    // Create the review
    const [result] = await conn.execute(
      `INSERT INTO booking_reviews (
        booking_id,
        reviewer_id,
        reviewee_id,
        rating,
        review_text
      ) VALUES (?, ?, ?, ?, ?)`,
      [bookingId, reviewerId, revieweeId, rating, reviewText]
    );

    const reviewId = result.insertId;

    // Update companion's average rating and review count
    await conn.execute(
      `UPDATE users u
       SET u.average_rating = (
         SELECT ROUND(AVG(br.rating), 1)
         FROM booking_reviews br
         WHERE br.reviewee_id = ?
       ),
       u.review_count = (
         SELECT COUNT(*)
         FROM booking_reviews br
         WHERE br.reviewee_id = ?
       )
       WHERE u.id = ?`,
      [revieweeId, revieweeId, revieweeId]
    );

    if (shouldManageTransaction) {
      await conn.commit();
    }

    return reviewId;
  } catch (error) {
    if (shouldManageTransaction) {
      await conn.rollback();
    }
    throw error;
  } finally {
    if (shouldManageTransaction) {
      conn.release();
    }
  }
};

/**
 * Find reviews by companion with pagination and stats
 * @param {number} companionId - Companion ID
 * @param {Object} pagination - Pagination options
 * @param {number} pagination.page - Page number
 * @param {number} pagination.limit - Items per page
 * @returns {Promise<Object>} Reviews with stats
 */
const findByCompanion = async (companionId, pagination = {}) => {
  const page = pagination.page || 1;
  const limit = Math.min(pagination.limit || 10, 100);
  const offset = (page - 1) * limit;

  // Get total count
  const [totalCount] = await pool.execute(
    'SELECT COUNT(*) as total FROM booking_reviews WHERE reviewee_id = ?',
    [companionId]
  );

  const totalReviews = totalCount[0]?.total || 0;

  // Get reviews with reviewer info - using direct interpolation for LIMIT/OFFSET (safe, validated integers)
  const [reviews] = await pool.execute(
    `SELECT
      br.id,
      br.rating,
      br.review_text,
      br.created_at,
      u.name as reviewer_name,
      b.booking_date,
      b.service_category_id
     FROM booking_reviews br
     JOIN users u ON br.reviewer_id = u.id
     JOIN bookings b ON br.booking_id = b.id
     WHERE br.reviewee_id = ?
     ORDER BY br.created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    [companionId]
  );

  // Get rating distribution
  const [ratingDistribution] = await pool.execute(
    `SELECT
      rating,
      COUNT(*) as count
     FROM booking_reviews
     WHERE reviewee_id = ?
     GROUP BY rating
     ORDER BY rating DESC`,
    [companionId]
  );

  // Calculate stats
  const stats = {
    total: totalReviews,
    distribution: {
      5: 0,
      4: 0,
      3: 0,
      2: 0,
      1: 0
    }
  };

  ratingDistribution.forEach(row => {
    if (row.rating >= 1 && row.rating <= 5) {
      stats.distribution[row.rating] = row.count;
    }
  });

  // Calculate average
  if (totalReviews > 0) {
    const sum = Object.entries(stats.distribution).reduce((acc, [rating, count]) => {
      return acc + (parseInt(rating) * count);
    }, 0);
    stats.averageRating = Math.round((sum / totalReviews) * 10) / 10;
  } else {
    stats.averageRating = 0;
  }

  return {
    reviews,
    stats,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalReviews / limit),
      totalItems: totalReviews,
      itemsPerPage: limit
    }
  };
};

/**
 * Find review by booking and reviewer
 * @param {number} bookingId - Booking ID
 * @param {number} reviewerId - Reviewer ID
 * @returns {Promise<Object|null>} Review object or null
 */
const findByBooking = async (bookingId, reviewerId = null) => {
  let query = `
    SELECT
      br.id,
      br.booking_id,
      br.reviewer_id,
      br.reviewee_id,
      br.rating,
      br.review_text,
      br.created_at
    FROM booking_reviews br
    WHERE br.booking_id = ?
  `;

  const params = [bookingId];

  if (reviewerId) {
    query += ' AND br.reviewer_id = ?';
    params.push(reviewerId);
  }

  const [reviews] = await pool.execute(query, params);
  return reviews.length > 0 ? reviews[0] : null;
};

/**
 * Check if a booking has been reviewed
 * @param {number} bookingId - Booking ID
 * @returns {Promise<boolean>} True if reviewed
 */
const hasReview = async (bookingId) => {
  const [result] = await pool.execute(
    'SELECT COUNT(*) as count FROM booking_reviews WHERE booking_id = ?',
    [bookingId]
  );

  return result[0].count > 0;
};

/**
 * Update companion rating after review changes
 * @param {number} companionId - Companion ID
 * @returns {Promise<Object>} Updated rating info
 */
const updateCompanionRating = async (companionId) => {
  const [result] = await pool.execute(
    `UPDATE users u
     SET u.average_rating = (
       SELECT ROUND(AVG(br.rating), 1)
       FROM booking_reviews br
       WHERE br.reviewee_id = ?
     ),
     u.review_count = (
       SELECT COUNT(*)
       FROM booking_reviews br
       WHERE br.reviewee_id = ?
     )
     WHERE u.id = ?`,
    [companionId, companionId, companionId]
  );

  // Get updated values
  const [companion] = await pool.execute(
    'SELECT average_rating, review_count FROM users WHERE id = ?',
    [companionId]
  );

  return companion[0];
};

/**
 * Delete a review
 * @param {number} reviewId - Review ID
 * @param {number} companionId - Companion ID (for rating update)
 * @returns {Promise<boolean>} Success status
 */
const deleteReview = async (reviewId, companionId) => {
  const [result] = await pool.execute(
    'DELETE FROM booking_reviews WHERE id = ?',
    [reviewId]
  );

  if (result.affectedRows > 0) {
    // Update companion rating after deletion
    await updateCompanionRating(companionId);
    return true;
  }

  return false;
};

/**
 * Get pending reviews for a user (completed bookings without reviews)
 * @param {number} userId - User ID
 * @param {number} limit - Result limit
 * @returns {Promise<Array>} Array of bookings that can be reviewed
 */
const findPendingForUser = async (userId, limit = 10) => {
  const [bookings] = await pool.execute(
    `SELECT
      b.id,
      b.booking_date,
      b.start_time,
      b.end_time,
      b.total_amount,
      u.name as companion_name,
      ca.profile_photo_url as companion_photo,
      sc.name as service_category_name
     FROM bookings b
     JOIN users u ON b.companion_id = u.id
     LEFT JOIN companion_applications ca ON u.id = ca.user_id
     LEFT JOIN service_categories sc ON b.service_category_id = sc.id
     LEFT JOIN booking_reviews br ON b.id = br.booking_id
     WHERE b.client_id = ? 
       AND b.status = 'completed'
       AND br.id IS NULL
     ORDER BY b.booking_date DESC
     LIMIT ?`,
    [userId, limit]
  );

  return bookings;
};

/**
 * Get review statistics for a companion
 * @param {number} companionId - Companion ID
 * @returns {Promise<Object>} Review statistics
 */
const getStatistics = async (companionId) => {
  const [stats] = await pool.execute(
    `SELECT
      COUNT(*) as total_reviews,
      ROUND(AVG(rating), 1) as average_rating,
      MIN(rating) as lowest_rating,
      MAX(rating) as highest_rating,
      SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as five_star,
      SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as four_star,
      SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as three_star,
      SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as two_star,
      SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as one_star
     FROM booking_reviews
     WHERE reviewee_id = ?`,
    [companionId]
  );

  return stats[0] || {
    total_reviews: 0,
    average_rating: 0,
    lowest_rating: 0,
    highest_rating: 0,
    five_star: 0,
    four_star: 0,
    three_star: 0,
    two_star: 0,
    one_star: 0
  };
};

/**
 * Get recent reviews for a companion
 * @param {number} companionId - Companion ID
 * @param {number} limit - Result limit
 * @returns {Promise<Array>} Array of recent reviews
 */
const getRecent = async (companionId, limit = 5) => {
  const [reviews] = await pool.execute(
    `SELECT
      br.id,
      br.rating,
      br.review_text,
      br.created_at,
      u.name as reviewer_name,
      cv.profile_photo_url as reviewer_photo
     FROM booking_reviews br
     JOIN users u ON br.reviewer_id = u.id
     LEFT JOIN client_verifications cv ON u.id = cv.user_id
     WHERE br.reviewee_id = ?
     ORDER BY br.created_at DESC
     LIMIT ?`,
    [companionId, limit]
  );

  return reviews;
};

/**
 * Search reviews by rating
 * @param {number} companionId - Companion ID
 * @param {number} rating - Rating to filter by
 * @param {Object} pagination - Pagination options
 * @returns {Promise<Array>} Array of reviews
 */
const findByRating = async (companionId, rating, pagination = {}) => {
  const limit = Math.min(pagination.limit || 10, 100);
  const offset = pagination.offset || 0;

  const [reviews] = await pool.execute(
    `SELECT
      br.id,
      br.rating,
      br.review_text,
      br.created_at,
      u.name as reviewer_name
     FROM booking_reviews br
     JOIN users u ON br.reviewer_id = u.id
     WHERE br.reviewee_id = ? AND br.rating = ?
     ORDER BY br.created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    [companionId, rating]
  );

  return reviews;
};

module.exports = {
  create,
  findByCompanion,
  findByBooking,
  hasReview,
  updateCompanionRating,
  deleteReview,
  findPendingForUser,
  getStatistics,
  getRecent,
  findByRating
};

