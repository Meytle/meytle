import React from 'react';
import Button from './Button';
import Card from './Card';
import Badge from './Badge';
import { 
  FaCoffee, 
  FaUtensils, 
  FaFilm, 
  FaFootballBall, 
  FaPalette, 
  FaMusic, 
  FaPlane, 
  FaShoppingBag, 
  FaMountain, 
  FaGamepad, 
  FaUmbrellaBeach, 
  FaGlassCheers 
} from 'react-icons/fa';

interface InterestSelectorProps {
  selectedInterests: string[];
  onInterestsChange: (interests: string[]) => void;
  maxSelections?: number;
  className?: string;
}

const INTERESTS = [
  { name: 'Coffee', icon: FaCoffee },
  { name: 'Dinner', icon: FaUtensils },
  { name: 'Movies', icon: FaFilm },
  { name: 'Sports', icon: FaFootballBall },
  { name: 'Art', icon: FaPalette },
  { name: 'Music', icon: FaMusic },
  { name: 'Travel', icon: FaPlane },
  { name: 'Shopping', icon: FaShoppingBag },
  { name: 'Hiking', icon: FaMountain },
  { name: 'Gaming', icon: FaGamepad },
  { name: 'Beach', icon: FaUmbrellaBeach },
  { name: 'Nightlife', icon: FaGlassCheers },
];

const InterestSelector: React.FC<InterestSelectorProps> = ({
  selectedInterests,
  onInterestsChange,
  maxSelections = 10,
  className = '',
}) => {

  const handleInterestToggle = (e: React.MouseEvent, interestName: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (selectedInterests.includes(interestName)) {
      onInterestsChange(selectedInterests.filter(i => i !== interestName));
    } else if (selectedInterests.length < maxSelections) {
      onInterestsChange([...selectedInterests, interestName]);
    }
  };

  const canSelectMore = selectedInterests.length < maxSelections;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Selected interests count */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-neutral-600">
          {selectedInterests.length} of {maxSelections} selected
        </span>
        {!canSelectMore && (
          <Badge variant="warning" size="sm">
            Maximum reached
          </Badge>
        )}
      </div>

      {/* Interest grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {INTERESTS.map((interest) => {
          const isSelected = selectedInterests.includes(interest.name);
          const Icon = interest.icon;
          const isDisabled = !isSelected && !canSelectMore;

          return (
            <button
              key={interest.name}
              type="button"
              onClick={(e) => handleInterestToggle(e, interest.name)}
              disabled={isDisabled}
              className={`
                p-4 rounded-lg border-2 transition-all duration-200 text-center
                ${isSelected
                  ? 'border-[#312E81] bg-[#f0effe] text-[#312E81]'
                  : isDisabled
                  ? 'border-neutral-200 bg-neutral-50 text-neutral-400 cursor-not-allowed'
                  : 'border-neutral-200 hover:border-[#312E81] hover:bg-[#f0effe]'
                }
              `}
            >
              <Icon className="w-6 h-6 mx-auto mb-2" />
              <span className="text-sm font-medium">{interest.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default InterestSelector;

