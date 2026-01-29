import React, { useState, useEffect } from 'react';
import { FaHeart, FaRegHeart } from 'react-icons/fa';
import { toast } from 'react-hot-toast';
import { favoritesApi } from '../../api/favorites';
import { useAuth } from '../../hooks/useAuth';

interface FavoriteButtonProps {
  companionId: number;
  companionName?: string;
  initialFavorited?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  onToggle?: (isFavorited: boolean) => void;
  className?: string;
}

const FavoriteButton: React.FC<FavoriteButtonProps> = ({
  companionId,
  companionName = 'companion',
  initialFavorited = false,
  size = 'md',
  showText = false,
  onToggle,
  className = ''
}) => {
  const { isAuthenticated } = useAuth();
  const [isFavorited, setIsFavorited] = useState(initialFavorited);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Check favorite status on mount if authenticated
    if (isAuthenticated && companionId) {
      checkFavoriteStatus();
    }
  }, [companionId, isAuthenticated]);

  const checkFavoriteStatus = async () => {
    try {
      const favorited = await favoritesApi.checkFavorite(companionId);
      setIsFavorited(favorited);
    } catch (error) {
      // Silently fail, use initial value
      console.error('Failed to check favorite status:', error);
    }
  };

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      toast.error('Please login to save favorites');
      return;
    }

    setIsLoading(true);
    try {
      const newFavoritedStatus = await favoritesApi.toggleFavorite(companionId, isFavorited);
      setIsFavorited(newFavoritedStatus);

      if (newFavoritedStatus) {
        toast.success(`${companionName} added to favorites`);
      } else {
        toast.success(`${companionName} removed from favorites`);
      }

      // Call the callback if provided
      if (onToggle) {
        onToggle(newFavoritedStatus);
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
      toast.error('Failed to update favorites');
    } finally {
      setIsLoading(false);
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'p-1.5 text-sm';
      case 'lg':
        return 'p-3 text-xl';
      default:
        return 'p-2 text-base';
    }
  };

  const buttonClasses = `
    ${getSizeClasses()}
    ${className}
    flex items-center gap-2
    rounded-full
    transition-all duration-200
    ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:scale-110'}
    ${isFavorited
      ? 'text-red-500 hover:text-red-600'
      : 'text-gray-400 hover:text-red-500'
    }
  `.trim();

  return (
    <button
      onClick={handleToggleFavorite}
      disabled={isLoading}
      className={buttonClasses}
      title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
      aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
    >
      {isFavorited ? (
        <FaHeart className="transition-transform" />
      ) : (
        <FaRegHeart className="transition-transform" />
      )}
      {showText && (
        <span className="text-sm font-medium">
          {isFavorited ? 'Favorited' : 'Favorite'}
        </span>
      )}
    </button>
  );
};

export default FavoriteButton;