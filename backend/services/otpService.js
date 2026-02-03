/**
 * OTP Service
 * Handles OTP generation and sending verification emails
 */

const { Resend } = require('resend');
const logger = require('./logger');
const { shouldSendEmail } = require('./emailService');

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Generate a random 6-digit OTP code
 * @returns {string} 6-digit OTP code
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Format time from 24-hour format (HH:MM:SS) to 12-hour format (h:MM AM/PM)
 * @param {string} time24 - Time in 24-hour format (e.g., "07:00:00")
 * @returns {string} Time in 12-hour format (e.g., "7:00 AM")
 */
const formatTimeTo12Hour = (time24) => {
  if (!time24) return time24;
  
  const [hours, minutes] = time24.split(':');
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12; // Convert 0 to 12
  
  return `${hour12}:${minutes} ${ampm}`;
};

/**
 * Get OTP email template
 * @param {string} userName - Recipient's name
 * @param {string} userType - 'client' or 'companion'
 * @param {string} otpCode - The 6-digit OTP code
 * @param {object} meetingDetails - Details about the meeting
 * @returns {string} HTML email template
 */
const getOTPEmailTemplate = (userName, userType, otpCode, meetingDetails) => {
  const { bookingDate, startTime, endTime, meetingLocation, otherPartyName, timezone } = meetingDetails;

  // Format date nicely
  const date = new Date(bookingDate);
  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });

  // Format times to 12-hour format
  const formattedStartTime = formatTimeTo12Hour(startTime);
  const formattedEndTime = formatTimeTo12Hour(endTime);

  const otherRole = userType === 'client' ? 'companion' : 'client';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your verification code - Meytle</title>
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
        .otp-box {
          background: #f9fafb;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          padding: 24px;
          text-align: center;
          margin: 24px 0;
        }
        .otp-code {
          font-size: 36px;
          font-weight: 700;
          color: #1e3a8a;
          letter-spacing: 6px;
          font-family: 'SF Mono', Monaco, 'Courier New', monospace;
          margin: 8px 0;
        }
        .otp-note {
          font-size: 13px;
          color: #6b7280;
          margin-top: 8px;
        }
        .details {
          background: #f9fafb;
          border-radius: 6px;
          padding: 16px 20px;
          margin: 20px 0;
          font-size: 14px;
        }
        .details p {
          margin: 6px 0;
          color: #6b7280;
        }
        .details strong {
          color: #374151;
        }
        .steps {
          margin: 20px 0;
          padding: 0;
          list-style: none;
        }
        .steps li {
          padding: 8px 0;
          padding-left: 24px;
          position: relative;
          font-size: 14px;
          color: #6b7280;
        }
        .steps li:before {
          content: attr(data-step);
          position: absolute;
          left: 0;
          color: #9ca3af;
          font-size: 13px;
        }
        .note {
          font-size: 13px;
          color: #9ca3af;
          margin-top: 20px;
          padding-top: 16px;
          border-top: 1px solid #e5e7eb;
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
        <p>Your meeting starts soon. Share this code with your ${otherRole} when you meet.</p>

        <div class="otp-box">
          <div class="otp-code">${otpCode}</div>
          <div class="otp-note">Expires 1 hour after meeting start</div>
        </div>

        <div class="details">
          <p><strong>${otherPartyName}</strong></p>
          <p>${formattedDate} at ${formattedStartTime}${timezone ? ` (${timezone})` : ''}</p>
          <p>${meetingLocation || 'Location not specified'}</p>
        </div>

        <p style="font-size: 14px; color: #6b7280; margin-top: 24px;"><strong>How it works:</strong></p>
        <ul class="steps">
          <li data-step="1.">Meet at the location</li>
          <li data-step="2.">Exchange codes with your ${otherRole}</li>
          <li data-step="3.">Enter their code in the app</li>
          <li data-step="4.">Both must verify for payment to process</li>
        </ul>

        <div class="note">
          GPS verification is also required. Both parties must be at the meeting location.
        </div>

        <div class="footer">
          <p>— Meytle</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Send OTP email to a user
 * @param {string} userEmail - Recipient's email address
 * @param {string} userName - Recipient's name
 * @param {string} userType - 'client' or 'companion'
 * @param {string} otpCode - The 6-digit OTP code
 * @param {object} meetingDetails - Meeting details
 * @returns {Promise<object>} Resend API response
 */
const sendOTPEmail = async (userEmail, userName, userType, otpCode, meetingDetails) => {
  try {
    // Check if email should be sent based on priority (OTP is CRITICAL)
    if (!shouldSendEmail('otp_verification')) {
      logger.info('otpService', 'sendOTPEmail', 'OTP email skipped due to priority mode', { 
        to: userEmail, 
        userType,
        emailType: 'otp_verification'
      });
      return {
        id: 'skipped-' + Date.now(),
        skipped: true,
        reason: 'priority_mode'
      };
    }

    const emailMode = process.env.EMAIL_MODE || 'production';

    // In test mode, just log the email instead of sending
    if (emailMode === 'test') {
      logger.info('otpService', 'sendOTPEmail', 'Test mode - Email would be sent:', {
        to: userEmail,
        otpCode: otpCode,
        userType: userType,
        meetingDate: meetingDetails.bookingDate
      });
      return {
        id: 'test-email-' + Date.now(),
        from: process.env.RESEND_FROM_EMAIL,
        to: userEmail,
        created_at: new Date().toISOString()
      };
    }

    // Send actual email in production/development mode
    const emailHtml = getOTPEmailTemplate(userName, userType, otpCode, meetingDetails);

    const data = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Meytle <noreply@meytle.com>',
      to: [userEmail],
      subject: `Your verification code: ${otpCode}`,
      html: emailHtml
    });

    logger.info('otpService', 'sendOTPEmail', 'OTP email sent successfully', {
      emailId: data.id,
      to: userEmail,
      userType: userType
    });

    return data;
  } catch (error) {
    logger.error('otpService', 'sendOTPEmail', error, {
      email: userEmail,
      userType: userType
    });
    throw error;
  }
};

module.exports = {
  generateOTP,
  sendOTPEmail,
  getOTPEmailTemplate
};

