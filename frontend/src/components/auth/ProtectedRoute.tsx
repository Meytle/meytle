/**
 * ProtectedRoute Component
 * Wraps routes that require authentication
 */

import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ROUTES } from '../../constants';
import LoadingSpinner from '../common/LoadingSpinner';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: 'client' | 'companion' | 'admin';
  allowMultipleRoles?: boolean;
}

const ProtectedRoute = ({ children, requiredRole, allowMultipleRoles = false }: ProtectedRouteProps) => {
  const { user, isAuthenticated, isInitialized } = useAuth();
  const location = useLocation();

  // Wait for auth context to initialize
  if (!isInitialized) {
    console.log('⏳ Waiting for auth context to initialize...');
    return <LoadingSpinner fullScreen />;
  }

  // Redirect to signin if not authenticated
  if (!isAuthenticated || !user) {
    console.log('🔒 Protected route: Not authenticated, redirecting to signin');
    return <Navigate to={ROUTES.SIGN_IN} state={{ from: location }} replace />;
  }

  // Check role requirements if specified
  if (requiredRole) {
    const hasRole = user.roles?.includes(requiredRole) || user.activeRole === requiredRole;

    if (!hasRole && !allowMultipleRoles) {
      console.log(`🚫 Protected route: User lacks required role: ${requiredRole}`);
      // Redirect to appropriate dashboard based on user's actual role
      if (user.activeRole === 'admin') {
        return <Navigate to={ROUTES.ADMIN_DASHBOARD} replace />;
      } else if (user.activeRole === 'companion') {
        return <Navigate to={ROUTES.COMPANION_DASHBOARD} replace />;
      } else {
        return <Navigate to={ROUTES.CLIENT_DASHBOARD} replace />;
      }
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;