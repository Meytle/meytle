// Centralized theme configuration for Meytle
export const theme = {
  colors: {
    primary: {
      50: '#F5F4FB',  // Lightest blue tint for backgrounds
      100: '#E8E6F7', // Very light blue for hover backgrounds
      200: '#C7C4E8', // Light blue-purple
      300: '#9A95D5', // Medium light blue
      400: '#6B65B8', // Medium blue
      500: '#4A47A3', // Light Royal Blue
      600: '#3B3890', // Medium Royal Blue
      700: '#312E81', // Royal Blue (main action color)
      800: '#1E1B4B', // Deep Navy (headers/footers)
      900: '#0F0D26', // Midnight (text/borders)
      950: '#08071A', // Darkest navy
    },
    secondary: {
      50: '#FFF0F0',   // Soft pink (background start)
      100: '#FFE5E5',  // Light pink
      200: '#FFDBDB',  // Pink tint
      300: '#FFD1D1',  // Medium light pink
      400: '#FFC7C7',  // Medium pink
      500: '#FFBDBD',  // Pink
      600: '#FFB3B3',  // Darker pink
      700: '#FFA9A9',  // Deep pink
      800: '#FF9F9F',  // Deeper pink
      900: '#FFCCCB',  // Pink gradient end
      950: '#FF8585',  // Darkest pink
    },
    accent: {
      50: '#f0f9ff',
      100: '#e0f2fe',
      200: '#bae6fd',
      300: '#7dd3fc',
      400: '#38bdf8',
      500: '#0ea5e9',
      600: '#0284c7',
      700: '#0369a1',
      800: '#075985',
      900: '#0c4a6e',
      950: '#082f49',
    },
    neutral: {
      50: '#fafafa',
      100: '#f5f5f5',
      200: '#e5e5e5',
      300: '#d4d4d4',
      400: '#a3a3a3',
      500: '#737373',
      600: '#525252',
      700: '#404040',
      800: '#262626',
      900: '#171717',
      950: '#0a0a0a',
    },
    success: {
      50: '#f0fdf4',
      100: '#dcfce7',
      200: '#bbf7d0',
      300: '#86efac',
      400: '#4ade80',
      500: '#22c55e',
      600: '#16a34a',
      700: '#15803d',
      800: '#166534',
      900: '#14532d',
      950: '#052e16',
    },
    warning: {
      50: '#fffbeb',
      100: '#fef3c7',
      200: '#fde68a',
      300: '#fcd34d',
      400: '#fbbf24',
      500: '#f59e0b',
      600: '#d97706',
      700: '#b45309',
      800: '#92400e',
      900: '#78350f',
      950: '#451a03',
    },
    error: {
      50: '#fef2f2',
      100: '#fee2e2',
      200: '#fecaca',
      300: '#fca5a5',
      400: '#f87171',
      500: '#ef4444',
      600: '#dc2626',
      700: '#b91c1c',
      800: '#991b1b',
      900: '#7f1d1d',
      950: '#450a0a',
    },
  },
  typography: {
    fontSizes: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
      '3xl': '1.875rem',
      '4xl': '2.25rem',
      '5xl': '3rem',
      '6xl': '3.75rem',
    },
    fontWeights: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
      extrabold: '800',
    },
    lineHeights: {
      tight: '1.25',
      normal: '1.5',
      relaxed: '1.75',
    },
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    '2xl': '3rem',
    '3xl': '4rem',
    '4xl': '6rem',
  },
  borderRadius: {
    sm: '0.25rem',
    md: '0.375rem',
    lg: '0.5rem',
    xl: '0.75rem',
    '2xl': '1rem',
    '3xl': '1.5rem',
    full: '9999px',
  },
  shadows: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    glow: '0 0 20px rgb(49 46 129 / 0.3)',
    'glow-lg': '0 0 40px rgb(49 46 129 / 0.4)',
    'glow-pink': '0 0 20px rgba(255, 204, 203, 0.5)',
    'glow-pink-lg': '0 0 40px rgba(255, 204, 203, 0.6)',
    'glow-blue': '0 0 25px rgba(49, 46, 129, 0.4)',
    'glow-combo': '0 0 20px rgba(49, 46, 129, 0.3), 0 0 40px rgba(255, 204, 203, 0.2)',
    'pink-shadow': '0 10px 40px rgba(255, 204, 203, 0.3)',
    'blue-shadow': '0 10px 40px rgba(30, 27, 75, 0.2)',
  },
  transitions: {
    fast: '150ms ease-in-out',
    normal: '300ms ease-in-out',
    slow: '500ms ease-in-out',
  },
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
} as const;

// Helper functions for common theme operations
export const getColor = (colorPath: string) => {
  const keys = colorPath.split('.');
  let value: any = theme.colors;
  for (const key of keys) {
    value = value[key];
    if (value === undefined) return undefined;
  }
  return value;
};

export const getSpacing = (size: keyof typeof theme.spacing) => theme.spacing[size];

export const getBorderRadius = (size: keyof typeof theme.borderRadius) => theme.borderRadius[size];

export const getShadow = (size: keyof typeof theme.shadows) => theme.shadows[size];

export const getTransition = (speed: keyof typeof theme.transitions) => theme.transitions[speed];

export const getBreakpoint = (size: keyof typeof theme.breakpoints) => theme.breakpoints[size];

// Common gradient combinations
export const gradients = {
  primary: 'bg-gradient-to-r from-[#312E81] to-[#1E1B4B]', // Royal Blue to Deep Navy
  primaryHover: 'bg-gradient-to-r from-[#3B3890] to-[#312E81]', // Lighter on hover
  subtle: 'bg-gradient-to-br from-primary-50 to-secondary-50', // Light blue to soft pink
  dark: 'bg-gradient-to-r from-[#1E1B4B] to-[#0F0D26]', // Deep Navy to Midnight
  bluePink: 'bg-gradient-to-r from-[#312E81] to-[#FFCCCB]', // Blue to Pink
  pinkBlue: 'bg-gradient-to-r from-[#FFCCCB] to-[#312E81]', // Pink to Blue
  hero: 'bg-gradient-to-br from-[#312E81]/10 via-transparent to-[#FFCCCB]/10', // Overlay gradient
  glass: 'bg-gradient-to-br from-[#1E1B4B]/80 to-[#312E81]/60', // Glass effect
} as const;

// Common component variants
export const variants = {
  button: {
    primary: 'bg-gradient-to-r from-[#312E81] to-[#1E1B4B] text-white hover:shadow-[0_0_30px_rgba(255,204,203,0.6)] transform hover:scale-[1.02] transition-all duration-300',
    secondary: 'bg-[#312E81] text-white hover:bg-[#1E1B4B] hover:shadow-[0_0_20px_rgba(255,204,203,0.4)] transition-all duration-300',
    outline: 'border-2 border-[#312E81] text-[#312E81] hover:bg-[#312E81] hover:text-white hover:shadow-[0_0_25px_rgba(49,46,129,0.3)] transition-all duration-300',
    ghost: 'text-[#312E81] hover:bg-[#312E81]/10 hover:text-[#1E1B4B] transition-all duration-300',
    danger: 'bg-error-500 text-white hover:bg-error-600 hover:shadow-[0_0_20px_rgba(239,68,68,0.4)] transition-all duration-300',
    glass: 'backdrop-blur-md bg-[#1E1B4B]/20 text-[#1E1B4B] border border-[#312E81]/30 hover:bg-[#1E1B4B]/30 hover:shadow-[0_0_20px_rgba(255,204,203,0.3)] transition-all duration-300',
  },
  card: {
    default: 'bg-white/95 backdrop-blur-sm border border-[#312E81]/20 hover:border-[#312E81]/40 hover:shadow-[0_10px_40px_rgba(255,204,203,0.2)] transition-all duration-300',
    elevated: 'bg-white shadow-[0_10px_40px_rgba(30,27,75,0.1)] hover:shadow-[0_20px_50px_rgba(255,204,203,0.25)] transition-all duration-300',
    bordered: 'bg-white border-2 border-[#312E81] hover:border-[#1E1B4B] hover:shadow-[0_0_30px_rgba(49,46,129,0.2)] transition-all duration-300',
    gradient: 'bg-gradient-to-br from-[#312E81] to-[#1E1B4B] text-white shadow-[0_10px_40px_rgba(30,27,75,0.3)]',
    glass: 'backdrop-blur-lg bg-white/80 border border-[#312E81]/10 shadow-[0_10px_40px_rgba(255,204,203,0.1)]',
  },
  badge: {
    success: 'bg-success-100 text-success-800 border-success-200',
    warning: 'bg-warning-100 text-warning-800 border-warning-200',
    error: 'bg-error-100 text-error-800 border-error-200',
    info: 'bg-[#312E81]/10 text-[#312E81] border-[#312E81]/20',
    neutral: 'bg-neutral-100 text-neutral-800 border-neutral-200',
    primary: 'bg-gradient-to-r from-[#312E81]/10 to-[#FFCCCB]/10 text-[#1E1B4B] border-[#312E81]/20',
  },
} as const;

