import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import {
  FaExclamationTriangle,
  FaMoneyBillWave,
  FaUndo,
  FaCheckCircle,
  FaCalendar,
  FaClock,
  FaUser,
  FaMapMarkerAlt,
  FaSpinner
} from 'react-icons/fa';
import { API_CONFIG } from '../../constants';
import logger from '../../utils/logger';

interface DisputedBooking {
  id: number;
  bookingDate: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  totalAmount: number;
  platformFeeAmount: number;
  paymentStatus: string;
  paymentIntentId: string;
  bookingStatus: string;
  otpVerifiedAt: string | null;
  createdAt: string;
  meetingLocation: string;
  specialRequests: string;
  clientId: number;
  clientName: string;
  clientEmail: string;
  companionId: number;
  companionName: string;
  companionEmail: string;
  companionStripeAccountId: string | null;
  serviceCategoryName: string;
}

interface DisputeResolutionModalProps {
  booking: DisputedBooking;
  action: 'refund' | 'capture';
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isProcessing: boolean;
}

const DisputeResolutionModal = ({ booking, action, onClose, onConfirm, isProcessing }: DisputeResolutionModalProps) => {
  const [reason, setReason] = useState('');

  const handleSubmit = () => {
    if (!reason.trim()) {
      toast.error('Please provide a reason for this action');
      return;
    }
    onConfirm(reason);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
        <h3 className="text-xl font-bold mb-4">
          {action === 'refund' ? '💰 Issue Full Refund' : '✅ Capture Payment & Pay Companion'}
        </h3>

        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">Booking Details:</p>
          <p className="text-sm text-gray-600">Client: {booking.clientName}</p>
          <p className="text-sm text-gray-600">Companion: {booking.companionName}</p>
          <p className="text-sm text-gray-600">Date: {booking.bookingDate}</p>
          <p className="text-sm text-gray-600">Amount: ${booking.totalAmount.toFixed(2)}</p>
        </div>

        {action === 'refund' ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-blue-800">
              ✅ Client will receive a <strong>full refund</strong> of ${booking.totalAmount.toFixed(2)}
            </p>
            <p className="text-sm text-blue-700 mt-1">
              Companion will not receive any payment.
            </p>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-green-800">
              ✅ Client will be <strong>charged</strong> ${booking.totalAmount.toFixed(2)}
            </p>
            <p className="text-sm text-green-700 mt-1">
              Companion will receive ${(booking.totalAmount * 0.9).toFixed(2)} (90%)
            </p>
            <p className="text-sm text-green-700">
              Platform keeps ${(booking.totalAmount * 0.1).toFixed(2)} (10%)
            </p>
          </div>
        )}

        <label className="block mb-4">
          <span className="text-sm font-semibold text-gray-700 mb-2 block">
            Reason / Notes: <span className="text-red-500">*</span>
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why you're taking this action (e.g., 'Client reported no-show', 'Both parties confirmed meeting occurred')"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows={4}
            disabled={isProcessing}
          />
        </label>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="flex-1 px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isProcessing}
            className={`flex-1 px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
              action === 'refund'
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {isProcessing ? (
              <>
                <FaSpinner className="animate-spin" />
                Processing...
              </>
            ) : (
              action === 'refund' ? 'Issue Refund' : 'Capture & Pay'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

const DisputedBookings = () => {
  const [disputes, setDisputes] = useState<DisputedBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'unresolved' | 'resolved'>('unresolved');
  const [selectedBooking, setSelectedBooking] = useState<DisputedBooking | null>(null);
  const [modalAction, setModalAction] = useState<'refund' | 'capture' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchDisputes = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(`${API_CONFIG.BASE_URL}/admin/disputes`, {
        params: { status: filterStatus },
        withCredentials: true
      });

      logger.info('Fetched disputed bookings', { count: response.data.data.disputes.length });
      setDisputes(response.data.data.disputes);
    } catch (error: any) {
      logger.error('Failed to fetch disputed bookings', { error: error.message });
      toast.error('Failed to load disputed bookings');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDisputes();
  }, [filterStatus]);

  const handleAction = async (action: 'refund' | 'capture', booking: DisputedBooking) => {
    setSelectedBooking(booking);
    setModalAction(action);
  };

  const handleConfirmAction = async (reason: string) => {
    if (!selectedBooking || !modalAction) return;

    setIsProcessing(true);
    try {
      const endpoint = modalAction === 'refund' 
        ? `/admin/disputes/${selectedBooking.id}/refund`
        : `/admin/disputes/${selectedBooking.id}/capture`;

      await axios.post(
        `${API_CONFIG.BASE_URL}${endpoint}`,
        { reason },
        { withCredentials: true }
      );

      toast.success(
        modalAction === 'refund'
          ? 'Refund issued successfully'
          : 'Payment captured and transferred successfully'
      );

      logger.info('Admin resolved dispute', {
        bookingId: selectedBooking.id,
        action: modalAction,
        reason
      });

      // Refresh list
      fetchDisputes();

      // Close modal
      setSelectedBooking(null);
      setModalAction(null);
    } catch (error: any) {
      logger.error('Failed to resolve dispute', { error: error.message });
      toast.error(error.response?.data?.message || 'Failed to process action');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (timeStr: string) => {
    return new Date(`2000-01-01T${timeStr}`).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <FaSpinner className="text-4xl text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Payment Disputes</h2>
          <p className="text-sm text-gray-600 mt-1">
            Bookings completed without OTP verification
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setFilterStatus('unresolved')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filterStatus === 'unresolved'
                ? 'bg-red-100 text-red-700 border-2 border-red-300'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Unresolved
          </button>
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filterStatus === 'all'
                ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterStatus('resolved')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filterStatus === 'resolved'
                ? 'bg-green-100 text-green-700 border-2 border-green-300'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Resolved
          </button>
        </div>
      </div>

      {/* Disputes List */}
      {disputes.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <FaCheckCircle className="text-5xl text-green-500 mx-auto mb-4" />
          <p className="text-lg font-semibold text-gray-700">No Disputed Bookings</p>
          <p className="text-sm text-gray-500 mt-1">
            {filterStatus === 'unresolved'
              ? 'All disputes have been resolved!'
              : 'No disputes found for this filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {disputes.map((booking) => (
            <div
              key={booking.id}
              className="bg-white border-2 border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                    <FaExclamationTriangle className="text-2xl text-red-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">
                      Booking #{booking.id}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {booking.serviceCategoryName}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900">
                    ${booking.totalAmount.toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-500">Payment On Hold</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Client</p>
                  <div className="flex items-center gap-2">
                    <FaUser className="text-gray-400" />
                    <div>
                      <p className="font-semibold text-sm">{booking.clientName}</p>
                      <p className="text-xs text-gray-500">{booking.clientEmail}</p>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Companion</p>
                  <div className="flex items-center gap-2">
                    <FaUser className="text-gray-400" />
                    <div>
                      <p className="font-semibold text-sm">{booking.companionName}</p>
                      <p className="text-xs text-gray-500">{booking.companionEmail}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 mb-4 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <FaCalendar />
                  <span>{formatDate(booking.bookingDate)}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <FaClock />
                  <span>{formatTime(booking.startTime)} - {formatTime(booking.endTime)}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <FaMapMarkerAlt />
                  <span>{booking.meetingLocation}</span>
                </div>
              </div>

              {booking.specialRequests && (
                <div className="bg-gray-50 rounded-lg p-3 mb-4">
                  <p className="text-xs font-semibold text-gray-700 mb-1">Special Requests:</p>
                  <p className="text-sm text-gray-600">{booking.specialRequests}</p>
                </div>
              )}

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-yellow-800">
                  ⚠️ <strong>No OTP verification received.</strong> Meeting may not have occurred or users forgot to verify.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handleAction('refund', booking)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  <FaUndo />
                  Issue Full Refund
                </button>
                <button
                  onClick={() => handleAction('capture', booking)}
                  disabled={!booking.companionStripeAccountId}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  title={!booking.companionStripeAccountId ? 'Companion has no payout account' : ''}
                >
                  <FaMoneyBillWave />
                  Charge & Pay Companion
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Resolution Modal */}
      {selectedBooking && modalAction && (
        <DisputeResolutionModal
          booking={selectedBooking}
          action={modalAction}
          onClose={() => {
            setSelectedBooking(null);
            setModalAction(null);
          }}
          onConfirm={handleConfirmAction}
          isProcessing={isProcessing}
        />
      )}
    </div>
  );
};

export default DisputedBookings;

