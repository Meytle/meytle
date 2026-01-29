/**
 * Socket.io Context
 * Manages real-time Socket.io connection for messaging
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../hooks/useAuth';
import { useChatPopup } from './ChatPopupContext';
import { API_CONFIG } from '../constants';
import toast from 'react-hot-toast';

interface Message {
  id: number;
  bookingId: number;
  senderId: number;
  receiverId: number;
  messageText: string;
  createdAt: string;
  readAt?: string;
}

interface Notification {
  id: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
  isRead: boolean;
  createdAt: string;
}

interface BookingEvent {
  type: 'created' | 'approved' | 'cancelled' | 'expired' | 'request_created' | 'request_accepted' | 'request_rejected' | 'request_cancelled' | 'otp_sent' | 'payment_captured' | 'availability_updated' | 'earnings_updated' | 'verification_extended' | 'meeting_verified';
  data: any;
  timestamp: number;
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  unreadMessagesCount: number;
  newMessage: Message | null;
  lastBookingEvent: BookingEvent | null; // Triggers dashboard refresh on booking events
  newNotification: Notification | null; // Real-time notification updates
  unreadNotificationsCount: number;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  unreadMessagesCount: 0,
  newMessage: null,
  lastBookingEvent: null,
  newNotification: null,
  unreadNotificationsCount: 0
});

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context;
};

interface SocketProviderProps {
  children: React.ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const { isChatOpen, activeBookingId } = useChatPopup();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [newMessage, setNewMessage] = useState<Message | null>(null);
  const [lastBookingEvent, setLastBookingEvent] = useState<BookingEvent | null>(null);
  const [newNotification, setNewNotification] = useState<Notification | null>(null);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);

  // Use refs to access latest chat state inside socket event handlers (avoids stale closures)
  const chatStateRef = useRef({ isChatOpen, activeBookingId });
  useEffect(() => {
    chatStateRef.current = { isChatOpen, activeBookingId };
  }, [isChatOpen, activeBookingId]);

  // Track pending notification increments during initial fetch to avoid race condition
  const notificationFetchInProgressRef = useRef(false);
  const pendingNotificationIncrementsRef = useRef(0);

  // Initialize socket connection
  useEffect(() => {
    if (!isAuthenticated || !user) {
      // Disconnect and reset all state if user logs out
      if (socket) {
        console.log('🔌 Disconnecting socket (user logged out)');
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      // Reset all event state to prevent stale data on next login/role switch
      setLastBookingEvent(null);
      setNewMessage(null);
      setUnreadMessagesCount(0);
      setNewNotification(null);
      setUnreadNotificationsCount(0);
      return;
    }

    console.log('🔌 [SocketContext] Connecting to Socket.io server with automatic cookie authentication...');
    console.log('🌐 [SocketContext] Server URL:', API_CONFIG.SOCKET_URL || '(same origin)');

    // Create socket connection with withCredentials to send HttpOnly cookie
    // Socket.io needs the origin URL (or empty for same-origin), not the API path
    const socketInstance = io(API_CONFIG.SOCKET_URL || undefined, {
      withCredentials: true, // CRITICAL: Sends HttpOnly auth_token cookie automatically
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000
    });

    // Connection event handlers
    socketInstance.on('connect', () => {
      console.log('✅ [SocketContext] Socket connected:', socketInstance.id);
      console.log('🔐 [SocketContext] Authentication status will be confirmed by server via "connected" event');
      setIsConnected(true);
      
      // Refresh unread count on reconnection
      fetch(`${API_CONFIG.BASE_URL}/messages/unread/count`, {
        credentials: 'include'
      })
        .then(res => res.json())
        .then(data => {
          setUnreadMessagesCount(data.unreadCount || 0);
          console.log('🔄 [SocketContext] Unread count refreshed on reconnect:', data.unreadCount);
        })
        .catch(err => console.error('❌ [SocketContext] Failed to refresh unread count:', err));
    });

    socketInstance.on('connected', (data) => {
      console.log('✅ [SocketContext] Server confirmed connection:', data);
      if (data.userId) {
        console.log(`✅ [SocketContext] AUTHENTICATED as user ${data.userId} for messaging`);
      } else {
        console.warn('⚠️ [SocketContext] Connected as GUEST - messaging will not work!');
      }
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('❌ Socket disconnected:', reason);
      setIsConnected(false);
      
      if (reason === 'io server disconnect') {
        // Server disconnected, try to reconnect manually
        console.log('🔄 Server disconnected, attempting to reconnect...');
        socketInstance.connect();
      }
    });

    socketInstance.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error.message);
      setIsConnected(false);
    });

    socketInstance.on('reconnect', (attemptNumber) => {
      console.log(`✅ Socket reconnected after ${attemptNumber} attempts`);
    });

    socketInstance.on('reconnect_attempt', (attemptNumber) => {
      console.log(`🔄 Reconnection attempt ${attemptNumber}...`);
    });

    socketInstance.on('reconnect_failed', () => {
      console.error('❌ Socket reconnection failed after all attempts');
      toast.error('Connection lost. Please refresh.');
    });

    socketInstance.on('error', (error) => {
      console.error('❌ Socket error:', error);
    });

    // Listen for new messages
    socketInstance.on('new_message', (message: Message) => {
      console.log('📨 New message received via socket:', message);

      // Set new message (triggers UI updates)
      // Force new object reference to ensure React detects the change
      setNewMessage({ ...message, _timestamp: Date.now() } as any);

      // Only show toast and increment unread count if it's NOT our own message
      if (message.senderId !== user?.id) {
        // Check if chat is open for this specific booking (use ref for latest state)
        const { isChatOpen, activeBookingId } = chatStateRef.current;
        const isThisChatOpen = isChatOpen && Number(activeBookingId) === Number(message.bookingId);

        // Only increment unread count and show toast if chat for this booking is NOT open
        if (!isThisChatOpen) {
          setUnreadMessagesCount(prev => prev + 1);
          toast.success('New message');
        } else {
          console.log('📨 [SocketContext] Suppressing toast & unread increment - chat is open for this booking');
        }
      }
    });

    // Listen for message read events (for read receipts - shows sender their message was read)
    socketInstance.on('message_read', (data) => {
      console.log('📖 Message read by recipient:', data);
      // This event is for read receipts only - shows sender that recipient read their message
      // We do NOT decrement unread count here because this is sent to the SENDER, not the reader
    });

    // Listen for unread count updates (when user reads messages, their count is updated)
    socketInstance.on('unread_count_updated', (data) => {
      console.log('📊 Unread count updated from server:', data.count);
      setUnreadMessagesCount(data.count);
    });

    // Listen for new notifications (real-time notification updates)
    socketInstance.on('new_notification', (notification: Notification) => {
      console.log('🔔 New notification received via socket:', notification);

      // Update the notification state (triggers UI updates)
      setNewNotification({ ...notification, _timestamp: Date.now() } as any);

      // Increment unread notification count (handle race condition with initial fetch)
      if (notificationFetchInProgressRef.current) {
        // If fetch is in progress, queue the increment
        pendingNotificationIncrementsRef.current += 1;
        console.log('🔔 Notification queued during fetch, pending:', pendingNotificationIncrementsRef.current);
      } else {
        setUnreadNotificationsCount(prev => prev + 1);
      }

      // Show toast for new notification
      toast.success(notification.title, {
        duration: 4000,
        icon: '🔔'
      });
    });

    // Listen for booking events (shared connection - dashboards watch lastBookingEvent)
    const bookingEvents = [
      'booking_created', 'booking_approved', 'booking_cancelled', 'booking_expired',
      'request_created', 'request_accepted', 'request_rejected', 'request_cancelled',
      'otp_sent', 'payment_captured', 'availability_updated', 'earnings_updated',
      'verification_extended', // OTP time extension event
      'meeting_verified' // Both parties verified - close OTP modal
    ];

    bookingEvents.forEach(eventName => {
      socketInstance.on(eventName, (data) => {
        console.log(`📣 [SocketContext] ${eventName}:`, data);
        const eventType = eventName.replace('booking_', '').replace('request_', 'request_') as BookingEvent['type'];
        setLastBookingEvent({
          type: eventType,
          data,
          timestamp: Date.now()
        });
      });
    });

    setSocket(socketInstance);

    // Cleanup on unmount
    return () => {
      console.log('🔌 Cleaning up socket connection');
      socketInstance.off('connect');
      socketInstance.off('connected');
      socketInstance.off('disconnect');
      socketInstance.off('connect_error');
      socketInstance.off('error');
      socketInstance.off('reconnect');
      socketInstance.off('reconnect_attempt');
      socketInstance.off('reconnect_failed');
      socketInstance.off('new_message');
      socketInstance.off('message_read');
      socketInstance.off('unread_count_updated');
      socketInstance.off('new_notification');
      // Remove booking event listeners
      bookingEvents.forEach(eventName => {
        socketInstance.off(eventName);
      });
      socketInstance.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.id]); // FIX: Use user?.id instead of user object to prevent reconnects on user object reference changes

  // Fetch initial unread count when user is authenticated (even if socket not connected yet)
  useEffect(() => {
    if (isAuthenticated) {
      const fetchUnreadCount = async () => {
        try {
          console.log('📊 Fetching initial unread message count...');
          const response = await fetch(`${API_CONFIG.BASE_URL}/messages/unread/count`, {
            credentials: 'include'
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const data = await response.json();
          const count = data.unreadCount || 0;
          setUnreadMessagesCount(count);
          console.log(`✅ Initial unread message count: ${count}`);
        } catch (error) {
          console.error('❌ Failed to fetch unread count:', error);
        }
      };

      const fetchUnreadNotificationCount = async () => {
        try {
          console.log('🔔 Fetching initial unread notification count...');
          notificationFetchInProgressRef.current = true;
          pendingNotificationIncrementsRef.current = 0;

          const response = await fetch(`${API_CONFIG.BASE_URL}/notifications/unread-count`, {
            credentials: 'include'
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const data = await response.json();
          const count = data.data?.unreadCount || 0;

          // Apply fetched count plus any notifications that arrived during fetch
          const totalCount = count + pendingNotificationIncrementsRef.current;
          setUnreadNotificationsCount(totalCount);
          console.log(`✅ Initial unread notification count: ${count} + ${pendingNotificationIncrementsRef.current} pending = ${totalCount}`);
        } catch (error) {
          console.error('❌ Failed to fetch notification unread count:', error);
        } finally {
          notificationFetchInProgressRef.current = false;
          pendingNotificationIncrementsRef.current = 0;
        }
      };

      fetchUnreadCount();
      fetchUnreadNotificationCount();
    } else {
      // Reset counts when user logs out
      setUnreadMessagesCount(0);
      setUnreadNotificationsCount(0);
    }
  }, [isAuthenticated]);

  const value = {
    socket,
    isConnected,
    unreadMessagesCount,
    newMessage,
    lastBookingEvent,
    newNotification,
    unreadNotificationsCount
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

