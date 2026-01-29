/**
 * Time Slot Picker Component
 * Allows users to select available time slots with grouped organization
 */

import { useState, useEffect } from 'react';
import { FaClock } from 'react-icons/fa';
import TimeSlotGroup from '../booking/TimeSlotGroup';
import type { TimeSlot } from '../../types';

interface TimeSlotPickerProps {
  availableSlots: TimeSlot[];
  unavailableSlots?: TimeSlot[];
  selectedSlot?: TimeSlot;
  onSlotSelect: (slot: TimeSlot) => void;
  isLoading?: boolean;
  className?: string;
  basePrice?: number;
  categoryPrice?: number;
}

const TimeSlotPicker = ({
  availableSlots,
  unavailableSlots = [],
  selectedSlot,
  onSlotSelect,
  isLoading = false,
  className = '',
  basePrice = 35,
  categoryPrice
}: TimeSlotPickerProps) => {
  const [selectedTime, setSelectedTime] = useState<TimeSlot | null>(selectedSlot || null);

  useEffect(() => {
    if (selectedSlot) {
      setSelectedTime(selectedSlot);
    }
  }, [selectedSlot]);

  // Calculate the actual price to use
  const actualPrice = categoryPrice || basePrice;

  // Transform TimeSlot format to the format expected by TimeSlotGroup
  const transformSlots = (slots: TimeSlot[], available: boolean) => {
    return slots.map((slot, index) => {
      const duration = (new Date(`2000-01-01 ${slot.endTime}`).getTime() -
                       new Date(`2000-01-01 ${slot.startTime}`).getTime()) / (1000 * 60 * 60);

      return {
        id: `${available ? 'available' : 'unavailable'}-${index}`,
        startTime: slot.startTime,
        endTime: slot.endTime,
        price: actualPrice * duration,
        available,
        duration
      };
    });
  };

  // Combine available and unavailable slots
  const allSlots = [
    ...transformSlots(availableSlots, true),
    ...transformSlots(unavailableSlots, false)
  ].sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Transform selected slot to TimeSlotGroup format
  const transformedSelectedSlot = selectedTime ? {
    id: `selected-${selectedTime.startTime}`,
    startTime: selectedTime.startTime,
    endTime: selectedTime.endTime,
    price: actualPrice,
    available: true,
    duration: (new Date(`2000-01-01 ${selectedTime.endTime}`).getTime() -
               new Date(`2000-01-01 ${selectedTime.startTime}`).getTime()) / (1000 * 60 * 60)
  } : null;

  const handleSlotSelect = (slot: any) => {
    const originalSlot: TimeSlot = {
      startTime: slot.startTime,
      endTime: slot.endTime
    };
    setSelectedTime(originalSlot);
    onSlotSelect(originalSlot);
  };

  if (isLoading) {
    return (
      <div className={`bg-white rounded-xl border border-neutral-200 p-6 ${className}`}>
        <div className="flex items-center gap-3 mb-6">
          <FaClock className="w-5 h-5 text-[#312E81] animate-spin" />
          <h3 className="text-lg font-semibold text-neutral-900">Loading Available Times...</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-24 bg-gradient-to-r from-gray-100 to-gray-200 rounded-lg animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <FaClock className="w-6 h-6 text-[#312E81]" />
          <h3 className="text-xl font-semibold text-neutral-900">Select Your Time</h3>
          {availableSlots.length > 0 && (
            <span className="text-sm text-[#312E81] bg-primary-100 px-3 py-1 rounded-full font-medium">
              {availableSlots.length} available
            </span>
          )}
        </div>
      </div>

      <TimeSlotGroup
        slots={allSlots}
        selectedSlot={transformedSelectedSlot}
        onSlotSelect={handleSlotSelect}
        basePrice={actualPrice}
      />
    </div>
  );
};

export default TimeSlotPicker;

