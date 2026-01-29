/**
 * Authentication Context
 * Provides shared authentication state across the entire application
 */

import { createContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { authApi } from '../api/auth';
import type { User, SignInData, SignUpData, UserRole } from '../types';
import { ROUTES, TOAST_MESSAGES } from '../constants';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isInitialized: boolean;
  signIn: (credentials: SignInData) => Promise<void>;
  signUp: (userData: SignUpData) => Promise<void>;
  signOut: () => Promise<void>;
  checkAuth: () => Promise<void>;
  switchRole: (role: UserRole, options?: { skipNavigation?: boolean }) => Promise<void>;
  hasRole: (role: UserRole) => boolean;
  canAccessRole: (role: UserRole) => boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

// Helper to get cookie value
const getCookie = (name: string): string | null => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() || null;
  }
  return null;
};

// Synchronously get initial auth state from cookies only
const getInitialAuthState = (): { user: User | null; hasValidAuth: boolean } => {
  try {
    // Get user data from the userData cookie (not httpOnly, so frontend can read it)
    const userDataCookie = getCookie('userData');
    if (userDataCookie) {
      const parsedUser = JSON.parse(decodeURIComponent(userDataCookie));
      if (parsedUser && parsedUser.id && parsedUser.email) {
        const user = {
          ...parsedUser,
          emailVerified: !!(parsedUser.email_verified ?? parsedUser.emailVerified), // Handle 0/1 and snake/camel case
          roles: parsedUser.roles || (parsedUser.activeRole ? [parsedUser.activeRole] : [])
        };
        return { user, hasValidAuth: true };
      }
    }

    return { user: null, hasValidAuth: false };
  } catch (error) {
    console.error('Error reading initial auth state from cookies:', error);
    return { user: null, hasValidAuth: false };
  }
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
  // Initialize state synchronously from cookies
  const initialAuth = getInitialAuthState();
  const [user, setUser] = useState<User | null>(initialAuth.user);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(true); // Already initialized from cookies
  const navigate = useNavigate();

  // Refresh auth from backend API (updates cookies with fresh data)
  const checkAuth = useCallback(async (): Promise<void> => {
    try {
      const response = await authApi.getProfile();
      if (response.data?.user) {
        const userData = response.data.user;
        const user = {
          ...userData,
          emailVerified: !!(userData.email_verified ?? userData.emailVerified), // Handle 0/1 and snake/camel case
          roles: userData.roles || (userData.activeRole ? [userData.activeRole] : [])
        };
        setUser(user);
      }
    } catch {
      // If API call fails, fall back to reading from cookies
      const currentAuth = getInitialAuthState();
      setUser(currentAuth.user);
    }
  }, []);

  // Auto-refresh auth when redirected from email verification
  // This runs once on mount and ensures fresh data from API
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const verified = urlParams.get('verified');

    if (verified && initialAuth.hasValidAuth) {
      // Call checkAuth to get fresh data from API
      checkAuth().then(() => {
        // Clean up the URL parameter without causing a re-render
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('verified');
        window.history.replaceState({}, '', newUrl.toString());
      }).catch(() => {
        // Silent fail - cookies still have data
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only on mount

  // Helper functions for role management
  const hasRole = useCallback((role: UserRole): boolean => {
    return user?.roles?.includes(role) ?? false;
  }, [user]);

  const canAccessRole = useCallback((role: UserRole): boolean => {
    return hasRole(role);
  }, [hasRole]);

  useEffect(() => {
    // Listen for auth-expired event from axios interceptor
    const handleAuthExpired = () => {
      console.log('🔒 Auth expired event received - clearing auth state');
      // Clear user state (cookies are cleared server-side)
      setUser(null);
      // Let ProtectedRoute handle the redirect
    };

    window.addEventListener('auth-expired', handleAuthExpired);

    return () => {
      window.removeEventListener('auth-expired', handleAuthExpired);
    };
  }, []);

  const signIn = async (credentials: SignInData) => {
    setIsLoading(true);
    try {
      const response = await authApi.signIn(credentials);
      console.log('🔍 Sign-in response structure:', {
        hasData: !!response.data,
        hasUser: !!response.data?.user,
        dataKeys: Object.keys(response.data || {}),
        userKeys: Object.keys(response.data?.user || {})
      });
      // AuthApi returns backend response, so response.data.user is correct
      const authenticatedUser = response.data.user;
      setUser(authenticatedUser);

      toast.success(TOAST_MESSAGES.SIGN_IN_SUCCESS);
      
      // Redirect based on user's active role - ONLY on initial sign-in
      if (authenticatedUser.activeRole === 'admin') {
        // Admin users go to admin dashboard
        console.log('👑 Admin user - redirecting to admin dashboard');
        navigate(ROUTES.ADMIN_DASHBOARD, { replace: true });
      } else if (authenticatedUser.activeRole === 'companion') {
        // Navigate directly to companion dashboard
        // The dashboard will handle checking application status
        console.log('👥 Companion user - redirecting to dashboard');
        navigate(ROUTES.COMPANION_DASHBOARD, { replace: true });
      } else {
        navigate(ROUTES.CLIENT_DASHBOARD, { replace: true });
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || TOAST_MESSAGES.SIGN_IN_ERROR;
      toast.error(errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signUp = async (userData: SignUpData) => {
    setIsLoading(true);
    try {
      console.log('🚀 Starting sign-up process with data:', userData);
      const response = await authApi.signUp(userData);
      console.log('✅ Sign-up API response:', response);

      // AuthApi returns backend response, so response.data.user is correct
      const newUser = response.data.user;
      console.log('👤 New user data:', newUser);

      // Validate user object structure
      if (!newUser || !newUser.id || !newUser.activeRole) {
        console.error('❌ Invalid user object structure:', newUser);
        throw new Error('Invalid user data received from server');
      }

      // Auth data is already stored as cookies by the backend
      // Just verify user data is accessible
      const storedUser = authApi.getCurrentUser();
      const isAuthenticated = authApi.isAuthenticated();

      if (!storedUser || !isAuthenticated) {
        console.error('❌ Auth data not accessible after signup!');
        throw new Error('Failed to access authentication data');
      }

      console.log('✅ Auth verified:', {
        userId: newUser.id,
        role: newUser.activeRole,
        isAuthenticated: isAuthenticated
      });

      // Set user in state and mark as initialized
      setUser(newUser);
      setIsInitialized(true);

      // Show success message
      toast.success(TOAST_MESSAGES.SIGN_UP_SUCCESS);

      console.log('✅ Auth verified, navigating based on role:', newUser.activeRole);
      
      // Redirect based on user's active role
      if (newUser.activeRole === 'admin') {
        console.log('👑 Redirecting admin to admin dashboard');
        navigate(ROUTES.ADMIN_DASHBOARD, { replace: true });
      } else if (newUser.activeRole === 'companion') {
        console.log('🔄 Redirecting companion to application page');
        navigate(ROUTES.COMPANION_APPLICATION, { replace: true });
      } else {
        console.log('👤 Redirecting client to client dashboard');
        navigate(ROUTES.CLIENT_DASHBOARD, { replace: true });
      }
    } catch (error: any) {
      console.error('❌ Sign-up error details:', {
        error,
        response: error.response,
        data: error.response?.data,
        status: error.response?.status,
        message: error.response?.data?.message
      });
      const errorMessage = error.response?.data?.message || TOAST_MESSAGES.SIGN_UP_ERROR;
      toast.error(errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    await authApi.signOut();
    setUser(null);
    
    // Clear cached profile photo from localStorage to prevent showing it to next user
    localStorage.removeItem('profilePicture');
    
    toast.success(TOAST_MESSAGES.SIGN_OUT_SUCCESS);
    navigate(ROUTES.HOME);
  };

  const switchRole = async (role: UserRole, options?: { skipNavigation?: boolean }) => {
    if (!user || !hasRole(role)) {
      throw new Error('You do not have permission to switch to this role');
    }

    setIsLoading(true);
    try {
      const response = await authApi.switchRole({ role });
      const updatedUser = response.data.user;

      // Update user state with new active role
      setUser(prevUser => prevUser ? {
        ...prevUser,
        activeRole: updatedUser.activeRole,
        roles: updatedUser.roles
      } : null);

      toast.success(`Successfully switched to ${role} role`);

      // Only redirect if not explicitly skipped (prevents reload loops when already on dashboard)
      if (!options?.skipNavigation) {
        if (role === 'admin') {
          navigate(ROUTES.ADMIN_DASHBOARD, { replace: true });
        } else if (role === 'companion') {
          navigate(ROUTES.COMPANION_DASHBOARD, { replace: true });
        } else {
          navigate(ROUTES.CLIENT_DASHBOARD, { replace: true });
        }
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Failed to switch role';
      toast.error(errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        isInitialized,
        signIn,
        signUp,
        signOut,
        checkAuth,
        switchRole,
        hasRole,
        canAccessRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
