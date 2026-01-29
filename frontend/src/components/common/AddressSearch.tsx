/**
 * OpenStreetMap Address Autocomplete Component
 * Provides address autocomplete using Nominatim API and interactive map selection
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import { Icon, LatLng } from 'leaflet';
import { FaMapMarkerAlt, FaSpinner, FaCheckCircle, FaSearch, FaExclamationTriangle, FaShieldAlt } from 'react-icons/fa';
import AddressValidationService from '../../services/addressValidation';
import type { ValidatedAddress } from '../../services/addressValidation';

// Fix for default marker icon in Leaflet
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Simple debounce implementation
const debounce = <T extends (...args: any[]) => any>(func: T, wait: number) => {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// Rate limiter for Nominatim API (max 1 request per second as per usage policy)
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000; // 1 second

const rateLimit = async () => {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => 
      setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest)
    );
  }
  lastRequestTime = Date.now();
};

// Nominatim API headers (required by usage policy)
const nominatimHeaders = {
  'User-Agent': 'Meytle/1.0 (https://meytle.com; contact@meytle.com)',
  'Referer': 'https://meytle.com'
};

// Configure default icon
const defaultIcon = new Icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface OSMPlace {
  place_id: number;
  osm_id: number;
  osm_type: string;
  display_name: string;
  lat: string;
  lon: string;
  boundingbox: string[];
  address?: {
    road?: string;
    house_number?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
}

interface AddressSearchProps {
  value?: string;
  onChange: (address: string, placeDetails?: OSMPlace, validatedAddress?: ValidatedAddress) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
  onBlur?: () => void;
  showMap?: boolean;
  requireVerification?: boolean;
}

// Map click handler component
const LocationPicker: React.FC<{
  onLocationSelect: (lat: number, lon: number) => void;
}> = ({ onLocationSelect }) => {
  useMapEvents({
    click: (e) => {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

// Component to update map view when center changes
const MapViewController: React.FC<{ center: [number, number]; zoom?: number }> = ({ 
  center, 
  zoom = 13 
}) => {
  const map = useMap();
  
  useEffect(() => {
    // Fly to new center when it changes
    map.flyTo(center, zoom, {
      duration: 1.5, // Smooth animation
      easeLinearity: 0.25
    });
  }, [center, zoom, map]);
  
  return null;
};

const AddressSearch: React.FC<AddressSearchProps> = ({
  value = '',
  onChange,
  placeholder = 'Enter a location...',
  required = false,
  className = '',
  label,
  error,
  disabled = false,
  onBlur,
  showMap = true,
  requireVerification = true
}) => {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<OSMPlace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<OSMPlace | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([40.7128, -74.0060]); // Default to NYC
  const [markerPosition, setMarkerPosition] = useState<[number, number] | null>(null);
  const [validatedAddress, setValidatedAddress] = useState<ValidatedAddress | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [showSafetyTips, setShowSafetyTips] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search for addresses using Nominatim API
  const searchAddresses = useCallback(async (query: string) => {
    if (!query || query.length < 3) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    try {
      // Apply rate limiting (1 request per second as per Nominatim usage policy)
      await rateLimit();
      
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          query
        )}&limit=5&addressdetails=1`,
        {
          headers: nominatimHeaders
        }
      );

      if (response.ok) {
        const data: OSMPlace[] = await response.json();
        setSuggestions(data);
        setShowSuggestions(true);
      }
    } catch (error) {
      console.error('Error searching addresses:', error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced search
  const debouncedSearch = useCallback(
    debounce((query: string) => searchAddresses(query), 500),
    []
  );

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);

    if (newValue === '') {
      onChange('', undefined, undefined);
      setSelectedPlace(null);
      setValidatedAddress(null);
      setMarkerPosition(null);
      setSuggestions([]);
      setValidationErrors([]);
      setValidationWarnings([]);
    } else {
      // If user manually edits after selecting, clear validation
      if (validatedAddress && newValue !== validatedAddress.displayName) {
        setValidatedAddress(null);
        setValidationErrors(['Please select an address from the suggestions']);
        onChange(newValue, undefined, undefined);
      }
      debouncedSearch(newValue);
    }
  };

  // Handle suggestion selection
  const handleSelectSuggestion = (place: OSMPlace) => {
    // Create validated address from OSM place
    const validated = AddressValidationService.createValidatedAddress(place);

    // Validate the address
    const validation = AddressValidationService.validateAddress(validated);

    setInputValue(place.display_name);
    setSelectedPlace(place);
    setValidatedAddress(validated);
    setValidationErrors(validation.errors);
    setValidationWarnings(validation.warnings);

    // Only pass validated address if it's valid
    if (validation.isValid) {
      onChange(place.display_name, place, validated);
    } else {
      onChange(place.display_name, place, undefined);
    }

    setShowSuggestions(false);

    const lat = parseFloat(place.lat);
    const lon = parseFloat(place.lon);
    setMapCenter([lat, lon]);
    setMarkerPosition([lat, lon]);
  };

  // Handle map click for location selection
  const handleMapLocationSelect = async (lat: number, lon: number) => {
    setIsLoading(true);
    try {
      // Apply rate limiting (1 request per second as per Nominatim usage policy)
      await rateLimit();
      
      // Reverse geocode to get address
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`,
        {
          headers: nominatimHeaders
        }
      );

      if (response.ok) {
        const data: OSMPlace = await response.json();

        // Create and validate the address
        const validated = AddressValidationService.createValidatedAddress(data);
        const validation = AddressValidationService.validateAddress(validated);

        setInputValue(data.display_name);
        setSelectedPlace(data);
        setValidatedAddress(validated);
        setValidationErrors(validation.errors);
        setValidationWarnings(validation.warnings);

        // Only pass validated address if it's valid
        if (validation.isValid) {
          onChange(data.display_name, data, validated);
        } else {
          onChange(data.display_name, data, undefined);
        }

        setMarkerPosition([lat, lon]);
      }
    } catch (error) {
      console.error('Error reverse geocoding:', error);
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className={`space-y-2 ${className}`} ref={wrapperRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div className="relative">
        <div className="relative">
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={onBlur}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
            className={`w-full px-4 py-2 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#312E81] ${
              error ? 'border-red-500' : 'border-gray-300'
            } ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
          />

          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
            {isLoading && <FaSpinner className="animate-spin text-gray-400" />}
            {validatedAddress && validationErrors.length === 0 && !isLoading && (
              <div className="flex items-center gap-1">
                <FaShieldAlt className="text-green-500" title="Verified Safe Location" />
                <FaCheckCircle className="text-green-500" />
              </div>
            )}
            {validatedAddress && validationErrors.length > 0 && !isLoading && (
              <FaExclamationTriangle className="text-red-500" />
            )}
            {!validatedAddress && selectedPlace && !isLoading && (
              <FaExclamationTriangle className="text-yellow-500" />
            )}
            {!selectedPlace && !isLoading && <FaMapMarkerAlt className="text-gray-400" />}
          </div>
        </div>

        {/* Suggestions Dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
            {suggestions.map((place) => (
              <button
                key={place.place_id}
                onClick={() => handleSelectSuggestion(place)}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                type="button"
              >
                <div className="flex items-start gap-2">
                  <FaMapMarkerAlt className="text-gray-400 mt-1 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">
                      {place.display_name.split(',')[0]}
                    </div>
                    <div className="text-xs text-gray-500">
                      {place.display_name}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Validation Messages */}
      {requireVerification && validationErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-2">
          <div className="flex items-start gap-2">
            <FaExclamationTriangle className="text-red-500 mt-1 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">Address Verification Required</p>
              {validationErrors.map((error, index) => (
                <p key={index} className="text-xs text-red-600 mt-1">{error}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Only show warnings if address is not verified or has errors */}
      {validationWarnings.length > 0 && (!validatedAddress || validationErrors.length > 0) && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-2">
          <div className="flex items-start gap-2">
            <FaExclamationTriangle className="text-yellow-500 mt-1 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-800">Safety Warning</p>
              {validationWarnings.map((warning, index) => (
                <p key={index} className="text-xs text-yellow-600 mt-1">{warning}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Show verified message if address is verified with no errors */}
      {validatedAddress && validationErrors.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-2">
          <div className="flex items-start gap-2">
            <FaShieldAlt className="text-green-500 mt-1 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-800">Verified Safe Location</p>
              <p className="text-xs text-green-600 mt-1">
                {validationWarnings.length > 0
                  ? 'This address has been verified through OpenStreetMap. Please ensure it\'s a public meeting place.'
                  : 'This address has been verified as a valid meeting location.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Safety Tips Button */}
      <button
        type="button"
        onClick={() => setShowSafetyTips(!showSafetyTips)}
        className="text-sm text-[#312E81] hover:text-[#1E1B4B] flex items-center gap-1 mt-2"
      >
        <FaShieldAlt />
        {showSafetyTips ? 'Hide' : 'Show'} Safety Tips
      </button>

      {/* Safety Tips */}
      {showSafetyTips && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-2">
          <h4 className="font-medium text-sm text-blue-900 mb-2">Meeting Safety Tips</h4>
          <ul className="space-y-1">
            {AddressValidationService.getSafetyTips().map((tip, index) => (
              <li key={index} className="text-xs text-blue-700 flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 pt-3 border-t border-blue-200">
            <h4 className="font-medium text-sm text-blue-900 mb-2">Suggested Safe Venues</h4>
            <ul className="space-y-1">
              {AddressValidationService.getSuggestedVenues().map((venue, index) => (
                <li key={index} className="text-xs text-blue-700 flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">✓</span>
                  <span>{venue}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Interactive Map */}
      {showMap && (
        <div className="mt-4 border border-gray-300 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
            <p className="text-sm text-gray-600">
              Click on the map to select a location
            </p>
          </div>
          <MapContainer
            center={mapCenter}
            zoom={13}
            style={{ height: '300px', width: '100%' }}
            className="z-10"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapViewController center={mapCenter} zoom={13} />
            <LocationPicker onLocationSelect={handleMapLocationSelect} />
            {markerPosition && (
              <Marker position={markerPosition} icon={defaultIcon} />
            )}
          </MapContainer>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
};

export default AddressSearch;