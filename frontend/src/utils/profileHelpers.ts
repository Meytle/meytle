/**
 * Profile Helpers
 * Utilities for checking client profile completion status
 */

export interface ProfileCompletionStatus {
  isComplete: boolean;
  missingFields: string[];
  hasAddress: boolean;
  hasProfilePicture: boolean;
  hasAdditionalPhoto?: boolean; // Optional - not required for completion but tracked for display
  hasVerification: boolean;
}

/**
 * Check if a client's profile is complete (3-step process)
 * Step 1: Address (city, state, country - postalCode optional)
 * Step 2: Photos (profilePicture ONLY - no additional photo required)
 * Step 3: Verification (verificationStatus submitted/approved)
 */
export const checkClientProfileCompletion = (user: any): ProfileCompletionStatus => {
  const missing: string[] = [];
  
  // Step 1: Check address (city, state, country required; zipCode optional)
  const hasAddress = !!(
    user?.city && 
    user?.state && 
    user?.country
  );
  
  // Step 2: Check photos (ONLY profile picture required)
  const hasProfilePicture = !!user?.profilePicture;
  
  // Step 3: Check verification (submitted = pending or approved, not rejected)
  const hasVerification = user?.verificationStatus && 
    user?.verificationStatus !== 'not_submitted' && 
    user?.verificationStatus !== 'rejected';
  
  // Build missing fields list for 3-step process
  if (!hasAddress) missing.push('Complete Address');
  if (!hasProfilePicture) missing.push('Profile Photo');
  if (!hasVerification) missing.push('Identity Verification');
  
  return {
    isComplete: missing.length === 0,
    missingFields: missing,
    hasAddress,
    hasProfilePicture,
    hasVerification
  };
};

/**
 * Calculate profile completion percentage (3-step process)
 */
export const getProfileCompletionPercentage = (status: ProfileCompletionStatus): number => {
  let completed = 0;
  const total = 3; // 3-step process
  
  if (status.hasAddress) completed++;
  if (status.hasProfilePicture) completed++; // Photos step requires only profile picture
  if (status.hasVerification) completed++;
  
  return Math.round((completed / total) * 100);
};

/**
 * Get completion count (e.g., "3/4")
 */
export const getCompletionCount = (status: ProfileCompletionStatus): { completed: number; total: number } => {
  // 3-step model: Address, Photos (profile picture only), Verification
  let completed = 0;
  const total = 3;

  if (status.hasAddress) completed++;
  if (status.hasProfilePicture) completed++;
  if (status.hasVerification) completed++;

  return { completed, total };
};

// New: compute 3-step completion from full profile payload (server)
// 3-step process: Address → Photos (profile picture only) → Verification
export const computeCompletionFromProfile3 = (profile: any): ProfileCompletionStatus => {
  const verification = profile?.verification || {};
  const user = profile?.user || {};

  // Step 1: Address - check from EITHER users table OR client_verifications table
  // Address can be stored in either location depending on save flow
  // Note: postalCode is optional, only city, state, and country are required
  const hasAddressFromUsers = !!(user.city && user.state && user.country);
  const hasAddressFromVerification = !!(
    verification.city &&
    verification.state &&
    verification.country
  );
  const hasAddress = hasAddressFromUsers || hasAddressFromVerification;

  // Step 2: Photos - only profile photo required (no additional photo)
  const hasProfilePictureFromUser = !!user.profilePicture;
  const hasProfilePictureFromVerification = !!verification.profilePhotoUrl;
  const hasProfilePictureFromStorage = !!localStorage.getItem('profilePicture');
  const hasProfilePicture = hasProfilePictureFromUser || hasProfilePictureFromVerification || hasProfilePictureFromStorage;
  
  const hasPhotos = hasProfilePicture; // Only profile picture required

  // Step 3: Verification - check verification status from client_verifications table
  const hasVerification = !!(
    verification.verificationStatus && 
    verification.verificationStatus !== 'not_submitted' && 
    verification.verificationStatus !== 'rejected'
  );

  // Build missing fields list for 3-step process
  const missing: string[] = [];
  if (!hasAddress) missing.push('Complete Address');
  if (!hasPhotos) missing.push('Profile Photo');
  if (!hasVerification) missing.push('Identity Verification');

  console.log('🔍 Profile Completion Check:', {
    hasAddress: { users: hasAddressFromUsers, verification: hasAddressFromVerification, final: hasAddress },
    hasPhotos: { 
      profilePic: { user: hasProfilePictureFromUser, verification: hasProfilePictureFromVerification, storage: hasProfilePictureFromStorage, final: hasProfilePicture },
      final: hasPhotos 
    },
    hasVerification,
    missing,
    isComplete: missing.length === 0
  });

  return {
    isComplete: missing.length === 0,
    missingFields: missing,
    hasAddress,
    hasProfilePicture,
    hasVerification
  };
};

/**
 * Check if a companion's profile is complete (3-step process)
 * Step 1: Address (addressLine, city, state, country, postalCode)
 * Step 2: Photos (profilePhoto + additionalPhoto1 + additionalPhoto2 - all 3 required)
 * Step 3: Veriff Verification (verificationStatus = 'approved')
 */
export interface CompanionProfileCompletionStatus {
  isComplete: boolean;
  completedSteps: number;
  totalSteps: number;
  hasAddress: boolean;
  hasAllPhotos: boolean;
  hasVerification: boolean;
}

export const checkCompanionProfileCompletion = (application: any): CompanionProfileCompletionStatus => {
  // Step 1: Check address (city, state, country required; postalCode optional)
  const hasAddress = !!(
    application?.city && 
    application?.state &&
    application?.country
  );
  
  // Step 2: Check photos (ALL 3 required: profile + 2 additional)
  const hasProfilePhoto = !!application?.profilePhotoUrl;
  const hasAdditionalPhoto1 = !!application?.additionalPhoto1Url;
  const hasAdditionalPhoto2 = !!application?.additionalPhoto2Url;
  const hasAllPhotos = hasProfilePhoto && hasAdditionalPhoto1 && hasAdditionalPhoto2;
  
  // Step 3: Check Veriff verification (must be 'approved')
  const hasVerification = application?.verificationStatus === 'approved';
  
  // Calculate completed steps
  let completedSteps = 0;
  if (hasAddress) completedSteps++;
  if (hasAllPhotos) completedSteps++;
  if (hasVerification) completedSteps++;
  
  return {
    isComplete: completedSteps === 3,
    completedSteps,
    totalSteps: 3,
    hasAddress,
    hasAllPhotos,
    hasVerification
  };
};

/**
 * Calculate companion profile completion percentage
 */
export const getCompanionProfileCompletionPercentage = (status: CompanionProfileCompletionStatus): number => {
  return Math.round((status.completedSteps / status.totalSteps) * 100);
};


