import { Link, useLocation, useNavigate } from 'react-router-dom';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useModal } from '../context/ModalContext';
import { useSocket } from '../context/SocketContext';
import { useChatPopup } from '../context/ChatPopupContext';
import { FaSignOutAlt, FaBell, FaEdit, FaTachometerAlt, FaCalendarAlt, FaComments, FaUser, FaExchangeAlt } from 'react-icons/fa';
import Button from './common/Button';
import RoleSwitcher from './common/RoleSwitcher';
import notificationApi from '../api/notifications';
import type { Notification } from '../api/notifications';
import clientApi from '../api/client';
import companionsApi from '../api/companions';
import { bookingApi } from '../api/booking';
import messagesApi from '../api/messages';
import { API_CONFIG } from '../constants';
import { getImageUrl } from '../utils/imageHelpers';

const Navbar = React.memo(() => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAnyModalOpen } = useModal();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const lastScrollY = useRef(0);
  const isHeaderVisibleRef = useRef(true); // Track current visibility state
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const { user, isAuthenticated, signOut, switchRole } = useAuth();
  const { unreadMessagesCount, newMessage, unreadNotificationsCount, newNotification } = useSocket();
  const { openChat, isChatOpen } = useChatPopup();
  const [showChatSelector, setShowChatSelector] = useState(false);
  const [conversations, setConversations] = useState<any[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const chatSelectorRef = useRef<HTMLDivElement>(null);
  
  const isCompanion = user?.roles?.includes('companion');

  // Sync ref with state
  useEffect(() => {
    isHeaderVisibleRef.current = isHeaderVisible;
  }, [isHeaderVisible]);

  // Detect mobile device and update on resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setIsNotificationOpen(false);
      }
      if (chatSelectorRef.current && !chatSelectorRef.current.contains(event.target as Node)) {
        setShowChatSelector(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll handler for navbar visibility
  useEffect(() => {
    // Disable scroll behavior on mobile devices - always show header
    if (isMobile) {
      setIsHeaderVisible(true);
      isHeaderVisibleRef.current = true;
      return;
    }

    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          // Don't update visibility based on scroll when modal is open
          if (isAnyModalOpen) {
            if (!isHeaderVisibleRef.current) {
              setIsHeaderVisible(true);
              isHeaderVisibleRef.current = true;
            }
            ticking = false;
            return;
          }

          const currentScrollY = window.scrollY;
          const scrollDifference = currentScrollY - lastScrollY.current;

          if (import.meta.env.DEV) {
            console.log('📊 Scroll Event:', {
              currentY: currentScrollY,
              lastY: lastScrollY.current,
              diff: scrollDifference,
              currentlyVisible: isHeaderVisibleRef.current
            });
          }

          // Ignore very small scroll movements (less than 5px)
          if (Math.abs(scrollDifference) >= 5) {
            let shouldBeVisible = isHeaderVisibleRef.current;

            // Only hide header after scrolling down past 80px
            if (scrollDifference > 0 && currentScrollY > 80) {
              // Scrolling DOWN - hide header
              shouldBeVisible = false;
              if (import.meta.env.DEV) console.log('⬇️ Should HIDE header');
            } else if (scrollDifference < 0) {
              // Scrolling UP - show header
              shouldBeVisible = true;
              if (import.meta.env.DEV) console.log('⬆️ Should SHOW header');
            }

            // Only update if visibility changed
            if (shouldBeVisible !== isHeaderVisibleRef.current) {
              if (import.meta.env.DEV) {
                console.log(`🔄 Changing visibility: ${isHeaderVisibleRef.current} → ${shouldBeVisible}`);
              }
              setIsHeaderVisible(shouldBeVisible);
              isHeaderVisibleRef.current = shouldBeVisible;
            }

            lastScrollY.current = currentScrollY;
          }

          ticking = false;
        });

        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    // Proper cleanup
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [isAnyModalOpen, isMobile]);

  // Fetch profile photo when user is authenticated
  useEffect(() => {
    const fetchProfilePhoto = async () => {
      if (!isAuthenticated || !user) {
        setProfilePhotoUrl(null);
        return;
      }

      try {
        console.log('🔍 Navbar: Fetching profile photo for user:', {
          userId: user.id,
          userName: user.name,
          userRole: user.activeRole
        });

        if (user.activeRole === 'client') {
          const profile = await clientApi.getProfile();
          console.log('📸 Navbar: Client profile response:', {
            loggedInUserId: user.id,
            profileUserId: profile.user?.id,
            photoUrl: profile.verification?.profilePhotoUrl || profile.user?.profilePicture,
            isMatch: user.id === profile.user?.id
          });
          
          // Security check: Verify the profile belongs to the logged-in user
          if (profile.user?.id !== user.id) {
            console.error('⚠️ SECURITY WARNING: Profile user ID does not match logged-in user ID!', {
              loggedInUserId: user.id,
              profileUserId: profile.user?.id
            });
            setProfilePhotoUrl(null);
            return;
          }
          
          // Try verification.profilePhotoUrl first, then user.profilePicture
          const photoUrl = profile.verification?.profilePhotoUrl || profile.user?.profilePicture;
          setProfilePhotoUrl(photoUrl || null);
        } else if (user.activeRole === 'companion') {
          const response = await companionsApi.getCompanionProfile();
          console.log('📸 Navbar: Companion profile response:', {
            loggedInUserId: user.id,
            profileUserId: response.data?.application?.userId,
            photoUrl: response.data?.application?.profilePhotoUrl,
            isMatch: user.id === response.data?.application?.userId
          });
          
          // Security check: Verify the application belongs to the logged-in user
          if (response.data?.application?.userId !== user.id) {
            console.error('⚠️ SECURITY WARNING: Application user ID does not match logged-in user ID!', {
              loggedInUserId: user.id,
              applicationUserId: response.data?.application?.userId
            });
            setProfilePhotoUrl(null);
            return;
          }
          
          const photoUrl = response.data?.application?.profilePhotoUrl;
          setProfilePhotoUrl(photoUrl || null);
        }
        
        console.log('✅ Navbar: Profile photo URL set successfully');
      } catch (error) {
        console.error('Failed to fetch profile photo:', error);
        setProfilePhotoUrl(null);
      }
    };

    fetchProfilePhoto();
  }, [isAuthenticated, user?.activeRole, user?.id]);

  // Fetch notifications when user is authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchNotifications();
      fetchUnreadCount();
      // Refresh notifications every 90 seconds (balanced for performance & UX)
      const interval = setInterval(() => {
        fetchUnreadCount();
      }, 90000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) return;

    setIsLoadingNotifications(true);
    try {
      const response = await notificationApi.getNotifications(10, 0);
      setNotifications(response.data.notifications);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setIsLoadingNotifications(false);
    }
  }, [isAuthenticated]);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      const response = await notificationApi.getUnreadCount();
      setUnreadCount(response.data.unreadCount);
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  }, [isAuthenticated]);

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId: number) => {
    try {
      await notificationApi.markAsRead(notificationId);
      // Update local state
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    try {
      await notificationApi.markAllAsRead();
      // Update local state
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  }, []);

  // Format notification timestamp
  const formatNotificationTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  // Handle notification click
  const handleNotificationItemClick = useCallback((notification: Notification) => {
    // Mark as read if unread
    if (!notification.isRead) {
      markAsRead(notification.id);
    }
    // Navigate if action URL exists
    if (notification.actionUrl) {
      navigate(notification.actionUrl);
      setIsNotificationOpen(false);
    }
  }, [markAsRead, navigate]);

  // Get notification icon color based on type
  const getNotificationIconColor = (type: string, isRead: boolean) => {
    if (isRead) return 'bg-neutral-300';
    switch(type) {
      case 'application': return 'bg-primary-500';
      case 'booking': return 'bg-secondary-500';
      case 'payment': return 'bg-green-500';
      case 'account': return 'bg-[#1e4e8f]';
      case 'system': return 'bg-orange-500';
      default: return 'bg-primary-500';
    }
  };

  // Memoized event handlers
  const handleSignOut = useCallback(() => {
    signOut();
    setIsProfileDropdownOpen(false);
  }, [signOut]);

  const handleProfileClick = useCallback(() => {
    setIsProfileDropdownOpen(prev => !prev);
  }, []);

  const handleNotificationClick = useCallback(() => {
    setIsNotificationOpen(prev => !prev);
    if (!isNotificationOpen) {
      fetchNotifications();
    }
  }, [isNotificationOpen, fetchNotifications]);

  // Fetch conversations for chat selector
  const fetchConversations = useCallback(async () => {
    try {
      setIsLoadingConversations(true);
      const response = await bookingApi.getBookings({ status: 'confirmed' });
      
      // Handle response format (array or object with bookings property)
      const bookings = Array.isArray(response) 
        ? response 
        : (response as any).bookings || [];
      
      const conversationsData = await Promise.all(
        bookings.map(async (booking: any) => {
          try {
            const msgs = await messagesApi.getMessages(booking.id);
            const lastMsg = msgs[msgs.length - 1];
            const unreadCount = msgs.filter(
              (msg: any) => msg.receiverId === user?.id && !msg.readAt
            ).length;
            
            return {
              bookingId: booking.id,
              otherPartyName: isCompanion ? booking.clientName : booking.companionName,
              otherPartyPhoto: isCompanion ? booking.clientPhoto : booking.companionPhoto,
              companionName: booking.companionName,
              clientName: booking.clientName,
              lastMessage: lastMsg?.messageText || 'No messages yet',
              unreadCount,
              bookingDate: booking.bookingDate
            };
          } catch (error) {
            // Even if fetching messages fails, still show the booking
            console.warn('Failed to fetch messages for booking', booking.id, error);
            return {
              bookingId: booking.id,
              otherPartyName: isCompanion ? booking.clientName : booking.companionName,
              otherPartyPhoto: isCompanion ? booking.clientPhoto : booking.companionPhoto,
              companionName: booking.companionName,
              clientName: booking.clientName,
              lastMessage: 'No messages yet',
              unreadCount: 0,
              bookingDate: booking.bookingDate
            };
          }
        })
      );
      
      const validConversations = conversationsData.filter((c) => c !== null);
      setConversations(validConversations);
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    } finally {
      setIsLoadingConversations(false);
    }
  }, [user?.id, isCompanion]);

  // Handle message icon click
  const handleMessageIconClick = useCallback(() => {
    setShowChatSelector(prev => !prev);
    if (!showChatSelector) {
      fetchConversations();
    }
  }, [showChatSelector, fetchConversations]);

  const scrollToSection = useCallback((sectionId: string) => {
    if (location.pathname !== '/') {
      navigate('/');
      setTimeout(() => {
        if (sectionId === 'top') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (sectionId === 'footer') {
          const element = document.getElementById('footer');
          if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
          } else {
            // If no footer element, scroll to bottom of page
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
          }
        } else {
          const element = document.getElementById(sectionId);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
          }
        }
      }, 100);
    } else {
      if (sectionId === 'top') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (sectionId === 'footer') {
        const element = document.getElementById('footer');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        } else {
          // If no footer element, scroll to bottom of page
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        }
      } else {
        const element = document.getElementById(sectionId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }
    }
  }, [location.pathname, navigate]);

  return (
    <>
      {/* Main Navigation Bar */}
      <nav 
        className="bg-white/95 border-b border-neutral-200 fixed top-0 left-0 right-0 z-50 shadow-lg transition-transform duration-300 ease-in-out"
        style={{
          transform: `translateY(${(isHeaderVisible && !isAnyModalOpen) ? '0' : '-100%'})`,
          willChange: 'transform',
        }}
      >
        <div className="max-w-full mx-auto px-3 sm:px-6 lg:px-12">
          <div className="relative flex items-center justify-between h-16 md:h-20">
          {/* Desktop Navigation - LEFT SIDE */}
          <div className="hidden xl:flex items-center space-x-6">
            <button
              onClick={() => {
                if (location.pathname === '/') {
                  scrollToSection('top');
                } else {
                  navigate('/');
                }
              }}
              className={`px-4 py-2 rounded-lg text-base font-semibold transition-all duration-300 ${
                location.pathname === '/'
                  ? 'bg-gradient-to-r from-[#1e4e8f]/10 to-[#FFCCCB]/10 text-[#1e4e8f] shadow-[0_0_15px_rgba(255,204,203,0.3)]'
                  : 'text-neutral-700 hover:bg-gradient-to-r hover:from-[#1e4e8f]/10 hover:to-[#FFCCCB]/10 hover:text-[#1e4e8f] hover:shadow-[0_0_15px_rgba(255,204,203,0.3)]'
              }`}
            >
              Home
            </button>
            <button
              onClick={() => scrollToSection('footer')}
              className="px-4 py-2 rounded-lg text-base font-semibold text-neutral-700 hover:bg-gradient-to-r hover:from-[#1e4e8f]/10 hover:to-[#FFCCCB]/10 hover:text-[#1e4e8f] hover:shadow-[0_0_15px_rgba(255,204,203,0.3)] transition-all duration-300"
            >
              About
            </button>
            <button
              onClick={() => scrollToSection('steps')}
              className="px-4 py-2 rounded-lg text-base font-semibold text-neutral-700 hover:bg-gradient-to-r hover:from-[#1e4e8f]/10 hover:to-[#FFCCCB]/10 hover:text-[#1e4e8f] hover:shadow-[0_0_15px_rgba(255,204,203,0.3)] transition-all duration-300"
            >
              How It Works
            </button>
            <button
              onClick={() => scrollToSection('services')}
              className="px-4 py-2 rounded-lg text-base font-semibold text-neutral-700 hover:bg-gradient-to-r hover:from-[#1e4e8f]/10 hover:to-[#FFCCCB]/10 hover:text-[#1e4e8f] hover:shadow-[0_0_15px_rgba(255,204,203,0.3)] transition-all duration-300"
            >
              Services
            </button>
          </div>

          {/* Logo - CENTER POSITION (Absolutely centered in header bar) */}
          <div className="absolute left-1/2 transform -translate-x-1/2 pointer-events-none">
            <Link to="/" className="flex items-center space-x-2 md:space-x-3 hover:scale-110 transition-transform duration-300 pointer-events-auto">
              {/* START of Logo Change to match the outline style */}
              <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-r from-[#1e4e8f] to-[#1e3a8a] rounded-xl flex items-center justify-center shadow-xl hover:shadow-[0_0_20px_rgba(255,204,203,0.4)] transition-all duration-300">
                <svg
                  className="w-full h-full p-1.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    // This path creates the pin shape and the inner circle, but we make it hollow.
                    // The 'fill-none' will be applied implicitly since we removed the 'fill-white' class.
                    d="M12 2C8.686 2 6 4.686 6 8c0 4 6 14 6 14s6-10 6-14c0-3.314-2.686-6-6-6zm0 9a3 3 0 100-6 3 3 0 000 6z"
                    className="stroke-white" // Only stroke is white for the outline effect
                    strokeWidth="2.5" // Increased stroke width slightly for visibility
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              {/* END of Logo Change */}
              <span className="text-xl md:text-2xl font-bold bg-gradient-to-r from-[#1e4e8f] to-[#1e3a8a] bg-clip-text text-transparent">Meytle</span>
            </Link>
          </div>

          {/* Auth Buttons in Header - Only show when header is visible */}
          {isHeaderVisible ? (
            <div className="hidden xl:flex items-center space-x-4">
              {isAuthenticated ? (
                // Authenticated User Menu
                <>
                  {/* Messages Icon */}
                  <div className="relative" ref={chatSelectorRef}>
                    <button
                      onClick={handleMessageIconClick}
                      className={`relative p-2 rounded-lg transition-all duration-200 ${
                        showChatSelector || isChatOpen
                          ? 'text-white bg-[#1e4e8f]'
                          : 'text-[#1e4e8f] hover:text-[#1e3a8a] hover:bg-[#1e4e8f]/10'
                      }`}
                      title="Messages"
                    >
                      <FaComments className="w-5 h-5" />
                      {/* Unread Messages Badge */}
                      {unreadMessagesCount > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-blue-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold px-1">
                          {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
                        </span>
                      )}
                    </button>

                    {/* Chat Selector Dropdown */}
                    {showChatSelector && (
                      <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-[9999] max-h-96 overflow-hidden flex flex-col">
                        <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-[#1e4e8f] to-[#2563eb] text-white">
                          <h3 className="font-semibold">Messages</h3>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto">
                          {isLoadingConversations ? (
                            <div className="flex items-center justify-center py-8">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e4e8f]"></div>
                            </div>
                          ) : conversations.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                              <FaComments className="text-4xl text-gray-300 mb-2" />
                              <p className="text-sm font-medium text-gray-900 mb-1">No live chat active</p>
                              <p className="text-xs text-gray-600">
                                Confirmed bookings will appear here
                              </p>
                            </div>
                          ) : (
                            <div className="divide-y divide-gray-200">
                              {conversations.map((conv: any) => (
                                <button
                                  key={conv.bookingId}
                                  onClick={() => {
                                    openChat(conv.bookingId, conv.companionName, conv.clientName);
                                    setShowChatSelector(false);
                                  }}
                                  className={`w-full p-3 hover:bg-gray-50 transition-colors text-left ${
                                    conv.unreadCount > 0 ? 'bg-blue-50/50' : ''
                                  }`}
                                >
                                  <div className="flex items-start gap-3">
                                    {conv.otherPartyPhoto ? (
                                      <img
                                        src={getImageUrl(conv.otherPartyPhoto)}
                                        alt={conv.otherPartyName}
                                        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                                        onError={(e) => {
                                          e.currentTarget.style.display = 'none';
                                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                        }}
                                      />
                                    ) : null}
                                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br from-[#1e4e8f] to-[#2563eb] flex items-center justify-center flex-shrink-0 ${conv.otherPartyPhoto ? 'hidden' : ''}`}>
                                      <FaUser className="text-white text-sm" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between mb-1">
                                        <h4 className={`font-medium text-sm text-gray-900 truncate ${conv.unreadCount > 0 ? 'font-bold' : ''}`}>
                                          {conv.otherPartyName}
                                        </h4>
                                        {conv.unreadCount > 0 && (
                                          <span className="ml-2 flex-shrink-0 min-w-[18px] h-4 bg-blue-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                                            {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                                          </span>
                                        )}
                                      </div>
                                      <p className={`text-xs truncate ${conv.unreadCount > 0 ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>
                                        {conv.lastMessage || 'No messages yet'}
                                      </p>
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Notification Bell */}
                  <div className="relative" ref={notificationRef}>
                    <button
                      onClick={handleNotificationClick}
                      className="relative p-2 text-[#1e4e8f] hover:text-[#1e3a8a] hover:bg-[#1e4e8f]/10 rounded-lg transition-all duration-200"
                    >
                      <FaBell className="w-5 h-5" />
                      {/* Notification Badge */}
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-error-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold px-1">
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                    </button>

                    {/* Notification Dropdown */}
                    {isNotificationOpen && (
                      <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-neutral-200 py-2 z-50">
                        <div className="px-4 py-2 border-b border-neutral-200 flex items-center justify-between">
                          <h3 className="font-semibold text-neutral-900">Notifications</h3>
                          {notifications.some(n => !n.isRead) && (
                            <button
                              onClick={markAllAsRead}
                              className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                            >
                              Mark all as read
                            </button>
                          )}
                        </div>
                        <div className="max-h-96 overflow-y-auto">
                          {isLoadingNotifications ? (
                            <div className="px-4 py-8 text-center">
                              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500"></div>
                              <p className="text-sm text-neutral-500 mt-2">Loading notifications...</p>
                            </div>
                          ) : notifications.length === 0 ? (
                            <div className="px-4 py-8 text-center">
                              <FaBell className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
                              <p className="text-sm text-neutral-500">No notifications yet</p>
                            </div>
                          ) : (
                            notifications.map((notification) => (
                              <div
                                key={notification.id}
                                onClick={() => handleNotificationItemClick(notification)}
                                className={`px-4 py-3 hover:bg-primary-50 cursor-pointer border-b border-neutral-100 transition-colors ${
                                  notification.isRead ? 'opacity-70' : ''
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <div className={`w-2 h-2 rounded-full mt-2 ${getNotificationIconColor(notification.type, notification.isRead)}`}></div>
                                  <div className="flex-1">
                                    <p className={`text-sm ${notification.isRead ? 'text-neutral-600' : 'text-neutral-800 font-medium'}`}>
                                      {notification.title}
                                    </p>
                                    <p className="text-xs text-neutral-600 mt-0.5">{notification.message}</p>
                                    <p className="text-xs text-neutral-500 mt-1">
                                      {formatNotificationTime(notification.createdAt)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                        <div className="px-4 py-2 border-t border-neutral-200 text-center">
                          <button
                            onClick={() => {
                              navigate('/notifications');
                              setIsNotificationOpen(false);
                            }}
                            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                          >
                            View All Notifications
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Role Switcher */}
                  <RoleSwitcher />

                  {/* Profile Dropdown */}
                  <div className="relative" ref={profileDropdownRef}>
                    <button
                      onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                      className="flex items-center gap-3 text-sm text-[#1e3a8a] hover:bg-[#1e4e8f]/10 px-3 py-2 rounded-lg transition-all duration-200"
                    >
                      <div className="relative w-8 h-8">
                        {profilePhotoUrl && (
                          <img 
                            src={getImageUrl(profilePhotoUrl)} 
                            alt={user?.name}
                            className="w-8 h-8 rounded-full object-cover shadow-[0_0_15px_rgba(255,204,203,0.3)]"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                              if (fallback) fallback.classList.remove('hidden');
                            }}
                          />
                        )}
                        <div className={`w-8 h-8 rounded-full bg-gradient-to-r from-[#1e4e8f] to-[#1e3a8a] flex items-center justify-center text-white font-semibold shadow-[0_0_15px_rgba(255,204,203,0.3)] ${profilePhotoUrl ? 'hidden' : ''}`}>
                          {user?.name?.charAt(0).toUpperCase()}
                        </div>
                      </div>
                      <span className="font-medium text-[#1e3a8a]">{user?.name}</span>
                      <svg className={`w-4 h-4 transition-transform ${isProfileDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Profile Dropdown Menu */}
                    {isProfileDropdownOpen && (
                      <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-neutral-200 py-2 z-50">
                        {/* User Info */}
                        <div className="px-4 py-3 border-b border-neutral-200">
                          <p className="text-sm font-semibold text-neutral-900">{user?.name}</p>
                          <p className="text-xs text-neutral-500">{user?.email}</p>
                          <span className="inline-block mt-1 px-2 py-0.5 bg-[#1e4e8f]/10 text-[#1e4e8f] text-xs rounded-full capitalize">
                            {user?.activeRole}
                          </span>
                        </div>

                        {/* Menu Items */}
                        <div className="py-1">
                          <button
                            onClick={() => {
                              navigate(user?.activeRole === 'companion' ? '/companion-dashboard' : '/client-dashboard');
                              setIsProfileDropdownOpen(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-[#1e3a8a] hover:bg-[#1e4e8f]/10 hover:text-[#1e4e8f] transition-colors"
                          >
                            <FaTachometerAlt className="w-4 h-4" />
                            Dashboard
                          </button>

                          <button
                            onClick={() => {
                              if (user?.activeRole === 'companion') {
                                navigate('/companion-profile');
                              } else if (user?.activeRole === 'client') {
                                navigate('/client-profile');
                              }
                              setIsProfileDropdownOpen(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-[#1e3a8a] hover:bg-[#1e4e8f]/10 hover:text-[#1e4e8f] transition-colors"
                          >
                            <FaEdit className="w-4 h-4" />
                            Edit Profile
                          </button>

                          <div className="border-t border-neutral-200 my-1"></div>

                          <button
                            onClick={() => {
                              signOut();
                              setIsProfileDropdownOpen(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2 text-sm text-error-600 hover:bg-error-50 transition-colors"
                          >
                            <FaSignOutAlt className="w-4 h-4" />
                            Sign Out
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                // Guest Menu
                <>
                  <Button
                    variant="outline"
                    size="md"
                    onClick={() => navigate('/signin')}
                    className="btn-premium text-white px-6 py-2 rounded-lg hover:shadow-[0_0_30px_rgba(255,204,203,0.6)] transition-all duration-300 font-semibold text-base"
                  >
                    Sign In
                  </Button>
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => navigate('/signup')}
                    className="btn-premium text-white px-6 py-2 rounded-lg hover:shadow-[0_0_30px_rgba(255,204,203,0.6)] transition-all duration-300 font-semibold text-base"
                  >
                    Join Us
                  </Button>
                </>
              )}
            </div>
          ) : (
            // Right spacer when header is hiding - keeps layout balanced
            <div className="hidden xl:block w-[200px]"></div>
          )}

          {/* Mobile menu button */}
          <div className="xl:hidden">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-neutral-400 hover:text-neutral-500 hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
            >
              <span className="sr-only">Open main menu</span>
              {!isMobileMenuOpen ? (
                <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              ) : (
                <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <div className="xl:hidden">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-white border-t border-neutral-200">
            <button
              onClick={() => {
                if (location.pathname === '/') {
                  scrollToSection('top');
                } else {
                  navigate('/');
                }
                setIsMobileMenuOpen(false);
              }}
              className={`block w-full text-left px-3 py-2 rounded-md text-base font-medium transition-all duration-300 ${
                location.pathname === '/'
                  ? 'bg-gradient-to-r from-[#1e4e8f]/10 to-[#FFCCCB]/10 text-[#1e4e8f]'
                  : 'text-neutral-700 hover:bg-gradient-to-r hover:from-[#1e4e8f]/10 hover:to-[#FFCCCB]/10 hover:text-[#1e4e8f]'
              }`}
            >
              Home
            </button>
            <button
              onClick={() => {
                scrollToSection('footer');
                setIsMobileMenuOpen(false);
              }}
              className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-neutral-700 hover:bg-gradient-to-r hover:from-[#1e4e8f]/10 hover:to-[#FFCCCB]/10 hover:text-[#1e4e8f] transition-all duration-300"
            >
              About
            </button>
            <button
              onClick={() => {
                scrollToSection('steps');
                setIsMobileMenuOpen(false);
              }}
              className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-neutral-700 hover:bg-gradient-to-r hover:from-[#1e4e8f]/10 hover:to-[#FFCCCB]/10 hover:text-[#1e4e8f] transition-all duration-300"
            >
              How It Works
            </button>
            <button
              onClick={() => {
                scrollToSection('services');
                setIsMobileMenuOpen(false);
              }}
              className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-neutral-700 hover:bg-gradient-to-r hover:from-[#1e4e8f]/10 hover:to-[#FFCCCB]/10 hover:text-[#1e4e8f] transition-all duration-300"
            >
              Services
            </button>
          </div>
          <div className="pt-4 pb-3 border-t border-neutral-200">
            <div className="px-2 space-y-1">
              {isAuthenticated ? (
                // Authenticated Mobile Menu
                <>
                  <div className="px-3 py-3 text-base font-medium text-[#1e3a8a] bg-gradient-to-r from-[#1e4e8f]/10 to-[#FFCCCB]/10 rounded-lg mb-3">
                    <div className="flex items-center gap-3">
                      <div className="relative w-10 h-10">
                        {profilePhotoUrl && (
                          <img 
                            src={getImageUrl(profilePhotoUrl)} 
                            alt={user?.name}
                            className="w-10 h-10 rounded-full object-cover shadow-[0_0_15px_rgba(255,204,203,0.3)]"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                              if (fallback) fallback.classList.remove('hidden');
                            }}
                          />
                        )}
                        <div className={`w-10 h-10 rounded-full bg-gradient-to-r from-[#1e4e8f] to-[#1e3a8a] flex items-center justify-center text-white font-semibold shadow-[0_0_15px_rgba(255,204,203,0.3)] ${profilePhotoUrl ? 'hidden' : ''}`}>
                          {user?.name?.charAt(0).toUpperCase()}
                        </div>
                      </div>
                      <div>
                        <div className="font-semibold">{user?.name}</div>
                        <div className="text-xs text-neutral-500">{user?.email}</div>
                        <span className="inline-block mt-1 px-2 py-0.5 bg-primary-600 text-white text-xs rounded-full capitalize">
                          {user?.activeRole}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Messages */}
                  <Link
                    to="/messages"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-base font-medium text-neutral-700 hover:bg-primary-50 hover:text-primary-600"
                  >
                    <FaComments className="w-5 h-5" />
                    <span>Messages</span>
                    {unreadMessagesCount > 0 && (
                      <span className="ml-auto min-w-[20px] h-5 bg-blue-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1">
                        {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                      </span>
                    )}
                  </Link>

                  {/* Notifications */}
                  <Link
                    to="/notifications"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-base font-medium text-neutral-700 hover:bg-primary-50 hover:text-primary-600"
                  >
                    <FaBell className="w-5 h-5" />
                    <span>Notifications</span>
                  </Link>

                  {/* Dashboard */}
                  <button
                    onClick={() => {
                      navigate(user?.activeRole === 'companion' ? '/companion-dashboard' : '/client-dashboard');
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-base font-medium text-neutral-700 hover:bg-primary-50 hover:text-primary-600"
                  >
                    <FaTachometerAlt className="w-5 h-5" />
                    Dashboard
                  </button>

                  {/* My Bookings - Both Client and Companion */}
                  <Link
                    to={user?.activeRole === 'companion' ? '/companion-dashboard?tab=bookings' : '/client-dashboard?tab=bookings'}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-base font-medium text-neutral-700 hover:bg-primary-50 hover:text-primary-600"
                  >
                    <FaCalendarAlt className="w-5 h-5" />
                    My Bookings
                  </Link>

                  {/* Role Switcher - Show if user has multiple roles */}
                  {user?.roles && user.roles.length > 1 && (
                    <div className="border-t border-neutral-200 my-2 pt-2">
                      <div className="px-3 py-1 text-xs font-semibold text-neutral-500 uppercase">Switch Role</div>
                      {user.roles.filter(role => role !== user.activeRole).map((role) => (
                        <button
                          key={role}
                          onClick={() => {
                            switchRole(role as 'client' | 'companion');
                            setIsMobileMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-base font-medium text-neutral-700 hover:bg-primary-50 hover:text-primary-600"
                        >
                          <FaExchangeAlt className="w-5 h-5" />
                          Switch to {role.charAt(0).toUpperCase() + role.slice(1)}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Edit Profile */}
                  <button
                    onClick={() => {
                      if (user?.activeRole === 'companion') {
                        navigate('/companion-profile');
                      } else if (user?.activeRole === 'client') {
                        navigate('/client-profile');
                      }
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-base font-medium text-neutral-700 hover:bg-primary-50 hover:text-primary-600"
                  >
                    <FaEdit className="w-5 h-5" />
                    Edit Profile
                  </button>

                  <div className="border-t border-neutral-200 my-2"></div>

                  {/* Sign Out */}
                  <button
                    onClick={() => {
                      signOut();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-base font-medium text-white bg-error-500 hover:bg-error-600"
                  >
                    <FaSignOutAlt className="w-5 h-5" />
                    Sign Out
                  </button>
                </>
              ) : (
                // Guest Mobile Menu
                <>
                  <Button
                    variant="outline"
                    fullWidth
                    onClick={() => {
                      navigate('/signin');
                      setIsMobileMenuOpen(false);
                    }}
                    className="justify-center"
                  >
                    Sign In
                  </Button>
                  <Button
                    variant="primary"
                    fullWidth
                    onClick={() => {
                      navigate('/signup');
                      setIsMobileMenuOpen(false);
                    }}
                    className="justify-center"
                  >
                    Join Us
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      </nav>
    </>
  );
});

Navbar.displayName = 'Navbar';

export default Navbar;