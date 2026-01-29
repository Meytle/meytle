/**
 * Simple Payout Setup Card for Companion Dashboard
 */

import React, { useState, useEffect } from 'react';
import { FaMoneyBillWave, FaCheckCircle, FaClock, FaExclamationTriangle } from 'react-icons/fa';
import { toast } from 'react-hot-toast';
import { payoutApi } from '../../api/payout';

const PayoutSetupCard: React.FC = () => {
  const [status, setStatus] = useState<{
    hasStripeAccount: boolean;
    accountStatus: string;
    detailsSubmitted: boolean;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSettingUp, setIsSettingUp] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const data = await payoutApi.getPayoutStatus();
      setStatus(data);
    } catch (error) {
      console.error('Failed to fetch payout status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetupPayout = async () => {
    setIsSettingUp(true);
    try {
      const { url } = await payoutApi.createPayoutSetup();
      // Redirect to Stripe Connect onboarding
      window.location.href = url;
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to start payout setup');
      setIsSettingUp(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
          <div className="h-3 bg-gray-200 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  // Not set up yet
  if (!status?.hasStripeAccount || status.accountStatus === 'not_created') {
    return (
      <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg shadow-sm p-6 border-2 border-green-200">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <FaMoneyBillWave className="text-green-600 text-3xl" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Set Up Payouts
            </h3>
            <p className="text-sm text-gray-700 mb-4">
              Connect your bank account to receive payments for completed bookings.
            </p>
            <button
              onClick={handleSetupPayout}
              disabled={isSettingUp}
              className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {isSettingUp ? 'Starting...' : 'Setup Now'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Pending verification
  if (status.accountStatus === 'pending' || !status.detailsSubmitted) {
    return (
      <div className="bg-yellow-50 rounded-lg shadow-sm p-6 border border-yellow-200">
        <div className="flex items-start gap-4">
          <FaClock className="text-yellow-600 text-2xl flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Payout Setup In Progress
            </h3>
            <p className="text-sm text-gray-700 mb-3">
              {!status.detailsSubmitted 
                ? 'Complete your Stripe account setup to receive payments.'
                : 'Your account is being verified. This usually takes 1-2 business days.'}
            </p>
            {!status.detailsSubmitted && (
              <button
                onClick={handleSetupPayout}
                disabled={isSettingUp}
                className="inline-flex items-center px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {isSettingUp ? 'Loading...' : 'Complete Setup'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Rejected
  if (status.accountStatus === 'rejected') {
    return (
      <div className="bg-red-50 rounded-lg shadow-sm p-6 border border-red-200">
        <div className="flex items-start gap-4">
          <FaExclamationTriangle className="text-red-600 text-2xl flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Payout Setup Issues
            </h3>
            <p className="text-sm text-gray-700 mb-3">
              There was an issue with your payout setup. Please try again or contact support.
            </p>
            <button
              onClick={handleSetupPayout}
              className="inline-flex items-center px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active - all good!
  if (status.payoutsEnabled && status.chargesEnabled) {
    return (
      <div className="bg-green-50 rounded-lg shadow-sm p-6 border border-green-200">
        <div className="flex items-start gap-4">
          <FaCheckCircle className="text-green-600 text-2xl flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Payouts Active
            </h3>
            <p className="text-sm text-gray-700">
              You're all set to receive payments! Earnings will be deposited to your bank account.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Default fallback
  return null;
};

export default PayoutSetupCard;

