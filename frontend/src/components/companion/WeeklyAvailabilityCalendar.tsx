/**
 * Weekly Availability Calendar Component
 * Modern calendar-style interface for companions to manage their availability
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  FaClock, FaPlus, FaTrash, FaEdit, FaCheck, FaTimes, 
  FaChevronLeft, FaChevronRight, FaCalendarAlt 
} from 'react-icons/fa';
import { toast } from 'react-hot-toast';
import { bookingApi } from '../../api/booking';
import { companionsApi } from '../../api/companions';
import { getUserTimezone } from '../../utils/timezoneHelpers';
import type { AvailabilitySlot } from '../../types';

interface AvailabilitySlotExtended extends AvailabilitySlot {
  services?: string[];
}

// Time picker constants for 12-hour format
const HOURS = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];
const MINUTES = ['00', '30'];
const PERIODS = ['AM', 'PM'];

// Convert 12h to 24h format for storage
const to24Hour = (hour: string, minute: string, period: string): string => {
  let h = parseInt(hour);
  if (period === 'AM' && h === 12) h = 0;
  if (period === 'PM' && h !== 12) h += 12;
  return `${h.toString().padStart(2, '0')}:${minute}`;
};

// Convert 24h to 12h format for display
// Rounds minutes to nearest valid option (00 or 30) to handle legacy data
const to12Hour = (time24: string): { hour: string; minute: string; period: string } => {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  let hour = h % 12;
  if (hour === 0) hour = 12;
  // Round to nearest 30-minute interval (0-29 → '00', 30-59 → '30')
  const minute = m < 30 ? '00' : '30';
  return { hour: hour.toString(), minute, period };
};

// Helper to convert time to minutes
const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const WeeklyAvailabilityCalendar = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [availability, setAvailability] = useState<AvailabilitySlotExtended[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [companionServices, setCompanionServices] = useState<string[]>([]);
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);
  const [newSlotIndex, setNewSlotIndex] = useState<number | null>(null); // Track newly created slots
  // NOTE: Removed calendarRefreshKey - was causing unnecessary remounts/visual flicker

  // Ref for scrolling to available times section
  const availableTimesRef = useRef<HTMLDivElement>(null);

  // Load availability and services
  useEffect(() => {
    fetchAvailability();
    fetchCompanionServices();
  }, []);

  const fetchAvailability = async () => {
    try {
      setIsLoading(true);
      const slots = await bookingApi.getCompanionAvailability(0); // 0 means current user
      
      console.log('📅 Raw slots from API:', slots);
      
      // Parse services if they come as JSON strings and normalize time format
      const parsedSlots = slots.map(slot => {
        // Ensure times are in HH:MM format (pad single digits, remove seconds if present)
        const normalizeTime = (time: string) => {
          if (!time) return time;
          // Remove seconds if present (HH:MM:SS -> HH:MM)
          const parts = time.split(':');
          if (parts.length >= 2) {
            const hours = parts[0].padStart(2, '0');
            const minutes = parts[1].padStart(2, '0');
            return `${hours}:${minutes}`;
          }
          return time;
        };

        const normalized = {
          ...slot,
          startTime: normalizeTime(slot.startTime),
          endTime: normalizeTime(slot.endTime),
          services: slot.services ? (typeof slot.services === 'string' ? JSON.parse(slot.services) : slot.services) : []
        };

        console.log('🔄 Normalized slot:', {
          original: { startTime: slot.startTime, endTime: slot.endTime },
          normalized: { startTime: normalized.startTime, endTime: normalized.endTime },
          services: normalized.services
        });

        return normalized;
      });

      console.log('✅ Parsed slots:', parsedSlots);
      setAvailability(parsedSlots);
    } catch (error) {
      console.error('❌ Error fetching availability:', error);
      toast.error('Failed to load availability');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCompanionServices = async () => {
    try {
      const response = await companionsApi.getCompanionServices();
      if (response.status === 'success' && response.data.services) {
        const services = Array.isArray(response.data.services) ? response.data.services : [];
        setCompanionServices(services);
      }
    } catch (error) {
      console.error('Error fetching services:', error);
      // Use default services if companion hasn't set them up yet
      const defaultServices = [
        'Coffee Date',
        'Shopping Companion',
        'Dinner Date',
        'Walking/Hiking',
        'Beach Day',
        'Cooking Together',
        'Sports Event',
        'Study Buddy',
        'Movie Night',
        'Business Events'
      ];
      setCompanionServices(defaultServices);
    }
  };

  const getSlotsForDay = (dayOfWeek: string) => {
    return availability.filter(slot => slot.dayOfWeek === dayOfWeek);
  };

  const hasSlotsForDay = (dayOfWeek: string) => {
    return getSlotsForDay(dayOfWeek).length > 0;
  };

  const handleAddSlot = () => {
    const dayOfWeek = getDayOfWeekFromDate(selectedDate);
    if (!dayOfWeek) return;

    // Get existing slots for this day
    const daySlots = getSlotsForDay(dayOfWeek);
    
    let startTime = '09:00';
    let endTime = '17:00';

    // If there are existing slots, start from the latest end time + 1 hour buffer
    if (daySlots.length > 0) {
      // Sort slots by end time to find the latest
      const sortedSlots = [...daySlots].sort((a, b) => 
        timeToMinutes(b.endTime) - timeToMinutes(a.endTime)
      );
      
      const latestSlot = sortedSlots[0];
      
      // Add 1-hour buffer after the last slot
      const BUFFER_MINUTES = 60;
      const latestEndMinutes = timeToMinutes(latestSlot.endTime);
      const newStartMinutes = latestEndMinutes + BUFFER_MINUTES;
      
      // Check if we have room for a new slot (at least 1 hour before end of day)
      if (newStartMinutes >= 23 * 60) {
        toast.error('No time available today');
        return;
      }
      
      const newStartHours = Math.floor(newStartMinutes / 60);
      startTime = `${String(newStartHours).padStart(2, '0')}:00`;
      
      // Set end time to 3 hours later or end of day (23:00), whichever is earlier
      const endMinutes = Math.min(newStartMinutes + 180, 23 * 60); // +3 hours or 23:00
      const endHours = Math.floor(endMinutes / 60);
      endTime = `${String(endHours).padStart(2, '0')}:00`;
      
      console.log('📅 Previous slot ended at', latestSlot.endTime, '+ 1 hour buffer → New slot starts at', startTime);
    }

    const newSlot: AvailabilitySlotExtended = {
      dayOfWeek: dayOfWeek,
      startTime: startTime,
      endTime: endTime,
      isAvailable: true,
      services: []
    };

    const newIndex = availability.length;
    setAvailability([...availability, newSlot]);
    setEditingSlotIndex(newIndex); // Edit the new slot immediately
    setNewSlotIndex(newIndex); // Mark as new
    console.log('➕ Added new slot at index', newIndex, 'for', dayOfWeek, `(${startTime} - ${endTime})`);
  };

  const handleUpdateSlot = (index: number, updates: Partial<AvailabilitySlotExtended>) => {
    const updated = [...availability];
    updated[index] = { ...updated[index], ...updates };
    setAvailability(updated);
  };

  const handleSaveSlot = async (index: number) => {
    const slot = availability[index];

    console.log('💾 Saving slot at index', index, ':', slot);

    // Validation - Services are mandatory
    if (!slot.services || slot.services.length === 0) {
      toast.error('Please select at least one service for this time slot');
      return;
    }

    // Validation - Time range
    if (timeToMinutes(slot.startTime) >= timeToMinutes(slot.endTime)) {
      toast.error('End time must be after start time');
      return;
    }

    // Check for overlaps and 1-hour buffer requirement
    const BUFFER_MINUTES = 60; // 1 hour mandatory gap
    const daySlots = getSlotsForDay(slot.dayOfWeek);
    
    for (let i = 0; i < daySlots.length; i++) {
      const otherSlot = daySlots[i];
      if (otherSlot === slot) continue;

      const slotStart = timeToMinutes(slot.startTime);
      const slotEnd = timeToMinutes(slot.endTime);
      const otherStart = timeToMinutes(otherSlot.startTime);
      const otherEnd = timeToMinutes(otherSlot.endTime);

      // Check for direct overlap
      if (slotStart < otherEnd && slotEnd > otherStart) {
        toast.error('This time slot overlaps with an existing slot');
        return;
      }

      // Check for 1-hour buffer requirement
      // If this slot is AFTER the other slot
      if (slotStart >= otherEnd) {
        const gap = slotStart - otherEnd;
        if (gap < BUFFER_MINUTES) {
          toast.error('Maintain 1 hour gap between slots');
          return;
        }
      }
      
      // If this slot is BEFORE the other slot
      if (slotEnd <= otherStart) {
        const gap = otherStart - slotEnd;
        if (gap < BUFFER_MINUTES) {
          toast.error('Maintain 1 hour gap between slots');
          return;
        }
      }
    }

    // Save to backend with timezone
    try {
      setIsSaving(true);
      const companionTimezone = getUserTimezone();
      console.log('📤 Sending to backend:', { availability, companionTimezone });
      await bookingApi.setCompanionAvailability(availability, companionTimezone);
      toast.success('Availability saved');
      setEditingSlotIndex(null);
      setNewSlotIndex(null); // Clear new slot marker
      // Refresh data from backend - state update will trigger re-render naturally
      await fetchAvailability();
      // NOTE: Removed setCalendarRefreshKey - unnecessary remount caused visual flicker
    } catch (error) {
      console.error('❌ Error saving availability:', error);
      toast.error('Failed to save availability');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSlot = async (index: number) => {
    if (!confirm('Are you sure you want to delete this time slot?')) return;

    try {
      setIsSaving(true);
      const updated = availability.filter((_, i) => i !== index);
      const companionTimezone = getUserTimezone();
      console.log('🗑️ Deleting slot at index', index, '. Remaining slots:', updated);
      setAvailability(updated);
      await bookingApi.setCompanionAvailability(updated, companionTimezone);
      toast.success('Time slot deleted');
      setEditingSlotIndex(null);
      // Refresh data from backend - state update will trigger re-render naturally
      await fetchAvailability();
      // NOTE: Removed setCalendarRefreshKey - unnecessary remount caused visual flicker
    } catch (error) {
      console.error('❌ Error deleting slot:', error);
      toast.error('Failed to delete time slot');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = (index: number) => {
    // If it's a new unsaved slot, remove it
    if (newSlotIndex === index) {
      console.log('❌ Canceling new slot at index', index);
      setAvailability(availability.filter((_, i) => i !== index));
      setNewSlotIndex(null);
    }
    setEditingSlotIndex(null);
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const toggleService = (slotIndex: number, service: string) => {
    const slot = availability[slotIndex];
    const services = slot.services || [];
    const updated = services.includes(service)
      ? services.filter(s => s !== service)
      : [...services, service];
    handleUpdateSlot(slotIndex, { services: updated });
  };

  const getDayOfWeekFromDate = (date: Date) => {
    return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getDay()];
  };

  const syncSelectedDateWithMonth = (monthDate: Date) => {
    // Only update selected date without scrolling - user is just browsing months
    const newSelected = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    setSelectedDate(newSelected);
    setEditingSlotIndex(null);
    setNewSlotIndex(null);
  };

  const handlePreviousMonth = () => {
    const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    setCurrentMonth(newMonth);
    syncSelectedDateWithMonth(newMonth);
  };

  const handleNextMonth = () => {
    const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    setCurrentMonth(newMonth);
    syncSelectedDateWithMonth(newMonth);
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setEditingSlotIndex(null);
    setNewSlotIndex(null);
    // Smooth scroll to available times section
    setTimeout(() => {
      availableTimesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const renderCalendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days: React.ReactElement[] = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      date.setHours(0, 0, 0, 0);
      const isPast = date < today;
      const isSelected = selectedDate && date.getTime() === selectedDate.getTime();
      const dayOfWeek = getDayOfWeekFromDate(date);
      const hasSlots = hasSlotsForDay(dayOfWeek);

      days.push(
        <button
          key={day}
          type="button"
          onClick={() => handleDateSelect(date)}
          disabled={isPast}
          className={`
            p-3 rounded-lg border-2 transition-all text-center min-h-[70px] flex flex-col items-center justify-center
            ${isSelected ? 'bg-[#312E81] border-[#312E81] shadow-lg' : isPast ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200 hover:bg-primary-50'}
            ${isPast && !isSelected ? 'cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          <div className={`text-2xl font-bold mb-1 ${isSelected ? 'text-white' : isPast ? 'text-gray-400' : 'text-gray-900'}`}>{day}</div>
          {!isPast && (
            <div className="flex justify-center">
              <div className={`w-2.5 h-2.5 rounded-full ${hasSlots ? 'bg-green-500' : 'bg-gray-300'}`} />
            </div>
          )}
        </button>
      );
    }

    return days;
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="grid grid-cols-7 gap-2 mb-6">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const selectedDayOfWeek = selectedDate ? getDayOfWeekFromDate(selectedDate) : null;
  const selectedDaySlots = selectedDayOfWeek ? getSlotsForDay(selectedDayOfWeek) : [];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FaCalendarAlt className="w-6 h-6 text-[#312E81]" />
          <h2 className="text-xl font-semibold text-gray-900">Monthly Availability</h2>
        </div>
        {isSaving && (
          <span className="px-3 py-1 text-sm bg-[#f0effe] text-[#1E1B4B] rounded-full font-medium animate-pulse">
            Saving...
          </span>
        )}
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={handlePreviousMonth}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="Previous month"
        >
          <FaChevronLeft className="w-4 h-4 text-gray-600" />
        </button>
        
        <div className="text-sm font-medium text-gray-700">
          {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </div>
        
        <button
          onClick={handleNextMonth}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="Next month"
        >
          <FaChevronRight className="w-4 h-4 text-gray-600" />
        </button>
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-semibold text-gray-500 uppercase">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day}>{day}</div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-2 mb-6">
        {renderCalendarDays()}
      </div>

      <div className="text-center text-sm text-gray-500 mb-6">
        Green dots indicate weekdays where you already have availability configured.
      </div>

      {/* Selected Day Time Slots */}
        <div ref={availableTimesRef} className="border-t-2 border-gray-100 pt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <FaClock className="w-5 h-5 text-[#312E81]" />
              <h3 className="text-lg font-semibold text-gray-900">
                Available Times for {selectedDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric'
                })}
              </h3>
            </div>
            <button
              onClick={handleAddSlot}
              disabled={editingSlotIndex !== null}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                editingSlotIndex !== null
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
              title={editingSlotIndex !== null ? 'Save current slot first' : 'Add new time slot'}
            >
              <FaPlus className="w-4 h-4" />
              Add Time Slot
            </button>
          </div>

          {selectedDaySlots.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
              <FaClock className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 mb-3">No available time slots for this day</p>
              <button
                onClick={handleAddSlot}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#312E81] text-white rounded-lg hover:bg-[#1E1B4B] transition-colors"
              >
                <FaPlus className="w-4 h-4" />
                Add Your First Time Slot
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedDaySlots.map((slot) => {
                const globalIndex = availability.findIndex(s => s === slot);
                const isEditing = editingSlotIndex === globalIndex;

                return (
                  <div key={globalIndex} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    {!isEditing ? (
                      // View Mode
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${slot.isAvailable ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                            <span className="text-lg font-semibold text-gray-900">
                              {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setEditingSlotIndex(globalIndex)}
                              className="p-2 text-[#312E81] hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit time slot"
                            >
                              <FaEdit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteSlot(globalIndex)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete time slot"
                            >
                              <FaTrash className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        {slot.services && slot.services.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {slot.services.map((service, idx) => (
                              <span
                                key={idx}
                                className="inline-block px-3 py-1 text-sm bg-[#f0effe] text-[#1E1B4B] rounded-full font-medium"
                              >
                                {service}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                            <span className="text-amber-600">⚠️</span>
                            <p className="text-sm text-amber-700 font-medium">No services selected - Please edit and add at least one service</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      // Edit Mode
                      <div className="space-y-4">
                        {/* Debug logging */}
                        {(() => {
                          console.log('✏️ Editing slot:', {
                            index: globalIndex,
                            startTime: slot.startTime,
                            endTime: slot.endTime,
                            services: slot.services
                          });
                          return null;
                        })()}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Start Time
                            </label>
                            <div className="flex items-center gap-1">
                              <select
                                value={to12Hour(slot.startTime).hour}
                                onChange={(e) => {
                                  const { minute, period } = to12Hour(slot.startTime);
                                  handleUpdateSlot(globalIndex, { startTime: to24Hour(e.target.value, minute, period) });
                                }}
                                className="w-16 px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#312E81] text-center"
                              >
                                {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                              </select>
                              <span className="text-gray-500 font-medium">:</span>
                              <select
                                value={to12Hour(slot.startTime).minute}
                                onChange={(e) => {
                                  const { hour, period } = to12Hour(slot.startTime);
                                  handleUpdateSlot(globalIndex, { startTime: to24Hour(hour, e.target.value, period) });
                                }}
                                className="w-16 px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#312E81] text-center"
                              >
                                {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
                              </select>
                              <select
                                value={to12Hour(slot.startTime).period}
                                onChange={(e) => {
                                  const { hour, minute } = to12Hour(slot.startTime);
                                  handleUpdateSlot(globalIndex, { startTime: to24Hour(hour, minute, e.target.value) });
                                }}
                                className="w-16 px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#312E81] text-center"
                              >
                                {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              End Time
                            </label>
                            <div className="flex items-center gap-1">
                              <select
                                value={to12Hour(slot.endTime).hour}
                                onChange={(e) => {
                                  const { minute, period } = to12Hour(slot.endTime);
                                  handleUpdateSlot(globalIndex, { endTime: to24Hour(e.target.value, minute, period) });
                                }}
                                className="w-16 px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#312E81] text-center"
                              >
                                {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                              </select>
                              <span className="text-gray-500 font-medium">:</span>
                              <select
                                value={to12Hour(slot.endTime).minute}
                                onChange={(e) => {
                                  const { hour, period } = to12Hour(slot.endTime);
                                  handleUpdateSlot(globalIndex, { endTime: to24Hour(hour, e.target.value, period) });
                                }}
                                className="w-16 px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#312E81] text-center"
                              >
                                {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
                              </select>
                              <select
                                value={to12Hour(slot.endTime).period}
                                onChange={(e) => {
                                  const { hour, minute } = to12Hour(slot.endTime);
                                  handleUpdateSlot(globalIndex, { endTime: to24Hour(hour, minute, e.target.value) });
                                }}
                                className="w-16 px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#312E81] text-center"
                              >
                                {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
                              </select>
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Services Available During This Time <span className="text-red-500">*</span>
                          </label>
                          <p className="text-xs text-gray-500 mb-2">
                            Select at least one service
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {companionServices.map((service) => (
                              <button
                                key={service}
                                onClick={() => toggleService(globalIndex, service)}
                                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                  slot.services?.includes(service)
                                    ? 'bg-[#312E81] text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                              >
                                {service}
                              </button>
                            ))}
                          </div>
                          {(!slot.services || slot.services.length === 0) && (
                            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                              <span>⚠️</span>
                              <span>Please select at least one service to continue</span>
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleSaveSlot(globalIndex)}
                            disabled={isSaving || !slot.services || slot.services.length === 0}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={(!slot.services || slot.services.length === 0) ? 'Please select at least one service' : 'Save time slot'}
                          >
                            <FaCheck className="w-4 h-4" />
                            Save
                          </button>
                          <button
                            onClick={() => handleCancelEdit(globalIndex)}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
                          >
                            <FaTimes className="w-4 h-4" />
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
    </div>
  );
};

export default WeeklyAvailabilityCalendar;

