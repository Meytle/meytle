/**
 * useSocket Hook
 * Manages WebSocket connection for real-time updates
 * 
 * Features:
 * - Auto-connect on mount with JWT auth
 * - Auto-disconnect on unmount
 * - Event listeners for bookings, messages, notifications
 * - Reconnection handling
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_CONFIG } from '../constants';

// Derive socket URL from API base URL to ensure consistency
// If BASE_URL is relative (/api), use current origin
// If BASE_URL is absolute (https://meytle.com/api), extract origin
const getSocketURL = () => {
  const baseURL = API_CONFIG.BASE_URL;
  
  if (baseURL.startsWith('http')) {
    // Absolute URL like 'https://meytle.com/api'
    const url = new URL(baseURL);
    return url.origin; // Returns 'https://meytle.com'
  } else {
    // Relative URL like '/api'
    // Use current origin (works in both dev and prod)
    return window.location.origin;
  }
};

const SOCKET_URL = getSocketURL();

console.log('🔌 [useSocket] Socket URL configured:', {
  apiBaseURL: API_CONFIG.BASE_URL,
  socketURL: SOCKET_URL,
  windowOrigin: window.location.origin
});

interface SocketEventHandlers {
  onBookingCreated?: (data: any) => void;
  onBookingApproved?: (data: any) => void;
  onBookingCancelled?: (data: any) => void;
  onBookingExpired?: (data: any) => void;
  onRequestCreated?: (data: any) => void;
  onRequestAccepted?: (data: any) => void;
  onRequestRejected?: (data: any) => void;
  onRequestCancelled?: (data: any) => void;
  onOtpSent?: (data: any) => void;
  onPaymentCaptured?: (data: any) => void;
  onAvailabilityUpdated?: (data: any) => void;
  onNewMessage?: (data: any) => void;
  onNotification?: (data: any) => void;
  onEarningsUpdated?: (data: any) => void;
  onConnectionChange?: (connected: boolean) => void;
}

export const useSocket = (handlers: SocketEventHandlers = {}) => {
  const socketRef = useRef<Socket | null>(null);
  const isConnecting = useRef(false);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    // Don't connect if already connecting or connected
    if (isConnecting.current || (socketRef.current?.connected)) {
      return;
    }

    isConnecting.current = true;

    // Note: auth_token is HttpOnly cookie - JavaScript can't read it
    // But Socket.IO will automatically send it in HTTP handshake if withCredentials: true
    // Backend will read it from socket.handshake.headers.cookie
    console.log('🔌 [useSocket] Connecting with automatic cookie authentication', {
      url: SOCKET_URL,
      note: 'HttpOnly cookie will be sent automatically',
      timestamp: new Date().toISOString()
    });

    // Create socket connection
    // withCredentials: true ensures HttpOnly cookies are sent with connection
    const socket = io(SOCKET_URL, {
      withCredentials: true, // CRITICAL: Send HttpOnly cookies with connection!
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    // Connection events
    socket.on('connect', () => {
      console.log('✅ [useSocket] CONNECTED SUCCESSFULLY', {
        socketId: socket.id,
        url: SOCKET_URL,
        note: 'Authentication status will be confirmed by server',
        timestamp: new Date().toISOString()
      });
      isConnecting.current = false;
      setConnected(true);
      handlers.onConnectionChange?.(true);
    });

    socket.on('connected', (data) => {
      console.log('✅ [useSocket] Server confirmed connection:', data);
      // If we got a 'connected' event with userId, we're authenticated and in personal room
      if (data.userId) {
        console.log(`✅ [useSocket] AUTHENTICATED as user ${data.userId} - joined room user:${data.userId}`);
      } else {
        console.warn('⚠️ [useSocket] Connected as GUEST - will NOT receive personal events (bookings, requests, etc.)');
      }
    });

    socket.on('disconnect', (reason) => {
      console.warn('❌ [useSocket] DISCONNECTED:', {
        reason,
        timestamp: new Date().toISOString()
      });
      isConnecting.current = false;
      setConnected(false);
      handlers.onConnectionChange?.(false);
    });

    socket.on('connect_error', (error) => {
      console.error('❌ [useSocket] CONNECTION ERROR:', {
        message: error.message,
        url: SOCKET_URL,
        timestamp: new Date().toISOString()
      });
      isConnecting.current = false;
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log('[useSocket] Reconnected after', attemptNumber, 'attempts');
    });

    socket.on('reconnect_failed', () => {
      console.error('[useSocket] Reconnection failed after all attempts');
      isConnecting.current = false;
    });

    // Business logic events
    socket.on('booking_created', (data) => {
      console.log('[useSocket] Booking created:', data);
      handlers.onBookingCreated?.(data);
    });

    socket.on('booking_approved', (data) => {
      console.log('[useSocket] Booking approved:', data);
      handlers.onBookingApproved?.(data);
    });

    socket.on('booking_cancelled', (data) => {
      console.log('[useSocket] Booking cancelled:', data);
      handlers.onBookingCancelled?.(data);
    });

    socket.on('booking_expired', (data) => {
      console.log('[useSocket] Booking expired (verification timeout):', data);
      handlers.onBookingExpired?.(data);
    });

    socket.on('request_created', (data) => {
      console.log('[useSocket] Custom request created:', data);
      handlers.onRequestCreated?.(data);
    });

    socket.on('request_accepted', (data) => {
      console.log('[useSocket] Custom request accepted:', data);
      handlers.onRequestAccepted?.(data);
    });

    socket.on('request_rejected', (data) => {
      console.log('[useSocket] Custom request rejected:', data);
      handlers.onRequestRejected?.(data);
    });

    socket.on('request_cancelled', (data) => {
      console.log('[useSocket] Custom request cancelled:', data);
      handlers.onRequestCancelled?.(data);
    });

    socket.on('otp_sent', (data) => {
      console.log('[useSocket] OTP sent:', data);
      handlers.onOtpSent?.(data);
    });

    socket.on('payment_captured', (data) => {
      console.log('[useSocket] Payment captured:', data);
      handlers.onPaymentCaptured?.(data);
    });

    socket.on('availability_updated', (data) => {
      console.log('🔔 [useSocket] AVAILABILITY UPDATED:', {
        companionId: data.companionId,
        slotsCount: data.slotsCount,
        timestamp: data.timestamp,
        fullData: data
      });
      handlers.onAvailabilityUpdated?.(data);
    });

    socket.on('new_message', (data) => {
      console.log('[useSocket] New message:', data);
      handlers.onNewMessage?.(data);
    });

    socket.on('new_notification', (data) => {
      console.log('[useSocket] New notification:', data);
      handlers.onNotification?.(data);
    });

    socket.on('earnings_updated', (data) => {
      console.log('[useSocket] Earnings updated:', data);
      handlers.onEarningsUpdated?.(data);
    });

    socketRef.current = socket;
  }, [handlers]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      console.log('[useSocket] Disconnecting...');
      socketRef.current.disconnect();
      socketRef.current = null;
      isConnecting.current = false;
    }
  }, []);

  const emit = useCallback((event: string, data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    } else {
      console.warn('[useSocket] Cannot emit, socket not connected');
    }
  }, []);

  // Auto-connect on mount, disconnect on unmount
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    socket: socketRef.current,
    connected,
    emit,
    connect,
    disconnect
  };
};

