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
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  // Format times to 12-hour format
  const formattedStartTime = formatTimeTo12Hour(startTime);
  const formattedEndTime = formatTimeTo12Hour(endTime);

  const recipientRole = userType === 'client' ? 'Client' : 'Companion';
  const otherRole = userType === 'client' ? 'companion' : 'client';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Meeting Verification Code - Meytle</title>
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
          background: linear-gradient(135deg, #8b5cf6, #ec4899);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 10px;
        }
        .title {
          color: #1f2937;
          font-size: 24px;
          margin-bottom: 10px;
        }
        .otp-container {
          background: linear-gradient(135deg, #8b5cf6, #ec4899);
          padding: 30px;
          border-radius: 12px;
          text-align: center;
          margin: 30px 0;
        }
        .otp-label {
          color: white;
          font-size: 14px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 10px;
        }
        .otp-code {
          font-size: 48px;
          font-weight: bold;
          color: white;
          letter-spacing: 8px;
          font-family: 'Courier New', monospace;
          margin: 10px 0;
        }
        .otp-instruction {
          color: rgba(255, 255, 255, 0.9);
          font-size: 14px;
          margin-top: 10px;
        }
        .meeting-details {
          background: #f3f4f6;
          padding: 20px;
          border-radius: 8px;
          margin: 20px 0;
        }
        .meeting-details h3 {
          margin-top: 0;
          color: #1f2937;
          font-size: 18px;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
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
          color: #1f2937;
        }
        .warning-box {
          background: #fef3c7;
          border-left: 4px solid #f59e0b;
          padding: 15px;
          border-radius: 8px;
          margin: 20px 0;
        }
        .warning-box strong {
          color: #92400e;
        }
        .instructions {
          background: #eff6ff;
          border-left: 4px solid #3b82f6;
          padding: 15px;
          border-radius: 8px;
          margin: 20px 0;
        }
        .instructions h4 {
          margin-top: 0;
          color: #1e40af;
        }
        .instructions ol {
          margin: 10px 0;
          padding-left: 20px;
        }
        .instructions li {
          margin: 8px 0;
          color: #1f2937;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          color: #6b7280;
          font-size: 14px;
        }
        .security-notice {
          background: #fee2e2;
          border-left: 4px solid #ef4444;
          padding: 15px;
          border-radius: 8px;
          margin: 20px 0;
        }
        .security-notice strong {
          color: #991b1b;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">Meytle</div>
          <div class="title">🔐 Meeting Verification Code</div>
          <p>Hi ${userName},</p>
        </div>

        <p>Your meeting is scheduled to start soon! For security and safety, both parties need to verify they are at the meeting location.</p>

        <div class="otp-container">
          <div class="otp-label">Your Verification Code</div>
          <div class="otp-code">${otpCode}</div>
          <div class="otp-instruction">Share this code with your ${otherRole} when you meet</div>
        </div>

        <div class="meeting-details">
          <h3>📅 Meeting Details</h3>
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
            <span class="detail-label">Meeting with:</span>
            <span class="detail-value">${otherPartyName}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Location:</span>
            <span class="detail-value">${meetingLocation || 'Not specified'}</span>
          </div>
        </div>

        <div class="instructions">
          <h4>📍 How to Verify Your Meeting:</h4>
          <ol>
            <li>Arrive at the meeting location</li>
            <li>Meet your ${otherRole} in person</li>
            <li>They will share their verification code with you</li>
            <li>Enter their code in the Meytle app</li>
            <li>Your ${otherRole} will enter your code (${otpCode})</li>
            <li>Both codes must be verified for the meeting to proceed</li>
          </ol>
        </div>

        <div class="warning-box">
          <strong>⏰ Important:</strong> This code expires 1 hour after your meeting start time. Both parties must verify within this timeframe for the meeting to be confirmed and payment to be processed.
        </div>

        <div class="security-notice">
          <strong>🔒 Security Notice:</strong> The app will also verify that both parties are physically present at the meeting location using GPS. This is for your safety and security. If verification fails, the booking will be automatically cancelled and the client will receive a full refund.
        </div>

        <div class="footer">
          <p>This is an automated message from Meytle.</p>
          <p>If you have questions, please contact support.</p>
          <p>&copy; ${new Date().getFullYear()} Meytle. All rights reserved.</p>
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
      subject: `🔐 Your Meeting Verification Code - ${otpCode}`,
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

