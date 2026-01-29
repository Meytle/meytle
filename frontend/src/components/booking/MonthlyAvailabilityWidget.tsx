import React, { useState, useEffect } from 'react';
import { FaCalendarAlt, FaChevronLeft, FaChevronRight, FaClock, FaInfoCircle } from 'react-icons/fa';
import axios from 'axios';
import { API_CONFIG } from '../../constants';

interface DayAvailability {
  dayOfWeek: string;
  totalSlots: number;
  availableSlots: number;
  bookedSlots: number;
  isAvailable: boolean;
  slots: {
    startTime: string;
    endTime: string;
    services?: string[];
  }[];
}

interface AvailabilityCalendar {
  [date: string]: DayAvailability;
}

interface MonthlyAvailabilityWidgetProps {
  companionId: number;
  selectedDate?: Date;
  onDateSelect?: (date: Date) => void;
  refreshTrigger?: number;
}

const MonthlyAvailabilityWidget: React.FC<MonthlyAvailabilityWidgetProps> = ({
  companionId,
  selectedDate,
  onDateSelect,
  refreshTrigger
}) => {
  const [currentMonth, setCurrentMonth] = useState<Date>(selectedDate || new Date());
  const [availabilityData, setAvailabilityData] = useState<AvailabilityCalendar>({});
  const [loading, setLoading] = useState(true);

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  console.log('🔍 MonthlyAvailabilityWidget mounted with:', {
    companionId,
    currentMonth: currentMonth.toISOString(),
    hasOnDateSelect: !!onDateSelect
  });

  useEffect(() => {
    console.log('🔄 useEffect triggered - fetching availability for companion:', companionId);
    if (companionId && companionId > 0) {
      fetchMonthlyAvailability();
    } else {
      console.error('❌ Invalid companionId:', companionId);
    }
  }, [companionId, currentMonth, refreshTrigger]);

  const fetchMonthlyAvailability = async () => {
    try {
      setLoading(true);
      
      // Calculate start and end dates for the month
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0);
      
      // Format dates in local timezone to avoid timezone shift
      const startDateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
      const endDateStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

      const url = `${API_CONFIG.BASE_URL}/booking/availability/${companionId}/calendar`;
      console.log('🌐 Calling availability API:', {
        url,
        startDate: startDateStr,
        endDate: endDateStr,
        companionId
      });

      const response = await axios.get(url, {
        params: {
          startDate: startDateStr,
          endDate: endDateStr
        },
        withCredentials: true
      });

      console.log('✅ API Response received:', {
        status: response.status,
        responseStatus: response.data.status,
        dataKeys: Object.keys(response.data || {})
      });

      if (response.data.status === 'success' && response.data.data) {
        const calendar = response.data.data.availabilityCalendar || {};
        console.log('📅 Monthly availability data received:', {
          totalDays: Object.keys(calendar).length,
          daysWithSlots: Object.values(calendar).filter((d: any) => d.availableSlots > 0).length,
          sampleDay: Object.keys(calendar)[0] ? calendar[Object.keys(calendar)[0]] : null
        });
        setAvailabilityData(calendar);
      } else {
        console.error('❌ Unexpected response format:', response.data);
      }
    } catch (error) {
      console.error('Error fetching monthly availability:', error);
      setAvailabilityData({});
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

  const getAvailabilityStatus = (dateStr: string) => {
    const data = availabilityData[dateStr];
    if (!data) return 'no-data';
    if (!data.isAvailable || data.availableSlots === 0) return 'unavailable';
    if (data.availableSlots === data.totalSlots) return 'fully-available';
    return 'partially-available';
  };

  const getStatusColor = (status: string, isPast: boolean, isSelected: boolean | undefined) => {
    // Selection state - highest priority
    if (isSelected && !isPast) {
      return 'bg-[#312E81] border-[#312E81] text-white';
    }
    
    // Past dates - muted but still visible
    if (isPast) {
      return 'bg-gray-50 border-gray-200 text-gray-400';
    }
    
    // All future dates - simple gray border, white background
    return 'bg-white border-gray-200 text-gray-900 hover:bg-gray-50';
  };

  const getDotColor = (hasAvailability: boolean) => {
    return hasAvailability ? 'bg-green-500' : 'bg-gray-300';
  };

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const renderCalendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days = [];

    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(
        <div key={`empty-${i}`} className="p-2 min-h-[80px]" />
      );
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      // Format date in local timezone to avoid timezone shift
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const isPast = date < today;
      const isToday = date.toDateString() === today.toDateString();
      const isSelected = selectedDate && date.toDateString() === selectedDate.toDateString();
      const status = getAvailabilityStatus(dateStr);
      const dayData = availabilityData[dateStr];

      const hasAvailability = dayData?.isAvailable && dayData.availableSlots > 0;
      const isClickable = !isPast && hasAvailability;

      days.push(
        <button
          key={dateStr}
          type="button"
          disabled={!isClickable}
          onClick={() => {
            if (isClickable && onDateSelect) {
              onDateSelect(date);
            }
          }}
          className={`
            relative p-3 min-h-[90px] rounded-lg border-2 transition-all duration-200 flex flex-col items-center justify-center
            ${!isClickable ? 'cursor-not-allowed' : 'cursor-pointer hover:shadow-lg'}
            ${getStatusColor(status, isPast, isSelected)}
          `}
        >
          {/* Day Number - Large and centered */}
          <div className={`text-2xl font-bold mb-2 ${isSelected ? 'text-white' : isPast ? 'text-gray-400' : 'text-gray-900'}`}>
            {day}
          </div>

          {/* Simple Dot Indicator - Green = available, Gray = not available (only show on future dates) */}
          {!isPast && (
            <div className="flex items-center justify-center">
              <div className={`w-3 h-3 rounded-full ${getDotColor(dayData?.isAvailable && dayData.availableSlots > 0)}`} />
            </div>
          )}
        </button>
      );
    }

    return days;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-48 mb-4"></div>
        <div className="grid grid-cols-7 gap-2">
          {[...Array(35)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-primary-50/50 to-secondary-50/50 rounded-xl p-6 shadow-sm">

      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={goToPreviousMonth}
          className="p-2 hover:bg-white rounded-lg transition-colors"
          aria-label="Previous month"
        >
          <FaChevronLeft className="w-5 h-5 text-[#312E81]" />
        </button>
        
        <h4 className="text-xl font-bold text-gray-900">
          {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h4>
        
        <button
          onClick={goToNextMonth}
          className="p-2 hover:bg-white rounded-lg transition-colors"
          aria-label="Next month"
        >
          <FaChevronRight className="w-5 h-5 text-[#312E81]" />
        </button>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 gap-2 mb-3">
        {daysOfWeek.map(day => (
          <div key={day} className="text-center text-sm font-bold text-gray-700 uppercase py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-2">
        {renderCalendarDays()}
      </div>
    </div>
  );
};

export default MonthlyAvailabilityWidget;

