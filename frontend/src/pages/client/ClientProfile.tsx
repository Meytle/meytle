/**
 * Client Profile Management Page
 * Allows clients to manage their profile, preferences, and identity verification
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  FaUser,
  FaEnvelope,
  FaMapMarkerAlt,
  FaCamera,
  FaPhone,
  FaIdCard,
  FaCheck,
  FaTimes,
  FaShieldAlt,
  FaExclamationTriangle,
  FaUpload,
  FaTrashAlt,
  FaSave,
  FaHeart,
  FaGlobe,
  FaCog,
  FaSpinner
} from 'react-icons/fa';
import { useAuth } from '../../hooks/useAuth';
import { useModalRegistration } from '../../context/ModalContext';
import axios from 'axios';
import { API_CONFIG, ROUTES } from '../../constants';
import PhoneNumberInput from '../../components/common/PhoneNumberInput';
import InterestSelector from '../../components/common/InterestSelector';
import LanguageSelector from '../../components/companion/LanguageSelector';
import clientApi from '../../api/client';
import { countryPhoneCodes } from '../../data/countryPhoneCodes';
import { getStatesForCountry } from '../../data/locationData';
import { checkClientProfileCompletion, getCompletionCount } from '../../utils/profileHelpers';

interface ProfileData {
  fullName: string;
  phoneNumber: string;
  location: string;
  addressLine: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  bio: string;
  gender: string;
  userTimezone?: string;
  profilePhoto?: string;
  dateOfBirth: string;
  interests: string[];
  languages: string[];
}

interface VerificationStatus {
  emailVerified: boolean;
  idVerified: boolean;
  idDocumentUrl?: string;
  verificationDate?: string;
}

interface DeleteProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}

const ClientProfile = () => {
  const { user, signOut, checkAuth } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string>('');
  const [idDocumentFile, setIdDocumentFile] = useState<File | null>(null);
  const [idDocumentPreview, setIdDocumentPreview] = useState<string>('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showSuccessBanner, setShowSuccessBanner] = useState(true);
  const [showContactSection, setShowContactSection] = useState(false);
  const [showVerificationSection, setShowVerificationSection] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isUploadingProfile, setIsUploadingProfile] = useState(false);
  const [addressValidationStatus, setAddressValidationStatus] = useState<'unknown' | 'valid' | 'invalid'>('unknown');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const idInputRef = useRef<HTMLInputElement>(null);
  const isSavingPhotosRef = useRef(false);
  
  const [profileData, setProfileData] = useState<ProfileData>({
    fullName: user?.name || '',
    phoneNumber: '',
    location: '',
    addressLine: '',
    city: '',
    state: '',
    country: '',
    postalCode: '',
    bio: '',
    gender: '',
    profilePhoto: '',
    dateOfBirth: '',
    interests: [],
    languages: []
  });

  // Track saved backend data separately for completion checks
  const [savedBackendData, setSavedBackendData] = useState<{
    hasAddress: boolean;
    hasPhotos: boolean;
  }>({
    hasAddress: false,
    hasPhotos: false
  });

  // Debug: Log when savedBackendData changes
  useEffect(() => {
    console.log('🔄 savedBackendData changed:', savedBackendData);
  }, [savedBackendData]);

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

  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>({
    emailVerified: user?.emailVerified || false,
    idVerified: false
  });

  // Sync email verification status with auth context (when user verifies email and checkAuth updates)
  useEffect(() => {
    if (user?.emailVerified !== undefined) {
      setVerificationStatus(prev => ({
        ...prev,
        emailVerified: !!user.emailVerified
      }));
    }
  }, [user?.emailVerified]);

  // Auto-save address with debouncing
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasUserInteractedRef = useRef(false); // Track if user has actually typed anything
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  
  // Auto-save when address fields change (debounced)
  useEffect(() => {
    // Skip auto-save on initial page load (before user interaction)
    if (!hasUserInteractedRef.current) {
      // Mark as interacted after initial render
      const timer = setTimeout(() => {
        hasUserInteractedRef.current = true;
      }, 1000);
      return () => clearTimeout(timer);
    }

    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    // Validate required fields before setting timeout (postal optional)
    if (!profileData.city || !profileData.state || !profileData.country) {
      // Not all required fields filled yet, skip auto-save
      return;
    }
    
    // Set new timeout for auto-save (debounced by 2 seconds)
    autoSaveTimeoutRef.current = setTimeout(async () => {
      try {
        setIsSavingAddress(true);
        console.log('💾 Auto-saving address...');
        
        // 🌍 Geocode address to get coordinates for timezone detection
        let addressLat = null;
        let addressLon = null;
        let geocodingSucceeded = false;
        
        if (profileData.city && profileData.country) {
          try {
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
            
            // Update validation status
            if (geocodingSucceeded) {
              setAddressValidationStatus('valid');
            } else {
              setAddressValidationStatus('invalid');
              console.warn('⚠️  Address could not be geocoded - no results found');
            }
          } catch (geocodeError) {
            setAddressValidationStatus('invalid');
            console.warn('⚠️  Geocoding failed:', geocodeError);
          }
        }
        
        // Save address data with coordinates (NO addressLine - not in form!)
        await clientApi.updateProfile({
          city: profileData.city,
          state: profileData.state,
          country: profileData.country,
          postalCode: profileData.postalCode,
          addressLat: addressLat ?? undefined,
          addressLon: addressLon ?? undefined
        });
        
        // Reload profile from backend to confirm save
        const response = await clientApi.getProfile();
        
        // Update timezone in state if backend detected it
        if (response.user?.timezone || response.user?.userTimezone) {
          setProfileData(prev => ({
            ...prev,
            userTimezone: response.user.timezone || response.user.userTimezone
          }));
        }
        
        // Check if backend actually saved the address (postal optional)
        const backendHasAddress = !!(
          response.verification?.city && response.verification.city.trim() &&
          response.verification?.state && response.verification.state.trim() &&
          response.verification?.country && response.verification.country.trim()
        );
        
        // Update saved backend data with actual backend state
        setSavedBackendData(prev => ({
          ...prev,
          hasAddress: backendHasAddress
        }));
        
        if (backendHasAddress) {
          console.log('✅ Address auto-saved and confirmed');
        } else {
          console.warn('⚠️ Address saved but backend validation may have failed');
        }
      } catch (error) {
        console.error('❌ Error auto-saving address:', error);
        toast.error('Failed to save address. Please try again.');
      } finally {
        setIsSavingAddress(false);
      }
    }, 2000);
    
    // Cleanup
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [profileData.city, profileData.state, profileData.country, profileData.postalCode]);

  // Fetch profile data
  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        console.log('🔍 Fetching client profile data');

        // Fetch actual data from backend first
        const response = await clientApi.getProfile();
        console.log('📋 Profile data received:', response);

        // Check if backend has photos
        const backendProfilePhoto = response.verification?.profilePhotoUrl;
        
        // If backend doesn't have photos, clear localStorage to prevent showing old user's photos
        if (!backendProfilePhoto) {
          localStorage.removeItem('profilePicture');
        }

        // Map the response data to component state
        if (response.verification) {
          setProfileData({
            fullName: response.user.name || '',
            phoneNumber: response.verification.phoneNumber || '',
            location: response.verification.location || '',
            addressLine: response.verification.addressLine || '',
            city: response.verification.city || '',
            state: response.verification.state || '',
            country: response.verification.country || '',
            postalCode: response.verification.postalCode || '',
            bio: response.verification.bio || '',
            gender: response.verification.gender || '',
            userTimezone: response.user.timezone || response.user.userTimezone || 'UTC',
            profilePhoto: backendProfilePhoto || '',
            dateOfBirth: response.verification.dateOfBirth || '',
            interests: [],  // TODO: Fetch interests separately
            languages: []   // TODO: Fetch languages separately
          });

          // Set verification status
          setVerificationStatus({
            emailVerified: response.user.emailVerified || false,
            idVerified: response.verification.verificationStatus === 'approved',
            idDocumentUrl: response.verification.idDocumentUrl || undefined
          });

          // Track what's actually saved in backend - ONLY use backend data, not frontend state
          // Also check that fields are not just empty strings
          const backendHasAddress = !!(
            response.verification.city && response.verification.city.trim() &&
            response.verification.state && response.verification.state.trim() &&
            response.verification.country && response.verification.country.trim()
          );
          
          const backendHasPhotos = !!(
            response.verification.profilePhotoUrl && response.verification.profilePhotoUrl.trim()
          );
          
          setSavedBackendData({
            hasAddress: backendHasAddress,
            hasPhotos: backendHasPhotos
          });
          
          console.log('📊 Backend saved data status:', {
            hasAddress: backendHasAddress,
            hasPhotos: backendHasPhotos,
            verificationStatus: response.verification.verificationStatus,
            idVerified: response.verification.verificationStatus === 'approved',
            addressData: {
              addressLine: response.verification.addressLine,
              city: response.verification.city,
              country: response.verification.country,
              postalCode: response.verification.postalCode
            },
            photoData: {
              profilePhoto: response.verification.profilePhotoUrl
            },
            overallComplete: backendHasAddress && backendHasPhotos && (response.verification.verificationStatus === 'approved')
          });
        } else {
          // No verification record yet, use defaults
          setProfileData({
            fullName: response.user.name || '',
            phoneNumber: '',
            location: '',
            addressLine: '',
            city: '',
            state: '',
            country: '',
            postalCode: '',
            bio: '',
            profilePhoto: '', // No fallback to localStorage for new accounts
            dateOfBirth: '',
            gender: '',
            interests: [],
            languages: []
          });

          setVerificationStatus({
            emailVerified: !!response.user.emailVerified, // Use actual email verification status from user
            idVerified: false
          });
          
          // Explicitly set savedBackendData to false when no verification record
          setSavedBackendData({
            hasAddress: false,
            hasPhotos: false
          });
          
          console.log('📊 No verification record - setting all to incomplete');
        }

      } catch (error: any) {
        console.error('❌ Error fetching profile:', error);

        // If error, at least set user's name
        setProfileData(prev => ({
          ...prev,
          fullName: user?.name || ''
        }));

        // Don't show error toast on initial load if profile doesn't exist yet
        if (error.response?.status !== 404) {
          toast.error('Failed to load profile data');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfileData();
  }, [user]);

  // Clear state field when switching to a country without states
  useEffect(() => {
    if (profileData.country) {
      const selectedCountryCode = countryPhoneCodes.find(c => c.name === profileData.country)?.code;
      const statesForCountry = selectedCountryCode ? getStatesForCountry(selectedCountryCode) : [];
      const hasStates = statesForCountry.length > 0;

      // Clear state if country doesn't have states
      if (!hasStates && profileData.state) {
        setProfileData(prev => ({ ...prev, state: '' }));
      }
    }
  }, [profileData.country]);

  // Auto-dismiss success banner after 5 seconds
  useEffect(() => {
    const isComplete = savedBackendData.hasAddress && savedBackendData.hasPhotos && verificationStatus.idVerified;
    
    if (isComplete && showSuccessBanner) {
      const timer = setTimeout(() => {
        setShowSuccessBanner(false);
      }, 5000); // 5 seconds

      return () => clearTimeout(timer);
    }
  }, [savedBackendData.hasAddress, savedBackendData.hasPhotos, verificationStatus.idVerified, showSuccessBanner]);

  // Dummy auto-verification (saves to backend)
  const handleAutoVerification = async () => {
    try {
      setIsVerifying(true);
      
      // Wait 5 seconds (simulating verification)
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      console.log('🔐 Saving verification status to backend...');
      
      // Save verification status to backend
      const updateResponse = await clientApi.updateProfile({ verificationStatus: 'approved' });
      console.log('✅ Verification status saved:', updateResponse);
      
      // Update local state
      setVerificationStatus(prev => ({ ...prev, idVerified: true }));
      
      // Show single success message
      toast.success('Identity verified successfully!');
      
      // Clear the file
      setIdDocumentFile(null);
      setIdDocumentPreview('');
      
      console.log('✅ Verification complete! Status should now persist on refresh.');
    } catch (error) {
      console.error('❌ Error during verification:', error);
      toast.error('Failed to complete verification');
    } finally {
      setIsVerifying(false);
    }
  };

  // Helper to generate file size error message
  const getFileSizeError = (file: File, maxMB: number) => {
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return `File is too large (${fileSizeMB}MB). Maximum size is ${maxMB}MB. Please compress or resize.`;
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(getFileSizeError(file, 5));
        return;
      }

      // Show preview immediately
      setProfilePhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);

      // Auto-upload immediately
      try {
        setIsUploadingProfile(true);
        isSavingPhotosRef.current = true;

        console.log('📸 Auto-uploading profile picture...');
        await clientApi.uploadProfilePhoto(file);
        console.log('✅ Profile picture uploaded successfully');

        // Save to localStorage
        const previewUrl = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onloadend = () => resolve(r.result as string);
          r.readAsDataURL(file);
        });
        localStorage.setItem('profilePicture', previewUrl);

        // Reload profile data from backend
        const response = await clientApi.getProfile();
        const profilePhotoUrl = response.verification?.profilePhotoUrl;
        if (profilePhotoUrl) {
          setProfileData(prev => ({ ...prev, profilePhoto: profilePhotoUrl }));
        }

        // Profile photo uploaded successfully
        setSavedBackendData(prev => ({
          ...prev,
          hasPhotos: true
        }));
        console.log('✅ Profile photo uploaded, updating savedBackendData.hasPhotos to true');

        toast.success('Profile picture uploaded!');
        setProfilePhotoFile(null);
      } catch (error: any) {
        console.error('❌ Error uploading profile picture:', error);

        // Handle specific HTTP status codes
        const status = error.response?.status;
        let errorMessage = 'Failed to upload profile picture';

        if (status === 413) {
          errorMessage = 'Photo is too large. Please use an image under 5MB.';
        } else if (status === 415) {
          errorMessage = 'Invalid file type. Please upload a JPG, PNG, or WebP image.';
        } else if (error.code === 'ERR_NETWORK') {
          errorMessage = 'Network error. Please check your internet connection.';
        } else if (error.response?.data?.message) {
          errorMessage = error.response.data.message;
        }

        toast.error(errorMessage);
      } finally {
        setIsUploadingProfile(false);
        isSavingPhotosRef.current = false;
      }
    }
  };

  const handleIdDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(getFileSizeError(file, 10));
        return;
      }

      setIdDocumentFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setIdDocumentPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const triggerIdInput = () => {
    idInputRef.current?.click();
  };

  const handleInputChange = (field: keyof ProfileData, value: any) => {
    setProfileData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Derived required-completion flags (for UI display only)
  // For actual completion checks, use savedBackendData instead
  const hasProfilePic = !!(profilePhotoPreview || profileData.profilePhoto);
  const hasAddress = !!(profileData.city && profileData.state && profileData.country); // Required fields (postal optional)
  const canSubmitVerification = savedBackendData.hasAddress && savedBackendData.hasPhotos && !!idDocumentFile;

  // Validate profile completion for mandatory fields
  const validateProfile = () => {
    const errors: string[] = [];
    
    // Check address fields (postal code is optional)
    if (!profileData.city || !profileData.state || !profileData.country) {
      errors.push('City, State, and Country are required');
    }
    
    // Check profile picture
    if (!profilePhotoPreview && !profileData.profilePhoto) {
      errors.push('Profile picture is required');
    }
    
    // Check verification status
    if (!verificationStatus.idVerified) {
      // Only show this error if they haven't even submitted verification
      const hasSubmitted = verificationStatus.idDocumentUrl;
      if (!hasSubmitted) {
        errors.push('Please submit verification documents');
      }
    }
    
    return errors;
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

  const handleSave = async () => {
    try {
      setIsSaving(true);

      // Validate profile (show warnings but allow save)
      const validationErrors = validateProfile();
      if (validationErrors.length > 0) {
        toast.error(validationErrors[0], { duration: 4000 });
      }

      // Upload profile photo if changed
      if (profilePhotoFile) {
        try {
          console.log('📸 Uploading profile photo...');
          await clientApi.uploadProfilePhoto(profilePhotoFile);
          console.log('✅ Profile photo uploaded successfully');
        } catch (photoError: any) {
          console.error('❌ Error uploading photo:', photoError);

          // Handle specific HTTP status codes
          const status = photoError.response?.status;
          let errorMessage = 'Failed to upload profile photo';

          if (status === 413) {
            errorMessage = 'Photo is too large. Please use an image under 5MB.';
          } else if (status === 415) {
            errorMessage = 'Invalid file type. Please upload a JPG, PNG, or WebP image.';
          } else if (photoError.code === 'ERR_NETWORK') {
            errorMessage = 'Network error. Please check your internet connection.';
          } else if (photoError.response?.data?.message) {
            errorMessage = photoError.response.data.message;
          }

          toast.error(errorMessage);
          // Continue with profile update even if photo fails
        }
      }

      // Build location string from address components (NO addressLine - not in form)
      const locationParts = [
        profileData.city,
        profileData.state,
        profileData.country,
        profileData.postalCode
      ].filter(part => part && part.trim() !== '');

      const location = locationParts.join(', ');

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
          
          // Update validation status
          if (geocodingSucceeded) {
            setAddressValidationStatus('valid');
          } else {
            setAddressValidationStatus('invalid');
            console.warn('⚠️  Address could not be geocoded - no results found');
          }
        } catch (geocodeError) {
          setAddressValidationStatus('invalid');
          console.warn('⚠️  Geocoding failed:', geocodeError);
        }
      }

      // Save profile data with address fields and coordinates (NO addressLine - not in form!)
      console.log('💾 Saving profile data...');
      await clientApi.updateProfile({
        fullName: profileData.fullName,
        phoneNumber: profileData.phoneNumber,
        city: profileData.city,
        state: profileData.state,
        country: profileData.country,
        postalCode: profileData.postalCode,
        addressLat: addressLat ?? undefined,
        addressLon: addressLon ?? undefined,
        bio: profileData.bio,
        gender: profileData.gender,
        location: location
      });

      console.log('✅ Profile saved successfully');
      
      // Reload profile to get updated timezone
      try {
        const updatedProfile = await clientApi.getProfile();
        if (updatedProfile.user?.timezone || updatedProfile.user?.userTimezone) {
          setProfileData(prev => ({
            ...prev,
            userTimezone: updatedProfile.user.timezone || updatedProfile.user.userTimezone
          }));
        }
      } catch (error) {
        console.warn('Could not reload profile after save:', error);
      }
      
      toast.success('Profile updated successfully!');
      setProfilePhotoFile(null);

      // Check if profile is now complete
      const profileStatus = checkClientProfileCompletion(user);
      const isComplete = validationErrors.length === 0 && profileStatus.isComplete;

      if (isComplete) {
        toast.success('Profile completed! Redirecting to browse companions...', {
          duration: 2000
        });
        // Auto-redirect to browse companions after 1 second
        setTimeout(() => {
          navigate('/browse-companions');
        }, 1000);
      } else {
        // Redirect to dashboard after a brief delay to show the success message
        setTimeout(() => {
          navigate('/client-dashboard');
        }, 1500);
      }

    } catch (error: any) {
      console.error('❌ Error saving profile:', error);
      toast.error(error.response?.data?.message || 'Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitVerificationOld = async () => {
    if (!idDocumentFile) {
      toast.error('Please select an ID document first');
      return;
    }

    if (!profileData.dateOfBirth) {
      toast.error('Please enter your date of birth');
      return;
    }

    try {
      setIsSaving(true);

      // Submit verification using the API
      await clientApi.submitVerification({
        idDocument: idDocumentFile,
        dateOfBirth: profileData.dateOfBirth,
        governmentIdNumber: '' // Optional field
      });

      toast.success('Verification submitted successfully! Redirecting to browse companions...', {
        duration: 2000
      });
      setIdDocumentFile(null);
      setIdDocumentPreview('');
      
      // Update verification status
      setVerificationStatus(prev => ({ 
        ...prev, 
        idVerified: false, // Will be approved by admin, but now pending
        idDocumentUrl: 'pending' // Indicate submission
      }));
      
      // Auto-redirect to browse companions page after 1 second
      setTimeout(() => {
        navigate('/browse-companions');
      }, 1000);
      
    } catch (error: any) {
      console.error('❌ Error submitting verification:', error);
      toast.error(error.response?.data?.message || 'Failed to submit verification');
    } finally {
      setIsSaving(false);
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
              onClick={() => navigate(ROUTES.CLIENT_DASHBOARD)}
              className="px-3 py-1.5 sm:px-4 sm:py-2 text-sm sm:text-base text-gray-600 hover:text-gray-900 font-medium transition-colors self-start sm:self-auto"
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </div>

      {/* Profile Completion Progress Indicator - Only show if not 100% complete */}
      {(() => {
        // Use savedBackendData (actual saved data) instead of frontend form state
        const completedSteps = (savedBackendData.hasAddress ? 1 : 0) + (savedBackendData.hasPhotos ? 1 : 0) + (verificationStatus.idVerified ? 1 : 0);
        
        console.log('📊 Progress bar calculation:', {
          hasAddress: savedBackendData.hasAddress,
          hasPhotos: savedBackendData.hasPhotos,
          idVerified: verificationStatus.idVerified,
          completedSteps
        });
        
        // Hide this section if profile is 100% complete
        if (completedSteps === 3) return null;
        
        return (
          <div className="bg-gradient-to-r from-[#F5F4FB] to-[#FFF0F0] border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <FaShieldAlt className="text-[#312E81]" />
                  Profile Completion
                </h3>
                <span className="text-sm font-medium text-[#312E81]">
                  {completedSteps}/3 Complete
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 mb-3">
                <div 
                  className="bg-gradient-to-r from-[#312E81] to-[#FFCCCB] h-3 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                  style={{ width: `${(completedSteps / 3) * 100}%` }}
                >
                  {completedSteps > 0 && (
                    <span className="text-xs text-white font-semibold">
                      {Math.round((completedSteps / 3) * 100)}%
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md ${savedBackendData.hasAddress ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                  {savedBackendData.hasAddress ? <FaCheck className="flex-shrink-0" /> : <FaExclamationTriangle className="flex-shrink-0" />}
                  <span className="truncate">Address</span>
                </div>
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md ${savedBackendData.hasPhotos ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                  {savedBackendData.hasPhotos ? <FaCheck className="flex-shrink-0" /> : <FaExclamationTriangle className="flex-shrink-0" />}
                  <span className="truncate">Photos</span>
                </div>
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md ${verificationStatus.idVerified ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                  {verificationStatus.idVerified ? <FaCheck className="flex-shrink-0" /> : <FaExclamationTriangle className="flex-shrink-0" />}
                  <span className="truncate">Verification</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Profile Summary (Sticky) */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
              <div className="flex items-center gap-2 mb-6">
                <FaUser className="text-[#312E81] w-5 h-5" />
                <h2 className="text-xl font-semibold text-gray-900">Profile Summary</h2>
              </div>

              <div className="flex flex-col items-center">
                {/* Profile Photo */}
                <div className="mb-4">
                  <div className="w-32 h-32 rounded-full overflow-hidden bg-gradient-to-br from-[#4A47A3] to-[#4A47A3] flex items-center justify-center text-white text-4xl font-bold">
                      {profileData.profilePhoto || profilePhotoPreview ? (
                      <img src={profilePhotoPreview || profileData.profilePhoto} alt="Profile" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                    ) : (
                      profileData.fullName.charAt(0).toUpperCase()
                      )}
                    </div>
                </div>

                {/* Name */}
                <h3 className="text-2xl font-semibold text-gray-900 mb-2">{profileData.fullName || 'Your Name'}</h3>
                
                {/* Role Badge */}
                <span className="inline-block bg-[#312E81] text-white px-4 py-1 rounded-full text-sm font-medium mb-4">
                  Client
                </span>

                {/* Contact Info */}
                <div className="w-full space-y-3 mb-6">
                  <div className="flex items-center gap-3 text-gray-600">
                    <FaMapMarkerAlt className="text-gray-400 w-4 h-4" />
                    <span className="text-sm">
                      {profileData.city && profileData.country
                        ? `${profileData.city}, ${profileData.country}`
                        : 'Not specified'}
                    </span>
                  </div>
                </div>

                {/* Account Status */}
                <div className="w-full border-t border-gray-100 pt-4">
                  <div className="space-y-3">
                    {/* Email Verification */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FaEnvelope className="text-gray-400 text-sm" />
                        <span className="text-sm text-gray-600">Email</span>
                      </div>
                      {verificationStatus.emailVerified ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-full">
                          <FaCheck className="text-xs" /> Verified
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
                          <FaExclamationTriangle className="text-xs" /> Pending
                        </span>
                      )}
                    </div>

                    {/* ID Verification */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FaIdCard className="text-gray-400 text-sm" />
                        <span className="text-sm text-gray-600">ID Verified</span>
                      </div>
                      {verificationStatus.idVerified ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-full">
                          <FaCheck className="text-xs" /> Verified
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
                          <FaExclamationTriangle className="text-xs" /> Pending
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Edit Profile Form (Reorganized) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Success Banner - Profile Complete (Auto-dismiss) */}
            {(() => {
              const isComplete = savedBackendData.hasAddress && savedBackendData.hasPhotos && verificationStatus.idVerified;
              
              if (!isComplete || !showSuccessBanner) return null;
              
              return (
                <div className="bg-gradient-to-r from-green-50 to-green-100 border-2 border-green-500 rounded-xl p-6 text-center relative">
                  <button
                    onClick={() => setShowSuccessBanner(false)}
                    className="absolute top-4 right-4 text-green-600 hover:text-green-800"
                    title="Dismiss"
                  >
                    <FaTimes className="w-5 h-5" />
                  </button>
                  
                  <div className="inline-flex items-center justify-center w-12 h-12 bg-green-500 rounded-full mb-3">
                    <FaCheck className="w-6 h-6 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-green-900 mb-2">Profile Complete! 🎉</h2>
                  <p className="text-green-700 mb-4">You can now browse and book companions</p>
                  <button
                    onClick={() => navigate(ROUTES.CLIENT_DASHBOARD)}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
                  >
                    Go to Dashboard
                  </button>
                </div>
              );
            })()}

            {/* Required for Booking - Only show if not complete */}
            {(() => {
              const isComplete = savedBackendData.hasAddress && savedBackendData.hasPhotos && verificationStatus.idVerified;
              
              // Don't hide section while saving photos to prevent layout shift
              if (isComplete && !isSavingPhotosRef.current) return null;
              
              return (
                <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                  <div className="flex items-center gap-2 mb-6">
                    <FaShieldAlt className="text-[#312E81] w-5 h-5" />
                    <h2 className="text-xl font-semibold text-gray-900">Required for Booking</h2>
                  </div>

              <div className="space-y-6">
                {/* Address Section (Step 1) */}
                <div className="rounded-lg p-4 border-l-4 border-[#312E81]">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <FaMapMarkerAlt className="text-[#312E81]" />
                      Step 1: Complete Address <span className="text-red-500">*</span>
                    </h3>
                    {isSavingAddress && (
                      <span className="text-xs text-blue-600 flex items-center gap-1">
                        <FaSpinner className="animate-spin" />
                        Saving...
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 mb-4">Your address is required for verification and service area definition. Changes auto-save as you type.</p>
                  
                  <div className="space-y-4">
                    {/* Country */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Country <span className="text-red-500">*</span>
                      </label>
                      <select 
                        value={profileData.country} 
                        onChange={(e)=>{
                          setProfileData({...profileData, country: e.target.value, state: ''});
                        }} 
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#312E81] focus:border-transparent" 
                        required
                      >
                        <option value="">Select a country</option>
                        {countryPhoneCodes.sort((a,b)=>a.name.localeCompare(b.name)).map((country)=>(
                          <option key={country.code} value={country.name}>{country.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* City + State/Province (parallel) */}
                    {(() => {
                      const selectedCountryCode = countryPhoneCodes.find(c => c.name === profileData.country)?.code;
                      const statesForCountry = selectedCountryCode ? getStatesForCountry(selectedCountryCode) : [];
                      const hasStates = statesForCountry.length > 0;
                      const getStateLabel = () => {
                        switch(selectedCountryCode) {
                          case 'US': return 'State';
                          case 'CA': return 'Province';
                          case 'GB': return 'Region';
                          case 'AU': return 'State/Territory';
                          case 'IN': return 'State';
                          case 'DE': return 'Federal State';
                          case 'FR': return 'Region';
                          default: return 'State/Province';
                        }
                      };
                      
                      return (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* City */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              City <span className="text-red-500">*</span>
                            </label>
                            <input 
                              type="text" 
                              value={profileData.city} 
                              onChange={(e)=>setProfileData({...profileData, city: e.target.value})} 
                              placeholder="Enter your city" 
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#312E81] focus:border-transparent" 
                              required 
                            />
                          </div>

                          {/* State/Province */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              {getStateLabel()} {hasStates && <span className="text-red-500">*</span>}
                            </label>
                            {hasStates ? (
                              <select 
                                value={profileData.state} 
                                onChange={(e)=>setProfileData({...profileData, state: e.target.value})} 
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#312E81] focus:border-transparent" 
                                required
                              >
                                <option value="">Select {getStateLabel().toLowerCase()}</option>
                                {statesForCountry.map((state) => (
                                  <option key={state.name} value={state.abbreviation || state.name}>
                                    {state.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input 
                                type="text" 
                                value={profileData.state} 
                                onChange={(e)=>setProfileData({...profileData, state: e.target.value})} 
                                placeholder="Enter state/province" 
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#312E81] focus:border-transparent" 
                              />
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Postal/ZIP Code */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Postal/Zip Code
                      </label>
                      <input
                        type="text"
                        value={profileData.postalCode}
                        onChange={(e)=>setProfileData({...profileData, postalCode: e.target.value})}
                        placeholder="Enter postal/zip code"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#312E81] focus:border-transparent"
                      />
                    </div>

                    {/* Timezone Display (Auto-Detected) */}
                    {profileData.userTimezone && profileData.userTimezone !== 'UTC' && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <div className="flex items-center gap-2">
                          <FaGlobe className="text-blue-600" />
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              Detected Timezone: {profileData.userTimezone}
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                              Auto-detected from your address. All booking times will be shown in your local time.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Phone Number */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Phone Number
                      </label>
                      <PhoneNumberInput
                        value={profileData.phoneNumber}
                        onChange={(value) => setProfileData({ ...profileData, phoneNumber: value })}
                        placeholder="Enter your phone number"
                      />
                    </div>
                  </div>
                </div>

                {/* Photos Section (Step 2) */}
                <div className="rounded-lg p-4 border-l-4 border-[#312E81]">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <FaCamera className="text-[#312E81]" />
                    Step 2: Upload Profile Photo <span className="text-red-500">*</span>
                  </h3>
                  <p className="text-xs text-gray-600 mb-4">Profile photo is required for profile completion. Photo uploads automatically when selected.</p>
                  
                  <div className="flex justify-center mb-4">
                    {/* Profile Photo Upload */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 text-center">
                        Profile Picture <span className="text-red-500">*</span>
                      </label>
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-32 h-32 rounded-full overflow-hidden bg-gradient-to-br from-[#4A47A3] to-[#4A47A3] flex items-center justify-center text-white text-xl font-bold shadow-lg">
                          {profileData.profilePhoto || profilePhotoPreview ? (
                            <img src={profilePhotoPreview || profileData.profilePhoto} alt="Profile" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                          ) : (
                            <FaCamera className="text-5xl opacity-50" />
                          )}
                        </div>
                        <button 
                          type="button"
                          onClick={triggerFileInput}
                          className="flex items-center gap-2 px-4 py-2 bg-[#312E81] text-white rounded-lg hover:bg-[#1E1B4B] transition-colors"
                        >
                          <FaUpload className="w-4 h-4" />
                          {profileData.profilePhoto || profilePhotoPreview ? 'Change Photo' : 'Upload Photo'}
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoChange}
                          className="hidden"
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-2 text-center">
                        {isUploadingProfile ? 'Uploading...' : profilePhotoFile ? `✓ ${profilePhotoFile.name}` : 'Max 5MB, JPG/PNG'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Verification Section (Step 3) - Simplified */}
                <div className="rounded-lg p-4 border-l-4 border-[#312E81]">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <FaIdCard className="text-[#312E81]" />
                    Step 3: Verify Identity <span className="text-red-500">*</span>
                  </h3>
                  {!verificationStatus.idVerified ? (
                    <>
                      <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded mb-4">
                        <p className="text-sm text-blue-800">
                          <FaShieldAlt className="inline mr-1" />
                          Upload government-issued ID for automatic instant verification (not stored)
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Government ID <span className="text-red-500">*</span></label>
                        <div className="flex items-center gap-3">
                          <button 
                            type="button" 
                            onClick={triggerIdInput}
                            disabled={!savedBackendData.hasAddress || !savedBackendData.hasPhotos}
                            className="flex items-center gap-2 px-4 py-2 bg-[#312E81] text-white rounded-lg hover:bg-[#1E1B4B] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <FaUpload className="w-4 h-4" />
                            {idDocumentFile ? 'Change Document' : 'Upload Document'}
                          </button>
                          <input ref={idInputRef} type="file" accept="image/*,.pdf" onChange={handleIdDocumentChange} className="hidden" />
                          <span className="text-xs text-gray-500">{idDocumentFile ? `✓ ${idDocumentFile.name}` : 'Max 10MB JPG/PNG/PDF'}</span>
                        </div>
                        {(!savedBackendData.hasAddress || !savedBackendData.hasPhotos) && (
                          <p className="text-xs text-amber-600 mt-2">
                            ⚠️ Complete address and upload both photos first to enable ID verification
                          </p>
                        )}
                      </div>
                      {idDocumentFile && (
                        <div className="flex justify-center pt-6">
                          <button 
                            onClick={handleAutoVerification}
                            disabled={isVerifying}
                            className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                          >
                            {isVerifying ? (
                              <>
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                Verifying...
                              </>
                            ) : (
                              <>
                                <FaCheck />
                                Submit for Auto-Verification
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-lg p-4 bg-green-50 border-2 border-green-200">
                      <div className="flex items-center gap-2">
                        <FaCheck className="text-green-600 w-5 h-5" />
                        <div>
                          <span className="font-semibold text-green-900">Identity Verified</span>
                          <p className="text-sm text-green-700">You can now book companions</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
              );
            })()}

          {/* Optional Details - Only show after profile complete */}
          {(() => {
            const isComplete = savedBackendData.hasAddress && savedBackendData.hasPhotos && verificationStatus.idVerified;
            if (!isComplete) return null;
            
            return (
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Additional Details</h2>
              <p className="text-sm text-gray-500 mt-1">Optional information to enhance your profile</p>
            </div>
            
            <div className="space-y-4 mt-6">
                {/* Personal Information Card */}
                <div className="bg-gradient-to-br from-purple-50 to-white rounded-lg p-6 border border-purple-100">
                  <div className="flex items-center gap-2 mb-4">
                    <FaUser className="text-[#312E81] w-5 h-5" />
                    <h3 className="text-lg font-semibold text-gray-900">Personal Information</h3>
                  </div>
                  
                  <div className="space-y-4">
                    {/* Full Name */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                      <input 
                        type="text" 
                        value={profileData.fullName} 
                        onChange={(e)=>setProfileData({...profileData, fullName: e.target.value})} 
                        placeholder="Enter your full name"
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#312E81] focus:border-transparent transition-[colors,border-color,box-shadow] duration-200"
                      />
                    </div>
                    
                    {/* Phone Number */}
                    <div>
                      <PhoneNumberInput 
                        value={profileData.phoneNumber} 
                        onChange={(fullNumber)=>{setProfileData({...profileData, phoneNumber: fullNumber});}} 
                        label="Phone Number" 
                        placeholder="Enter your phone number" 
                      />
                    </div>

                    {/* Gender */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
                      <select
                        value={profileData.gender}
                        onChange={(e) => setProfileData({ ...profileData, gender: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#312E81] focus:border-transparent transition-[colors,border-color,box-shadow] duration-200"
                      >
                        <option value="">Select your gender</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                        <option value="prefer_not_to_say">Prefer not to say</option>
                      </select>
                    </div>
                    
                    {/* Bio - Full Width */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Bio
                        <span className="text-xs text-gray-500 ml-2">{profileData.bio.length}/500 characters</span>
                      </label>
                      <textarea 
                        value={profileData.bio} 
                        onChange={(e)=>setProfileData({...profileData, bio: e.target.value})} 
                        placeholder="Tell us about yourself, your hobbies, and what you're looking for..." 
                        rows={4}
                        maxLength={500}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#312E81] focus:border-transparent resize-none transition-[colors,border-color,box-shadow] duration-200"
                      />
                    </div>
                  </div>
                </div>

                {/* Preferences Card */}
                <div className="bg-gradient-to-br from-blue-50 to-white rounded-lg p-6 border border-blue-100">
                  <div className="flex items-center gap-2 mb-4">
                    <FaHeart className="text-pink-500 w-5 h-5" />
                    <h3 className="text-lg font-semibold text-gray-900">Preferences & Interests</h3>
                  </div>
                  
                  <div className="space-y-6">
                    {/* Interests & Hobbies */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        Interests & Hobbies
                        <span className="text-xs text-gray-500 ml-2">({profileData.interests.length}/10 selected)</span>
                      </label>
                      <InterestSelector 
                        selectedInterests={profileData.interests} 
                        onInterestsChange={(interests)=>handleInputChange('interests', interests)} 
                        maxSelections={10} 
                      />
                      <p className="text-xs text-gray-500 mt-2">Select interests to help match with companions who share similar hobbies</p>
                    </div>
                    
                    {/* Languages */}
                    <div className="pt-4 border-t border-blue-200">
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        Languages Spoken
                        <span className="text-xs text-gray-500 ml-2">({profileData.languages.length}/10 selected)</span>
                      </label>
                      <LanguageSelector 
                        selectedLanguages={profileData.languages} 
                        onLanguagesChange={(languages)=>handleInputChange('languages', languages)} 
                        maxSelections={10} 
                      />
                      <p className="text-xs text-gray-500 mt-2">Select languages you speak to find companions who can communicate with you</p>
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end pt-2">
                  <button 
                    onClick={handleSave} 
                    disabled={isSaving} 
                    className="px-8 py-3 bg-[#312E81] text-white rounded-lg font-semibold hover:bg-[#1E1B4B] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md"
                  >
                    <FaSave className="w-4 h-4" />
                    {isSaving ? 'Saving...' : 'Save Additional Details'}
                  </button>
                </div>
            </div>
          </div>
            );
          })()}

            {/* Delete Profile Section */}
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
          </div>
        </div>

        {/* Delete Profile Modal */}
        {showDeleteModal && (
          <DeleteProfileModal
            isOpen={showDeleteModal}
            onClose={() => setShowDeleteModal(false)}
            onConfirm={handleDeleteProfile}
            isDeleting={isDeleting}
          />
        )}
      </main>
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
  useModalRegistration('delete-profile-modal-client', isOpen);

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

export default ClientProfile;

