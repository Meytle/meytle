/* eslint-disable no-console */

interface LogMetadata {
  [key: string]: any;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  metadata?: LogMetadata;
  stack?: string;
  url?: string;
  userAgent?: string;
  userId?: string;
}

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

class Logger {
  private static instance: Logger;
  private logBuffer: LogEntry[] = [];
  private maxBufferSize = 50;
  private flushInterval = 30000; // 30 seconds
  private isDevelopment = import.meta.env.DEV;
  private apiEndpoint = '/api/logs'; // Backend endpoint for collecting frontend logs
  // Disable backend log sending until /api/logs endpoint is implemented
  // Set to true when the backend endpoint is ready
  private enableBackendLogging = false;

  private constructor() {
    // Set up periodic flush of logs to backend (only if enabled)
    if (!this.isDevelopment && this.enableBackendLogging) {
      setInterval(() => this.flushLogs(), this.flushInterval);

      // Also flush logs before page unload
      window.addEventListener('beforeunload', () => {
        this.flushLogs(true);
      });
    }

    // Set up global error handler
    this.setupGlobalErrorHandler();
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private setupGlobalErrorHandler(): void {
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.error('Unhandled Promise Rejection', {
        reason: event.reason,
        promise: event.promise
      });
    });

    // Handle global errors
    window.addEventListener('error', (event) => {
      this.error('Global Error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error?.stack || event.error
      });
    });
  }

  private formatMessage(level: LogLevel, message: string, metadata?: LogMetadata): string {
    const timestamp = new Date().toISOString();
    let formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    if (metadata && Object.keys(metadata).length > 0) {
      // Sanitize sensitive data
      const sanitized = this.sanitizeMetadata(metadata);
      formattedMessage += ` | ${JSON.stringify(sanitized)}`;
    }

    return formattedMessage;
  }

  private sanitizeMetadata(metadata: LogMetadata): LogMetadata {
    const sanitized = { ...metadata };
    const sensitiveKeys = ['password', 'token', 'apiKey', 'secret', 'governmentIdNumber', 'creditCard'];

    for (const key of sensitiveKeys) {
      if (sanitized[key]) {
        sanitized[key] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  private log(level: LogLevel, message: string, metadata?: LogMetadata): void {
    const formattedMessage = this.formatMessage(level, message, metadata);

    // Console output in development
    if (this.isDevelopment) {
      switch (level) {
        case 'error':
          console.error(formattedMessage, metadata);
          break;
        case 'warn':
          console.warn(formattedMessage, metadata);
          break;
        case 'info':
          console.info(formattedMessage, metadata);
          break;
        case 'debug':
          console.debug(formattedMessage, metadata);
          break;
      }
    }

    // Add to buffer for sending to backend
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      metadata: this.sanitizeMetadata(metadata || {}),
      url: window.location.href,
      userAgent: navigator.userAgent,
      userId: this.getCurrentUserId()
    };

    // Add stack trace for errors
    if (level === 'error' && metadata?.error) {
      logEntry.stack = metadata.error.stack || metadata.error.toString();
    }

    this.logBuffer.push(logEntry);

    // Flush if buffer is full
    if (this.logBuffer.length >= this.maxBufferSize) {
      this.flushLogs();
    }
  }

  private getCurrentUserId(): string | undefined {
    // Try to get user ID from localStorage or your auth context
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        return user.id;
      }
    } catch {
      // Ignore parsing errors
    }
    return undefined;
  }

  private async flushLogs(sync = false): Promise<void> {
    if (this.logBuffer.length === 0) return;

    // If backend logging is disabled, just clear the buffer to prevent memory growth
    if (!this.enableBackendLogging) {
      this.logBuffer = [];
      return;
    }

    const logs = [...this.logBuffer];
    this.logBuffer = [];

    try {
      if (sync) {
        // Use sendBeacon for synchronous sending on page unload
        const blob = new Blob([JSON.stringify({ logs })], { type: 'application/json' });
        navigator.sendBeacon(this.apiEndpoint, blob);
      } else {
        // Regular async fetch for periodic flushes
        await fetch(this.apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ logs }),
        });
      }
    } catch {
      // Silently fail - log sending is best-effort
      // Don't re-add logs to buffer to prevent unbounded memory growth
    }
  }

  // Public logging methods
  public error(message: string, metadata?: LogMetadata): void {
    this.log('error', message, metadata);
  }

  public warn(message: string, metadata?: LogMetadata): void {
    this.log('warn', message, metadata);
  }

  public info(message: string, metadata?: LogMetadata): void {
    this.log('info', message, metadata);
  }

  public debug(message: string, metadata?: LogMetadata): void {
    this.log('debug', message, metadata);
  }

  // Specialized logging methods for common patterns
  public apiError(endpoint: string, error: any, requestData?: any): void {
    this.error(`API Error: ${endpoint}`, {
      endpoint,
      error: error.message || error,
      status: error.response?.status,
      statusText: error.response?.statusText,
      responseData: error.response?.data,
      requestData: this.sanitizeMetadata(requestData || {})
    });
  }

  public apiInfo(endpoint: string, message: string, data?: any): void {
    this.info(`API: ${message}`, {
      endpoint,
      ...data
    });
  }

  public componentError(componentName: string, error: any, props?: any): void {
    this.error(`Component Error: ${componentName}`, {
      component: componentName,
      error: error.message || error,
      stack: error.stack,
      props: this.sanitizeMetadata(props || {})
    });
  }

  public componentInfo(componentName: string, message: string, data?: any): void {
    this.info(`Component: ${message}`, {
      component: componentName,
      ...data
    });
  }

  public userAction(action: string, data?: any): void {
    this.info(`User Action: ${action}`, {
      action,
      ...data
    });
  }

  public performance(metric: string, value: number, metadata?: LogMetadata): void {
    this.info(`Performance: ${metric}`, {
      metric,
      value,
      unit: 'ms',
      ...metadata
    });
  }

  // Method to manually flush logs
  public flush(): void {
    this.flushLogs();
  }
}

// Export singleton instance
const logger = Logger.getInstance();

export default logger;

// Also export convenience functions
export const logError = (message: string, metadata?: LogMetadata) => logger.error(message, metadata);
export const logWarn = (message: string, metadata?: LogMetadata) => logger.warn(message, metadata);
export const logInfo = (message: string, metadata?: LogMetadata) => logger.info(message, metadata);
export const logDebug = (message: string, metadata?: LogMetadata) => logger.debug(message, metadata);

// Export specialized logging functions
export const logApiError = (endpoint: string, error: any, requestData?: any) =>
  logger.apiError(endpoint, error, requestData);

export const logApiInfo = (endpoint: string, message: string, data?: any) =>
  logger.apiInfo(endpoint, message, data);

export const logComponentError = (componentName: string, error: any, props?: any) =>
  logger.componentError(componentName, error, props);

export const logComponentInfo = (componentName: string, message: string, data?: any) =>
  logger.componentInfo(componentName, message, data);

export const logUserAction = (action: string, data?: any) =>
  logger.userAction(action, data);

export const logPerformance = (metric: string, value: number, metadata?: LogMetadata) =>
  logger.performance(metric, value, metadata);