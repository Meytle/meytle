/**
 * Time Slot Picker Pro Component
 * Advanced time slot selection with grouping and improved UI
 */

import { useState, useEffect } from 'react';
import {
  FaClock,
  FaSun,
  FaCloudSun,
  FaMoon,
  FaCheck,
  FaDollarSign,
  FaInfoCircle,
  FaCalendarCheck
} from 'react-icons/fa';
import type { TimeSlot } from '../../types';

interface TimeSlotPickerProProps {
  availableSlots: TimeSlot[];
  unavailableSlots?: TimeSlot[];
  selectedSlot?: TimeSlot;
  onSlotSelect: (slot: TimeSlot) => void;
  isLoading?: boolean;
  className?: string;
  showPricing?: boolean;
  hourlyRate?: number;
  services?: string[];
}

interface TimeGroup {
  label: string;
  icon: React.ElementType;
  slots: TimeSlot[];
  timeRange: string;
}

const TimeSlotPickerPro = ({
  availableSlots,
  unavailableSlots = [],
  selectedSlot,
  onSlotSelect,
  isLoading = false,
  className = '',
  showPricing = true,
  hourlyRate = 35,
  services = []
}: TimeSlotPickerProProps) => {
  const [selectedTime, setSelectedTime] = useState<TimeSlot | null>(selectedSlot || null);
  const [timeGroups, setTimeGroups] = useState<TimeGroup[]>([]);
  const [viewMode, setViewMode] = useState<'grouped' | 'list'>('grouped');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['morning', 'afternoon', 'evening']));

  // Safe accessors with fallbacks
  const safeAvailableSlots = availableSlots || [];
  const safeUnavailableSlots = unavailableSlots || [];
  const safeServices = services || [];

  useEffect(() => {
    if (selectedSlot) {
      setSelectedTime(selectedSlot);
    }
  }, [selectedSlot]);

  useEffect(() => {
    groupTimeSlots();
  }, [availableSlots]);

  const groupTimeSlots = () => {
    const groups: { [key: string]: TimeGroup } = {
      morning: {
        label: 'Morning',
        icon: FaSun,
        slots: [],
        timeRange: '6:00 AM - 12:00 PM'
      },
      afternoon: {
        label: 'Afternoon',
        icon: FaCloudSun,
        slots: [],
        timeRange: '12:00 PM - 6:00 PM'
      },
      evening: {
        label: 'Evening',
        icon: FaMoon,
        slots: [],
        timeRange: '6:00 PM - 10:00 PM'
      }
    };

    safeAvailableSlots.forEach(slot => {
      const hour = parseInt(slot.startTime.split(':')[0]);

      if (hour < 12) {
        groups.morning.slots.push(slot);
      } else if (hour < 18) {
        groups.afternoon.slots.push(slot);
      } else {
        groups.evening.slots.push(slot);
      }
    });

    setTimeGroups(Object.values(groups).filter(group => group.slots.length > 0));
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const calculateDuration = (startTime: string, endTime: string) => {
    const start = new Date(`2000-01-01 ${startTime}`);
    const end = new Date(`2000-01-01 ${endTime}`);
    return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  };

  const calculatePrice = (slot: TimeSlot) => {
    const duration = calculateDuration(slot.startTime, slot.endTime);
    return Math.round(duration * hourlyRate);
  };

  const isSlotSelected = (slot: TimeSlot) => {
    return selectedTime &&
      selectedTime.startTime === slot.startTime &&
      selectedTime.endTime === slot.endTime;
  };

  const handleSlotClick = (slot: TimeSlot) => {
    setSelectedTime(slot);
    onSlotSelect(slot);
  };

  const toggleGroupExpansion = (groupLabel: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupLabel.toLowerCase())) {
      newExpanded.delete(groupLabel.toLowerCase());
    } else {
      newExpanded.add(groupLabel.toLowerCase());
    }
    setExpandedGroups(newExpanded);
  };

  const getRecommendedSlot = () => {
    if (safeAvailableSlots.length === 0) return null;

    // For simplicity, return the first available slot
    // TODO: Add date prop and logic to check if selected date is today
    // and recommend slots accordingly based on current time
    
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTimeInMinutes = currentHour * 60 + currentMinutes + 30; // Add 30-minute buffer

    let closestSlot: TimeSlot | null = null;
    let closestDiff = Infinity;

    safeAvailableSlots.forEach(slot => {
      const [slotHour, slotMinutes] = slot.startTime.split(':').map(Number);
      const slotTimeInMinutes = slotHour * 60 + slotMinutes;

      if (slotTimeInMinutes >= currentTimeInMinutes) {
        const diff = slotTimeInMinutes - currentTimeInMinutes;
        if (diff < closestDiff) {
          closestDiff = diff;
          closestSlot = slot;
        }
      }
    });

    // Return closest future slot, or first slot if none available after current time
    return closestSlot || availableSlots[0];
  };

  if (isLoading) {
    return (
      <div className={`bg-white rounded-2xl shadow-xl border border-gray-200 p-8 ${className}`}>
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (safeAvailableSlots.length === 0 && safeUnavailableSlots.length === 0) {
    return (
      <div className={`bg-white rounded-2xl shadow-xl border border-gray-200 p-8 ${className}`}>
        <div className="text-center py-12">
          <FaClock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 mb-2">No Time Slots Available</h3>
          <p className="text-gray-500">Please select a different date to see available times.</p>
        </div>
      </div>
    );
  }

  const recommendedSlot = getRecommendedSlot();

  return (
    <div className={`bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-[#312E81] to-[#312E81] text-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <FaClock className="w-6 h-6" />
              Select Time
            </h2>
            <p className="text-[#f0effe] mt-1">
              {availableSlots.length} time slot{availableSlots.length !== 1 ? 's' : ''} available
            </p>
          </div>

          {/* View Mode Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('grouped')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                viewMode === 'grouped' ?
                  'bg-white text-[#312E81]' :
                  'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              Grouped
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                viewMode === 'list' ?
                  'bg-white text-[#312E81]' :
                  'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {/* Recommended Slot */}
      {recommendedSlot && !selectedTime && (
        <div className="p-4 bg-blue-50 border-b border-blue-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FaCalendarCheck className="w-5 h-5 text-[#312E81]" />
              <div>
                <div className="font-semibold text-blue-900">Recommended Time</div>
                <div className="text-sm text-blue-700">
                  {formatTime(recommendedSlot.startTime)} - {formatTime(recommendedSlot.endTime)}
                </div>
              </div>
            </div>
            <button
              onClick={() => handleSlotClick(recommendedSlot)}
              className="px-4 py-2 bg-[#312E81] text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Select This Time
            </button>
          </div>
        </div>
      )}

      {/* Time Slots */}
      <div className="p-6">
        {viewMode === 'grouped' ? (
          // Grouped View
          <div className="space-y-4">
            {timeGroups.map((group, groupIndex) => {
              const Icon = group.icon;
              const isExpanded = expandedGroups.has(group.label.toLowerCase());

              return (
                <div
                  key={groupIndex}
                  className="rounded-xl border-2 border-gray-200 overflow-hidden transition-all"
                >
                  <button
                    onClick={() => toggleGroupExpansion(group.label)}
                    className="w-full px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-150 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md">
                          <Icon className="w-5 h-5 text-[#312E81]" />
                        </div>
                        <div className="text-left">
                          <h3 className="font-semibold text-gray-900">{group.label}</h3>
                          <p className="text-sm text-gray-600">{group.timeRange}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-[#f0effe] text-[#1E1B4B] text-sm rounded-full font-medium">
                          {group.slots.length} slot{group.slots.length !== 1 ? 's' : ''}
                        </span>
                        <div className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                          ▼
                        </div>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="p-4 bg-white grid grid-cols-2 md:grid-cols-3 gap-3">
                      {group.slots.map((slot, index) => {
                        const duration = calculateDuration(slot.startTime, slot.endTime);
                        const price = calculatePrice(slot);
                        const isSelected = isSlotSelected(slot);

                        return (
                          <button
                            key={index}
                            onClick={() => handleSlotClick(slot)}
                            className={`
                              relative p-4 rounded-xl border-2 transition-all duration-200 hover:scale-105
                              ${isSelected ?
                                'border-[#312E81] bg-gradient-to-br from-[#f9f8ff] to-blue-50 shadow-lg' :
                                'border-gray-200 hover:border-[#a5a3e8] hover:bg-[#f9f8ff]'
                              }
                            `}
                          >
                            {isSelected && (
                              <div className="absolute top-2 right-2">
                                <FaCheck className="w-4 h-4 text-[#312E81]" />
                              </div>
                            )}

                            <div className="text-left">
                              <div className="font-bold text-gray-900 text-lg">
                                {formatTime(slot.startTime)}
                              </div>
                              <div className="text-sm text-gray-600 mt-1">
                                to {formatTime(slot.endTime)}
                              </div>
                              <div className="flex items-center gap-2 mt-3">
                                <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                                  {duration} hr{duration !== 1 ? 's' : ''}
                                </span>
                                {showPricing && (
                                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded flex items-center gap-1">
                                    <FaDollarSign className="w-3 h-3" />
                                    {price}
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          // List View
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableSlots.map((slot, index) => {
              const duration = calculateDuration(slot.startTime, slot.endTime);
              const price = calculatePrice(slot);
              const isSelected = isSlotSelected(slot);

              return (
                <button
                  key={index}
                  onClick={() => handleSlotClick(slot)}
                  className={`
                    relative p-6 rounded-xl border-2 transition-all duration-200 hover:scale-105
                    ${isSelected ?
                      'border-[#312E81] bg-gradient-to-br from-[#f9f8ff] to-blue-50 shadow-xl' :
                      'border-gray-200 hover:border-[#a5a3e8] hover:bg-[#f9f8ff] hover:shadow-lg'
                    }
                  `}
                >
                  {isSelected && (
                    <div className="absolute top-3 right-3">
                      <div className="w-8 h-8 bg-[#312E81] rounded-full flex items-center justify-center">
                        <FaCheck className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  )}

                  <div className="text-left">
                    <div className="flex items-center gap-2 mb-3">
                      <FaClock className="w-5 h-5 text-[#312E81]" />
                      <span className="font-bold text-xl text-gray-900">
                        {formatTime(slot.startTime)}
                      </span>
                    </div>
                    <div className="text-gray-600 mb-4">
                      to {formatTime(slot.endTime)}
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                      <span className="text-sm bg-gray-100 px-3 py-1 rounded-full">
                        {duration} hour{duration !== 1 ? 's' : ''}
                      </span>
                      {showPricing && (
                        <span className="text-sm bg-green-100 text-green-700 px-3 py-1 rounded-full flex items-center gap-1">
                          <FaDollarSign className="w-3 h-3" />
                          {price}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Unavailable Slots Info */}
        {safeUnavailableSlots.length > 0 && (
          <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <FaInfoCircle className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-semibold text-gray-700">
                {safeUnavailableSlots.length} time slot{safeUnavailableSlots.length !== 1 ? 's are' : ' is'} already booked
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {safeUnavailableSlots.map((slot, index) => (
                <span
                  key={index}
                  className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded line-through"
                >
                  {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Services Info */}
        {safeServices.length > 0 && (
          <div className="mt-6 p-4 bg-[#f9f8ff] rounded-xl border border-[#d5d3f7]">
            <div className="flex items-center gap-2 mb-2">
              <FaInfoCircle className="w-4 h-4 text-[#312E81]" />
              <span className="text-sm font-semibold text-[#1E1B4B]">Available Services</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {safeServices.map((service, index) => (
                <span
                  key={index}
                  className="text-xs bg-white text-[#1E1B4B] px-3 py-1 rounded-full border border-[#d5d3f7]"
                >
                  {service}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TimeSlotPickerPro;