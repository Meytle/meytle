import React, { useState } from 'react';
import { FaTimes, FaLock, FaCheckCircle } from 'react-icons/fa';
import { toast } from 'react-hot-toast';
import StripePaymentForm from './StripePaymentForm';
import { useModalRegistration } from '../../context/ModalContext';

interface PaymentConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: number;
  clientSecret: string;
  amount: number;
  companionName: string;
  bookingDate: string;
  bookingTime: string;
  onPaymentSuccess: () => void;
}

const PaymentConfirmationModal: React.FC<PaymentConfirmationModalProps> = ({
  isOpen,
  onClose,
  bookingId,
  clientSecret,
  amount,
  companionName,
  bookingDate,
  bookingTime,
  onPaymentSuccess
}) => {
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [modalClosing, setModalClosing] = useState(false);

  // Register modal with ModalContext to hide header/footer and prevent scrolling
  useModalRegistration('payment-confirmation-modal', isOpen);

  if (!isOpen) return null;

  const handlePaymentSuccess = async () => {
    if (isConfirming) return; // Prevent double-confirm
    
    setIsConfirming(true);
    
    try {
      // Call the onPaymentSuccess callback (parent handles the confirmation)
      await onPaymentSuccess();
      
      setPaymentCompleted(true);
      // Note: Parent already shows success toast with full details
      
      // ⚠️ Parent's onPaymentSuccess already handles closing its modal
      // So this modal will automatically close when parent unmounts
      // We just wait a moment for the success message to show
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || error.message || 'Failed to confirm payment. Please contact support.';
      setPaymentError(errorMsg);
      toast.error(errorMsg);
      setIsConfirming(false);
    }
  };

  const handlePaymentError = (error: string) => {
    setPaymentError(error);
  };

  const handleClose = async () => {
    if (paymentCompleted || modalClosing) return; // Don't cancel if payment is done
    
    setModalClosing(true);
    
    // ⚠️ Delegate cancellation to parent's onClose handler
    // Parent knows whether it's a booking or request and calls the correct cancel function
    onClose();
  };

  const handleBackdropClick = () => {
    // Delegate to handleClose (which delegates to parent)
    handleClose();
  };

  return (
    <div 
      className="fixed inset-0 z-[70] bg-black/30 backdrop-blur-md flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div 
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col overscroll-contain"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10 flex-shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Complete Your Payment
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Secure payment authorization for your booking
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={paymentCompleted || isConfirming || modalClosing}
            aria-label="Close modal"
          >
            <FaTimes className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 overscroll-contain">
          {/* Booking Summary */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Booking Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Companion:</span>
                <span className="font-medium text-gray-900">{companionName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Date:</span>
                <span className="font-medium text-gray-900">{bookingDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Time:</span>
                <span className="font-medium text-gray-900">{bookingTime}</span>
              </div>
              <div className="border-t border-blue-200 pt-3 mt-3">
                <div className="flex justify-between text-lg">
                  <span className="font-semibold text-gray-900">Total Amount:</span>
                  <span className="font-bold text-[#312E81]">${amount.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Status */}
          {paymentCompleted ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
              <FaCheckCircle className="text-green-500 text-5xl mx-auto mb-4" />
              <h3 className="text-xl font-bold text-green-900 mb-2">
                Payment Authorized Successfully!
              </h3>
              <p className="text-green-800">
                Your booking is now confirmed. The payment will be processed after your meeting is completed.
              </p>
            </div>
          ) : (
            <StripePaymentForm
              clientSecret={clientSecret}
              bookingId={bookingId}
              amount={amount}
              onSuccess={handlePaymentSuccess}
              onError={handlePaymentError}
            />
          )}
        </div>

        {/* Footer - Simple */}
        {!paymentCompleted && (
          <div className="bg-gray-50 border-t px-6 py-3 flex-shrink-0 rounded-b-xl">
            <p className="text-xs text-gray-500 text-center">
              <FaLock className="inline-block mr-1" />
              Secure payment by Stripe
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentConfirmationModal;

