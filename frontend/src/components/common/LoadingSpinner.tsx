/**
 * LoadingSpinner Component
 * Reusable loading spinner for consistent loading states across the app
 */

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'primary' | 'secondary' | 'accent';
  fullScreen?: boolean;
}

const sizeClasses = {
  sm: 'h-8 w-8',
  md: 'h-16 w-16',
  lg: 'h-24 w-24',
  xl: 'h-32 w-32',
};

const colorClasses = {
  primary: 'border-[#312E81]',
  secondary: 'border-[#FFCCCB]',
  accent: 'border-accent-600',
};

const LoadingSpinner = ({ 
  size = 'xl', 
  color = 'primary', 
  fullScreen = false 
}: LoadingSpinnerProps) => {
  const spinner = (
    <div
      className={`animate-spin rounded-full border-b-2 ${sizeClasses[size]} ${colorClasses[color]}`}
      role="status"
      aria-label="Loading"
    />
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        {spinner}
      </div>
    );
  }

  return spinner;
};

export default LoadingSpinner;

