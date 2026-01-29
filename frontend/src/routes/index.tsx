import { lazy, Suspense, Component as ReactComponent } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';
import App from '../App';
import MainLayout from '../components/MainLayout';
import ProtectedRoute from '../components/auth/ProtectedRoute';

// Simple loading component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-600"></div>
  </div>
);

// Error boundary to catch chunk loading errors
// 🔒 FIX: Show error UI instead of auto-reloading (prevents reload loops)
class ChunkErrorBoundary extends ReactComponent<
  { children: React.ReactNode },
  { hasError: boolean; isChunkError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, isChunkError: false };
  }

  static getDerivedStateFromError(error: Error) {
    // Check if it's a chunk loading error
    if (error.message.includes('Failed to fetch dynamically imported module') ||
        error.message.includes('Importing a module script failed')) {
      // 🔒 FIX: Don't auto-reload - show error UI instead
      return { hasError: true, isChunkError: true };
    }
    return { hasError: true, isChunkError: false };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Chunk loading error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.state.isChunkError) {
        // Show user-friendly error with manual refresh button
        return (
          <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
            <div className="text-center max-w-md">
              <div className="text-6xl mb-4">🔄</div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">Page Update Available</h2>
              <p className="text-gray-600 mb-4">
                A new version of this page is available. Please refresh to load the latest version.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Refresh Page
              </button>
            </div>
          </div>
        );
      }
      return <PageLoader />;
    }
    return this.props.children;
  }
}

// Helper to wrap lazy components with Suspense and error boundary
const withSuspense = (Component: React.ComponentType) => (
  <ChunkErrorBoundary>
  <Suspense fallback={<PageLoader />}>
    <Component />
  </Suspense>
  </ChunkErrorBoundary>
);

// Retry lazy loading - let ChunkErrorBoundary handle errors
// 🔒 FIX: Don't auto-reload - let the error boundary show the refresh UI
const lazyWithRetry = (componentImport: () => Promise<any>) =>
  lazy(async () => {
    try {
      return await componentImport();
    } catch (error: any) {
      // 🔒 FIX: Re-throw the error to let ChunkErrorBoundary handle it
      // This prevents automatic page reloads
      console.warn('Chunk loading failed:', error?.message);
      throw error;
    }
  });

// Lazy load all pages for better performance with auto-retry
const HomePage = lazyWithRetry(() => import('../pages/HomePage'));
const SignIn = lazyWithRetry(() => import('../pages/auth/SignIn'));
const SignUp = lazyWithRetry(() => import('../pages/auth/SignUp'));
const ClientDashboard = lazyWithRetry(() => import('../pages/client/ClientDashboard'));
const ClientBookings = lazyWithRetry(() => import('../pages/client/ClientBookings'));
const ClientProfile = lazyWithRetry(() => import('../pages/client/ClientProfile'));
const CompanionDashboard = lazyWithRetry(() => import('../pages/companion/CompanionDashboard'));
const CompanionApplication = lazyWithRetry(() => import('../pages/companion/CompanionApplication'));
const CompanionProfile = lazyWithRetry(() => import('../pages/companion/CompanionProfile'));
const PayoutReturn = lazyWithRetry(() => import('../pages/companion/PayoutReturn'));
const AdminDashboard = lazyWithRetry(() => import('../pages/admin/AdminDashboard'));
const VerifyEmail = lazyWithRetry(() => import('../pages/auth/VerifyEmail'));
const BrowseCompanions = lazyWithRetry(() => import('../pages/BrowseCompanions'));
const CompanionDetails = lazyWithRetry(() => import('../pages/companion/CompanionDetails'));
const Favorites = lazyWithRetry(() => import('../pages/client/Favorites'));
const BookingCreate = lazyWithRetry(() => import('../pages/booking/BookingCreate'));
const Notifications = lazyWithRetry(() => import('../pages/Notifications'));
const DashboardRedirect = lazyWithRetry(() => import('../components/redirects/DashboardRedirect'));
const ProfileRedirect = lazyWithRetry(() => import('../components/redirects/ProfileRedirect'));

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <AuthProvider>
        <App />
      </AuthProvider>
    ),
    children: [
      {
        path: '/',
        element: <MainLayout />,
        children: [
          {
            index: true,
            element: withSuspense(HomePage),
          },
          {
            path: 'signin',
            element: withSuspense(SignIn),
          },
          {
            path: 'login',
            element: <Navigate to="/signin" replace />,
          },
          {
            path: 'signup',
            element: withSuspense(SignUp),
          },
          {
            path: 'verify-email',
            element: withSuspense(VerifyEmail),
          },
          {
            path: 'companion-application',
            element: (
              <ProtectedRoute requiredRole="companion">
                <Suspense fallback={<PageLoader />}>
                  <CompanionApplication />
                </Suspense>
              </ProtectedRoute>
            ),
          },
          {
            path: 'client-dashboard',
            element: (
              <ProtectedRoute requiredRole="client">
                <Suspense fallback={<PageLoader />}>
                  <ClientDashboard />
                </Suspense>
              </ProtectedRoute>
            ),
          },
          {
            path: 'client-profile',
            element: (
              <ProtectedRoute requiredRole="client">
                <Suspense fallback={<PageLoader />}>
                  <ClientProfile />
                </Suspense>
              </ProtectedRoute>
            ),
          },
          {
            path: 'client/my-bookings',
            element: (
              <ProtectedRoute requiredRole="client">
                <Suspense fallback={<PageLoader />}>
                  <ClientBookings />
                </Suspense>
              </ProtectedRoute>
            ),
          },
          {
            path: 'favorites',
            element: (
              <ProtectedRoute requiredRole="client">
                <Suspense fallback={<PageLoader />}>
                  <Favorites />
                </Suspense>
              </ProtectedRoute>
            ),
          },
          {
            path: 'companion-dashboard',
            element: (
              <ProtectedRoute requiredRole="companion">
                <Suspense fallback={<PageLoader />}>
                  <CompanionDashboard />
                </Suspense>
              </ProtectedRoute>
            ),
          },
          {
            path: 'companion-profile',
            element: (
              <ProtectedRoute requiredRole="companion">
                <Suspense fallback={<PageLoader />}>
                  <CompanionProfile />
                </Suspense>
              </ProtectedRoute>
            ),
          },
          {
            path: 'companion/payout/return',
            element: (
              <ProtectedRoute requiredRole="companion">
                <Suspense fallback={<PageLoader />}>
                  <PayoutReturn />
                </Suspense>
              </ProtectedRoute>
            ),
          },
          {
            path: 'admin-dashboard',
            element: (
              <ProtectedRoute requiredRole="admin">
                <Suspense fallback={<PageLoader />}>
                  <AdminDashboard />
                </Suspense>
              </ProtectedRoute>
            ),
          },
          {
            path: 'browse-companions',
            element: withSuspense(BrowseCompanions),
          },
          {
            path: 'browse',
            element: <Navigate to="/browse-companions" replace />,
          },
          {
            path: 'companion/:id',
            element: withSuspense(CompanionDetails),
          },
          {
            path: 'booking/create',
            element: (
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <BookingCreate />
                </Suspense>
              </ProtectedRoute>
            ),
          },
          {
            path: 'notifications',
            element: (
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <Notifications />
                </Suspense>
              </ProtectedRoute>
            ),
          },
          {
            path: 'dashboard',
            element: (
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <DashboardRedirect />
                </Suspense>
              </ProtectedRoute>
            ),
          },
          {
            path: 'profile',
            element: (
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <ProfileRedirect />
                </Suspense>
              </ProtectedRoute>
            ),
          },
          // Payment routes removed - will be implemented later
          {
            path: '*',
            element: <Navigate to="/" replace />,
          },
        ],
      },
    ],
  },
]);

export default router;