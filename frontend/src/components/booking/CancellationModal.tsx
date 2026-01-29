/**
 * Cancellation Modal Component
 * Allows users to cancel bookings/requests with predefined reasons
 */

import React, { useState, useEffect } from 'react';
import { FaTimes, FaBan } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';

interface CancellationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  userRole: 'client' | 'companion';
  bookingType?: 'booking' | 'request';
  isSubmitting?: boolean;
  bookingStatus?: 'pending' | 'confirmed';
}

const CancellationModal: React.FC<CancellationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  userRole,
  bookingType = 'booking',
  isSubmitting = false,
  bookingStatus = 'pending'
}) => {
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  // Prevent background scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    // Cleanup function to reset overflow when component unmounts
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Predefined reasons based on user role
  const clientReasons = [
    'Schedule conflict',
    'Emergency',
    'Found another companion',
    'Change of plans',
    'Personal reasons',
    'Other'
  ];

  const companionReasons = [
    'Schedule conflict',
    'Emergency',
    'Not comfortable with request',
    'Client issue',
    'Personal reasons',
    'Other'
  ];

  const reasons = userRole === 'client' ? clientReasons : companionReasons;

  const handleConfirm = () => {
    const finalReason = selectedReason === 'Other' ? customReason : selectedReason;
    
    if (!finalReason.trim()) {
      return;
    }

    onConfirm(finalReason);
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setSelectedReason('');
      setCustomReason('');
      onClose();
    }
  };

  const isFormValid = selectedReason && (selectedReason !== 'Other' || customReason.trim().length > 0);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4 overflow-y-auto"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative my-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            <FaTimes className="text-xl" />
          </button>

          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
              <FaBan className="text-red-600 text-xl" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Cancel {bookingType === 'booking' ? 'Booking' : 'Request'}</h2>
              <p className="text-sm text-gray-500">Please select a reason for cancellation</p>
            </div>
          </div>

          {/* Reasons dropdown */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason for cancellation <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#312E81] focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Select a reason...</option>
              {reasons.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </div>

          {/* Custom reason textarea */}
          {selectedReason === 'Other' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4"
            >
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Please specify <span className="text-red-500">*</span>
              </label>
              <textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Enter your reason..."
                disabled={isSubmitting}
                rows={4}
                maxLength={500}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#312E81] focus:border-transparent transition-all resize-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <div className="text-xs text-gray-500 mt-1 text-right">
                {customReason.length}/500
              </div>
            </motion.div>
          )}

          {/* Warning message */}
          {bookingStatus === 'confirmed' ? (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-lg">!</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-amber-900 mb-2">
                    Important Information
                  </p>
                  <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
                    <li>The {userRole === 'client' ? 'companion' : 'client'} will be notified immediately</li>
                    <li>Frequent cancellations may affect your account standing</li>
                    <li>This action cannot be undone</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
              <p className="text-sm text-amber-800">
                <strong>Note:</strong> This action cannot be undone. The other party will be notified of the cancellation.
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Go Back
            </button>
            <button
              onClick={handleConfirm}
              disabled={!isFormValid || isSubmitting}
              className="flex-1 px-6 py-3 bg-red-600 text-white font-medium rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Cancelling...</span>
                </>
              ) : (
                <>
                  <FaBan />
                  <span>Cancel {bookingType === 'booking' ? 'Booking' : 'Request'}</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default CancellationModal;

