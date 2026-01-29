/**
 * Services Selector Component
 * Allows companions to select services they offer
 */

import { FaCheck } from 'react-icons/fa';

interface ServicesSelectorProps {
  selectedServices: string[];
  onServicesChange: (services: string[]) => void;
}

// Predefined services
const PREDEFINED_SERVICES = [
  'Coffee Date',
  'Dinner Companion',
  'Movie Night',
  'Shopping Companion',
  'Museum Visit',
  'Concert/Event',
  'Walking/Hiking',
  'Beach Day',
  'Art Gallery',
  'Wine Tasting',
  'Cooking Together',
  'Game Night',
  'City Tour',
  'Sports Event',
  'Theater/Play',
  'Dance Partner',
  'Study Buddy',
  'Gym Partner',
  'Travel Companion',
  'Business Event'
];

const ServicesSelector: React.FC<ServicesSelectorProps> = ({
  selectedServices,
  onServicesChange
}) => {
  const handleServiceToggle = (service: string) => {
    if (selectedServices.includes(service)) {
      onServicesChange(selectedServices.filter(s => s !== service));
    } else {
      onServicesChange([...selectedServices, service]);
    }
  };

  return (
    <div className="space-y-4">
      {/* Selected Services Count */}
      <div className="text-sm text-gray-600">
        <span>Select services you offer</span>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {PREDEFINED_SERVICES.map(service => (
          <button
            key={service}
            type="button"
            onClick={() => handleServiceToggle(service)}
            className={`p-3 rounded-lg text-sm font-medium transition-all ${
              selectedServices.includes(service)
                ? 'bg-[#f0effe] text-[#1E1B4B] border-2 border-[#a5a3e8]'
                : 'bg-gray-50 text-gray-700 border-2 border-gray-200 hover:border-[#d5d3f7]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span>{service}</span>
              {selectedServices.includes(service) && (
                <FaCheck className="text-[#312E81] ml-2" size={12} />
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Helper Text */}
      <p className="text-xs text-gray-500">
        Select the services you're comfortable providing.
      </p>
    </div>
  );
};

export default ServicesSelector;