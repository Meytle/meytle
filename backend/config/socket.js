/**
 * Socket.io Configuration
 * Handles real-time messaging between clients and companions
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('./config');
const logger = require('../services/logger');

// Store connected users: { userId: socketId }
const connectedUsers = new Map();

/**
 * Initialize Socket.io server
 */
const initializeSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Socket.io authentication middleware (allows both authenticated and guest connections)
  io.use((socket, next) => {
    try {
      // Try to get token from auth header first (old way - backwards compatible)
      let token = socket.handshake.auth.token;
      
      // If no token in auth, try to read from HttpOnly cookie (new way - more secure)
      if (!token && socket.handshake.headers.cookie) {
        const cookies = socket.handshake.headers.cookie.split(';').map(c => c.trim());
        const authCookie = cookies.find(c => c.startsWith('auth_token='));
        if (authCookie) {
          token = authCookie.split('=')[1];
          logger.info('Socket auth: Token found in HttpOnly cookie', { 
            socketId: socket.id,
            cookieFound: true
          });
        }
      }

      // Allow guest connections (for public events like availability_updated)
      if (!token) {
        logger.info('Guest socket connection allowed (no token found)', { 
          socketId: socket.id,
          hasAuthHeader: !!socket.handshake.auth.token,
          hasCookie: !!socket.handshake.headers.cookie
        });
        socket.userId = null; // Mark as guest
        socket.userRole = 'guest';
        socket.isGuest = true;
        return next(); // Allow connection
      }

      // Check if JWT secret is configured
      const jwtSecret = config.jwt?.secret || config.jwtSecret;
      if (!jwtSecret) {
        logger.error('CRITICAL: JWT_SECRET not configured for socket authentication');
        return next(new Error('Server configuration error'));
      }

      // Verify JWT token for authenticated users
      const decoded = jwt.verify(token, jwtSecret);
      
      if (!decoded || !decoded.id) {
        logger.warn('Socket auth failed: Invalid token, allowing as guest', {
          socketId: socket.id
        });
        // If token is invalid, allow as guest instead of rejecting
        socket.userId = null;
        socket.userRole = 'guest';
        socket.isGuest = true;
        return next();
      }

      // Attach user info to socket for authenticated users
      socket.userId = decoded.id;
      socket.userRole = decoded.role;
      socket.isGuest = false;

      logger.info('Socket authenticated successfully', {
        userId: socket.userId,
        socketId: socket.id,
        userRole: socket.userRole
      });

      next();
    } catch (error) {
      logger.error('Socket authentication failed', {
        error: error.message,
        errorName: error.name,
        socketId: socket.id
      });
      
      // Provide specific error messages
      if (error.name === 'TokenExpiredError') {
        return next(new Error('Authentication error: Token expired'));
      } else if (error.name === 'JsonWebTokenError') {
        return next(new Error('Authentication error: Invalid token'));
      }
      
      next(new Error('Authentication error: ' + error.message));
    }
  });

  // Handle socket connections
  io.on('connection', (socket) => {
    const userId = socket.userId;
    const isGuest = socket.isGuest;

    // Handle guest connections (no personal room, just broadcast events)
    if (isGuest || !userId) {
      logger.info('Guest connected via socket', {
        socketId: socket.id,
        totalConnections: io.engine.clientsCount
      });
      // Guests don't join personal rooms, but can receive broadcast events
      return; // Skip the rest of the authenticated user setup
    }

    // Store authenticated user's socket connection
    connectedUsers.set(userId, socket.id);

    logger.info('Authenticated user connected via socket', {
      userId,
      socketId: socket.id,
      connectedCount: connectedUsers.size
    });

    // Join authenticated user to their personal room
    socket.join(`user:${userId}`);
    
    logger.info('✅ User joined personal room', {
      userId,
      room: `user:${userId}`,
      socketId: socket.id,
      userRole: socket.userRole
    });

    // Notify user they're connected
    socket.emit('connected', {
      userId,
      socketId: socket.id,
      userRole: socket.userRole,
      message: 'Successfully connected to messaging server'
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      connectedUsers.delete(userId);
      
      logger.info('User disconnected', {
        userId,
        socketId: socket.id,
        reason,
        connectedCount: connectedUsers.size
      });
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error('Socket error', {
        userId,
        socketId: socket.id,
        error: error.message
      });
    });
  });

  // Store io instance globally for use in controllers
  global.io = io;
  global.connectedUsers = connectedUsers;

  logger.info('Socket.io server initialized successfully');

  return io;
};

/**
 * Emit a new message event to the receiver
 */
const emitNewMessage = (receiverId, messageData) => {
  if (global.io) {
    // Emit to receiver's personal room
    global.io.to(`user:${receiverId}`).emit('new_message', messageData);

    logger.info('New message emitted via socket', {
      receiverId,
      messageId: messageData.id,
      bookingId: messageData.bookingId
    });
  }
};

/**
 * Emit message read event to the sender (for read receipts)
 */
const emitMessageRead = (senderId, messageData) => {
  if (global.io) {
    global.io.to(`user:${senderId}`).emit('message_read', messageData);

    logger.info('Message read event emitted', {
      senderId,
      messageId: messageData.id
    });
  }
};

/**
 * Emit unread count update to the receiver (when they read messages)
 */
const emitUnreadCountUpdate = (receiverId, count) => {
  if (global.io) {
    global.io.to(`user:${receiverId}`).emit('unread_count_updated', { count });

    logger.info('Unread count update emitted', {
      receiverId,
      count
    });
  }
};

/**
 * Check if a user is currently connected
 */
const isUserConnected = (userId) => {
  return connectedUsers.has(userId);
};

/**
 * Get count of connected users
 */
const getConnectedUsersCount = () => {
  return connectedUsers.size;
};

/**
 * Emit booking update event to both client and companion
 */
const emitBookingUpdate = (clientId, companionId, event, data) => {
  if (global.io) {
    // Emit to client
    global.io.to(`user:${clientId}`).emit(event, {
      ...data,
      timestamp: new Date()
    });

    // Emit to companion
    global.io.to(`user:${companionId}`).emit(event, {
      ...data,
      timestamp: new Date()
    });

    logger.info('Booking update emitted via socket', {
      event,
      clientId,
      companionId,
      bookingId: data.bookingId
    });
  }
};

/**
 * Emit notification event to specific user
 */
const emitNotification = (userId, notification) => {
  if (global.io) {
    global.io.to(`user:${userId}`).emit('new_notification', {
      ...notification,
      timestamp: new Date()
    });

    logger.info('Notification emitted via socket', {
      userId,
      notificationId: notification.id,
      type: notification.type
    });
  }
};

/**
 * Emit earnings update to companion
 */
const emitEarningsUpdate = (companionId, data) => {
  if (global.io) {
    global.io.to(`user:${companionId}`).emit('earnings_updated', {
      ...data,
      timestamp: new Date()
    });

    logger.info('Earnings update emitted via socket', {
      companionId,
      bookingId: data.bookingId
    });
  }
};

/**
 * Emit payment captured event to companion only
 */
const emitPaymentCaptured = (companionId, data) => {
  if (global.io) {
    global.io.to(`user:${companionId}`).emit('payment_captured', {
      ...data,
      timestamp: new Date()
    });

    logger.info('Payment captured event emitted via socket', {
      companionId,
      bookingId: data.bookingId
    });
  }
};

/**
 * Emit availability update - broadcast to all connected clients
 * This notifies clients who are viewing this companion's profile
 */
const emitAvailabilityUpdate = (companionId, data) => {
  if (!global.io) {
    logger.error('❌ Socket.io not initialized - cannot emit availability update!', { companionId });
    return;
  }

  const connectedClients = global.io.engine.clientsCount || 0;
  
  // Broadcast to all connected clients (they can filter by companionId on client side)
  global.io.emit('availability_updated', {
    ...data,
    timestamp: new Date()
  });

  logger.info('🔔 Availability update emitted via socket', {
    companionId,
    slotsCount: data.slotsCount,
    connectedClients,
    event: 'availability_updated'
  });
  
  console.log(`\n🔔 [SOCKET EMIT] Availability Update:`);
  console.log(`   Companion ID: ${companionId}`);
  console.log(`   Slots Count: ${data.slotsCount}`);
  console.log(`   Connected Clients: ${connectedClients}`);
  console.log(`   Event: availability_updated\n`);
};

module.exports = {
  initializeSocket,
  emitNewMessage,
  emitMessageRead,
  emitUnreadCountUpdate,
  emitBookingUpdate,
  emitNotification,
  emitEarningsUpdate,
  emitPaymentCaptured,
  emitAvailabilityUpdate,
  isUserConnected,
  getConnectedUsersCount
};

