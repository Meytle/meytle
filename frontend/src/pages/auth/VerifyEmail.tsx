/**
 * Email Verification Page
 * Shows OTP input form for unverified users
 * Also handles token-based verification from email links
 */

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { FaCheckCircle, FaTimesCircle, FaSpinner, FaEnvelope, FaRedo, FaSignOutAlt } from 'react-icons/fa';
import { motion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { API_CONFIG, ROUTES } from '../../constants';

const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, verifyOTP, resendOTP, signOut, isAuthenticated } = useAuth();

  // OTP Input state
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60); // Start with 60 second cooldown
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Token-based verification state (for email links)
  const [tokenVerificationStatus, setTokenVerificationStatus] = useState<'pending' | 'success' | 'error' | null>(null);
  const [tokenMessage, setTokenMessage] = useState('');

  const token = searchParams.get('token');

  // Handle token-based verification from email link
  useEffect(() => {
    if (token) {
      verifyEmailWithToken(token);
    }
  }, [token]);

  // Countdown timer for resend
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Focus first input on mount (if no token)
  useEffect(() => {
    if (!token && inputRefs.current[0]) {
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [token]);

  // Redirect if user is already verified
  useEffect(() => {
    if (user?.emailVerified && !token) {
      const activeRole = user.activeRole;
      if (activeRole === 'admin') {
        navigate(ROUTES.ADMIN_DASHBOARD, { replace: true });
      } else if (activeRole === 'companion') {
        navigate(ROUTES.COMPANION_DASHBOARD, { replace: true });
      } else {
        navigate(ROUTES.CLIENT_DASHBOARD, { replace: true });
      }
    }
  }, [user, token, navigate]);

  // Redirect if not authenticated (and no token for verification)
  useEffect(() => {
    if (!isAuthenticated && !token) {
      navigate(ROUTES.SIGN_IN, { replace: true });
    }
  }, [isAuthenticated, token, navigate]);

  // Token-based verification (from email link)
  const verifyEmailWithToken = async (verificationToken: string) => {
    try {
      setTokenVerificationStatus('pending');

      const response = await fetch(`${API_CONFIG.BASE_URL}/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: verificationToken }),
      });

      const data = await response.json();

      if (response.ok) {
        setTokenVerificationStatus('success');
        setTokenMessage('Email verified successfully!');
        toast.success('Email verified successfully!');

        const activeRole = data?.data?.user?.activeRole || 'client';
        const redirectUrl = activeRole === 'companion'
          ? ROUTES.COMPANION_APPLICATION
          : activeRole === 'admin'
          ? ROUTES.ADMIN_DASHBOARD
          : ROUTES.CLIENT_DASHBOARD;

        setTimeout(() => {
          window.location.href = `${redirectUrl}?verified=${Date.now()}`;
        }, 2000);
      } else {
        setTokenVerificationStatus('error');
        setTokenMessage(data.message || 'Failed to verify email');
      }
    } catch {
      setTokenVerificationStatus('error');
      setTokenMessage('Network error. Please try again.');
    }
  };

  // OTP Input handlers
  const handleChange = (index: number, value: string) => {
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError(null);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (value && index === 5) {
      const fullOtp = newOtp.join('');
      if (fullOtp.length === 6) {
        handleVerify(fullOtp);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pastedData) {
      const newOtp = pastedData.split('').concat(Array(6 - pastedData.length).fill(''));
      setOtp(newOtp);
      setError(null);

      const nextEmptyIndex = Math.min(pastedData.length, 5);
      inputRefs.current[nextEmptyIndex]?.focus();

      if (pastedData.length === 6) {
        handleVerify(pastedData);
      }
    }
  };

  const handleVerify = async (otpCode?: string) => {
    const codeToVerify = otpCode || otp.join('');
    if (codeToVerify.length !== 6) {
      setError('Please enter all 6 digits');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const result = await verifyOTP(codeToVerify);
      if (!result.success) {
        setError(result.message || 'Verification failed');
        if (result.requiresResend) {
          setOtp(['', '', '', '', '', '']);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || isResending) return;

    setIsResending(true);
    setError(null);
    setOtp(['', '', '', '', '', '']);

    try {
      const result = await resendOTP();
      if (result.success) {
        toast.success('New verification code sent!');
        setResendCooldown(60);
        inputRefs.current[0]?.focus();
      } else {
        setError(result.message || 'Failed to resend code');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to resend code');
    } finally {
      setIsResending(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  // If token-based verification is in progress, show that UI
  if (token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-24 w-24 mb-6">
              {tokenVerificationStatus === 'success' && <FaCheckCircle className="text-green-500 text-6xl" />}
              {tokenVerificationStatus === 'error' && <FaTimesCircle className="text-red-500 text-6xl" />}
              {tokenVerificationStatus === 'pending' && <FaSpinner className="text-[#312E81] text-6xl animate-spin" />}
            </div>

            <h2 className={`text-3xl font-bold ${
              tokenVerificationStatus === 'success' ? 'text-green-600' :
              tokenVerificationStatus === 'error' ? 'text-red-600' : 'text-[#312E81]'
            }`}>
              {tokenVerificationStatus === 'success' && 'Email Verified!'}
              {tokenVerificationStatus === 'error' && 'Verification Failed'}
              {tokenVerificationStatus === 'pending' && 'Verifying Email...'}
            </h2>

            <p className="mt-4 text-lg text-gray-600">{tokenMessage}</p>

            {tokenVerificationStatus === 'success' && (
              <div className="mt-6">
                <p className="text-sm text-gray-500 mb-4">Redirecting to your dashboard...</p>
              </div>
            )}

            {tokenVerificationStatus === 'error' && (
              <div className="mt-6 space-y-4">
                <button
                  onClick={() => navigate(ROUTES.SIGN_IN)}
                  className="w-full py-3 px-4 bg-[#312E81] text-white rounded-md hover:bg-[#1E1B4B]"
                >
                  Go to Sign In
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // OTP Verification UI
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FFF0F0] via-[#FFE5E5] to-[#FFCCCB] flex items-center justify-center py-12 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-[#312E81] to-[#4A47A3] rounded-full flex items-center justify-center mx-auto mb-4">
            <FaEnvelope className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Verify Your Email</h2>
          <p className="text-gray-600 text-sm">
            We sent a 6-digit code to<br />
            <span className="font-semibold text-gray-900">{user?.email}</span>
          </p>
        </div>

        {/* OTP Input */}
        <div className="flex justify-center gap-2 mb-6">
          {otp.map((digit, index) => (
            <input
              key={index}
              ref={el => { inputRefs.current[index] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={handlePaste}
              className={`w-12 h-14 text-center text-2xl font-bold border-2 rounded-lg transition-colors
                ${error ? 'border-red-400 bg-red-50' : 'border-gray-300 focus:border-[#312E81]'}
                focus:outline-none focus:ring-2 focus:ring-[#312E81]/20`}
              disabled={isVerifying}
            />
          ))}
        </div>

        {/* Error Message */}
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-red-600 text-sm text-center mb-4"
          >
            {error}
          </motion.p>
        )}

        {/* Verify Button */}
        <button
          onClick={() => handleVerify()}
          disabled={isVerifying || otp.join('').length !== 6}
          className="w-full py-3 bg-gradient-to-r from-[#312E81] to-[#4A47A3] text-white font-semibold rounded-lg
            hover:from-[#1E1B4B] hover:to-[#312E81] transition-all disabled:opacity-50 disabled:cursor-not-allowed
            flex items-center justify-center gap-2"
        >
          {isVerifying ? (
            <>
              <FaSpinner className="animate-spin" />
              Verifying...
            </>
          ) : (
            'Verify Email'
          )}
        </button>

        {/* Resend */}
        <div className="text-center mt-6">
          <p className="text-gray-600 text-sm mb-2">Didn't receive the code?</p>
          <button
            onClick={handleResend}
            disabled={resendCooldown > 0 || isResending}
            className="text-[#312E81] font-semibold hover:underline disabled:text-gray-400 disabled:no-underline
              flex items-center justify-center gap-2 mx-auto"
          >
            {isResending ? (
              <>
                <FaSpinner className="animate-spin" />
                Sending...
              </>
            ) : resendCooldown > 0 ? (
              `Resend code in ${resendCooldown}s`
            ) : (
              <>
                <FaRedo className="w-3 h-3" />
                Resend Code
              </>
            )}
          </button>
        </div>

        {/* Help text */}
        <p className="text-gray-400 text-xs text-center mt-6">
          Code expires in 10 minutes. Check your spam folder if you don't see it.
        </p>

        {/* Divider */}
        <div className="border-t border-gray-200 my-6"></div>

        {/* Sign Out / Wrong Email Section */}
        <div className="text-center">
          <p className="text-gray-500 text-sm mb-3">
            Wrong email address?
          </p>
          <button
            onClick={handleSignOut}
            className="flex items-center justify-center gap-2 mx-auto text-gray-600 hover:text-red-600 transition-colors"
          >
            <FaSignOutAlt className="w-4 h-4" />
            <span>Sign out and try again</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default VerifyEmail;
