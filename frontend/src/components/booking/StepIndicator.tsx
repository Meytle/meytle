import React from 'react';
import { FaCalendarAlt, FaClipboardList, FaCheckCircle, FaCreditCard } from 'react-icons/fa';

interface Step {
  id: number;
  name: string;
  description: string;
  icon: React.ReactNode;
}

interface StepIndicatorProps {
  currentStep: number;
  steps?: Step[];
}

const defaultSteps: Step[] = [
  {
    id: 1,
    name: 'Date & Time',
    description: 'Select when',
    icon: <FaCalendarAlt className="w-5 h-5" />
  },
  {
    id: 2,
    name: 'Service',
    description: 'Choose service',
    icon: <FaClipboardList className="w-5 h-5" />
  },
  {
    id: 3,
    name: 'Review',
    description: 'Confirm details',
    icon: <FaCheckCircle className="w-5 h-5" />
  }
];

const StepIndicator: React.FC<StepIndicatorProps> = ({
  currentStep,
  steps = defaultSteps
}) => {
  return (
    <div className="w-full py-4">
      <div className="flex items-center justify-center gap-8 max-w-3xl mx-auto px-4">
        {steps.map((step, index) => {
          const isActive = step.id === currentStep;
          const isCompleted = step.id < currentStep;
          const isLast = index === steps.length - 1;

          return (
            <React.Fragment key={step.id}>
              {/* Step */}
              <div className="flex flex-col items-center relative">
                {/* Step Circle */}
                <div
                  className={`
                    relative flex items-center justify-center w-12 h-12 rounded-full
                    transition-all duration-300 transform
                    ${isActive
                      ? 'bg-gradient-to-r from-[#312E81] to-[#FFCCCB] text-white shadow-[0_0_15px_rgba(255,204,203,0.3)] scale-110'
                      : isCompleted
                        ? 'bg-[#312E81] text-white shadow-md'
                        : 'bg-gray-100 text-gray-400 border-2 border-gray-200'
                    }
                  `}
                >
                  {isCompleted && !isActive ? (
                    <FaCheckCircle className="w-6 h-6" />
                  ) : (
                    <div className="flex items-center justify-center">
                      {React.isValidElement(step.icon) ?
                        React.cloneElement(step.icon as React.ReactElement<{ className?: string }>, {
                          className: `w-5 h-5 ${isActive ? 'animate-pulse' : ''}`
                        }) :
                        step.icon
                      }
                    </div>
                  )}
                </div>

                {/* Step Label */}
                <div className="mt-2 text-center">
                  <p
                    className={`
                      text-sm font-semibold transition-colors duration-300
                      ${isActive
                        ? 'text-[#312E81]'
                        : isCompleted
                          ? 'text-[#312E81]'
                          : 'text-gray-400'
                      }
                    `}
                  >
                    {step.name}
                  </p>
                  <p
                    className={`
                      text-xs mt-0.5 transition-colors duration-300
                      hidden sm:block
                      ${isActive
                        ? 'text-[#312E81]'
                        : isCompleted
                          ? 'text-gray-500'
                          : 'text-gray-400'
                      }
                    `}
                  >
                    {step.description}
                  </p>
                </div>

                {/* Progress Line */}
                {!isLast && (
                  <div
                    className={`
                      absolute top-6 h-0.5
                      transition-all duration-500
                      ${isCompleted
                        ? 'bg-gradient-to-r from-[#312E81] to-[#4A47A3]'
                        : 'bg-gray-200'
                      }
                    `}
                    style={{
                      width: '80px',
                      left: 'calc(100% + 4px)'
                    }}
                  />
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Progress Bar */}
      <div className="mt-6 relative max-w-3xl mx-auto px-4">
        <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#312E81] to-[#FFCCCB] rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${((currentStep - 1) / (steps.length - 1)) * 100}%`
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default StepIndicator;