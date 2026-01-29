/**
 * Client Controller
 * Handles client-specific operations like profile management and identity verification with Veriff integration
 */

const { pool: db } = require('../config/database');
const path = require('path');
const { deleteOldPhoto } = require('../utils/fileManager');
const { transformToFrontend } = require('../utils/transformer');
const verificationService = require('../services/verificationService');
const { calculateAge, isAdult, formatLocation } = require('../utils/dateHelpers');
const { getTimezoneFromCoordinates } = require('../services/timezoneService');

/**
 * Get client profile
 */
const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    console.log('🔍 Backend getProfile: Request from user:', {
      userId: userId,
      userEmail: req.user.email,
      userRole: req.user.activeRole || req.user.role
    });

    const [users] = await db.execute(
      'SELECT id, name, email, role, email_verified, profile_picture, address, city, state, zip_code, timezone, created_at FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Security verification: Ensure fetched user matches JWT user
    if (users[0].id !== userId) {
      console.error('⚠️ SECURITY WARNING: Fetched user ID does not match JWT user ID!', {
        jwtUserId: userId,
        fetchedUserId: users[0].id
      });
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    console.log('✅ Backend getProfile: User ID verified (JWT matches database)', {
      userId: userId,
      userName: users[0].name
    });

    // Check for client verification data
    const [verifications] = await db.execute(
      `SELECT
        id,
        profile_photo_url,
        id_document_url,
        date_of_birth,
        government_id_number,
        phone_number,
        location,
        address_line,
        city,
        state,
        country,
        postal_code,
        bio,
        verification_status,
        rejection_reason,
        verified_at,
        reviewed_at,
        created_at
      FROM client_verifications
      WHERE user_id = ?`,
      [userId]
    );

    const verification = verifications[0] || null;

    const responseData = transformToFrontend({
      user: users[0],
      verification
    });

    // Extract user ID from profile photo URL to verify it matches
    const photoUrl = verification?.profile_photo_url;
    let photoUserId = null;
    if (photoUrl) {
      const match = photoUrl.match(/\/uploads\/profiles\/(\d+)-/);
      photoUserId = match ? parseInt(match[1], 10) : null;
    }

    console.log('📋 getProfile response data:', {
      jwtUserId: userId,
      user: {
        id: users[0].id,
        name: users[0].name,
        emailVerified: users[0].email_verified,
        address: users[0].address,
        city: users[0].city,
        state: users[0].state,
        zipCode: users[0].zip_code,
        profilePicture: users[0].profile_picture
      },
      verification: verification ? {
        addressLine: verification.address_line,
        city: verification.city,
        state: verification.state,
        postalCode: verification.postal_code,
        profilePhotoUrl: verification.profile_photo_url,
        photoUserIdFromFilename: photoUserId,
        photoUserIdMatchesJWT: photoUserId === userId,
        verificationStatus: verification.verification_status
      } : null
    });

    // Extra security check: Verify photo filename contains correct user ID
    if (photoUrl && photoUserId !== userId) {
      console.error('⚠️ SECURITY WARNING: Photo filename user ID does not match JWT user ID!', {
        jwtUserId: userId,
        photoUserId: photoUserId,
        photoUrl: photoUrl
      });
      // Still return the data but log the warning for investigation
    }

    res.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('❌ Error fetching client profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Update client profile
 */
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    // Accept both camelCase (preferred) and snake_case (backward compatibility)
    const fullName = req.body.fullName || req.body.full_name;
    const phoneNumber = req.body.phoneNumber || req.body.phone_number;
    const addressLine = req.body.addressLine || req.body.address_line;
    const postalCode = req.body.postalCode || req.body.postal_code;
    const verificationStatus = req.body.verificationStatus || req.body.verification_status;
    const addressLat = req.body.addressLat || req.body.address_lat;
    const addressLon = req.body.addressLon || req.body.address_lon;
    const { location, city, state, country, bio, gender } = req.body;

    // AUTO-DETECT timezone from coordinates if provided
    let detectedTimezone = null;
    if (addressLat !== undefined && addressLon !== null && addressLat !== null && addressLon !== undefined) {
      detectedTimezone = getTimezoneFromCoordinates(parseFloat(addressLat), parseFloat(addressLon));
      console.log('🌍 Auto-detected timezone from coordinates:', {
        lat: addressLat,
        lon: addressLon,
        timezone: detectedTimezone
      });
    }

    console.log('🔍 updateProfile: Received data', {
      userId,
      fullName,
      phoneNumber,
      location,
      addressLine,
      city,
      state,
      country,
      postalCode,
      bio,
      verificationStatus,
      verificationStatusType: typeof verificationStatus,
      detectedTimezone,
      rawBody: req.body
    });

    // Update user name
    if (fullName) {
      console.log('📝 Updating user name:', fullName);
      await db.execute(
        'UPDATE users SET name = ? WHERE id = ?',
        [fullName, userId]
      );
    }

    // Update address fields and timezone in users table (for profile completion check)
    if (addressLine || city || state || postalCode || detectedTimezone) {
      console.log('📍 Updating address and timezone in users table:', { 
        addressLine, city, state, postalCode, 
        timezone: detectedTimezone,
        lat: addressLat,
        lon: addressLon
      });
      await db.execute(
        `UPDATE users 
         SET address = COALESCE(?, address),
             city = COALESCE(?, city),
             state = COALESCE(?, state),
             zip_code = COALESCE(?, zip_code),
             timezone = COALESCE(?, timezone),
             address_lat = COALESCE(?, address_lat),
             address_lon = COALESCE(?, address_lon)
         WHERE id = ?`,
        [
          addressLine || null, 
          city || null, 
          state || null, 
          postalCode || null,
          detectedTimezone || null,
          addressLat || null,
          addressLon || null,
          userId
        ]
      );
    }

    // Check if verification record exists
    console.log('🔍 Checking for existing verification record...');
    const [existing] = await db.execute(
      'SELECT id FROM client_verifications WHERE user_id = ?',
      [userId]
    );

    console.log('📊 Existing verification records:', existing.length);

    if (existing.length > 0) {
      // Update existing record - only update provided fields using COALESCE
      console.log('📝 Updating existing verification record...');
      
      // Build dynamic UPDATE query to only update provided fields
      const updates = [];
      const values = [];
      
      if (phoneNumber !== undefined) {
        updates.push('phone_number = ?');
        values.push(phoneNumber ?? null);
      }
      if (location !== undefined) {
        updates.push('location = ?');
        values.push(location ?? null);
      }
      if (addressLine !== undefined) {
        updates.push('address_line = ?');
        values.push(addressLine ?? null);
      }
      if (city !== undefined) {
        updates.push('city = ?');
        values.push(city ?? null);
      }
      if (state !== undefined) {
        updates.push('state = ?');
        values.push(state ?? null);
      }
      if (country !== undefined) {
        updates.push('country = ?');
        values.push(country ?? null);
      }
      if (postalCode !== undefined) {
        updates.push('postal_code = ?');
        values.push(postalCode ?? null);
      }
      if (bio !== undefined) {
        updates.push('bio = ?');
        values.push(bio ?? null);
      }
      if (gender !== undefined) {
        updates.push('gender = ?');
        values.push(gender ?? null);
      }
      if (verificationStatus !== undefined) {
        updates.push('verification_status = ?');
        values.push(verificationStatus ?? null);
        if (verificationStatus === 'approved') {
          updates.push('verified_at = CURRENT_TIMESTAMP');
        }
      }
      if (addressLat !== undefined) {
        updates.push('address_lat = ?');
        values.push(addressLat ?? null);
      }
      if (addressLon !== undefined) {
        updates.push('address_lon = ?');
        values.push(addressLon ?? null);
      }
      
      // Always update updated_at
      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(userId);
      
      if (updates.length > 1) { // More than just updated_at
      const updateResult = await db.execute(
          `UPDATE client_verifications SET ${updates.join(', ')} WHERE user_id = ?`,
          values
      );
      console.log('✅ Update result:', updateResult);
      } else {
        console.log('⚠️ No fields to update');
      }
    } else {
      // Create new record
      console.log('📝 Creating new verification record...');
      const insertResult = await db.execute(
        `INSERT INTO client_verifications (
          user_id,
          phone_number,
          location,
          address_line,
          city,
          state,
          country,
          postal_code,
          bio,
          gender,
          verification_status,
          address_lat,
          address_lon
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, phoneNumber ?? null, location ?? null, addressLine ?? null, city ?? null, state ?? null, country ?? null, postalCode ?? null, bio ?? null, gender ?? null, verificationStatus ?? 'not_submitted', addressLat ?? null, addressLon ?? null]
      );
      console.log('✅ Insert result:', insertResult);
    }

    // Build full location string from address components
    const locationComponents = [addressLine, city, state, country, postalCode]
      .filter(Boolean)
      .join(', ');

    // Update the location field with the full address
    if (locationComponents) {
      console.log('📍 Updating location field:', locationComponents);
      await db.execute(
        'UPDATE client_verifications SET location = ? WHERE user_id = ?',
        [locationComponents, userId]
      );
    }

    console.log('✅ Profile updated successfully');
    res.json({
      success: true,
      message: 'Profile updated successfully'
    });

  } catch (error) {
    console.error('❌ Error updating client profile:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sqlMessage: error.sqlMessage
    });
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
      details: error.sqlMessage || error.code
    });
  }
};

/**
 * Update profile photo
 */
const updateProfilePhoto = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No photo file uploaded'
      });
    }

    // Store file locally on VPS
    const photoUrl = `/uploads/profiles/${req.file.filename}`;

    // Check if verification record exists
    const [existing] = await db.execute(
      'SELECT id, profile_photo_url FROM client_verifications WHERE user_id = ?',
      [userId]
    );

    if (existing.length > 0) {
      // Delete old photo from local storage
      if (existing[0].profile_photo_url) {
        await deleteOldPhoto(existing[0].profile_photo_url);
      }

      // Update existing record in client_verifications
      await db.execute(
        'UPDATE client_verifications SET profile_photo_url = ? WHERE user_id = ?',
        [photoUrl, userId]
      );

      // ALSO update users table for profile completion check
      await db.execute(
        'UPDATE users SET profile_picture = ? WHERE id = ?',
        [photoUrl, userId]
      );
    } else {
      // Create new record in client_verifications
      await db.execute(
        'INSERT INTO client_verifications (user_id, profile_photo_url) VALUES (?, ?)',
        [userId, photoUrl]
      );

      // ALSO update users table for profile completion check
      await db.execute(
        'UPDATE users SET profile_picture = ? WHERE id = ?',
        [photoUrl, userId]
      );
    }

    res.json({
      success: true,
      message: 'Profile photo updated successfully',
      data: transformToFrontend({ photo_url: photoUrl })
    });

  } catch (error) {
    console.error('❌ Error updating profile photo:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Submit identity verification with Veriff integration
 * Now auto-approves without storing ID documents
 */
const submitVerification = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      dateOfBirth,
      governmentIdNumber,
      // New Veriff-required fields
      nationality,
      documentType,
      documentExpirationDate,
      documentCountryIssue
    } = req.body;

    console.log('📥 submitVerification: Received data', {
      userId,
      dateOfBirth: dateOfBirth ? 'provided' : 'missing',
      governmentIdNumber: governmentIdNumber ? 'provided' : 'missing',
      nationality: nationality ? 'provided' : 'missing',
      documentType: documentType ? 'provided' : 'missing',
      documentExpirationDate: documentExpirationDate ? 'provided' : 'missing',
      documentCountryIssue: documentCountryIssue ? 'provided' : 'missing'
    });

    // Validate required fields
    if (!dateOfBirth) {
      return res.status(400).json({
        success: false,
        message: 'Date of birth is required'
      });
    }

    if (!governmentIdNumber) {
      return res.status(400).json({
        success: false,
        message: 'Government ID number is required'
      });
    }

    // Validate Veriff-required fields
    if (!nationality || !documentType || !documentExpirationDate || !documentCountryIssue) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required identity verification fields: nationality, document type, expiration date, and country of issue'
      });
    }

    // Validate document expiration date (must be in the future)
    const expirationDate = new Date(documentExpirationDate);
    if (expirationDate <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Document expiration date must be in the future'
      });
    }

    // Validate age (must be 18+)
    if (!isAdult(dateOfBirth)) {
      const age = calculateAge(dateOfBirth);
      return res.status(400).json({
        success: false,
        message: `You must be at least 18 years old to use this service. Current age: ${age}`
      });
    }

    // Check if user has provided address information (city, state, country required per 3-step model)
    const [verificationCheck] = await db.execute(
      'SELECT city, state, country FROM client_verifications WHERE user_id = ?',
      [userId]
    );

    if (verificationCheck.length === 0 ||
        !verificationCheck[0].city ||
        !verificationCheck[0].state ||
        !verificationCheck[0].country) {
      return res.status(400).json({
        success: false,
        message: 'Please update your address information (city, state, and country) before submitting verification'
      });
    }

    // Get user name for verification
    const [users] = await db.execute(
      'SELECT name, email FROM users WHERE id = ?',
      [userId]
    );
    const userName = users[0]?.name || '';
    const [firstName, ...lastNameParts] = userName.split(' ');
    const lastName = lastNameParts.join(' ');

    // Use verification service to auto-approve
    const verificationResult = await verificationService.verifyIdentity({
      firstName: firstName || 'Unknown',
      lastName: lastName || 'Unknown',
      dateOfBirth,
      nationality,
      documentType,
      documentNumber: governmentIdNumber,
      documentExpirationDate,
      documentCountryIssue
    });

    console.log('✅ Verification result:', {
      userId,
      status: verificationResult.status,
      method: verificationResult.verificationMethod
    });

    // Check if verification record exists
    const [existing] = await db.execute(
      'SELECT id FROM client_verifications WHERE user_id = ?',
      [userId]
    );

    if (existing.length > 0) {
      // Update existing record - automatically approved (no ID document file)
      await db.execute(
        `UPDATE client_verifications
        SET date_of_birth = ?,
            government_id_number = ?,
            nationality = ?,
            document_type = ?,
            document_expiration_date = ?,
            document_country_issue = ?,
            verification_session_id = ?,
            verification_completed_at = ?,
            verification_status = 'approved',
            verified_at = CURRENT_TIMESTAMP,
            reviewed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?`,
        [
          dateOfBirth,
          governmentIdNumber,
          nationality,
          documentType,
          documentExpirationDate,
          documentCountryIssue,
          verificationResult.verificationSessionId,
          verificationResult.verificationCompletedAt,
          userId
        ]
      );
    } else {
      // Create new record - automatically approved (no ID document file)
      await db.execute(
        `INSERT INTO client_verifications (
          user_id,
          date_of_birth,
          government_id_number,
          nationality,
          document_type,
          document_expiration_date,
          document_country_issue,
          verification_session_id,
          verification_completed_at,
          verification_status,
          verified_at,
          reviewed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          userId,
          dateOfBirth,
          governmentIdNumber,
          nationality,
          documentType,
          documentExpirationDate,
          documentCountryIssue,
          verificationResult.verificationSessionId,
          verificationResult.verificationCompletedAt
        ]
      );
    }

    // Calculate age and location for response
    const age = calculateAge(dateOfBirth);
    const location = formatLocation({
      city: verificationCheck[0].city,
      state: verificationCheck[0].state,
      country: verificationCheck[0].country
    });

    console.log(`✅ Client verification auto-approved for user ${userId}:`, {
      age,
      location,
      governmentIdNumber: governmentIdNumber.substring(0, 4) + '****', // Log partial for security
      status: 'approved',
      verificationMethod: verificationResult.verificationMethod
    });

    res.json({
      success: true,
      message: 'Verification successful! Your identity has been automatically verified.',
      data: {
        age,
        location,
        verificationMethod: verificationResult.verificationMethod
      }
    });

  } catch (error) {
    console.error('❌ Error submitting verification:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Get verification status with age and location data
 */
const getVerificationStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    const [results] = await db.execute(
      `SELECT
        verification_status,
        verified_at,
        reviewed_at,
        created_at,
        date_of_birth,
        city,
        state,
        country,
        nationality,
        document_type,
        document_expiration_date,
        document_country_issue,
        verification_session_id,
        verification_completed_at
      FROM client_verifications
      WHERE user_id = ?`,
      [userId]
    );

    if (results.length === 0) {
      return res.json({
        status: 'success',
        data: transformToFrontend({ verification_status: 'not_submitted' })
      });
    }

    const verification = results[0];

    // Calculate age and format location
    const age = verification.date_of_birth ? calculateAge(verification.date_of_birth) : null;
    const location = formatLocation({
      city: verification.city,
      state: verification.state,
      country: verification.country
    });

    // Add calculated fields
    const responseData = transformToFrontend({
      ...verification,
      age,
      location,
      verificationMethod: verification.verification_session_id ? 'veriff_api' : 'auto_approved_testing'
    });

    res.json({
      status: 'success',
      data: responseData
    });

  } catch (error) {
    console.error('❌ Error fetching verification status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  updateProfilePhoto,
  submitVerification,
  getVerificationStatus
};

