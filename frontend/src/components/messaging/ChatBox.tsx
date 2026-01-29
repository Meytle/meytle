/**
 * ChatBox Component
 * Real-time messaging between client and companion for confirmed bookings
 */

import React, { useState, useEffect, useRef } from 'react';
import { FaTimes, FaPaperPlane, FaExclamationTriangle } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { messagesApi } from '../../api/messages';
import { useAuth } from '../../hooks/useAuth';
import { useSocket } from '../../context/SocketContext';
import type { Message } from '../../types';

interface ChatBoxProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: number;
  companionName?: string;
  clientName?: string;
}

const ChatBox: React.FC<ChatBoxProps> = ({
  isOpen,
  onClose,
  bookingId,
  companionName,
  clientName
}) => {
  const { user } = useAuth();
  const { socket, newMessage } = useSocket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Prevent background scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Fetch messages when component opens (Socket.io handles real-time updates, no polling needed)
  useEffect(() => {
    if (isOpen) {
      fetchMessages();
    }
  }, [isOpen, bookingId]);

  // Listen for new messages via Socket.io
  useEffect(() => {
    // Use == for type-coercive comparison (backend may send bookingId as string)
    if (newMessage && Number(newMessage.bookingId) === Number(bookingId) && isOpen) {
      console.log('📨 ChatBox: Received new message for this booking:', {
        messageId: newMessage.id,
        bookingId: newMessage.bookingId,
        expectedBookingId: bookingId,
        senderId: newMessage.senderId,
        text: newMessage.messageText?.substring(0, 50)
      });
      
      // Check if message already exists (avoid duplicates)
      setMessages(prevMessages => {
        const exists = prevMessages.some(m => m.id === newMessage.id);
        if (exists) {
          console.log('⚠️ ChatBox: Message already exists, skipping duplicate');
          return prevMessages;
        }
        console.log('✅ ChatBox: Adding new message to chat');
        return [...prevMessages, newMessage];
      });

      // Auto-scroll to new message
      scrollToBottom();
      
      // ✅ Note: Messages are automatically marked as read by the 30-second polling
      // or when the chat is reopened. No need to fetch immediately.
    }
  }, [newMessage, bookingId, isOpen]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchMessages = async () => {
    try {
      setIsLoading(true);
      const fetchedMessages = await messagesApi.getMessages(bookingId);
      setMessages(fetchedMessages);
    } catch (error: any) {
      console.error('Error fetching messages:', error);
      // Don't show error toast during polling to avoid spam
    } finally {
      setIsLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async () => {
    const textToSend = messageText.trim();

    if (!textToSend || isSending) {
      return;
    }

    if (textToSend.length > 1000) {
      toast.error('Message is too long (maximum 1000 characters)');
      return;
    }

    try {
      setIsSending(true);
      // Send message and get the created message back for instant display
      const sentMessage = await messagesApi.sendMessage(bookingId, textToSend);

      // ✅ Only clear input AFTER successful send (prevents race condition)
      setMessageText('');

      // Add message to UI immediately using API response (no socket delay)
      if (sentMessage) {
        setMessages(prevMessages => {
          // Check if message already exists (from socket event)
          const exists = prevMessages.some(m => m.id === sentMessage.id);
          if (exists) {
            return prevMessages;
          }
          return [...prevMessages, sentMessage];
        });
      }

      scrollToBottom();
    } catch (error: any) {
      console.error('Error sending message:', error);
      // Don't modify messageText on error - user's text is preserved

      // Check if message was blocked
      if (error.response?.status === 400 && error.response?.data?.violations) {
        toast.error(error.response.data.message || 'Your message contains blocked content', {
          duration: 5000
        });
      } else {
        toast.error(error.response?.data?.message || 'Failed to send message');
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    }
  };

  const getOtherPersonName = () => {
    if (user?.activeRole === 'client') {
      return companionName || 'Companion';
    } else {
      return clientName || 'Client';
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl h-[600px] flex flex-col relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Chat with {getOtherPersonName()}
              </h2>
              <p className="text-xs text-gray-500">Booking #{bookingId}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <FaTimes className="text-xl" />
            </button>
          </div>

          {/* Warning Banner */}
          <div className="bg-yellow-50 border-b border-yellow-200 p-3">
            <div className="flex items-start gap-2">
              <FaExclamationTriangle className="text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-yellow-800">
                <strong>Important:</strong> Do not share phone numbers, email addresses, social media handles, 
                payment apps, or physical addresses. Messages with such content will be blocked. 
                Use only platform messaging and payment systems.
              </div>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {isLoading && messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="w-8 h-8 border-4 border-[#312E81] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-sm text-gray-500">Loading messages...</p>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-500">
                  <p className="text-lg font-medium">No messages yet</p>
                  <p className="text-sm mt-1">Start the conversation!</p>
                </div>
              </div>
            ) : (
              <>
                {messages.map((message) => {
                  const isSentByMe = message.senderId === user?.id;
                  return (
                    <div
                      key={message.id}
                      className={`flex ${isSentByMe ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                          isSentByMe
                            ? 'bg-[#312E81] text-white'
                            : 'bg-white text-gray-900 border border-gray-200'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap break-words">
                          {message.messageText}
                        </p>
                        <p
                          className={`text-xs mt-1 ${
                            isSentByMe ? 'text-purple-200' : 'text-gray-500'
                          }`}
                        >
                          {formatMessageTime(message.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input Area */}
          <div className="border-t border-gray-200 p-4 bg-white">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your message..."
                  rows={2}
                  maxLength={1000}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#312E81] focus:border-transparent transition-all resize-none"
                />
                <div className="flex items-center justify-between mt-1 px-1">
                  <p className="text-xs text-gray-500">
                    Press Enter to send, Shift+Enter for new line
                  </p>
                  <p className="text-xs text-gray-500">
                    {messageText.length}/1000
                  </p>
                </div>
              </div>
              <button
                onClick={handleSendMessage}
                disabled={!messageText.trim() || isSending}
                className="px-6 py-3 bg-[#312E81] text-white rounded-xl hover:bg-[#1E1B4B] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
              >
                {isSending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Sending
                  </>
                ) : (
                  <>
                    <FaPaperPlane />
                    Send
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ChatBox;

