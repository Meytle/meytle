/**
 * Calendar Component
 * A reusable calendar component for booking dates
 */

import { useState, useEffect } from 'react';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';

interface CalendarProps {
  selectedDate?: Date;
  onDateSelect: (date: Date) => void;
  disabledDates?: Date[];
  partialDates?: Date[];
  bookingCounts?: Record<string, number>;
  onMonthChange?: (year: number, month: number) => void;
  minDate?: Date;
  maxDate?: Date;
  className?: string;
}

const Calendar = ({ 
  selectedDate, 
  onDateSelect, 
  disabledDates = [], 
  partialDates = [],
  bookingCounts = {},
  onMonthChange,
  minDate = new Date(),
  maxDate,
  className = ''
}: CalendarProps) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarDays, setCalendarDays] = useState<Date[]>([]);

  // Generate calendar days for current month
  useEffect(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    const days: Date[] = [];
    const endDate = new Date(lastDay);
    endDate.setDate(endDate.getDate() + (6 - lastDay.getDay()));
    
    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      days.push(new Date(date));
    }
    
    setCalendarDays(days);
  }, [currentMonth]);

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev);
      if (direction === 'prev') {
        newMonth.setMonth(newMonth.getMonth() - 1);
      } else {
        newMonth.setMonth(newMonth.getMonth() + 1);
      }
      
      // Call onMonthChange callback if provided
      onMonthChange?.(newMonth.getFullYear(), newMonth.getMonth());
      
      return newMonth;
    });
  };

  const isDateDisabled = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (date < today) return true;
    if (minDate && date < minDate) return true;
    if (maxDate && date > maxDate) return true;
    
    return disabledDates.some(disabledDate => 
      date.toDateString() === disabledDate.toDateString()
    );
  };

  const isDateSelected = (date: Date) => {
    return selectedDate && date.toDateString() === selectedDate.toDateString();
  };

  const isDatePartial = (date: Date) => {
    return partialDates.some(partialDate => 
      date.toDateString() === partialDate.toDateString()
    );
  };

  const getBookingCount = (date: Date): number => {
    // Use local date formatting to avoid timezone shifts
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    return bookingCounts[dateStr] || 0;
  };

  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentMonth.getMonth();
  };

  const formatMonthYear = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      month: 'long', 
      year: 'numeric' 
    });
  };

  const getDayNames = () => {
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-neutral-200 p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigateMonth('prev')}
          className="p-2 hover:bg-primary-50 rounded-lg transition-colors text-[#312E81] hover:text-[#1E1B4B]"
          disabled={minDate && (() => {
            // Normalize dates for comparison by setting to first day of month with time zeroed
            const currentMonthNormalized = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
            const minDateNormalized = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
            return currentMonthNormalized <= minDateNormalized;
          })()}
        >
          <FaChevronLeft className="w-4 h-4" />
        </button>
        
        <h3 className="text-xl font-semibold text-neutral-900">
          {formatMonthYear(currentMonth)}
        </h3>
        
        <button
          onClick={() => navigateMonth('next')}
          className="p-2 hover:bg-primary-50 rounded-lg transition-colors text-[#312E81] hover:text-[#1E1B4B]"
          disabled={maxDate && (() => {
            // Normalize dates for comparison by setting to first day of month with time zeroed
            const currentMonthNormalized = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
            const maxDateNormalized = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
            return currentMonthNormalized >= maxDateNormalized;
          })()}
        >
          <FaChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 gap-2 mb-4">
        {getDayNames().map(day => (
          <div key={day} className="text-center text-sm font-medium text-neutral-600 py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-2">
        {calendarDays.map((date, index) => {
          const isDisabled = isDateDisabled(date);
          const isSelected = isDateSelected(date);
          const isPartial = isDatePartial(date);
          const isCurrentMonthDay = isCurrentMonth(date);
          const isToday = date.toDateString() === new Date().toDateString();
          
          return (
            <button
              key={index}
              onClick={() => !isDisabled && onDateSelect(date)}
              disabled={isDisabled}
              className={`
                aspect-square flex items-center justify-center text-sm rounded-lg transition-all duration-200 relative
                ${isDisabled 
                  ? 'text-neutral-300 cursor-not-allowed bg-neutral-50' 
                  : 'hover:bg-primary-50 cursor-pointer hover:scale-105'
                }
                ${isSelected
                  ? 'bg-gradient-to-r from-[#312E81] to-[#FFCCCB] text-white shadow-lg shadow-[0_0_15px_rgba(255,204,203,0.3)]'
                  : ''
                }
                ${!isCurrentMonthDay ? 'text-neutral-400' : 'text-neutral-900'}
                ${isToday && !isSelected ? 'bg-warning-100 text-warning-800 border-2 border-warning-300' : ''}
              `}
            >
              {date.getDate()}
              {/* Booking count badge */}
              {getBookingCount(date) > 0 && !isDisabled && (
                <div className="absolute top-1 right-1 w-4 h-4 bg-[#312E81] text-white text-xs rounded-full flex items-center justify-center">
                  {getBookingCount(date)}
                </div>
              )}
              {/* Visual indicators */}
              {!isDisabled && !isSelected && (
                <div className={`absolute bottom-1 w-1 h-1 rounded-full opacity-60 ${
                  isPartial ? 'bg-warning-400' : 'bg-[#4A47A3]'
                }`}></div>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-neutral-200">
        <div className="flex items-center justify-center gap-4 text-xs text-neutral-600 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#4A47A3]"></div>
            <span>Available</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-warning-400"></div>
            <span>Partial</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-warning-300"></div>
            <span>Today</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-neutral-300"></div>
            <span>Unavailable</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-[#312E81] text-white text-xs rounded-full flex items-center justify-center">1</div>
            <span>Numbers indicate booking count</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Calendar;

