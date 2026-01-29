/**
 * FloatingProfileImages Component
 * Enhanced with beautiful visual effects and optimized performance
 */

import { motion } from 'framer-motion';
import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';

interface FloatingProfile {
  id: number;
  name: string;
  bgColor: string;
  gradientColors: string[];
  size: number;
  initialX: number;
  startOffset?: number;
  duration: number;
  delay: number;
  repeatDelay: number;
  swayAmount?: number;
}

interface FloatingProfileImagesProps {
  variant?: 'hero' | 'auth' | 'sides';
  className?: string;
  opacity?: number;
  zIndex?: string;
  positionMode?: 'fixed' | 'absolute';
}

// Adaptive profile configuration based on device and variant
const getProfileConfig = (variant?: string) => {
  // Check if we're in browser environment
  if (typeof window === 'undefined') {
    return { count: 6, complexity: 'simple', imageSize: 150 };
  }

  const width = window.innerWidth;
  const isRetina = window.devicePixelRatio > 1;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReducedMotion) {
    return { count: 0, complexity: 'none', imageSize: 150 };
  }

  // Auth pages get fewer, subtler profiles
  if (variant === 'auth') {
    if (width >= 1024) {
      return { count: 4, complexity: 'high', imageSize: 110 };
    } else if (width >= 768) {
      return { count: 2, complexity: 'medium', imageSize: 95 };
    } else {
      return { count: 2, complexity: 'simple', imageSize: 80 };
    }
  }

  // Regular pages get more dynamic profiles
  if (width >= 1024) {
    return { count: 5, complexity: 'high', imageSize: 100 }; // Reduced for better performance
  } else if (width >= 768) {
    return { count: 4, complexity: 'medium', imageSize: 100 };
  } else {
    return { count: 3, complexity: 'simple', imageSize: 80 };
  }
};

// Extract initials from name
const getInitials = (name: string): string => {
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

// Generate SVG fallback as data URI
const generateFallbackSVG = (name: string, bgColor: string): string => {
  const initials = getInitials(name);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 150 150">
      <circle cx="75" cy="75" r="75" fill="#${bgColor}"/>
      <text x="75" y="75" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">
        ${initials}
      </text>
    </svg>
  `;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
};

// Profile Avatar Component with loading and error handling
const ProfileAvatar: React.FC<{
  profile: FloatingProfile;
  variant?: string;
}> = ({ profile, variant }) => {
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error'>('loading');
  // Use random person photos from randomuser.me
  const [imageSrc, setImageSrc] = useState<string>(() =>
    `https://randomuser.me/api/portraits/${profile.id % 2 === 0 ? 'men' : 'women'}/${profile.id % 50}.jpg`
  );

  const handleImageLoad = useCallback(() => {
    setImageState('loaded');
  }, []);

  const handleImageError = useCallback(() => {
    setImageState('error');
    // Use a different random person photo as fallback
    const fallbackSrc = `https://randomuser.me/api/portraits/${profile.id % 2 === 0 ? 'women' : 'men'}/${(profile.id + 10) % 50}.jpg`;
    setImageSrc(fallbackSrc);
  }, [profile.id]);


  return (
    <div className="absolute inset-1 rounded-full overflow-hidden bg-white/10">
      {/* Main image - show immediately when imageSrc is available */}
      {imageSrc && (
        <img
          src={imageSrc}
          alt={profile.name}
          className={`w-full h-full object-cover transition-opacity duration-500 ${
            imageState === 'loaded' ? 'opacity-100' : imageState === 'error' ? 'opacity-90' : 'opacity-70'
          }`}
          loading="lazy"
          decoding="async"
          fetchPriority={variant === 'auth' ? "auto" : "high"}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      )}

      {/* Show initials overlay only when image fails */}
      {imageState === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <div className="text-white text-2xl font-bold">
            {getInitials(profile.name)}
          </div>
        </div>
      )}

      {/* Shimmer effect overlay */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(105deg, transparent 40%, rgba(255, 255, 255, 0.4) 50%, transparent 60%)',
        }}
        animate={{
          x: ['-200%', '200%'],
        }}
        transition={{
          duration: variant === 'auth' ? 4 : 3,
          repeat: Infinity,
          repeatDelay: variant === 'auth' ? 5 : 3,
          ease: "easeInOut",
        }}
      />
    </div>
  );
};

const FloatingProfileImages = React.memo(({
  variant = 'hero',
  className = '',
  opacity,
  zIndex = '',
  positionMode
}: FloatingProfileImagesProps) => {
  const [isVisible, setIsVisible] = useState(variant === 'auth');
  const [profileConfig, setProfileConfig] = useState(getProfileConfig(variant));
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);

  // Update profile config on resize
  useEffect(() => {
    const handleResize = () => {
      setProfileConfig(getProfileConfig(variant));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [variant]);

  // Don't render if animations are disabled
  if (profileConfig.count === 0) {
    return null;
  }

  // Use Intersection Observer for visibility control
  useEffect(() => {
    // For auth variant, always show immediately (subtle background)
    if (variant === 'auth') {
      setIsVisible(true);
      return;
    }

    // ✅ FIX: Reset visibility when switching from auth to other variants
    // This ensures animations don't render off-screen after variant change
    setIsVisible(false);

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      {
        threshold: 0.1,
        rootMargin: '100px' // Start animations 100px before visible
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      if (containerRef.current) {
        observer.unobserve(containerRef.current);
      }
      observer.disconnect();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [variant]);

  // Enhanced profiles with gradient colors and visual effects
  const profiles = useMemo(() => {
    const baseProfiles = [
      { name: 'Sarah M', bgColor: 'FF10F0', gradientColors: ['FF10F0', 'FF69B4', 'FF1493'] },
      { name: 'Mike L', bgColor: '8B5CF6', gradientColors: ['8B5CF6', 'A78BFA', '7C3AED'] },
      { name: 'Emma K', bgColor: '9945FF', gradientColors: ['9945FF', 'B794F4', 'A855F7'] },
      { name: 'David R', bgColor: 'EC4899', gradientColors: ['EC4899', 'F472B6', 'DB2777'] },
      { name: 'Lisa T', bgColor: 'A855F7', gradientColors: ['A855F7', 'C084FC', '9333EA'] },
    ];

    // Adaptive profile count based on device
    const profileCount = profileConfig.count;
    const selectedProfiles = baseProfiles.slice(0, profileCount);
    const { complexity } = profileConfig;
    const avatarDuration = variant === 'auth' ? 7 : 8.5;
    const avatarSpacing = variant === 'auth' ? 1.6 : 2.0;
    const totalCycleDelay = avatarSpacing * Math.max(selectedProfiles.length - 1, 1);

    // SIMPLE APPROACH: Horizontal positions spread across screen
    const horizontalPositions = [15, 30, 50, 70, 85]; // Percentage from left
    
    return selectedProfiles.map((profile, index) => {
      // Each avatar gets a fixed horizontal position
      const xPosition = horizontalPositions[index % horizontalPositions.length];
      
      // Sequential entry timing
      const startDelay = index * avatarSpacing;

      // Start above hero so they enter quickly but not uniformly
      const startOffset = (variant === 'auth' ? 40 : 60) + Math.random() * (variant === 'auth' ? 100 : 140);

      return {
        ...profile,
        id: index,
        size: variant === 'auth' ? 40 : 50, // Smaller on auth pages
        initialX: xPosition,
        startOffset,
        duration: avatarDuration,
        delay: startDelay,
        repeatDelay: totalCycleDelay,
        swayAmount: 18 + Math.random() * 10, // Horizontal sway: 18-28px
      };
    });
  }, [variant, profileConfig]);

  // GENTLE FALLING ANIMATION
  const getAnimationPath = (profile: FloatingProfile) => {
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    const heroHeight = Math.min(viewportHeight * 0.7, 560);
    const startOffset = profile.startOffset ?? 120;
    
    // Auth variant: more subtle, slower sway
    const sway = variant === 'auth' ? 12 : (profile.swayAmount || 25);
    
    return {
      x: [0, sway, 0, -sway, 0],
      y: [
        -startOffset,
        heroHeight * 0.12,
        heroHeight * 0.45,
        heroHeight * 0.75,
        heroHeight + 60
      ]
    };
  };


  // Determine positioning mode: absolute for auth variant or when explicitly set
  const useAbsolutePosition = variant === 'auth' || positionMode === 'absolute';
  
  return (
    <div
      ref={containerRef}
      className={`${useAbsolutePosition ? 'absolute' : 'fixed'} inset-0 overflow-hidden pointer-events-none ${zIndex} ${className}`}
      style={{
        transform: 'translateZ(0)',
        willChange: variant === 'auth' ? 'auto' : 'transform', // Reduce will-change for auth
        contain: 'layout style paint'
      }}
    >
      {isVisible && profiles.map((profile, index) => {
        const animationPath = getAnimationPath(profile);

        return (
          <motion.div
            key={profile.id}
            className="absolute"
            style={{
              width: profile.size,
              height: profile.size,
              left: `${profile.initialX}%`,
              top: `-${profile.startOffset ?? 60}px`,
              transform: 'translateX(-50%)', // Center horizontally
            }}
            initial={{
              opacity: 0,
              scale: 1,
            }}
            animate={{
              opacity: variant === 'auth'
                ? [0, 0.35, 0.25, 0.15, 0]
                : [0, 0.55, 0.4, 0.2, 0],
              scale: 1,
              x: animationPath.x,
              y: animationPath.y,
            }}
            transition={{
              x: {
                duration: profile.duration,
                repeat: Infinity,
                ease: "easeInOut",
                delay: profile.delay,
                repeatDelay: profile.repeatDelay,
              },
              y: {
                duration: profile.duration,
                repeat: Infinity,
                ease: "linear",
                delay: profile.delay,
                repeatDelay: profile.repeatDelay,
                times: [0, 0.08, 0.55, 0.88, 1], // Quick entry then glide
              },
              opacity: {
                duration: profile.duration,
                repeat: Infinity,
                ease: "linear",
                delay: profile.delay,
                repeatDelay: profile.repeatDelay,
                times: [0, 0.12, 0.65, 0.9, 1],
              },
            }}
          >
            {/* Simple gradient container - clean and minimal */}
            <div
              className="relative w-full h-full rounded-full overflow-hidden"
              style={{
                background: `linear-gradient(135deg, #${profile.gradientColors[0]}, #${profile.gradientColors[1]})`,
                boxShadow: `0 4px 12px rgba(${parseInt(profile.bgColor.slice(0, 2), 16)}, ${parseInt(profile.bgColor.slice(2, 4), 16)}, ${parseInt(profile.bgColor.slice(4, 6), 16)}, 0.2)`,
                border: '2px solid rgba(255, 255, 255, 0.3)',
              }}
            >
              {/* Avatar image with loading and error handling */}
              <ProfileAvatar
                profile={profile}
                variant={variant}
              />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
});

FloatingProfileImages.displayName = 'FloatingProfileImages';

export default FloatingProfileImages;