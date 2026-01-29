const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { pool } = require('../config/database');
const logger = require('./logger');

// Cache for platform account info (refreshed every hour)
let platformAccountCache = null;
let platformAccountCacheTime = 0;
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

/**
 * Get the platform's Stripe account country
 * This is crucial for ensuring connected accounts are created in the same region
 * @returns {Promise<string>} The country code (e.g., 'US', 'IN')
 */
async function getPlatformCountry() {
  try {
    const now = Date.now();

    // Return cached value if still valid
    if (platformAccountCache && (now - platformAccountCacheTime) < CACHE_DURATION_MS) {
      return platformAccountCache.country;
    }

    // Fetch platform account details from Stripe
    const account = await stripe.accounts.retrieve();

    platformAccountCache = {
      country: account.country,
      businessType: account.business_type,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled
    };
    platformAccountCacheTime = now;

    logger.info('Platform Stripe account info retrieved', {
      country: account.country,
      businessType: account.business_type
    });

    return account.country;
  } catch (error) {
    logger.error('Failed to retrieve platform Stripe account', {
      error: error.message
    });
    // Default to env var or 'IN' (India) as fallback
    // IMPORTANT: Also update cache so getPlatformAccountInfo() doesn't return null
    const fallbackCountry = process.env.STRIPE_PLATFORM_COUNTRY || 'IN';
    platformAccountCache = {
      country: fallbackCountry,
      businessType: 'unknown',
      chargesEnabled: false,
      payoutsEnabled: false,
      isFallback: true // Flag to indicate this is fallback data
    };
    platformAccountCacheTime = Date.now();
    return fallbackCountry;
  }
}

/**
 * Get full platform account info
 * @returns {Promise<object>} Platform account details
 */
async function getPlatformAccountInfo() {
  await getPlatformCountry(); // This populates the cache
  return platformAccountCache;
}

/**
 * Create a standalone PaymentIntent (not tied to a booking yet)
 * @param {object} options - Payment intent options
 * @param {number} options.amount - Amount in dollars
 * @param {string} options.currency - Currency code (default: 'usd')
 * @param {string} options.receipt_email - Client's email for receipt
 * @param {object} options.metadata - Additional metadata
 */
async function createPaymentIntent({ amount, currency = 'usd', receipt_email = null, metadata = {} }) {
  try {
    const paymentIntentData = {
      amount: Math.round(amount * 100), // Convert dollars to cents
      currency,
      payment_method_types: ['card'],
      capture_method: 'manual', // CRITICAL: Don't capture immediately
      metadata,
      description: metadata.type === 'booking' ? 'Booking Payment Authorization' : 'Payment Authorization'
    };

    // Add receipt_email if provided
    if (receipt_email) {
      paymentIntentData.receipt_email = receipt_email;
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);

    logger.info('Payment intent created', {
      paymentIntentId: paymentIntent.id,
      amount,
      metadata
    });

    return paymentIntent;
  } catch (error) {
    logger.error('Payment intent creation failed', {
      amount,
      error: error.message
    });
    throw error;
  }
}

/**
 * Retrieve a PaymentIntent by ID
 * @param {string} paymentIntentId - The payment intent ID
 */
async function retrievePaymentIntent(paymentIntentId) {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    logger.info('Payment intent retrieved', {
      paymentIntentId,
      status: paymentIntent.status
    });

    return paymentIntent;
  } catch (error) {
    logger.error('Payment intent retrieval failed', {
      paymentIntentId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Update a PaymentIntent (e.g., to add metadata like bookingId)
 * @param {string} paymentIntentId - The payment intent ID
 * @param {object} updateData - Data to update (metadata, etc.)
 */
async function updatePaymentIntent(paymentIntentId, updateData) {
  try {
    const paymentIntent = await stripe.paymentIntents.update(paymentIntentId, updateData);

    logger.info('Payment intent updated', {
      paymentIntentId,
      updatedFields: Object.keys(updateData)
    });

    return paymentIntent;
  } catch (error) {
    logger.error('Payment intent update failed', {
      paymentIntentId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Create a PaymentIntent to authorize (hold) payment
 * This is called when companion accepts a booking
 * @param {number} bookingId - The booking ID
 * @param {number} amount - Amount in dollars
 * @param {string} clientEmail - Client's email
 * @param {object} metadata - Additional metadata
 * @param {object} connection - Optional database connection (for transactions)
 */
async function authorizePayment(bookingId, amount, clientEmail, metadata = {}, connection = null) {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert dollars to cents
      currency: 'usd',
      payment_method_types: ['card'],
      receipt_email: clientEmail, // Changed from customer_email to receipt_email
      capture_method: 'manual', // CRITICAL: Don't capture immediately
      metadata: {
        booking_id: bookingId,
        ...metadata
      },
      description: `Booking #${bookingId} - Hold payment`
    });

    // Use provided connection or fall back to pool
    const db = connection || pool;
    
    // Save payment intent ID to database
    await db.execute(
      `UPDATE bookings 
       SET payment_intent_id = ?,
           payment_status = 'pending'
       WHERE id = ?`,
      [paymentIntent.id, bookingId]
    );

    logger.info('Payment authorized', {
      bookingId,
      paymentIntentId: paymentIntent.id,
      amount
    });

    return {
      success: true,
      clientSecret: paymentIntent.client_secret, // Send this to frontend
      paymentIntentId: paymentIntent.id
    };
  } catch (error) {
    logger.error('Payment authorization failed', {
      bookingId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Capture the authorized payment after meeting ends and OTP verified
 * Calculates and stores platform fee and companion amount
 * @param {number} bookingId - The booking ID
 * @param {object} connection - Optional database connection (for transactions)
 */
async function capturePayment(bookingId, connection = null) {
  try {
    // Use provided connection or fall back to pool
    const db = connection || pool;

    // Get booking details
    const [booking] = await db.execute(
      'SELECT * FROM bookings WHERE id = ?',
      [bookingId]
    );

    if (booking.length === 0) {
      throw new Error('Booking not found');
    }

    const { payment_intent_id, total_amount } = booking[0];

    if (!payment_intent_id) {
      throw new Error('No payment intent found for this booking');
    }

    // Capture the payment
    const capturedPayment = await stripe.paymentIntents.capture(payment_intent_id);

    // Verify capture actually succeeded
    if (capturedPayment.status !== 'succeeded') {
      throw new Error(`Payment capture returned unexpected status: ${capturedPayment.status}`);
    }

    // Calculate platform fee and companion amount
    const platformFeePercentage = 0.15; // 15% platform fee
    const platformFeeAmount = Number((total_amount * platformFeePercentage).toFixed(2));
    const companionAmount = Number((total_amount * (1 - platformFeePercentage)).toFixed(2));

    // Update database with payment status and fee breakdown
    await db.execute(
      `UPDATE bookings
       SET payment_status = 'paid',
           paid_at = NOW(),
           platform_fee_amount = ?,
           companion_amount = ?
       WHERE id = ?`,
      [platformFeeAmount, companionAmount, bookingId]
    );

    logger.info('Payment captured', {
      bookingId,
      paymentIntentId: payment_intent_id,
      totalAmount: total_amount,
      platformFee: platformFeeAmount,
      companionAmount: companionAmount
    });

    return {
      success: true,
      paymentIntentId: payment_intent_id,
      totalAmount: total_amount,
      platformFeeAmount,
      companionAmount
    };
  } catch (error) {
    logger.error('Payment capture failed', {
      bookingId,
      error: error.message
    });

    // Use provided connection or fall back to pool
    const db = connection || pool;

    // Save failure reason to database
    await db.execute(
      `UPDATE bookings
       SET payment_status = 'failed',
           capture_failure_reason = ?
       WHERE id = ?`,
      [error.message, bookingId]
    );

    throw error;
  }
}

/**
 * Transfer money to companion (85% of total)
 * Called after payment is captured
 * Records earnings in companion_earnings table
 *
 * IMPORTANT: If transfer fails due to cross-border restrictions,
 * the booking is still marked as 'completed' but transfer_status = 'pending_manual'
 * This allows admin to manually process the payout later.
 *
 * @param {number} bookingId - The booking ID
 * @param {object} connection - Optional database connection (for transactions)
 */
async function transferToCompanion(bookingId, connection = null) {
  // Use provided connection or fall back to pool
  const db = connection || pool;

  try {
    const [booking] = await db.execute(
      `SELECT b.*, u.stripe_account_id as companion_stripe_account_id, u.email as companion_email
       FROM bookings b
       JOIN users u ON b.companion_id = u.id
       WHERE b.id = ?`,
      [bookingId]
    );

    if (booking.length === 0) {
      throw new Error('Booking not found');
    }

    const { total_amount, companion_id, companion_stripe_account_id, companion_email, platform_fee_amount, companion_amount } = booking[0];

    // Use stored amounts from capture, or calculate if not present (15% platform fee)
    const platformFee = platform_fee_amount || Number((total_amount * 0.15).toFixed(2));
    const companionEarnings = companion_amount || Number((total_amount * 0.85).toFixed(2));

    // Check if companion has Stripe account set up
    if (!companion_stripe_account_id) {
      logger.warn('Companion has no Stripe account - marking for manual payout', {
        bookingId,
        companionId: companion_id,
        companionEmail: companion_email
      });

      // Mark booking as completed but transfer pending manual processing
      await markTransferForManualProcessing(db, bookingId, companion_id, total_amount, platformFee, companionEarnings, 'NO_STRIPE_ACCOUNT', 'Companion has not set up their Stripe account');

      return {
        success: false,
        requiresManualProcessing: true,
        reason: 'NO_STRIPE_ACCOUNT',
        companionEarnings,
        platformFee,
        message: 'Companion has no Stripe account - marked for manual payout'
      };
    }

    // Attempt to create transfer to companion
    try {
      const transfer = await stripe.transfers.create({
        amount: Math.round(companionEarnings * 100), // Convert to cents
        currency: 'usd',
        destination: companion_stripe_account_id,
        transfer_group: `booking_${bookingId}`,
        description: `Payment for booking #${bookingId}`,
        metadata: {
          booking_id: bookingId,
          platform_fee: platformFee,
          companion_earnings: companionEarnings
        }
      });

      // Verify transfer is not already failed
      if (transfer.status === 'failed' || transfer.status === 'canceled') {
        throw new Error(`Transfer was not successful. Status: ${transfer.status}`);
      }

      // Calculate when funds become available (48 hours from now)
      const availableAt = new Date();
      availableAt.setHours(availableAt.getHours() + 48);

      // Update bookings table - SUCCESSFUL transfer
      await db.execute(
        `UPDATE bookings
         SET payment_released_at = NOW(),
             transfer_id = ?,
             platform_fee_amount = ?,
             companion_amount = ?,
             transfer_status = 'completed',
             status = 'completed'
         WHERE id = ?`,
        [transfer.id, platformFee, companionEarnings, bookingId]
      );

      // Record earnings in companion_earnings table
      await db.execute(
        `INSERT INTO companion_earnings
         (companion_id, booking_id, gross_amount, platform_fee, net_amount, transfer_id, transfer_status, available_at)
         VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)
         ON DUPLICATE KEY UPDATE
         transfer_id = VALUES(transfer_id),
         transfer_status = 'completed',
         available_at = VALUES(available_at),
         updated_at = NOW()`,
        [companion_id, bookingId, total_amount, platformFee, companionEarnings, transfer.id, availableAt]
      );

      logger.info('Transfer to companion completed', {
        bookingId,
        companionId: companion_id,
        transferId: transfer.id,
        companionEarnings,
        platformFee,
        availableAt
      });

      return {
        success: true,
        transferId: transfer.id,
        companionEarnings,
        platformFee
      };

    } catch (stripeError) {
      // Check if this is a cross-border transfer restriction error
      const isCrossBorderError = stripeError.message && (
        stripeError.message.includes('restricted outside of your platform') ||
        stripeError.message.includes('transfers_not_allowed') ||
        stripeError.code === 'transfers_not_allowed'
      );

      const errorCode = isCrossBorderError ? 'CROSS_BORDER_RESTRICTION' : 'STRIPE_TRANSFER_ERROR';
      const errorMessage = stripeError.message || 'Unknown Stripe error';

      logger.error('Stripe transfer failed - marking for manual processing', {
        bookingId,
        companionId: companion_id,
        error: errorMessage,
        errorCode,
        isCrossBorderError,
        stripeAccountId: companion_stripe_account_id
      });

      // Mark for manual processing instead of failing
      await markTransferForManualProcessing(db, bookingId, companion_id, total_amount, platformFee, companionEarnings, errorCode, errorMessage);

      // Create admin notification for failed transfer
      try {
        await createTransferFailureNotification(db, bookingId, companion_id, companion_email, companionEarnings, errorCode, errorMessage);
      } catch (notifyError) {
        logger.warn('Failed to create admin notification for transfer failure', {
          bookingId,
          error: notifyError.message
        });
      }

      return {
        success: false,
        requiresManualProcessing: true,
        reason: errorCode,
        companionEarnings,
        platformFee,
        message: isCrossBorderError
          ? 'Cross-border transfer not allowed - marked for manual payout'
          : `Transfer failed: ${errorMessage} - marked for manual payout`
      };
    }

  } catch (error) {
    logger.error('Transfer to companion failed with unexpected error', {
      bookingId,
      error: error.message,
      stack: error.stack
    });

    // Mark as failed but still complete the booking
    await db.execute(
      `UPDATE bookings
       SET transfer_status = 'failed',
           status = 'completed'
       WHERE id = ?`,
      [bookingId]
    );

    throw error;
  }
}

/**
 * Mark a transfer for manual processing when automatic transfer fails
 * This ensures the booking is still completed but flagged for admin attention
 */
async function markTransferForManualProcessing(db, bookingId, companionId, totalAmount, platformFee, companionEarnings, errorCode, errorMessage) {
  // Update bookings table - mark as completed but transfer pending
  await db.execute(
    `UPDATE bookings
     SET platform_fee_amount = ?,
         companion_amount = ?,
         transfer_status = 'pending',
         transfer_failure_reason = ?,
         status = 'completed'
     WHERE id = ?`,
    [platformFee, companionEarnings, `${errorCode}: ${errorMessage}`, bookingId]
  );

  // Record pending earnings in companion_earnings table
  await db.execute(
    `INSERT INTO companion_earnings
     (companion_id, booking_id, gross_amount, platform_fee, net_amount, transfer_id, transfer_status)
     VALUES (?, ?, ?, ?, ?, NULL, 'pending')
     ON DUPLICATE KEY UPDATE
     transfer_status = 'pending',
     updated_at = NOW()`,
    [companionId, bookingId, totalAmount, platformFee, companionEarnings]
  );

  logger.info('Transfer marked for manual processing', {
    bookingId,
    companionId,
    companionEarnings,
    errorCode
  });
}

/**
 * Create admin notification for failed transfer
 * This alerts admins to manually process the payout
 */
async function createTransferFailureNotification(db, bookingId, companionId, companionEmail, amount, errorCode, errorMessage) {
  // Insert into admin_notifications table if it exists, otherwise log
  try {
    await db.execute(
      `INSERT INTO admin_notifications
       (type, title, message, data, is_read, created_at)
       VALUES (?, ?, ?, ?, FALSE, NOW())`,
      [
        'transfer_failure',
        `Transfer Failed - Booking #${bookingId}`,
        `Transfer of $${amount.toFixed(2)} to companion (ID: ${companionId}, Email: ${companionEmail}) failed. Error: ${errorCode}. Requires manual processing.`,
        JSON.stringify({
          bookingId,
          companionId,
          companionEmail,
          amount,
          errorCode,
          errorMessage
        })
      ]
    );

    logger.info('Admin notification created for transfer failure', {
      bookingId,
      companionId,
      amount
    });
  } catch (notifyError) {
    // Table might not exist - just log the error
    logger.warn('Could not create admin notification - table may not exist', {
      bookingId,
      error: notifyError.message
    });
  }
}

/**
 * Cancel payment authorization (release the hold)
 * Called when booking is cancelled before meeting
 * @param {number} bookingId - The booking ID
 * @param {object} connection - Optional database connection (for transactions)
 */
async function cancelAuthorization(bookingId, connection = null) {
  try {
    // Use provided connection or fall back to pool
    const db = connection || pool;
    
    const [booking] = await db.execute(
      'SELECT payment_intent_id FROM bookings WHERE id = ?',
      [bookingId]
    );

    if (booking.length === 0 || !booking[0].payment_intent_id) {
      throw new Error('No payment intent found');
    }

    const { payment_intent_id } = booking[0];

    // Cancel the payment intent
    await stripe.paymentIntents.cancel(payment_intent_id);

    // Update database
    await db.execute(
      `UPDATE bookings 
       SET payment_status = 'cancelled'
       WHERE id = ?`,
      [bookingId]
    );

    logger.info('Payment authorization cancelled', {
      bookingId,
      paymentIntentId: payment_intent_id
    });

    return { success: true };
  } catch (error) {
    logger.error('Payment cancellation failed', {
      bookingId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Issue a refund
 * Used for cancellations after payment capture
 * @param {number} bookingId - The booking ID
 * @param {number} amount - Refund amount (optional)
 * @param {string} reason - Refund reason
 * @param {object} connection - Optional database connection (for transactions)
 */
async function issueRefund(bookingId, amount, reason = 'requested_by_customer', connection = null) {
  try {
    // Use provided connection or fall back to pool
    const db = connection || pool;
    
    const [booking] = await db.execute(
      'SELECT payment_intent_id, total_amount FROM bookings WHERE id = ?',
      [bookingId]
    );

    if (booking.length === 0) {
      throw new Error('Booking not found');
    }

    const { payment_intent_id, total_amount } = booking[0];

    // Refund full amount by default, or specific amount if provided
    const refundAmount = amount || total_amount;

    const refund = await stripe.refunds.create({
      payment_intent: payment_intent_id,
      amount: Math.round(refundAmount * 100),
      reason: reason,
      metadata: {
        booking_id: bookingId
      }
    });

    // Update database
    await db.execute(
      `UPDATE bookings 
       SET payment_status = 'refunded',
           refund_amount = ?,
           refunded_at = NOW()
       WHERE id = ?`,
      [refundAmount, bookingId]
    );

    logger.info('Refund issued', {
      bookingId,
      refundId: refund.id,
      refundAmount
    });

    return {
      success: true,
      refundId: refund.id,
      refundAmount
    };
  } catch (error) {
    logger.error('Refund failed', {
      bookingId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Create Stripe Connect account link for companions
 * This generates a URL companions use to set up their bank account
 *
 * IMPORTANT: Connected accounts MUST be in the same region as the platform account
 * to enable direct transfers. Cross-border transfers require special approval from Stripe.
 *
 * @param {number} companionId - The companion ID
 * @param {string} returnUrl - Return URL after setup
 * @param {string} refreshUrl - Refresh URL if setup expires
 * @param {object} connection - Optional database connection (for transactions)
 */
async function createConnectAccountLink(companionId, returnUrl, refreshUrl, connection = null) {
  try {
    // Use provided connection or fall back to pool
    const db = connection || pool;

    // Get platform country to ensure connected accounts are in the same region
    const platformCountry = await getPlatformCountry();

    logger.info('Creating Connect account for companion', {
      companionId,
      platformCountry,
      note: 'Connected account will be created in same region as platform'
    });

    // Check if companion already has a Stripe account
    const [companion] = await db.execute(
      'SELECT stripe_account_id, email FROM users WHERE id = ? AND role = ?',
      [companionId, 'companion']
    );

    if (companion.length === 0) {
      throw new Error('Companion not found');
    }

    let accountId = companion[0]?.stripe_account_id;

    // If no account exists, create one in the SAME region as the platform
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express', // Simpler onboarding for marketplace
        country: platformCountry, // CRITICAL: Use platform's country to avoid cross-border issues
        email: companion[0].email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual', // Simpler than company
        metadata: {
          companion_id: companionId,
          platform_country: platformCountry
        }
      });

      accountId = account.id;

      // Save to database
      await db.execute(
        'UPDATE users SET stripe_account_id = ? WHERE id = ?',
        [accountId, companionId]
      );

      logger.info('Created new Stripe Connect account', {
        companionId,
        accountId,
        country: platformCountry
      });
    }

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl || `${process.env.FRONTEND_URL}/companion/stripe-setup?refresh=true`,
      return_url: returnUrl || `${process.env.FRONTEND_URL}/companion/stripe-setup?success=true`,
      type: 'account_onboarding'
    });

    logger.info('Connect account link created', {
      companionId,
      accountId,
      platformCountry
    });

    return {
      success: true,
      url: accountLink.url,
      accountId,
      platformCountry
    };
  } catch (error) {
    logger.error('Connect account link creation failed', {
      companionId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Cancel a PaymentIntent by ID (for scheduler/automated cancellations)
 * @param {string} paymentIntentId - The payment intent ID to cancel
 */
async function cancelPaymentIntent(paymentIntentId) {
  try {
    await stripe.paymentIntents.cancel(paymentIntentId);
    
    logger.info('Payment intent cancelled', {
      paymentIntentId
    });

    return { success: true, paymentIntentId };
  } catch (error) {
    logger.error('Payment intent cancellation failed', {
      paymentIntentId,
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  createPaymentIntent,
  retrievePaymentIntent,
  updatePaymentIntent,
  authorizePayment,
  capturePayment,
  transferToCompanion,
  cancelAuthorization,
  cancelPaymentIntent,
  issueRefund,
  createConnectAccountLink,
  getPlatformCountry,
  getPlatformAccountInfo
};

