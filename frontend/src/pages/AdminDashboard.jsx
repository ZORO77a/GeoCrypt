import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { FileText, Users, Activity, AlertTriangle, Settings, LogOut, Upload, Brain, TrendingUp, Shield } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import FileService from '@/utils/fileService';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function AdminDashboard() {
  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem('adminActiveTab');
    return saved || 'overview';
  });
  const [employees, setEmployees] = useState([]);
  const [accessLogs, setAccessLogs] = useState([]);
  const [wfhRequests, setWfhRequests] = useState([]);
  const [files, setFiles] = useState([]);
  const [geofenceConfig, setGeofenceConfig] = useState(null);
  const [suspiciousAnalysis, setSuspiciousAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [newEmployee, setNewEmployee] = useState({ username: '', email: '', password: '' });
  const [selectedFile, setSelectedFile] = useState(null);
  const [logFilter, setLogFilter] = useState(null);
  const navigate = useNavigate();
  const activeTabRef = useRef('overview');

  const token = localStorage.getItem('token');
  const username = localStorage.getItem('username');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  
  // Initialize FileService
  const fileService = new FileService(token);

  // File viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerFile, setViewerFile] = useState(null);
  const [viewerContent, setViewerContent] = useState('');
  const [viewerBlob, setViewerBlob] = useState(null);
  const [viewerExpiry, setViewerExpiry] = useState(null);
  const [pdfDataUrl, setPdfDataUrl] = useState(null);

  // Persist active tab to localStorage and update ref
  useEffect(() => {
    localStorage.setItem('adminActiveTab', activeTab);
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // Handle browser back button
  useEffect(() => {
    // Push a new state to prevent going back to OTP/login page
    window.history.pushState(null, null, window.location.pathname);

    const handlePopState = () => {
      // Check if on overview tab
      if (activeTabRef.current === 'overview') {
        // Show logout confirmation
        setShowLogoutConfirm(true);
        // Push state again to prevent going back
        window.history.pushState(null, null, window.location.pathname);
      } else {
        // Go back to overview tab instead of previous page
        setActiveTab('overview');
        window.history.pushState(null, null, window.location.pathname);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Convert PDF blob to data URL for viewing
  useEffect(() => {
    if (viewerBlob && viewerFile && viewerFile.filename.toLowerCase().endsWith('.pdf')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPdfDataUrl(e.target.result);
      };
      reader.readAsDataURL(viewerBlob);
    } else {
      setPdfDataUrl(null);
    }
  }, [viewerBlob, viewerFile]);

  useEffect(() => {
    if (!token) {
      navigate('/admin/login');
      return;
    }
    loadData();
  }, [token]);

  const loadData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      const [employeesRes, logsRes, wfhRes, filesRes, configRes] = await Promise.all([
        axios.get(`${API}/admin/employees`, { headers }),
        axios.get(`${API}/admin/access-logs`, { headers }),
        axios.get(`${API}/admin/wfh-requests`, { headers }),
        axios.get(`${API}/files`, { headers }),
        axios.get(`${API}/admin/geofence-config`, { headers })
      ]);

      setEmployees(employeesRes.data);
      setAccessLogs(logsRes.data);
      setWfhRequests(wfhRes.data);
      setFiles(filesRes.data);
      setGeofenceConfig(configRes.data);
    } catch (error) {
      toast.error('Failed to load data');
    }
  };

  const loadAISuspiciousAnalysis = async () => {
    try {
      setAnalysisLoading(true);
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.get(`${API}/admin/suspicious-activities`, { headers });
      setSuspiciousAnalysis(response.data);
      toast.success('AI analysis completed');
    } catch (error) {
      toast.error('Failed to load AI analysis');
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    localStorage.clear();
    navigate('/admin/login');
  };

  const handleFileView = async (file) => {
    try {
      const result = await fileService.accessFile(file.file_id);

      if (!result.success) {
        toast.error(result.error || 'Access denied');
        return;
      }

      const fileType = fileService.getFileType(file.filename);
      
      setViewerFile(file);
      setViewerBlob(result.data);
      
      // Only convert to text for text files
      if (fileType.isText) {
        const text = await fileService.blobToText(result.data);
        setViewerContent(text);
      } else {
        setViewerContent('');
      }
      
      // Admin has no time limit - set expiry to far future (24 hours)
      const expiryTime = new Date();
      expiryTime.setHours(expiryTime.getHours() + 24);
      setViewerExpiry(expiryTime);
      setViewerOpen(true);

      // No success toast for admin
    } catch (error) {
      toast.error('Failed to view file');
    }
  };

  const handleCreateEmployee = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/admin/employees`, newEmployee, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Employee created successfully');
      setNewEmployee({ username: '', email: '', password: '' });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create employee');
    }
  };

  const handleDeleteEmployee = async (empUsername) => {
    if (!window.confirm('Are you sure you want to delete this employee?')) return;
    
    try {
      await axios.delete(`${API}/admin/employees/${empUsername}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Employee deleted');
      loadData();
    } catch (error) {
      toast.error('Failed to delete employee');
    }
  };

  // Edit employee state and handlers
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState({ username: '', email: '', password: '' });
  const [editingOriginalUsername, setEditingOriginalUsername] = useState(null);

  // WFH approval modal state
  const [wfhModalOpen, setWfhModalOpen] = useState(false);
  const [wfhModalEmployee, setWfhModalEmployee] = useState(null);
  const [wfhStartDate, setWfhStartDate] = useState('');
  const [wfhStartTime, setWfhStartTime] = useState('');
  const [wfhEndDate, setWfhEndDate] = useState('');
  const [wfhEndTime, setWfhEndTime] = useState('');

  const openEdit = (emp) => {
    setEditingOriginalUsername(emp.username);
    setEditingEmployee({ username: emp.username, email: emp.email, password: '' });
    setIsEditOpen(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingOriginalUsername) return;

    try {
      // Build updates payload - omit empty password
      const updates = { username: editingEmployee.username, email: editingEmployee.email };
      if (editingEmployee.password && editingEmployee.password.trim() !== '') {
        updates.password = editingEmployee.password;
      }

      await axios.put(`${API}/admin/employees/${editingOriginalUsername}`, updates, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success('Employee updated');
      setIsEditOpen(false);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update employee');
    }
  }; 

  const handleWFHAction = (empUsername, action) => {
    if (action === 'approved') {
      setWfhModalEmployee(empUsername);
      // Set default dates/times
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];
      const startTimeStr = '09:00';
      const endTimeStr = '17:00';
      
      setWfhStartDate(dateStr);
      setWfhStartTime(startTimeStr);
      setWfhEndDate(dateStr);
      setWfhEndTime(endTimeStr);
      setWfhModalOpen(true);
    } else if (action === 'rejected') {
      handleRejectWFH(empUsername);
    }
  };

  const handleRejectWFH = async (empUsername) => {
    try {
      await axios.put(
        `${API}/admin/wfh-requests/${empUsername}`,
        { status: 'rejected' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Request rejected');
      loadData();
    } catch (error) {
      toast.error('Failed to process request');
    }
  };

  const handleApproveWFH = async (e) => {
    e.preventDefault();
    
    if (!wfhStartDate || !wfhStartTime || !wfhEndDate || !wfhEndTime) {
      toast.error('Please fill in all date and time fields');
      return;
    }

    try {
      // Combine date and time into ISO strings
      const startIso = new Date(`${wfhStartDate}T${wfhStartTime}`).toISOString();
      const endIso = new Date(`${wfhEndDate}T${wfhEndTime}`).toISOString();

      // Validate that end is after start
      if (new Date(endIso) <= new Date(startIso)) {
        toast.error('End time must be after start time');
        return;
      }

      await axios.put(
        `${API}/admin/wfh-requests/${wfhModalEmployee}`,
        { 
          status: 'approved',
          access_start: startIso,
          access_end: endIso
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('WFH request approved');
      setWfhModalOpen(false);
      loadData();
    } catch (error) {
      toast.error('Failed to approve request');
    }
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    
    // Validate file
    const validation = fileService.validateFileForUpload(selectedFile);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    try {
      const result = await fileService.uploadFile(selectedFile);
      
      if (result.success) {
        toast.success(result.message);
        setSelectedFile(null);
        loadData();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error('Failed to upload file');
    }
  };

  const handleUpdateConfig = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`${API}/admin/geofence-config`, geofenceConfig, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Configuration updated');
    } catch (error) {
      toast.error('Failed to update configuration');
    }
  };

  const suspiciousLogs = accessLogs.filter(log => !log.success);

  return (
    <div className="dashboard-container" data-testid="admin-dashboard">
      <div className="dashboard-header">
        <div className="dashboard-logo">
          <div className="logo-icon">G</div>
          <div className="logo-text">
            <h1>GeoCrypt Admin</h1>
          </div>
        </div>
        <div className="user-info">
          <span className="user-name">👤 {username}</span>
          <button className="logout-btn" onClick={handleLogoutClick} data-testid="logout-btn">
            <LogOut size={16} style={{ display: 'inline', marginRight: '6px' }} />
            Logout
          </button>
        </div>
      </div>

      <div className="dashboard-content">
        {activeTab === 'overview' && (
          <>
            <div className="stats-grid">
              <div className="stat-card" onClick={() => setActiveTab('employees')} style={{ cursor: 'pointer' }}>
                <Users size={32} style={{ color: '#667eea', marginBottom: '12px' }} />
                <div className="stat-label">Total Employees</div>
                <div className="stat-value">{employees.length}</div>
              </div>
              
              <div className="stat-card" onClick={() => { setLogFilter(null); setActiveTab('logs'); }} style={{ cursor: 'pointer' }}>
                <Activity size={32} style={{ color: '#10b981', marginBottom: '12px' }} />
                <div className="stat-label">Access Logs</div>
                <div className="stat-value">{accessLogs.length}</div>
              </div>
              
              <div className="stat-card" onClick={() => setActiveTab('wfh')} style={{ cursor: 'pointer' }}>
                <FileText size={32} style={{ color: '#f59e0b', marginBottom: '12px' }} />
                <div className="stat-label">WFH Requests</div>
                <div className="stat-value">{wfhRequests.filter(r => r.status === 'pending').length}</div>
              </div>
              
              <div className="stat-card" onClick={() => { setLogFilter('suspicious'); setActiveTab('logs'); }} style={{ cursor: 'pointer' }}>
                <AlertTriangle size={32} style={{ color: '#ef4444', marginBottom: '12px' }} />
                <div className="stat-label">Suspicious Activity</div>
                <div className="stat-value">{suspiciousLogs.length}</div>
              </div>

              <div className="stat-card" onClick={() => setActiveTab('ai-analysis')} style={{ cursor: 'pointer' }}>
                <Brain size={32} style={{ color: '#8b5cf6', marginBottom: '12px' }} />
                <div className="stat-label">AI Security Analysis</div>
                <div className="stat-value" style={{ fontSize: '14px' }}>
                  {suspiciousAnalysis ? `${suspiciousAnalysis.suspicious_count} flagged` : 'Run Analysis'}
                </div>
              </div>
            </div>

            <div className="dashboard-section">
              <div className="section-header">
                <h2 className="section-title">Quick Actions</h2>
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button className="primary-btn" onClick={() => setActiveTab('employees')} data-testid="manage-employees-btn">
                  <Users size={16} style={{ display: 'inline', marginRight: '6px' }} />
                  Manage Employees
                </button>
                <button className="primary-btn" onClick={() => setActiveTab('files')} data-testid="manage-files-btn">
                  <FileText size={16} style={{ display: 'inline', marginRight: '6px' }} />
                  Manage Files
                </button>
                <button className="primary-btn" onClick={() => setActiveTab('settings')} data-testid="settings-btn">
                  <Settings size={16} style={{ display: 'inline', marginRight: '6px' }} />
                  Settings
                </button>
                <button className="primary-btn" onClick={() => { setActiveTab('ai-analysis'); loadAISuspiciousAnalysis(); }} style={{ backgroundColor: '#8b5cf6' }}>
                  <Brain size={16} style={{ display: 'inline', marginRight: '6px' }} />
                  Run AI Security Analysis
                </button>
              </div>
            </div>

            <div className="dashboard-section">
              <div className="section-header">
                <h2 className="section-title">Recent Activity</h2>
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Type</th>
                      <th>Action</th>
                      <th>Status</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accessLogs.slice(0, 10).map((log, idx) => (
                      <tr key={idx}>
                        <td>{log.employee_username}</td>
                        <td>
                          <span className={`badge ${log.log_type === 'authentication' ? 'badge-info' : 'badge-primary'}`}>
                            {log.log_type === 'authentication' ? 'Auth' : 'File'}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            fontWeight: '500',
                            color: log.action.includes('failed') || log.action === 'denied' ? '#ef4444' : '#10b981'
                          }}>
                            {log.action}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${log.success ? 'badge-success' : 'badge-danger'}`}>
                            {log.success ? 'Success' : 'Denied'}
                          </span>
                        </td>
                        <td>{new Date(log.timestamp).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {activeTab === 'employees' && (
          <div className="dashboard-section">
            <div className="section-header">
              <h2 className="section-title">Employee Management</h2>
              <button className="primary-btn" onClick={() => setActiveTab('overview')}>Back to Overview</button>
            </div>
            
            <form onSubmit={handleCreateEmployee} style={{ marginBottom: '30px', padding: '20px', background: '#f9fafb', borderRadius: '12px' }}>
              <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: '600' }}>Add New Employee</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <input
                  type="text"
                  placeholder="Username"
                  className="form-input"
                  value={newEmployee.username}
                  onChange={(e) => setNewEmployee({ ...newEmployee, username: e.target.value })}
                  required
                  data-testid="new-employee-username"
                />
                <input
                  type="email"
                  placeholder="Email"
                  className="form-input"
                  value={newEmployee.email}
                  onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                  required
                  data-testid="new-employee-email"
                />
                <input
                  type="password"
                  placeholder="Password"
                  className="form-input"
                  value={newEmployee.password}
                  onChange={(e) => setNewEmployee({ ...newEmployee, password: e.target.value })}
                  required
                  data-testid="new-employee-password"
                />
                <button type="submit" className="primary-btn" data-testid="create-employee-btn">
                  Create Employee
                </button>
              </div>
            </form>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => (
                    <tr key={emp.username}>
                      <td>{emp.username}</td>
                      <td>{emp.email}</td>
                      <td>
                        <span className={`badge ${emp.is_active ? 'badge-success' : 'badge-danger'}`}>
                          {emp.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>{new Date(emp.created_at).toLocaleDateString()}</td>
                      <td>
                        <button 
                          className="action-btn"
                          onClick={() => { setEditingOriginalUsername(emp.username); setEditingEmployee({ username: emp.username, email: emp.email, password: '' }); setIsEditOpen(true); }}
                          data-testid={`modify-employee-${emp.username}`}
                        >
                          Modify
                        </button>
                        <button 
                          className="action-btn action-btn-danger"
                          onClick={() => handleDeleteEmployee(emp.username)}
                          data-testid={`delete-employee-${emp.username}`}
                          style={{ marginLeft: '8px' }}
                        >
                          Delete
                        </button>
                      </td> 
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <div className="dashboard-section">
            <div className="section-header">
              <h2 className="section-title">File Management</h2>
              <button className="primary-btn" onClick={() => setActiveTab('overview')}>Back to Overview</button>
            </div>
            
            <form onSubmit={handleFileUpload} style={{ marginBottom: '30px' }}>
              <div className="file-upload-zone" onClick={() => document.getElementById('file-input').click()}>
                <Upload size={48} style={{ color: '#667eea', marginBottom: '12px' }} />
                <p style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
                  {selectedFile ? selectedFile.name : 'Click to upload file'}
                </p>
                <p style={{ fontSize: '14px', color: '#6b7280' }}>File will be encrypted with post-quantum cryptography</p>
                <input
                  id="file-input"
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files[0])}
                  data-testid="file-upload-input"
                />
              </div>
              {selectedFile && (
                <button type="submit" className="primary-btn" style={{ marginTop: '16px', width: '100%' }} data-testid="upload-file-btn">
                  Upload & Encrypt File
                </button>
              )}
            </form>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Filename</th>
                    <th>Uploaded By</th>
                    <th>Size</th>
                    <th>Encrypted</th>
                    <th>Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((file) => (
                    <tr key={file.file_id}>
                      <td>{file.filename}</td>
                      <td>{file.uploaded_by}</td>
                      <td>{(file.size / 1024).toFixed(2)} KB</td>
                      <td>
                        <span className="badge badge-success">Yes</span>
                      </td>
                      <td>{new Date(file.uploaded_at).toLocaleDateString()}</td>
                      <td>
                        <button 
                          className="primary-btn" 
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                          onClick={() => handleFileView(file)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="dashboard-section">
            <div className="section-header">
              <h2 className="section-title">Access & Authentication Logs</h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                {logFilter && (
                  <span className="badge badge-warning">Filter: {logFilter}</span>
                )}
                {logFilter && (
                  <button className="secondary-btn" onClick={() => setLogFilter(null)}>Clear filter</button>
                )}
                <button 
                  className={`secondary-btn ${logFilter === 'denied' ? 'primary-btn' : ''}`}
                  onClick={() => setLogFilter(logFilter === 'denied' ? null : 'denied')}
                  title="Show denied access and failed authentication attempts"
                >
                  Denied Only
                </button>
                <button 
                  className={`secondary-btn ${logFilter === 'suspicious' ? 'primary-btn' : ''}`}
                  onClick={() => setLogFilter(logFilter === 'suspicious' ? null : 'suspicious')}
                  title="Show failed access attempts"
                >
                  Suspicious Only
                </button>
                <button className="primary-btn" onClick={() => { setLogFilter(null); setActiveTab('overview'); }}>Back to Overview</button>
              </div>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Type</th>
                    <th>Action</th>
                    <th>File</th>
                    <th>Location</th>
                    <th>WiFi</th>
                    <th>Status</th>
                    <th>Reason</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {accessLogs.filter(log => {
                    if (logFilter === 'suspicious') return !log.success;
                    if (logFilter === 'denied') return !log.success;
                    return true;
                  }).map((log, idx) => (
                    <tr key={idx}>
                      <td>{log.employee_username}</td>
                      <td>
                        <span className={`badge ${log.log_type === 'authentication' ? 'badge-info' : 'badge-primary'}`}>
                          {log.log_type === 'authentication' ? 'Auth' : 'File'}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          fontWeight: '500',
                          color: log.action.includes('failed') || log.action === 'denied' ? '#ef4444' : '#10b981'
                        }}>
                          {log.action}
                        </span>
                      </td>
                      <td>{log.filename || 'N/A'}</td>
                      <td>
                        {(() => {
                          const loc = log.location;
                          if (!loc) return 'N/A';
                          const lat = loc.lat;
                          const lon = loc.lon;
                          if (typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon)) {
                            return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
                          }
                          return 'N/A';
                        })()}
                      </td>
                      <td>{log.wifi_ssid || 'N/A'}</td>
                      <td>
                        <span className={`badge ${log.success ? 'badge-success' : 'badge-danger'}`}>
                          {log.success ? 'Success' : 'Denied'}
                        </span>
                      </td>
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.reason}</td>
                      <td>{new Date(log.timestamp).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'wfh' && (
          <div className="dashboard-section">
            <div className="section-header">
              <h2 className="section-title">Work From Home Requests</h2>
              <button className="primary-btn" onClick={() => setActiveTab('overview')}>Back to Overview</button>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Reason</th>
                    <th>Requested</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {wfhRequests.map((req) => (
                    <tr key={req.employee_username}>
                      <td>{req.employee_username}</td>
                      <td>{req.reason}</td>
                      <td>{new Date(req.requested_at).toLocaleString()}</td>
                      <td>
                        <span className={`badge ${
                          req.status === 'pending' ? 'badge-warning' :
                          req.status === 'approved' ? 'badge-success' : 'badge-danger'
                        }`}>
                          {req.status}
                        </span>
                      </td>
                      <td>
                        {req.status === 'pending' && (
                          <>
                            <button 
                              className="action-btn action-btn-success"
                              onClick={() => handleWFHAction(req.employee_username, 'approved')}
                              data-testid={`approve-wfh-${req.employee_username}`}
                            >
                              Approve
                            </button>
                            <button 
                              className="action-btn action-btn-danger"
                              onClick={() => handleWFHAction(req.employee_username, 'rejected')}
                              data-testid={`reject-wfh-${req.employee_username}`}
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'settings' && geofenceConfig && (
          <div className="dashboard-section">
            <div className="section-header">
              <h2 className="section-title">Geofence Configuration</h2>
              <button className="primary-btn" onClick={() => setActiveTab('overview')}>Back to Overview</button>
            </div>
            <form onSubmit={handleUpdateConfig}>
              <div style={{ display: 'grid', gap: '20px', maxWidth: '600px' }}>
                <div className="form-group">
                  <label>Latitude</label>
                  <input
                    type="number"
                    step="any"
                    className="form-input"
                    value={geofenceConfig.latitude}
                    onChange={(e) => setGeofenceConfig({ ...geofenceConfig, latitude: parseFloat(e.target.value) })}
                    data-testid="config-latitude"
                  />
                </div>
                <div className="form-group">
                  <label>Longitude</label>
                  <input
                    type="number"
                    step="any"
                    className="form-input"
                    value={geofenceConfig.longitude}
                    onChange={(e) => setGeofenceConfig({ ...geofenceConfig, longitude: parseFloat(e.target.value) })}
                    data-testid="config-longitude"
                  />
                </div>
                <div className="form-group">
                  <label>Radius (meters)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={geofenceConfig.radius}
                    onChange={(e) => setGeofenceConfig({ ...geofenceConfig, radius: parseInt(e.target.value) })}
                    data-testid="config-radius"
                  />
                </div>
                <div className="form-group">
                  <label>Allowed WiFi SSID</label>
                  <input
                    type="text"
                    className="form-input"
                    value={geofenceConfig.allowed_ssid}
                    onChange={(e) => setGeofenceConfig({ ...geofenceConfig, allowed_ssid: e.target.value })}
                    data-testid="config-ssid"
                  />
                </div>
                <div className="form-group">
                  <label>Start Time (HH:MM)</label>
                  <input
                    type="time"
                    className="form-input"
                    value={geofenceConfig.start_time}
                    onChange={(e) => setGeofenceConfig({ ...geofenceConfig, start_time: e.target.value })}
                    data-testid="config-start-time"
                  />
                </div>
                <div className="form-group">
                  <label>End Time (HH:MM)</label>
                  <input
                    type="time"
                    className="form-input"
                    value={geofenceConfig.end_time}
                    onChange={(e) => setGeofenceConfig({ ...geofenceConfig, end_time: e.target.value })}
                    data-testid="config-end-time"
                  />
                </div>
                <button type="submit" className="primary-btn" data-testid="save-config-btn">
                  Save Configuration
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'ai-analysis' && (
          <div className="dashboard-section">
            <div className="section-header">
              <h2 className="section-title">🤖 AI Security Analysis</h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  className="primary-btn" 
                  onClick={loadAISuspiciousAnalysis}
                  disabled={analysisLoading}
                  style={{ backgroundColor: '#8b5cf6' }}
                >
                  {analysisLoading ? '⏳ Analyzing...' : '🔄 Run Analysis'}
                </button>
                <button className="primary-btn" onClick={() => setActiveTab('overview')}>Back to Overview</button>
              </div>
            </div>

            {!suspiciousAnalysis ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '40px 20px',
                backgroundColor: '#f9fafb',
                borderRadius: '8px',
                marginBottom: '20px'
              }}>
                <Brain size={48} style={{ color: '#8b5cf6', marginBottom: '16px' }} />
                <p style={{ fontSize: '16px', color: '#6b7280', marginBottom: '20px' }}>
                  Click "Run Analysis" to perform AI-powered security analysis on your access logs
                </p>
                <p style={{ fontSize: '14px', color: '#9ca3af' }}>
                  This will analyze {accessLogs.length} access logs using machine learning algorithms
                </p>
              </div>
            ) : (
              <>
                {/* Risk Summary */}
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '16px',
                  marginBottom: '24px'
                }}>
                  <div style={{
                    padding: '16px',
                    backgroundColor: suspiciousAnalysis.risk_level === 'high' ? '#fee2e2' : 
                                      suspiciousAnalysis.risk_level === 'medium' ? '#fef3c7' : '#dcfce7',
                    border: `2px solid ${suspiciousAnalysis.risk_level === 'high' ? '#fca5a5' : 
                                        suspiciousAnalysis.risk_level === 'medium' ? '#fcd34d' : '#86efac'}`,
                    borderRadius: '8px'
                  }}>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Risk Level</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: suspiciousAnalysis.risk_level === 'high' ? '#dc2626' : 
                                                                                  suspiciousAnalysis.risk_level === 'medium' ? '#d97706' : '#16a34a' }}>
                      {suspiciousAnalysis.risk_level.toUpperCase()}
                    </div>
                  </div>
                  <div style={{
                    padding: '16px',
                    backgroundColor: '#f3f4f6',
                    border: '2px solid #d1d5db',
                    borderRadius: '8px'
                  }}>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Total Activities</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1f2937' }}>
                      {suspiciousAnalysis.total_activities}
                    </div>
                  </div>
                  <div style={{
                    padding: '16px',
                    backgroundColor: '#fef2f2',
                    border: '2px solid #fecaca',
                    borderRadius: '8px'
                  }}>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Suspicious Count</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ef4444' }}>
                      {suspiciousAnalysis.suspicious_count}
                    </div>
                  </div>
                </div>

                {/* Suspicious Activities List */}
                {suspiciousAnalysis.suspicious_count > 0 && (
                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: 'bold' }}>🔴 Suspicious Activities Detected</h3>
                    <div style={{ 
                      display: 'grid', 
                      gap: '12px',
                      backgroundColor: '#f9fafb',
                      padding: '16px',
                      borderRadius: '8px',
                      maxHeight: '600px',
                      overflowY: 'auto'
                    }}>
                      {suspiciousAnalysis.findings && suspiciousAnalysis.findings.length > 0 ? (
                        suspiciousAnalysis.findings.slice(0, 20).map((finding, idx) => (
                          <div key={idx} style={{
                            padding: '12px',
                            backgroundColor: '#fef2f2',
                            border: '1px solid #fecaca',
                            borderRadius: '6px'
                          }}>
                            <div style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'start',
                              marginBottom: '6px'
                            }}>
                              <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                                {finding.activity?.employee_username || 'Unknown User'}
                              </div>
                              <span style={{
                                padding: '2px 8px',
                                backgroundColor: '#fca5a5',
                                color: '#7f1d1d',
                                borderRadius: '3px',
                                fontSize: '11px',
                                fontWeight: 'bold'
                              }}>
                                STATISTICAL ANOMALY
                              </span>
                            </div>
                            <div style={{ fontSize: '13px', color: '#374151', marginBottom: '4px' }}>
                              <strong>Type:</strong> {finding.activity?.log_type?.replace(/_/g, ' ').toUpperCase() || finding.activity?.action?.replace(/_/g, ' ').toUpperCase() || 'Unusual Activity'}
                            </div>
                            <div style={{ fontSize: '13px', color: '#374151', marginBottom: '4px' }}>
                              <strong>Details:</strong> {finding.activity?.action?.replace(/_/g, ' ') || finding.activity?.log_type?.replace(/_/g, ' ') || 'Anomaly Score: ' + (finding.anomaly_score?.toFixed(3) || 'N/A')}
                            </div>
                            <div style={{ fontSize: '11px', color: '#6b7280' }}>
                              <strong>Time:</strong> {finding.activity?.timestamp ? new Date(finding.activity.timestamp).toLocaleString() : 'N/A'}
                            </div>
                          </div>
                        ))
                      ) : suspiciousAnalysis.rule_based_anomalies && suspiciousAnalysis.rule_based_anomalies.length > 0 ? (
                        suspiciousAnalysis.rule_based_anomalies.slice(0, 20).map((anomaly, idx) => (
                          <div key={idx} style={{
                            padding: '12px',
                            backgroundColor: anomaly.severity === 'high' ? '#fee2e2' : anomaly.severity === 'medium' ? '#fef3c7' : '#f0fdf4',
                            border: `1px solid ${anomaly.severity === 'high' ? '#fecaca' : anomaly.severity === 'medium' ? '#fcd34d' : '#bbf7d0'}`,
                            borderRadius: '6px'
                          }}>
                            <div style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'start',
                              marginBottom: '6px'
                            }}>
                              <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                                {anomaly.activity?.employee_username || 'Unknown User'}
                              </div>
                              <span style={{
                                padding: '2px 8px',
                                backgroundColor: anomaly.severity === 'high' ? '#fca5a5' : anomaly.severity === 'medium' ? '#fcd34d' : '#86efac',
                                color: anomaly.severity === 'high' ? '#7f1d1d' : anomaly.severity === 'medium' ? '#78350f' : '#166534',
                                borderRadius: '3px',
                                fontSize: '11px',
                                fontWeight: 'bold'
                              }}>
                                {anomaly.severity.toUpperCase()}
                              </span>
                            </div>
                            <div style={{ fontSize: '13px', color: '#374151', marginBottom: '4px' }}>
                              <strong>Type:</strong> {anomaly.type?.replace(/_/g, ' ').toUpperCase() || 'Unknown'}
                            </div>
                            <div style={{ fontSize: '13px', color: '#374151', marginBottom: '4px' }}>
                              <strong>Details:</strong> {anomaly.description || 'No description'}
                            </div>
                            <div style={{ fontSize: '11px', color: '#6b7280' }}>
                              <strong>Time:</strong> {anomaly.activity?.timestamp ? new Date(anomaly.activity.timestamp).toLocaleString() : 'N/A'}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
                          No suspicious activities details available
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* High Risk Employees */}
                {Object.keys(suspiciousAnalysis.high_risk_employees || {}).length > 0 && (
                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: 'bold' }}>⚠️ High Risk Employees</h3>
                    <div style={{ 
                      display: 'grid', 
                      gap: '12px',
                      backgroundColor: '#f9fafb',
                      padding: '16px',
                      borderRadius: '8px'
                    }}>
                      {Object.entries(suspiciousAnalysis.high_risk_employees).map(([username, data]) => (
                        <div key={username} style={{
                          padding: '12px',
                          backgroundColor: 'white',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <div>
                            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{username}</div>
                            <div style={{ fontSize: '12px', color: '#6b7280' }}>
                              Suspicious: {data.suspicious_count} | Failed: {data.failed_count} | Total: {data.total_activities}
                            </div>
                          </div>
                          <div style={{
                            padding: '6px 12px',
                            backgroundColor: data.risk_score > 0.3 ? '#fee2e2' : '#fef3c7',
                            color: data.risk_score > 0.3 ? '#dc2626' : '#d97706',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 'bold'
                          }}>
                            {(data.risk_score * 100).toFixed(1)}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rule-Based Anomalies */}
                {suspiciousAnalysis.rule_based_anomalies && suspiciousAnalysis.rule_based_anomalies.length > 0 && (
                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: 'bold' }}>🚨 Detected Anomalies</h3>
                    <div style={{ 
                      display: 'grid', 
                      gap: '12px',
                      backgroundColor: '#f9fafb',
                      padding: '16px',
                      borderRadius: '8px'
                    }}>
                      {suspiciousAnalysis.rule_based_anomalies.slice(0, 15).map((anomaly, idx) => (
                        <div key={idx} style={{
                          padding: '12px',
                          backgroundColor: anomaly.severity === 'high' ? '#fee2e2' : anomaly.severity === 'medium' ? '#fef3c7' : '#f0fdf4',
                          border: `1px solid ${anomaly.severity === 'high' ? '#fecaca' : anomaly.severity === 'medium' ? '#fcd34d' : '#bbf7d0'}`,
                          borderRadius: '6px'
                        }}>
                          <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'start',
                            marginBottom: '6px'
                          }}>
                            <div style={{ fontWeight: 'bold' }}>
                              {anomaly.type.replace(/_/g, ' ').toUpperCase()}
                            </div>
                            <span style={{
                              padding: '2px 8px',
                              backgroundColor: anomaly.severity === 'high' ? '#fca5a5' : anomaly.severity === 'medium' ? '#fcd34d' : '#86efac',
                              color: anomaly.severity === 'high' ? '#7f1d1d' : anomaly.severity === 'medium' ? '#78350f' : '#166534',
                              borderRadius: '3px',
                              fontSize: '11px',
                              fontWeight: 'bold'
                            }}>
                              {anomaly.severity}
                            </span>
                          </div>
                          <div style={{ fontSize: '13px', color: '#374151' }}>
                            {anomaly.description}
                          </div>
                          <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '6px' }}>
                            User: {anomaly.activity.employee_username} | Time: {new Date(anomaly.activity.timestamp).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recommendations */}
                {suspiciousAnalysis.recommendations && suspiciousAnalysis.recommendations.length > 0 && (
                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: 'bold' }}>💡 Recommendations</h3>
                    <div style={{ 
                      display: 'grid', 
                      gap: '8px',
                      backgroundColor: '#eff6ff',
                      padding: '16px',
                      borderRadius: '8px',
                      borderLeft: '4px solid #3b82f6'
                    }}>
                      {suspiciousAnalysis.recommendations.map((rec, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '8px' }}>
                          <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>✓</span>
                          <span>{rec}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

            {/* Edit Employee Dialog */}
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Modify Employee</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSaveEdit} style={{ display: 'grid', gap: '12px', marginTop: '12px' }}>
                  <input
                    type="text"
                    placeholder="Username"
                    className="form-input"
                    value={editingEmployee.username}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, username: e.target.value })}
                    required
                    data-testid="edit-employee-username"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    className="form-input"
                    value={editingEmployee.email}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, email: e.target.value })}
                    required
                    data-testid="edit-employee-email"
                  />
                  <input
                    type="password"
                    placeholder="Password (leave blank to keep current)"
                    className="form-input"
                    value={editingEmployee.password}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, password: e.target.value })}
                    data-testid="edit-employee-password"
                  />
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button type="button" className="secondary-btn" onClick={() => setIsEditOpen(false)}>Cancel</button>
                    <button type="submit" className="primary-btn" data-testid="save-employee-btn">Save Changes</button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>

      {/* Logout Confirmation Dialog */}
      <Dialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Logout</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to logout?</p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button 
              className="secondary-btn" 
              onClick={() => setShowLogoutConfirm(false)}
            >
              No
            </button>
            <button 
              className="primary-btn" 
              onClick={confirmLogout}
            >
              Yes, Logout
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* File Viewer Modal */}
      {viewerOpen && viewerFile && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            width: '95%',
            maxWidth: '1400px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
          }}>
            {/* Header */}
            <div style={{
              padding: '20px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h2 style={{ margin: '0 0 8px 0', color: '#1f2937' }}>{viewerFile.filename}</h2>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  
                </div>
              </div>
              <button 
                onClick={() => {
                  setViewerOpen(false);
                  setViewerFile(null);
                  setViewerContent('');
                  setViewerBlob(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6b7280'
                }}
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div style={{
              flex: 1,
              overflow: 'auto',
              padding: '10px',
              backgroundColor: '#f9fafb',
              display: 'flex',
              alignItems: 'stretch',
              justifyContent: 'stretch'
            }}>
              {viewerBlob && (() => {
                const fileName = viewerFile.filename.toLowerCase();
                const isImageFile = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(fileName);
                const isPdfFile = fileName.endsWith('.pdf');
                const isTextFile = fileName.endsWith('.txt') || fileName.endsWith('.md') || fileName.endsWith('.log') || fileName.endsWith('.json') || fileName.endsWith('.csv');
                
                if (isImageFile) {
                  const imageUrl = URL.createObjectURL(viewerBlob);
                  return (
                    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{
                        opacity: 0.15,
                        position: 'fixed',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%) rotate(-45deg)',
                        fontSize: '60px',
                        fontWeight: 'bold',
                        color: '#999',
                        pointerEvents: 'none',
                        zIndex: 0,
                        whiteSpace: 'nowrap'
                      }}>
                        {username} - {new Date().toLocaleDateString()}
                      </div>
                      <img 
                        src={imageUrl} 
                        alt={viewerFile.filename} 
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                        onLoad={() => URL.revokeObjectURL(imageUrl)}
                      />
                    </div>
                  );
                } else if (isPdfFile) {
                  return (
                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                      <div style={{
                        opacity: 0.15,
                        position: 'fixed',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%) rotate(-45deg)',
                        fontSize: '60px',
                        fontWeight: 'bold',
                        color: '#999',
                        pointerEvents: 'none',
                        zIndex: 0,
                        whiteSpace: 'nowrap'
                      }}>
                        {username} - {new Date().toLocaleDateString()}
                      </div>
                      {pdfDataUrl ? (
                        <iframe 
                          src={`${pdfDataUrl}#toolbar=1&navpanes=0&scrollbar=0`}
                          style={{ width: '100%', height: '100%', border: 'none' }}
                          title={viewerFile.filename}
                          allow="fullscreen"
                        ></iframe>
                      ) : (
                        <div style={{ textAlign: 'center', color: '#6b7280', padding: '20px' }}>Loading PDF...</div>
                      )}
                    </div>
                  );
                } else if (isTextFile) {
                  return (
                    <div style={{
                      backgroundColor: 'white',
                      padding: '15px',
                      borderRadius: '8px',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      lineHeight: '1.4',
                      color: '#1f2937',
                      border: '1px solid #e5e7eb',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      WebkitTouchCallout: 'none',
                      width: '100%',
                      height: '100%',
                      position: 'relative',
                      overflow: 'auto'
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      toast.error('Copying is disabled for security reasons');
                    }}>
                      <div style={{
                        opacity: 0.15,
                        position: 'fixed',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%) rotate(-45deg)',
                        fontSize: '60px',
                        fontWeight: 'bold',
                        color: '#999',
                        pointerEvents: 'none',
                        zIndex: 0,
                        whiteSpace: 'nowrap'
                      }}>
                        {username} - {new Date().toLocaleDateString()}
                      </div>
                      {viewerContent}
                    </div>
                  );
                } else {
                  return (
                    <div style={{ textAlign: 'center', color: '#6b7280', padding: '20px' }}>
                      <div style={{ fontSize: '16px', marginBottom: '10px' }}>File format not directly viewable</div>
                      <button 
                        onClick={() => {
                          const url = URL.createObjectURL(viewerBlob);
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = viewerFile.filename;
                          link.click();
                          URL.revokeObjectURL(url);
                        }}
                        style={{
                          padding: '10px 20px',
                          backgroundColor: '#667eea',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '14px'
                        }}
                      >
                        Download File
                      </button>
                    </div>
                  );
                }
              })()}
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 20px',
              borderTop: '1px solid #e5e7eb',
              backgroundColor: 'white',
              borderBottomLeftRadius: '12px',
              borderBottomRightRadius: '12px',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px'
            }}>
              <button
                onClick={() => {
                  setViewerOpen(false);
                  setViewerFile(null);
                  setViewerContent('');
                  setViewerBlob(null);
                }}
                className="secondary-btn"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WFH Approval Modal */}
      {wfhModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '32px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)'
          }}>
            <h2 style={{
              fontSize: '24px',
              fontWeight: '700',
              marginBottom: '8px',
              color: '#1f2937'
            }}>
              Approve WFH Request
            </h2>
            <p style={{
              color: '#6b7280',
              marginBottom: '24px',
              fontSize: '14px'
            }}>
              Set the access window for {wfhModalEmployee}'s work from home period
            </p>

            <form onSubmit={handleApproveWFH}>
              <div style={{ display: 'grid', gap: '20px' }}>
                {/* Start Date/Time */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '600',
                    marginBottom: '8px',
                    color: '#1f2937'
                  }}>
                    Start Date & Time
                  </label>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px'
                  }}>
                    <input
                      type="date"
                      value={wfhStartDate}
                      onChange={(e) => setWfhStartDate(e.target.value)}
                      style={{
                        padding: '10px 12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontFamily: 'inherit'
                      }}
                      required
                    />
                    <input
                      type="time"
                      value={wfhStartTime}
                      onChange={(e) => setWfhStartTime(e.target.value)}
                      style={{
                        padding: '10px 12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontFamily: 'inherit'
                      }}
                      required
                    />
                  </div>
                  {wfhStartDate && wfhStartTime && (
                    <p style={{
                      fontSize: '12px',
                      color: '#10b981',
                      marginTop: '6px',
                      fontWeight: '500'
                    }}>
                      Start: {new Date(`${wfhStartDate}T${wfhStartTime}`).toLocaleString()}
                    </p>
                  )}
                </div>

                {/* End Date/Time */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '600',
                    marginBottom: '8px',
                    color: '#1f2937'
                  }}>
                    End Date & Time
                  </label>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px'
                  }}>
                    <input
                      type="date"
                      value={wfhEndDate}
                      onChange={(e) => setWfhEndDate(e.target.value)}
                      style={{
                        padding: '10px 12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontFamily: 'inherit'
                      }}
                      required
                    />
                    <input
                      type="time"
                      value={wfhEndTime}
                      onChange={(e) => setWfhEndTime(e.target.value)}
                      style={{
                        padding: '10px 12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontFamily: 'inherit'
                      }}
                      required
                    />
                  </div>
                  {wfhEndDate && wfhEndTime && (
                    <p style={{
                      fontSize: '12px',
                      color: '#10b981',
                      marginTop: '6px',
                      fontWeight: '500'
                    }}>
                      End: {new Date(`${wfhEndDate}T${wfhEndTime}`).toLocaleString()}
                    </p>
                  )}
                </div>

                {/* Duration Summary */}
                {wfhStartDate && wfhStartTime && wfhEndDate && wfhEndTime && (
                  <div style={{
                    padding: '12px',
                    backgroundColor: '#f0fdf4',
                    borderRadius: '8px',
                    borderLeft: '4px solid #10b981'
                  }}>
                    <p style={{
                      margin: 0,
                      fontSize: '13px',
                      color: '#065f46',
                      fontWeight: '500'
                    }}>
                      ✓ Duration: {(() => {
                        const start = new Date(`${wfhStartDate}T${wfhStartTime}`);
                        const end = new Date(`${wfhEndDate}T${wfhEndTime}`);
                        const diffMs = end - start;
                        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                        return `${diffHours}h ${diffMins}m`;
                      })()}
                    </p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{
                display: 'flex',
                gap: '12px',
                marginTop: '24px',
                justifyContent: 'flex-end'
              }}>
                <button
                  type="button"
                  onClick={() => setWfhModalOpen(false)}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#f3f4f6',
                    color: '#374151',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '14px',
                    transition: 'all 0.2s'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 24px',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '14px',
                    transition: 'all 0.2s'
                  }}
                >
                  Approve & Set Window
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

export default AdminDashboard;
