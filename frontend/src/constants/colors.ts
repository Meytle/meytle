/**
 * Meytle Color System Constants
 * Centralized color definitions for consistent theming
 */

// Primary Colors
export const COLORS = {
  // Blues
  PRIMARY_BLUE: '#312E81',     // Royal Blue - main action color
  NAVY: '#1E1B4B',             // Deep Navy - headers/footers
  LIGHT_BLUE: '#4A47A3',       // Light Royal Blue

  // Pinks
  PINK: '#FFCCCB',             // Pink accent - gradient end
  PINK_BG: '#FFF0F0',          // Soft pink - gradient start
  PINK_MID: '#FFDBDB',         // Medium pink

  // Text Colors
  TEXT_PRIMARY: '#1E1B4B',     // Main text - deep navy
  TEXT_SECONDARY: '#312E81',   // Secondary text - royal blue
  TEXT_LIGHT: '#ffffff',       // Light text on dark backgrounds

  // Background Colors
  BG_PRIMARY: '#ffffff',       // Main background
  BG_SECONDARY: '#F5F4FB',     // Light blue tint
  BG_PINK_LIGHT: '#FFF0F0',    // Light pink background
} as const;

// Gradient Definitions
export const GRADIENTS = {
  PRIMARY: 'from-[#312E81] to-[#1E1B4B]',              // Royal Blue to Deep Navy
  PRIMARY_HOVER: 'from-[#1E1B4B] to-[#0F0D26]',        // Darker on hover
  PINK: 'from-[#FFF0F0] to-[#FFCCCB]',                 // Pink gradient
  BLUE_PINK: 'from-[#312E81] to-[#FFCCCB]',            // Blue to Pink
  PINK_BLUE: 'from-[#FFCCCB] to-[#312E81]',            // Pink to Blue
  HOVER_LIGHT: 'from-[#312E81]/10 to-[#FFCCCB]/10',    // Light hover gradient
  OVERLAY: 'from-[#312E81]/5 to-[#FFCCCB]/5',          // Very light overlay
} as const;

// Shadow Definitions
export const SHADOWS = {
  PINK_SM: '0 0 15px rgba(255,204,203,0.3)',
  PINK_MD: '0 0 25px rgba(255,204,203,0.5)',
  PINK_LG: '0 0 30px rgba(255,204,203,0.6)',
  BLUE_SM: '0 0 15px rgba(49,46,129,0.3)',
  BLUE_MD: '0 0 25px rgba(49,46,129,0.4)',
  BLUE_LG: '0 0 30px rgba(49,46,129,0.5)',
  COMBO: '0 0 20px rgba(49,46,129,0.3), 0 0 40px rgba(255,204,203,0.2)',
} as const;

// Component Color Classes
export const COLOR_CLASSES = {
  // Text
  TEXT_PRIMARY_CLASS: 'text-[#1E1B4B]',
  TEXT_SECONDARY_CLASS: 'text-[#312E81]',
  TEXT_HOVER_PRIMARY: 'hover:text-[#312E81]',
  TEXT_HOVER_SECONDARY: 'hover:text-[#1E1B4B]',

  // Backgrounds
  BG_PRIMARY_CLASS: 'bg-[#312E81]',
  BG_NAVY_CLASS: 'bg-[#1E1B4B]',
  BG_HOVER_PRIMARY: 'hover:bg-[#312E81]',
  BG_HOVER_LIGHT: 'hover:bg-[#312E81]/10',

  // Borders
  BORDER_PRIMARY: 'border-[#312E81]',
  BORDER_NAVY: 'border-[#1E1B4B]',
  BORDER_HOVER_PRIMARY: 'hover:border-[#312E81]',

  // Gradients (Tailwind)
  GRADIENT_PRIMARY: 'bg-gradient-to-r from-[#312E81] to-[#1E1B4B]',
  GRADIENT_PINK: 'bg-gradient-to-r from-[#FFF0F0] to-[#FFCCCB]',
  GRADIENT_HOVER: 'hover:bg-gradient-to-r hover:from-[#312E81]/10 hover:to-[#FFCCCB]/10',

  // Shadows (Tailwind)
  SHADOW_PINK_HOVER: 'hover:shadow-[0_0_30px_rgba(255,204,203,0.6)]',
  SHADOW_BLUE_HOVER: 'hover:shadow-[0_0_30px_rgba(49,46,129,0.4)]',
} as const;

// Conversion Map for Quick Reference
export const COLOR_MAP = {
  // Old -> New
  'primary-400': COLORS.LIGHT_BLUE,
  'primary-500': COLORS.PRIMARY_BLUE,
  'primary-600': COLORS.PRIMARY_BLUE,
  'primary-700': COLORS.PRIMARY_BLUE,
  'primary-800': COLORS.NAVY,
  'secondary-500': COLORS.PINK,
  'secondary-600': COLORS.PINK,
} as const;

// Export all as default for easy importing
export default {
  COLORS,
  GRADIENTS,
  SHADOWS,
  COLOR_CLASSES,
  COLOR_MAP,
};