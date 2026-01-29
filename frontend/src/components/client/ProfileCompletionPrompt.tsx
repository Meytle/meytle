/**
 * Profile Completion Prompt
 * Shown to clients who haven't completed their profile
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUserEdit, FaExclamationCircle, FaCheckCircle, FaCamera, FaMapMarkerAlt, FaIdCard } from 'react-icons/fa';
import { useAuth } from '../../hooks/useAuth';
import clientApi from '../../api/client';
import { computeCompletionFromProfile3, getCompletionCount, type ProfileCompletionStatus } from '../../utils/profileHelpers';

const ProfileCompletionPrompt = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState<ProfileCompletionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const checkCompletion = async () => {
      try {
        setIsLoading(true);
        console.log('🔄 ProfileCompletionPrompt: Fetching profile data...');
        const profile = await clientApi.getProfile();
        if (!mounted) return;
        
        console.log('📋 ProfileCompletionPrompt: Profile data received:', profile);
        const completionStatus = computeCompletionFromProfile3(profile);
        console.log('✅ ProfileCompletionPrompt: Completion status:', completionStatus);
        
        setStatus(completionStatus);
      } catch (e) {
        console.error('❌ ProfileCompletionPrompt: Error fetching profile:', e);
        // Fallback: treat as incomplete if load fails
        if (!mounted) return;
        setStatus({
          isComplete: false,
          missingFields: ['Complete Address', 'Profile and Additional Photos', 'Identity Verification'],
          hasAddress: false,
          hasProfilePicture: false,
          hasAdditionalPhoto: false,
          hasVerification: false
        });
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    
    checkCompletion();
    return () => { mounted = false; };
  }, [user?.id]);

  const completed = status ? getCompletionCount(status).completed : 0;
  const total = status ? getCompletionCount(status).total : 3;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#F5F4FB] to-[#FFF0F0] flex items-center justify-center p-4">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#312E81] mb-4"></div>
          <p className="text-gray-600">Checking your profile...</p>
        </div>
      </div>
    );
  }

  const requirementsList = [
    {
      id: 'address',
      label: 'Complete Address',
      description: 'City, state, and country',
      icon: FaMapMarkerAlt,
      completed: !!status?.hasAddress
    },
    {
      id: 'photos',
      label: 'Profile Photo',
      description: 'Upload your profile picture',
      icon: FaCamera,
      completed: !!status?.hasProfilePicture
    },
    {
      id: 'verification',
      label: 'Identity Verification',
      description: 'Government ID and selfie with ID',
      icon: FaIdCard,
      completed: !!status?.hasVerification
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F5F4FB] to-[#FFF0F0] flex items-center justify-center p-4">
      <div className="max-w-3xl w-full bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#312E81] to-[#FFCCCB] p-8 text-center">
          <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
            <FaUserEdit className="text-4xl text-[#312E81]" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Complete Your Profile
          </h1>
          <p className="text-white/90 text-lg">
            {completed} of {total} steps completed
          </p>
          <div className="w-full bg-white/20 rounded-full h-2 mt-4 max-w-md mx-auto">
            <div
              className="bg-white h-2 rounded-full transition-all duration-500"
              style={{ width: `${(completed / total) * 100}%` }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          <div className="text-center mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Before you can browse companions
            </h2>
            <p className="text-gray-600">
              Please complete the following requirements to ensure a safe and trusted community
            </p>
          </div>

          {/* Requirements List */}
          <div className="space-y-4 mb-8">
            {requirementsList.map((requirement) => {
              const Icon = requirement.icon;
              return (
                <div
                  key={requirement.id}
                  className={`
                    flex items-start gap-4 p-4 rounded-lg border-2 transition-all
                    ${requirement.completed
                      ? 'bg-green-50 border-green-200'
                      : 'bg-gray-50 border-gray-200'
                    }
                  `}
                >
                  <div className={`
                    flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center
                    ${requirement.completed
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-300 text-gray-600'
                    }
                  `}>
                    {requirement.completed ? (
                      <FaCheckCircle className="text-xl" />
                    ) : (
                      <Icon className="text-lg" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">
                      {requirement.label}
                      {!requirement.completed && <span className="text-red-500 ml-1">*</span>}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {requirement.description}
                    </p>
                  </div>
                  {requirement.completed && (
                    <div className="flex-shrink-0 text-sm font-medium text-green-600">
                      ✓ Complete
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Missing Items Alert */}
          {status && status.missingFields.length > 0 && (
            <div className="bg-orange-50 border-2 border-orange-200 rounded-lg p-4 mb-8">
              <div className="flex items-start gap-3">
                <FaExclamationCircle className="text-orange-500 text-xl flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-orange-900 mb-2">
                    Missing Information
                  </h4>
                  <ul className="space-y-1">
                    {status.missingFields.map(field => (
                      <li key={field} className="text-sm text-orange-800">
                        • {field}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={() => navigate('/client-profile')}
            className="w-full px-8 py-4 bg-gradient-to-r from-[#312E81] to-[#FFCCCB] text-white font-semibold rounded-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-200 text-lg"
          >
            Complete Profile Now
          </button>

          {/* Help Text */}
          <p className="text-center text-sm text-gray-500 mt-6">
            This usually takes less than 5 minutes to complete
          </p>
        </div>
      </div>
    </div>
  );
};

export default ProfileCompletionPrompt;



