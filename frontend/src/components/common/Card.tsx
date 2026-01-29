import React from 'react';
import { theme } from '../../styles/theme';

interface CardProps {
  variant?: 'default' | 'elevated' | 'bordered' | 'gradient';
  padding?: 'sm' | 'md' | 'lg';
  hoverable?: boolean;
  children: React.ReactNode;
  className?: string;
}

const Card: React.FC<CardProps> = ({
  variant = 'default',
  padding = 'md',
  hoverable = false,
  children,
  className = '',
}) => {
  const baseClasses = 'rounded-xl transition-all duration-200';
  
  const variantClasses = {
    default: 'bg-white border border-neutral-200',
    elevated: 'bg-white shadow-lg',
    bordered: 'bg-white border-2 border-[#e5e3ff]',
    gradient: 'bg-gradient-to-r from-[#312E81] to-[#FFCCCB] text-white shadow-[0_0_15px_rgba(255,204,203,0.3)]',
  };

  const paddingClasses = {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  const hoverClasses = hoverable ? 'hover:shadow-xl hover:-translate-y-1' : '';

  const classes = `${baseClasses} ${variantClasses[variant]} ${paddingClasses[padding]} ${hoverClasses} ${className}`;

  return (
    <div className={classes}>
      {children}
    </div>
  );
};

export default Card;

