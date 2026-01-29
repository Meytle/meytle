import React from 'react';
import { formatLocation, formatFullAddress } from '../../utils/dateUtils';

interface LocationDisplayProps {
  address?: {
    city?: string;
    state?: string;
    country?: string;
    addressLine?: string;
    postalCode?: string;
  };
  showFullAddress?: boolean;
  showIcon?: boolean;
  iconColor?: string;
  className?: string;
  style?: 'default' | 'compact' | 'detailed';
}

/**
 * LocationDisplay Component
 * 
 * Displays formatted location/address information.
 * Used for companion profiles, browse listings, and user profiles.
 */
const LocationDisplay: React.FC<LocationDisplayProps> = ({
  address,
  showFullAddress = false,
  showIcon = true,
  iconColor = 'text-gray-500',
  className = '',
  style = 'default'
}) => {
  if (!address) {
    return null;
  }

  const locationString = showFullAddress
    ? formatFullAddress(address)
    : formatLocation(address);

  if (!locationString) {
    return null;
  }

  // Compact style - minimal UI
  if (style === 'compact') {
    return (
      <span className={`inline-flex items-center text-sm text-gray-600 ${className}`}>
        {showIcon && (
          <svg
            className={`w-4 h-4 mr-1 ${iconColor}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        )}
        {locationString}
      </span>
    );
  }

  // Detailed style - with map link and full breakdown
  if (style === 'detailed') {
    return (
      <div className={`location-detailed ${className}`}>
        <div className="flex items-start space-x-2">
          {showIcon && (
            <svg
              className={`w-5 h-5 mt-0.5 flex-shrink-0 ${iconColor}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          )}
          <div className="flex-1">
            {showFullAddress ? (
              <div className="space-y-1">
                {address.addressLine && (
                  <p className="text-sm text-gray-900">{address.addressLine}</p>
                )}
                <p className="text-sm text-gray-700">
                  {[address.city, address.state].filter(Boolean).join(', ')}
                  {address.postalCode && ` ${address.postalCode}`}
                </p>
                {address.country && (
                  <p className="text-sm text-gray-600">{address.country}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-700">{locationString}</p>
            )}
            {/* Optional: Add map link */}
            {address.city && address.country && (
              <a
                href={`https://www.google.com/maps/search/${encodeURIComponent(locationString)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:text-blue-800 mt-1 inline-flex items-center"
              >
                View on map
                <svg
                  className="w-3 h-3 ml-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Default style - simple with icon
  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      {showIcon && (
        <svg
          className={`w-5 h-5 flex-shrink-0 ${iconColor}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      )}
      <span className="text-gray-700">{locationString}</span>
    </div>
  );
};

export default LocationDisplay;

