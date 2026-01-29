/**
 * Stripe Connect Return Handler
 * Handles redirect after companion completes Stripe Connect onboarding
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FaCheckCircle, FaClock, FaExclamationTriangle } from 'react-icons/fa';
import { payoutApi } from '../../api/payout';
import { ROUTES } from '../../constants';

const PayoutReturn: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'pending' | 'error'>('loading');

  useEffect(() => {
    checkPayoutStatus();
  }, []);

  const checkPayoutStatus = async () => {
    try {
      const data = await payoutApi.getPayoutStatus();
      
      if (data.payoutsEnabled && data.chargesEnabled) {
        setStatus('success');
        // Redirect to dashboard after 3 seconds
        setTimeout(() => {
          navigate(ROUTES.COMPANION_DASHBOARD, { replace: true });
        }, 3000);
      } else if (data.detailsSubmitted) {
        setStatus('pending');
        setTimeout(() => {
          navigate(ROUTES.COMPANION_DASHBOARD, { replace: true });
        }, 3000);
      } else {
        setStatus('error');
      }
    } catch (error) {
      console.error('Failed to check payout status:', error);
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {status === 'loading' && (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Checking Your Setup...
            </h2>
            <p className="text-gray-600">
              Please wait while we verify your payout account.
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <FaCheckCircle className="text-green-500 text-6xl mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Payouts Activated!
            </h2>
            <p className="text-gray-600 mb-4">
              Your bank account is connected and ready to receive payments.
            </p>
            <p className="text-sm text-gray-500">
              Redirecting to dashboard...
            </p>
          </div>
        )}

        {status === 'pending' && (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <FaClock className="text-yellow-500 text-6xl mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Setup Complete!
            </h2>
            <p className="text-gray-600 mb-4">
              Your account is being verified. This usually takes 1-2 business days.
            </p>
            <p className="text-sm text-gray-500">
              Redirecting to dashboard...
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <FaExclamationTriangle className="text-red-500 text-6xl mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Setup Incomplete
            </h2>
            <p className="text-gray-600 mb-6">
              It looks like your setup wasn't completed. Please try again from your dashboard.
            </p>
            <button
              onClick={() => navigate(ROUTES.COMPANION_DASHBOARD, { replace: true })}
              className="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PayoutReturn;

