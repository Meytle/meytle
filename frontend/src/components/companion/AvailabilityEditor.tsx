/**
 * Enhanced Availability Manager Component
 * Improved visual design with templates and drag-and-drop functionality
 */

import { useState, useEffect } from 'react';
import {
  FaClock,
  FaPlus,
  FaTrash,
  FaSave,
  FaEdit,
  FaCheck,
  FaTimes,
  FaCalendarWeek,
  FaInfoCircle,
  FaCopy,
  FaMagic,
  FaExclamationTriangle,
  FaSun,
  FaMoon,
  FaCloudSun
} from 'react-icons/fa';
import { toast } from 'react-hot-toast';
import { bookingApi } from '../../api/booking';
import { companionsApi } from '../../api/companions';
import type { AvailabilitySlot } from '../../types';

const DAYS_OF_WEEK = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
];

const DAY_LABELS: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday'
};

const DAY_SHORT: Record<string, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun'
};

// Predefined templates for quick setup
const SCHEDULE_TEMPLATES = [
  {
    id: 'business',
    name: 'Business Hours',
    icon: <FaSun className="w-4 h-4" />,
    description: '9 AM - 5 PM, Mon-Fri',
    schedule: [
      { day: 'monday', start: '09:00', end: '17:00' },
      { day: 'tuesday', start: '09:00', end: '17:00' },
      { day: 'wednesday', start: '09:00', end: '17:00' },
      { day: 'thursday', start: '09:00', end: '17:00' },
      { day: 'friday', start: '09:00', end: '17:00' }
    ]
  },
  {
    id: 'evening',
    name: 'Evening Hours',
    icon: <FaMoon className="w-4 h-4" />,
    description: '5 PM - 10 PM, Daily',
    schedule: DAYS_OF_WEEK.map(day => ({ day, start: '17:00', end: '22:00' }))
  },
  {
    id: 'weekend',
    name: 'Weekends Only',
    icon: <FaCalendarWeek className="w-4 h-4" />,
    description: '10 AM - 8 PM, Sat-Sun',
    schedule: [
      { day: 'saturday', start: '10:00', end: '20:00' },
      { day: 'sunday', start: '10:00', end: '20:00' }
    ]
  },
  {
    id: 'flexible',
    name: 'Flexible Schedule',
    icon: <FaCloudSun className="w-4 h-4" />,
    description: 'Morning & Evening',
    schedule: DAYS_OF_WEEK.map(day => [
      { day, start: '08:00', end: '12:00' },
      { day, start: '18:00', end: '22:00' }
    ]).flat()
  }
];

interface AvailabilitySlotExtended extends AvailabilitySlot {
  services?: string[];
  isNew?: boolean;
  tempId?: string;
}

interface AvailabilityEditorProps {
  className?: string;
}

const AvailabilityEditor = ({ className = '' }: AvailabilityEditorProps) => {
  const [availability, setAvailability] = useState<AvailabilitySlotExtended[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [companionServices, setCompanionServices] = useState<string[]>([]);
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    fetchAvailability();
    fetchCompanionServices();
  }, []);

  const fetchCompanionServices = async () => {
    try {
      const response = await companionsApi.getCompanionServices();
      if (response.status === 'success' && response.data.services) {
        setCompanionServices(Array.isArray(response.data.services) ? response.data.services : []);
      }
    } catch (error) {
      console.error('Error fetching services:', error);
      // Use default services as fallback
      setCompanionServices([
        'Social Companion',
        'Event Companion',
        'Travel Companion',
        'Dining Companion'
      ]);
    }
  };

  const fetchAvailability = async () => {
    try {
      setIsLoading(true);
      const slots = await bookingApi.getCompanionAvailability(0);
      const parsedSlots = slots.map(slot => ({
        ...slot,
        services: slot.services ? (typeof slot.services === 'string' ? JSON.parse(slot.services) : slot.services) : []
      }));
      setAvailability(parsedSlots);
    } catch (error: any) {
      if (error.response?.status === 404) {
        setAvailability([]);
      } else {
        toast.error('Failed to load availability');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const applyTemplate = (templateId: string) => {
    const template = SCHEDULE_TEMPLATES.find(t => t.id === templateId);
    if (!template) return;

    const newSlots = template.schedule.map(slot => ({
      dayOfWeek: slot.day,
      startTime: slot.start,
      endTime: slot.end,
      isAvailable: true,
      services: companionServices,
      isNew: true,
      tempId: `${slot.day}-${slot.start}-${Date.now()}`
    }));

    setAvailability(newSlots);
    setSelectedTemplate(templateId);
    toast.success(`Applied "${template.name}" template`);
  };

  const addTimeSlot = (day: string) => {
    const newSlot: AvailabilitySlotExtended = {
      dayOfWeek: day,
      startTime: '09:00',
      endTime: '17:00',
      isAvailable: true,
      services: companionServices,
      isNew: true,
      tempId: `${day}-${Date.now()}`
    };

    setAvailability([...availability, newSlot]);
    setEditingSlot(newSlot.tempId || '');
  };

  const removeTimeSlot = (identifier: string) => {
    setAvailability(availability.filter(slot =>
      slot.id !== identifier && slot.tempId !== identifier
    ));
  };

  const updateTimeSlot = (identifier: string, updates: Partial<AvailabilitySlotExtended>) => {
    setAvailability(availability.map(slot => {
      if (slot.id === identifier || slot.tempId === identifier) {
        return { ...slot, ...updates };
      }
      return slot;
    }));
  };

  const saveAvailability = async () => {
    try {
      setIsSaving(true);

      // Validate slots for overlaps
      const overlaps = checkForOverlaps();
      if (overlaps.length > 0) {
        toast.error('Please fix time overlaps before saving');
        return;
      }

      await bookingApi.setCompanionAvailability(availability);
      await fetchAvailability(); // Refresh to get server state
      toast.success('Availability updated successfully');
    } catch (error) {
      console.error('Error saving availability:', error);
      toast.error('Failed to save availability');
    } finally {
      setIsSaving(false);
    }
  };

  const checkForOverlaps = () => {
    const overlaps: string[] = [];

    DAYS_OF_WEEK.forEach(day => {
      const daySlots = availability
        .filter(slot => slot.dayOfWeek === day)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

      for (let i = 0; i < daySlots.length - 1; i++) {
        if (daySlots[i].endTime > daySlots[i + 1].startTime) {
          overlaps.push(day);
        }
      }
    });

    return [...new Set(overlaps)];
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${period}`;
  };

  const getDaySlots = (day: string) => {
    return availability
      .filter(slot => slot.dayOfWeek === day)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  const clearAll = () => {
    if (window.confirm('Are you sure you want to clear all availability?')) {
      setAvailability([]);
      toast.success('All availability cleared');
    }
  };

  const copyWeek = (fromDay: string) => {
    const sourceSlots = getDaySlots(fromDay);
    if (sourceSlots.length === 0) {
      toast.error('No slots to copy');
      return;
    }

    const newSlots: AvailabilitySlotExtended[] = [];
    DAYS_OF_WEEK.forEach(day => {
      if (day !== fromDay) {
        sourceSlots.forEach(slot => {
          newSlots.push({
            ...slot,
            dayOfWeek: day,
            isNew: true,
            tempId: `${day}-${slot.startTime}-${Date.now()}`,
            id: undefined
          });
        });
      }
    });

    setAvailability([
      ...availability.filter(s => s.dayOfWeek === fromDay),
      ...newSlots
    ]);

    toast.success('Schedule copied to all days');
  };

  const overlappingDays = checkForOverlaps();

  if (isLoading) {
    return (
      <div className={`bg-white rounded-xl shadow-sm p-6 ${className}`}>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-7 gap-2">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      {/* Header with Templates */}
      <div className="bg-gradient-to-r from-[#312E81] to-[#FFCCCB] text-white rounded-t-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <FaCalendarWeek className="w-6 h-6" />
              Availability Schedule
            </h2>
            <p className="text-white/90 mt-1">Set your weekly availability for bookings</p>
          </div>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors flex items-center gap-2"
          >
            <FaInfoCircle className="w-4 h-4" />
            {showPreview ? 'Hide' : 'Show'} Preview
          </button>
        </div>

        {/* Quick Templates */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {SCHEDULE_TEMPLATES.map(template => (
            <button
              key={template.id}
              onClick={() => applyTemplate(template.id)}
              className={`p-3 rounded-lg transition-all ${
                selectedTemplate === template.id
                  ? 'bg-white text-[#312E81] shadow-lg'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                {template.icon}
                <span className="font-medium">{template.name}</span>
              </div>
              <p className="text-xs opacity-90">{template.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Main Schedule Grid */}
      <div className="bg-white rounded-b-xl shadow-sm p-6">
        {/* Action Buttons */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-2">
            <button
              onClick={clearAll}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-2"
            >
              <FaTrash className="w-4 h-4" />
              Clear All
            </button>
          </div>
          <button
            onClick={saveAvailability}
            disabled={isSaving || overlappingDays.length > 0}
            className="px-6 py-2 bg-gradient-to-r from-[#312E81] to-[#FFCCCB] text-white rounded-lg hover:shadow-lg hover:shadow-[0_0_15px_rgba(255,204,203,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <FaSave className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Schedule'}
          </button>
        </div>

        {/* Overlap Warning */}
        {overlappingDays.length > 0 && (
          <div className="mb-4 p-4 bg-error-50 border border-error-200 rounded-lg flex items-center gap-2 text-error-700">
            <FaExclamationTriangle className="w-5 h-5" />
            <span>Time overlaps detected on: {overlappingDays.map(d => DAY_SHORT[d]).join(', ')}</span>
          </div>
        )}

        {/* Weekly Schedule Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
          {DAYS_OF_WEEK.map(day => {
            const daySlots = getDaySlots(day);
            const hasOverlap = overlappingDays.includes(day);

            return (
              <div
                key={day}
                className={`border rounded-lg p-4 ${
                  hasOverlap ? 'border-error-300 bg-error-50' : 'border-gray-200'
                }`}
              >
                {/* Day Header */}
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-800">{DAY_SHORT[day]}</h3>
                  <div className="flex gap-1">
                    {daySlots.length > 0 && (
                      <button
                        onClick={() => copyWeek(day)}
                        className="p-1 text-gray-500 hover:text-[#312E81] transition-colors"
                        title="Copy to all days"
                      >
                        <FaCopy className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      onClick={() => addTimeSlot(day)}
                      className="p-1 text-[#312E81] hover:text-[#1E1B4B] transition-colors"
                      title="Add time slot"
                    >
                      <FaPlus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Time Slots */}
                <div className="space-y-2">
                  {daySlots.length === 0 ? (
                    <div className="text-center py-4 text-gray-400">
                      <FaClock className="w-6 h-6 mx-auto mb-1 opacity-50" />
                      <p className="text-xs">No availability</p>
                    </div>
                  ) : (
                    daySlots.map(slot => {
                      const identifier = String(slot.id || slot.tempId || '');
                      const isEditing = editingSlot === identifier;

                      return (
                        <div
                          key={identifier}
                          className={`p-2 rounded-lg border ${
                            isEditing
                              ? 'border-[#312E81] bg-primary-50'
                              : 'border-gray-200 bg-gray-50'
                          }`}
                        >
                          {isEditing ? (
                            <div className="space-y-2">
                              <div className="flex gap-1">
                                <input
                                  type="time"
                                  value={slot.startTime}
                                  onChange={e => updateTimeSlot(identifier, { startTime: e.target.value })}
                                  className="flex-1 px-2 py-1 text-xs border rounded"
                                />
                                <span className="text-xs self-center">-</span>
                                <input
                                  type="time"
                                  value={slot.endTime}
                                  onChange={e => updateTimeSlot(identifier, { endTime: e.target.value })}
                                  className="flex-1 px-2 py-1 text-xs border rounded"
                                />
                              </div>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => setEditingSlot(null)}
                                  className="flex-1 px-2 py-1 bg-[#312E81] text-white rounded text-xs hover:bg-[#1E1B4B]"
                                >
                                  <FaCheck className="w-3 h-3 mx-auto" />
                                </button>
                                <button
                                  onClick={() => removeTimeSlot(identifier)}
                                  className="flex-1 px-2 py-1 bg-error-500 text-white rounded text-xs hover:bg-error-600"
                                >
                                  <FaTrash className="w-3 h-3 mx-auto" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div
                              onClick={() => setEditingSlot(identifier)}
                              className="cursor-pointer hover:bg-primary-100 rounded p-1 transition-colors"
                            >
                              <div className="text-xs font-medium text-gray-700">
                                {formatTime(slot.startTime)}
                              </div>
                              <div className="text-xs text-gray-500">
                                to {formatTime(slot.endTime)}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Preview Section */}
        {showPreview && (
          <div className="mt-6 p-4 bg-gradient-to-br from-primary-50 to-secondary-50 rounded-lg">
            <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <FaMagic className="w-4 h-4 text-[#312E81]" />
              Client View Preview
            </h4>
            <div className="grid grid-cols-7 gap-2">
              {DAYS_OF_WEEK.map(day => {
                const daySlots = getDaySlots(day);
                const totalHours = daySlots.reduce((acc, slot) => {
                  const start = new Date(`2000-01-01T${slot.startTime}`);
                  const end = new Date(`2000-01-01T${slot.endTime}`);
                  return acc + (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                }, 0);

                return (
                  <div key={day} className="text-center">
                    <p className="text-xs font-medium text-gray-600 mb-1">{DAY_SHORT[day]}</p>
                    <div
                      className={`p-2 rounded-lg ${
                        totalHours === 0
                          ? 'bg-gray-100 text-gray-400'
                          : totalHours >= 8
                          ? 'bg-success-100 text-success-700'
                          : 'bg-warning-100 text-warning-700'
                      }`}
                    >
                      {totalHours === 0 ? (
                        <span className="text-xs">Off</span>
                      ) : (
                        <span className="text-xs font-medium">{totalHours}h</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AvailabilityEditor;