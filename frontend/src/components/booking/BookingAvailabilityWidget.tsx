import React, { useState, useEffect } from 'react';
import { FaClock, FaCalendarWeek, FaInfoCircle } from 'react-icons/fa';
import axios from 'axios';
import { API_CONFIG } from '../../constants';
import { transformKeysSnakeToCamel } from '../../types/transformers';

interface WeeklyAvailability {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

interface BookingAvailabilityWidgetProps {
  companionId: number;
  selectedDate?: Date;
  onTimeSlotHint?: (day: string, startTime: string, endTime: string) => void;
}

const BookingAvailabilityWidget: React.FC<BookingAvailabilityWidgetProps> = ({
  companionId,
  selectedDate,
  onTimeSlotHint
}) => {
  const [weeklyAvailability, setWeeklyAvailability] = useState<WeeklyAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);

  const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  useEffect(() => {
    fetchWeeklyAvailability();
  }, [companionId]);

  const fetchWeeklyAvailability = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `${API_CONFIG.BASE_URL}/api/booking/availability/${companionId}/weekly`,
        { withCredentials: true }
      );

      if (response.data.success) {
        const transformedData = transformKeysSnakeToCamel(response.data.data || []);
        setWeeklyAvailability(transformedData);
      }
    } catch (error) {
      console.error('Error fetching weekly availability:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (time: string) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}${minutes !== '00' ? `:${minutes}` : ''}${period}`;
  };

  const getAvailabilityForDay = (day: string) => {
    return weeklyAvailability.filter(slot =>
      slot.dayOfWeek === day && slot.isAvailable
    );
  };

  const getDayStatus = (day: string) => {
    const slots = getAvailabilityForDay(day);
    if (slots.length === 0) return 'unavailable';

    // Check if it's a full day (9+ hours)
    const totalHours = slots.reduce((total, slot) => {
      const start = new Date(`2000-01-01T${slot.startTime}`);
      const end = new Date(`2000-01-01T${slot.endTime}`);
      return total + (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    }, 0);

    if (totalHours >= 8) return 'full';
    if (totalHours >= 4) return 'partial';
    return 'limited';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'full': return 'bg-success-100 border-success-300 text-success-700';
      case 'partial': return 'bg-warning-100 border-warning-300 text-warning-700';
      case 'limited': return 'bg-orange-100 border-orange-300 text-orange-700';
      case 'unavailable': return 'bg-gray-100 border-gray-300 text-gray-400';
      default: return 'bg-gray-100 border-gray-300 text-gray-500';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'full': return 'bg-success-500';
      case 'partial': return 'bg-warning-500';
      case 'limited': return 'bg-orange-500';
      case 'unavailable': return 'bg-gray-300';
      default: return 'bg-gray-300';
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-48 mb-4"></div>
        <div className="grid grid-cols-7 gap-2">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-primary-50/50 to-secondary-50/50 rounded-xl p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <FaCalendarWeek className="w-5 h-5 text-[#312E81]" />
          <h3 className="text-lg font-semibold text-gray-800">Weekly Availability</h3>
        </div>
        <div className="flex items-center gap-1 text-sm text-gray-500">
          <FaInfoCircle className="w-4 h-4" />
          <span>Hover for details</span>
        </div>
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-2 mb-4">
        {daysOfWeek.map((day, index) => {
          const slots = getAvailabilityForDay(day);
          const status = getDayStatus(day);
          const isToday = selectedDate && selectedDate.getDay() === ((index + 1) % 7);

          return (
            <div
              key={day}
              className="relative"
              onMouseEnter={() => setHoveredDay(day)}
              onMouseLeave={() => setHoveredDay(null)}
            >
              <div
                className={`
                  relative p-3 rounded-lg border-2 transition-all duration-200
                  ${getStatusColor(status)}
                  ${isToday ? 'ring-2 ring-[#4A47A3] ring-offset-2' : ''}
                  ${slots.length > 0 ? 'cursor-pointer hover:scale-105 hover:shadow-md' : ''}
                `}
                onClick={() => {
                  if (slots.length > 0 && onTimeSlotHint) {
                    onTimeSlotHint(day, slots[0].startTime, slots[0].endTime);
                  }
                }}
              >
                {/* Day Label */}
                <div className="text-center">
                  <p className="font-semibold text-sm">{dayLabels[index]}</p>

                  {/* Status Indicator */}
                  <div className="mt-2 flex justify-center">
                    <div className={`w-2 h-2 rounded-full ${getStatusBadgeColor(status)}`} />
                  </div>

                  {/* Time Range (if available) */}
                  {slots.length > 0 && (
                    <div className="mt-1 text-xs opacity-75">
                      {slots.length === 1 ? (
                        <span>{formatTime(slots[0].startTime)}</span>
                      ) : (
                        <span>{slots.length} slots</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Hover Tooltip */}
                {hoveredDay === day && slots.length > 0 && (
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-10">
                    <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
                      <div className="font-semibold mb-1">{day.charAt(0).toUpperCase() + day.slice(1)}</div>
                      {slots.map((slot, i) => (
                        <div key={i} className="flex items-center gap-1">
                          <FaClock className="w-3 h-3" />
                          <span>{formatTime(slot.startTime)} - {formatTime(slot.endTime)}</span>
                        </div>
                      ))}
                      <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-gray-900"></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Today Indicator */}
              {isToday && (
                <div className="absolute -top-2 -right-2 bg-[#312E81] text-white text-xs px-2 py-0.5 rounded-full font-semibold shadow-[0_0_15px_rgba(255,204,203,0.3)]">
                  Today
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 pt-4 border-t border-gray-200">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-success-500"></div>
          <span className="text-xs text-gray-600">Available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-warning-500"></div>
          <span className="text-xs text-gray-600">Partial</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-orange-500"></div>
          <span className="text-xs text-gray-600">Limited</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-gray-300"></div>
          <span className="text-xs text-gray-600">Unavailable</span>
        </div>
      </div>

      {/* Summary */}
      <div className="mt-4 text-center">
        <p className="text-sm text-gray-500">
          Available {weeklyAvailability.filter(s => s.isAvailable).length > 0 ?
            `${daysOfWeek.filter(d => getAvailabilityForDay(d).length > 0).length} days` :
            'by appointment'
          } this week
        </p>
      </div>
    </div>
  );
};

export default BookingAvailabilityWidget;