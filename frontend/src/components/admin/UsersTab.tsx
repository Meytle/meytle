/**
 * Admin Users Tab Component
 * Enhanced user management with search, filters, and ban/unban functionality
 */

import { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import {
  FaUsers,
  FaSearch,
  FaFilter,
  FaBan,
  FaCheck,
  FaTrash,
  FaTimes,
  FaChevronLeft,
  FaChevronRight,
  FaStar,
  FaCalendarCheck
} from 'react-icons/fa';
import { API_CONFIG } from '../../constants';
import { adminApi, type EnhancedUser, type BannedUser } from '../../api/admin';

type SubTab = 'all' | 'banned';

const UsersTab = () => {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('all');
  const [users, setUsers] = useState<EnhancedUser[]>([]);
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 20,
    offset: 0
  });

  // Ban Modal
  const [showBanModal, setShowBanModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<EnhancedUser | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState<string>('permanent');

  useEffect(() => {
    if (activeSubTab === 'all') {
      fetchUsers();
    } else {
      fetchBannedUsers();
    }
  }, [activeSubTab, roleFilter, statusFilter, pagination.offset]);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const data = await adminApi.getUsersEnhanced({
        role: roleFilter || undefined,
        status: statusFilter || undefined,
        search: searchTerm || undefined,
        limit: pagination.limit,
        offset: pagination.offset
      });
      setUsers(data.users);
      setPagination(prev => ({ ...prev, total: data.pagination.total }));
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBannedUsers = async () => {
    try {
      setIsLoading(true);
      const data = await adminApi.getBannedUsers();
      setBannedUsers(data);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to load banned users');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = () => {
    setPagination(prev => ({ ...prev, offset: 0 }));
    fetchUsers();
  };

  const handleBanUser = async () => {
    if (!selectedUser || !banReason.trim()) {
      toast.error('Please provide a ban reason');
      return;
    }

    try {
      const durationDays = banDuration === 'permanent' ? undefined : parseInt(banDuration);
      await adminApi.banUser(selectedUser.id, banReason, durationDays);
      toast.success(`User ${banDuration === 'permanent' ? 'permanently banned' : `suspended for ${banDuration} days`}`);
      setShowBanModal(false);
      setSelectedUser(null);
      setBanReason('');
      setBanDuration('permanent');
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to ban user');
    }
  };

  const handleUnbanUser = async (userId: number, userName: string) => {
    if (!confirm(`Are you sure you want to unban ${userName}?`)) {
      return;
    }

    try {
      await adminApi.unbanUser(userId);
      toast.success('User unbanned successfully');
      if (activeSubTab === 'banned') {
        fetchBannedUsers();
      } else {
        fetchUsers();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to unban user');
    }
  };

  const handleDeleteUser = async (userId: number, userName: string) => {
    if (!confirm(`Are you sure you want to delete user "${userName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await axios.delete(`${API_CONFIG.BASE_URL}/admin/users/${userId}`, {
        withCredentials: true
      });
      toast.success('User deleted successfully');
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete user');
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-purple-100 text-purple-800';
      case 'companion': return 'bg-blue-100 text-blue-800';
      case 'client': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const totalPages = Math.ceil(pagination.total / pagination.limit);
  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;

  if (isLoading && users.length === 0 && bannedUsers.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-[#312E81]"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">User Management</h1>
      <p className="text-gray-600 mb-8">Manage users, view details, and handle suspensions</p>

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveSubTab('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeSubTab === 'all'
              ? 'bg-[#312E81] text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <FaUsers className="inline mr-2" />
          All Users
        </button>
        <button
          onClick={() => setActiveSubTab('banned')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeSubTab === 'banned'
              ? 'bg-[#312E81] text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <FaBan className="inline mr-2" />
          Banned Users
          {bannedUsers.length > 0 && (
            <span className="ml-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">
              {bannedUsers.length}
            </span>
          )}
        </button>
      </div>

      {/* All Users Tab */}
      {activeSubTab === 'all' && (
        <div>
          {/* Filters */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <FaFilter className="text-gray-400" />
                <span className="text-gray-600 font-medium">Filters:</span>
              </div>

              <select
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setPagination(prev => ({ ...prev, offset: 0 }));
                }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#312E81] focus:border-transparent"
              >
                <option value="">All Roles</option>
                <option value="client">Clients</option>
                <option value="companion">Companions</option>
                <option value="admin">Admins</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPagination(prev => ({ ...prev, offset: 0 }));
                }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#312E81] focus:border-transparent"
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="banned">Banned</option>
              </select>

              <div className="flex-1 min-w-[200px] flex gap-2">
                <div className="relative flex-1">
                  <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by name or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#312E81] focus:border-transparent"
                  />
                </div>
                <button
                  onClick={handleSearch}
                  className="px-4 py-2 bg-[#312E81] text-white rounded-lg hover:bg-[#1E1B4B] transition-colors"
                >
                  Search
                </button>
              </div>
            </div>
          </div>

          {/* Users Table */}
          {users.length === 0 ? (
            <div className="bg-white p-12 rounded-xl shadow-sm text-center">
              <FaUsers className="text-gray-300 text-6xl mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Users Found</h3>
              <p className="text-gray-600">No users match your current filters</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bookings</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rating</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Joined</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {users.map((user) => (
                        <tr key={user.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                                <FaUsers className="text-gray-500" />
                              </div>
                              <div>
                                <div className="text-sm font-medium text-gray-900">{user.name}</div>
                                <div className="text-xs text-gray-500">{user.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getRoleBadgeColor(user.role)}`}>
                              {user.role}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {user.isBanned ? (
                              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                                Banned
                              </span>
                            ) : (
                              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                                Active
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <FaCalendarCheck className="text-gray-400" />
                              {user.totalBookings || 0}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {user.averageRating ? (
                              <div className="flex items-center gap-1 text-sm">
                                <FaStar className="text-yellow-400" />
                                {user.averageRating.toFixed(1)}
                                <span className="text-gray-400">({user.reviewCount})</span>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-sm">N/A</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {new Date(user.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {user.role !== 'admin' && (
                                <>
                                  {user.isBanned ? (
                                    <button
                                      onClick={() => handleUnbanUser(user.id, user.name)}
                                      className="text-green-600 hover:text-green-800 p-1"
                                      title="Unban User"
                                    >
                                      <FaCheck />
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        setSelectedUser(user);
                                        setShowBanModal(true);
                                      }}
                                      className="text-red-600 hover:text-red-800 p-1"
                                      title="Ban User"
                                    >
                                      <FaBan />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDeleteUser(user.id, user.name)}
                                    className="text-gray-400 hover:text-gray-600 p-1"
                                    title="Delete User"
                                  >
                                    <FaTrash />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <p className="text-sm text-gray-600">
                  Showing {pagination.offset + 1} to {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total} users
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    <FaChevronLeft />
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {currentPage} of {totalPages || 1}
                  </span>
                  <button
                    onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
                    disabled={currentPage >= totalPages}
                    className="px-3 py-1 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    <FaChevronRight />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Banned Users Tab */}
      {activeSubTab === 'banned' && (
        <div>
          {bannedUsers.length === 0 ? (
            <div className="bg-white p-12 rounded-xl shadow-sm text-center">
              <FaBan className="text-gray-300 text-6xl mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Banned Users</h3>
              <p className="text-gray-600">No users are currently banned</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ban Reason</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Banned At</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expires</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Banned By</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {bannedUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900">{user.name}</div>
                          <div className="text-xs text-gray-500">{user.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getRoleBadgeColor(user.role)}`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                          {user.banReason}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {new Date(user.bannedAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {user.banExpiresAt ? (
                            <span className="text-yellow-600">
                              {new Date(user.banExpiresAt).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-red-600 font-medium">Permanent</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {user.bannedByName}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleUnbanUser(user.id, user.name)}
                            className="px-3 py-1 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm font-medium"
                          >
                            Unban
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ban Modal */}
      {showBanModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <div className="flex justify-between items-start mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Ban User</h2>
              <button
                onClick={() => {
                  setShowBanModal(false);
                  setSelectedUser(null);
                  setBanReason('');
                  setBanDuration('permanent');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <FaTimes size={24} />
              </button>
            </div>

            <p className="text-gray-600 mb-4">
              You are about to ban <strong>{selectedUser.name}</strong> ({selectedUser.email}).
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ban Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-[#312E81] focus:border-transparent"
                  rows={3}
                  placeholder="Enter reason for banning this user..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ban Duration
                </label>
                <select
                  value={banDuration}
                  onChange={(e) => setBanDuration(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-[#312E81] focus:border-transparent"
                >
                  <option value="permanent">Permanent</option>
                  <option value="1">1 Day</option>
                  <option value="7">7 Days</option>
                  <option value="30">30 Days</option>
                  <option value="90">90 Days</option>
                  <option value="365">1 Year</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-6">
              <button
                onClick={() => {
                  setShowBanModal(false);
                  setSelectedUser(null);
                  setBanReason('');
                  setBanDuration('permanent');
                }}
                className="flex-1 border-2 border-gray-300 text-gray-700 py-2 px-4 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBanUser}
                className="flex-1 bg-red-500 text-white py-2 px-4 rounded-lg font-medium hover:bg-red-600 transition-colors"
              >
                Ban User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersTab;
