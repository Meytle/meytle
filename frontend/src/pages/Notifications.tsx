import React, { useState, useEffect, useCallback } from 'react';
import { FaBell, FaCheck, FaTrash, FaFilter, FaClock } from 'react-icons/fa';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import notificationApi from '../api/notifications';
import type { Notification } from '../api/notifications';
import toast from 'react-hot-toast';
import { ROUTES } from '../constants';
import { formatRelativeTime } from '../utils/dateHelpers';

const Notifications: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'booking' | 'application' | 'payment' | 'account' | 'system'>('all');
  const [selectedNotifications, setSelectedNotifications] = useState<number[]>([]);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) return;

    setLoading(true);
    try {
      const response = await notificationApi.getNotifications(100, 0);
      setNotifications(response.data.notifications);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Mark notification as read
  const markAsRead = async (notificationId: number) => {
    try {
      await notificationApi.markAsRead(notificationId);
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
      );
      toast.success('Marked as read');
    } catch (error) {
      console.error('Failed to mark as read:', error);
      toast.error('Failed to mark as read');
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    try {
      await notificationApi.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      toast.success('All notifications marked as read');
    } catch (error) {
      console.error('Failed to mark all as read:', error);
      toast.error('Failed to mark all as read');
    }
  };

  // Delete notification
  const deleteNotification = async (notificationId: number) => {
    try {
      await notificationApi.deleteNotification(notificationId);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      toast.success('Notification deleted');
    } catch (error) {
      console.error('Failed to delete notification:', error);
      toast.error('Failed to delete notification');
    }
  };

  // Delete selected notifications
  const deleteSelected = async () => {
    try {
      await Promise.all(selectedNotifications.map(id => notificationApi.deleteNotification(id)));
      setNotifications(prev => prev.filter(n => !selectedNotifications.includes(n.id)));
      setSelectedNotifications([]);
      toast.success(`${selectedNotifications.length} notifications deleted`);
    } catch (error) {
      console.error('Failed to delete notifications:', error);
      toast.error('Failed to delete notifications');
    }
  };

  // Toggle notification selection
  const toggleSelection = (notificationId: number) => {
    setSelectedNotifications(prev =>
      prev.includes(notificationId)
        ? prev.filter(id => id !== notificationId)
        : [...prev, notificationId]
    );
  };

  // Handle notification click
  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markAsRead(notification.id);
    }
    if (notification.actionUrl) {
      navigate(notification.actionUrl);
    }
  };

  // Format timestamp with validation
  const formatTime = (timestamp: string) => {
    return formatRelativeTime(timestamp);
  };

  // Get notification icon color
  const getIconColor = (type: string) => {
    switch(type) {
      case 'application': return 'text-[#312E81]';
      case 'booking': return 'text-[#FFCCCB]';
      case 'payment': return 'text-green-500';
      case 'account': return 'text-[#312E81]';
      case 'system': return 'text-orange-500';
      default: return 'text-gray-500';
    }
  };

  // Filter notifications
  const filteredNotifications = notifications.filter(n => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !n.isRead;
    return n.type === filter;
  });

  // Get dashboard route based on user role
  const getDashboardRoute = () => {
    if (!user) return ROUTES.HOME;
    switch (user.activeRole) {
      case 'admin':
        return ROUTES.ADMIN_DASHBOARD;
      case 'companion':
        return ROUTES.COMPANION_DASHBOARD;
      case 'client':
        return ROUTES.CLIENT_DASHBOARD;
      default:
        return '/dashboard'; // Will use the redirect route
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Notifications</h1>
              <p className="mt-1 text-sm text-gray-500">Manage and view all your notifications</p>
            </div>
            <button
              onClick={() => navigate(getDashboardRoute())}
              className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium transition-colors"
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Action Buttons */}
        {(selectedNotifications.length > 0 || notifications.some(n => !n.isRead)) && (
          <div className="flex justify-end gap-2 mb-4">
            {selectedNotifications.length > 0 && (
              <button
                onClick={deleteSelected}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                <FaTrash className="inline mr-2" />
                Delete Selected ({selectedNotifications.length})
              </button>
            )}
            {notifications.some(n => !n.isRead) && (
              <button
                onClick={markAllAsRead}
                className="px-4 py-2 bg-[#312E81] text-white rounded-lg hover:bg-[#1E1B4B] hover:shadow-[0_0_15px_rgba(255,204,203,0.3)] transition-colors"
              >
                <FaCheck className="inline mr-2" />
                Mark All as Read
              </button>
            )}
          </div>
        )}

        {/* Filter Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          {/* Filter Tabs */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-[#312E81] text-white shadow-[0_0_15px_rgba(255,204,203,0.3)]'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === 'unread'
                  ? 'bg-[#312E81] text-white shadow-[0_0_15px_rgba(255,204,203,0.3)]'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Unread ({notifications.filter(n => !n.isRead).length})
            </button>
            <span className="text-gray-400 mx-2">|</span>
            <button
              onClick={() => setFilter('booking')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === 'booking'
                  ? 'bg-[#FFCCCB] text-white shadow-[0_0_15px_rgba(255,204,203,0.3)]'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Bookings
            </button>
            <button
              onClick={() => setFilter('application')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === 'application'
                  ? 'bg-[#312E81] text-white shadow-[0_0_15px_rgba(255,204,203,0.3)]'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Applications
            </button>
            <button
              onClick={() => setFilter('payment')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === 'payment'
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Payments
            </button>
            <button
              onClick={() => setFilter('account')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === 'account'
                  ? 'bg-[#312E81] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Account
            </button>
            <button
              onClick={() => setFilter('system')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === 'system'
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              System
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#312E81]"></div>
              <p className="text-gray-500 mt-4">Loading notifications...</p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="p-12 text-center">
              <FaBell className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">No notifications to show</p>
              <p className="text-gray-400 text-sm mt-2">
                {filter === 'unread' ? 'All notifications are read' : 'You don\'t have any notifications yet'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 hover:bg-gray-50 transition-colors ${
                    !notification.isRead ? 'bg-[#f0effe] border-l-4 border-[#312E81]' : ''
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={selectedNotifications.includes(notification.id)}
                      onChange={() => toggleSelection(notification.id)}
                      className="mt-1 w-4 h-4 text-[#312E81] rounded focus:ring-[#312E81]"
                    />

                    {/* Icon */}
                    <div className={`p-2 rounded-full bg-gray-100 ${getIconColor(notification.type)}`}>
                      <FaBell className="w-4 h-4" />
                    </div>

                    {/* Content */}
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className={`font-semibold ${notification.isRead ? 'text-gray-700' : 'text-gray-900'}`}>
                            {notification.title}
                          </h3>
                          <p className="text-gray-600 text-sm mt-1">{notification.message}</p>
                          <div className="flex items-center gap-4 mt-2">
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <FaClock className="w-3 h-3" />
                              {formatTime(notification.createdAt)}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              notification.isRead
                                ? 'bg-gray-100 text-gray-600'
                                : 'bg-[#f0effe] text-[#312E81]'
                            }`}>
                              {notification.isRead ? 'Read' : 'Unread'}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                              {notification.type}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                          {!notification.isRead && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                markAsRead(notification.id);
                              }}
                              className="p-2 text-gray-400 hover:text-[#312E81] hover:bg-[#f0effe] rounded transition-colors"
                              title="Mark as read"
                            >
                              <FaCheck className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotification(notification.id);
                            }}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                            title="Delete"
                          >
                            <FaTrash className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Notifications;