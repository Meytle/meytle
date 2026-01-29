/**
 * Email Verification Page
 * Handles email verification from verification links
 */

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { FaCheckCircle, FaTimesCircle, FaSpinner } from 'react-icons/fa';
import { API_CONFIG, ROUTES } from '../../constants';

const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [message, setMessage] = useState('');

  const token = searchParams.get('token');

  useEffect(() => {
    if (token) {
      verifyEmail(token);
    } else {
      setVerificationStatus('error');
      setMessage('No verification token provided');
    }
  }, [token]);

  const verifyEmail = async (verificationToken: string) => {
    try {
      setIsVerifying(true);
      
      const response = await fetch(`${API_CONFIG.BASE_URL}/auth/verify-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Important: Include cookies
        body: JSON.stringify({ token: verificationToken }),
      });

      const data = await response.json();

      if (response.ok) {
        setVerificationStatus('success');
        setMessage('Email verified successfully! You can now use all features of Meytle.');
        toast.success('Email verified successfully!');

        // The backend has updated the cookies with emailVerified: true
        // Determine redirect based on user's active role from response
        const activeRole = data?.data?.user?.activeRole || 'client';
        const redirectUrl = activeRole === 'companion'
          ? ROUTES.COMPANION_DASHBOARD
          : activeRole === 'admin'
          ? ROUTES.ADMIN_DASHBOARD
          : ROUTES.CLIENT_DASHBOARD;

        // Force a complete page reload with cache bypass
        setTimeout(() => {
          // Add timestamp to force cache bypass and trigger auth refresh
          window.location.href = `${redirectUrl}?verified=${Date.now()}`;
        }, 2000);
      } else {
        setVerificationStatus('error');
        setMessage(data.message || 'Failed to verify email');
        toast.error(data.message || 'Failed to verify email');
      }
    } catch (error) {
      console.error('Verification error:', error);
      setVerificationStatus('error');
      setMessage('Network error. Please try again.');
      toast.error('Network error. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const getStatusIcon = () => {
    switch (verificationStatus) {
      case 'success':
        return <FaCheckCircle className="text-green-500 text-6xl" />;
      case 'error':
        return <FaTimesCircle className="text-red-500 text-6xl" />;
      default:
        return <FaSpinner className="text-[#312E81] text-6xl animate-spin" />;
    }
  };

  const getStatusColor = () => {
    switch (verificationStatus) {
      case 'success':
        return 'text-green-600';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-[#312E81]';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-24 w-24 mb-6">
            {getStatusIcon()}
          </div>
          
          <h2 className={`text-3xl font-bold ${getStatusColor()}`}>
            {verificationStatus === 'success' && 'Email Verified!'}
            {verificationStatus === 'error' && 'Verification Failed'}
            {verificationStatus === 'pending' && 'Verifying Email...'}
          </h2>
          
          <p className="mt-4 text-lg text-gray-600">
            {message}
          </p>

          {verificationStatus === 'success' && (
            <div className="mt-6">
              <p className="text-sm text-gray-500 mb-4">
                Redirecting you to your dashboard in 2 seconds...
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full animate-pulse" style={{ width: '100%' }}></div>
              </div>
            </div>
          )}

          {verificationStatus === 'error' && (
            <div className="mt-6 space-y-4">
              <button
                onClick={() => navigate(ROUTES.SIGN_IN)}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#312E81] hover:bg-[#1E1B4B] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#312E81]"
              >
                Go to Sign In
              </button>
              
              <button
                onClick={() => navigate(ROUTES.SIGN_UP)}
                className="w-full flex justify-center py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#312E81]"
              >
                Create New Account
              </button>
            </div>
          )}

          {verificationStatus === 'pending' && isVerifying && (
            <div className="mt-6">
              <p className="text-sm text-gray-500">
                Please wait while we verify your email...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
