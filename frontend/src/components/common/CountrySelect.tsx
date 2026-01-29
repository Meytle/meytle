import React, { useState, useMemo } from 'react';

interface CountrySelectProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  error?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

// Comprehensive list of countries
const COUNTRIES = [
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'Germany',
  'France',
  'Italy',
  'Spain',
  'Netherlands',
  'Belgium',
  'Switzerland',
  'Austria',
  'Sweden',
  'Norway',
  'Denmark',
  'Finland',
  'Ireland',
  'Portugal',
  'Greece',
  'Poland',
  'Czech Republic',
  'Hungary',
  'Romania',
  'Bulgaria',
  'Croatia',
  'Slovenia',
  'Slovakia',
  'Estonia',
  'Latvia',
  'Lithuania',
  'Japan',
  'South Korea',
  'China',
  'India',
  'Singapore',
  'Malaysia',
  'Thailand',
  'Vietnam',
  'Indonesia',
  'Philippines',
  'New Zealand',
  'Mexico',
  'Brazil',
  'Argentina',
  'Chile',
  'Colombia',
  'Peru',
  'Venezuela',
  'Ecuador',
  'Uruguay',
  'Paraguay',
  'South Africa',
  'Egypt',
  'Morocco',
  'Kenya',
  'Nigeria',
  'Ghana',
  'United Arab Emirates',
  'Saudi Arabia',
  'Qatar',
  'Kuwait',
  'Israel',
  'Turkey',
  'Russia',
  'Ukraine',
  'Belarus',
  'Kazakhstan',
  'Iceland',
  'Luxembourg',
  'Malta',
  'Cyprus',
  'Albania',
  'Serbia',
  'Bosnia and Herzegovina',
  'North Macedonia',
  'Montenegro',
  'Kosovo',
  'Afghanistan',
  'Pakistan',
  'Bangladesh',
  'Sri Lanka',
  'Nepal',
  'Bhutan',
  'Maldives',
  'Myanmar',
  'Cambodia',
  'Laos',
  'Taiwan',
  'Hong Kong',
  'Macau',
  'Mongolia',
  'Papua New Guinea',
  'Fiji',
  'Samoa',
  'Tonga',
  'Costa Rica',
  'Panama',
  'Guatemala',
  'Honduras',
  'Nicaragua',
  'El Salvador',
  'Belize',
  'Jamaica',
  'Trinidad and Tobago',
  'Bahamas',
  'Barbados',
  'Dominican Republic',
  'Cuba',
  'Haiti',
  'Puerto Rico',
  'Jordan',
  'Lebanon',
  'Oman',
  'Bahrain',
  'Yemen',
  'Iraq',
  'Iran',
  'Syria',
  'Tunisia',
  'Algeria',
  'Libya',
  'Sudan',
  'Ethiopia',
  'Uganda',
  'Tanzania',
  'Zambia',
  'Zimbabwe',
  'Botswana',
  'Namibia',
  'Mozambique',
  'Angola',
  'Cameroon',
  'Senegal',
  'Mali',
  'Burkina Faso',
  'Niger',
  'Chad',
  'Somalia',
  'Rwanda',
  'Burundi',
  'Madagascar',
  'Mauritius',
  'Seychelles',
  'Comoros',
  'Eritrea',
  'Djibouti',
  'Gabon',
  'Congo',
  'Democratic Republic of the Congo',
  'Central African Republic',
  'Equatorial Guinea',
  'São Tomé and Príncipe',
  'Cape Verde',
  'Guinea',
  'Guinea-Bissau',
  'Gambia',
  'Sierra Leone',
  'Liberia',
  'Ivory Coast',
  'Benin',
  'Togo',
  'Mauritania',
  'Western Sahara'
].sort();

/**
 * CountrySelect Component
 * 
 * Searchable dropdown for selecting countries.
 * Used for nationality and document country fields.
 */
const CountrySelect: React.FC<CountrySelectProps> = ({
  value,
  onChange,
  label = 'Country',
  required = false,
  error,
  placeholder = 'Select a country',
  className = '',
  disabled = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // Filter countries based on search term
  const filteredCountries = useMemo(() => {
    if (!searchTerm) return COUNTRIES;
    
    const lowerSearch = searchTerm.toLowerCase();
    return COUNTRIES.filter(country => 
      country.toLowerCase().includes(lowerSearch)
    );
  }, [searchTerm]);

  const handleSelect = (country: string) => {
    onChange(country);
    setSearchTerm('');
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setIsOpen(true);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  const handleInputBlur = () => {
    // Delay to allow clicking on options
    setTimeout(() => setIsOpen(false), 200);
  };

  return (
    <div className={`country-select-container ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        {/* Display selected value or search input */}
        {value && !isOpen ? (
          <div 
            className={`
              w-full px-3 py-2 border rounded-lg cursor-pointer
              ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white hover:border-blue-400'}
              ${error ? 'border-red-500' : 'border-gray-300'}
            `}
            onClick={() => !disabled && setIsOpen(true)}
          >
            <div className="flex justify-between items-center">
              <span>{value}</span>
              <svg
                className="w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        ) : (
          <input
            type="text"
            value={searchTerm}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            placeholder={placeholder}
            disabled={disabled}
            className={`
              w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent
              ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
              ${error ? 'border-red-500' : 'border-gray-300'}
            `}
          />
        )}

        {/* Dropdown options */}
        {isOpen && !disabled && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {filteredCountries.length > 0 ? (
              <ul>
                {filteredCountries.map((country) => (
                  <li
                    key={country}
                    onClick={() => handleSelect(country)}
                    className="px-3 py-2 hover:bg-blue-50 cursor-pointer transition-colors"
                  >
                    {country}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-3 py-2 text-gray-500 text-center">
                No countries found
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
};

export default CountrySelect;
export { COUNTRIES };

