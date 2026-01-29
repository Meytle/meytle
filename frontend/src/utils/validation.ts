/**
 * Validation Utilities
 * Common validation functions for form inputs
 */

import { VALIDATION } from '../constants';

export const validateEmail = (email: string): boolean => {
  return VALIDATION.EMAIL_REGEX.test(email);
};

export const validatePassword = (password: string): boolean => {
  return password.length >= VALIDATION.MIN_PASSWORD_LENGTH;
};

export const validatePasswordMatch = (
  password: string,
  confirmPassword: string
): boolean => {
  return password === confirmPassword;
};

export const validateRequired = (value: string): boolean => {
  return value.trim().length > 0;
};

export const getPasswordStrength = (password: string): {
  strength: 'weak' | 'medium' | 'strong';
  score: number;
} => {
  let score = 0;

  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 2) return { strength: 'weak', score };
  if (score <= 4) return { strength: 'medium', score };
  return { strength: 'strong', score };
};

export interface PasswordRequirements {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
}

export const checkPasswordRequirements = (password: string): PasswordRequirements => {
  return {
    minLength: password.length >= VALIDATION.MIN_PASSWORD_LENGTH,
    hasUppercase: VALIDATION.PASSWORD_REGEX.UPPERCASE.test(password),
    hasLowercase: VALIDATION.PASSWORD_REGEX.LOWERCASE.test(password),
    hasNumber: VALIDATION.PASSWORD_REGEX.NUMBER.test(password),
    hasSpecial: VALIDATION.PASSWORD_REGEX.SPECIAL.test(password),
  };
};

export const validatePasswordStrength = (password: string): {
  isValid: boolean;
  errors: string[];
  requirements: PasswordRequirements;
} => {
  const errors: string[] = [];
  const requirements = checkPasswordRequirements(password);

  if (!requirements.minLength) {
    errors.push('Password must be at least 8 characters long');
  }
  if (!requirements.hasUppercase) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!requirements.hasLowercase) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!requirements.hasNumber) {
    errors.push('Password must contain at least one number');
  }
  if (!requirements.hasSpecial) {
    errors.push('Password must contain at least one special character (!@#$%^&*()_+-=[]{}etc.)');
  }

  return {
    isValid: errors.length === 0,
    errors,
    requirements,
  };
};

