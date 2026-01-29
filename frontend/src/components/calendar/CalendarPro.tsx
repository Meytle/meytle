/**
 * Calendar Pro Component
 * Advanced calendar with availability indicators and improved UI
 */

import { useState, useEffect } from 'react';
import {
  FaChevronLeft,
  FaChevronRight,
  FaCalendarAlt,
  FaClock,
  FaInfoCircle,
  FaCheckCircle,
  FaExclamationCircle
} from 'react-icons/fa';
import { bookingApi } from '../../api/booking';
import { toast } from 'react-hot-toast';

interface CalendarDate {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  isSelected: boolean;
  availability?: {
    isAvailable: boolean;
    totalSlots: number;
    availableSlots: number;
    bookedSlots: number;
  };
}

interface CalendarProProps {
  companionId: number;
  selectedDate?: Date;
  onDateSelect: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  className?: string;
  showAvailabilityPreview?: boolean;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CalendarPro = ({
  companionId,
  selectedDate,
  onDateSelect,
  minDate = new Date(),
  maxDate,
  className = '',
  showAvailabilityPreview = true
}: CalendarProProps) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarDates, setCalendarDates] = useState<CalendarDate[]>([]);
  const [availabilityData, setAvailabilityData] = useState<any>({});
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [hoveredDate, setHoveredDate] = useState<Date | null>(null);

  useEffect(() => {
    generateCalendarDates();
    fetchMonthAvailability();
  }, [currentMonth, companionId]);

  useEffect(() => {
    updateSelectedDate();
  }, [selectedDate]);

  const generateCalendarDates = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const dates: CalendarDate[] = [];
    const endDate = new Date(lastDay);
    endDate.setDate(endDate.getDate() + (6 - lastDay.getDay()));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      const currentDate = new Date(date);
      currentDate.setHours(0, 0, 0, 0);

      dates.push({
        date: new Date(currentDate),
        isCurrentMonth: currentDate.getMonth() === month,
        isToday: currentDate.getTime() === today.getTime(),
        isPast: currentDate < today,
        isSelected: selectedDate ? currentDate.getTime() === selectedDate.getTime() : false
      });
    }

    setCalendarDates(dates);
  };

  const updateSelectedDate = () => {
    setCalendarDates(prev => prev.map(dateObj => ({
      ...dateObj,
      isSelected: selectedDate ?
        dateObj.date.toDateString() === selectedDate.toDateString() :
        false
    })));
  };

  const fetchMonthAvailability = async () => {
    try {
      setIsLoadingAvailability(true);

      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);

      // Extend range to include overflow days
      const startDate = new Date(firstDay);
      startDate.setDate(startDate.getDate() - firstDay.getDay());
      const endDate = new Date(lastDay);
      endDate.setDate(endDate.getDate() + (6 - lastDay.getDay()));

      const startStr = formatDateForAPI(startDate);
      const endStr = formatDateForAPI(endDate);

      const response = await bookingApi.getCompanionAvailabilityForDateRange(
        companionId,
        startStr,
        endStr
      );

      setAvailabilityData(response.availabilityCalendar || {});

      // Update calendar dates with availability info
      setCalendarDates(prev => prev.map(dateObj => {
        const dateStr = formatDateForAPI(dateObj.date);
        const availability = response.availabilityCalendar?.[dateStr];

        return {
          ...dateObj,
          availability: availability ? {
            isAvailable: availability.isAvailable,
            totalSlots: availability.totalSlots,
            availableSlots: availability.availableSlots,
            bookedSlots: availability.bookedSlots
          } : undefined
        };
      }));
    } catch (error: any) {
      console.error('Error fetching availability:', error);
      // Don't show toast for availability fetching errors to avoid spam
    } finally {
      setIsLoadingAvailability(false);
    }
  };

  const formatDateForAPI = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev);
      if (direction === 'prev') {
        newMonth.setMonth(newMonth.getMonth() - 1);
      } else {
        newMonth.setMonth(newMonth.getMonth() + 1);
      }
      return newMonth;
    });
  };

  const handleDateClick = (dateObj: CalendarDate) => {
    if (dateObj.isPast) return;
    if (minDate && dateObj.date < minDate) return;
    if (maxDate && dateObj.date > maxDate) return;

    onDateSelect(dateObj.date);
  };

  const getDateStatusColor = (dateObj: CalendarDate) => {
    if (dateObj.isPast) return 'bg-gray-100 text-gray-400 cursor-not-allowed';
    if (!dateObj.availability) return 'bg-white hover:bg-gray-50';

    const { isAvailable, availableSlots, totalSlots } = dateObj.availability;

    if (!isAvailable || totalSlots === 0) {
      return 'bg-gray-100 text-gray-500';
    }

    const percentAvailable = (availableSlots / totalSlots) * 100;

    if (percentAvailable === 100) {
      return 'bg-green-50 text-green-700 hover:bg-green-100 border-green-200';
    } else if (percentAvailable >= 50) {
      return 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border-yellow-200';
    } else if (percentAvailable > 0) {
      return 'bg-orange-50 text-orange-700 hover:bg-orange-100 border-orange-200';
    } else {
      return 'bg-red-50 text-red-700 border-red-200';
    }
  };

  const getAvailabilityIndicator = (dateObj: CalendarDate) => {
    if (!dateObj.availability || dateObj.isPast) return null;

    const { isAvailable, availableSlots, totalSlots } = dateObj.availability;

    if (!isAvailable || totalSlots === 0) {
      return <div className="w-2 h-2 bg-gray-400 rounded-full" />;
    }

    const percentAvailable = (availableSlots / totalSlots) * 100;

    if (percentAvailable === 100) {
      return <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />;
    } else if (percentAvailable >= 50) {
      return <div className="w-2 h-2 bg-yellow-500 rounded-full" />;
    } else if (percentAvailable > 0) {
      return <div className="w-2 h-2 bg-orange-500 rounded-full" />;
    } else {
      return <div className="w-2 h-2 bg-red-500 rounded-full" />;
    }
  };

  const getTooltipContent = (dateObj: CalendarDate) => {
    if (!dateObj.availability) return null;

    const { availableSlots, bookedSlots } = dateObj.availability;

    return `${availableSlots} slots available, ${bookedSlots} booked`;
  };

  return (
    <div className={`bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-[#312E81] to-[#312E81] text-white p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <FaCalendarAlt className="w-6 h-6" />
            <h2 className="text-2xl font-bold">Select Date</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigateMonth('prev')}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              disabled={minDate && (() => {
                const currentMonthNormalized = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
                const minDateNormalized = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
                return currentMonthNormalized <= minDateNormalized;
              })()}
            >
              <FaChevronLeft className="w-5 h-5" />
            </button>

            <div className="px-4 py-2 bg-white/20 rounded-lg min-w-[200px] text-center">
              <div className="text-lg font-semibold">
                {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </div>
            </div>

            <button
              onClick={() => navigateMonth('next')}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              disabled={maxDate && (() => {
                const currentMonthNormalized = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
                const maxDateNormalized = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
                return currentMonthNormalized >= maxDateNormalized;
              })()}
            >
              <FaChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* View mode toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('month')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              viewMode === 'month' ? 'bg-white text-[#312E81]' : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            Month View
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              viewMode === 'week' ? 'bg-white text-[#312E81]' : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            Week View
          </button>
        </div>
      </div>

      {/* Calendar Body */}
      <div className="p-6">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-2 mb-4">
          {WEEKDAYS.map(day => (
            <div key={day} className="text-center text-sm font-semibold text-gray-700 py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-2">
          {calendarDates.map((dateObj, index) => {
            const statusColor = getDateStatusColor(dateObj);
            const indicator = getAvailabilityIndicator(dateObj);
            const tooltip = getTooltipContent(dateObj);

            return (
              <div
                key={index}
                onClick={() => handleDateClick(dateObj)}
                onMouseEnter={() => setHoveredDate(dateObj.date)}
                onMouseLeave={() => setHoveredDate(null)}
                className={`
                  relative aspect-square flex flex-col items-center justify-center
                  text-sm rounded-xl transition-all duration-200 cursor-pointer
                  border-2 hover:shadow-lg hover:scale-105
                  ${statusColor}
                  ${dateObj.isSelected ?
                    'ring-4 ring-[#4A47A3] border-[#312E81] bg-[#f0effe] font-bold' :
                    'border-transparent'
                  }
                  ${!dateObj.isCurrentMonth ? 'opacity-40' : ''}
                  ${dateObj.isToday ? 'ring-2 ring-[#4A47A3]' : ''}
                `}
                title={tooltip || undefined}
              >
                <div className="text-lg font-medium">{dateObj.date.getDate()}</div>

                {/* Availability indicator */}
                {indicator && (
                  <div className="absolute bottom-2">
                    {indicator}
                  </div>
                )}

                {/* Slots count badge */}
                {dateObj.availability && dateObj.availability.availableSlots > 0 && !dateObj.isPast && (
                  <div className="absolute top-1 right-1 bg-[#312E81] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                    {dateObj.availability.availableSlots}
                  </div>
                )}

                {/* Today indicator */}
                {dateObj.isToday && (
                  <div className="absolute top-1 left-1 bg-[#312E81] text-white text-xs px-2 py-0.5 rounded-full">
                    Today
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="px-6 pb-6">
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-2 mb-3">
            <FaInfoCircle className="w-4 h-4 text-gray-600" />
            <span className="text-sm font-semibold text-gray-700">Availability Legend</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-gray-600">Fully Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <span className="text-gray-600">Partially Booked</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
              <span className="text-gray-600">Limited Slots</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <span className="text-gray-600">Fully Booked</span>
            </div>
          </div>
        </div>
      </div>

      {/* Hover Preview */}
      {hoveredDate && availabilityData[formatDateForAPI(hoveredDate)] && (
        <div className="px-6 pb-6">
          <div className="bg-[#f9f8ff] rounded-xl p-4 border border-[#d5d3f7]">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-[#1E1B4B]">
                  {hoveredDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </div>
                <div className="text-sm text-[#1E1B4B] mt-1">
                  {availabilityData[formatDateForAPI(hoveredDate)].slots.length > 0 ? (
                    <>
                      Available times:
                      {availabilityData[formatDateForAPI(hoveredDate)].slots.map((slot: any, idx: number) => (
                        <span key={idx} className="ml-2">
                          {slot.startTime} - {slot.endTime}
                          {idx < availabilityData[formatDateForAPI(hoveredDate)].slots.length - 1 && ','}
                        </span>
                      ))}
                    </>
                  ) : (
                    'No availability for this date'
                  )}
                </div>
              </div>
              <FaClock className="w-6 h-6 text-[#312E81]" />
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {isLoadingAvailability && (
        <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#312E81]"></div>
            <span className="text-sm text-gray-600">Loading availability...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarPro;