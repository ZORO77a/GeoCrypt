import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Clock, FileText, Download, Eye, Calendar, User, MapPin, Wifi } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function CheckInTracking() {
  const [activeView, setActiveView] = useState('employees'); // 'employees' or 'files'
  const [checkIns, setCheckIns] = useState([]);
  const [fileAccess, setFileAccess] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    date: new Date().toISOString().split('T')[0],
    employee: 'all',
    status: 'all'
  });
  const [fileFilters, setFileFilters] = useState({
    date: new Date().toISOString().split('T')[0],
    file: 'all',
    employee: 'all'
  });
  const [selectedCheckIn, setSelectedCheckIn] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const token = localStorage.getItem('token');

  useEffect(() => {
    loadAllData();
  }, [token]);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };

      // Load employees, check-ins, and file access data
      const [empRes, checkInRes, fileAccessRes] = await Promise.all([
        axios.get(`${API}/admin/employees`, { headers }),
        axios.get(`${API}/admin/check-ins`, { headers }),
        axios.get(`${API}/admin/file-access`, { headers })
      ]);

      setEmployees(empRes.data);
      setCheckIns(checkInRes.data);
      setFileAccess(fileAccessRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
      // If endpoints don't exist, fallback to access logs
      loadFallbackData();
    } finally {
      setLoading(false);
    }
  };

  const loadFallbackData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [empRes, logsRes, filesRes] = await Promise.all([
        axios.get(`${API}/admin/employees`, { headers }),
        axios.get(`${API}/admin/access-logs`, { headers }),
        axios.get(`${API}/files`, { headers })
      ]);

      setEmployees(empRes.data);

      // Parse logs into check-ins (login events) and file access
      const logs = logsRes.data;
      const checkInLogs = logs.filter(
        log => log.action === 'login' && log.success === true
      );
      const fileAccessLogs = logs.filter(
        log => log.action === 'access' || log.action === 'download'
      );

      setCheckIns(checkInLogs);
      setFileAccess(fileAccessLogs);
    } catch (error) {
      toast.error('Failed to load data');
    }
  };

  // Filter check-ins based on selected filters
  const filteredCheckIns = checkIns.filter(checkIn => {
    const checkInDate = new Date(checkIn.timestamp).toISOString().split('T')[0];
    const dateMatch = checkInDate === filters.date;
    const employeeMatch = filters.employee === 'all' || checkIn.employee_username === filters.employee;
    const statusMatch = filters.status === 'all' || (filters.status === 'success' ? checkIn.success : !checkIn.success);
    return dateMatch && employeeMatch && statusMatch;
  });

  // Filter file access based on selected filters
  const filteredFileAccess = fileAccess.filter(access => {
    const accessDate = new Date(access.timestamp).toISOString().split('T')[0];
    const dateMatch = accessDate === fileFilters.date;
    const fileMatch = fileFilters.file === 'all' || access.filename === fileFilters.file;
    const employeeMatch = fileFilters.employee === 'all' || access.employee_username === fileFilters.employee;
    return dateMatch && fileMatch && employeeMatch;
  });

  const uniqueFiles = [...new Set(fileAccess.map(f => f.filename))].filter(Boolean);

  // Get stats
  const todayCheckIns = filteredCheckIns.length;
  const successfulCheckIns = filteredCheckIns.filter(c => c.success).length;
  const failedCheckIns = filteredCheckIns.filter(c => !c.success).length;
  const activeEmployeesToday = new Set(
    filteredCheckIns.filter(c => c.success).map(c => c.employee_username)
  ).size;

  const handleViewDetails = (checkIn) => {
    setSelectedCheckIn(checkIn);
    setDetailsOpen(true);
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Check-In Tracking</h1>
        <p className="text-gray-600">Monitor employee check-ins and file access activities</p>
      </div>

      {/* View Selector */}
      <div className="flex gap-3 mb-6 border-b">
        <button
          onClick={() => setActiveView('employees')}
          className={`px-4 py-2 font-medium transition ${
            activeView === 'employees'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Employee Check-ins
        </button>
        <button
          onClick={() => setActiveView('files')}
          className={`px-4 py-2 font-medium transition ${
            activeView === 'files'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          File Access Log
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : activeView === 'employees' ? (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Total Check-ins</p>
                  <p className="text-2xl font-bold text-gray-800">{todayCheckIns}</p>
                </div>
                <Clock className="w-8 h-8 text-blue-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Successful</p>
                  <p className="text-2xl font-bold text-green-600">{successfulCheckIns}</p>
                </div>
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Failed</p>
                  <p className="text-2xl font-bold text-red-600">{failedCheckIns}</p>
                </div>
                <XCircle className="w-8 h-8 text-red-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Active Employees</p>
                  <p className="text-2xl font-bold text-purple-600">{activeEmployeesToday}</p>
                </div>
                <User className="w-8 h-8 text-purple-500" />
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                <input
                  type="date"
                  value={filters.date}
                  onChange={(e) => setFilters({ ...filters, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Employee</label>
                <select
                  value={filters.employee}
                  onChange={(e) => setFilters({ ...filters, employee: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Employees</option>
                  {employees.map(emp => (
                    <option key={emp.username} value={emp.username}>
                      {emp.username}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Status</option>
                  <option value="success">Successful</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
            </div>
          </div>

          {/* Check-ins Table */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Employee</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Check-in Time</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Location</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">WiFi SSID</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredCheckIns.length > 0 ? (
                    filteredCheckIns.map((checkIn, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm text-gray-900 font-medium">{checkIn.employee_username}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          <div>{formatDate(checkIn.timestamp)}</div>
                          <div className="text-gray-500">{formatTime(checkIn.timestamp)}</div>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
                            checkIn.success
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {checkIn.success ? (
                              <><CheckCircle2 className="w-4 h-4" /> Successful</>
                            ) : (
                              <><XCircle className="w-4 h-4" /> Failed</>
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {checkIn.location ? (
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-gray-400" />
                              <span>{checkIn.location.latitude?.toFixed(4)}, {checkIn.location.longitude?.toFixed(4)}</span>
                            </div>
                          ) : (
                            <span className="text-gray-400">N/A</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {checkIn.wifi_ssid ? (
                            <div className="flex items-center gap-2">
                              <Wifi className="w-4 h-4 text-gray-400" />
                              <span>{checkIn.wifi_ssid}</span>
                            </div>
                          ) : (
                            <span className="text-gray-400">N/A</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => handleViewDetails(checkIn)}
                            className="inline-flex items-center gap-2 px-3 py-1 text-blue-600 hover:bg-blue-50 rounded transition"
                          >
                            <Eye className="w-4 h-4" />
                            <span>Details</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                        No check-ins found for the selected filters
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Details Modal */}
          {detailsOpen && selectedCheckIn && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">Check-in Details</h2>
                
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-600">Employee</p>
                    <p className="font-semibold text-gray-800">{selectedCheckIn.employee_username}</p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-600">Timestamp</p>
                    <p className="font-semibold text-gray-800">
                      {formatDate(selectedCheckIn.timestamp)} {formatTime(selectedCheckIn.timestamp)}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-600">Status</p>
                    <p className={`font-semibold ${selectedCheckIn.success ? 'text-green-600' : 'text-red-600'}`}>
                      {selectedCheckIn.success ? 'Successful' : 'Failed'}
                    </p>
                  </div>

                  {selectedCheckIn.reason && (
                    <div>
                      <p className="text-sm text-gray-600">Reason</p>
                      <p className="font-semibold text-gray-800">{selectedCheckIn.reason}</p>
                    </div>
                  )}

                  {selectedCheckIn.location && (
                    <div>
                      <p className="text-sm text-gray-600">Location</p>
                      <p className="font-semibold text-gray-800">
                        Lat: {selectedCheckIn.location.latitude?.toFixed(6)}, Lon: {selectedCheckIn.location.longitude?.toFixed(6)}
                      </p>
                    </div>
                  )}

                  {selectedCheckIn.wifi_ssid && (
                    <div>
                      <p className="text-sm text-gray-600">WiFi Network</p>
                      <p className="font-semibold text-gray-800">{selectedCheckIn.wifi_ssid}</p>
                    </div>
                  )}

                  {selectedCheckIn.user_agent && (
                    <div>
                      <p className="text-sm text-gray-600">User Agent</p>
                      <p className="text-xs text-gray-600 truncate">{selectedCheckIn.user_agent}</p>
                    </div>
                  )}

                  {selectedCheckIn.ip_address && (
                    <div>
                      <p className="text-sm text-gray-600">IP Address</p>
                      <p className="font-semibold text-gray-800">{selectedCheckIn.ip_address}</p>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setDetailsOpen(false)}
                  className="mt-6 w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* File Access Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Total Access Events</p>
                  <p className="text-2xl font-bold text-gray-800">{filteredFileAccess.length}</p>
                </div>
                <FileText className="w-8 h-8 text-orange-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Unique Files Accessed</p>
                  <p className="text-2xl font-bold text-gray-800">{new Set(filteredFileAccess.map(f => f.filename)).size}</p>
                </div>
                <FileText className="w-8 h-8 text-indigo-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Employees with Access</p>
                  <p className="text-2xl font-bold text-gray-800">{new Set(filteredFileAccess.map(f => f.employee_username)).size}</p>
                </div>
                <User className="w-8 h-8 text-teal-500" />
              </div>
            </div>
          </div>

          {/* File Access Filters */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                <input
                  type="date"
                  value={fileFilters.date}
                  onChange={(e) => setFileFilters({ ...fileFilters, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">File</label>
                <select
                  value={fileFilters.file}
                  onChange={(e) => setFileFilters({ ...fileFilters, file: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Files</option>
                  {uniqueFiles.map(file => (
                    <option key={file} value={file}>
                      {file}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Employee</label>
                <select
                  value={fileFilters.employee}
                  onChange={(e) => setFileFilters({ ...fileFilters, employee: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Employees</option>
                  {employees.map(emp => (
                    <option key={emp.username} value={emp.username}>
                      {emp.username}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* File Access Table */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Employee</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">File Name</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Access Time</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Action</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Success</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredFileAccess.length > 0 ? (
                    filteredFileAccess.map((access, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm text-gray-900 font-medium">{access.employee_username}</td>
                        <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">{access.filename || 'Unknown'}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          <div>{formatDate(access.timestamp)}</div>
                          <div className="text-gray-500">{formatTime(access.timestamp)}</div>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            {access.action === 'download' ? (
                              <><Download className="w-3 h-3" /> Download</>
                            ) : (
                              <><Eye className="w-3 h-3" /> Access</>
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                            access.success
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {access.success ? (
                              <><CheckCircle2 className="w-3 h-3" /> Success</>
                            ) : (
                              <><XCircle className="w-3 h-3" /> Failed</>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                        No file access records found for the selected filters
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default CheckInTracking;
