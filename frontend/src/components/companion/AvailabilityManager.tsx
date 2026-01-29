/**
 * Availability Manager Component
 * Allows companions to set their availability schedule with service selection
 */

import { useState, useEffect } from 'react';
import { FaClock, FaPlus, FaTrash, FaSave, FaServicestack, FaEdit, FaCheck, FaTimes, FaExclamationTriangle, FaChevronDown, FaChevronRight } from 'react-icons/fa';
import { toast } from 'react-hot-toast';
import { bookingApi } from '../../api/booking';
import { companionsApi } from '../../api/companions';
import type { AvailabilitySlot } from '../../types';
import { useNavigate } from 'react-router-dom';

const DAYS_OF_WEEK = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
];

const DAY_LABELS = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday'
};

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

// Helper function to convert time string to minutes for proper comparison
const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

// Common services offered by companions
const AVAILABLE_SERVICES = [
  'Local Tours',
  'Entertainment',
  'Dining Companion',
  'Shopping Assistant',
  'Cultural Events',
  'Fitness Activities',
  'Business Events',
  'Travel Companion',
  'Virtual Chat',
  'Language Practice',
  'Study Buddy',
  'Gaming Partner'
];

interface AvailabilitySlotExtended extends AvailabilitySlot {
  services?: string[];
}

interface AvailabilityManagerProps {
  className?: string;
}

const AvailabilityManager = ({ className = '' }: AvailabilityManagerProps) => {
  const [availability, setAvailability] = useState<AvailabilitySlotExtended[]>([]);
  const [originalAvailability, setOriginalAvailability] = useState<AvailabilitySlotExtended[]>([]);
  const [isLoading, setIsLoading] = useState(false); // Start with false to prevent initial flicker
  const [showLoading, setShowLoading] = useState(false); // Controls when to show loading skeleton
  const [isSaving, setIsSaving] = useState(false);
  const [companionServices, setCompanionServices] = useState<string[]>([]);
  const [servicesLoaded, setServicesLoaded] = useState(false); // Track if services have been loaded
  const [isUsingDefaultServices, setIsUsingDefaultServices] = useState(false); // Track if using default services
  const [editingSlots, setEditingSlots] = useState<Set<number>>(new Set());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  // Safe accessors with fallbacks
  const safeAvailability = availability || [];
  const safeCompanionServices = companionServices || [];

  useEffect(() => {
    fetchAvailability();
    fetchCompanionServices();
  }, []);

  // We don't need these anymore since we're auto-saving
  // Track unsaved changes (keeping for future use if needed)
  useEffect(() => {
    const hasChanges = JSON.stringify(availability) !== JSON.stringify(originalAvailability);
    setHasUnsavedChanges(hasChanges);
  }, [availability, originalAvailability]);

  const fetchCompanionServices = async () => {
    try {
      // Fetch companion's registered services from their profile/application
      const response = await companionsApi.getCompanionServices();

      if (response.status === 'success' && response.data.services) {
        const services = response.data.services;
        setCompanionServices(Array.isArray(services) ? services : []);

        // Check if we're using default services
        if ('isDefault' in response.data && response.data.isDefault) {
          setIsUsingDefaultServices(true);
          console.log('Using default services for companion availability');
        } else {
          setIsUsingDefaultServices(false);
        }
      } else {
        // This should not happen with the updated backend
        setCompanionServices([]);
        setIsUsingDefaultServices(false);
      }

      setServicesLoaded(true);
    } catch (error: any) {
      console.error('Error fetching companion services:', error);

      // In case of any error, try to provide a reasonable default
      // This ensures companions can still manage their availability
      const defaultServices = [
        'Travel Companion',
        'Social Companion',
        'Event Companion',
        'Wine Tasting',
        'City Tours',
        'Museum Visits',
        'Theater & Arts',
        'Outdoor Activities',
        'Business Events',
        'Dinner Companion'
      ];

      setCompanionServices(defaultServices);
      setIsUsingDefaultServices(true);
      setServicesLoaded(true);

      // Only show error toast for network/server errors, not 404
      if (error.response?.status !== 404 && error.response?.status !== 429) {
        toast.error('Using default services');
      }
    }
  };

  const fetchAvailability = async () => {
    try {
      setIsLoading(true);

      // Only show loading skeleton if request takes more than 200ms
      const loadingTimer = setTimeout(() => {
        setShowLoading(true);
      }, 200);

      const slots = await bookingApi.getCompanionAvailability(0); // 0 means current user

      // Clear the timer if request completes quickly
      clearTimeout(loadingTimer);

      // Parse services if they come as JSON strings
      const parsedSlots = slots.map(slot => ({
        ...slot,
        services: slot.services ? (typeof slot.services === 'string' ? JSON.parse(slot.services) : slot.services) : []
      }));

      setAvailability(parsedSlots);
      setOriginalAvailability(parsedSlots); // Store original data

      // Initialize expanded days - expand days that have slots
      const daysWithSlots = new Set<string>();
      parsedSlots.forEach(slot => {
        daysWithSlots.add(slot.dayOfWeek);
      });
      setExpandedDays(daysWithSlots);
    } catch (error: any) {
      console.error('Error fetching availability:', error);

      // Initialize with empty array if no schedule exists
      if (error.response?.status === 404) {
        setAvailability([]);
        setOriginalAvailability([]);
      } else if (error.response?.status === 429) {
        // Rate limited - don't show error toast, just log it
        console.log('Rate limited while fetching availability - will retry automatically');
        setAvailability([]);
        setOriginalAvailability([]);
      } else {
        // Only show error toast for actual errors, not expected conditions
        toast.error('Failed to load availability schedule');
      }
    } finally {
      setIsLoading(false);
      setShowLoading(false);
    }
  };

  const addTimeSlot = (dayOfWeek: string) => {
    // Prevent adding new slots if any slot is being edited
    if (editingSlots.size > 0) {
      toast.error('Please save the current slot before adding a new one');
      return;
    }

    // Check for existing slots on the same day
    const existingSlots = safeAvailability.filter(slot => slot.dayOfWeek === dayOfWeek);

    // Find a non-overlapping default time
    let startTime = '09:00';
    let endTime = '17:00';

    if (existingSlots.length > 0) {
      // Sort existing slots by end time using proper time comparison
      const sortedSlots = [...existingSlots].sort((a, b) =>
        timeToMinutes(a.endTime) - timeToMinutes(b.endTime)
      );
      const lastSlot = sortedSlots[sortedSlots.length - 1];

      // Start the new slot after the last one ends
      if (timeToMinutes(lastSlot.endTime) < timeToMinutes('23:00')) {
        startTime = lastSlot.endTime;
        // Calculate end time (add 2 hours if possible)
        const startHour = parseInt(startTime.split(':')[0]);
        const newEndHour = Math.min(startHour + 2, 23);
        endTime = `${String(newEndHour).padStart(2, '0')}:00`;
      } else {
        // All time is taken, show error
        toast.error('No slots available. Remove one first.');
        return;
      }
    }

    const newSlot: AvailabilitySlotExtended = {
      dayOfWeek: dayOfWeek,
      startTime: startTime,
      endTime: endTime,
      isAvailable: true,
      services: []
    };

    // Add the new slot
    const newAvailability = [...availability, newSlot];
    setAvailability(newAvailability);

    // Automatically put the new slot in edit mode
    const newSlotIndex = newAvailability.length - 1;
    setEditingSlots(prev => {
      const newSet = new Set(prev);
      newSet.add(newSlotIndex);
      return newSet;
    });
  };

  const removeTimeSlot = async (index: number) => {
    try {
      // Remove the slot
      const newAvailability = safeAvailability.filter((_, i) => i !== index);

      // Update the state
      setAvailability(newAvailability);

      // Remove from editing set if it was being edited
      setEditingSlots(prev => {
        const newSet = new Set(prev);
        newSet.delete(index);
        // Update indices for slots after the removed one
        const updatedSet = new Set<number>();
        newSet.forEach(i => {
          if (i > index) {
            updatedSet.add(i - 1);
          } else if (i < index) {
            updatedSet.add(i);
          }
        });
        return updatedSet;
      });

      // Save immediately with the new data
      await saveAvailability(newAvailability, true, 'remove');
    } catch (error) {
      console.error('Error removing time slot:', error);
      toast.error('Failed to remove time slot');
    }
  };

  const toggleEditMode = async (index: number) => {
    // If we're closing edit mode (clicking green check), save immediately
    if (editingSlots.has(index)) {
      // Validate the slot before saving
      const slot = safeAvailability[index];

      // Validate time
      if (!slot.startTime || !slot.endTime) {
        toast.error('Please select both start and end times');
        return;
      }

      if (timeToMinutes(slot.startTime) >= timeToMinutes(slot.endTime)) {
        toast.error('End time must be after start time');
        return;
      }

      // Validate services if companion has services
      if (safeCompanionServices.length > 0 && (!slot.services || slot.services.length === 0)) {
        toast.error('Please select at least one service for this time slot');
        return;
      }

      // Save to database immediately
      await saveAvailability();

      // Remove from editing set after successful save
      setEditingSlots(prev => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
    } else {
      // Open edit mode
      setEditingSlots(prev => {
        const newSet = new Set(prev);
        newSet.add(index);
        return newSet;
      });
    }
  };

  const isSlotEditing = (index: number) => {
    return editingSlots.has(index);
  };

  const updateTimeSlot = (index: number, field: keyof AvailabilitySlotExtended, value: any) => {
    // Validate for overlapping times when changing start or end time
    if (field === 'startTime' || field === 'endTime') {
      const currentSlot = availability[index];
      const updatedSlot = { ...currentSlot, [field]: value };

      // Check if the new times are valid (start < end)
      if (timeToMinutes(updatedSlot.startTime) >= timeToMinutes(updatedSlot.endTime)) {
        toast.error('Start time must be before end time');
        return;
      }

      // Check for overlaps with other slots on the same day
      const otherSlots = availability.filter((slot, i) =>
        i !== index && slot.dayOfWeek === currentSlot.dayOfWeek
      );

      for (const otherSlot of otherSlots) {
        // Convert times to minutes for proper comparison
        const updatedStart = timeToMinutes(updatedSlot.startTime);
        const updatedEnd = timeToMinutes(updatedSlot.endTime);
        const otherStart = timeToMinutes(otherSlot.startTime);
        const otherEnd = timeToMinutes(otherSlot.endTime);

        // Check for overlap: slots overlap if one starts before the other ends
        // Allow consecutive slots (where one ends exactly when another begins)
        const overlaps = (
          (updatedStart < otherEnd && updatedEnd > otherStart)
        );

        if (overlaps) {
          toast.error(`This time overlaps with another slot (${formatTime(otherSlot.startTime)} - ${formatTime(otherSlot.endTime)})`);
          return;
        }
      }
    }

    setAvailability(prev => prev.map((slot, i) =>
      i === index ? { ...slot, [field]: value } : slot
    ));
  };

  const toggleService = (index: number, service: string) => {
    setAvailability(prev => prev.map((slot, i) => {
      if (i !== index) return slot;

      const services = slot.services || [];
      const serviceIndex = services.indexOf(service);

      if (serviceIndex > -1) {
        // Remove service
        return {
          ...slot,
          services: services.filter(s => s !== service)
        };
      } else {
        // Add service
        return {
          ...slot,
          services: [...services, service]
        };
      }
    }));
  };

  const saveAvailability = async (dataToSave?: AvailabilitySlotExtended[], showToast = true, operation: 'save' | 'remove' = 'save') => {
    try {
      setIsSaving(true);

      // Use provided data or current state
      const availabilityData = dataToSave || availability;

      // Check for overlapping slots before saving
      const daySlots: { [key: string]: typeof availabilityData } = {};
      availabilityData.forEach(slot => {
        if (!daySlots[slot.dayOfWeek]) {
          daySlots[slot.dayOfWeek] = [];
        }
        daySlots[slot.dayOfWeek].push(slot);
      });

      for (const [day, slots] of Object.entries(daySlots)) {
        if (slots.length > 1) {
          // Sort slots by start time (convert to minutes for proper numerical sorting)
          const sortedSlots = [...slots].sort((a, b) =>
            timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
          );

          // Check for overlaps
          for (let i = 0; i < sortedSlots.length - 1; i++) {
            const currentSlot = sortedSlots[i];
            const nextSlot = sortedSlots[i + 1];

            // Convert times to minutes for proper comparison
            const currentEnd = timeToMinutes(currentSlot.endTime);
            const nextStart = timeToMinutes(nextSlot.startTime);

            // Check if slots overlap (not just consecutive)
            // Consecutive slots where one ends exactly when another begins are allowed
            if (currentEnd > nextStart) {
              toast.error(`Overlapping slots on ${DAY_LABELS[day as keyof typeof DAY_LABELS]}`);
              setIsSaving(false);
              return false;
            }
          }
        }
      }

      await bookingApi.setCompanionAvailability(availabilityData);
      if (showToast) {
        if (operation === 'remove') {
          toast.success('Slot removed');
        } else {
          toast.success('Availability saved');
        }
      }
      setOriginalAvailability([...availabilityData]); // Update original data after successful save
      setHasUnsavedChanges(false);
      return true;
    } catch (error: any) {
      console.error('Error saving availability:', error);
      if (showToast) {
        toast.error('Failed to save availability');
      }
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const getSlotsForDay = (dayOfWeek: string) => {
    return availability.filter(slot => slot.dayOfWeek === dayOfWeek);
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const toggleDayExpansion = (day: string) => {
    setExpandedDays(prev => {
      const newSet = new Set(prev);
      if (newSet.has(day)) {
        newSet.delete(day);
      } else {
        newSet.add(day);
      }
      return newSet;
    });
  };

  if (showLoading) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FaClock className="w-6 h-6 text-[#312E81]" />
          <h2 className="text-xl font-semibold text-gray-900">Availability Schedule</h2>
        </div>
        {isSaving && (
          <span className="px-3 py-1 text-sm bg-[#f0effe] text-[#1E1B4B] rounded-full font-medium animate-pulse">
            Saving...
          </span>
        )}
      </div>

      {/* Show message only if services have been loaded and we're using defaults */}
      {servicesLoaded && isUsingDefaultServices && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">ℹ️ Using Default Services</h3>
          <p className="text-blue-800 text-sm mb-3">
            You're currently using default services for your availability. You can customize your services in your profile.
          </p>
          <p className="text-blue-700 text-sm mb-3">
            Available services: {companionServices.slice(0, 5).join(', ')}, and more.
          </p>
          <button
            onClick={() => navigate('/companion-profile#services-section')}
            className="px-4 py-2 bg-[#312E81] text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            Go to Profile → Add Services
          </button>
        </div>
      )}

      <div className="space-y-4">
        {DAYS_OF_WEEK.map((day) => {
          const daySlots = getSlotsForDay(day);
          const isExpanded = expandedDays.has(day);

          return (
            <div key={day} className="border border-gray-200 rounded-lg overflow-hidden">
              <div
                className={`flex items-center justify-between p-4 ${daySlots.length === 0 ? 'cursor-pointer hover:bg-gray-50' : ''} transition-colors`}
                onClick={() => daySlots.length === 0 ? toggleDayExpansion(day) : null}
              >
                <div className="flex items-center gap-2">
                  {daySlots.length === 0 && (
                    isExpanded ? <FaChevronDown className="w-4 h-4 text-gray-500" /> : <FaChevronRight className="w-4 h-4 text-gray-500" />
                  )}
                  <h3 className="font-semibold text-gray-900">
                    {DAY_LABELS[day as keyof typeof DAY_LABELS]}
                  </h3>
                  {daySlots.length > 0 && (
                    <span className="px-2 py-0.5 bg-[#312E81] text-white rounded-full text-xs font-medium">
                      {daySlots.length} slot{daySlots.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {daySlots.length === 0 && !isExpanded && (
                    <span className="text-sm text-gray-500">No slots</span>
                  )}
                </div>
                {(daySlots.length > 0 || isExpanded) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      addTimeSlot(day);
                    }}
                    disabled={editingSlots.size > 0}
                    className={`flex items-center gap-2 px-3 py-1 text-sm rounded-lg transition-colors ${
                      editingSlots.size > 0
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                    title={editingSlots.size > 0 ? 'Save current slot first' : 'Add new time slot'}
                  >
                    <FaPlus className="w-3 h-3" />
                    Add Slot
                  </button>
                )}
              </div>

              {(daySlots.length > 0 || isExpanded) && (
                <div className="px-4 pb-4">
                  {daySlots.length === 0 ? (
                    <div className="text-center py-4 text-gray-500">
                      <FaClock className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      <p>No availability set for this day</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {daySlots.map((slot, index) => {
                        const globalIndex = availability.findIndex(s => s === slot);
                        const isEditing = isSlotEditing(globalIndex);

                        return (
                          <div key={index} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                            {!isEditing ? (
                              // Minimized/View Mode
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                      {slot.isAvailable ? (
                                        <div className="w-2 h-2 bg-green-500 rounded-full" title="Available"></div>
                                      ) : (
                                        <div className="w-2 h-2 bg-gray-400 rounded-full" title="Not available"></div>
                                      )}
                                      <span className="text-sm font-medium text-gray-700">
                                        {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => toggleEditMode(globalIndex)}
                                      className="p-1.5 text-[#312E81] hover:bg-blue-50 rounded transition-colors"
                                      title="Edit time slot"
                                    >
                                      <FaEdit className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => removeTimeSlot(globalIndex)}
                                      className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                      title="Delete time slot"
                                    >
                                      <FaTrash className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                                {slot.services && slot.services.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {slot.services.map((service, idx) => (
                                      <span
                                        key={idx}
                                        className="inline-block px-2 py-1 text-xs bg-[#f0effe] text-[#1E1B4B] rounded"
                                      >
                                        {service}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-amber-600 italic">No services selected</p>
                                )}
                              </div>
                            ) : (
                              // Expanded/Edit Mode
                              <>
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={slot.isAvailable}
                                      onChange={(e) => updateTimeSlot(globalIndex, 'isAvailable', e.target.checked)}
                                      className="w-4 h-4 text-[#312E81] rounded focus:ring-[#312E81]"
                                    />
                                    <span className="text-sm font-medium text-gray-700">Available</span>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <label className="text-sm text-gray-600 mr-1">From:</label>
                                    <select
                                      value={to12Hour(slot.startTime).hour}
                                      onChange={(e) => {
                                        const { minute, period } = to12Hour(slot.startTime);
                                        updateTimeSlot(globalIndex, 'startTime', to24Hour(e.target.value, minute, period));
                                      }}
                                      className="w-14 px-1 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#312E81] focus:border-transparent text-center"
                                    >
                                      {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                    <span className="text-gray-500">:</span>
                                    <select
                                      value={to12Hour(slot.startTime).minute}
                                      onChange={(e) => {
                                        const { hour, period } = to12Hour(slot.startTime);
                                        updateTimeSlot(globalIndex, 'startTime', to24Hour(hour, e.target.value, period));
                                      }}
                                      className="w-14 px-1 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#312E81] focus:border-transparent text-center"
                                    >
                                      {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                    <select
                                      value={to12Hour(slot.startTime).period}
                                      onChange={(e) => {
                                        const { hour, minute } = to12Hour(slot.startTime);
                                        updateTimeSlot(globalIndex, 'startTime', to24Hour(hour, minute, e.target.value));
                                      }}
                                      className="w-14 px-1 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#312E81] focus:border-transparent text-center"
                                    >
                                      {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <label className="text-sm text-gray-600 mr-1">To:</label>
                                    <select
                                      value={to12Hour(slot.endTime).hour}
                                      onChange={(e) => {
                                        const { minute, period } = to12Hour(slot.endTime);
                                        updateTimeSlot(globalIndex, 'endTime', to24Hour(e.target.value, minute, period));
                                      }}
                                      className="w-14 px-1 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#312E81] focus:border-transparent text-center"
                                    >
                                      {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                    <span className="text-gray-500">:</span>
                                    <select
                                      value={to12Hour(slot.endTime).minute}
                                      onChange={(e) => {
                                        const { hour, period } = to12Hour(slot.endTime);
                                        updateTimeSlot(globalIndex, 'endTime', to24Hour(hour, e.target.value, period));
                                      }}
                                      className="w-14 px-1 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#312E81] focus:border-transparent text-center"
                                    >
                                      {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                    <select
                                      value={to12Hour(slot.endTime).period}
                                      onChange={(e) => {
                                        const { hour, minute } = to12Hour(slot.endTime);
                                        updateTimeSlot(globalIndex, 'endTime', to24Hour(hour, minute, e.target.value));
                                      }}
                                      className="w-14 px-1 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#312E81] focus:border-transparent text-center"
                                    >
                                      {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                  </div>

                                  <button
                                    onClick={() => toggleEditMode(globalIndex)}
                                    className="ml-auto p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                    title="Save changes"
                                  >
                                    <FaCheck className="w-4 h-4" />
                                  </button>
                                </div>

                                {/* Services Selection */}
                                <div className="border-t border-gray-200 pt-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <FaServicestack className="w-4 h-4 text-[#312E81]" />
                                    <label className="text-sm font-medium text-gray-700">
                                      Available Services for this time slot:
                                    </label>
                                  </div>
                                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                    {companionServices.map(service => (
                                      <label
                                        key={service}
                                        className="flex items-center gap-2 p-2 bg-white rounded border border-gray-200 cursor-pointer hover:bg-[#f9f8ff] transition-colors"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={slot.services?.includes(service) || false}
                                          onChange={() => toggleService(globalIndex, service)}
                                          className="w-4 h-4 text-[#312E81] rounded focus:ring-[#312E81]"
                                        />
                                        <span className="text-xs text-gray-700">{service}</span>
                                      </label>
                                    ))}
                                  </div>
                                  {(!slot.services || slot.services.length === 0) && (
                                    <p className="text-xs text-red-500 mt-2">
                                      ⚠️ Please select at least one service for this time slot
                                    </p>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h4 className="font-semibold text-blue-900 mb-2">💡 Tips for setting your availability:</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Set multiple time slots for the same day if you have breaks</li>
          <li>• Select specific services you want to offer during each time slot</li>
          <li>• Consider your peak hours and personal schedule</li>
          <li>• You can always update your availability later</li>
          <li>• Clients will only see available time slots when booking</li>
        </ul>
      </div>

      {/* Note about adding more services */}
      {companionServices.length > 0 && (
        <div className="mt-4 p-4 bg-[#f9f8ff] rounded-lg">
          <div className="flex items-start gap-3">
            <FaServicestack className="w-5 h-5 text-[#312E81] mt-1" />
            <div>
              <h4 className="font-semibold text-[#1E1B4B] mb-1">Want to add more services?</h4>
              <p className="text-sm text-[#1E1B4B] mb-2">
                You can only select from services you've registered in your profile.
                To add more services to offer, please update your profile.
              </p>
              <button
                onClick={() => navigate('/companion-profile#services-section')}
                className="text-sm text-[#312E81] hover:text-[#1E1B4B] font-medium underline"
              >
                Edit Profile → Manage Services
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AvailabilityManager;