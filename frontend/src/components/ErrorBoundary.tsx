import React, { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import logger from '../utils/logger';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetKeys?: Array<string | number>;
  resetOnPropsChange?: boolean;
  isolate?: boolean;
  level?: 'page' | 'section' | 'component';
  showDetails?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
}

class ErrorBoundary extends Component<Props, State> {
  private resetTimeoutId: NodeJS.Timeout | null = null;
  private previousResetKeys: Array<string | number> = [];

  constructor(props: Props) {
    super(props);

    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0
    };

    if (props.resetKeys) {
      this.previousResetKeys = props.resetKeys;
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onError, level = 'component' } = this.props;
    const { errorCount } = this.state;

    // Log error to our logging service
    logger.componentError(`ErrorBoundary-${level}`, error, {
      componentStack: errorInfo.componentStack,
      level,
      errorCount: errorCount + 1,
      timestamp: new Date().toISOString()
    });

    // Call custom error handler if provided
    if (onError) {
      onError(error, errorInfo);
    }

    // Update state with error info
    this.setState({
      errorInfo,
      errorCount: errorCount + 1
    });

    // Auto-reset after 10 seconds if it's a component-level error
    if (level === 'component' && !this.resetTimeoutId) {
      this.resetTimeoutId = setTimeout(() => {
        this.resetErrorBoundary();
      }, 10000);
    }
  }

  componentDidUpdate(prevProps: Props) {
    const { resetKeys, resetOnPropsChange } = this.props;
    const { hasError } = this.state;

    // Reset on props change if enabled
    if (resetOnPropsChange && hasError && prevProps !== this.props) {
      this.resetErrorBoundary();
      return;
    }

    // Reset when resetKeys change
    if (resetKeys && hasError) {
      const hasResetKeyChanged = resetKeys.some(
        (key, index) => key !== this.previousResetKeys[index]
      );

      if (hasResetKeyChanged) {
        this.resetErrorBoundary();
        this.previousResetKeys = resetKeys;
      }
    }
  }

  componentWillUnmount() {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }
  }

  resetErrorBoundary = () => {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
      this.resetTimeoutId = null;
    }

    // Log recovery
    logger.info('Error boundary reset', {
      level: this.props.level || 'component',
      previousError: this.state.error?.message
    });

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  render() {
    const { hasError, error, errorInfo, errorCount } = this.state;
    const { children, fallback, level = 'component', showDetails = false, isolate = false } = this.props;

    if (hasError && error) {
      // Use custom fallback if provided
      if (fallback) {
        return <>{fallback}</>;
      }

      // Different UI based on error boundary level
      if (level === 'page') {
        return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full space-y-8 p-8">
              <div className="text-center">
                <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-500" />
                <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
                  Oops! Something went wrong
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  We're sorry for the inconvenience. The page encountered an error and couldn't load properly.
                </p>
                {errorCount > 2 && (
                  <p className="mt-2 text-sm text-red-600">
                    Multiple errors detected. Please refresh the page.
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <button
                  onClick={this.resetErrorBoundary}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500"
                >
                  Try Again
                </button>

                <button
                  onClick={() => window.location.href = '/'}
                  className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500"
                >
                  Go to Homepage
                </button>
              </div>

              {showDetails && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                    Error Details (for developers)
                  </summary>
                  <div className="mt-2 p-4 bg-gray-100 rounded text-xs text-gray-600 overflow-auto">
                    <p className="font-semibold">Error: {error.message}</p>
                    {errorInfo && (
                      <pre className="mt-2 whitespace-pre-wrap">{errorInfo.componentStack}</pre>
                    )}
                  </div>
                </details>
              )}
            </div>
          </div>
        );
      }

      if (level === 'section') {
        return (
          <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start">
              <ExclamationTriangleIcon className="h-6 w-6 text-red-500 mt-1" />
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-medium text-red-800">
                  This section couldn't load properly
                </h3>
                <p className="mt-1 text-sm text-red-700">
                  {error.message || 'An unexpected error occurred'}
                </p>
                <button
                  onClick={this.resetErrorBoundary}
                  className="mt-3 text-sm font-medium text-red-600 hover:text-red-500"
                >
                  Try loading again
                </button>
              </div>
            </div>
          </div>
        );
      }

      // Component level error (minimal UI)
      if (isolate) {
        return (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
            <p className="text-sm text-yellow-800">Component unavailable</p>
            <button
              onClick={this.resetErrorBoundary}
              className="mt-1 text-xs text-yellow-600 hover:text-yellow-500"
            >
              Retry
            </button>
          </div>
        );
      }

      // Default component error (inline)
      return (
        <div className="inline-flex items-center space-x-2 text-sm text-red-600">
          <ExclamationTriangleIcon className="h-4 w-4" />
          <span>Failed to load</span>
          <button
            onClick={this.resetErrorBoundary}
            className="underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;