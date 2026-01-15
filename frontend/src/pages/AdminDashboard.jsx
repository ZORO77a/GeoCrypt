import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { FileText, Users, Activity, AlertTriangle, Settings, LogOut, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  const [newEmployee, setNewEmployee] = useState({ username: '', email: '', password: '' });
  const [selectedFile, setSelectedFile] = useState(null);
  const [logFilter, setLogFilter] = useState(null);
  const navigate = useNavigate();
  const activeTabRef = useRef('overview');

  const token = localStorage.getItem('token');
  const username = localStorage.getItem('username');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

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

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    localStorage.clear();
    navigate('/admin/login');
  };

  const handleFileView = async (file) => {
    try {
      const response = await axios.post(
        `${API}/files/access`,
        { file_id: file.file_id },
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );

      // Handle different file types
      const fileName = file.filename.toLowerCase();
      const isTextFile = fileName.endsWith('.txt') || fileName.endsWith('.md') || fileName.endsWith('.log') || fileName.endsWith('.json') || fileName.endsWith('.csv');
      const isImageFile = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(fileName);
      const isPdfFile = fileName.endsWith('.pdf');
      
      setViewerFile(file);
      setViewerBlob(response.data);
      
      // Only convert to text for text files
      if (isTextFile) {
        const text = await response.data.text();
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
      let detail = error.response?.data?.detail;
      if (!detail && error.response && error.response.data instanceof Blob) {
        try {
          const text = await error.response.data.text();
          const parsed = JSON.parse(text);
          detail = parsed?.detail || text;
        } catch (err) {
          detail = null;
        }
      }

      let errorMsg = 'Access denied';
      if (Array.isArray(detail)) {
        errorMsg = detail.map(d => d.msg || JSON.stringify(d)).join('; ');
      } else if (typeof detail === 'string') {
        errorMsg = detail;
      } else if (detail && typeof detail === 'object') {
        errorMsg = detail.reason || JSON.stringify(detail);
      }
      toast.error(errorMsg);
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

  const handleWFHAction = async (empUsername, action) => {
    try {
      let payload = { status: action };

      // If approving, prompt admin to allocate access window (start and end)
      if (action === 'approved') {
        const startInput = window.prompt('Enter access start (YYYY-MM-DD HH:MM in 24h), e.g. 2025-12-07 09:00');
        if (!startInput) {
          toast.error('Approval cancelled: start time required');
          return;
        }
        const endInput = window.prompt('Enter access end (YYYY-MM-DD HH:MM in 24h), e.g. 2025-12-07 17:00');
        if (!endInput) {
          toast.error('Approval cancelled: end time required');
          return;
        }

        // Parse into ISO strings
        const startIso = new Date(startInput.replace(' ', 'T')).toISOString();
        const endIso = new Date(endInput.replace(' ', 'T')).toISOString();

        payload.access_start = startIso;
        payload.access_end = endIso;
      }

      await axios.put(
        `${API}/admin/wfh-requests/${empUsername}`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`Request ${action}`);
      loadData();
    } catch (error) {
      toast.error('Failed to process request');
    }
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      toast.error('Please select a file');
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      await axios.post(`${API}/files/upload`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('File uploaded and encrypted');
      setSelectedFile(null);
      loadData();
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
                      <th>File</th>
                      <th>Action</th>
                      <th>Status</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accessLogs.slice(0, 10).map((log, idx) => (
                      <tr key={idx}>
                        <td>{log.employee_username}</td>
                        <td>{log.filename || 'N/A'}</td>
                        <td>{log.action}</td>
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
              <h2 className="section-title">Access Logs</h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {logFilter === 'suspicious' && (
                  <span className="badge badge-warning">Suspicious only</span>
                )}
                {logFilter === 'suspicious' && (
                  <button className="secondary-btn" onClick={() => setLogFilter(null)}>Clear filter</button>
                )}
                <button className="primary-btn" onClick={() => { setLogFilter(null); setActiveTab('overview'); }}>Back to Overview</button>
              </div>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>File</th>
                    <th>Action</th>
                    <th>Location</th>
                    <th>WiFi</th>
                    <th>Status</th>
                    <th>Reason</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {(logFilter === 'suspicious' ? suspiciousLogs : accessLogs).map((log, idx) => (
                    <tr key={idx}>
                      <td>{log.employee_username}</td>
                      <td>{log.filename || 'N/A'}</td>
                      <td>{log.action}</td>
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
      </div>
    </div>
  );
}

export default AdminDashboard;
