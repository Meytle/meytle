import React, { Component, createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { WifiIcon, ArrowPathIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import logger, { logApiError } from '../utils/logger';

interface AsyncErrorContextType {
  throwError: (error: Error | any) => void;
  clearError: () => void;
}

const AsyncErrorContext = createContext<AsyncErrorContextType | null>(null);

export const useAsyncError = () => {
  const context = useContext(AsyncErrorContext);
  if (!context) {
    throw new Error('useAsyncError must be used within AsyncErrorBoundary');
  }
  return context;
};

interface Props {
  children: ReactNode;
  fallback?: (error: AsyncError, retry: () => void, reset: () => void) => ReactNode;
  onError?: (error: AsyncError) => void;
  retryDelay?: number;
  maxRetries?: number;
  isolate?: boolean;
}

interface State {
  hasError: boolean;
  error: AsyncError | null;
  retryCount: number;
  isRetrying: boolean;
}

export interface AsyncError {
  type: 'network' | 'timeout' | 'api' | 'unknown';
  message: string;
  statusCode?: number;
  endpoint?: string;
  originalError?: any;
  timestamp: Date;
}

class AsyncErrorBoundary extends Component<Props, State> {
  private retryTimeoutId: NodeJS.Timeout | null = null;
  private mounted = true;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      retryCount: 0,
      isRetrying: false
    };
  }

  componentDidMount() {
    this.mounted = true;
  }

  componentWillUnmount() {
    this.mounted = false;
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error: AsyncErrorBoundary.categorizeError(error)
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const asyncError = AsyncErrorBoundary.categorizeError(error);

    // Log the error
    logger.componentError('AsyncErrorBoundary', error, {
      type: asyncError.type,
      endpoint: asyncError.endpoint,
      statusCode: asyncError.statusCode,
      componentStack: errorInfo.componentStack
    });

    if (this.props.onError) {
      this.props.onError(asyncError);
    }
  }

  static categorizeError(error: any): AsyncError {
    const baseError: AsyncError = {
      type: 'unknown',
      message: 'An unexpected error occurred',
      timestamp: new Date(),
      originalError: error
    };

    // Network error
    if (error.message === 'Network Error' || error.code === 'ECONNABORTED') {
      return {
        ...baseError,
        type: 'network',
        message: 'Unable to connect to the server. Please check your internet connection.'
      };
    }

    // Timeout error
    if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      return {
        ...baseError,
        type: 'timeout',
        message: 'The request took too long. Please try again.'
      };
    }

    // API error with response
    if (error.response) {
      const status = error.response.status;
      let message = 'Server error occurred';

      if (status >= 400 && status < 500) {
        switch (status) {
          case 401:
            message = 'You need to log in to continue';
            break;
          case 403:
            message = 'You don\'t have permission to access this resource';
            break;
          case 404:
            message = 'The requested resource was not found';
            break;
          case 429:
            message = 'Too many requests. Please slow down.';
            break;
          default:
            message = error.response.data?.message || 'Request failed';
        }
      } else if (status >= 500) {
        message = 'Server error. Please try again later.';
      }

      return {
        ...baseError,
        type: 'api',
        message,
        statusCode: status,
        endpoint: error.config?.url
      };
    }

    // Generic error with message
    if (error.message) {
      return {
        ...baseError,
        message: error.message
      };
    }

    return baseError;
  }

  throwError = (error: Error | any) => {
    const asyncError = AsyncErrorBoundary.categorizeError(error);

    // Log async error
    if (asyncError.endpoint) {
      logApiError(asyncError.endpoint, error, {
        type: asyncError.type,
        statusCode: asyncError.statusCode
      });
    }

    if (this.mounted) {
      this.setState({
        hasError: true,
        error: asyncError
      });
    }
  };

  clearError = () => {
    if (this.mounted) {
      logger.info('Async error cleared', {
        previousError: this.state.error?.message
      });

      this.setState({
        hasError: false,
        error: null,
        retryCount: 0,
        isRetrying: false
      });
    }
  };

  retry = async () => {
    const { retryDelay = 1000, maxRetries = 3 } = this.props;
    const { retryCount } = this.state;

    if (retryCount >= maxRetries) {
      logger.warn('Max retries reached', {
        retryCount,
        maxRetries,
        error: this.state.error?.message
      });
      return;
    }

    this.setState({ isRetrying: true });

    // Wait before retrying (with exponential backoff)
    const delay = retryDelay * Math.pow(2, retryCount);
    await new Promise(resolve => {
      this.retryTimeoutId = setTimeout(resolve, delay);
    });

    if (this.mounted) {
      logger.info('Retrying after async error', {
        retryCount: retryCount + 1,
        delay,
        error: this.state.error?.message
      });

      this.setState({
        hasError: false,
        error: null,
        retryCount: retryCount + 1,
        isRetrying: false
      });
    }
  };

  renderErrorUI = () => {
    const { error, isRetrying, retryCount } = this.state;
    const { fallback, maxRetries = 3, isolate = false } = this.props;

    if (!error) return null;

    // Use custom fallback if provided
    if (fallback) {
      return fallback(error, this.retry, this.clearError);
    }

    // Network error UI
    if (error.type === 'network') {
      return (
        <div className={`${isolate ? 'p-6' : 'min-h-[400px] flex items-center justify-center'}`}>
          <div className="text-center max-w-md mx-auto p-6">
            <WifiIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Connection Problem
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {error.message}
            </p>
            <button
              onClick={this.retry}
              disabled={isRetrying || retryCount >= maxRetries}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-rose-600 hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRetrying ? (
                <>
                  <ArrowPathIcon className="animate-spin h-4 w-4 mr-2" />
                  Retrying...
                </>
              ) : (
                <>
                  <ArrowPathIcon className="h-4 w-4 mr-2" />
                  Try Again {retryCount > 0 && `(${maxRetries - retryCount} left)`}
                </>
              )}
            </button>
          </div>
        </div>
      );
    }

    // API error UI
    if (error.type === 'api') {
      const is401 = error.statusCode === 401;
      const is403 = error.statusCode === 403;
      const is500 = error.statusCode && error.statusCode >= 500;

      return (
        <div className={`${isolate ? 'p-6' : 'min-h-[400px] flex items-center justify-center'}`}>
          <div className="text-center max-w-md mx-auto p-6">
            <ExclamationCircleIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {is401 ? 'Authentication Required' :
               is403 ? 'Access Denied' :
               is500 ? 'Server Error' :
               'Request Failed'}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {error.message}
            </p>
            {error.statusCode && (
              <p className="text-xs text-gray-500 mb-4">
                Error Code: {error.statusCode}
              </p>
            )}
            <div className="space-x-3">
              {is401 ? (
                <button
                  onClick={() => window.location.href = '/auth/signin'}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-rose-600 hover:bg-rose-700"
                >
                  Sign In
                </button>
              ) : (
                <>
                  <button
                    onClick={this.retry}
                    disabled={isRetrying || retryCount >= maxRetries}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
                  >
                    {isRetrying ? 'Retrying...' : 'Try Again'}
                  </button>
                  <button
                    onClick={this.clearError}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Dismiss
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Default error UI
    return (
      <div className={`${isolate ? 'p-4' : 'min-h-[400px] flex items-center justify-center'}`}>
        <div className="text-center max-w-md mx-auto p-6">
          <ExclamationCircleIcon className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Something went wrong
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            {error.message}
          </p>
          <div className="space-x-3">
            <button
              onClick={this.retry}
              disabled={isRetrying}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-rose-600 hover:bg-rose-700"
            >
              Try Again
            </button>
            <button
              onClick={this.clearError}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  };

  render() {
    const { hasError } = this.state;
    const { children } = this.props;

    const contextValue: AsyncErrorContextType = {
      throwError: this.throwError,
      clearError: this.clearError
    };

    return (
      <AsyncErrorContext.Provider value={contextValue}>
        {hasError ? this.renderErrorUI() : children}
      </AsyncErrorContext.Provider>
    );
  }
}

export default AsyncErrorBoundary;