// Error suppression utility for development
// This helps suppress browser extension and ad blocker errors in console

export const suppressBrowserExtensionErrors = () => {
  if (import.meta.env.DEV) {
    // Suppress specific error patterns that are caused by browser extensions
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    
    console.error = (...args: any[]) => {
      const message = args.join(' ');
      
      // Suppress known browser extension errors
      if (
        message.includes('ERR_BLOCKED_BY_CLIENT') ||
        message.includes('sentry-internal.temp-mail.io') ||
        message.includes('r.stripe.com') ||
        message.includes('m.stripe.network') ||
        message.includes('content-script.js') ||
        message.includes('Unchecked runtime.lastError') ||
        message.includes('Tracking Prevention blocked') ||
        message.includes('FetchError: Error fetching https://r.stripe.com') ||
        message.includes('Failed to load resource') ||
        message.includes('You may test your Stripe.js integration over HTTP')
      ) {
        return; // Don't log these errors
      }
      
      // Log other errors normally
      originalConsoleError.apply(console, args);
    };
    
    console.warn = (...args: any[]) => {
      const message = args.join(' ');
      
      // Suppress known browser extension warnings
      if (
        message.includes('ERR_BLOCKED_BY_CLIENT') ||
        message.includes('sentry-internal.temp-mail.io') ||
        message.includes('r.stripe.com') ||
        message.includes('m.stripe.network') ||
        message.includes('content-script.js') ||
        message.includes('You may test your Stripe.js integration over HTTP') ||
        message.includes('Failed to load resource')
      ) {
        return; // Don't log these warnings
      }
      
      // Log other warnings normally
      originalConsoleWarn.apply(console, args);
    };
  }
};

// Global error handler to suppress unhandled promise rejections from browser extensions
export const suppressUnhandledRejections = () => {
  if (import.meta.env.DEV) {
    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason;

      // Check for FetchError specifically (Stripe telemetry)
      if (error?.name === 'FetchError' && error?.message?.includes('r.stripe.com')) {
        event.preventDefault();
        return;
      }

      // Suppress known browser extension errors
      if (
        error?.message?.includes('ERR_BLOCKED_BY_CLIENT') ||
        error?.message?.includes('Failed to fetch') ||
        error?.message?.includes('r.stripe.com') ||
        error?.message?.includes('m.stripe.network') ||
        error?.message?.includes('FetchError: Error fetching')
      ) {
        event.preventDefault(); // Prevent the error from showing in console
        return;
      }
    });
  }
};
