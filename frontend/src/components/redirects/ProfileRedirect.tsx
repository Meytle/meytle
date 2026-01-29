import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const ProfileRedirect = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/signin');
      return;
    }

    // Redirect based on user role
    switch (user.activeRole) {
      case 'admin':
        // Admins might not have a profile page, redirect to dashboard
        navigate('/admin-dashboard', { replace: true });
        break;
      case 'companion':
        navigate('/companion-profile', { replace: true });
        break;
      case 'client':
        navigate('/client-profile', { replace: true });
        break;
      default:
        navigate('/', { replace: true });
    }
  }, [user, navigate]);

  // Show loading while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#312E81]"></div>
        <p className="mt-4 text-gray-600">Redirecting to your profile...</p>
      </div>
    </div>
  );
};

export default ProfileRedirect;