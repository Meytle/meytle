/**
 * ScrollToTop Component
 * Automatically scrolls to top when route changes
 * Also handles hash navigation (scrolls to element with matching id)
 */

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const ScrollToTop = () => {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    // If there's a hash, scroll to that element
    if (hash) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        const elementId = hash.replace('#', '');
        const element = document.getElementById(elementId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    } else {
      // No hash - scroll to top when pathname changes
      try {
        window.scrollTo({
          top: 0,
          left: 0,
          behavior: 'smooth'
        });
      } catch (error) {
        // Fallback for browsers that don't support smooth scrolling
        window.scrollTo(0, 0);
      }
    }
  }, [pathname, hash]);

  return null;
};

export default ScrollToTop;
