/**
 * Quick Booking Modal Component
 * Modal for quickly booking a companion
 */

import { useState, useEffect } from 'react';
import { FaTimes, FaUser, FaExclamationTriangle } from 'react-icons/fa';
import BookingForm from './BookingForm';
import { useAuth } from '../../hooks/useAuth';
import { useModalRegistration } from '../../context/ModalContext';
import type { Companion } from '../../types';

interface QuickBookingModalProps {
  companion: Companion;
  isOpen: boolean;
  onClose: () => void;
  onBookingCreated: (bookingId: number) => void;
}

const QuickBookingModal = ({ companion, isOpen, onClose, onBookingCreated }: QuickBookingModalProps) => {
  const [isClosing, setIsClosing] = useState(false);
  const { user } = useAuth();

  // Register modal with global modal context (handles scroll prevention automatically)
  useModalRegistration('quick-booking-modal', isOpen);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };

  const handleBookingCreated = (bookingId: number) => {
    onBookingCreated(bookingId);
    handleClose();
  };

  if (!isOpen) return null;

  // Check if user is trying to book themselves
  const isSelfBooking = user?.id === companion.id;

  return (
    <div className="fixed inset-0 z-[60]">
      {/* Backdrop with blur effect */}
      <div
        className={`fixed inset-0 bg-black/30 backdrop-blur-md transition-all duration-200 ${
          isClosing ? 'opacity-0' : 'opacity-100'
        }`}
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="flex h-full items-center justify-center p-4">
        <div
          className={`relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[95vh] overflow-y-auto transition-all duration-200 ${
            isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
          }`}
        >
          {/* Header */}
          <div className="bg-white border-b border-gray-200 px-6 py-4 rounded-t-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-r from-[#312E81] to-[#FFCCCB] flex items-center justify-center">
                  {companion.imageUrl ? (
                    <img 
                      src={companion.imageUrl} 
                      alt={companion.name}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <FaUser className="text-white text-xl" />
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{companion.name}</h2>
                  <p className="text-sm text-gray-500">Book this companion</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <FaTimes className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {isSelfBooking ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 bg-warning-100 rounded-full flex items-center justify-center">
                  <FaExclamationTriangle className="w-8 h-8 text-warning-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Cannot Book Yourself
                </h3>
                <p className="text-gray-600 mb-6">
                  You cannot book yourself as a companion. Please select a different companion to book.
                </p>
                <button
                  onClick={handleClose}
                  className="px-6 py-2 bg-[#312E81] text-white rounded-lg hover:bg-[#1E1B4B] hover:shadow-[0_0_15px_rgba(255,204,203,0.3)] transition-all"
                >
                  Close
                </button>
              </div>
            ) : (
              <BookingForm
                companionId={companion.id}
                companionName={companion.name}
                onBookingCreated={handleBookingCreated}
                onCancel={handleClose}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuickBookingModal;

