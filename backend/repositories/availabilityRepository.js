/**
 * Availability Repository
 * Centralized database queries for companion availability
 */

const { pool } = require('../config/database');
const logger = require('../services/logger');

/**
 * Get availability by companion with optional filters
 * @param {number} companionId - Companion ID
 * @param {Object} filters - Filter options
 * @param {string} filters.dayOfWeek - Specific day of week
 * @param {boolean} filters.activeOnly - Only active slots
 * @returns {Promise<Array>} Array of availability slots
 */
const getByCompanion = async (companionId, filters = {}) => {
  let query = `
    SELECT
      id,
      companion_id,
      day_of_week,
      start_time,
      end_time,
      is_available,
      services,
      created_at,
      updated_at
    FROM companion_availability
    WHERE companion_id = ?
  `;

  const params = [companionId];

  if (filters.dayOfWeek) {
    query += ' AND day_of_week = ?';
    params.push(filters.dayOfWeek);
  }

  if (filters.activeOnly !== false) {
    query += ' AND is_available = TRUE';
  }

  query += ' ORDER BY day_of_week, start_time';

  const [availability] = await pool.execute(query, params);
  return availability;
};

/**
 * Set companion availability (replace all slots)
 * @param {number} companionId - Companion ID
 * @param {Array} slots - Array of availability slots
 * @param {Object} connection - Optional database connection for transaction
 * @returns {Promise<number>} Number of slots created
 */
const setForCompanion = async (companionId, slots, connection = null) => {
  const db = connection || pool;

  // If no connection provided, use transaction
  const shouldManageTransaction = !connection;
  let conn = db;

  if (shouldManageTransaction) {
    conn = await pool.getConnection();
    await conn.beginTransaction();
  }

  try {
    // Clear existing availability
    await conn.execute(
      'DELETE FROM companion_availability WHERE companion_id = ?',
      [companionId]
    );

    // Insert new slots
    let insertCount = 0;
    for (const slot of slots) {
      const servicesJson = slot.services ? JSON.stringify(slot.services) : null;

      await conn.execute(
        `INSERT INTO companion_availability
         (companion_id, day_of_week, start_time, end_time, is_available, services)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          companionId,
          slot.dayOfWeek,
          slot.startTime,
          slot.endTime,
          slot.isAvailable !== undefined ? slot.isAvailable : true,
          servicesJson
        ]
      );
      insertCount++;
    }

    if (shouldManageTransaction) {
      await conn.commit();
    }

    return insertCount;
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
 * Get weekly pattern for a companion
 * @param {number} companionId - Companion ID
 * @returns {Promise<Array>} Array of availability slots
 */
const getWeeklyPattern = async (companionId) => {
  const [availability] = await pool.execute(
    `SELECT
      day_of_week,
      start_time,
      end_time,
      is_available,
      services
    FROM companion_availability
    WHERE companion_id = ? AND is_available = TRUE
    ORDER BY
      CASE day_of_week
        WHEN 'monday' THEN 1
        WHEN 'tuesday' THEN 2
        WHEN 'wednesday' THEN 3
        WHEN 'thursday' THEN 4
        WHEN 'friday' THEN 5
        WHEN 'saturday' THEN 6
        WHEN 'sunday' THEN 7
      END,
      start_time`,
    [companionId]
  );

  return availability;
};

/**
 * Log availability change to audit log
 * @param {number} companionId - Companion ID
 * @param {Array} oldData - Previous availability data
 * @param {Array} newData - New availability data
 * @param {Object} metadata - Additional metadata (changedById, ipAddress, userAgent)
 * @returns {Promise<number>} Inserted log ID
 */
const logChange = async (companionId, oldData, newData, metadata = {}) => {
  try {
    const [result] = await pool.execute(
      `INSERT INTO availability_audit_log
       (companion_id, action, old_data, new_data, changed_by_id, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        companionId,
        'UPDATE_AVAILABILITY',
        JSON.stringify(oldData),
        JSON.stringify(newData),
        metadata.changedById || companionId,
        metadata.ipAddress || null,
        metadata.userAgent || null
      ]
    );

    return result.insertId;
  } catch (error) {
    logger.error('Failed to create availability audit log', {
      error: error.message,
      companionId
    });
    // Don't throw - audit logging should not block operations
    return null;
  }
};

/**
 * Get availability audit log for a companion
 * @param {number} companionId - Companion ID
 * @param {number} limit - Result limit
 * @returns {Promise<Array>} Array of log entries
 */
const getAuditLog = async (companionId, limit = 10) => {
  const [logs] = await pool.execute(
    `SELECT
      id,
      companion_id,
      action,
      old_data,
      new_data,
      changed_by_id,
      ip_address,
      user_agent,
      created_at
     FROM availability_audit_log
     WHERE companion_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [companionId, limit]
  );

  return logs;
};

/**
 * Delete all availability slots for a companion
 * @param {number} companionId - Companion ID
 * @returns {Promise<number>} Number of deleted slots
 */
const deleteAllForCompanion = async (companionId) => {
  const [result] = await pool.execute(
    'DELETE FROM companion_availability WHERE companion_id = ?',
    [companionId]
  );

  return result.affectedRows;
};

/**
 * Check if companion has availability for a specific day
 * @param {number} companionId - Companion ID
 * @param {string} dayOfWeek - Day of week
 * @returns {Promise<boolean>} True if companion has availability
 */
const hasAvailabilityForDay = async (companionId, dayOfWeek) => {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) as count 
     FROM companion_availability 
     WHERE companion_id = ? AND day_of_week = ? AND is_available = TRUE`,
    [companionId, dayOfWeek]
  );

  return rows[0].count > 0;
};

/**
 * Get companions with availability on a specific day and time
 * @param {string} dayOfWeek - Day of week
 * @param {string} startTime - Start time
 * @param {string} endTime - End time
 * @returns {Promise<Array>} Array of companion IDs
 */
const findAvailableCompanions = async (dayOfWeek, startTime, endTime) => {
  const [companions] = await pool.execute(
    `SELECT DISTINCT companion_id
     FROM companion_availability
     WHERE day_of_week = ?
       AND is_available = TRUE
       AND start_time <= ?
       AND end_time >= ?`,
    [dayOfWeek, startTime, endTime]
  );

  return companions.map(row => row.companion_id);
};

/**
 * Get total available hours per week for a companion
 * @param {number} companionId - Companion ID
 * @returns {Promise<number>} Total hours
 */
const getTotalWeeklyHours = async (companionId) => {
  const [availability] = await pool.execute(
    `SELECT start_time, end_time
     FROM companion_availability
     WHERE companion_id = ? AND is_available = TRUE`,
    [companionId]
  );

  let totalHours = 0;
  
  for (const slot of availability) {
    const start = new Date(`2000-01-01 ${slot.start_time}`);
    const end = new Date(`2000-01-01 ${slot.end_time}`);
    const hours = (end - start) / (1000 * 60 * 60);
    totalHours += hours;
  }

  return totalHours;
};

/**
 * Get availability statistics for a companion
 * @param {number} companionId - Companion ID
 * @returns {Promise<Object>} Statistics object
 */
const getStatistics = async (companionId) => {
  const [slots] = await pool.execute(
    `SELECT 
      COUNT(*) as total_slots,
      COUNT(DISTINCT day_of_week) as days_available,
      SUM(CASE WHEN is_available = TRUE THEN 1 ELSE 0 END) as active_slots
     FROM companion_availability
     WHERE companion_id = ?`,
    [companionId]
  );

  const totalHours = await getTotalWeeklyHours(companionId);

  return {
    totalSlots: slots[0].total_slots || 0,
    daysAvailable: slots[0].days_available || 0,
    activeSlots: slots[0].active_slots || 0,
    totalWeeklyHours: totalHours
  };
};

/**
 * Update a single availability slot
 * @param {number} slotId - Slot ID
 * @param {Object} updates - Update data
 * @returns {Promise<boolean>} Success status
 */
const updateSlot = async (slotId, updates) => {
  const allowedFields = ['start_time', 'end_time', 'is_available', 'services'];
  const updates_arr = [];
  const params = [];

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      updates_arr.push(`${key} = ?`);
      params.push(key === 'services' && value ? JSON.stringify(value) : value);
    }
  }

  if (updates_arr.length === 0) {
    return false;
  }

  params.push(slotId);

  const [result] = await pool.execute(
    `UPDATE companion_availability SET ${updates_arr.join(', ')}, updated_at = NOW() WHERE id = ?`,
    params
  );

  return result.affectedRows > 0;
};

module.exports = {
  getByCompanion,
  setForCompanion,
  getWeeklyPattern,
  logChange,
  getAuditLog,
  deleteAllForCompanion,
  hasAvailabilityForDay,
  findAvailableCompanions,
  getTotalWeeklyHours,
  getStatistics,
  updateSlot
};

