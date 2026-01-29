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
      <title>Welcome to Meytle - Verify Your Email</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f8f9fa;
        }
        .container {
          background: white;
          border-radius: 10px;
          padding: 30px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
        }
        .logo {
          font-size: 28px;
          font-weight: bold;
          color: #312E81;
          margin-bottom: 10px;
        }
        .welcome-title {
          color: #1f2937;
          font-size: 24px;
          margin-bottom: 20px;
        }
        .content {
          margin-bottom: 30px;
        }
        .role-badge {
          display: inline-block;
          background: linear-gradient(135deg, #312E81, #FFCCCB);
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 600;
          margin: 10px 0;
        }
        .verify-button {
          display: inline-block;
          background: linear-gradient(135deg, #312E81, #FFCCCB);
          color: white;
          padding: 15px 40px;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 16px;
          margin: 25px 0;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          color: #6b7280;
          font-size: 14px;
        }
        .highlight {
          background: #fef3c7;
          padding: 15px;
          border-radius: 8px;
          border-left: 4px solid #f59e0b;
          margin: 20px 0;
        }
        .link-fallback {
          background: #f3f4f6;
          padding: 15px;
          border-radius: 8px;
          margin: 20px 0;
          word-break: break-all;
          font-family: monospace;
          font-size: 12px;
        }
        .warning {
          background: #fef2f2;
          padding: 15px;
          border-radius: 8px;
          border-left: 4px solid #ef4444;
          margin: 20px 0;
          color: #dc2626;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">Meytle</div>
          <h1 class="welcome-title">Welcome to Meytle! 🎉</h1>
        </div>

        <div class="content">
          <p>Hi <strong>${userName}</strong>,</p>

          <p>Welcome to Meytle! We're thrilled to have you join our community.</p>

          <div style="text-align: center;">
            <span class="role-badge">${
              userRole === 'companion' 
                ? '✨ Companion Account' 
                : userRole === 'client'
                ? '👤 Client Account'
                : `⚠️ ${userRole} Account`
            }</span>
          </div>

          ${userRole === 'companion'
            ? `<p>As a <strong>Companion</strong>, you're one step away from:</p>
               <ul>
                 <li>Creating your professional profile</li>
                 <li>Setting your availability and rates</li>
                 <li>Connecting with clients</li>
                 <li>Earning money by offering your time and company</li>
               </ul>`
            : `<p>As a <strong>Client</strong>, you're one step away from:</p>
               <ul>
                 <li>Browsing verified companions</li>
                 <li>Booking companions for activities</li>
                 <li>Creating meaningful connections</li>
                 <li>Enjoying new experiences</li>
               </ul>`
          }

          <div class="highlight">
            <strong>📧 One More Step:</strong> Please verify your email address to activate your account and unlock all features.
          </div>

          <div style="text-align: center;">
            <a href="${verificationLink}" class="verify-button">
              Verify Email & Get Started →
            </a>
          </div>

          <p style="text-align: center; color: #6b7280; font-size: 14px;">
            If the button doesn't work, copy and paste this link into your browser:
          </p>
          <div class="link-fallback">
            ${verificationLink}
          </div>

          <p style="text-align: center; color: #6b7280;">
            <strong>This verification link expires in 24 hours.</strong>
          </p>

          ${userRole === 'companion'
            ? `<div class="highlight">
                <strong>📋 Next Steps After Verification:</strong><br>
                1. Complete your companion application<br>
                2. Upload your profile photo<br>
                3. Complete Veriff identity verification (5-10 minutes)<br>
                4. Get instantly approved and start accepting bookings!
              </div>`
            : ``
          }
        </div>

        <div class="footer">
          <p>Best regards,<br>The Meytle Team</p>
          <p>Need help? Contact us at support@meytle.com</p>
          <p style="font-size: 12px; color: #9ca3af;">
            You received this email because you signed up for Meytle.<br>
            If you didn't create this account, please ignore this email or contact us.
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
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f8f9fa;
        }
        .container {
          background: white;
          border-radius: 10px;
          padding: 30px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
        }
        .logo {
          font-size: 28px;
          font-weight: bold;
          color: #312E81;
          margin-bottom: 10px;
        }
        .welcome-title {
          color: #1f2937;
          font-size: 24px;
          margin-bottom: 20px;
        }
        .content {
          margin-bottom: 30px;
        }
        .role-badge {
          display: inline-block;
          background: linear-gradient(135deg, #312E81, #FFCCCB);
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 600;
          margin: 10px 0;
        }
        .cta-button {
          display: inline-block;
          background: linear-gradient(135deg, #312E81, #FFCCCB);
          color: white;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
          margin: 20px 0;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          color: #6b7280;
          font-size: 14px;
        }
        .highlight {
          background: #fef3c7;
          padding: 15px;
          border-radius: 8px;
          border-left: 4px solid #f59e0b;
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">Meytle</div>
          <h1 class="welcome-title">Welcome to Meytle! 🎉</h1>
        </div>
        
        <div class="content">
          <p>Hi <strong>${userName}</strong>,</p>
          
          <p>Welcome to Meytle! We're thrilled to have you join our community of companions and clients.</p>
          
          <div style="text-align: center;">
            <span class="role-badge">${userRole === 'companion' ? 'Companion' : 'Client'}</span>
          </div>
          
          ${userRole === 'companion' 
            ? `<p>As a <strong>Companion</strong>, you can:</p>
               <ul>
                 <li>Create your profile and showcase your interests</li>
                 <li>Set your availability and hourly rates</li>
                 <li>Connect with clients looking for companionship</li>
                 <li>Earn money by offering your time and company</li>
               </ul>`
            : `<p>As a <strong>Client</strong>, you can:</p>
               <ul>
                 <li>Browse and discover amazing companions</li>
                 <li>Book companions for various activities</li>
                 <li>Enjoy meaningful connections and experiences</li>
                 <li>Rate and review your experiences</li>
               </ul>`
          }
          
          <div class="highlight">
            <strong>📧 Important:</strong> Please verify your email address to unlock all features and start ${userRole === 'companion' ? 'earning' : 'booking'}!
          </div>
          
          <p>Ready to get started?</p>
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL}/dashboard" class="cta-button">
              Go to Dashboard →
            </a>
          </div>
        </div>
        
        <div class="footer">
          <p>Best regards,<br>The Meytle Team</p>
          <p>Need help? Contact us at support@meytle.com</p>
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
      <title>Verify Your Email - Meytle</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f8f9fa;
        }
        .container {
          background: white;
          border-radius: 10px;
          padding: 30px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
        }
        .logo {
          font-size: 28px;
          font-weight: bold;
          color: #312E81;
          margin-bottom: 10px;
        }
        .verify-title {
          color: #1f2937;
          font-size: 24px;
          margin-bottom: 20px;
        }
        .content {
          margin-bottom: 30px;
        }
        .verify-button {
          display: inline-block;
          background: linear-gradient(135deg, #312E81, #FFCCCB);
          color: white;
          padding: 15px 30px;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 16px;
          margin: 20px 0;
          text-align: center;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          color: #6b7280;
          font-size: 14px;
        }
        .warning {
          background: #fef2f2;
          padding: 15px;
          border-radius: 8px;
          border-left: 4px solid #ef4444;
          margin: 20px 0;
          color: #dc2626;
        }
        .link-fallback {
          background: #f3f4f6;
          padding: 15px;
          border-radius: 8px;
          margin: 20px 0;
          word-break: break-all;
          font-family: monospace;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">Meytle</div>
          <h1 class="verify-title">Verify Your Email Address 🔐</h1>
        </div>
        
        <div class="content">
          <p>Hi <strong>${userName}</strong>,</p>
          
          <p>Thank you for signing up with Meytle! To complete your registration and unlock all features, please verify your email address.</p>
          
          <div style="text-align: center;">
            <a href="${verificationLink}" class="verify-button">
              Verify Email Address
            </a>
          </div>
          
          <div class="warning">
            <strong>⚠️ Important:</strong> Without email verification, you won't be able to book companions or earn money as a companion.
          </div>
          
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <div class="link-fallback">
            ${verificationLink}
          </div>
          
          <p><strong>This verification link will expire in 24 hours.</strong></p>
        </div>
        
        <div class="footer">
          <p>Best regards,<br>The Meytle Team</p>
          <p>Need help? Contact us at support@meytle.com</p>
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
      ? `[TEST: ${email}] Welcome to Meytle - Verify Your Email 🎉`
      : 'Welcome to Meytle - Verify Your Email 🎉';

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
    timezone,         // ✅ Companion's timezone
    clientTimezone,   // ✅ Client's timezone for reference
    durationHours,
    totalAmount,
    serviceName,
    meetingLocation,
    meetingType,
    specialRequests
  } = bookingDetails;

  // Format times for display
  const formattedStartTime = formatTimeTo12Hour(startTime);
  const formattedEndTime = formatTimeTo12Hour(endTime);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Booking Request - Meytle</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f8f9fa;
        }
        .container {
          background: white;
          border-radius: 10px;
          padding: 30px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 2px solid #312E81;
          padding-bottom: 20px;
        }
        .logo {
          font-size: 28px;
          font-weight: bold;
          color: #312E81;
          margin-bottom: 10px;
        }
        .title {
          color: #1f2937;
          font-size: 24px;
          margin-bottom: 10px;
        }
        .booking-badge {
          display: inline-block;
          background: #10b981;
          color: white;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          margin-top: 10px;
        }
        .content {
          margin-bottom: 30px;
        }
        .booking-details {
          background: #f9fafb;
          border-radius: 8px;
          padding: 20px;
          margin: 20px 0;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px solid #e5e7eb;
        }
        .detail-row:last-child {
          border-bottom: none;
        }
        .detail-label {
          font-weight: 600;
          color: #6b7280;
        }
        .detail-value {
          color: #111827;
          text-align: right;
        }
        .amount {
          font-size: 24px;
          font-weight: bold;
          color: #10b981;
        }
        .cta-button {
          display: inline-block;
          background: linear-gradient(135deg, #312E81, #FFCCCB);
          color: white;
          padding: 14px 28px;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 16px;
          margin: 20px 0;
        }
        .special-requests {
          background: #fef3c7;
          padding: 15px;
          border-radius: 8px;
          border-left: 4px solid #f59e0b;
          margin: 20px 0;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          color: #6b7280;
          font-size: 14px;
        }
        .alert {
          background: #dcfce7;
          padding: 15px;
          border-radius: 8px;
          border-left: 4px solid #10b981;
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">Meytle</div>
          <h1 class="title">New Booking Request! 🎉</h1>
          <span class="booking-badge">ACTION REQUIRED</span>
        </div>

        <div class="content">
          <p>Hi <strong>${companionName}</strong>,</p>

          <p>You have received a new booking request from <strong>${clientName}</strong>. Please review the details below and respond within 24 hours.</p>

          <div class="alert">
            <strong>💰 Potential Earnings:</strong> $${(totalAmount * 0.85).toFixed(2)} (after 15% platform fee) if you accept this booking.
          </div>

          <div class="booking-details">
            <h3 style="margin-top: 0;">Booking Details</h3>
            <div class="detail-row">
              <span class="detail-label">Client Name:</span>
              <span class="detail-value"><strong>${clientName}</strong></span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Date:</span>
              <span class="detail-value">${new Date(bookingDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Time:</span>
              <span class="detail-value">
                <strong>${formattedStartTime} - ${formattedEndTime}</strong>
                ${timezone ? `<br><span style="font-size: 12px; color: #6b7280;">(Your timezone: ${timezone})</span>` : ''}
                ${clientTimezone && clientTimezone !== timezone ? `<br><span style="font-size: 11px; color: #9ca3af;">Client's timezone: ${clientTimezone}</span>` : ''}
              </span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Duration:</span>
              <span class="detail-value">${durationHours} hour${durationHours > 1 ? 's' : ''}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Service:</span>
              <span class="detail-value">${serviceName || 'Standard Companionship'}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Meeting Type:</span>
              <span class="detail-value">${meetingType === 'virtual' ? '💻 Virtual' : '👥 In-Person'}</span>
            </div>
            ${meetingLocation ? `
            <div class="detail-row">
              <span class="detail-label">Location:</span>
              <span class="detail-value">${meetingLocation}</span>
            </div>
            ` : ''}
            <div class="detail-row">
              <span class="detail-label">Total Amount:</span>
              <span class="detail-value" style="font-size: 18px; font-weight: bold; color: #10b981;">$${totalAmount.toFixed(2)}</span>
            </div>
          </div>

          ${specialRequests ? `
          <div class="special-requests">
            <strong>📋 Special Requests from Client:</strong><br>
            ${specialRequests}
          </div>
          ` : ''}

          <p><strong>Next Steps:</strong></p>
          <ul>
            <li>Review the booking details and special requests carefully</li>
            <li>Verify your availability for the requested date and time</li>
            <li>Accept or decline this booking request in your dashboard</li>
            <li>The client will be automatically notified of your decision</li>
          </ul>

          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL}/companion-dashboard" class="cta-button">
              Review & Respond to Booking →
            </a>
          </div>

          <p style="text-align: center; color: #dc2626; font-size: 14px; font-weight: 600;">
            ⏰ Please respond within 24 hours to avoid automatic cancellation.
          </p>
        </div>

        <div class="footer">
          <p>Best regards,<br>The Meytle Team</p>
          <p>Need help? Contact us at support@meytle.com</p>
          <p style="font-size: 12px; color: #9ca3af;">
            You received this email because you have an active companion account on Meytle.<br>
            Manage your notification preferences in your dashboard settings.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Get booking confirmation email template (to client when companion accepts)
const getBookingConfirmationTemplate = (clientName, companionName, bookingDetails) => {
  const { bookingDate, startTime, endTime, totalAmount, meetingLocation, serviceName, timezone } = bookingDetails;
  
  const date = new Date(bookingDate);
  const formattedDate = date.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  // Format times to 12-hour format
  const formattedStartTime = formatTimeTo12Hour(startTime);
  const formattedEndTime = formatTimeTo12Hour(endTime);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Booking Confirmed - Meytle</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f8f9fa;
        }
        .container {
          background: white;
          border-radius: 10px;
          padding: 30px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
        }
        .logo {
          font-size: 28px;
          font-weight: bold;
          background: linear-gradient(135deg, #312E81, #FFCCCB);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 10px;
        }
        .title {
          color: #10b981;
          font-size: 28px;
          margin-bottom: 10px;
        }
        .success-badge {
          display: inline-block;
          background: #10b981;
          color: white;
          padding: 8px 20px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 600;
          margin: 10px 0;
        }
        .booking-details {
          background: #f9fafb;
          border-radius: 8px;
          padding: 20px;
          margin: 20px 0;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px solid #e5e7eb;
        }
        .detail-row:last-child {
          border-bottom: none;
        }
        .detail-label {
          font-weight: 600;
          color: #6b7280;
        }
        .detail-value {
          color: #111827;
          text-align: right;
        }
        .highlight-box {
          background: #dcfce7;
          border-left: 4px solid #10b981;
          padding: 15px;
          border-radius: 8px;
          margin: 20px 0;
        }
        .info-box {
          background: #eff6ff;
          border-left: 4px solid #3b82f6;
          padding: 15px;
          border-radius: 8px;
          margin: 20px 0;
        }
        .cta-button {
          display: inline-block;
          background: linear-gradient(135deg, #312E81, #FFCCCB);
          color: white;
          padding: 14px 28px;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 16px;
          margin: 20px 0;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          color: #6b7280;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">Meytle</div>
          <div class="title">🎉 Booking Confirmed!</div>
          <span class="success-badge">CONFIRMED</span>
        </div>

        <div class="content">
          <p>Hi <strong>${clientName}</strong>,</p>

          <p>Great news! <strong>${companionName}</strong> has accepted your booking request.</p>

          <div class="highlight-box">
            <strong>✅ Your booking is now confirmed!</strong> You'll receive an OTP verification code 30 minutes before your meeting starts.
          </div>

          <div class="booking-details">
            <h3 style="margin-top: 0;">📅 Booking Details</h3>
            <div class="detail-row">
              <span class="detail-label">Companion:</span>
              <span class="detail-value"><strong>${companionName}</strong></span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Date:</span>
              <span class="detail-value">${formattedDate}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Time:</span>
              <span class="detail-value">
                <strong>${formattedStartTime} - ${formattedEndTime}</strong>
                ${timezone ? `<br><span style="font-size: 12px; color: #6b7280;">
                  (Your timezone: ${timezone})</span>` : ''}
              </span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Service:</span>
              <span class="detail-value">${serviceName || 'Companionship'}</span>
            </div>
            ${meetingLocation ? `
            <div class="detail-row">
              <span class="detail-label">Location:</span>
              <span class="detail-value">${meetingLocation}</span>
            </div>
            ` : ''}
            <div class="detail-row">
              <span class="detail-label">Total Amount:</span>
              <span class="detail-value" style="font-size: 18px; font-weight: bold; color: #10b981;">$${totalAmount.toFixed(2)}</span>
            </div>
          </div>

          <div class="info-box">
            <strong>📍 Before Your Meeting:</strong><br>
            • You'll receive an OTP code 30 minutes before the meeting<br>
            • Meet your companion at the agreed location<br>
            • Exchange OTP codes to verify the meeting<br>
            • Both parties must verify for payment to be processed
          </div>

          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL}/client-dashboard" class="cta-button">
              View Booking Details →
            </a>
          </div>

          <p style="text-align: center; color: #6b7280; font-size: 14px;">
            Need to cancel? You can cancel up to 24 hours before the meeting for a full refund.
          </p>
        </div>

        <div class="footer">
          <p>Best regards,<br>The Meytle Team</p>
          <p>Need help? Contact us at support@meytle.com</p>
          <p style="font-size: 12px; color: #9ca3af;">
            You received this email because you have an active booking on Meytle.<br>
            Manage your notification preferences in your dashboard settings.
          </p>
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
      ? `[TEST: ${clientEmail}] Booking Confirmed with ${companionName}`
      : `Booking Confirmed with ${companionName}! 🎉`;

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
  const { bookingDate, startTime, serviceName, timezone } = bookingDetails;
  
  const date = new Date(bookingDate);
  const formattedDate = date.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  // Format time to 12-hour format
  const formattedStartTime = formatTimeTo12Hour(startTime);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Booking Cancelled - Meytle</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f8f9fa;
        }
        .container {
          background: white;
          border-radius: 10px;
          padding: 30px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
        }
        .logo {
          font-size: 28px;
          font-weight: bold;
          background: linear-gradient(135deg, #312E81, #FFCCCB);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 10px;
        }
        .title {
          color: #ef4444;
          font-size: 24px;
          margin-bottom: 10px;
        }
        .cancelled-badge {
          display: inline-block;
          background: #fee2e2;
          color: #dc2626;
          padding: 8px 20px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 600;
          margin: 10px 0;
        }
        .booking-details {
          background: #f9fafb;
          border-radius: 8px;
          padding: 20px;
          margin: 20px 0;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px solid #e5e7eb;
        }
        .detail-row:last-child {
          border-bottom: none;
        }
        .detail-label {
          font-weight: 600;
          color: #6b7280;
        }
        .detail-value {
          color: #111827;
          text-align: right;
        }
        .warning-box {
          background: #fef2f2;
          border-left: 4px solid #ef4444;
          padding: 15px;
          border-radius: 8px;
          margin: 20px 0;
        }
        .info-box {
          background: #eff6ff;
          border-left: 4px solid #3b82f6;
          padding: 15px;
          border-radius: 8px;
          margin: 20px 0;
        }
        .cta-button {
          display: inline-block;
          background: linear-gradient(135deg, #312E81, #FFCCCB);
          color: white;
          padding: 14px 28px;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 16px;
          margin: 20px 0;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          color: #6b7280;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">Meytle</div>
          <div class="title">Booking Cancelled</div>
          <span class="cancelled-badge">CANCELLED</span>
        </div>

        <div class="content">
          <p>Hi <strong>${clientName}</strong>,</p>

          <p>Unfortunately, <strong>${companionName}</strong> is unable to accept your booking request.</p>

          ${reason ? `
          <div class="warning-box">
            <strong>Reason:</strong><br>${reason}
          </div>
          ` : ''}

          <div class="booking-details">
            <h3 style="margin-top: 0;">📅 Cancelled Booking</h3>
            <div class="detail-row">
              <span class="detail-label">Companion:</span>
              <span class="detail-value">${companionName}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Date:</span>
              <span class="detail-value">${formattedDate}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Time:</span>
              <span class="detail-value">
                <strong>${formattedStartTime}</strong>
                ${timezone ? `<br><span style="font-size: 12px; color: #6b7280;">
                  (Your timezone: ${timezone})</span>` : ''}
              </span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Service:</span>
              <span class="detail-value">${serviceName || 'Companionship'}</span>
            </div>
          </div>

          <div class="info-box">
            <strong>💰 Refund Information:</strong><br>
            • You will receive a full refund within 5-7 business days<br>
            • The refund will be processed to your original payment method<br>
            • No cancellation fees apply when a companion declines
          </div>

          <p><strong>What's Next?</strong></p>
          <ul>
            <li>Browse other available companions in your area</li>
            <li>Send booking requests to multiple companions</li>
            <li>Check our featured companions for quick responses</li>
          </ul>

          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL}/browse-companions" class="cta-button">
              Browse Other Companions →
            </a>
          </div>
        </div>

        <div class="footer">
          <p>We're sorry this didn't work out this time!</p>
          <p>Best regards,<br>The Meytle Team</p>
          <p>Need help? Contact us at support@meytle.com</p>
          <p style="font-size: 12px; color: #9ca3af;">
            You received this email because you had a booking request on Meytle.
          </p>
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
