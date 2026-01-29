/**
 * ScrollToTopButton Component
 * A floating button that appears when the user scrolls down
 * Clicking it smoothly scrolls the page back to the top
 * Available throughout the entire website for all users
 */

import { useState, useEffect } from 'react';
import { FaArrowUp } from 'react-icons/fa';

const ScrollToTopButton = () => {
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Show button when scrolled down more than 200px
      const scrolled = window.scrollY || window.pageYOffset;
      setShowButton(scrolled > 200);
    };

    // Add scroll event listener with passive flag for better performance
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Check initial scroll position
    handleScroll();

    // Cleanup
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const scrollToTop = () => {
    try {
      // Smooth scroll to top
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    } catch (error) {
      // Fallback for browsers that don't support smooth scrolling
      window.scrollTo(0, 0);
    }
  };

  // Don't render if button shouldn't be shown
  if (!showButton) {
    return null;
  }

  return (
    <button
      onClick={scrollToTop}
      className="fixed bottom-6 right-6 md:bottom-8 md:right-8 w-11 h-11 md:w-12 md:h-12 bg-[#312E81] text-white rounded-full shadow-lg hover:bg-[#4A47A3] active:bg-[#4A47A3] transition-all duration-300 flex items-center justify-center z-30 hover:scale-110 transform"
      aria-label="Scroll to top"
      title="Scroll to top"
    >
      <FaArrowUp className="w-4 h-4 md:w-5 md:h-5" />
    </button>
  );
};

export default ScrollToTopButton;