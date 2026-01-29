import React from 'react';
import { theme } from '../../styles/theme';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  icon,
  iconPosition = 'left',
  children,
  className = '',
  disabled,
  ...props
}) => {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variantClasses = {
    primary: 'bg-gradient-to-r from-[#312E81] to-[#1E1B4B] text-white hover:shadow-[0_0_30px_rgba(255,204,203,0.6)] focus:ring-[#312E81] shadow-lg transition-all duration-300',
    secondary: 'bg-[#312E81] text-white hover:bg-[#1E1B4B] focus:ring-[#312E81] shadow-md hover:shadow-[0_0_20px_rgba(255,204,203,0.4)] transition-all duration-300',
    outline: 'border-2 border-[#312E81] text-[#312E81] hover:bg-[#312E81]/10 focus:ring-[#312E81] transition-all duration-300',
    ghost: 'text-[#312E81] hover:bg-[#312E81]/10 focus:ring-[#312E81] transition-all duration-300',
    danger: 'bg-error-500 text-white hover:bg-error-600 focus:ring-error-500 shadow-md hover:shadow-lg',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  const widthClasses = fullWidth ? 'w-full' : '';

  const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${widthClasses} ${className}`;

  const iconElement = icon && (
    <span className={iconPosition === 'left' ? 'mr-2' : 'ml-2'}>
      {icon}
    </span>
  );

  return (
    <button
      className={classes}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {!loading && iconPosition === 'left' && iconElement}
      <span className="relative z-10">{children}</span>
      {!loading && iconPosition === 'right' && iconElement}
    </button>
  );
};

export default Button;

