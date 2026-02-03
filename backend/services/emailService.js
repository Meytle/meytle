/**
 * Email Service using Resend
 * Handles welcome emails and verification emails
 * 
 * EMAIL PRIORITY SYSTEM:
 * - critical: Must send (verification, OTP, password reset, payment)
 * - high: Important (booking requests, confirmations)
 * - medium: Nice to have (application status, reviews)
 * - low: Optional (welcome, promotional, tips)
 * 
 * In testing mode (EMAIL_PRIORITY_MODE=testing), only critical+high emails are sent
 * to stay under Resend free tier limit (3,000 emails/month)
 */

const { Resend } = require('resend');
const crypto = require('crypto');
const logger = require('./logger');

/**
 * Format time from 24-hour to 12-hour format
 * @param {string} time - Time in HH:MM:SS format
 * @returns {string} - Time in 12-hour format (e.g., "7:00 AM")
 */
const formatTimeTo12Hour = (time) => {
  if (!time) return '';
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${minutes} ${period}`;
};

// Email Priority Configuration
const EMAIL_PRIORITIES = {
  critical: ['email_verification', 'resend_verification', 'password_reset', 'payment_confirmation', 'otp_verification'],
  high: ['booking_request', 'booking_confirmation', 'booking_cancellation'],
  medium: ['application_approved', 'application_rejected', 'review_request', 'meeting_completed'],
  low: ['welcome_only', 'promotional', 'tips', 'reminders']
};

/**
 * Check if email should be sent based on priority mode
 * @param {string} emailType - Type of email to send
 * @returns {boolean} - Whether to send the email
 */
const shouldSendEmail = (emailType) => {
  const mode = process.env.EMAIL_PRIORITY_MODE || 'production';
  
  if (mode === 'production') {
    return true; // Send all emails in production
  }
  
  // In testing mode, only send critical + high priority emails
  if (mode === 'testing') {
    const isCritical = EMAIL_PRIORITIES.critical.includes(emailType);
    const isHigh = EMAIL_PRIORITIES.high.includes(emailType);
    
    if (!isCritical && !isHigh) {
      logger.apiInfo('emailService', 'shouldSendEmail', `Email skipped in testing mode: ${emailType}`, { emailType, mode });
      return false;
    }
  }
  
  return true;
};

// Initialize Resend with API key
const resend = new Resend(process.env.RESEND_API_KEY);

// Combined Welcome + Verification Email Template
const getCombinedWelcomeVerificationTemplate = (userName, userRole, verificationLink) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify your email - Meytle</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.6;
          color: #374151;
          max-width: 520px;
          margin: 0 auto;
          padding: 40px 20px;
          background-color: #f9fafb;
        }
        .container {
          background: white;
          border-radius: 8px;
          padding: 40px;
          border: 1px solid #e5e7eb;
        }
        .logo {
          font-size: 24px;
          font-weight: 700;
          color: #1e3a8a;
          margin-bottom: 32px;
        }
        .content {
          margin-bottom: 32px;
        }
        .content p {
          margin: 0 0 16px 0;
        }
        .verify-button {
          display: inline-block;
          background: #1e3a8a;
          color: white;
          padding: 14px 32px;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 600;
          font-size: 15px;
          margin: 24px 0;
        }
        .verify-button:hover {
          background: #1e4e8f;
        }
        .link-fallback {
          background: #f3f4f6;
          padding: 12px;
          border-radius: 6px;
          margin: 16px 0;
          word-break: break-all;
          font-family: monospace;
          font-size: 12px;
          color: #6b7280;
        }
        .footer {
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid #e5e7eb;
          color: #9ca3af;
          font-size: 13px;
        }
        .footer a {
          color: #6b7280;
        }
        .steps {
          background: #f9fafb;
          padding: 16px 20px;
          border-radius: 6px;
          margin: 20px 0;
        }
        .steps p {
          margin: 0 0 8px 0;
          font-size: 14px;
          color: #6b7280;
        }
        .steps p:last-child {
          margin-bottom: 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">Meytle</div>

        <div class="content">
          <p>Hey ${userName},</p>

          <p>Thanks for signing up${userRole === 'companion' ? ' as a companion' : ''}. Click the button below to verify your email and activate your account.</p>

          <div style="text-align: center;">
            <a href="${verificationLink}" class="verify-button">
              Verify Email
            </a>
          </div>

          <p style="font-size: 13px; color: #9ca3af; text-align: center;">
            Link expires in 24 hours
          </p>

          ${userRole === 'companion'
            ? `<div class="steps">
                <p><strong>After verification:</strong></p>
                <p>1. Complete your profile</p>
                <p>2. Add photos</p>
                <p>3. Verify your identity</p>
                <p>4. Start accepting bookings</p>
              </div>`
            : `<div class="steps">
                <p><strong>After verification:</strong></p>
                <p>1. Complete your profile</p>
                <p>2. Browse companions</p>
                <p>3. Book your first meeting</p>
              </div>`
          }

          <p style="font-size: 13px; color: #6b7280;">
            Button not working? Copy this link:
          </p>
          <div class="link-fallback">
            ${verificationLink}
          </div>
        </div>

        <div class="footer">
          <p>— The Meytle Team</p>
          <p>Questions? <a href="mailto:support@meytle.com">support@meytle.com</a></p>
          <p style="margin-top: 16px; font-size: 12px;">
            You're receiving this because you signed up for Meytle.<br>
            Didn't sign up? Ignore this email.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Email templates (keeping old ones for backward compatibility)
const getWelcomeEmailTemplate = (userName, userRole) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to Meytle</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.6;
          color: #374151;
          max-width: 520px;
          margin: 0 auto;
          padding: 40px 20px;
          background-color: #f9fafb;
        }
        .container {
          background: white;
          border-radius: 8px;
          padding: 40px;
          border: 1px solid #e5e7eb;
        }
        .logo {
          font-size: 24px;
          font-weight: 700;
          color: #1e3a8a;
          margin-bottom: 24px;
        }
        .cta-button {
          display: inline-block;
          background: #1e3a8a;
          color: white;
          padding: 14px 32px;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 600;
          font-size: 15px;
          margin: 24px 0;
        }
        .footer {
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid #e5e7eb;
          color: #9ca3af;
          font-size: 13px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">Meytle</div>

        <p>Hey ${userName},</p>
        <p>Welcome to Meytle${userRole === 'companion' ? ' as a companion' : ''}.</p>

        <p>Please verify your email to get started.</p>

        <div style="text-align: center;">
          <a href="${process.env.FRONTEND_URL}/dashboard" class="cta-button">
            Go to Dashboard
          </a>
        </div>

        <div class="footer">
          <p>— Meytle</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

const getVerificationEmailTemplate = (userName, verificationLink) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify your email - Meytle</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.6;
          color: #374151;
          max-width: 520px;
          margin: 0 auto;
          padding: 40px 20px;
          background-color: #f9fafb;
        }
        .container {
          background: white;
          border-radius: 8px;
          padding: 40px;
          border: 1px solid #e5e7eb;
        }
        .logo {
          font-size: 24px;
          font-weight: 700;
          color: #1e3a8a;
          margin-bottom: 24px;
        }
        .verify-button {
          display: inline-block;
          background: #1e3a8a;
          color: white;
          padding: 14px 32px;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 600;
          font-size: 15px;
          margin: 24px 0;
        }
        .link-fallback {
          background: #f3f4f6;
          padding: 12px;
          border-radius: 6px;
          margin: 16px 0;
          word-break: break-all;
          font-family: monospace;
          font-size: 12px;
          color: #6b7280;
        }
        .footer {
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid #e5e7eb;
          color: #9ca3af;
          font-size: 13px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">Meytle</div>

        <p>Hey ${userName},</p>
        <p>Click below to verify your email and activate your account.</p>

        <div style="text-align: center;">
          <a href="${verificationLink}" class="verify-button">
            Verify Email
          </a>
        </div>

        <p style="font-size: 13px; color: #9ca3af; text-align: center;">
          Link expires in 24 hours
        </p>

        <p style="font-size: 13px; color: #6b7280;">
          Button not working? Copy this link:
        </p>
        <div class="link-fallback">
          ${verificationLink}
        </div>

        <div class="footer">
          <p>— Meytle</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Generate verification token
const generateVerificationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Send combined welcome and verification email
const sendWelcomeVerificationEmail = async (email, userName, userRole, verificationToken) => {
  try {
    // Check if email should be sent based on priority
    if (!shouldSendEmail('email_verification')) {
      logger.apiInfo('emailService', 'sendWelcomeVerificationEmail', 'Email skipped due to priority mode', { email, emailType: 'email_verification' });
      return { success: true, skipped: true, reason: 'priority_mode' };
    }

    // Debug logging to trace role value
    logger.apiInfo('emailService', 'sendWelcomeVerificationEmail', 'Email parameters received', {
      email,
      userName,
      userRole,
      userRoleType: typeof userRole,
      isCompanion: userRole === 'companion',
      isClient: userRole === 'client'
    });

    const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

    // Check email mode configuration
    const emailMode = process.env.EMAIL_MODE || 'production';
    const testEmailRecipient = process.env.TEST_EMAIL_RECIPIENT;

    // Determine recipient based on mode
    let recipientEmail = email;
    let emailNote = '';

    if (emailMode === 'testing' && testEmailRecipient) {
      // In testing mode, send ALL emails to the test recipient (only if TEST_EMAIL_RECIPIENT is set)
      recipientEmail = testEmailRecipient;
      emailNote = `[TEST MODE - Originally for: ${email}]`;
      logger.apiInfo('emailService', 'sendWelcomeVerificationEmail', 'TEST MODE: Redirecting email', { from: email, to: testEmailRecipient });
    }

    // Use verified domain email address
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@meytle.com';

    // Modify subject in test mode to show original recipient
    const subject = (emailMode === 'testing' && testEmailRecipient)
      ? `[TEST: ${email}] Verify your email - Meytle`
      : 'Verify your email - Meytle';

    const { data, error } = await resend.emails.send({
      from: `Meytle <${fromEmail}>`,
      to: [recipientEmail],
      subject: subject,
      html: getCombinedWelcomeVerificationTemplate(userName, userRole, verificationLink),
    });

    if (error) {
      logger.apiError('emailService', 'sendWelcomeVerificationEmail', error, { email, emailMode });

      // Log helpful information about the error
      if (error.message && error.message.includes('You can only send testing emails')) {
        logger.apiInfo('emailService', 'sendWelcomeVerificationEmail', `Email mode is set to: ${emailMode}`, {});
        logger.apiInfo('emailService', 'sendWelcomeVerificationEmail', 'To enable production emails:', {
          steps: [
            'Get a domain and verify it in Resend',
            'Set EMAIL_MODE=production in .env',
            'Set RESEND_FROM_EMAIL=noreply@yourdomain.com'
          ]
        });
      }

      return { success: false, error };
    }

    logger.apiInfo('emailService', 'sendWelcomeVerificationEmail', 'Welcome+Verification email sent successfully', {
      recipientEmail,
      originalRecipient: email,
      emailNote
    });

    return { success: true, data, verificationLink, sentTo: recipientEmail, originalRecipient: email };
  } catch (error) {
    logger.apiError('emailService', 'sendWelcomeVerificationEmail', error, { email });
    return { success: false, error: error.message };
  }
};

// Send welcome email (legacy - kept for backward compatibility)
const sendWelcomeEmail = async (email, userName, userRole) => {
  try {
    // Check email mode configuration
    const emailMode = process.env.EMAIL_MODE || 'production';
    const testEmailRecipient = process.env.TEST_EMAIL_RECIPIENT;

    // In testing mode, redirect to test recipient (only if TEST_EMAIL_RECIPIENT is set)
    const recipientEmail = (emailMode === 'testing' && testEmailRecipient) ? testEmailRecipient : email;

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@meytle.com';

    const { data, error } = await resend.emails.send({
      from: `Meytle <${fromEmail}>`,
      to: [recipientEmail],
      subject: (emailMode === 'testing' && testEmailRecipient)
        ? `[TEST: ${email}] Welcome to Meytle, ${userName}! 🎉`
        : `Welcome to Meytle, ${userName}! 🎉`,
      html: getWelcomeEmailTemplate(userName, userRole),
    });

    if (error) {
      logger.apiError('emailService', 'sendWelcomeEmail', error, { email });
      return { success: false, error };
    }

    logger.apiInfo('emailService', 'sendWelcomeEmail', 'Welcome email sent successfully', { email });
    return { success: true, data };
  } catch (error) {
    logger.apiError('emailService', 'sendWelcomeEmail', error, { email });
    return { success: false, error: error.message };
  }
};

// Send verification email (legacy - kept for backward compatibility)
const sendVerificationEmail = async (email, userName, verificationToken) => {
  try {
    const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

    // Check email mode configuration
    const emailMode = process.env.EMAIL_MODE || 'production';
    const testEmailRecipient = process.env.TEST_EMAIL_RECIPIENT;

    // In testing mode, redirect to test recipient (only if TEST_EMAIL_RECIPIENT is set)
    const recipientEmail = (emailMode === 'testing' && testEmailRecipient) ? testEmailRecipient : email;

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@meytle.com';

    const { data, error } = await resend.emails.send({
      from: `Meytle <${fromEmail}>`,
      to: [recipientEmail],
      subject: (emailMode === 'testing' && testEmailRecipient)
        ? `[TEST: ${email}] Verify Your Email - Meytle`
        : 'Verify Your Email - Meytle',
      html: getVerificationEmailTemplate(userName, verificationLink),
    });

    if (error) {
      logger.apiError('emailService', 'sendVerificationEmail', error, { email });
      return { success: false, error };
    }

    logger.apiInfo('emailService', 'sendVerificationEmail', 'Verification email sent successfully', { email });
    return { success: true, data, verificationLink };
  } catch (error) {
    logger.apiError('emailService', 'sendVerificationEmail', error, { email });
    return { success: false, error: error.message };
  }
};

// Booking notification email template for companions
const getBookingNotificationTemplate = (bookingDetails) => {
  const {
    companionName,
    clientName,
    bookingDate,
    startTime,
    endTime,
    timezone,
    durationHours,
    totalAmount,
    serviceName,
    meetingLocation,
    meetingType,
    specialRequests
  } = bookingDetails;

  const formattedStartTime = formatTimeTo12Hour(startTime);
  const formattedEndTime = formatTimeTo12Hour(endTime);
  const date = new Date(bookingDate);
  const formattedDate = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const earnings = (totalAmount * 0.85).toFixed(2);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New booking request - Meytle</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.6;
          color: #374151;
          max-width: 520px;
          margin: 0 auto;
          padding: 40px 20px;
          background-color: #f9fafb;
        }
        .container {
          background: white;
          border-radius: 8px;
          padding: 40px;
          border: 1px solid #e5e7eb;
        }
        .logo {
          font-size: 24px;
          font-weight: 700;
          color: #1e3a8a;
          margin-bottom: 24px;
        }
        .earnings {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 6px;
          padding: 16px 20px;
          margin: 20px 0;
          text-align: center;
        }
        .earnings-amount {
          font-size: 28px;
          font-weight: 700;
          color: #166534;
        }
        .earnings-note {
          font-size: 13px;
          color: #6b7280;
          margin-top: 4px;
        }
        .details {
          background: #f9fafb;
          border-radius: 6px;
          padding: 20px;
          margin: 20px 0;
        }
        .details-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          font-size: 14px;
        }
        .details-label {
          color: #6b7280;
        }
        .details-value {
          color: #374151;
          font-weight: 500;
          text-align: right;
        }
        .special {
          background: #fffbeb;
          border-radius: 6px;
          padding: 16px;
          margin: 20px 0;
          font-size: 14px;
        }
        .special-label {
          font-weight: 600;
          color: #92400e;
          margin-bottom: 8px;
        }
        .cta-button {
          display: inline-block;
          background: #1e3a8a;
          color: white;
          padding: 14px 32px;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 600;
          font-size: 15px;
          margin: 24px 0;
        }
        .deadline {
          font-size: 13px;
          color: #dc2626;
          text-align: center;
          margin-top: 16px;
        }
        .footer {
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid #e5e7eb;
          color: #9ca3af;
          font-size: 13px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">Meytle</div>

        <p>Hey ${companionName},</p>
        <p>You have a new booking request from <strong>${clientName}</strong>.</p>

        <div class="earnings">
          <div class="earnings-amount">$${earnings}</div>
          <div class="earnings-note">Your earnings (after 15% fee)</div>
        </div>

        <div class="details">
          <div class="details-row">
            <span class="details-label">Client</span>
            <span class="details-value">${clientName}</span>
          </div>
          <div class="details-row">
            <span class="details-label">Date</span>
            <span class="details-value">${formattedDate}</span>
          </div>
          <div class="details-row">
            <span class="details-label">Time</span>
            <span class="details-value">${formattedStartTime} - ${formattedEndTime}${timezone ? ` (${timezone})` : ''}</span>
          </div>
          <div class="details-row">
            <span class="details-label">Duration</span>
            <span class="details-value">${durationHours} hour${durationHours > 1 ? 's' : ''}</span>
          </div>
          <div class="details-row">
            <span class="details-label">Type</span>
            <span class="details-value">${meetingType === 'virtual' ? 'Virtual' : 'In-Person'}</span>
          </div>
          ${meetingLocation ? `
          <div class="details-row">
            <span class="details-label">Location</span>
            <span class="details-value">${meetingLocation}</span>
          </div>
          ` : ''}
          <div class="details-row">
            <span class="details-label">Total</span>
            <span class="details-value">$${totalAmount.toFixed(2)}</span>
          </div>
        </div>

        ${specialRequests ? `
        <div class="special">
          <div class="special-label">Special requests:</div>
          ${specialRequests}
        </div>
        ` : ''}

        <div style="text-align: center;">
          <a href="${process.env.FRONTEND_URL}/companion-dashboard" class="cta-button">
            Review Booking
          </a>
        </div>

        <p class="deadline">Respond within 24 hours or booking auto-cancels</p>

        <div class="footer">
          <p>— Meytle</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Get booking confirmation email template (to client when companion accepts)
const getBookingConfirmationTemplate = (clientName, companionName, bookingDetails) => {
  const { bookingDate, startTime, endTime, totalAmount, meetingLocation, timezone } = bookingDetails;

  const date = new Date(bookingDate);
  const formattedDate = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const formattedStartTime = formatTimeTo12Hour(startTime);
  const formattedEndTime = formatTimeTo12Hour(endTime);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Booking confirmed - Meytle</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.6;
          color: #374151;
          max-width: 520px;
          margin: 0 auto;
          padding: 40px 20px;
          background-color: #f9fafb;
        }
        .container {
          background: white;
          border-radius: 8px;
          padding: 40px;
          border: 1px solid #e5e7eb;
        }
        .logo {
          font-size: 24px;
          font-weight: 700;
          color: #1e3a8a;
          margin-bottom: 24px;
        }
        .confirmed {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 6px;
          padding: 16px 20px;
          margin: 20px 0;
          text-align: center;
        }
        .confirmed-text {
          font-size: 16px;
          font-weight: 600;
          color: #166534;
        }
        .details {
          background: #f9fafb;
          border-radius: 6px;
          padding: 20px;
          margin: 20px 0;
        }
        .details-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          font-size: 14px;
        }
        .details-label {
          color: #6b7280;
        }
        .details-value {
          color: #374151;
          font-weight: 500;
          text-align: right;
        }
        .info {
          background: #f9fafb;
          border-radius: 6px;
          padding: 16px 20px;
          margin: 20px 0;
          font-size: 14px;
        }
        .info p {
          margin: 6px 0;
          color: #6b7280;
        }
        .info strong {
          color: #374151;
        }
        .cta-button {
          display: inline-block;
          background: #1e3a8a;
          color: white;
          padding: 14px 32px;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 600;
          font-size: 15px;
          margin: 24px 0;
        }
        .note {
          font-size: 13px;
          color: #9ca3af;
          text-align: center;
          margin-top: 16px;
        }
        .footer {
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid #e5e7eb;
          color: #9ca3af;
          font-size: 13px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">Meytle</div>

        <p>Hey ${clientName},</p>
        <p><strong>${companionName}</strong> accepted your booking.</p>

        <div class="confirmed">
          <div class="confirmed-text">Booking Confirmed</div>
        </div>

        <div class="details">
          <div class="details-row">
            <span class="details-label">Companion</span>
            <span class="details-value">${companionName}</span>
          </div>
          <div class="details-row">
            <span class="details-label">Date</span>
            <span class="details-value">${formattedDate}</span>
          </div>
          <div class="details-row">
            <span class="details-label">Time</span>
            <span class="details-value">${formattedStartTime} - ${formattedEndTime}${timezone ? ` (${timezone})` : ''}</span>
          </div>
          ${meetingLocation ? `
          <div class="details-row">
            <span class="details-label">Location</span>
            <span class="details-value">${meetingLocation}</span>
          </div>
          ` : ''}
          <div class="details-row">
            <span class="details-label">Total</span>
            <span class="details-value">$${totalAmount.toFixed(2)}</span>
          </div>
        </div>

        <div class="info">
          <p><strong>Before your meeting:</strong></p>
          <p>1. You'll get an OTP code 30 min before</p>
          <p>2. Meet at the agreed location</p>
          <p>3. Exchange codes to verify</p>
        </div>

        <div style="text-align: center;">
          <a href="${process.env.FRONTEND_URL}/client-dashboard" class="cta-button">
            View Booking
          </a>
        </div>

        <p class="note">Cancel up to 24 hours before for a full refund</p>

        <div class="footer">
          <p>— Meytle</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Send booking confirmation email to client
const sendBookingConfirmationEmail = async (clientEmail, clientName, companionName, bookingDetails) => {
  try {
    // Check if email should be sent based on priority
    if (!shouldSendEmail('booking_confirmation')) {
      logger.apiInfo('emailService', 'sendBookingConfirmationEmail', 'Email skipped due to priority mode', { clientEmail, emailType: 'booking_confirmation' });
      return { success: true, skipped: true, reason: 'priority_mode' };
    }

    // Check email mode configuration
    const emailMode = process.env.EMAIL_MODE || 'production';
    const testEmailRecipient = process.env.TEST_EMAIL_RECIPIENT;

    // Determine recipient based on mode
    let recipientEmail = clientEmail;
    if (emailMode === 'testing' && testEmailRecipient) {
      recipientEmail = testEmailRecipient;
      logger.apiInfo('emailService', 'sendBookingConfirmationEmail', 'TEST MODE: Redirecting email', { from: clientEmail, to: testEmailRecipient });
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@meytle.com';
    const subject = (emailMode === 'testing' && testEmailRecipient)
      ? `[TEST: ${clientEmail}] Booking confirmed with ${companionName}`
      : `Booking confirmed with ${companionName}`;

    const { data, error } = await resend.emails.send({
      from: `Meytle <${fromEmail}>`,
      to: [recipientEmail],
      subject: subject,
      html: getBookingConfirmationTemplate(clientName, companionName, bookingDetails),
    });

    if (error) {
      logger.apiError('emailService', 'sendBookingConfirmationEmail', error, { clientEmail });
      return { success: false, error };
    }

    logger.apiInfo('emailService', 'sendBookingConfirmationEmail', 'Booking confirmation email sent successfully', { recipientEmail });
    return { success: true, data };
  } catch (error) {
    logger.apiError('emailService', 'sendBookingConfirmationEmail', error, { clientEmail });
    return { success: false, error: error.message };
  }
};

// Send booking notification email to companion
const sendBookingNotificationEmail = async (companionEmail, bookingDetails) => {
  try {
    // Check if email should be sent based on priority
    if (!shouldSendEmail('booking_request')) {
      logger.apiInfo('emailService', 'sendBookingNotificationEmail', 'Email skipped due to priority mode', { companionEmail, emailType: 'booking_request' });
      return { success: true, skipped: true, reason: 'priority_mode' };
    }

    // Check email mode configuration
    const emailMode = process.env.EMAIL_MODE || 'production';
    const testEmailRecipient = process.env.TEST_EMAIL_RECIPIENT;

    // Determine recipient based on mode
    let recipientEmail = companionEmail;
    let emailNote = '';

    if (emailMode === 'testing' && testEmailRecipient) {
      // In testing mode, send ALL emails to the test recipient (only if TEST_EMAIL_RECIPIENT is set)
      recipientEmail = testEmailRecipient;
      emailNote = `[TEST MODE - Originally for: ${companionEmail}]`;
      logger.apiInfo('emailService', 'sendBookingNotificationEmail', 'TEST MODE: Redirecting booking notification', { from: companionEmail, to: testEmailRecipient });
    }

    // Use verified domain email address for booking notifications
    const fromEmail = 'bookings@meytle.com';

    // Modify subject in test mode to show original recipient
    const subject = emailMode === 'testing'
      ? `[TEST: ${companionEmail}] New Booking Request - ${bookingDetails.clientName}`
      : `New Booking Request from ${bookingDetails.clientName}`;

    const { data, error } = await resend.emails.send({
      from: `Meytle Bookings <${fromEmail}>`,
      to: [recipientEmail],
      subject: subject,
      html: getBookingNotificationTemplate(bookingDetails),
    });

    if (error) {
      logger.apiError('emailService', 'sendBookingNotificationEmail', error, { companionEmail });
      return { success: false, error };
    }

    logger.apiInfo('emailService', 'sendBookingNotificationEmail', 'Booking notification email sent successfully', {
      recipientEmail,
      originalRecipient: companionEmail,
      emailNote
    });

    return { success: true, data, sentTo: recipientEmail, originalRecipient: companionEmail };
  } catch (error) {
    logger.apiError('emailService', 'sendBookingNotificationEmail', error, { companionEmail });
    return { success: false, error: error.message };
  }
};

// Get booking cancellation email template (to client when companion rejects)
const getBookingCancellationTemplate = (clientName, companionName, bookingDetails, reason) => {
  const { bookingDate, startTime, timezone } = bookingDetails;

  const date = new Date(bookingDate);
  const formattedDate = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const formattedStartTime = formatTimeTo12Hour(startTime);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Booking cancelled - Meytle</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          line-height: 1.6;
          color: #374151;
          max-width: 520px;
          margin: 0 auto;
          padding: 40px 20px;
          background-color: #f9fafb;
        }
        .container {
          background: white;
          border-radius: 8px;
          padding: 40px;
          border: 1px solid #e5e7eb;
        }
        .logo {
          font-size: 24px;
          font-weight: 700;
          color: #1e3a8a;
          margin-bottom: 24px;
        }
        .cancelled {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 6px;
          padding: 16px 20px;
          margin: 20px 0;
          text-align: center;
        }
        .cancelled-text {
          font-size: 16px;
          font-weight: 600;
          color: #dc2626;
        }
        .reason {
          background: #fef2f2;
          border-radius: 6px;
          padding: 16px;
          margin: 20px 0;
          font-size: 14px;
          color: #991b1b;
        }
        .details {
          background: #f9fafb;
          border-radius: 6px;
          padding: 20px;
          margin: 20px 0;
        }
        .details-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          font-size: 14px;
        }
        .details-label {
          color: #6b7280;
        }
        .details-value {
          color: #374151;
          font-weight: 500;
          text-align: right;
        }
        .refund {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 6px;
          padding: 16px 20px;
          margin: 20px 0;
          font-size: 14px;
        }
        .refund p {
          margin: 4px 0;
          color: #166534;
        }
        .cta-button {
          display: inline-block;
          background: #1e3a8a;
          color: white;
          padding: 14px 32px;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 600;
          font-size: 15px;
          margin: 24px 0;
        }
        .footer {
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid #e5e7eb;
          color: #9ca3af;
          font-size: 13px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">Meytle</div>

        <p>Hey ${clientName},</p>
        <p><strong>${companionName}</strong> couldn't accept your booking.</p>

        <div class="cancelled">
          <div class="cancelled-text">Booking Cancelled</div>
        </div>

        ${reason ? `
        <div class="reason">
          <strong>Reason:</strong> ${reason}
        </div>
        ` : ''}

        <div class="details">
          <div class="details-row">
            <span class="details-label">Companion</span>
            <span class="details-value">${companionName}</span>
          </div>
          <div class="details-row">
            <span class="details-label">Date</span>
            <span class="details-value">${formattedDate}</span>
          </div>
          <div class="details-row">
            <span class="details-label">Time</span>
            <span class="details-value">${formattedStartTime}${timezone ? ` (${timezone})` : ''}</span>
          </div>
        </div>

        <div class="refund">
          <p><strong>Full refund incoming</strong></p>
          <p>5-7 business days to your original payment method</p>
        </div>

        <div style="text-align: center;">
          <a href="${process.env.FRONTEND_URL}/browse-companions" class="cta-button">
            Browse Companions
          </a>
        </div>

        <div class="footer">
          <p>— Meytle</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Send booking cancellation email to client
const sendBookingCancellationEmail = async (clientEmail, clientName, companionName, bookingDetails, reason) => {
  try {
    // Check if email should be sent based on priority
    if (!shouldSendEmail('booking_cancellation')) {
      logger.apiInfo('emailService', 'sendBookingCancellationEmail', 'Email skipped due to priority mode', { clientEmail, emailType: 'booking_cancellation' });
      return { success: true, skipped: true, reason: 'priority_mode' };
    }

    // Check email mode configuration
    const emailMode = process.env.EMAIL_MODE || 'production';
    const testEmailRecipient = process.env.TEST_EMAIL_RECIPIENT;

    // Determine recipient based on mode
    let recipientEmail = clientEmail;
    if (emailMode === 'testing' && testEmailRecipient) {
      recipientEmail = testEmailRecipient;
      logger.apiInfo('emailService', 'sendBookingCancellationEmail', 'TEST MODE: Redirecting email', { from: clientEmail, to: testEmailRecipient });
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@meytle.com';
    const subject = (emailMode === 'testing' && testEmailRecipient)
      ? `[TEST: ${clientEmail}] Booking Cancelled - ${companionName}`
      : `Booking Request Cancelled`;

    const { data, error } = await resend.emails.send({
      from: `Meytle <${fromEmail}>`,
      to: [recipientEmail],
      subject: subject,
      html: getBookingCancellationTemplate(clientName, companionName, bookingDetails, reason),
    });

    if (error) {
      logger.apiError('emailService', 'sendBookingCancellationEmail', error, { clientEmail });
      return { success: false, error };
    }

    logger.apiInfo('emailService', 'sendBookingCancellationEmail', 'Booking cancellation email sent successfully', { recipientEmail });
    return { success: true, data };
  } catch (error) {
    logger.apiError('emailService', 'sendBookingCancellationEmail', error, { clientEmail });
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendWelcomeEmail,
  sendVerificationEmail,
  sendWelcomeVerificationEmail, // New combined email
  sendBookingNotificationEmail, // Companion gets booking request
  sendBookingConfirmationEmail, // Client gets confirmation
  sendBookingCancellationEmail, // Client gets cancellation
  generateVerificationToken,
  shouldSendEmail, // Export for use in other services
  EMAIL_PRIORITIES, // Export priority configuration
};
