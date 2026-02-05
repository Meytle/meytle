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
  // Email Verification
  verifyOTP: (otp: string) => Promise<{ success: boolean; message?: string; requiresResend?: boolean }>;
  resendOTP: () => Promise<{ success: boolean; message?: string }>;
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

  // Listen for EMAIL_NOT_VERIFIED errors - redirect to verify-email page
  useEffect(() => {
    const handleEmailNotVerified = () => {
      console.log('📧 Email not verified - redirecting to verification page');
      navigate('/verify-email', { replace: true });
    };

    window.addEventListener('email-not-verified', handleEmailNotVerified);

    return () => {
      window.removeEventListener('email-not-verified', handleEmailNotVerified);
    };
  }, [navigate]);

  const signIn = async (credentials: SignInData) => {
    setIsLoading(true);
    try {
      const response = await authApi.signIn(credentials);
      // AuthApi returns backend response, so response.data.user is correct
      const authenticatedUser = response.data.user;

      // Normalize emailVerified field (backend may return email_verified or emailVerified)
      authenticatedUser.emailVerified = !!((authenticatedUser as any).email_verified ?? authenticatedUser.emailVerified);
      setUser(authenticatedUser);

      toast.success(TOAST_MESSAGES.SIGN_IN_SUCCESS);

      // Check if email is verified - if not, redirect to verification page
      if (!authenticatedUser.emailVerified) {
        navigate('/verify-email', { replace: true });
        return;
      }

      // Redirect based on user's active role - ONLY on initial sign-in
      if (authenticatedUser.activeRole === 'admin') {
        navigate(ROUTES.ADMIN_DASHBOARD, { replace: true });
      } else if (authenticatedUser.activeRole === 'companion') {
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
      const response = await authApi.signUp(userData);

      // AuthApi returns backend response, so response.data.user is correct
      const newUser = response.data.user;

      // Validate user object structure
      if (!newUser || !newUser.id || !newUser.activeRole) {
        throw new Error('Invalid user data received from server');
      }

      // Set user state (email not yet verified)
      newUser.emailVerified = false;
      setUser(newUser);
      setIsInitialized(true);

      // Redirect to email verification page
      navigate('/verify-email', { replace: true });

    } catch (error: any) {
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

  // OTP Verification - called from /verify-email page
  const verifyOTP = async (otp: string): Promise<{ success: boolean; message?: string; requiresResend?: boolean }> => {
    try {
      const response = await authApi.verifyOTP(otp);

      if (response.status === 'success') {
        // Update user as verified
        const verifiedUser = response.data?.user || { ...user, emailVerified: true };
        setUser(verifiedUser);

        toast.success('Email verified successfully!');

        // Navigate based on role
        const activeRole = verifiedUser.activeRole || user?.activeRole;
        if (activeRole === 'admin') {
          navigate(ROUTES.ADMIN_DASHBOARD, { replace: true });
        } else if (activeRole === 'companion') {
          navigate(ROUTES.COMPANION_APPLICATION, { replace: true });
        } else {
          navigate(ROUTES.CLIENT_DASHBOARD, { replace: true });
        }

        return { success: true };
      }

      return { success: false, message: response.message || 'Verification failed' };
    } catch (error: any) {
      const response = error.response?.data;
      return {
        success: false,
        message: response?.message || 'Verification failed',
        requiresResend: response?.requiresResend
      };
    }
  };

  const resendOTP = async (): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await authApi.resendVerification();
      return { success: response.status === 'success', message: response.message };
    } catch (error: any) {
      return { success: false, message: error.response?.data?.message || 'Failed to resend code' };
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
        // Email Verification
        verifyOTP,
        resendOTP,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
