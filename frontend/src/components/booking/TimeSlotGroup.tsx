import React from 'react';
import { FaSun, FaCloudSun, FaMoon, FaClock, FaCheck } from 'react-icons/fa';

interface TimeSlot {
  id: string;
  startTime: string;
  endTime: string;
  price: number;
  available: boolean;
  duration: number; // in hours
}

interface TimeSlotGroupProps {
  slots: TimeSlot[];
  selectedSlot: TimeSlot | null;
  onSlotSelect: (slot: TimeSlot) => void;
  basePrice: number;
}

const TimeSlotGroup: React.FC<TimeSlotGroupProps> = ({
  slots,
  selectedSlot,
  onSlotSelect,
  basePrice
}) => {
  const formatTime = (time: string) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${period}`;
  };

  const getTimePeriod = (time: string): 'morning' | 'afternoon' | 'evening' | 'night' => {
    const hour = parseInt(time.split(':')[0]);
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  };

  // Group slots by time period
  const groupedSlots = slots.reduce((acc, slot) => {
    const period = getTimePeriod(slot.startTime);
    if (!acc[period]) acc[period] = [];
    acc[period].push(slot);
    return acc;
  }, {} as Record<string, TimeSlot[]>);

  const periodConfig = {
    morning: {
      label: 'Morning',
      icon: <FaSun className="w-5 h-5" />,
      bgColor: 'from-amber-50 to-yellow-50',
      iconColor: 'text-amber-500',
      description: '5:00 AM - 12:00 PM'
    },
    afternoon: {
      label: 'Afternoon',
      icon: <FaCloudSun className="w-5 h-5" />,
      bgColor: 'from-orange-50 to-amber-50',
      iconColor: 'text-orange-500',
      description: '12:00 PM - 5:00 PM'
    },
    evening: {
      label: 'Evening',
      icon: <FaMoon className="w-5 h-5" />,
      bgColor: 'from-blue-50 to-blue-50',
      iconColor: 'text-[#312E81]',
      description: '5:00 PM - 9:00 PM'
    },
    night: {
      label: 'Night',
      icon: <FaMoon className="w-5 h-5" />,
      bgColor: 'from-blue-50 to-blue-50',
      iconColor: 'text-[#1E1B4B]',
      description: '9:00 PM - 5:00 AM'
    }
  };

  const calculatePrice = (slot: TimeSlot) => {
    return slot.price || (basePrice * slot.duration);
  };

  const periods = ['morning', 'afternoon', 'evening', 'night'] as const;

  // Only show periods that have slots
  const activePeriods = periods.filter(period => groupedSlots[period]?.length > 0);

  if (slots.length === 0) {
    return (
      <div className="text-center py-12">
        <FaClock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500 text-lg">No time slots available for this date</p>
        <p className="text-gray-400 text-sm mt-2">Please select another date</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg p-3 text-center shadow-sm">
          <p className="text-sm text-gray-500">Available Slots</p>
          <p className="text-xl font-bold text-[#312E81]">
            {slots.filter(s => s.available).length}
          </p>
        </div>
        <div className="bg-white rounded-lg p-3 text-center shadow-sm">
          <p className="text-sm text-gray-500">Base Rate</p>
          <p className="text-xl font-bold text-gray-800">
            ${basePrice}/hr
          </p>
        </div>
        <div className="bg-white rounded-lg p-3 text-center shadow-sm">
          <p className="text-sm text-gray-500">Time Range</p>
          <p className="text-xl font-bold text-gray-800">
            {slots.length > 0 && formatTime(slots[0].startTime).split(' ')[0]}
            -
            {slots.length > 0 && formatTime(slots[slots.length - 1].endTime).split(' ')[0]}
          </p>
        </div>
      </div>

      {/* Time Period Groups */}
      {activePeriods.map(period => {
        const config = periodConfig[period];
        const periodSlots = groupedSlots[period] || [];
        const availableCount = periodSlots.filter(s => s.available).length;

        return (
          <div key={period} className="bg-white rounded-xl shadow-sm overflow-hidden">
            {/* Period Header */}
            <div className={`bg-gradient-to-r ${config.bgColor} px-6 py-4 border-b border-gray-100`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`${config.iconColor}`}>
                    {config.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800">{config.label}</h3>
                    <p className="text-sm text-gray-500">{config.description}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">
                    {availableCount} of {periodSlots.length} available
                  </p>
                </div>
              </div>
            </div>

            {/* Time Slots Grid */}
            <div className="p-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {periodSlots.map((slot) => {
                  const isSelected = selectedSlot?.id === slot.id;
                  const price = calculatePrice(slot);

                  return (
                    <button
                      key={slot.id}
                      onClick={() => slot.available && onSlotSelect(slot)}
                      disabled={!slot.available}
                      className={`
                        relative p-4 rounded-lg border-2 transition-all duration-200
                        ${isSelected
                          ? 'bg-gradient-to-r from-[#312E81] to-[#FFCCCB] border-[#312E81] text-white shadow-[0_0_15px_rgba(255,204,203,0.3)] scale-105'
                          : slot.available
                            ? 'bg-white border-gray-200 hover:border-[#312E81] hover:bg-[#f0effe] hover:shadow-md'
                            : 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed opacity-50'
                        }
                      `}
                    >
                      {/* Selection Indicator */}
                      {isSelected && (
                        <div className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow-lg">
                          <FaCheck className="w-3 h-3 text-[#312E81]" />
                        </div>
                      )}

                      {/* Time Range */}
                      <div className={`font-semibold ${isSelected ? 'text-white' : 'text-gray-800'}`}>
                        {formatTime(slot.startTime)}
                      </div>
                      <div className={`text-sm mt-1 ${isSelected ? 'text-white/90' : 'text-gray-500'}`}>
                        to {formatTime(slot.endTime)}
                      </div>

                      {/* Duration Badge */}
                      <div className={`
                        inline-flex items-center gap-1 mt-2 px-2 py-1 rounded-full text-xs font-medium
                        ${isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-[#f0effe] text-[#312E81]'
                        }
                      `}>
                        <FaClock className="w-3 h-3" />
                        <span>{slot.duration}hr{slot.duration > 1 ? 's' : ''}</span>
                      </div>

                      {/* Price */}
                      <div className={`mt-2 font-bold ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                        ${price.toFixed(0)}
                      </div>

                      {/* Unavailable Overlay */}
                      {!slot.available && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-gray-50/80">
                          <span className="text-xs font-semibold text-gray-500 bg-white px-2 py-1 rounded">
                            BOOKED
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      {/* Duration Selector (Quick Options) */}
      <div className="bg-gradient-to-r from-[#f0effe] to-[#ffe4e3] rounded-xl p-6">
        <h4 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <FaClock className="w-5 h-5 text-[#312E81]" />
          Quick Duration Selection
        </h4>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4].map(hours => (
            <button
              key={hours}
              className="px-4 py-2 rounded-lg bg-white border-2 border-gray-200 hover:border-[#312E81] hover:bg-[#f0effe] transition-all duration-200"
              onClick={() => {
                // Find first available slot with this duration
                const matchingSlot = slots.find(s => s.available && s.duration === hours);
                if (matchingSlot) onSlotSelect(matchingSlot);
              }}
            >
              <span className="font-medium">{hours} hour{hours > 1 ? 's' : ''}</span>
              <span className="text-gray-500 text-sm ml-2">
                ${(basePrice * hours).toFixed(0)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TimeSlotGroup;