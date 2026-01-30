import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import toast from 'react-hot-toast';
import {
  FaUser,
  FaMapMarkerAlt,
  FaCamera,
  FaUpload,
  FaSave,
  FaShieldAlt,
  FaCheck,
  FaExclamationTriangle,
  FaIdCard,
  FaEnvelope,
  FaHeart,
  FaGlobe,
  FaBriefcase,
  FaPhone,
  FaCog,
  FaTrashAlt,
  FaTimes,
  FaSpinner
} from 'react-icons/fa';
import { useModalRegistration } from '../../context/ModalContext';
import axios from 'axios';
import { companionsApi } from '../../api/companions';
import { checkCompanionProfileCompletion, getCompanionProfileCompletionPercentage } from '../../utils/profileHelpers';
import { API_CONFIG, ROUTES } from '../../constants';
import { countryPhoneCodes } from '../../data/countryPhoneCodes';
import { getStatesForCountry } from '../../data/locationData';
import InterestSelector from '../../components/common/InterestSelector';
import ServicesSelector from '../../components/companion/ServicesSelector';
import LanguageSelector from '../../components/companion/LanguageSelector';
import PhoneNumberInput from '../../components/common/PhoneNumberInput';
import { getImageUrl } from '../../utils/imageHelpers';

interface CompanionProfileData {
  fullName: string;
  email: string;
  phoneNumber: string;
  gender: string;
  bio: string;
  hourlyRate: number;
  // Address fields
  addressLine: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  userTimezone?: string;
  // Photos
  profilePhotoUrl: string;
  additionalPhoto1Url: string;
  additionalPhoto2Url: string;
  // Verification
  verificationStatus: 'not_started' | 'pending' | 'approved' | 'rejected';
  veriffSessionId: string;
  // Profile data
  interests: string[];
  services: string[];
  languages: string[];
}

interface DeleteProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}

const CompanionProfile = () => {
  const { user, signOut, checkAuth } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Profile data state
  const [profileData, setProfileData] = useState<CompanionProfileData>({
    fullName: user?.name || '',
    email: user?.email || '',
    phoneNumber: '',
    gender: '',
    bio: '',
    hourlyRate: 25,
    addressLine: '',
    city: '',
    state: '',
    country: '',
    postalCode: '',
    profilePhotoUrl: '',
    additionalPhoto1Url: '',
    additionalPhoto2Url: '',
    verificationStatus: 'not_started',
    veriffSessionId: '',
    interests: [],
    services: [],
    languages: ['English']
  });

  // UI states
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showSuccessBanner, setShowSuccessBanner] = useState(true);
  const [showContactSection, setShowContactSection] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Photo upload states
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState('');
  const [additionalPhoto1File, setAdditionalPhoto1File] = useState<File | null>(null);
  const [additionalPhoto1Preview, setAdditionalPhoto1Preview] = useState('');
  const [additionalPhoto2File, setAdditionalPhoto2File] = useState<File | null>(null);
  const [additionalPhoto2Preview, setAdditionalPhoto2Preview] = useState('');

  // File input refs
  const profilePhotoInputRef = useRef<HTMLInputElement>(null);
  const additionalPhoto1InputRef = useRef<HTMLInputElement>(null);
  const additionalPhoto2InputRef = useRef<HTMLInputElement>(null);
  const multiplePhotosInputRef = useRef<HTMLInputElement>(null);

  // Country/State management
  const [availableStates, setAvailableStates] = useState<any[]>([]);

  // Calculate completion status (recalculates whenever profileData changes)
  const completionStatus = React.useMemo(() => {
    const status = checkCompanionProfileCompletion({
      addressLine: profileData.addressLine,
      city: profileData.city,
      state: profileData.state,
      country: profileData.country,
      postalCode: profileData.postalCode,
      profilePhotoUrl: profileData.profilePhotoUrl,
      additionalPhoto1Url: profileData.additionalPhoto1Url || additionalPhoto1Preview,
      additionalPhoto2Url: profileData.additionalPhoto2Url || additionalPhoto2Preview,
      verificationStatus: profileData.verificationStatus
    });
    
    console.log('🔄 Completion Status Updated:', {
      completedSteps: status.completedSteps,
      totalSteps: status.totalSteps,
      isComplete: status.isComplete,
      hasAddress: status.hasAddress,
      hasAllPhotos: status.hasAllPhotos,
      hasVerification: status.hasVerification,
      verificationStatus: profileData.verificationStatus
    });
    
    return status;
  }, [
    profileData.addressLine,
    profileData.city,
    profileData.state,
    profileData.country,
    profileData.postalCode,
    profileData.profilePhotoUrl,
    profileData.additionalPhoto1Url,
    profileData.additionalPhoto2Url,
    profileData.verificationStatus,
    additionalPhoto1Preview,
    additionalPhoto2Preview
  ]);

  const completionPercentage = React.useMemo(() => {
    return getCompanionProfileCompletionPercentage(completionStatus);
  }, [completionStatus]);

  // Load profile data
  useEffect(() => {
    const loadProfile = async () => {
      try {
        setIsLoading(true);
        const response = await companionsApi.getCompanionProfile();
        
        console.log('🔍 RAW API RESPONSE:', response);
        console.log('📦 Response Data:', response.data);
        console.log('📋 Application Object:', response.data.application);
        
        const application = response.data.application;

        // Parse JSON fields
        const parseJSON = (jsonString: string, defaultValue: any) => {
          try {
            return jsonString ? JSON.parse(jsonString) : defaultValue;
        } catch (e) {
            return defaultValue;
          }
        };

        console.log('📸 Profile photo data:', {
          profilePhotoUrl: application?.profilePhotoUrl,
          additionalPhoto1Url: application?.additionalPhoto1Url,
          additionalPhoto2Url: application?.additionalPhoto2Url
        });
        
        console.log('📍 Address data:', {
          addressLine: application?.addressLine,
          city: application?.city,
          state: application?.state,
          country: application?.country,
          postalCode: application?.postalCode
        });
        
        console.log('✅ Verification data:', {
          verificationStatus: application?.verificationStatus
        });

        // Load states FIRST if country is selected (before setting profileData)
        if (application.country) {
          const country = countryPhoneCodes.find(c => c.name === application.country);
          if (country) {
            const states = getStatesForCountry(country.code);
            setAvailableStates(states);
          }
        }

        // Then set profile data (this will preserve the state value)
        setProfileData({
          fullName: user?.name || '',
          email: user?.email || '',
          phoneNumber: application.phoneNumber || '',
          gender: application.gender || '',
          bio: application.bio || '',
          hourlyRate: application.hourlyRate || 25,
          addressLine: application.addressLine || '',
          city: application.city || '',
          state: application.state || '',
          country: application.country || '',
          postalCode: application.postalCode || '',
          userTimezone: application.userTimezone || 'UTC',
          profilePhotoUrl: application.profilePhotoUrl || '',
          additionalPhoto1Url: application.additionalPhoto1Url || '',
          additionalPhoto2Url: application.additionalPhoto2Url || '',
          verificationStatus: application.verificationStatus || 'not_started',
          veriffSessionId: application.veriffSessionId || '',
          interests: parseJSON(application.interests, []),
          services: parseJSON(application.servicesOffered, []),
          languages: parseJSON(application.languages, ['English'])
        });
      } catch (error: any) {
        console.error('Error loading profile:', error);
        toast.error('Failed to load profile data');
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, [user?.id]); // ✅ FIX: Only depend on user.id, not entire user object

  // Auto-hide success banner after 5 seconds
  useEffect(() => {
    if (completionStatus.isComplete && showSuccessBanner) {
      const timer = setTimeout(() => {
        setShowSuccessBanner(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [completionStatus.isComplete, showSuccessBanner]);

  // FIX 1: Handle Veriff callback URL when user returns from verification
  useEffect(() => {
    const verificationParam = searchParams.get('verification');
    
    if (verificationParam === 'complete') {
      console.log('🔵 Veriff callback detected - user returned from verification');
      
      // Show user-friendly message
      toast.success('Verification submitted! Checking status...', {
        duration: 3000,
        icon: '✅'
      });
      
      // Wait 2 seconds for webhook to process, then reload profile
      setTimeout(async () => {
        try {
          console.log('🔵 Reloading profile to get updated verification status...');
          const response = await companionsApi.getCompanionProfile();
          const application = response.data.application;
          
          // Update verification status in state
          setProfileData(prev => ({
            ...prev,
            verificationStatus: application.verificationStatus || 'pending'
          }));
          
          console.log('✅ Profile reloaded after Veriff callback:', {
            verificationStatus: application.verificationStatus
          });
          
          // Show appropriate message based on status
          if (application.verificationStatus === 'approved') {
            toast.success('Identity verified');
          } else if (application.verificationStatus === 'rejected') {
            toast.error('Verification failed. Contact support.');
          } else {
            toast('Verification in progress...');
          }
        } catch (error) {
          console.error('❌ Error reloading profile after Veriff:', error);
          toast.error('Please refresh the page to see your verification status');
        }
      }, 2000);
      
      // Clean up URL (remove ?verification=complete)
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete('verification');
      setSearchParams(newSearchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Refresh auth state on mount to ensure email verification status is current
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Handle email verification redirect - clean up URL param
  useEffect(() => {
    const verified = searchParams.get('verified');
    if (verified) {
      setSearchParams(prev => {
        const newParams = new URLSearchParams(prev);
        newParams.delete('verified');
        return newParams;
      }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // FIX 2: Poll verification status when pending (check every 5 seconds)
  // ✅ FIXED: Use ref to track verification status to avoid re-triggering useEffect
  const verificationStatusRef = useRef(profileData.verificationStatus);
  
  useEffect(() => {
    verificationStatusRef.current = profileData.verificationStatus;
  }, [profileData.verificationStatus]);
  
  useEffect(() => {
    if (verificationStatusRef.current === 'pending' && !isLoading) {
      console.log('🔵 Starting verification status polling (status is pending)');
      
      let pollCount = 0;
      const maxPolls = 60; // Stop after 10 minutes (60 * 10 seconds)
      let isActive = true; // Track if this effect is still active
      
      const pollInterval = setInterval(async () => {
        if (!isActive) {
          clearInterval(pollInterval);
          return;
        }
        
        pollCount++;
        console.log(`🔵 Polling verification status... (attempt ${pollCount}/${maxPolls})`);
        
        try {
          const response = await companionsApi.getCompanionProfile();
          const application = response.data.application;
          const newStatus = application.verificationStatus;
          
          console.log('🔵 Poll result:', { newStatus, oldStatus: verificationStatusRef.current });
          
          // If status changed from pending, update and stop polling
          if (newStatus !== 'pending') {
            console.log('✅ Verification status changed!', { from: 'pending', to: newStatus });
            
            setProfileData(prev => ({
              ...prev,
              verificationStatus: newStatus
            }));
            
            clearInterval(pollInterval);
            isActive = false;
            
            // Show success/error message
            if (newStatus === 'approved') {
              toast.success('Identity verified');
            } else if (newStatus === 'rejected') {
              toast.error('Verification failed. Contact support.');
            }
          }
          
          // Stop polling after max attempts
          if (pollCount >= maxPolls) {
            console.log('⚠️ Max poll attempts reached, stopping polling');
            clearInterval(pollInterval);
            isActive = false;
            toast('Verification is taking longer than expected. Please check back later or contact support.', {
              icon: '⏳',
              duration: 5000
            });
          }
        } catch (error) {
          console.error('❌ Error polling verification status:', error);
          // Don't clear interval on error - keep trying
        }
      }, 10000); // Poll every 10 seconds
      
      // Cleanup function
      return () => {
        console.log('🔵 Cleaning up verification polling');
        isActive = false;
        clearInterval(pollInterval);
      };
    }
  }, [isLoading]); // ✅ FIX: Only depend on isLoading, not verificationStatus

  // FIX 3: Handle abandoned verification (timeout after 30 minutes)
  useEffect(() => {
    if (verificationStatusRef.current === 'pending' && !isLoading) {
      console.log('🔵 Setting up abandoned verification timeout (30 minutes)');
      
      const abandonedTimeout = setTimeout(() => {
        console.log('⚠️ Verification has been pending for 30 minutes - showing restart prompt');
        
        toast('Verification is taking longer than expected. You can restart if needed.', {
          icon: '⚠️',
          duration: 8000
        });
      }, 30 * 60 * 1000); // 30 minutes
      
      return () => {
        console.log('🔵 Cleaning up abandoned verification timeout');
        clearTimeout(abandonedTimeout);
      };
    }
  }, [isLoading]); // ✅ FIX: Only depend on isLoading, use ref for verification status

  // Handle country change
  const handleCountryChange = (countryName: string) => {
    setProfileData({ ...profileData, country: countryName, state: '' });
    
    const country = countryPhoneCodes.find(c => c.name === countryName);
    if (country) {
      const states = getStatesForCountry(country.code);
      setAvailableStates(states);
    } else {
      setAvailableStates([]);
    }
  };

  // Helper to generate file size error message
  const getFileSizeError = (file: File, maxMB: number = 5) => {
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return `Photo is too large (${fileSizeMB}MB). Maximum size is ${maxMB}MB. Please compress or resize your image.`;
  };

  // Handle profile photo change
  const handleProfilePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(getFileSizeError(file));
        return;
      }
      setProfilePhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAdditionalPhoto1Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(getFileSizeError(file));
        return;
      }
      setAdditionalPhoto1File(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAdditionalPhoto1Preview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle additional photo 2 change
  const handleAdditionalPhoto2Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(getFileSizeError(file));
        return;
      }
      setAdditionalPhoto2File(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAdditionalPhoto2Preview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Auto-save address when fields change (onBlur)
  const handleAutoSaveAddress = async () => {
    // Validation - only save if required fields are filled (postal code is optional)
    if (!profileData.city || !profileData.state || !profileData.country) {
      return; // Silently skip if not all fields are filled
    }

    try {
      setIsSaving(true);
      await companionsApi.updateCompanionProfile({
        city: profileData.city,
        state: profileData.state || '', // State is optional
        country: profileData.country,
        postalCode: profileData.postalCode
      });
      
      // Reload profile to get updated timezone
      const response = await companionsApi.getCompanionProfile();
      if (response.data.application.userTimezone) {
        setProfileData(prev => ({
          ...prev,
          userTimezone: response.data.application.userTimezone
        }));
      }
      // Silent save - no toast notification
    } catch (error: any) {
      console.error('Error auto-saving address:', error);
      // Only show error if it's a real error, not validation
      if (error.response?.status !== 400) {
        toast.error('Failed to save address');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Save address (Step 1) - Keep for backward compatibility in edit profile section
  const handleSaveAddress = async () => {
    // Validation - postal code is now optional
    if (!profileData.city || !profileData.country) {
      toast.error('Please fill in city and country');
      return;
    }

    try {
      setIsSaving(true);
      
      // 🌍 Geocode address to get coordinates for timezone detection
      let addressLat = null;
      let addressLon = null;
      let geocodingSucceeded = false;
      
      if (profileData.city && profileData.country) {
        try {
          console.log('🗺️  Geocoding address for timezone detection...');
          
          // Try with postal code first
          if (profileData.postalCode) {
            const geocodeQuery = `${profileData.city}, ${profileData.state || ''}, ${profileData.country}, ${profileData.postalCode}`.replace(/,\s*,/g, ',').trim();
            console.log('🗺️  Trying geocoding WITH postal code:', geocodeQuery);
            
            const response = await fetch(
              `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(geocodeQuery)}&limit=1`,
              {
                headers: {
                  'User-Agent': 'Meytle-Platform/1.0',
                  'Accept-Language': 'en'
                }
              }
            );
            
            if (response.ok) {
              const data = await response.json();
              if (data && data.length > 0) {
                addressLat = parseFloat(data[0].lat);
                addressLon = parseFloat(data[0].lon);
                geocodingSucceeded = true;
                console.log('✅ Coordinates detected (with postal):', { lat: addressLat, lon: addressLon });
              }
            }
          }
          
          // If first attempt failed, try WITHOUT postal code
          if (!geocodingSucceeded) {
            const geocodeQuery = `${profileData.city}, ${profileData.state || ''}, ${profileData.country}`.replace(/,\s*,/g, ',').trim();
            console.log('🗺️  Trying geocoding WITHOUT postal code:', geocodeQuery);
            
            const response = await fetch(
              `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(geocodeQuery)}&limit=1`,
              {
                headers: {
                  'User-Agent': 'Meytle-Platform/1.0',
                  'Accept-Language': 'en'
                }
              }
            );
            
            if (response.ok) {
              const data = await response.json();
              if (data && data.length > 0) {
                addressLat = parseFloat(data[0].lat);
                addressLon = parseFloat(data[0].lon);
                geocodingSucceeded = true;
                console.log('✅ Coordinates detected (without postal):', { lat: addressLat, lon: addressLon });
              }
            }
          }
        } catch (geocodeError) {
          console.warn('⚠️  Geocoding failed:', geocodeError);
        }
      }
      
      // Save address with coordinates
      await companionsApi.updateCompanionProfile({
        city: profileData.city,
        state: profileData.state || '', // State is optional
        country: profileData.country,
        postalCode: profileData.postalCode || '',
        addressLat: addressLat,
        addressLon: addressLon
      });
      
      toast.success('Address saved');
      
      // Reload profile to get updated timezone
      try {
        const response = await companionsApi.getCompanionProfile();
        const application = response.data.application;
        if (application.userTimezone) {
          setProfileData(prev => ({
            ...prev,
            userTimezone: application.userTimezone
          }));
        }
      } catch (error) {
        console.warn('Could not reload profile after save:', error);
      }
    } catch (error: any) {
      console.error('Error saving address:', error);
      toast.error(error.response?.data?.message || 'Failed to save address');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle multiple photo selection (both photos at once)
  const handleMultiplePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length !== 2) {
      toast.error('Please select exactly 2 photos');
      return;
    }

    // Validate both files
    const file1 = files[0];
    const file2 = files[1];

    // Check each file size individually for better error messages
    if (file1.size > 5 * 1024 * 1024) {
      toast.error(getFileSizeError(file1));
      return;
    }
    if (file2.size > 5 * 1024 * 1024) {
      toast.error(getFileSizeError(file2));
      return;
    }

    // Set previews
    setAdditionalPhoto1File(file1);
    const reader1 = new FileReader();
    reader1.onloadend = () => {
      setAdditionalPhoto1Preview(reader1.result as string);
    };
    reader1.readAsDataURL(file1);

    setAdditionalPhoto2File(file2);
    const reader2 = new FileReader();
    reader2.onloadend = () => {
      setAdditionalPhoto2Preview(reader2.result as string);
    };
    reader2.readAsDataURL(file2);

    // Auto-upload immediately
    try {
      setIsSaving(true);
      toast.loading('Uploading photos...');

      // Upload both additional photos
      const response1 = await companionsApi.uploadAdditionalPhoto1(file1);
      setProfileData(prev => ({ ...prev, additionalPhoto1Url: response1.data.additionalPhoto1Url }));

      const response2 = await companionsApi.uploadAdditionalPhoto2(file2);
      setProfileData(prev => ({ ...prev, additionalPhoto2Url: response2.data.additionalPhoto2Url }));

      // Clear file states after successful upload
      setAdditionalPhoto1File(null);
      setAdditionalPhoto1Preview('');
      setAdditionalPhoto2File(null);
      setAdditionalPhoto2Preview('');

      toast.dismiss();
      toast.success('Both photos uploaded successfully!');
    } catch (error: any) {
      console.error('Error uploading photos:', error);
      toast.dismiss();

      // Handle specific HTTP status codes
      const status = error.response?.status;
      let errorMessage = 'Failed to upload photos';

      if (status === 413) {
        errorMessage = 'Photo is too large. Please use images under 5MB.';
      } else if (status === 415) {
        errorMessage = 'Invalid file type. Please upload JPG, PNG, or WebP images.';
      } else if (status === 400) {
        errorMessage = error.response?.data?.message || 'Invalid photo format. Please try again.';
      } else if (error.code === 'ERR_NETWORK') {
        errorMessage = 'Network error. Please check your internet connection.';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      toast.error(errorMessage);
      // Reset on error
      setAdditionalPhoto1File(null);
      setAdditionalPhoto1Preview('');
      setAdditionalPhoto2File(null);
      setAdditionalPhoto2Preview('');
    } finally {
      setIsSaving(false);
      // Reset the input so user can select again if needed
      e.target.value = '';
    }
  };

  // Start Veriff verification (Step 3)
  // Real Veriff integration OR auto-approval when USE_VERIFF_API=false
  const handleStartVeriff = async () => {
    try {
      setIsSaving(true);
      
      console.log('🔄 Starting verification process...');
      
      // Call backend to create Veriff session (or auto-approve if API disabled)
      const response = await axios.post(
        `${API_CONFIG.BASE_URL}/companion/verification/start-veriff`,
        {},
        { withCredentials: true }
      );
      
      console.log('✅ Verification response:', response.data);
      
      const { autoApproved, verificationUrl, verificationStatus, applicationStatus } = response.data.data;
      
      // Check if auto-approved (when USE_VERIFF_API=false)
      if (autoApproved) {
        console.log('✅ Auto-approved (testing mode)');

        // Update local state
        setProfileData(prev => ({ ...prev, verificationStatus: 'approved' }));
        
        // Reload profile data to get latest status
        try {
          const profileResponse = await companionsApi.getCompanionProfile();
          const application = profileResponse.data.application;
          
          console.log('📥 Fresh profile data after auto-approval:', {
            verificationStatus: application.verificationStatus,
            applicationStatus: application.status,
            profilePhotoUrl: application.profilePhotoUrl
          });
          
          // Parse JSON fields
          const parseJSON = (jsonString: string, defaultValue: any) => {
            try {
              return jsonString ? JSON.parse(jsonString) : defaultValue;
            } catch (e) {
              return defaultValue;
            }
          };
          
          // Update all profile data
          setProfileData({
            fullName: user?.name || '',
            email: user?.email || '',
            phoneNumber: application.phoneNumber || '',
            bio: application.bio || '',
            hourlyRate: application.hourlyRate || 25,
            addressLine: application.addressLine || '',
            city: application.city || '',
            state: application.state || '',
            country: application.country || '',
            postalCode: application.postalCode || '',
            userTimezone: application.userTimezone || 'UTC',
            profilePhotoUrl: application.profilePhotoUrl || '',
            additionalPhoto1Url: application.additionalPhoto1Url || '',
            additionalPhoto2Url: application.additionalPhoto2Url || '',
            verificationStatus: application.verificationStatus || 'not_started',
            veriffSessionId: application.veriffSessionId || '',
            gender: application.gender || '',
            interests: parseJSON(application.interests, []),
            services: parseJSON(application.servicesOffered, []),
            languages: parseJSON(application.languages, ['English'])
          });
          
          console.log('✅ Profile data updated successfully (auto-approved)');

          // Show single success message
          if (applicationStatus === 'approved') {
            toast.success('Identity verified & application approved!');
          } else {
            toast.success('Identity verified successfully!');
          }
          
        } catch (reloadError) {
          console.error('❌ Failed to reload profile:', reloadError);
          // Still mark as complete even if reload fails
        }
        
        setIsSaving(false);
        return;
      }
      
      // Real Veriff flow - redirect to verification URL
      if (verificationUrl) {
        console.log('🔄 Redirecting to Veriff verification...');
        toast.success('Redirecting to identity verification...');
        window.location.href = verificationUrl;
        // Note: User will be redirected back after completing verification
        // The webhook will update their status automatically
      }
      
    } catch (error) {
      console.error('Failed to start verification:', error);
      toast.error('Failed to start verification. Please try again.');
      setIsSaving(false);
    }
  };

  // Save profile information
  const handleSaveProfile = async () => {
    try {
      setIsSaving(true);
      
      await companionsApi.updateCompanionProfile({
          phoneNumber: profileData.phoneNumber,
          bio: profileData.bio,
        hourlyRate: profileData.hourlyRate,
        services: profileData.services, // Send as array, backend will stringify
        languages: profileData.languages // Send as array, backend will stringify
      });
      
      toast.success('Profile updated successfully!');
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast.error(error.response?.data?.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProfile = async () => {
    try {
      setIsDeleting(true);

      await axios.delete(`${API_CONFIG.BASE_URL}/auth/delete-account`, {
        withCredentials: true
      });

      toast.success('Account deleted successfully');
      signOut();
      navigate('/');
    } catch (error: any) {
      console.error('❌ Error deleting account:', error);
      toast.error(error.response?.data?.message || 'Failed to delete account');
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#312E81]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">My Profile</h1>
              <p className="mt-1 text-xs sm:text-sm text-gray-500">Manage your personal information and preferences</p>
            </div>
            <button
              onClick={() => navigate(ROUTES.COMPANION_DASHBOARD)}
              className="px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base text-gray-600 hover:text-gray-900 font-medium transition-colors self-start sm:self-auto"
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </div>

      {/* Profile Completion Progress - Only show if not 100% complete */}
      {!completionStatus.isComplete && (
        <div className="bg-gradient-to-r from-[#F5F4FB] to-[#FFF0F0] border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <FaShieldAlt className="text-[#312E81]" />
                Profile Completion
              </h3>
              <span className="text-sm font-medium text-[#312E81]">
                {completionStatus.completedSteps}/{completionStatus.totalSteps} Complete
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 mb-3">
              <div 
                className="bg-gradient-to-r from-[#312E81] to-[#FFCCCB] h-3 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                style={{ width: `${completionPercentage}%` }}
              >
                {completionPercentage > 0 && (
                  <span className="text-xs text-white font-semibold">
                    {completionPercentage}%
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md ${completionStatus.hasAddress ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                {completionStatus.hasAddress ? <FaCheck className="flex-shrink-0" /> : <FaExclamationTriangle className="flex-shrink-0" />}
                <span className="truncate">Address</span>
              </div>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md ${completionStatus.hasAllPhotos ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                {completionStatus.hasAllPhotos ? <FaCheck className="flex-shrink-0" /> : <FaExclamationTriangle className="flex-shrink-0" />}
                <span className="truncate">2 Additional Photos</span>
              </div>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md ${completionStatus.hasVerification ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                {completionStatus.hasVerification ? <FaCheck className="flex-shrink-0" /> : <FaExclamationTriangle className="flex-shrink-0" />}
                <span className="truncate">Verification</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Sidebar - Profile Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 sticky top-24">
              <div className="flex items-center gap-2 mb-6">
                <FaUser className="text-[#312E81] w-5 h-5" />
                <h2 className="text-xl font-semibold text-gray-900">Profile Summary</h2>
              </div>

              <div className="flex flex-col items-center">
                {/* Profile Photo */}
                <div className="mb-4">
                  <div className="w-32 h-32 rounded-full overflow-hidden bg-gradient-to-br from-[#4A47A3] to-[#4A47A3] flex items-center justify-center text-white text-4xl font-bold">
                    {profileData.profilePhotoUrl ? (
                      <img src={getImageUrl(profileData.profilePhotoUrl)} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      profileData.fullName.charAt(0).toUpperCase()
                    )}
                  </div>
                </div>

                {/* Name */}
                <h3 className="text-2xl font-semibold text-gray-900 mb-2">{profileData.fullName || 'Your Name'}</h3>
                
                {/* Role Badge */}
                <span className="inline-block bg-[#312E81] text-white px-4 py-1 rounded-full text-sm font-medium mb-4">
                  Companion
                </span>

                {/* Location */}
                <div className="w-full space-y-3 mb-4">
                  <div className="flex items-center gap-3 text-gray-600">
                    <FaMapMarkerAlt className="text-gray-400 w-4 h-4" />
                    <span className="text-sm">
                      {profileData.city && profileData.country
                        ? `${profileData.city}, ${profileData.country}`
                        : 'Not specified'}
                    </span>
                  </div>
                </div>

                {/* Gender */}
                {profileData.gender && (
                  <div className="w-full mb-6">
                    <div className="flex items-center gap-3 text-gray-600">
                      <span className="text-sm font-medium text-gray-900">Gender:</span>
                      <span className="text-sm capitalize">{profileData.gender}</span>
                    </div>
                  </div>
                )}

                {/* Account Status */}
                <div className="w-full border-t border-gray-100 pt-4">
                  <div className="space-y-3">
                    {/* Email Verification */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FaEnvelope className="text-gray-400 text-sm" />
                        <span className="text-sm text-gray-600">Email</span>
                      </div>
                      {user?.emailVerified ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-full">
                          <FaCheck className="text-xs" /> Verified
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
                          <FaExclamationTriangle className="text-xs" /> Pending
                        </span>
                      )}
                    </div>

                    {/* Verification Status */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FaIdCard className="text-gray-400 text-sm" />
                        <span className="text-sm text-gray-600">Veriff</span>
                      </div>
                      {profileData.verificationStatus === 'approved' ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-full">
                          <FaCheck className="text-xs" /> Verified
                        </span>
                      ) : profileData.verificationStatus === 'pending' ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
                          <FaExclamationTriangle className="text-xs" /> Pending
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-1 rounded-full">
                          <FaExclamationTriangle className="text-xs" /> Not Started
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - 3-Step Forms */}
          <div className="lg:col-span-2 space-y-6">
            {/* Show all steps until profile is complete */}
            {!completionStatus.isComplete && (
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <div className="flex items-center gap-2 mb-6">
                  <FaShieldAlt className="text-[#312E81] w-5 h-5" />
                  <h2 className="text-xl font-semibold text-gray-900">Required for Profile Completion</h2>
              </div>

              <div className="space-y-6">
                  {/* Step 1: Address - Always show until completed */}
                  <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                    <div className="flex items-center gap-2 mb-4">
                      <FaMapMarkerAlt className="text-[#312E81] text-xl" />
                      <h3 className="text-lg font-bold text-gray-900">
                        Step 1: Complete Address <span className="text-red-500">*</span>
                      </h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-6">Your location is required for service area definition</p>
                    
                    <div className="space-y-4">
                      {/* Country */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Country <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={profileData.country}
                          onChange={(e) => handleCountryChange(e.target.value)}
                          onBlur={handleAutoSaveAddress}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#312E81] focus:border-transparent bg-white"
                        >
                          <option value="">Select a country</option>
                          {countryPhoneCodes.map((country) => (
                            <option key={country.code} value={country.name}>{country.name}</option>
                          ))}
                        </select>
                </div>

                      {/* City & State/Province in parallel */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                            City <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                            value={profileData.city}
                            onChange={(e) => setProfileData({...profileData, city: e.target.value})}
                            onBlur={handleAutoSaveAddress}
                            placeholder="Enter your city"
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#312E81] focus:border-transparent bg-white"
                    />
                  </div>
                  <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            State/Province <span className="text-red-500">*</span>
                          </label>
                          {availableStates.length > 0 ? (
                            <select
                              value={profileData.state}
                              onChange={(e) => setProfileData({...profileData, state: e.target.value})}
                              onBlur={handleAutoSaveAddress}
                              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#312E81] focus:border-transparent bg-white"
                            >
                              <option value="">Select state/province</option>
                              {availableStates.map((state) => (
                                <option key={state.code} value={state.name}>{state.name}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={profileData.state}
                              onChange={(e) => setProfileData({...profileData, state: e.target.value})}
                              onBlur={handleAutoSaveAddress}
                              placeholder="Enter state/province"
                              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#312E81] focus:border-transparent bg-white"
                    />
                          )}
                  </div>
                </div>

                      {/* Postal Code */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                          Postal/Zip Code
                  </label>
                  <input
                    type="text"
                          value={profileData.postalCode}
                          onChange={(e) => setProfileData({...profileData, postalCode: e.target.value})}
                          onBlur={handleAutoSaveAddress}
                          placeholder="Enter postal/zip code"
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#312E81] focus:border-transparent bg-white"
                  />
                </div>

                      {/* Timezone Display */}
                      {profileData.userTimezone && (
                        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-sm text-blue-800">
                            <FaGlobe className="inline mr-2" />
                            <strong>Detected Timezone:</strong> {profileData.userTimezone}
                          </p>
                          <p className="text-xs text-blue-600 mt-1">
                            Your timezone is automatically detected from your address and used to display all times correctly.
                          </p>
                        </div>
                      )}

                      {/* Auto-save indicator */}
                      {isSaving && (
                        <div className="text-sm text-gray-500 flex items-center gap-2">
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                          </svg>
                          Saving...
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Step 2: Additional Photos - Always show until completed */}
                  <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                    <div className="flex items-center gap-2 mb-4">
                      <FaCamera className="text-[#312E81] text-xl" />
                      <h3 className="text-lg font-bold text-gray-900">
                        Step 2: Upload Additional Photos <span className="text-red-500">*</span>
                      </h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-6">Upload 2 additional photos for verification (profile photo was uploaded during application)</p>

                    {/* Photo Previews */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        {/* Additional Photo 1 Preview */}
                <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2 text-center">Photo 1</label>
                          <div className="flex flex-col items-center gap-2">
                            <div className="w-40 h-40 rounded-lg overflow-hidden bg-gradient-to-br from-[#FFCCCB] to-[#FFF0F0] flex items-center justify-center shadow-lg">
                              {profileData.additionalPhoto1Url || additionalPhoto1Preview ? (
                                <img src={additionalPhoto1Preview || getImageUrl(profileData.additionalPhoto1Url)} alt="Additional 1" className="w-full h-full object-cover" />
                              ) : (
                                <FaCamera className="text-5xl text-gray-400 opacity-50" />
                              )}
                            </div>
                            <p className="text-xs text-gray-500 text-center">
                              {profileData.additionalPhoto1Url ? '✓ Uploaded' : 'Not uploaded'}
                            </p>
                          </div>
                </div>

                        {/* Additional Photo 2 Preview */}
                  <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2 text-center">Photo 2</label>
                          <div className="flex flex-col items-center gap-2">
                            <div className="w-40 h-40 rounded-lg overflow-hidden bg-gradient-to-br from-[#FFCCCB] to-[#FFF0F0] flex items-center justify-center shadow-lg">
                              {profileData.additionalPhoto2Url || additionalPhoto2Preview ? (
                                <img src={additionalPhoto2Preview || getImageUrl(profileData.additionalPhoto2Url)} alt="Additional 2" className="w-full h-full object-cover" />
                              ) : (
                                <FaCamera className="text-5xl text-gray-400 opacity-50" />
                              )}
                  </div>
                            <p className="text-xs text-gray-500 text-center">
                              {profileData.additionalPhoto2Url ? '✓ Uploaded' : 'Not uploaded'}
                            </p>
                          </div>
                        </div>
                      </div>

                    {/* Single Upload Button */}
                    <div className="flex flex-col items-center gap-3">
                      <button
                        type="button"
                        onClick={() => multiplePhotosInputRef.current?.click()}
                        disabled={isSaving}
                        className="px-8 py-3 bg-[#312E81] text-white rounded-lg font-medium hover:bg-[#1E1B4B] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md"
                      >
                        <FaUpload className="w-5 h-5" />
                        {isSaving ? 'Uploading...' : (profileData.additionalPhoto1Url && profileData.additionalPhoto2Url ? 'Change Photos' : 'Upload Both Photos')}
                      </button>
                      <input
                        ref={multiplePhotosInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleMultiplePhotoChange}
                        className="hidden"
                      />
                      <p className="text-xs text-gray-500 text-center">
                        Select 2 photos at once (Max 5MB each, JPG/PNG)
                      </p>
                      {isSaving && (
                        <div className="text-sm text-gray-500 flex items-center gap-2">
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                          </svg>
                          Uploading...
                        </div>
                      )}
                    </div>
                </div>

                  {/* Step 3: Veriff Verification - Always show */}
                  <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                    <div className="flex items-center gap-2 mb-4">
                      <FaIdCard className="text-[#312E81] text-xl" />
                      <h3 className="text-lg font-bold text-gray-900">
                        Step 3: Veriff Identity Verification <span className="text-red-500">*</span>
                      </h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-6">Complete identity verification via Veriff (takes 5-10 minutes)</p>

                    {profileData.verificationStatus === 'not_started' && (
                      <div className="flex justify-center">
                        <button
                          onClick={handleStartVeriff}
                          disabled={isSaving}
                          className="px-8 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          <FaShieldAlt className="w-5 h-5" />
                          {isSaving ? 'Starting...' : 'Start Identity Verification'}
                        </button>
                      </div>
                    )}

                    {profileData.verificationStatus === 'pending' && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <div className="text-center mb-4">
                          <FaExclamationTriangle className="w-8 h-8 text-amber-600 mx-auto mb-2" />
                          <p className="text-sm text-amber-800 font-medium">Verification in progress...</p>
                          <p className="text-xs text-amber-600 mt-1">This may take a few minutes. We'll update your status automatically.</p>
                        </div>
                        <div className="flex justify-center gap-3 mt-4">
                          <button
                            onClick={handleStartVeriff}
                            disabled={isSaving}
                            className="px-6 py-2 bg-[#312E81] text-white rounded-lg font-medium hover:bg-[#252165] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          >
                            <FaShieldAlt className="w-4 h-4" />
                            {isSaving ? 'Restarting...' : 'Restart Verification'}
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 text-center mt-2">
                          Did you close the verification window? Click "Restart Verification" to try again.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Success Message - Profile Complete */}
            {completionStatus.isComplete && showSuccessBanner && (
              <div className="bg-gradient-to-r from-green-50 to-green-100 border-2 border-green-500 rounded-xl p-8 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500 rounded-full mb-4">
                  <FaCheck className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-green-900 mb-2">Profile Complete! 🎉</h2>
                <p className="text-green-700 mb-6">Your companion profile is fully verified. You can now start accepting bookings!</p>
                <button
                  onClick={() => navigate(ROUTES.COMPANION_DASHBOARD)}
                  className="px-8 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
                >
                  Go to Dashboard
                </button>
              </div>
            )}

            {/* Edit Profile Sections - Reorganized for better UX */}
            {completionStatus.isComplete && (
              <>
                {/* 1. PROFILE SHOWCASE - Photos, Bio, and Rate */}
                <div className="bg-gradient-to-br from-white to-purple-50 rounded-xl shadow-lg p-8 border-2 border-purple-100">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-gradient-to-br from-[#312E81] to-[#4A47A3] rounded-lg">
                      <FaCamera className="text-white w-6 h-6" />
                    </div>
                  <div>
                      <h2 className="text-2xl font-bold text-gray-900">Profile Showcase</h2>
                      <p className="text-sm text-gray-600">How clients will see you</p>
                    </div>
                  </div>
                  
                  {/* Photo Grid */}
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Profile Photos</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Profile Photo - Larger & Circular */}
                      <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-gray-700 mb-2 text-center">Main Photo</label>
                          <div className="flex flex-col items-center gap-3">
                            <div className="w-40 h-40 rounded-full overflow-hidden bg-gradient-to-br from-[#312E81] to-[#4A47A3] flex items-center justify-center shadow-2xl border-4 border-white ring-4 ring-purple-100">
                              {profileData.profilePhotoUrl || profilePhotoPreview ? (
                                <img src={profilePhotoPreview || getImageUrl(profileData.profilePhotoUrl)} alt="Profile" className="w-full h-full object-cover" />
                              ) : (
                                <FaUser className="text-6xl text-white opacity-50" />
                              )}
                          </div>
                          <button 
                            type="button"
                            onClick={() => profilePhotoInputRef.current?.click()}
                            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#312E81] to-[#4A47A3] text-white rounded-lg hover:opacity-90 transition-all shadow-md text-sm font-medium"
                          >
                            <FaUpload className="w-4 h-4" />
                            {profileData.profilePhotoUrl || profilePhotoPreview ? 'Change Photo' : 'Upload Photo'}
                          </button>
                          <input ref={profilePhotoInputRef} type="file" accept="image/*" onChange={handleProfilePhotoChange} className="hidden" />
                          <p className="text-xs text-gray-500 text-center">
                            {profilePhotoFile ? `✓ ${profilePhotoFile.name}` : 'Max 5MB'}
                          </p>
                        </div>
                      </div>

                      {/* Additional Photos */}
                      <div className="md:col-span-2 grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Photo 2</label>
                          <div className="flex flex-col items-center gap-3">
                            <div className="w-32 h-32 rounded-xl overflow-hidden bg-gradient-to-br from-pink-100 to-purple-100 flex items-center justify-center shadow-lg">
                              {profileData.additionalPhoto1Url || additionalPhoto1Preview ? (
                                <img src={additionalPhoto1Preview || getImageUrl(profileData.additionalPhoto1Url)} alt="Additional 1" className="w-full h-full object-cover" />
                              ) : (
                                <FaCamera className="text-4xl text-gray-400" />
                              )}
                            </div>
                            <button 
                              type="button"
                              onClick={() => additionalPhoto1InputRef.current?.click()}
                              className="text-xs px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                            >
                              {profileData.additionalPhoto1Url || additionalPhoto1Preview ? 'Change' : 'Upload'}
                            </button>
                            <input ref={additionalPhoto1InputRef} type="file" accept="image/*" onChange={handleAdditionalPhoto1Change} className="hidden" />
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Photo 3</label>
                          <div className="flex flex-col items-center gap-3">
                            <div className="w-32 h-32 rounded-xl overflow-hidden bg-gradient-to-br from-pink-100 to-purple-100 flex items-center justify-center shadow-lg">
                              {profileData.additionalPhoto2Url || additionalPhoto2Preview ? (
                                <img src={additionalPhoto2Preview || getImageUrl(profileData.additionalPhoto2Url)} alt="Additional 2" className="w-full h-full object-cover" />
                              ) : (
                                <FaCamera className="text-4xl text-gray-400" />
                              )}
                            </div>
                            <button 
                              type="button"
                              onClick={() => additionalPhoto2InputRef.current?.click()}
                              className="text-xs px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                            >
                              {profileData.additionalPhoto2Url || additionalPhoto2Preview ? 'Change' : 'Upload'}
                            </button>
                            <input ref={additionalPhoto2InputRef} type="file" accept="image/*" onChange={handleAdditionalPhoto2Change} className="hidden" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Save Photos Button */}
                    {(profilePhotoFile || additionalPhoto1File || additionalPhoto2File) && (
                      <div className="flex justify-end mt-4">
                        <button
                          onClick={handleSaveProfile}
                          disabled={isSaving}
                          className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2 shadow-md"
                        >
                          <FaSave className="w-4 h-4" />
                          {isSaving ? 'Uploading...' : 'Save Photos'}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-purple-200 pt-6 space-y-6">
                    {/* Bio */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">About You</label>
                      <textarea 
                        value={profileData.bio} 
                        onChange={(e) => setProfileData({...profileData, bio: e.target.value})}
                        rows={4}
                        maxLength={1000}
                        placeholder="Tell clients about yourself... What makes you unique? What do you enjoy?"
                        className="w-full px-4 py-3 border-2 border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none bg-white"
                      />
                      <p className="text-xs text-gray-500 mt-1">{profileData.bio.length}/1000 characters</p>
                    </div>
                    
                    {/* Hourly Rate - USD Only */}
                    <div className="bg-white rounded-lg p-4 border-2 border-purple-200">
                      <label className="block text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">💰 Base Hourly Rate (USD)</label>
                      <div className="space-y-3">
                        {/* Rate Input */}
                        <div className="flex items-center gap-3">
                          <span className="text-3xl font-bold text-gray-700">$</span>

                          <input
                            type="number"
                            value={profileData.hourlyRate || ''}
                            onChange={(e) => setProfileData({...profileData, hourlyRate: Number(e.target.value) || 0})}
                            min={1}
                            className="flex-1 px-4 py-3 border-2 border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-center text-2xl font-bold text-[#312E81]"
                          />

                          <span className="text-lg text-gray-600 whitespace-nowrap">per hour</span>
                        </div>

                        <p className="text-sm text-gray-600">Clients will see this rate when browsing</p>
                        <p className="text-xs text-gray-500">You can negotiate different rates for specific bookings.</p>
                      </div>
                    </div>

                    {/* Save Button */}
                    <div className="flex justify-end pt-4 border-t border-purple-200">
                      <button
                        onClick={handleSaveProfile}
                        disabled={isSaving}
                        className="px-8 py-3 bg-gradient-to-r from-[#312E81] to-[#4A47A3] text-white rounded-lg font-semibold hover:opacity-90 transition-all disabled:opacity-50 shadow-lg flex items-center gap-2"
                    >
                        <FaSave className="w-5 h-5" />
                        {isSaving ? 'Saving...' : 'Save Showcase'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. PROFESSIONAL INFORMATION - Services, Languages, Interests */}
                <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg">
                      <FaBriefcase className="text-white w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900">Professional Information</h2>
                      <p className="text-sm text-gray-600">What you offer and speak</p>
                    </div>
                  </div>
                  
                  <div className="space-y-6">
                    {/* Services */}
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <FaHeart className="text-pink-500 w-5 h-5" />
                        <h3 className="text-lg font-semibold text-gray-900">Services Offered</h3>
                      </div>
                      <ServicesSelector 
                        selectedServices={profileData.services}
                        onServicesChange={(services) => setProfileData({...profileData, services})}
                      />
                </div>

                {/* Languages */}
                <div className="border-t border-gray-100 pt-6">
                      <div className="flex items-center gap-2 mb-4">
                        <FaGlobe className="text-blue-500 w-5 h-5" />
                        <h3 className="text-lg font-semibold text-gray-900">Languages Spoken</h3>
                      </div>
                  <LanguageSelector
                    selectedLanguages={profileData.languages}
                        onLanguagesChange={(languages) => setProfileData({...profileData, languages})}
                        maxSelections={10}
                  />
                </div>

                    {/* Interests */}
                    <div className="border-t border-gray-100 pt-6">
                      <div className="flex items-center gap-2 mb-4">
                        <FaHeart className="text-red-500 w-5 h-5" />
                        <h3 className="text-lg font-semibold text-gray-900">Interests</h3>
                      </div>
                      <InterestSelector 
                        selectedInterests={profileData.interests}
                        onInterestsChange={(interests) => setProfileData({...profileData, interests})}
                        maxSelections={10}
                  />
                </div>

                    {/* Save Button */}
                    <div className="flex justify-end pt-6 border-t border-gray-100">
                  <button
                        onClick={handleSaveProfile}
                    disabled={isSaving}
                        className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-md flex items-center gap-2"
                  >
                        <FaSave className="w-5 h-5" />
                        {isSaving ? 'Saving...' : 'Save Professional Info'}
                  </button>
                    </div>
                  </div>
                </div>

                {/* 3. CONTACT & LOCATION - Collapsible (less important after verification) */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <button
                    onClick={() => setShowContactSection(!showContactSection)}
                    className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-gray-100 rounded-lg">
                        <FaPhone className="text-gray-600 w-5 h-5" />
                </div>
                      <div className="text-left">
                        <h2 className="text-lg font-semibold text-gray-900">Contact & Location</h2>
                        <p className="text-sm text-gray-500">✓ Verified - Click to {showContactSection ? 'hide' : 'view/edit'}</p>
              </div>
            </div>
                    <div className={`transform transition-transform ${showContactSection ? 'rotate-180' : ''}`}>
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {showContactSection && (
                    <div className="px-6 pb-6 border-t border-gray-100">
                      <div className="pt-6 space-y-4">
                        {/* Phone Number */}
                        <div>
                          <PhoneNumberInput 
                            value={profileData.phoneNumber} 
                            onChange={(value) => setProfileData({...profileData, phoneNumber: value})}
                            label="Phone Number"
                          />
                        </div>

                        {/* Address Fields */}
                        <div className="pt-4 border-t border-gray-100">
                          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                            <FaMapMarkerAlt className="text-gray-500" />
                            Address
                          </h3>
              <div className="space-y-4">

                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">Country</label>
                              <select
                                value={profileData.country}
                                onChange={(e) => handleCountryChange(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#312E81] focus:border-transparent"
                              >
                                <option value="">Select a country</option>
                                {countryPhoneCodes.map((country) => (
                                  <option key={country.code} value={country.name}>{country.name}</option>
                                ))}
                              </select>
                </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                                <input
                                  type="text"
                                  value={profileData.city}
                                  onChange={(e) => setProfileData({...profileData, city: e.target.value})}
                                  placeholder="Enter your city"
                                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#312E81] focus:border-transparent"
                                />
                  </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">State/Province</label>
                                {availableStates.length > 0 ? (
                                  <select
                                    value={profileData.state}
                                    onChange={(e) => setProfileData({...profileData, state: e.target.value})}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#312E81] focus:border-transparent"
                                  >
                                    <option value="">Select state/province</option>
                                    {availableStates.map((state) => (
                                      <option key={state.code} value={state.name}>{state.name}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type="text"
                                    value={profileData.state}
                                    onChange={(e) => setProfileData({...profileData, state: e.target.value})}
                                    placeholder="Enter state/province"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#312E81] focus:border-transparent"
                                  />
                                )}
                              </div>
                </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">Postal/Zip Code</label>
                              <input
                                type="text"
                                value={profileData.postalCode}
                                onChange={(e) => setProfileData({...profileData, postalCode: e.target.value})}
                                placeholder="Enter postal/zip code"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#312E81] focus:border-transparent"
                              />
                </div>
              </div>
            </div>

                        {/* Save Button */}
                        <div className="flex justify-end pt-4 border-t border-gray-200">
                    <button
                            onClick={handleSaveAddress}
                            disabled={isSaving || !profileData.city || !profileData.country}
                            className="px-6 py-2.5 bg-[#312E81] text-white rounded-lg font-medium hover:bg-[#1E1B4B] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                            <FaSave className="w-4 h-4" />
                            {isSaving ? 'Saving...' : 'Save Contact Info'}
                    </button>
                  </div>
                </div>
              </div>
                  )}
            </div>

                {/* Danger Zone - Delete Profile */}
                <div className="bg-white rounded-xl shadow-sm p-6 border border-red-100">
                  <div className="flex items-center gap-2 mb-4">
                    <FaTrashAlt className="text-red-500 w-5 h-5" />
                    <h2 className="text-xl font-semibold text-gray-900">Danger Zone</h2>
                  </div>

                  <div className="bg-red-50 rounded-lg p-4 mb-4">
                    <p className="text-sm text-red-800 mb-3">
                      <strong>Warning:</strong> Deleting your profile is permanent and cannot be undone.
                    </p>
                    <ul className="text-xs text-red-700 space-y-1 list-disc list-inside">
                      <li>All your bookings will be cancelled</li>
                      <li>Your profile information will be permanently deleted</li>
                      <li>You will lose access to your account immediately</li>
                    </ul>
                </div>

                <button
                  onClick={() => setShowDeleteModal(true)}
                    className="w-full bg-red-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                >
                    <FaTrashAlt className="w-4 h-4" />
                  Delete My Profile
                </button>
              </div>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Delete Profile Modal */}
      {showDeleteModal && (
        <DeleteProfileModal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleDeleteProfile}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
};

// Delete Profile Modal Component
const DeleteProfileModal: React.FC<DeleteProfileModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isDeleting
}) => {
  const [confirmEmail, setConfirmEmail] = useState('');
  const { user } = useAuth();

  // Register modal with ModalContext to hide page header/footer and prevent scroll
  useModalRegistration('delete-profile-modal-companion', isOpen);

  const handleConfirm = () => {
    if (confirmEmail === user?.email) {
      onConfirm();
    } else {
      toast.error('Email does not match');
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/30 backdrop-blur-md flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-red-50 border-b border-red-200 px-6 py-4 rounded-t-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-full">
                <FaExclamationTriangle className="text-red-600 w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Delete Profile</h3>
            </div>
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="p-2 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <FaTimes className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
            <p className="text-sm text-red-800 font-medium">
              ⚠️ This action cannot be undone. This will permanently delete your profile, cancel all bookings,
              and remove all of your data from our servers.
            </p>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Type your email <span className="font-mono bg-gray-100 px-2 py-1 rounded text-red-600">{user?.email}</span> to confirm:
            </label>
            <input
              type="email"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              placeholder="Enter your email to confirm"
              disabled={isDeleting}
              autoFocus
            />
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 rounded-b-xl flex gap-3">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isDeleting || confirmEmail !== user?.email}
            className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isDeleting ? (
              <>
                <FaSpinner className="animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <FaTrashAlt />
                Delete Profile
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompanionProfile;
