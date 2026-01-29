import { Outlet, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from './Navbar';
import Footer from './Footer';
import FloatingProfileImages from './common/FloatingProfileImages';
import { useModal } from '../context/ModalContext';

const MainLayout = () => {
  const location = useLocation();
  const { isAnyModalOpen } = useModal();

  // Hide navbar and footer on signin/signup pages
  const isAuthPage = ['/signin', '/signup', '/login'].includes(location.pathname);

  // Determine if floating images should be shown (only on auth pages now, homepage handles its own)
  const showFloatingImages = isAuthPage;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 relative">
      {/* Navbar - hidden when modal is open */}
      {!isAuthPage && !isAnyModalOpen && <Navbar />}

      {/* Floating Profile Images - Only on auth pages now, homepage handles its own */}
      {showFloatingImages && (
        <FloatingProfileImages
          variant="auth"
          className="z-0"
        />
      )}

      {/* Add padding-top to account for fixed navbar (80px = navbar height) - but not on auth pages */}
      <main className={`flex-grow relative z-10 ${!isAuthPage ? 'pt-20' : ''}`}>
        <Outlet />
      </main>

      {/* Footer - hidden when modal is open */}
      {!isAuthPage && !isAnyModalOpen && (
        <div className="relative z-30 transition-all duration-300 opacity-100">
          <Footer />
        </div>
      )}

      <Toaster position="top-right" />
    </div>
  );
};

export default MainLayout;