/**
 * Review Controller
 * Handles booking reviews and ratings
 */

const { pool } = require('../../config/database');
const { transformToFrontend, transformArrayToFrontend } = require('../../utils/transformer');
const { sendSuccess, sendCreated, sendError, sendNotFound, sendBadRequest, sendPaginated } = require('../../utils/responseHelpers');
const asyncHandler = require('../../utils/asyncHandler');
const logger = require('../../services/logger');

/**
 * Create a review for a completed booking
 * @route POST /api/booking/:bookingId/review
 */
const createReview = asyncHandler(async (req, res) => {
  const startTime = Date.now(); // Track performance
  const connection = await pool.getConnection();
  logger.info('Review submission started', { connectionAcquireTime: Date.now() - startTime });

  try {
    const { bookingId } = req.params;
    const { rating, comment } = req.body;
    const reviewerId = req.user.id;

    await connection.beginTransaction();

    // Get booking details and verify reviewer is the CLIENT ONLY
    const [booking] = await connection.query(
      `SELECT b.*,
              c.name as client_name,
              comp.name as companion_name
       FROM bookings b
       JOIN users c ON b.client_id = c.id
       JOIN users comp ON b.companion_id = comp.id
       WHERE b.id = ? AND b.client_id = ?`,
      [bookingId, reviewerId]
    );

    if (!booking || booking.length === 0) {
      await connection.rollback();
      return sendNotFound(res, 'Booking not found or only clients can review bookings');
    }

    const bookingData = booking[0];
    
    // The reviewee is always the companion (since only clients can review)
    const revieweeId = bookingData.companion_id;

    // Check if booking is completed
    if (bookingData.status !== 'completed') {
      await connection.rollback();
      return sendBadRequest(res, 'You can only review completed bookings');
    }

    // Check if this user already reviewed this booking
    const [existingReview] = await connection.query(
      'SELECT id FROM booking_reviews WHERE booking_id = ? AND reviewer_id = ?',
      [bookingId, reviewerId]
    );

    if (existingReview && existingReview.length > 0) {
      await connection.rollback();
      return sendBadRequest(res, 'You have already reviewed this booking');
    }

    // Validate rating and comment
    if (!rating || rating < 1 || rating > 5) {
      await connection.rollback();
      return sendBadRequest(res, 'Rating must be between 1 and 5');
    }

    // Comment is optional - only validate if provided
    if (comment && comment.trim().length > 0 && comment.trim().length < 10) {
      await connection.rollback();
      return sendBadRequest(res, 'Review must be at least 10 characters if provided');
    }

    if (comment && comment.length > 500) {
      await connection.rollback();
      return sendBadRequest(res, 'Review must be less than 500 characters');
    }

    // Create the review
    const [reviewResult] = await connection.query(
      `INSERT INTO booking_reviews (
        booking_id,
        reviewer_id,
        reviewee_id,
        rating,
        review_text
      ) VALUES (?, ?, ?, ?, ?)`,
      [
        bookingId,
        reviewerId,
        revieweeId,
        rating,
        comment ? comment.trim() : null // Allow null for optional comment
      ]
    );

    logger.info('Review created successfully', { 
      bookingId, 
      reviewerId, 
      revieweeId, 
      reviewId: reviewResult.insertId,
      rating 
    });

    // Update reviewee's average rating and review count (optimized with single query)
    await connection.query(
      `UPDATE users u
       JOIN (
         SELECT 
           reviewee_id,
           ROUND(AVG(rating), 1) as avg_rating,
           COUNT(*) as review_count
         FROM booking_reviews
         WHERE reviewee_id = ?
         GROUP BY reviewee_id
       ) stats ON u.id = stats.reviewee_id
       SET u.average_rating = stats.avg_rating,
           u.review_count = stats.review_count
       WHERE u.id = ?`,
      [revieweeId, revieweeId]
    );

    await connection.commit();
    
    // Create notification for the companion (reviewee) - AFTER commit for better performance
    const notificationService = require('../../services/notificationService');
    // Reviewer is always the client (since only clients can review)
    const reviewerName = bookingData.client_name;
    
    // Don't await notification - let it happen async to avoid blocking response
    notificationService.createNotification(
      revieweeId,
      'review',
      'New Review Received',
      `${reviewerName} left you a ${rating}-star review`,
      `/bookings/${bookingId}`
    ).catch(error => {
      logger.error('Failed to create review notification', { error, revieweeId, bookingId });
    });

    const totalTime = Date.now() - startTime;
    logger.info('Review submitted successfully', { bookingId, reviewerId, totalTime });

    return sendCreated(res, null, 'Review submitted successfully');

  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

/**
 * Get all reviews for a companion
 * @route GET /api/booking/companion/:companionId/reviews
 */
const getCompanionReviews = asyncHandler(async (req, res) => {
  const { companionId } = req.params;

  // Parse and validate pagination parameters
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  const validPage = (!isNaN(page) && page > 0) ? page : 1;
  const validLimit = (!isNaN(limit) && limit > 0) ? Math.min(100, limit) : 10;
  const offset = (validPage - 1) * validLimit;

  const companionIdInt = parseInt(companionId);
  const validLimitInt = parseInt(validLimit);
  const offsetInt = parseInt(offset);

  // Validate that all values are valid integers
  if (isNaN(companionIdInt) || isNaN(validLimitInt) || isNaN(offsetInt)) {
    return sendBadRequest(res, 'Invalid pagination parameters');
  }

  // Ensure limit and offset are non-negative
  if (validLimitInt < 0 || offsetInt < 0) {
    return sendBadRequest(res, 'Pagination parameters must be non-negative');
  }

  // Get total count
  const [totalCount] = await pool.execute(
    'SELECT COUNT(*) as total FROM booking_reviews WHERE reviewee_id = ?',
    [companionIdInt]
  );

  // Get reviews with reviewer info (including client photo)
  const [reviews] = await pool.execute(
    `SELECT
      br.id,
      br.rating,
      br.review_text,
      br.created_at,
      u.name as reviewer_name,
      cv.profile_photo_url as reviewer_photo,
      b.booking_date,
      b.service_category_id
     FROM booking_reviews br
     JOIN users u ON br.reviewer_id = u.id
     LEFT JOIN client_verifications cv ON u.id = cv.user_id
     JOIN bookings b ON br.booking_id = b.id
     WHERE br.reviewee_id = ?
     ORDER BY br.created_at DESC
     LIMIT ${validLimitInt} OFFSET ${offsetInt}`,
    [companionIdInt]
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
    [companionIdInt]
  );

  // Calculate stats
  const totalReviews = totalCount[0]?.total || 0;
  const stats = {
    total: totalReviews,
    distribution: {
      5: 0,
      4: 0,
      3: 0,
      2: 0,
      1: 0
    },
    average: 0
  };

  if (ratingDistribution && Array.isArray(ratingDistribution)) {
    let totalRating = 0;
    ratingDistribution.forEach(row => {
      if (row.rating >= 1 && row.rating <= 5) {
        stats.distribution[row.rating] = row.count;
        totalRating += row.rating * row.count;
      }
    });
    // Calculate average rating
    if (totalReviews > 0) {
      stats.average = Math.round((totalRating / totalReviews) * 10) / 10; // Round to 1 decimal
    }
  }

  // Transform reviews to camelCase
  const transformedReviews = transformArrayToFrontend(reviews);

  // Calculate pagination
  const totalItems = totalReviews;
  const totalPages = validLimit > 0 ? Math.ceil(totalItems / validLimit) : 1;

  // Return custom structure with reviews, stats, and pagination
  return res.status(200).json({
    status: 'success',
    data: {
      reviews: transformedReviews,
      stats: stats,
      pagination: {
        currentPage: validPage,
        totalPages: totalPages,
        totalItems: totalItems,
        itemsPerPage: validLimit
      }
    }
  });
});

/**
 * Check if a booking has been reviewed
 * @route GET /api/booking/:bookingId/review
 */
const getBookingReview = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user.id;

  const [review] = await pool.execute(
    `SELECT
      br.id,
      br.rating,
      br.review_text,
      br.created_at
     FROM booking_reviews br
     WHERE br.booking_id = ? AND br.reviewer_id = ?`,
    [bookingId, userId]
  );

  if (!review || review.length === 0) {
    return sendNotFound(res, 'Review not found');
  }

  const transformedReview = transformToFrontend(review[0]);

  return sendSuccess(res, {
    hasReviewed: true,
    review: transformedReview
  });
});

/**
 * Get pending reviews (bookings that can be reviewed)
 * ONLY CLIENTS can review companions
 * @route GET /api/booking/reviews/pending
 */
const getPendingReviews = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  logger.info('Fetching pending reviews', { userId });

  // Get completed bookings where this CLIENT hasn't reviewed yet
  const [bookings] = await pool.execute(
    `SELECT
      b.id,
      b.booking_date,
      b.start_time,
      b.end_time,
      b.total_amount,
      b.client_id,
      b.companion_id,
      companion.name as other_party_name,
      ca.profile_photo_url as other_party_photo,
      sc.name as service_category_name
     FROM bookings b
     JOIN users companion ON b.companion_id = companion.id
     LEFT JOIN companion_applications ca ON companion.id = ca.user_id
     LEFT JOIN service_categories sc ON b.service_category_id = sc.id
     LEFT JOIN booking_reviews br ON b.id = br.booking_id AND br.reviewer_id = ?
     WHERE b.client_id = ?
       AND b.status = 'completed'
       AND br.id IS NULL
     ORDER BY b.booking_date DESC`,
    [userId, userId]
  );

  logger.info('Pending reviews fetched', { userId, count: bookings.length, bookingIds: bookings.map(b => b.id) });

  const transformedBookings = transformArrayToFrontend(bookings);

  return sendSuccess(res, { pendingReviews: transformedBookings });
});

/**
 * Check if user has pending reviews (blocking)
 * ONLY CLIENTS can have pending reviews
 * @route GET /api/booking/reviews/has-pending
 */
const hasPendingReviews = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Check if this CLIENT has any completed bookings without their review
  const [result] = await pool.execute(
    `SELECT COUNT(*) as pending_count
     FROM bookings b
     LEFT JOIN booking_reviews br ON b.id = br.booking_id AND br.reviewer_id = ?
     WHERE b.client_id = ?
       AND b.status = 'completed'
       AND br.id IS NULL`,
    [userId, userId]
  );

  const hasPending = result[0].pending_count > 0;
  const count = result[0].pending_count;

  return sendSuccess(res, { 
    hasPendingReviews: hasPending,
    pendingCount: count
  });
});

module.exports = {
  createReview,
  getCompanionReviews,
  getBookingReview,
  getPendingReviews,
  hasPendingReviews
};

