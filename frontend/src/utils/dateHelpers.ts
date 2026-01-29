/**
 * Date Helper Utilities
 * Centralized date validation and formatting functions for frontend
 */

/**
 * Safely parse a date string or Date object
 */
export const safeParseDate = (date: string | Date | null | undefined): Date | null => {
  if (!date) return null;

  const parsed = date instanceof Date ? date : new Date(date);

  // Check for valid date
  if (isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

/**
 * Format date for display
 */
export const formatDate = (
  date: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = {}
): string => {
  const parsed = safeParseDate(date);

  if (!parsed) {
    return 'Invalid Date';
  }

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...options
  };

  return new Intl.DateTimeFormat('en-US', defaultOptions).format(parsed);
};

/**
 * Format time for display (12-hour format)
 */
export const formatTime = (time: string | null | undefined): string => {
  if (!time) return 'Invalid Time';

  // Handle time strings like "14:30:00" or "14:30"
  const parts = time.split(':');
  if (parts.length < 2) return 'Invalid Time';

  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);

  if (isNaN(hours) || isNaN(minutes)) return 'Invalid Time';

  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  const displayMinutes = minutes.toString().padStart(2, '0');

  return `${displayHours}:${displayMinutes} ${period}`;
};

/**
 * Format date and time together
 */
export const formatDateTime = (
  date: string | Date | null | undefined,
  time: string | null | undefined
): string => {
  const formattedDate = formatDate(date, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const formattedTime = formatTime(time);

  if (formattedDate === 'Invalid Date' || formattedTime === 'Invalid Time') {
    return 'Invalid Date/Time';
  }

  return `${formattedDate} at ${formattedTime}`;
};

/**
 * Format relative time (e.g., "2 hours ago", "in 3 days")
 */
export const formatRelativeTime = (date: string | Date | null | undefined): string => {
  const parsed = safeParseDate(date);
  if (!parsed) return 'Invalid Date';

  const now = new Date();
  const diffMs = parsed.getTime() - now.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (Math.abs(diffSecs) < 60) {
    return 'just now';
  } else if (Math.abs(diffMins) < 60) {
    const mins = Math.abs(diffMins);
    return diffMs < 0 ? `${mins} minute${mins !== 1 ? 's' : ''} ago` : `in ${mins} minute${mins !== 1 ? 's' : ''}`;
  } else if (Math.abs(diffHours) < 24) {
    const hours = Math.abs(diffHours);
    return diffMs < 0 ? `${hours} hour${hours !== 1 ? 's' : ''} ago` : `in ${hours} hour${hours !== 1 ? 's' : ''}`;
  } else if (Math.abs(diffDays) < 30) {
    const days = Math.abs(diffDays);
    return diffMs < 0 ? `${days} day${days !== 1 ? 's' : ''} ago` : `in ${days} day${days !== 1 ? 's' : ''}`;
  }

  return formatDate(parsed);
};

/**
 * Check if a date is in the past
 */
export const isPastDate = (date: string | Date | null | undefined): boolean => {
  const parsed = safeParseDate(date);
  if (!parsed) return true; // Treat invalid dates as past

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);

  return parsed < today;
};

/**
 * Check if a time slot is in the past (including date)
 */
export const isPastTimeSlot = (
  date: string | Date | null | undefined,
  time: string | null | undefined,
  bufferMinutes: number = 30
): boolean => {
  const parsed = safeParseDate(date);
  if (!parsed || !time) return true;

  const parts = time.split(':');
  if (parts.length < 2) return true;

  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);

  if (isNaN(hours) || isNaN(minutes)) return true;

  parsed.setHours(hours, minutes, 0, 0);

  const now = new Date();
  const bufferMs = bufferMinutes * 60 * 1000;

  return parsed.getTime() < (now.getTime() + bufferMs);
};

/**
 * Format date for input fields (YYYY-MM-DD)
 */
export const formatDateForInput = (date: string | Date | null | undefined): string => {
  const parsed = safeParseDate(date);
  if (!parsed) return '';

  const year = parsed.getFullYear();
  const month = (parsed.getMonth() + 1).toString().padStart(2, '0');
  const day = parsed.getDate().toString().padStart(2, '0');

  return `${year}-${month}-${day}`;
};

/**
 * Format time for input fields (HH:mm)
 */
export const formatTimeForInput = (time: string | null | undefined): string => {
  if (!time) return '';

  const parts = time.split(':');
  if (parts.length < 2) return '';

  return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
};

/**
 * Get date range for a given period
 */
export const getDateRange = (period: 'today' | 'week' | 'month' = 'today') => {
  const now = new Date();
  const startDate = new Date();
  const endDate = new Date();

  switch (period) {
    case 'today':
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'week':
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday as first day
      startDate.setDate(now.getDate() - diff);
      startDate.setHours(0, 0, 0, 0);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'month':
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setFullYear(now.getFullYear(), now.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
  }

  return { startDate, endDate };
};

/**
 * Parse ISO string to local date and time
 */
export const parseISOToLocal = (isoString: string | null | undefined) => {
  const parsed = safeParseDate(isoString);
  if (!parsed) {
    return { date: null, time: null };
  }

  const date = formatDateForInput(parsed);
  const hours = parsed.getHours().toString().padStart(2, '0');
  const minutes = parsed.getMinutes().toString().padStart(2, '0');
  const time = `${hours}:${minutes}`;

  return { date, time };
};