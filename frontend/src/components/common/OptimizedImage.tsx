import { useState, useEffect } from 'react';
import { UserIcon } from '@heroicons/react/24/outline';

interface OptimizedImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallback?: 'avatar' | 'placeholder' | 'none';
  onError?: () => void;
}

/**
 * Simple optimized image component with lazy loading and fallback
 */
const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  className = '',
  fallback = 'avatar',
  onError
}) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    // Reset error state when src changes
    setImageError(false);
    setImageLoaded(false);
  }, [src]);

  const handleError = () => {
    setImageError(true);
    if (onError) {
      onError();
    }
  };

  const handleLoad = () => {
    setImageLoaded(true);
  };

  // If no src or error occurred, show fallback
  if (!src || imageError) {
    if (fallback === 'avatar') {
      return (
        <div className={`flex items-center justify-center bg-gray-200 ${className}`}>
          <UserIcon className="w-1/3 h-1/3 text-gray-400" />
        </div>
      );
    }
    if (fallback === 'placeholder') {
      return (
        <div className={`bg-gray-200 animate-pulse ${className}`} />
      );
    }
    return null;
  }

  return (
    <>
      {/* Show placeholder while loading */}
      {!imageLoaded && (
        <div className={`bg-gray-200 animate-pulse ${className}`} />
      )}

      {/* Actual image with lazy loading */}
      <img
        src={src}
        alt={alt}
        className={`${className} ${!imageLoaded ? 'hidden' : ''}`}
        loading="lazy"
        onError={handleError}
        onLoad={handleLoad}
        decoding="async"
      />
    </>
  );
};

export default OptimizedImage;