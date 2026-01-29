import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import {
  FaUsers,
  FaFileAlt,
  FaDollarSign,
  FaCalendarCheck,
  FaCheck,
  FaTimes,
  FaEye,
  FaUserShield
} from 'react-icons/fa';
import { API_CONFIG, ROUTES } from '../../constants';
import { useAuth } from '../../hooks/useAuth';
import type { User } from '../../types';
import type { ApiCompanionApplication, ApiClientVerification, ApiUser, ApiDashboardStats } from '../../types/api';
import ErrorBoundary from '../../components/ErrorBoundary';
import AsyncErrorBoundary, { useAsyncError } from '../../components/AsyncErrorBoundary';
import logger, { logComponentError } from '../../utils/logger';
import DisputedBookings from '../../components/admin/DisputedBookings';
import BookingsTab from '../../components/admin/BookingsTab';
import EarningsTab from '../../components/admin/EarningsTab';
import UsersTab from '../../components/admin/UsersTab';

// Extend window interface for client verification functions
declare global {
  interface Window {
    approveClientVerification?: (id: number) => void;
    rejectClientVerification?: (id: number) => void;
  }
}

// Frontend types (camelCase)
interface DashboardStats {
  users: {
    total: number;
    clients: number;
    companions: number;
  };
  pendingApplications: number;
  pendingClientVerifications: number;
  bookings: {
    total: number;
    avgRating: number;
  };
  earnings: {
    total: number;
    commission: number;
  };
}

interface ClientVerification {
  id: number;
  userId: number;
  profilePhotoUrl?: string;
  idDocumentUrl?: string;
  dateOfBirth?: string;
  governmentIdNumber?: string;
  phoneNumber?: string;
  location?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  bio?: string;
  verificationStatus: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  createdAt: string;
  verifiedAt?: string;
  reviewedAt?: string;
  name: string;
  email: string;
}

interface Application {
  id: number;
  userId: number;
  name: string;
  email: string;
  profilePhotoUrl: string;
  governmentIdUrl: string;
  dateOfBirth: string;
  governmentIdNumber: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  createdAt: string;
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { throwError } = useAsyncError();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [clientVerifications, setClientVerifications] = useState<ClientVerification[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'applications' | 'clientVerifications' | 'users' | 'bookings' | 'earnings' | 'disputes'>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    // Check if user exists
    if (!user) {
      // User not logged in, redirect to home
      navigate(ROUTES.HOME);
      return;
    }

    // Check if user is admin
    if (user.activeRole !== 'admin') {
      toast.error('Access denied. Admin privileges required.');
      navigate(ROUTES.HOME);
      return;
    }

    // Only fetch data if user is admin
    fetchDashboardData();
  }, [user, navigate]);

  // Prevent background scroll when modals are open
  useEffect(() => {
    if (selectedApplication) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [selectedApplication]);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);

      // Fetch dashboard stats
      const statsResponse = await axios.get(`${API_CONFIG.BASE_URL}/admin/dashboard/stats`, {
        withCredentials: true
      });
      // Backend already sends stats in camelCase format
      setStats(statsResponse.data.data);

      // Fetch pending applications
      const appsResponse = await axios.get(`${API_CONFIG.BASE_URL}/admin/applications?status=pending`, {
        withCredentials: true
      });
      // Backend already transforms with transformArrayToFrontend
      setApplications(appsResponse.data.data);

      // Fetch users
      const usersResponse = await axios.get(`${API_CONFIG.BASE_URL}/admin/users`, {
        withCredentials: true
      });
      // Backend already transforms with transformArrayToFrontend
      setUsers(usersResponse.data.data);

      // Fetch client verifications
      const clientVerifsResponse = await axios.get(`${API_CONFIG.BASE_URL}/admin/client-verifications?status=pending`, {
        withCredentials: true
      });
      // Backend already transforms with transformArrayToFrontend
      setClientVerifications(clientVerifsResponse.data.data);

    } catch (error: any) {
      logComponentError('AdminDashboard', error, { action: 'fetchDashboardData' });

      // Don't show error toast if it's a 401 (user will be redirected by axios interceptor)
      if (error.response?.status !== 401) {
        toast.error(error.response?.data?.message || 'Failed to load dashboard data');
      }
      throwError(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveApplication = async (applicationId: number) => {
    try {
      await axios.put(
        `${API_CONFIG.BASE_URL}/admin/applications/${applicationId}/approve`,
        {},
        { withCredentials: true }
      );

      toast.success('Application approved successfully!');
      fetchDashboardData();
      setSelectedApplication(null);
    } catch (error: any) {
      logComponentError('AdminDashboard', error, { action: 'handleApproveApplication', applicationId });
      toast.error(error.response?.data?.message || 'Failed to approve application');
    }
  };

  const handleRejectApplication = async (applicationId: number) => {
    if (!rejectionReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }

    try {
      await axios.put(
        `${API_CONFIG.BASE_URL}/admin/applications/${applicationId}/reject`,
        { reason: rejectionReason },
        { withCredentials: true }
      );

      toast.success('Application rejected');
      fetchDashboardData();
      setSelectedApplication(null);
      setRejectionReason('');
    } catch (error: any) {
      logComponentError('AdminDashboard', error, { action: 'handleRejectApplication', applicationId });
      toast.error(error.response?.data?.message || 'Failed to reject application');
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
      fetchDashboardData();
    } catch (error: any) {
      logComponentError('AdminDashboard', error, { action: 'handleDeleteUser', userId, userName });
      toast.error(error.response?.data?.message || 'Failed to delete user');
    }
  };

  const handleApproveClientVerification = async (verificationId: number) => {
    try {
      await axios.put(
        `${API_CONFIG.BASE_URL}/admin/client-verifications/${verificationId}/approve`,
        {},
        { withCredentials: true }
      );

      toast.success('Client verification approved successfully!');
      fetchDashboardData();
    } catch (error: any) {
      logComponentError('AdminDashboard', error, { action: 'handleApproveClientVerification', verificationId });
      toast.error(error.response?.data?.message || 'Failed to approve client verification');
    }
  };

  const handleRejectClientVerification = async (verificationId: number, reason: string) => {
    if (!reason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }

    try {
      await axios.put(
        `${API_CONFIG.BASE_URL}/admin/client-verifications/${verificationId}/reject`,
        { reason },
        { withCredentials: true }
      );

      toast.success('Client verification rejected');
      fetchDashboardData();
      setRejectionReason('');
    } catch (error: any) {
      logComponentError('AdminDashboard', error, { action: 'handleRejectClientVerification', verificationId });
      toast.error(error.response?.data?.message || 'Failed to reject client verification');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#312E81] mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="flex">
        <aside className="w-64 bg-white border-r border-gray-200 min-h-screen p-4">
          <div className="flex items-center gap-3 mb-8 p-3 bg-gradient-to-r from-[#312E81] to-[#FFCCCB] rounded-lg shadow-[0_0_15px_rgba(255,204,203,0.3)]">
            <FaUserShield className="text-white text-2xl" />
            <h2 className="text-xl font-bold text-white">Admin Panel</h2>
          </div>

          <nav className="space-y-2">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                activeTab === 'dashboard'
                  ? 'bg-[#f0effe] text-[#312E81] font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <FaCalendarCheck />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('applications')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                activeTab === 'applications'
                  ? 'bg-[#f0effe] text-[#312E81] font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <FaFileAlt />
              <span>Applications</span>
              {applications.length > 0 && (
                <span className="ml-auto bg-error-500 text-white text-xs px-2 py-1 rounded-full">
                  {applications.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('clientVerifications')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                activeTab === 'clientVerifications'
                  ? 'bg-[#f0effe] text-[#312E81] font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <FaUserShield />
              <span>Client Verifications</span>
              {clientVerifications.length > 0 && (
                <span className="ml-auto bg-error-500 text-white text-xs px-2 py-1 rounded-full">
                  {clientVerifications.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('users')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                activeTab === 'users'
                  ? 'bg-[#f0effe] text-[#312E81] font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <FaUsers />
              <span>Users</span>
            </button>

            <button
              onClick={() => setActiveTab('bookings')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                activeTab === 'bookings'
                  ? 'bg-[#f0effe] text-[#312E81] font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <FaCalendarCheck />
              <span>Bookings</span>
            </button>

            <button
              onClick={() => setActiveTab('earnings')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                activeTab === 'earnings'
                  ? 'bg-[#f0effe] text-[#312E81] font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <FaDollarSign />
              <span>Earnings</span>
            </button>

            <button
              onClick={() => setActiveTab('disputes')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                activeTab === 'disputes'
                  ? 'bg-[#f0effe] text-[#312E81] font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <FaDollarSign />
              <span>Payment Disputes</span>
            </button>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8">
          {/* Dashboard Tab - Uses conditional rendering because it requires stats data */}
          {activeTab === 'dashboard' && stats && (
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
              <p className="text-gray-600 mb-8">Overview of your MeetAndGo platform</p>

              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-gray-600 font-medium">Total Users</h3>
                    <FaUsers className="text-[#312E81] text-2xl" />
                  </div>
                  <p className="text-3xl font-bold text-gray-900 mb-2">{stats.users.total}</p>
                  <p className="text-sm text-gray-500">{stats.users.clients} clients, {stats.users.companions} companions</p>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-gray-600 font-medium">Pending Applications</h3>
                    <FaFileAlt className="text-[#312E81] text-2xl" />
                  </div>
                  <p className="text-3xl font-bold text-gray-900 mb-2">{stats.pendingApplications}</p>
                  <p className="text-sm text-gray-500">Requires review</p>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-gray-600 font-medium">Pending Client Verifications</h3>
                    <FaUserShield className="text-warning-500 text-2xl" />
                  </div>
                  <p className="text-3xl font-bold text-gray-900 mb-2">{stats.pendingClientVerifications}</p>
                  <p className="text-sm text-gray-500">Awaiting approval</p>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-gray-600 font-medium">Total Earnings</h3>
                    <FaDollarSign className="text-[#312E81] text-2xl" />
                  </div>
                  <p className="text-3xl font-bold text-gray-900 mb-2">${stats.earnings.total.toFixed(2)}</p>
                  <p className="text-sm text-gray-500">Platform commission</p>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-gray-600 font-medium">Total Bookings</h3>
                    <FaCalendarCheck className="text-[#312E81] text-2xl" />
                  </div>
                  <p className="text-3xl font-bold text-gray-900 mb-2">{stats.bookings.total}</p>
                  <p className="text-sm text-gray-500">{stats.bookings.avgRating} avg rating</p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Recent Applications</h3>
                  <p className="text-gray-600 mb-4">{applications.length} applications waiting for review</p>
                  <button
                    onClick={() => setActiveTab('applications')}
                    className="w-full bg-gradient-to-r from-[#312E81] to-[#FFCCCB] text-white py-2 px-4 rounded-lg font-medium hover:shadow-[0_0_15px_rgba(255,204,203,0.3)] transition-all"
                  >
                    Review Applications
                  </button>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">User Management</h3>
                  <p className="text-gray-600 mb-4">Manage {stats.users.total} registered users</p>
                  <button
                    onClick={() => setActiveTab('users')}
                    className="w-full border-2 border-gray-300 text-gray-700 py-2 px-4 rounded-lg font-medium hover:bg-gray-50 transition-all"
                  >
                    Manage Users
                  </button>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Earnings Report</h3>
                  <p className="text-gray-600 mb-4">View detailed earnings and payments</p>
                  <button
                    onClick={() => setActiveTab('earnings')}
                    className="w-full border-2 border-gray-300 text-gray-700 py-2 px-4 rounded-lg font-medium hover:bg-gray-50 transition-all"
                  >
                    View Earnings
                  </button>
                </div>

              </div>
            </div>
          )}

          {/* Applications Tab - Keep mounted, hide with CSS */}
          <div className={activeTab === 'applications' ? '' : 'hidden'}>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-8">Companion Applications</h1>

              {applications.length === 0 ? (
                <div className="bg-white p-12 rounded-xl shadow-sm text-center">
                  <FaFileAlt className="text-gray-300 text-6xl mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">No Pending Applications</h3>
                  <p className="text-gray-600">All applications have been reviewed</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {applications.map((app) => (
                    <div key={app.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                      <div className="flex items-start justify-between">
                        <div className="flex gap-4">
                          <img
                            src={app.profilePhotoUrl ? `${API_CONFIG.BASE_URL.replace('/api', '')}${app.profilePhotoUrl}` : 'https://via.placeholder.com/100'}
                            alt={app.name}
                            className="w-20 h-20 rounded-lg object-cover"
                          />
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900">{app.name}</h3>
                            <p className="text-gray-600">{app.email}</p>
                            <p className="text-sm text-gray-500 mt-1">
                              Applied: {new Date(app.createdAt).toLocaleDateString()}
                            </p>
                            <p className="text-sm text-gray-500">
                              DOB: {new Date(app.dateOfBirth).toLocaleDateString()}
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => setSelectedApplication(app)}
                            className="px-4 py-2 bg-[#312E81] text-white rounded-lg hover:bg-[#1E1B4B] hover:shadow-[0_0_15px_rgba(255,204,203,0.3)] transition-all duration-200 flex items-center gap-2"
                          >
                            <FaEye /> View
                          </button>
                          <button
                            onClick={() => handleApproveApplication(app.id)}
                            className="px-4 py-2 bg-[#22c55e] text-white rounded-lg hover:bg-[#16a34a] hover:shadow-[0_0_15px_rgba(255,204,203,0.3)] transition-all duration-200 flex items-center gap-2"
                          >
                            <FaCheck /> Approve
                          </button>
                          <button
                            onClick={() => {
                              setSelectedApplication(app);
                              setRejectionReason('');
                            }}
                            className="px-4 py-2 bg-error-500 text-white rounded-lg hover:bg-error-600 transition-colors flex items-center gap-2"
                          >
                            <FaTimes /> Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Application Detail Modal */}
              {selectedApplication && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                  <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                    <div className="flex justify-between items-start mb-6">
                      <h2 className="text-2xl font-bold text-gray-900">Application Details</h2>
                      <button
                        onClick={() => {
                          setSelectedApplication(null);
                          setRejectionReason('');
                        }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <FaTimes size={24} />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h3 className="font-semibold text-gray-700">Personal Information</h3>
                        <p className="text-gray-900">Name: {selectedApplication.name}</p>
                        <p className="text-gray-900">Email: {selectedApplication.email}</p>
                        <p className="text-gray-900">Date of Birth: {new Date(selectedApplication.dateOfBirth).toLocaleDateString()}</p>
                        <p className="text-gray-900">Government ID: {selectedApplication.governmentIdNumber}</p>
                      </div>

                      <div>
                        <h3 className="font-semibold text-gray-700 mb-2">Profile Photo</h3>
                        <img
                          src={`${API_CONFIG.BASE_URL.replace('/api', '')}${selectedApplication.profilePhotoUrl}`}
                          alt="Profile"
                          className="w-48 h-48 rounded-lg object-cover"
                        />
                      </div>

                      <div>
                        <h3 className="font-semibold text-gray-700 mb-2">Government ID</h3>
                        <img
                          src={`${API_CONFIG.BASE_URL.replace('/api', '')}${selectedApplication.governmentIdUrl}`}
                          alt="Government ID"
                          className="w-full max-w-md rounded-lg"
                        />
                      </div>

                      <div className="pt-4 border-t">
                        <h3 className="font-semibold text-gray-700 mb-3">Rejection Reason (if rejecting)</h3>
                        <textarea
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-[#312E81] focus:border-transparent"
                          rows={3}
                          placeholder="Enter reason for rejection..."
                        />
                      </div>

                      <div className="flex gap-3 pt-4">
                        <button
                          onClick={() => handleApproveApplication(selectedApplication.id)}
                          className="flex-1 bg-green-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
                        >
                          <FaCheck /> Approve Application
                        </button>
                        <button
                          onClick={() => handleRejectApplication(selectedApplication.id)}
                          className="flex-1 bg-red-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
                        >
                          <FaTimes /> Reject Application
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Client Verifications Tab - Keep mounted, hide with CSS */}
          <div className={activeTab === 'clientVerifications' ? '' : 'hidden'}>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-8">Client Verifications</h1>

              {clientVerifications.length === 0 ? (
                <div className="bg-white p-12 rounded-xl shadow-sm text-center">
                  <FaUserShield className="text-gray-300 text-6xl mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">No Pending Verifications</h3>
                  <p className="text-gray-600">All client verifications have been reviewed</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Address</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Government ID</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {clientVerifications.map((verification) => (
                        <tr key={verification.id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              {verification.profilePhotoUrl ? (
                                <img
                                  className="h-10 w-10 rounded-full object-cover"
                                  src={`${API_CONFIG.BASE_URL.replace('/api', '')}${verification.profilePhotoUrl}`}
                                  alt={verification.name}
                                />
                              ) : (
                                <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                                  <FaUsers className="text-gray-500" />
                                </div>
                              )}
                              <div className="ml-4">
                                <div className="text-sm font-medium text-gray-900">{verification.name}</div>
                                <div className="text-sm text-gray-500">ID: {verification.userId}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {verification.email}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            <div>
                              {verification.addressLine && <div>{verification.addressLine}</div>}
                              <div>
                                {verification.city}{verification.city && verification.state && ', '}
                                {verification.state}{verification.state && verification.country && ', '}
                                {verification.country}
                              </div>
                              {verification.postalCode && <div>{verification.postalCode}</div>}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {verification.governmentIdNumber}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(verification.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  // View details in modal
                                  const modal = document.createElement('div');
                                  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50';
                                  modal.innerHTML = `
                                    <div class="bg-white rounded-xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
                                      <div class="flex justify-between items-start mb-6">
                                        <h2 class="text-2xl font-bold text-gray-900">Client Verification Details</h2>
                                        <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-gray-600">
                                          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                                          </svg>
                                        </button>
                                      </div>
                                      <div class="space-y-4">
                                        <div>
                                          <h3 class="font-semibold text-gray-700">Client Information</h3>
                                          <p>Name: ${verification.name}</p>
                                          <p>Email: ${verification.email}</p>
                                          <p>Date of Birth: ${verification.dateOfBirth ? new Date(verification.dateOfBirth).toLocaleDateString() : 'Not provided'}</p>
                                          <p>Government ID: ${verification.governmentIdNumber}</p>
                                          <p>Phone: ${verification.phoneNumber || 'Not provided'}</p>
                                        </div>
                                        <div>
                                          <h3 class="font-semibold text-gray-700">Address</h3>
                                          <p>${verification.addressLine || ''}</p>
                                          <p>${verification.city || ''} ${verification.state || ''}</p>
                                          <p>${verification.country || ''} ${verification.postalCode || ''}</p>
                                        </div>
                                        ${verification.idDocumentUrl ? `
                                          <div>
                                            <h3 class="font-semibold text-gray-700 mb-2">ID Document</h3>
                                            <img src="${API_CONFIG.BASE_URL.replace('/api', '')}${verification.idDocumentUrl}" alt="ID Document" class="max-w-full rounded-lg" />
                                          </div>
                                        ` : ''}
                                        <div class="pt-4 border-t">
                                          <label class="block font-semibold text-gray-700 mb-2">Rejection Reason (if rejecting)</label>
                                          <textarea
                                            id="rejection-reason-${verification.id}"
                                            class="w-full border border-gray-300 rounded-lg p-3"
                                            rows="3"
                                            placeholder="Enter reason for rejection..."
                                          ></textarea>
                                        </div>
                                        <div class="flex gap-3 pt-4">
                                          <button
                                            onclick="window.approveClientVerification(${verification.id}); this.closest('.fixed').remove();"
                                            class="flex-1 bg-green-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-600"
                                          >
                                            Approve
                                          </button>
                                          <button
                                            onclick="window.rejectClientVerification(${verification.id}); this.closest('.fixed').remove();"
                                            class="flex-1 bg-red-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-red-600"
                                          >
                                            Reject
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  `;
                                  document.body.appendChild(modal);

                                  // Add global functions for approval/rejection
                                  if (!window.approveClientVerification) {
                                    window.approveClientVerification = (id: number) => {
                                      handleApproveClientVerification(id);
                                    };
                                  }
                                  if (!window.rejectClientVerification) {
                                    window.rejectClientVerification = (id: number) => {
                                      const textarea = document.getElementById(`rejection-reason-${id}`) as HTMLTextAreaElement;
                                      handleRejectClientVerification(id, textarea?.value || '');
                                    };
                                  }
                                }}
                                className="text-[#312E81] hover:text-[#1E1B4B]"
                              >
                                <FaEye />
                              </button>
                              <button
                                onClick={() => handleApproveClientVerification(verification.id)}
                                className="text-green-600 hover:text-green-900"
                              >
                                <FaCheck />
                              </button>
                              <button
                                onClick={() => {
                                  const reason = prompt('Enter rejection reason:');
                                  if (reason) {
                                    handleRejectClientVerification(verification.id, reason);
                                  }
                                }}
                                className="text-red-600 hover:text-red-900"
                              >
                                <FaTimes />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Users Tab - Keep mounted, hide with CSS */}
          <div className={activeTab === 'users' ? '' : 'hidden'}>
            <UsersTab />
          </div>

          {/* Bookings Tab - Keep mounted, hide with CSS */}
          <div className={activeTab === 'bookings' ? '' : 'hidden'}>
            <BookingsTab />
          </div>

          {/* Earnings Tab - Keep mounted, hide with CSS */}
          <div className={activeTab === 'earnings' ? '' : 'hidden'}>
            <EarningsTab />
          </div>

          {/* Payment Disputes Tab - Keep mounted, hide with CSS */}
          <div className={activeTab === 'disputes' ? '' : 'hidden'}>
            <DisputedBookings />
          </div>
        </main>
      </div>
    </div>
  );
};

const AdminDashboardWithErrorBoundary = () => (
  <ErrorBoundary level="page" showDetails={false}>
    <AsyncErrorBoundary maxRetries={3} retryDelay={1000}>
      <AdminDashboard />
    </AsyncErrorBoundary>
  </ErrorBoundary>
);

export default AdminDashboardWithErrorBoundary;

