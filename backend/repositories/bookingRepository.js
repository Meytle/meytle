/**
 * Booking Repository
 * Centralized database queries for bookings
 */

const { pool } = require('../config/database');
const logger = require('../services/logger');

/**
 * Create a new booking with transaction support
 * @param {Object} bookingData - Booking data
 * @param {Object} connection - Optional database connection for transaction
 * @returns {Promise<number>} Inserted booking ID
 */
const create = async (bookingData, connection = null) => {
  const db = connection || pool;
  
  const {
    clientId,
    companionId,
    bookingDate,
    startTime,
    endTime,
    durationHours,
    totalAmount,
    specialRequests,
    meetingLocation,
    serviceCategoryId,
    meetingType
  } = bookingData;

  const [result] = await db.execute(
    `INSERT INTO bookings
     (client_id, companion_id, booking_date, start_time, end_time, duration_hours, total_amount,
      special_requests, meeting_location, service_category_id, meeting_type, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      clientId,
      companionId,
      bookingDate,
      startTime,
      endTime,
      durationHours,
      totalAmount,
      specialRequests || null,
      meetingLocation || null,
      serviceCategoryId || null,
      meetingType || 'in_person'
    ]
  );

  return result.insertId;
};

/**
 * Find booking by ID with authorization check
 * @param {number} bookingId - Booking ID
 * @param {number} userId - User ID for authorization
 * @returns {Promise<Object|null>} Booking object or null
 */
const findById = async (bookingId, userId = null) => {
  let query = `
    SELECT
      b.id,
      b.client_id,
      b.companion_id,
      DATE_FORMAT(b.booking_date, '%Y-%m-%d') as booking_date,
      b.start_time,
      b.end_time,
      b.duration_hours,
      b.total_amount,
      b.status,
      b.special_requests,
      b.meeting_location,
      b.meeting_type,
      b.created_at,
      b.updated_at,
      b.service_category_id,
      b.cancelled_by,
      b.cancellation_reason,
      b.cancelled_at,
      sc.name as service_category_name,
      sc.base_price as service_category_price,
      u.name as companion_name,
      u.email as companion_email,
      ca.profile_photo_url as companion_photo,
      c.name as client_name,
      c.email as client_email
    FROM bookings b
    JOIN users u ON b.companion_id = u.id
    JOIN users c ON b.client_id = c.id
    LEFT JOIN companion_applications ca ON u.id = ca.user_id
    LEFT JOIN service_categories sc ON b.service_category_id = sc.id
    WHERE b.id = ?
  `;

  const params = [bookingId];

  // Add authorization check if userId provided
  if (userId) {
    query += ' AND (b.client_id = ? OR b.companion_id = ?)';
    params.push(userId, userId);
  }

  const [bookings] = await pool.execute(query, params);
  return bookings.length > 0 ? bookings[0] : null;
};

/**
 * Find bookings by user with filters and pagination
 * @param {number} userId - User ID
 * @param {string} role - User role ('client' or 'companion')
 * @param {Object} filters - Filter options
 * @param {string} filters.status - Booking status filter
 * @param {number} filters.limit - Result limit
 * @param {number} filters.offset - Result offset
 * @returns {Promise<Array>} Array of bookings
 */
const findByUser = async (userId, role, filters = {}) => {
  const { status, limit = 20, offset = 0 } = filters;

  const validLimit = Math.floor(Math.max(1, Math.min(limit, 100)));
  const validOffset = Math.floor(Math.max(0, offset));

  let query;
  if (role === 'client') {
    query = `
      SELECT
        b.id,
        b.companion_id,
        DATE_FORMAT(b.booking_date, '%Y-%m-%d') as booking_date,
        b.start_time,
        b.end_time,
        b.duration_hours,
        b.total_amount,
        b.status,
        b.special_requests,
        b.meeting_location,
        b.meeting_type,
        b.created_at,
        b.service_category_id,
        b.cancelled_by,
        b.cancellation_reason,
        b.cancelled_at,
        sc.name as service_category_name,
        sc.base_price as service_category_price,
        u.name as companion_name,
        u.email as companion_email,
        ca.profile_photo_url as companion_photo
      FROM bookings b
      JOIN users u ON b.companion_id = u.id
      LEFT JOIN companion_applications ca ON u.id = ca.user_id
      LEFT JOIN service_categories sc ON b.service_category_id = sc.id
      WHERE b.client_id = ?
    `;
  } else {
    query = `
      SELECT
        b.id,
        b.client_id,
        DATE_FORMAT(b.booking_date, '%Y-%m-%d') as booking_date,
        b.start_time,
        b.end_time,
        b.duration_hours,
        b.total_amount,
        b.status,
        b.special_requests,
        b.meeting_location,
        b.meeting_type,
        b.created_at,
        b.service_category_id,
        b.cancelled_by,
        b.cancellation_reason,
        b.cancelled_at,
        sc.name as service_category_name,
        sc.base_price as service_category_price,
        u.name as client_name,
        u.email as client_email
      FROM bookings b
      JOIN users u ON b.client_id = u.id
      LEFT JOIN service_categories sc ON b.service_category_id = sc.id
      WHERE b.companion_id = ?
    `;
  }

  const params = [userId];

  if (status) {
    query += ' AND b.status = ?';
    params.push(status);
  }

  query += ` ORDER BY b.booking_date DESC, b.start_time DESC LIMIT ${validLimit} OFFSET ${validOffset}`;

  const [bookings] = await pool.execute(query, params);
  return bookings;
};

/**
 * Find pending bookings for companion
 * @param {number} companionId - Companion ID
 * @returns {Promise<Array>} Array of pending bookings
 */
const findPendingForCompanion = async (companionId) => {
  const [bookings] = await pool.execute(
    `SELECT
      b.id,
      DATE_FORMAT(b.booking_date, '%Y-%m-%d') as booking_date,
      b.start_time,
      b.end_time,
      b.duration_hours,
      b.total_amount,
      b.status,
      b.special_requests,
      b.meeting_location,
      b.meeting_type,
      b.created_at,
      b.service_category_id,
      b.client_id,
      b.companion_id,
      c.name as client_name,
      c.email as client_email,
      sc.name as service_category_name,
      sc.base_price as service_category_price
     FROM bookings b
     JOIN users c ON b.client_id = c.id
     LEFT JOIN service_categories sc ON b.service_category_id = sc.id
     WHERE b.companion_id = ? AND b.status = 'pending'
     ORDER BY b.created_at DESC`,
    [companionId]
  );

  return bookings;
};

/**
 * Update booking status with cancellation tracking
 * @param {number} bookingId - Booking ID
 * @param {string} status - New status
 * @param {Object} cancelData - Cancellation data (cancelledBy, cancellationReason)
 * @returns {Promise<boolean>} Success status
 */
const updateStatus = async (bookingId, status, cancelData = null) => {
  let query, params;

  if (status === 'cancelled' && cancelData) {
    query = `UPDATE bookings 
             SET status = ?, 
                 cancelled_by = ?, 
                 cancellation_reason = ?, 
                 cancelled_at = NOW(),
                 updated_at = NOW()
             WHERE id = ?`;
    params = [status, cancelData.cancelledBy, cancelData.cancellationReason, bookingId];
  } else {
    query = 'UPDATE bookings SET status = ?, updated_at = NOW() WHERE id = ?';
    params = [status, bookingId];
  }

  const [result] = await pool.execute(query, params);
  return result.affectedRows > 0;
};

/**
 * Find conflicting bookings
 * @param {number} companionId - Companion ID
 * @param {string} date - Booking date
 * @param {string} startTime - Start time
 * @param {string} endTime - End time
 * @param {number} excludeBookingId - Optional booking ID to exclude
 * @returns {Promise<Array>} Array of conflicting bookings
 */
const findConflicts = async (companionId, date, startTime, endTime, excludeBookingId = null) => {
  let query = `
    SELECT id, start_time, end_time, status, client_id
    FROM bookings
    WHERE companion_id = ? AND booking_date = ?
    AND ((start_time <= ? AND end_time > ?) OR (start_time < ? AND end_time >= ?))
    AND status IN ('pending', 'payment_held', 'confirmed')
  `;

  const params = [companionId, date, startTime, startTime, endTime, endTime];
  
  if (excludeBookingId) {
    query += ' AND id != ?';
    params.push(excludeBookingId);
  }

  const [conflicts] = await pool.execute(query, params);
  return conflicts;
};

/**
 * Find bookings by date range
 * @param {number} companionId - Companion ID
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @param {Array} statuses - Array of statuses to include
 * @returns {Promise<Array>} Array of bookings
 */
const findByDateRange = async (companionId, startDate, endDate, statuses = ['pending', 'payment_held', 'confirmed']) => {
  const placeholders = statuses.map(() => '?').join(',');
  
  const [bookings] = await pool.execute(
    `SELECT 
      id, 
      booking_date, 
      start_time, 
      end_time, 
      status,
      client_id
     FROM bookings
     WHERE companion_id = ? 
       AND booking_date BETWEEN ? AND ?
       AND status IN (${placeholders})
     ORDER BY booking_date ASC, start_time ASC`,
    [companionId, startDate, endDate, ...statuses]
  );

  return bookings;
};

/**
 * Delete a booking
 * @param {number} bookingId - Booking ID
 * @returns {Promise<boolean>} Success status
 */
const deleteBooking = async (bookingId) => {
  const [result] = await pool.execute(
    'DELETE FROM bookings WHERE id = ?',
    [bookingId]
  );

  return result.affectedRows > 0;
};

/**
 * Get booking count by status for a user
 * @param {number} userId - User ID
 * @param {string} role - User role
 * @returns {Promise<Object>} Status counts
 */
const getStatusCounts = async (userId, role) => {
  const roleColumn = role === 'client' ? 'client_id' : 'companion_id';
  
  const [counts] = await pool.execute(
    `SELECT 
      status, 
      COUNT(*) as count 
     FROM bookings 
     WHERE ${roleColumn} = ? 
     GROUP BY status`,
    [userId]
  );

  const statusCounts = {
    pending: 0,
    confirmed: 0,
    completed: 0,
    cancelled: 0,
    no_show: 0
  };

  counts.forEach(row => {
    statusCounts[row.status] = row.count;
  });

  return statusCounts;
};

/**
 * Get upcoming bookings for a user
 * @param {number} userId - User ID
 * @param {string} role - User role
 * @param {number} limit - Result limit
 * @returns {Promise<Array>} Array of upcoming bookings
 */
const getUpcoming = async (userId, role, limit = 5) => {
  const roleColumn = role === 'client' ? 'client_id' : 'companion_id';
  const today = new Date().toISOString().split('T')[0];
  
  const [bookings] = await pool.execute(
    `SELECT 
      b.id,
      b.booking_date,
      b.start_time,
      b.end_time,
      b.status,
      u.name as other_party_name
     FROM bookings b
     JOIN users u ON u.id = ${role === 'client' ? 'b.companion_id' : 'b.client_id'}
     WHERE b.${roleColumn} = ?
       AND b.booking_date >= ?
       AND b.status IN ('pending', 'payment_held', 'confirmed')
     ORDER BY b.booking_date ASC, b.start_time ASC
     LIMIT ?`,
    [userId, today, limit]
  );

  return bookings;
};

module.exports = {
  create,
  findById,
  findByUser,
  findPendingForCompanion,
  updateStatus,
  findConflicts,
  findByDateRange,
  deleteBooking,
  getStatusCounts,
  getUpcoming
};

