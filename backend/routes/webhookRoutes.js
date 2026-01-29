/**
 * Webhook Routes
 * Handles external service webhooks (Veriff, Stripe, etc.)
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const verificationService = require('../services/verificationService');
const logger = require('../services/logger');

/**
 * Veriff webhook endpoint
 * Receives verification status updates from Veriff
 * 
 * POST /api/webhooks/veriff
 */
router.post('/veriff', async (req, res) => {
  try {
    // ENHANCED DEBUG LOGGING
    console.log('🔍 DEBUG: Veriff webhook received');
    console.log('🔍 DEBUG: req.body =', JSON.stringify(req.body, null, 2));
    console.log('🔍 DEBUG: req.body type =', typeof req.body);
    console.log('🔍 DEBUG: req.body keys =', Object.keys(req.body || {}));
    console.log('🔍 DEBUG: req.body.action =', req.body?.action);
    console.log('🔍 DEBUG: req.body.vendorData =', req.body?.vendorData);
    console.log('🔍 DEBUG: Content-Type =', req.headers['content-type']);
    
    logger.info('Veriff webhook received', {
      headers: req.headers,
      body: req.body,
      bodyType: typeof req.body,
      bodyKeys: Object.keys(req.body || {}),
      action: req.body?.action,
      vendorData: req.body?.vendorData
    });

    const webhookData = req.body;
    const signature = req.headers['x-hmac-signature'] || req.headers['x-veriff-signature'];

    // Process webhook through verification service
    const result = await verificationService.webhookHandler(webhookData, signature);

    if (result.status === 'ignored') {
      logger.warn('Veriff webhook ignored', { message: result.message });
      return res.status(200).json({ received: true, status: 'ignored' });
    }

    // Update verification status in database (CLIENT or COMPANION)
    if (result.userId && result.verificationStatus) {
      const updateFields = ['verification_status = ?'];
      const updateValues = [result.verificationStatus];

      if (result.completedAt) {
        updateFields.push('verification_completed_at = ?');
        updateValues.push(result.completedAt);
      }

      if (result.rejectionReason) {
        updateFields.push('rejection_reason = ?');
        updateValues.push(result.rejectionReason);
      }

      updateValues.push(result.userId);

      // Check which table to update: client_verifications or companion_applications
      // Try client_verifications first
      const [clientVerification] = await pool.execute(
        `SELECT id FROM client_verifications WHERE user_id = ? AND verification_session_id IS NOT NULL`,
        [result.userId]
      );

      if (clientVerification.length > 0) {
        // Update CLIENT verification
        await pool.execute(
          `UPDATE client_verifications 
           SET ${updateFields.join(', ')}
           WHERE user_id = ?`,
          updateValues
        );

        logger.info('Client verification status updated', {
          userId: result.userId,
          status: result.verificationStatus,
          sessionId: result.sessionId
        });
      } else {
        // Update COMPANION verification (fallback to original behavior)
        await pool.execute(
          `UPDATE companion_applications 
           SET ${updateFields.join(', ')}
           WHERE user_id = ?`,
          updateValues
        );

        logger.info('Companion verification status updated', {
          userId: result.userId,
          status: result.verificationStatus,
          sessionId: result.sessionId
        });

        // AUTO-APPROVE: If verification is approved, check email and auto-approve application
        if (result.verificationStatus === 'approved') {
          try {
            const [users] = await pool.execute(
              'SELECT email_verified FROM users WHERE id = ?',
              [result.userId]
            );

            if (users.length > 0 && users[0].email_verified) {
              // Both Veriff and email are verified - auto-approve the application
              await pool.execute(
                'UPDATE companion_applications SET status = ?, reviewed_at = NOW() WHERE user_id = ?',
                ['approved', result.userId]
              );

              // Add companion role to user_roles if not already added
              await pool.execute(
                `INSERT INTO user_roles (user_id, role, is_active)
                 VALUES (?, 'companion', TRUE)
                 ON DUPLICATE KEY UPDATE is_active = TRUE`,
                [result.userId]
              );

              logger.info('🎉 Companion auto-approved after Veriff webhook', {
                userId: result.userId,
                emailVerified: true,
                veriffVerified: true
              });
            } else {
              logger.warn('Veriff completed but email not verified', {
                userId: result.userId,
                emailVerified: users[0]?.email_verified || false
              });
            }
          } catch (autoApproveError) {
            logger.error('Error during webhook auto-approval', {
              userId: result.userId,
              error: autoApproveError.message
            });
          }
        }
      }

      // TODO: Send email notification to user
      // if (result.verificationStatus === 'approved') {
      //   await emailService.sendVerificationApprovedEmail(...)
      // } else if (result.verificationStatus === 'rejected') {
      //   await emailService.sendVerificationRejectedEmail(...)
      // }
    }

    res.status(200).json({
      received: true,
      status: 'processed',
      message: result.message
    });

  } catch (error) {
    logger.error('Error processing Veriff webhook', {
      error: error.message,
      stack: error.stack
    });

    // Still return 200 to prevent Veriff from retrying
    res.status(200).json({
      received: true,
      status: 'error',
      message: error.message
    });
  }
});

/**
 * Stripe webhook endpoint
 * Handles Stripe payment events (payment_intent.succeeded, transfer.created, etc.)
 * 
 * POST /api/webhooks/stripe
 * 
 * NOTE: This endpoint requires raw body parsing for signature verification
 * Make sure your Express app uses express.raw() middleware for this route
 */
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    
    // Verify webhook signature for security
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    
    logger.info('Stripe webhook signature verified', { 
      type: event.type,
      eventId: event.id
    });

  } catch (err) {
    logger.error('Stripe webhook signature verification failed', { 
      error: err.message 
    });
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the webhook event
  try {
    logger.info('Processing Stripe webhook event', { 
      type: event.type, 
      eventId: event.id 
    });

    switch (event.type) {
      case 'payment_intent.succeeded':
        {
          const paymentIntent = event.data.object;
          const bookingId = paymentIntent.metadata.booking_id;

          if (bookingId) {
            await pool.execute(
              `UPDATE bookings 
               SET payment_status = 'paid',
                   paid_at = NOW()
               WHERE id = ?`,
              [bookingId]
            );

            logger.info('Payment intent succeeded', { 
              bookingId, 
              paymentIntentId: paymentIntent.id,
              amount: paymentIntent.amount / 100
            });
          }
        }
        break;

      case 'payment_intent.payment_failed':
        {
          const failedIntent = event.data.object;
          const failedBookingId = failedIntent.metadata.booking_id;
          const errorMessage = failedIntent.last_payment_error?.message || 'Payment failed';

          if (failedBookingId) {
            await pool.execute(
              `UPDATE bookings 
               SET payment_status = 'failed',
                   capture_failure_reason = ?
               WHERE id = ?`,
              [errorMessage, failedBookingId]
            );

            logger.error('Payment intent failed', { 
              bookingId: failedBookingId,
              reason: errorMessage
            });
          }
        }
        break;

      case 'payment_intent.canceled':
        {
          const canceledIntent = event.data.object;
          const canceledBookingId = canceledIntent.metadata.booking_id;

          if (canceledBookingId) {
            await pool.execute(
              `UPDATE bookings 
               SET payment_status = 'cancelled'
               WHERE id = ?`,
              [canceledBookingId]
            );

            logger.info('Payment intent canceled', { 
              bookingId: canceledBookingId,
              paymentIntentId: canceledIntent.id
            });
          }
        }
        break;

      case 'charge.refunded':
        {
          const charge = event.data.object;
          const refundedPaymentIntent = charge.payment_intent;

          // Find booking by payment_intent_id
          const [bookings] = await pool.execute(
            'SELECT id FROM bookings WHERE payment_intent_id = ?',
            [refundedPaymentIntent]
          );

          if (bookings.length > 0) {
            const bookingId = bookings[0].id;
            
            await pool.execute(
              `UPDATE bookings 
               SET payment_status = 'refunded',
                   refunded_at = NOW(),
                   refund_amount = ?
               WHERE id = ?`,
              [charge.amount_refunded / 100, bookingId]
            );

            logger.info('Charge refunded', { 
              bookingId,
              refundAmount: charge.amount_refunded / 100
            });
          }
        }
        break;

      case 'transfer.created':
        {
          const transfer = event.data.object;
          const bookingId = transfer.metadata.booking_id;

          if (bookingId) {
            await pool.execute(
              `UPDATE bookings 
               SET transfer_id = ?,
                   transfer_status = 'completed'
               WHERE id = ?`,
              [transfer.id, bookingId]
            );

            logger.info('Transfer created successfully', { 
              transferId: transfer.id,
              bookingId,
              amount: transfer.amount / 100
            });
          }
        }
        break;

      case 'transfer.failed':
        {
          const failedTransfer = event.data.object;
          const bookingId = failedTransfer.metadata.booking_id;

          if (bookingId) {
            await pool.execute(
              `UPDATE bookings 
               SET transfer_status = 'failed'
               WHERE id = ?`,
              [bookingId]
            );

            logger.error('Transfer failed', { 
              transferId: failedTransfer.id,
              bookingId,
              reason: failedTransfer.failure_message 
            });
          }
        }
        break;

      case 'account.updated':
        {
          // Companion Stripe Connect account updated
          const account = event.data.object;
          
          // Update companion's Stripe account status
          await pool.execute(
            `UPDATE users 
             SET stripe_account_status = ?
             WHERE stripe_account_id = ?`,
            [account.charges_enabled ? 'active' : 'pending', account.id]
          );

          logger.info('Stripe account updated', { 
            accountId: account.id,
            chargesEnabled: account.charges_enabled,
            payoutsEnabled: account.payouts_enabled
          });
        }
        break;

      default:
        logger.info('Unhandled Stripe webhook event', { 
          type: event.type,
          eventId: event.id
        });
    }

    // Always return 200 to acknowledge receipt
    res.json({ received: true });

  } catch (error) {
    logger.error('Error processing Stripe webhook', {
      error: error.message,
      stack: error.stack,
      eventType: event?.type,
      eventId: event?.id
    });

    // ✅ Store failed webhook for manual review and retry
    try {
      await pool.execute(
        `INSERT INTO webhook_failures 
         (event_type, event_id, provider, payload, error_message, error_stack) 
         VALUES (?, ?, 'stripe', ?, ?, ?)`,
        [
          event.type || 'unknown',
          event.id || null,
          JSON.stringify(event),
          error.message,
          error.stack || null
        ]
      );
      logger.info('Webhook failure logged to database', { 
        eventType: event.type, 
        eventId: event.id 
      });
    } catch (dbError) {
      logger.error('Failed to log webhook failure to database', { 
        error: dbError.message 
      });
      // Continue - don't fail webhook acknowledgment
    }
    
    // Still return 200 to prevent Stripe from retrying
    // Error is now logged to database for manual investigation
    res.status(200).json({ 
      received: true, 
      status: 'error',
      message: error.message 
    });
  }
});

module.exports = router;

