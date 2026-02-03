/**
 * Companion Application Page
 * Verification form for companions to complete their profile
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { FaUpload } from 'react-icons/fa';
import axios from 'axios';
import { ROUTES, API_CONFIG } from '../../constants';
import { useAuth } from '../../hooks/useAuth';
import { authApi } from '../../api/auth';
import InterestSelector from '../../components/common/InterestSelector';
import ServicesSelector from '../../components/companion/ServicesSelector';
import LanguageSelector from '../../components/companion/LanguageSelector';
import PhoneNumberInput from '../../components/common/PhoneNumberInput';

interface ApplicationFormData {
  profilePhoto: File | null;
  dateOfBirth: string;
  gender: string;
  phoneNumber: string;
  backgroundCheckConsent: boolean;
  interests: string[];
  bio: string;
  services: string[];
  languages: string[];
  hourlyRate: number;
}

const CompanionApplication = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingApplication, setIsCheckingApplication] = useState(true);
  const [hasSubmittedSuccessfully, setHasSubmittedSuccessfully] = useState(false);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string>('');
  
  const [formData, setFormData] = useState<ApplicationFormData>({
    profilePhoto: null,
    dateOfBirth: '',
    gender: '',
    phoneNumber: '',
    backgroundCheckConsent: false,
    interests: [],
    bio: '',
    services: [],
    languages: ['English'], // English as default
    hourlyRate: 25
  });

  // Check if user has already submitted an application (only run once on mount)
  useEffect(() => {
    let isMounted = true;

    const checkExistingApplication = async () => {
      // Don't check if we just submitted successfully
      if (hasSubmittedSuccessfully) {
        return;
      }

      try {
        // ProtectedRoute ensures we're authenticated before rendering
        // Check if they already have an application
        const hasApplication = await authApi.checkCompanionApplication();
        
        if (hasApplication && isMounted) {
          console.log('✅ Application already exists, redirecting to dashboard');
          toast('You have already submitted an application', {
            icon: 'ℹ️',
          });
          navigate(ROUTES.COMPANION_DASHBOARD, { replace: true });
        } else if (isMounted) {
          console.log('📝 No application found, user can submit');
          setIsCheckingApplication(false);
        }
      } catch (error) {
        if (isMounted) {
          console.log('📝 No application found (or error checking), allowing submission');
          setIsCheckingApplication(false);
        }
      }
    };

    checkExistingApplication();
    
    return () => {
      isMounted = false;
    };
  }, [navigate, hasSubmittedSuccessfully]);

  // Handle profile photo upload
  const handleProfilePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const maxSize = 5 * 1024 * 1024; // 5MB limit
      if (file.size > maxSize) {
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
        toast.error(`Photo is too large (${fileSizeMB}MB). Maximum size is 5MB. Please compress or resize your image.`);
        return;
      }
      setFormData({ ...formData, profilePhoto: file });
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };


  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.profilePhoto) {
      toast.error('Please upload a profile photo');
      return;
    }
    if (!formData.dateOfBirth) {
      toast.error('Please enter your date of birth');
      return;
    }
    if (!formData.gender) {
      toast.error('Please select your gender');
      return;
    }
    
    // Interests validation
    if (formData.interests.length === 0) {
      toast.error('Please select at least one interest');
      return;
    }
    
    // Services validation
    if (formData.services.length === 0) {
      toast.error('Please select at least one service you offer');
      return;
    }
    
    // Languages validation
    if (formData.languages.length === 0) {
      toast.error('Please select at least one language');
      return;
    }
    
    // Hourly rate validation - just ensure it's a positive number
    if (!formData.hourlyRate || formData.hourlyRate <= 0) {
      toast.error('Please enter a valid hourly rate');
      return;
    }
    
    if (!formData.backgroundCheckConsent) {
      toast.error('Please consent to the background check');
      return;
    }

    setIsSubmitting(true);

    try {
      // Create FormData to handle file uploads
      const formDataToSend = new FormData();
      
      // Add files
      if (formData.profilePhoto) {
        formDataToSend.append('profilePhoto', formData.profilePhoto);
        console.log('📸 Profile photo added:', formData.profilePhoto.name);
      }
      
      // Add other fields
      formDataToSend.append('dateOfBirth', formData.dateOfBirth);
      formDataToSend.append('gender', formData.gender);
      if (formData.phoneNumber) {
        formDataToSend.append('phoneNumber', formData.phoneNumber);
      }
      formDataToSend.append('backgroundCheckConsent', formData.backgroundCheckConsent.toString());

      // Add interests and bio
      if (formData.interests.length > 0) {
        formDataToSend.append('interests', JSON.stringify(formData.interests));
      }
      if (formData.bio) {
        formDataToSend.append('bio', formData.bio);
      }

      // Add new fields
      formDataToSend.append('servicesOffered', JSON.stringify(formData.services));
      formDataToSend.append('languages', JSON.stringify(formData.languages));
      formDataToSend.append('hourlyRate', formData.hourlyRate.toString());

      // Log what we're sending for debugging
      console.log('📤 Submitting companion application with data:', {
        dateOfBirth: formData.dateOfBirth,
        backgroundCheckConsent: formData.backgroundCheckConsent,
        hasProfilePhoto: !!formData.profilePhoto,
        profilePhotoName: formData.profilePhoto?.name
      });
      
      // Submit application with files
      const response = await axios.post(
        `${API_CONFIG.BASE_URL}/companion/application`,
        formDataToSend,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          withCredentials: true,
        }
      );

      console.log('✅ Application submitted successfully!', response.data);

      // Mark as submitted to prevent useEffect from interfering
      setHasSubmittedSuccessfully(true);

      // Show success message
      toast.success('Profile submitted');

      // Navigate to companion dashboard to show pending status
      console.log('🔄 Navigating to companion dashboard to show pending status...');
      setTimeout(() => {
        window.location.href = ROUTES.COMPANION_DASHBOARD;
      }, 1500);
      
    } catch (error: any) {
      console.error('❌ Application submission error:', error);

      // Handle specific HTTP status codes with user-friendly messages
      const status = error.response?.status;
      let errorMessage = 'Failed to submit application';

      if (status === 413) {
        // Payload too large - file size exceeded server limit
        errorMessage = 'Your photo is too large to upload. Please use an image under 5MB and try again.';
      } else if (status === 415) {
        // Unsupported media type
        errorMessage = 'Invalid file type. Please upload a JPG, PNG, or WebP image.';
      } else if (status === 400) {
        // Bad request - validation error
        errorMessage = error.response?.data?.message || 'Please check your form inputs and try again.';
      } else if (status === 401) {
        errorMessage = 'Your session has expired. Please sign in again.';
      } else if (status === 500) {
        errorMessage = 'Server error. Please try again in a few moments.';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.code === 'ERR_NETWORK') {
        errorMessage = 'Network error. Please check your internet connection.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast.error(errorMessage, { duration: 5000 });

      // Log detailed error for debugging
      if (error.response) {
        console.error('📋 Full Error Response:', {
          status: error.response.status,
          message: error.response.data?.message,
          fullData: error.response.data,
          headers: error.response.headers,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading state while checking for existing application
  if (isCheckingApplication) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f9f8ff] to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#312E81] mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Checking application status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f9f8ff] to-blue-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-[#312E81] to-[#312E81] bg-clip-text text-transparent mb-4">
            Build Your Profile
          </h1>
          <p className="text-gray-600">
            Showcase your services and personality to attract clients
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-8">

            {/* Date of Birth */}
            <div>
              <label htmlFor="dateOfBirth" className="block text-sm font-semibold text-gray-900 mb-3">
                Date of Birth <span className="text-red-500">*</span>
              </label>
              <input
                id="dateOfBirth"
                type="date"
                value={formData.dateOfBirth}
                onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
                className="w-full px-4 py-3 border-2 border-[#d5d3f7] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#a5a3e8] focus:border-transparent transition-[colors,border-color,box-shadow] duration-200"
                required
              />
              <p className="text-xs text-gray-500 mt-2">You must be at least 18 years old</p>
            </div>

            {/* Gender */}
            <div>
              <label htmlFor="gender" className="block text-sm font-semibold text-gray-900 mb-3">
                Gender <span className="text-red-500">*</span>
              </label>
              <select
                id="gender"
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                className="w-full px-4 py-3 border-2 border-[#d5d3f7] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#a5a3e8] focus:border-transparent transition-[colors,border-color,box-shadow] duration-200"
                required
              >
                <option value="">Select your gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>

            {/* Phone Number with Country Code */}
            <div>
              <PhoneNumberInput
                value={formData.phoneNumber}
                onChange={(fullNumber, countryCode, phoneNumber) => {
                  setFormData({ ...formData, phoneNumber: fullNumber });
                }}
                required={false}
                label="Phone Number"
                placeholder="Enter your phone number"
              />
            </div>

            {/* Interests */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-3">
                Interests <span className="text-red-500">*</span>
              </label>
              <div className="overflow-hidden">
                <InterestSelector
                  selectedInterests={formData.interests}
                  onInterestsChange={(interests) => setFormData({ ...formData, interests })}
                  maxSelections={8}
                  className="border-2 border-[#d5d3f7] rounded-xl p-4"
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">Select activities you enjoy to help clients find you</p>
            </div>

            {/* Languages */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-3">
                Languages Spoken <span className="text-red-500">*</span>
              </label>
              <LanguageSelector
                selectedLanguages={formData.languages}
                onLanguagesChange={(languages) => setFormData({ ...formData, languages })}
                maxSelections={5}
              />
            </div>

            {/* Services Offered */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-3">
                Services Offered <span className="text-red-500">*</span>
              </label>
              <ServicesSelector
                selectedServices={formData.services}
                onServicesChange={(services) => setFormData({ ...formData, services })}
              />
            </div>

            {/* Hourly Rate */}
            <div>
              <label htmlFor="hourlyRate" className="block text-sm font-semibold text-gray-900 mb-3">
                Base Hourly Rate (USD) <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-gray-700">$</span>
                <input
                  id="hourlyRate"
                  type="number"
                  min="1"
                  placeholder="25"
                  value={formData.hourlyRate || ''}
                  onChange={(e) => setFormData({ ...formData, hourlyRate: Number(e.target.value) || 0 })}
                  className="flex-1 px-4 py-3 border-2 border-[#d5d3f7] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#a5a3e8] focus:border-transparent transition-[colors,border-color,box-shadow] duration-200 text-lg font-semibold"
                  required
                />
                <span className="text-gray-600 whitespace-nowrap">per hour</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">You can negotiate different rates for specific bookings</p>
            </div>

            {/* Bio */}
            <div>
              <label htmlFor="bio" className="block text-sm font-semibold text-gray-900 mb-3">
                Bio
              </label>
              <textarea
                id="bio"
                placeholder="Tell us about yourself, your interests, and what makes you a great companion..."
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                rows={4}
                className="w-full px-4 py-3 border-2 border-[#d5d3f7] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#a5a3e8] focus:border-transparent transition-[colors,border-color,box-shadow] duration-200 resize-none"
              />
              <p className="text-xs text-gray-500 mt-2">Tell potential clients about yourself</p>
            </div>

            {/* Profile Photo Upload */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-3">
                Profile Photo <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-col items-center gap-4">
                {/* Circular Profile Preview */}
                <div className="relative">
                  <div className="w-40 h-40 rounded-full overflow-hidden bg-gradient-to-br from-[#4A47A3] to-[#6B68B8] flex items-center justify-center shadow-lg border-4 border-white ring-2 ring-[#d5d3f7]">
                    {profilePhotoPreview ? (
                      <img 
                        src={profilePhotoPreview} 
                        alt="Profile preview" 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <FaUpload className="w-12 h-12 text-white opacity-50" />
                    )}
                  </div>
                  {profilePhotoPreview && (
                    <button
                      type="button"
                      onClick={() => {
                        setProfilePhotoPreview('');
                        setFormData({ ...formData, profilePhoto: null });
                      }}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-600 transition-colors shadow-md"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Upload Button */}
                <label className="cursor-pointer">
                  <div className="px-6 py-3 bg-[#4A47A3] text-white rounded-lg font-medium hover:bg-[#312E81] transition-colors flex items-center gap-2">
                    <FaUpload className="w-4 h-4" />
                    {profilePhotoPreview ? 'Change Photo' : 'Upload Photo'}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleProfilePhotoChange}
                    className="hidden"
                  />
                </label>
                <p className="text-xs text-gray-500 text-center">PNG, JPG up to 5MB<br/>Upload a clear photo of yourself</p>
              </div>
            </div>

            {/* Consent Checkboxes */}
            <div className="space-y-4 pt-4">
              <div className="flex items-start">
                <input
                  id="backgroundCheck"
                  type="checkbox"
                  checked={formData.backgroundCheckConsent}
                  onChange={(e) => setFormData({ ...formData, backgroundCheckConsent: e.target.checked })}
                  className="w-5 h-5 text-[#312E81] border-2 border-gray-300 rounded focus:ring-[#312E81] focus:ring-2 mt-0.5"
                  required
                />
                <label htmlFor="backgroundCheck" className="ml-3 text-sm text-gray-700">
                  I consent to a background check being performed as part of the verification process{' '}
                  <span className="text-red-500">*</span>
                </label>
              </div>

            </div>

            {/* Submit Button */}
            <div className="pt-6">
              <button
                type="submit"
                disabled={isSubmitting || hasSubmittedSuccessfully}
                className={`w-full bg-gradient-to-r from-[#312E81] to-[#312E81] text-white py-4 px-8 rounded-xl font-semibold text-lg hover:from-[#312E81] hover:to-[#312E81] transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-1 ${
                  isSubmitting || hasSubmittedSuccessfully ? 'opacity-75 cursor-not-allowed' : ''
                }`}
              >
                {hasSubmittedSuccessfully 
                  ? '✓ Submitted! Redirecting...' 
                  : isSubmitting 
                  ? 'Submitting Application...' 
                  : 'Submit Application'}
              </button>
            </div>
          </form>
        </div>

        {/* Info Note */}
        <div className="mt-8 bg-[#f9f8ff] border border-[#d5d3f7] rounded-xl p-6">
          <h3 className="text-lg font-semibold text-[#1E1B4B] mb-2">📋 What happens next?</h3>
          <ul className="space-y-2 text-sm text-[#1E1B4B]">
            <li>• Complete identity verification via Veriff (takes 5-10 minutes)</li>
            <li>• Get instantly approved after successful verification</li>
            <li>• All information is encrypted and kept confidential</li>
            <li>• Start accepting bookings immediately after verification</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default CompanionApplication;
