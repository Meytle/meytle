// Development configuration to handle browser extension conflicts
export const DEV_CONFIG = {
  // Suppress console errors from browser extensions
  suppressExtensionErrors: true,
  
  // Allow Stripe analytics in development (optional)
  allowStripeAnalytics: false,
  
  // Development-specific settings
  debugMode: import.meta.env.DEV,
  
  // Browser extension error patterns to ignore
  ignoredErrorPatterns: [
    'ERR_BLOCKED_BY_CLIENT',
    'sentry-internal.temp-mail.io',
    'r.stripe.com',
    'content-script.js',
    'Unchecked runtime.lastError',
    'Tracking Prevention blocked',
    'Failed to fetch'
  ]
};

// Console filter for development
export const createConsoleFilter = () => {
  if (!DEV_CONFIG.suppressExtensionErrors) return;
  
  const originalError = console.error;
  const originalWarn = console.warn;
  
  console.error = (...args: any[]) => {
    const message = args.join(' ');
    const shouldSuppress = DEV_CONFIG.ignoredErrorPatterns.some(pattern => 
      message.includes(pattern)
    );
    
    if (!shouldSuppress) {
      originalError.apply(console, args);
    }
  };
  
  console.warn = (...args: any[]) => {
    const message = args.join(' ');
    const shouldSuppress = DEV_CONFIG.ignoredErrorPatterns.some(pattern => 
      message.includes(pattern)
    );
    
    if (!shouldSuppress) {
      originalWarn.apply(console, args);
    }
  };
};
