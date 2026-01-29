/**
 * Companion Controller
 * Handles companion application submissions with Veriff integration
 */

const { pool } = require('../config/database');
const { transformToFrontend, transformArrayToFrontend } = require('../utils/transformer');
const logger = require('../services/logger');
const verificationService = require('../services/verificationService');
const stripeService = require('../services/stripeService');
const { calculateAge, isAdult, formatLocation } = require('../utils/dateHelpers');
const { getTimezoneFromCoordinates, getTimezoneFromLocation } = require('../services/timezoneService');

/**
 * Submit companion application with Veriff integration
 * User must complete Veriff identity verification to get approved
 */
const submitApplication = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      dateOfBirth,
      gender,
      phoneNumber,
      backgroundCheckConsent,
      interests,
      bio,
      servicesOffered,
      languages,
      hourlyRate
    } = req.body;

    // Log received data for debugging
    logger.controllerInfo('companionController', 'submitApplication', 'Received application data', {
      userId,
      dateOfBirth: dateOfBirth ? 'provided' : 'missing',
      gender: gender ? 'provided' : 'missing',
      phoneNumber: phoneNumber ? 'provided' : 'missing',
      backgroundCheckConsent: backgroundCheckConsent ? 'provided' : 'missing',
      hasFile: !!req.file,
      fileFieldName: req.file?.fieldname,
      interests: interests ? JSON.parse(interests).length : 0,
      services: servicesOffered ? JSON.parse(servicesOffered).length : 0,
      languages: languages ? JSON.parse(languages).length : 0,
      hourlyRate
    });

    // Validate required fields (only what we collect in frontend)
    if (!dateOfBirth || !gender) {
      logger.warn('Missing required fields in companion application', {
        userId,
        missingFields: {
          dateOfBirth: !dateOfBirth,
          gender: !gender
        }
      });
      return res.status(400).json({
        status: 'error',
        message: 'Please provide all required fields: date of birth and gender'
      });
    }

    // Validate age (must be 18+) using utility function
    if (!isAdult(dateOfBirth)) {
      const age = calculateAge(dateOfBirth);
      return res.status(400).json({
        status: 'error',
        message: `You must be at least 18 years old to become a companion. Current age: ${age}`
      });
    }

    // Check if user already has an application
    const [existingApps] = await pool.execute(
      'SELECT id FROM companion_applications WHERE user_id = ?',
      [userId]
    );

    if (existingApps.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'You have already submitted an application'
      });
    }

    // Handle profile photo upload only (no government ID file)
    const profilePhotoUrl = req.file?.fieldname === 'profilePhoto' 
      ? `/uploads/profiles/${req.file.filename}` 
      : null;

    logger.info('Profile photo uploaded for companion application', {
      userId,
      profilePhoto: profilePhotoUrl ? 'uploaded' : 'not provided'
    });

    // Insert application with only collected fields (pending status - will be verified via Veriff later)
    const [result] = await pool.execute(
      `INSERT INTO companion_applications
       (user_id, profile_photo_url, date_of_birth, gender, phone_number, bio,
        services_offered, languages, hourly_rate, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
      [
        userId,
        profilePhotoUrl,
        dateOfBirth,
        gender,
        phoneNumber || null,
        bio || null,
        servicesOffered || null,
        languages || null,
        hourlyRate || 25
      ]
    );

    // Note: Companion role will be added after Veriff identity verification
    // Application remains 'pending' until verification is completed

    // Save interests if provided
    if (interests) {
      // Parse interests if it's a JSON string
      let interestArray = interests;
      if (typeof interests === 'string') {
        try {
          interestArray = JSON.parse(interests);
        } catch (e) {
          logger.warn('Failed to parse interests JSON', {
            userId,
            error: e.message,
            interests: interests
          });
          interestArray = [];
        }
      }

      if (Array.isArray(interestArray) && interestArray.length > 0) {
        for (const interest of interestArray) {
          try {
            await pool.execute(
              'INSERT INTO companion_interests (companion_id, interest_name) VALUES (?, ?)',
              [userId, interest]
            );
          } catch (interestError) {
            logger.dbError('insertInterest', interestError, `INSERT INTO companion_interests for interest: ${interest}`);
            // Continue with other interests even if one fails
          }
        }
      }
    }

    // Calculate age for response
    const age = calculateAge(dateOfBirth);

    res.status(201).json({
      status: 'success',
      message: 'Application submitted successfully! Complete identity verification via Veriff to get approved.',
      data: {
        applicationId: result.insertId,
        status: 'pending',
        age
      }
    });
  } catch (error) {
    logger.controllerError('companionController', 'submitApplication', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to submit application. Please try again.',
      error: error.message
    });
  }
};

/**
 * Get application status with age and location data
 */
const getApplicationStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;

    logger.info('Fetching application for user', { userId, email: userEmail });

    const [applications] = await pool.execute(
      `SELECT id, user_id, profile_photo_url, additional_photo_1_url, additional_photo_2_url, 
       status, created_at, reviewed_at, rejection_reason,
       phone_number, address_line, city, state, country, postal_code, bio, 
       services_offered, languages, hourly_rate, date_of_birth, gender,
       nationality, document_type, document_expiration_date, document_country_issue,
       verification_session_id, verification_completed_at, verification_status
       FROM companion_applications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (applications.length === 0) {
      logger.info('No application found for user', { userId });
      return res.status(404).json({
        status: 'error',
        message: 'No application found'
      });
    }

    const application = applications[0];

    // Fetch user's timezone
    const [userResult] = await pool.execute(
      'SELECT timezone FROM users WHERE id = ?',
      [userId]
    );
    const userTimezone = userResult[0]?.timezone || 'UTC';

    // Calculate age and format location
    const age = application.date_of_birth ? calculateAge(application.date_of_birth) : null;
    const location = formatLocation({
      city: application.city,
      state: application.state,
      country: application.country
    });

    // Security verification: Ensure application belongs to the requesting user
    if (application.user_id !== userId) {
      logger.error('SECURITY WARNING: Application user_id does not match JWT user_id!', {
        jwtUserId: userId,
        applicationUserId: application.user_id,
        applicationId: application.id
      });
      return res.status(403).json({
        status: 'error',
        message: 'Unauthorized access to application'
      });
    }

    // Log raw data from database
    logger.info('Raw application data from DB (verified to belong to requesting user)', {
      jwtUserId: userId,
      applicationId: application.id,
      applicationUserId: application.user_id,
      isMatch: application.user_id === userId,
      status: application.status,
      profile_photo_url: application.profile_photo_url,
      additional_photo_1_url: application.additional_photo_1_url,
      additional_photo_2_url: application.additional_photo_2_url,
      address_line: application.address_line,
      city: application.city,
      state: application.state,
      country: application.country,
      postal_code: application.postal_code,
      verification_status: application.verification_status
    });

    // Transform and add calculated fields
    const responseData = transformToFrontend({
      application: {
        ...application,
        age,
        location,
        verificationMethod: application.verification_session_id ? 'veriff_api' : 'auto_approved_testing',
        userTimezone
      }
    });

    // Log transformed data being sent to frontend
    logger.info('Transformed data being sent', {
      hasApplication: !!responseData.application,
      profilePhotoUrl: responseData.application?.profilePhotoUrl,
      additionalPhoto1Url: responseData.application?.additionalPhoto1Url,
      additionalPhoto2Url: responseData.application?.additionalPhoto2Url,
      addressLine: responseData.application?.addressLine,
      city: responseData.application?.city,
      verificationStatus: responseData.application?.verificationStatus
    });

    res.status(200).json({
      status: 'success',
      data: responseData
    });
  } catch (error) {
    logger.controllerError('companionController', 'getApplicationStatus', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch application status',
      error: error.message
    });
  }
};

/**
 * Update profile photo
 */
const updateProfilePhoto = async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;

    logger.controllerInfo('companionController', 'updateProfilePhoto', 'Updating profile photo', { userId, email: userEmail });

    // Check if file was uploaded
    if (!req.file) {
      logger.warn('No file uploaded for profile photo update', { userId });
      return res.status(400).json({
        status: 'error',
        message: 'Please upload a profile photo'
      });
    }

    const profilePhotoUrl = `/uploads/profiles/${req.file.filename}`;

    logger.info('New profile photo uploaded', {
      userId,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
      url: profilePhotoUrl
    });

    // Update the profile photo URL in the companion_applications table
    const [result] = await pool.execute(
      `UPDATE companion_applications 
       SET profile_photo_url = ? 
       WHERE user_id = ?`,
      [profilePhotoUrl, userId]
    );

    logger.info('Photo updated successfully', { userId, rowsAffected: result.affectedRows });

    if (result.affectedRows === 0) {
      logger.warn('No application found to update for user', { userId });
      return res.status(404).json({
        status: 'error',
        message: 'No application found to update'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Profile photo updated successfully',
      data: {
        profilePhotoUrl: profilePhotoUrl
      }
    });
  } catch (error) {
    logger.controllerError('companionController', 'updateProfilePhoto', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update profile photo',
      error: error.message
    });
  }
};

/**
 * Get all approved companions for browsing
 */
const getApprovedCompanions = async (req, res) => {
  try {
    const { interests } = req.query;
    
    // ⚠️ PRIVACY: Do NOT include companion email in public listings
    let query = `
      SELECT
        u.id,
        u.name,
        u.average_rating,
        u.review_count,
        ca.profile_photo_url,
        ca.additional_photo_1_url,
        ca.additional_photo_2_url,
        ca.date_of_birth,
        ca.gender,
        ca.bio,
        ca.city,
        ca.state,
        ca.country,
        ca.created_at as joined_date,
        ca.services_offered,
        ca.languages,
        ca.hourly_rate
      FROM users u
      JOIN companion_applications ca ON u.id = ca.user_id
      JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'companion' AND ur.is_active = TRUE
      WHERE ca.status = 'approved'
    `;
    
    const queryParams = [];
    
    // Filter by interests if provided
    if (interests) {
      const interestList = interests.split(',').map(i => i.trim());
      query += ` AND u.id IN (
        SELECT companion_id FROM companion_interests 
        WHERE interest_name IN (${interestList.map(() => '?').join(',')})
      )`;
      queryParams.push(...interestList);
    }
    
    query += ' ORDER BY ca.created_at DESC';
    
    const [companions] = await pool.execute(query, queryParams);

    // Get interests for each companion
    const companionsWithInterests = await Promise.all(
      companions.map(async (companion) => {
        const [interests] = await pool.execute(
          'SELECT interest_name FROM companion_interests WHERE companion_id = ?',
          [companion.id]
        );

        // Calculate age using utility function
        const age = companion.date_of_birth ? calculateAge(companion.date_of_birth) : null;

        // Format location using utility function
        const location = formatLocation({
          city: companion.city,
          state: companion.state,
          country: companion.country
        });

        // Keep the raw companion data from DB and add computed fields
        return {
          ...companion,
          age,
          interests: interests.map(i => i.interest_name),
          location: location || null,
          // Keep location fields for filtering
          city: companion.city || null,
          state: companion.state || null,
          country: companion.country || null,
          // Remove sensitive data
          email: undefined,
          date_of_birth: undefined
        };
      })
    );

    // Transform to frontend format and handle JSON parsing
    const transformedCompanions = transformArrayToFrontend(companionsWithInterests).map(companion => {
      // Parse JSON fields after transformation
      if (companion.servicesOffered) {
        companion.servicesOffered = typeof companion.servicesOffered === 'string'
          ? JSON.parse(companion.servicesOffered)
          : companion.servicesOffered || [];
      }
      if (companion.languages) {
        companion.languages = typeof companion.languages === 'string'
          ? JSON.parse(companion.languages)
          : companion.languages || [];
      }
      return companion;
    });

    res.json({
      status: 'success',
      data: transformedCompanions
    });
  } catch (error) {
    logger.controllerError('companionController', 'getApprovedCompanions', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch companions',
      error: error.message
    });
  }
};

/**
 * Save or update companion interests
 */
const saveInterests = async (req, res) => {
  try {
    const userId = req.user.id;
    const { interests } = req.body;

    if (!interests || !Array.isArray(interests)) {
      return res.status(400).json({
        status: 'error',
        message: 'Interests must be an array'
      });
    }

    // Clear existing interests
    await pool.execute(
      'DELETE FROM companion_interests WHERE companion_id = ?',
      [userId]
    );

    // Insert new interests
    for (const interest of interests) {
      try {
        await pool.execute(
          'INSERT INTO companion_interests (companion_id, interest_name) VALUES (?, ?)',
          [userId, interest]
        );
      } catch (interestError) {
        logger.dbError('insertInterest', interestError, `INSERT INTO companion_interests for interest: ${interest}`);
        // Continue with other interests even if one fails
      }
    }

    res.status(200).json({
      status: 'success',
      message: 'Interests updated successfully',
      data: { interests }
    });
  } catch (error) {
    logger.controllerError('companionController', 'saveInterests', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to save interests',
      error: error.message
    });
  }
};

/**
 * Get companion interests
 */
const getCompanionInterests = async (req, res) => {
  try {
    const { companionId } = req.params;

    const [interests] = await pool.execute(
      'SELECT interest_name FROM companion_interests WHERE companion_id = ?',
      [companionId]
    );

    res.status(200).json({
      status: 'success',
      data: {
        interests: interests.map(i => i.interest_name)
      }
    });
  } catch (error) {
    logger.controllerError('companionController', 'getInterests', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch interests',
      error: error.message
    });
  }
};

/**
 * Default services for companions
 */
const DEFAULT_COMPANION_SERVICES = [
  'Travel Companion',
  'Social Companion',
  'Event Companion',
  'Wine Tasting',
  'City Tours',
  'Museum Visits',
  'Theater & Arts',
  'Outdoor Activities',
  'Business Events',
  'Dinner Companion'
];

/**
 * Get companion's registered services
 */
const getCompanionServices = async (req, res) => {
  try {
    const userId = req.user.id;

    logger.controllerInfo('companionController', 'getCompanionServices', 'Fetching services for companion', { userId });

    // Get services from companion application
    const [applications] = await pool.execute(
      `SELECT services_offered, status FROM companion_applications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    logger.debug('Query result for companion services', {
      userId,
      hasResults: applications.length > 0
    });

    if (applications.length === 0) {
      logger.info('No application found for user - returning default services', { userId });
      // Return default services instead of error so companion can still set availability
      return res.status(200).json({
        status: 'success',
        data: transformToFrontend({
          services: DEFAULT_COMPANION_SERVICES,
          is_default: true
        })
      });
    }

    logger.debug('Raw services_offered value', {
      userId,
      servicesOffered: applications[0].services_offered,
      servicesOfferedType: typeof applications[0].services_offered
    });

    // Parse services if stored as JSON
    let services = [];
    if (applications[0].services_offered) {
      try {
        // Try to parse as JSON if it's a string
        if (typeof applications[0].services_offered === 'string') {
          services = JSON.parse(applications[0].services_offered);
        } else {
          services = applications[0].services_offered;
        }
      } catch (e) {
        logger.warn('Failed to parse services JSON', {
          userId,
          error: e.message,
          rawValue: applications[0].services_offered
        });
        // If parsing fails, try to use as is or split by comma
        if (typeof applications[0].services_offered === 'string') {
          // Check if it's a comma-separated string
          services = applications[0].services_offered.split(',').map(s => s.trim());
        } else {
          services = [];
        }
      }
    } else {
      logger.debug('services_offered is null or undefined', { userId });
    }

    logger.debug('Parsed services successfully', {
      userId,
      services: services,
      isArray: Array.isArray(services)
    });

    // If no services are registered, return default services
    if (!services || (Array.isArray(services) && services.length === 0)) {
      logger.info('No services registered - returning default services', { userId });
      return res.status(200).json({
        status: 'success',
        data: transformToFrontend({
          services: DEFAULT_COMPANION_SERVICES,
          is_default: true
        })
      });
    }

    res.status(200).json({
      status: 'success',
      data: transformToFrontend({
        services: Array.isArray(services) ? services : [],
        is_default: false
      })
    });
  } catch (error) {
    logger.controllerError('companionController', 'getCompanionServices', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch companion services',
      error: error.message
    });
  }
};

/**
 * Update companion profile data
 */
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      phoneNumber,
      bio,
      gender,
      services,
      languages,
      hourlyRate,
      addressLine,
      city,
      state,
      country,
      postalCode,
      verificationStatus,
      addressLat,
      addressLon
    } = req.body;

    // AUTO-DETECT timezone from coordinates if provided, otherwise use location
    let detectedTimezone = null;
    if (addressLat !== undefined && addressLon !== null && addressLat !== null && addressLon !== undefined) {
      detectedTimezone = getTimezoneFromCoordinates(parseFloat(addressLat), parseFloat(addressLon));
      logger.info('Auto-detected timezone from coordinates', {
        userId,
        lat: addressLat,
        lon: addressLon,
        timezone: detectedTimezone
      });
    } else if (city && country) {
      // Fallback: detect timezone from city/state/country
      detectedTimezone = getTimezoneFromLocation(city, state, country);
      logger.info('Auto-detected timezone from location', {
        userId,
        city,
        state,
        country,
        timezone: detectedTimezone
      });
    }

    logger.controllerInfo('companionController', 'updateProfile', 'Updating companion profile', {
      userId,
      hasPhoneNumber: !!phoneNumber,
      hasBio: !!bio,
      hasGender: !!gender,
      hasServices: !!services,
      hasLanguages: !!languages,
      hourlyRate,
      hasAddress: !!addressLine,
      hasCity: !!city,
      hasState: !!state,
      hasCountry: !!country,
      hasPostalCode: !!postalCode,
      verificationStatus,
      detectedTimezone
    });

    // Convert arrays to JSON strings for storage
    const servicesJson = services ? JSON.stringify(services) : null;
    const languagesJson = languages ? JSON.stringify(languages) : null;

    // Build dynamic UPDATE query based on provided fields
    const updates = [];
    const values = [];

    if (phoneNumber !== undefined) {
      updates.push('phone_number = ?');
      values.push(phoneNumber);
    }
    if (bio !== undefined) {
      updates.push('bio = ?');
      values.push(bio);
    }
    if (gender !== undefined) {
      updates.push('gender = ?');
      values.push(gender);
    }
    if (servicesJson !== null) {
      updates.push('services_offered = ?');
      values.push(servicesJson);
    }
    if (languagesJson !== null) {
      updates.push('languages = ?');
      values.push(languagesJson);
    }
    if (hourlyRate !== undefined) {
      updates.push('hourly_rate = ?');
      values.push(hourlyRate);
    }
    if (addressLine !== undefined) {
      updates.push('address_line = ?');
      values.push(addressLine);
    }
    if (city !== undefined) {
      updates.push('city = ?');
      values.push(city);
    }
    if (state !== undefined) {
      updates.push('state = ?');
      values.push(state);
    }
    if (country !== undefined) {
      updates.push('country = ?');
      values.push(country);
    }
    if (postalCode !== undefined) {
      updates.push('postal_code = ?');
      values.push(postalCode);
    }
    if (verificationStatus !== undefined) {
      updates.push('verification_status = ?');
      values.push(verificationStatus);
    }
    if (addressLat !== undefined) {
      updates.push('address_lat = ?');
      values.push(addressLat);
    }
    if (addressLon !== undefined) {
      updates.push('address_lon = ?');
      values.push(addressLon);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No fields to update'
      });
    }

    // Add userId to the end of values array
    values.push(userId);

    // Update companion application data
    const query = `UPDATE companion_applications SET ${updates.join(', ')} WHERE user_id = ?`;
    const [result] = await pool.execute(query, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'No application found to update'
      });
    }

    // Update timezone and coordinates in users table if detected
    if (detectedTimezone || addressLat || addressLon || city || state || addressLine || postalCode) {
      const userUpdates = [];
      const userValues = [];
      
      if (detectedTimezone) {
        userUpdates.push('timezone = ?');
        userValues.push(detectedTimezone);
      }
      if (addressLat) {
        userUpdates.push('address_lat = ?');
        userValues.push(addressLat);
      }
      if (addressLon) {
        userUpdates.push('address_lon = ?');
        userValues.push(addressLon);
      }
      if (city) {
        userUpdates.push('city = ?');
        userValues.push(city);
      }
      if (state) {
        userUpdates.push('state = ?');
        userValues.push(state);
      }
      if (addressLine) {
        userUpdates.push('address = ?');
        userValues.push(addressLine);
      }
      if (postalCode) {
        userUpdates.push('zip_code = ?');
        userValues.push(postalCode);
      }

      if (userUpdates.length > 0) {
        userValues.push(userId);
        const userQuery = `UPDATE users SET ${userUpdates.join(', ')} WHERE id = ?`;
        await pool.execute(userQuery, userValues);
        logger.info('Updated user timezone and address', { userId, timezone: detectedTimezone });
      }
    }

    logger.info('Profile updated successfully', { userId, fieldsUpdated: updates.length });

    // AUTO-APPROVE: If verification status is now 'approved', check email and auto-approve application
    if (verificationStatus === 'approved') {
      try {
        // Check if user's email is verified
        const [users] = await pool.execute(
          'SELECT email_verified FROM users WHERE id = ?',
          [userId]
        );

        if (users.length > 0 && users[0].email_verified) {
          // Both Veriff and email are verified - auto-approve the application
          await pool.execute(
            'UPDATE companion_applications SET status = ? WHERE user_id = ?',
            ['approved', userId]
          );

          // Add companion role to user_roles if not already added
          await pool.execute(
            `INSERT INTO user_roles (user_id, role, is_active)
             VALUES (?, 'companion', TRUE)
             ON DUPLICATE KEY UPDATE is_active = TRUE`,
            [userId]
          );

          logger.info('🎉 Companion auto-approved after verification', {
            userId,
            email: req.user.email,
            emailVerified: true,
            veriffVerified: true
          });
        } else {
          logger.warn('Verification completed but email not verified', {
            userId,
            emailVerified: users[0]?.email_verified || false
          });
        }
      } catch (autoApproveError) {
        // Log error but don't fail the profile update
        logger.error('Error during auto-approval', {
          userId,
          error: autoApproveError.message
        });
      }
    }

    res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      data: transformToFrontend({
        phone_number: phoneNumber,
        bio: bio,
        gender: gender,
        services_offered: services,
        languages: languages,
        hourly_rate: hourlyRate,
        address_line: addressLine,
        city: city,
        state: state,
        country: country,
        postal_code: postalCode,
        verification_status: verificationStatus
      })
    });
  } catch (error) {
    logger.controllerError('companionController', 'updateProfile', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update profile',
      error: error.message
    });
  }
};

/**
 * Upload additional photo 1
 */
const uploadAdditionalPhoto1 = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'Please upload a photo'
      });
    }

    const photoUrl = `/uploads/profiles/${req.file.filename}`;

    const [result] = await pool.execute(
      'UPDATE companion_applications SET additional_photo_1_url = ? WHERE user_id = ?',
      [photoUrl, userId]
    );

    logger.info('Additional photo 1 uploaded', { userId, photoUrl, rowsAffected: result.affectedRows });

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'No companion application found to update'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Additional photo 1 uploaded successfully',
      data: { additionalPhoto1Url: photoUrl }
    });
  } catch (error) {
    logger.controllerError('companionController', 'uploadAdditionalPhoto1', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to upload photo',
      error: error.message
    });
  }
};

/**
 * Upload additional photo 2
 */
const uploadAdditionalPhoto2 = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'Please upload a photo'
      });
    }

    const photoUrl = `/uploads/profiles/${req.file.filename}`;

    const [result] = await pool.execute(
      'UPDATE companion_applications SET additional_photo_2_url = ? WHERE user_id = ?',
      [photoUrl, userId]
    );

    logger.info('Additional photo 2 uploaded', { userId, photoUrl, rowsAffected: result.affectedRows });

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'No companion application found to update'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Additional photo 2 uploaded successfully',
      data: { additionalPhoto2Url: photoUrl }
    });
  } catch (error) {
    logger.controllerError('companionController', 'uploadAdditionalPhoto2', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to upload photo',
      error: error.message
    });
  }
};

/**
 * Start Veriff verification session for companion
 */
const startVeriffVerification = async (req, res) => {
  try {
    console.log('🔵 Step 1: startVeriffVerification called');
    console.log('🔵 req.user:', req.user);
    
    const userId = req.user.id;
    const userEmail = req.user.email;
    
    console.log('🔵 Step 2: Got userId:', userId, 'email:', userEmail);

    // Get user information
    console.log('🔵 Step 3: Fetching user from database...');
    const [users] = await pool.execute(
      'SELECT name FROM users WHERE id = ?',
      [userId]
    );
    
    console.log('🔵 Step 4: User query result:', users);

    if (users.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    const userName = users[0].name;
    const nameParts = userName.split(' ');
    const firstName = nameParts[0] || 'User';
    const lastName = nameParts.slice(1).join(' ') || 'Name';

    // Check if user has companion application
    const [applications] = await pool.execute(
      'SELECT id, date_of_birth FROM companion_applications WHERE user_id = ?',
      [userId]
    );

    if (applications.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'No companion application found'
      });
    }

    // Format date of birth for Veriff (YYYY-MM-DD)
    let formattedDOB = null;
    if (applications[0].date_of_birth) {
      const dob = new Date(applications[0].date_of_birth);
      // Format as YYYY-MM-DD
      formattedDOB = dob.toISOString().split('T')[0];
      console.log('🔵 Step 5: Date of birth formatted:', {
        original: applications[0].date_of_birth,
        formatted: formattedDOB
      });
    }

    // Create Veriff session with user data
    const session = await verificationService.createVeriffSession({
      userId: userId,
      email: userEmail,
      firstName: firstName,
      lastName: lastName,
      dateOfBirth: formattedDOB
    });

    // Check if auto-approved (when USE_VERIFF_API=false)
    if (session.autoApproved) {
      logger.info('Auto-approving companion verification (testing mode)', { userId });

      // Update verification status to approved
      await pool.execute(
        'UPDATE companion_applications SET verification_status = ?, verification_completed_at = NOW() WHERE user_id = ?',
        ['approved', userId]
      );

      // Check if email is verified
      const [users] = await pool.execute(
        'SELECT email_verified FROM users WHERE id = ?',
        [userId]
      );

      if (users[0]?.email_verified) {
        // Auto-approve application
        await pool.execute(
          'UPDATE companion_applications SET status = ?, reviewed_at = NOW() WHERE user_id = ?',
          ['approved', userId]
        );

        // Add companion role
        const [existingRole] = await pool.execute(
          'SELECT id FROM user_roles WHERE user_id = ? AND role = ?',
          [userId, 'companion']
        );

        if (existingRole.length === 0) {
          await pool.execute(
            'INSERT INTO user_roles (user_id, role, is_active) VALUES (?, ?, TRUE)',
            [userId, 'companion']
          );
        } else {
          await pool.execute(
            'UPDATE user_roles SET is_active = TRUE WHERE user_id = ? AND role = ?',
            [userId, 'companion']
          );
        }

        logger.info('🎉 Companion auto-approved after verification', { userId });
      }

      return res.status(200).json({
        status: 'success',
        message: 'Identity verification completed successfully (testing mode)',
        data: {
          autoApproved: true,
          verificationStatus: 'approved',
          applicationStatus: users[0]?.email_verified ? 'approved' : 'pending'
        }
      });
    }

    // Real Veriff flow - save session ID and return URL
    await pool.execute(
      'UPDATE companion_applications SET verification_session_id = ?, verification_status = ? WHERE user_id = ?',
      [session.sessionId, 'pending', userId]
    );

    logger.info('Veriff session created for companion', { 
      userId, 
      sessionId: session.sessionId,
      verificationUrl: session.url
    });

    res.status(200).json({
      status: 'success',
      message: 'Veriff session created successfully',
      data: {
        sessionId: session.sessionId,
        verificationUrl: session.url,
        autoApproved: false
      }
    });
  } catch (error) {
    logger.controllerError('companionController', 'startVeriffVerification', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to start verification',
      error: error.message
    });
  }
};

/**
 * Get verification status for companion
 */
const getVerificationStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    const [applications] = await pool.execute(
      'SELECT verification_status, verification_session_id, verification_completed_at FROM companion_applications WHERE user_id = ?',
      [userId]
    );

    if (applications.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'No companion application found'
      });
    }

    const application = applications[0];

    res.status(200).json({
      status: 'success',
      data: transformToFrontend({
        verification: {
          verification_status: application.verification_status || 'not_started',
          verification_session_id: application.verification_session_id,
          verification_completed_at: application.verification_completed_at
        }
      })
    });
  } catch (error) {
    logger.controllerError('companionController', 'getVerificationStatus', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get verification status',
      error: error.message
    });
  }
};

/**
 * Create Stripe Connect account link for payout setup
 * @route POST /api/companion/payout/setup
 */
const createPayoutSetup = async (req, res) => {
  try {
    const companionId = req.user.id;
    
    // Verify user is a companion
    const [companion] = await pool.execute(
      'SELECT id, role, stripe_account_id FROM users WHERE id = ? AND role = ?',
      [companionId, 'companion']
    );

    if (companion.length === 0) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. Companion role required.'
      });
    }

    // Create Stripe Connect account link
    const returnUrl = `${process.env.FRONTEND_URL}/companion/payout/return`;
    const refreshUrl = `${process.env.FRONTEND_URL}/companion/payout/return`;

    const result = await stripeService.createConnectAccountLink(
      companionId,
      returnUrl,
      refreshUrl
    );

    logger.controllerInfo('companionController', 'createPayoutSetup', 'Stripe Connect link created', {
      companionId,
      accountId: result.accountId
    });

    res.status(200).json({
      status: 'success',
      data: {
        url: result.url,
        accountId: result.accountId
      }
    });

  } catch (error) {
    logger.controllerError('companionController', 'createPayoutSetup', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create payout setup link',
      error: error.message
    });
  }
};

/**
 * Get Stripe Connect account status
 * @route GET /api/companion/payout/status
 */
const getPayoutStatus = async (req, res) => {
  try {
    const companionId = req.user.id;

    const [user] = await pool.execute(
      'SELECT stripe_account_id, stripe_account_status FROM users WHERE id = ?',
      [companionId]
    );

    if (user.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    const stripeAccountId = user[0].stripe_account_id;

    // If no Stripe account exists, return not_created status
    if (!stripeAccountId) {
      return res.status(200).json({
        status: 'success',
        data: {
          hasStripeAccount: false,
          accountStatus: 'not_created',
          detailsSubmitted: false,
          chargesEnabled: false,
          payoutsEnabled: false
        }
      });
    }

    // Fetch LATEST status directly from Stripe (don't rely on database)
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const account = await stripe.accounts.retrieve(stripeAccountId);

    // Update database with latest status
    const newStatus = account.details_submitted ? 'active' : 'pending';
    await pool.execute(
      'UPDATE users SET stripe_account_status = ? WHERE id = ?',
      [newStatus, companionId]
    );

    logger.info('Fetched latest Stripe account status', {
      companionId,
      accountId: stripeAccountId,
      detailsSubmitted: account.details_submitted,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled
    });

    res.status(200).json({
      status: 'success',
      data: {
        hasStripeAccount: true,
        accountStatus: newStatus,
        detailsSubmitted: account.details_submitted,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled
      }
    });

  } catch (error) {
    logger.controllerError('companionController', 'getPayoutStatus', error, req);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get payout status',
      error: error.message
    });
  }
};

module.exports = {
  submitApplication,
  getApplicationStatus,
  updateProfilePhoto,
  updateProfile,
  getApprovedCompanions,
  saveInterests,
  getCompanionInterests,
  getCompanionServices,
  uploadAdditionalPhoto1,
  uploadAdditionalPhoto2,
  startVeriffVerification,
  getVerificationStatus,
  createPayoutSetup,
  getPayoutStatus
};
