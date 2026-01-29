/**
 * Identity Verification Modal
 * Popup modal for clients to verify their identity
 */

import { useState, useRef, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { FaIdCard, FaShieldAlt, FaTimes, FaUpload, FaMapMarkerAlt, FaExclamationTriangle } from 'react-icons/fa';
import axios from 'axios';
import { API_CONFIG } from '../constants';
import clientApi from '../api/client';
import { useModalRegistration } from '../context/ModalContext';

interface VerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const VerificationModal = ({ isOpen, onClose, onSuccess }: VerificationModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [idDocumentFile, setIdDocumentFile] = useState<File | null>(null);
  const [idDocumentPreview, setIdDocumentPreview] = useState<string>('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [governmentIdNumber, setGovernmentIdNumber] = useState('');
  const [hasCompleteAddress, setHasCompleteAddress] = useState(false);
  const [isCheckingAddress, setIsCheckingAddress] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Register modal with ModalContext to hide header/footer and prevent scrolling (handles scroll prevention automatically)
  useModalRegistration('verification-modal', isOpen);

  // Check if user has complete address when modal opens
  useEffect(() => {
    const checkAddress = async () => {
      if (isOpen) {
        setIsCheckingAddress(true);
        try {
          const profile = await clientApi.getProfile();
          const verification = profile.verification;

          const missing = [];
          if (!verification?.city) missing.push('City');
          if (!verification?.country) missing.push('Country');
          if (!verification?.postalCode) missing.push('Postal Code');

          setMissingFields(missing);
          setHasCompleteAddress(missing.length === 0);

          if (missing.length > 0) {
            console.log('Missing address fields:', missing);
          }
        } catch (error) {
          console.error('Error checking address:', error);
          setHasCompleteAddress(false);
        } finally {
          setIsCheckingAddress(false);
        }
      }
    };

    checkAddress();
  }, [isOpen]);

  const handleIdDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error('Document must be less than 10MB');
        return;
      }

      setIdDocumentFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setIdDocumentPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      toast.success('ID document selected!');
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit = async () => {
    // First check if address is complete
    if (!hasCompleteAddress) {
      toast.error('Please complete your address information first');
      return;
    }

    if (!idDocumentFile) {
      toast.error('Please select an ID document');
      return;
    }

    if (!dateOfBirth) {
      toast.error('Please enter your date of birth');
      return;
    }

    if (!governmentIdNumber.trim()) {
      toast.error('Please enter your government ID number');
      return;
    }

    try {
      setIsSubmitting(true);

      const formData = new FormData();
      formData.append('idDocument', idDocumentFile);
      formData.append('dateOfBirth', dateOfBirth);
      formData.append('governmentIdNumber', governmentIdNumber);

      await axios.post(`${API_CONFIG.BASE_URL}/client/verify-identity`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        withCredentials: true,
      });

      // Success notification is handled by the parent component
      onSuccess();
      onClose();
      
      // Reset form
      setIdDocumentFile(null);
      setIdDocumentPreview('');
      setDateOfBirth('');
      setGovernmentIdNumber('');
      
    } catch (error: any) {
      console.error('❌ Error submitting verification:', error);
      toast.error(error.response?.data?.message || 'Failed to submit verification');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-gray-900/20 backdrop-blur-md flex items-center justify-center z-[100] p-4 transition-all duration-300"
      onClick={(e) => {
        // Close modal when clicking on the backdrop
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto relative z-[101]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#312E81] to-[#312E81] rounded-full flex items-center justify-center">
              <FaShieldAlt className="text-white text-lg" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Verify Your Identity</h2>
              <p className="text-sm text-gray-500">Required for booking companions</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <FaTimes className="text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Info Box */}
          <div className="bg-[#f9f8ff] border border-[#d5d3f7] rounded-lg p-4">
            <div className="flex items-start gap-3">
              <FaShieldAlt className="text-[#312E81] text-lg flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-[#1E1B4B] mb-2">Why Verification is Required</h3>
                <p className="text-sm text-[#1E1B4B] mb-2">
                  To ensure the safety and trust of our community, all clients must:
                </p>
                <ul className="text-sm text-[#1E1B4B] space-y-1 ml-4 list-disc">
                  <li>Provide complete address information in your profile</li>
                  <li>Verify your identity with a government-issued ID</li>
                  <li>Be approved by our admin team (within 24 hours)</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Address Requirement Notice */}
          {isCheckingAddress ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="animate-spin h-5 w-5 border-2 border-[#312E81] border-t-transparent rounded-full"></div>
                <p className="text-sm text-gray-600">Checking your profile information...</p>
              </div>
            </div>
          ) : !hasCompleteAddress ? (
            <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <FaExclamationTriangle className="text-red-600 text-xl flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-bold text-red-900 mb-2">Address Required - Action Needed!</h3>
                  <p className="text-sm text-red-700 mb-2">
                    You must complete your address information before submitting verification.
                  </p>
                  {missingFields.length > 0 && (
                    <div className="bg-white/50 rounded p-2 mb-3">
                      <p className="text-xs text-red-800 font-semibold mb-1">Missing fields:</p>
                      <ul className="text-xs text-red-700 list-disc list-inside">
                        {missingFields.map((field) => (
                          <li key={field}>{field}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <button
                    onClick={() => window.location.href = '/client-profile'}
                    className="w-full mt-2 px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <FaMapMarkerAlt />
                    Go to Profile Settings
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs">✓</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-green-700 font-medium">Address information complete!</p>
                  <p className="text-xs text-green-600 mt-0.5">You can now submit your verification.</p>
                </div>
              </div>
            </div>
          )}

          {/* Date of Birth */}
          <div className={!hasCompleteAddress ? 'opacity-50 pointer-events-none' : ''}>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date of Birth *
            </label>
            <input
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#312E81] focus:border-transparent"
              required
              disabled={!hasCompleteAddress}
            />
          </div>

          {/* Government ID Number */}
          <div className={!hasCompleteAddress ? 'opacity-50 pointer-events-none' : ''}>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Government ID Number *
            </label>
            <input
              type="text"
              value={governmentIdNumber}
              onChange={(e) => setGovernmentIdNumber(e.target.value)}
              placeholder="Enter your ID number"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#312E81] focus:border-transparent"
              required
              disabled={!hasCompleteAddress}
            />
          </div>

          {/* ID Document Upload */}
          <div className={!hasCompleteAddress ? 'opacity-50 pointer-events-none' : ''}>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ID Document *
            </label>
            <div
              onClick={hasCompleteAddress ? triggerFileInput : undefined}
              className={`border-2 border-dashed border-gray-300 rounded-lg p-6 text-center transition-all ${hasCompleteAddress ? 'cursor-pointer hover:border-[#312E81] hover:bg-[#f9f8ff]' : 'cursor-not-allowed'}`}
            >
              {idDocumentPreview ? (
                <div className="space-y-3">
                  <img
                    src={idDocumentPreview}
                    alt="ID Document"
                    className="max-h-32 mx-auto rounded-lg"
                  />
                  <p className="text-sm text-green-600 font-medium">
                    ✓ Document selected
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <FaUpload className="mx-auto text-3xl text-gray-400" />
                  <p className="text-sm text-gray-600">
                    Click to upload your ID document
                  </p>
                  <p className="text-xs text-gray-500">
                    PNG, JPG, or PDF (max. 10MB)
                  </p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              onChange={handleIdDocumentChange}
              className="hidden"
            />
          </div>

          {/* Security Notice */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs">🔒</span>
              </div>
              <p className="text-sm text-green-700">
                Your information is secure and encrypted. We'll review within 24 hours.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || isCheckingAddress || !hasCompleteAddress || !idDocumentFile || !dateOfBirth || !governmentIdNumber}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-[#312E81] to-[#312E81] text-white font-semibold rounded-lg hover:from-[#312E81] hover:to-[#312E81] transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {!hasCompleteAddress ? (
              <>
                <FaExclamationTriangle />
                Complete Address First
              </>
            ) : (
              <>
                <FaShieldAlt />
                {isSubmitting ? 'Submitting...' : 'Submit Verification'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VerificationModal;
