import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { FileText, Users, Activity, AlertTriangle, Settings, LogOut, Upload } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [employees, setEmployees] = useState([]);
  const [accessLogs, setAccessLogs] = useState([]);
  const [wfhRequests, setWfhRequests] = useState([]);
  const [files, setFiles] = useState([]);
  const [geofenceConfig, setGeofenceConfig] = useState(null);
  const [newEmployee, setNewEmployee] = useState({ username: '', email: '', password: '' });
  const [selectedFile, setSelectedFile] = useState(null);
  const navigate = useNavigate();

  const token = localStorage.getItem('token');
  const username = localStorage.getItem('username');

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

  const handleLogout = () => {
    localStorage.clear();
    navigate('/admin/login');
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
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
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
          <button className="logout-btn" onClick={handleLogout} data-testid="logout-btn">
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
              
              <div className="stat-card" onClick={() => setActiveTab('logs')} style={{ cursor: 'pointer' }}>
                <Activity size={32} style={{ color: '#10b981', marginBottom: '12px' }} />
                <div className="stat-label">Access Logs</div>
                <div className="stat-value">{accessLogs.length}</div>
              </div>
              
              <div className="stat-card" onClick={() => setActiveTab('wfh')} style={{ cursor: 'pointer' }}>
                <FileText size={32} style={{ color: '#f59e0b', marginBottom: '12px' }} />
                <div className="stat-label">WFH Requests</div>
                <div className="stat-value">{wfhRequests.filter(r => r.status === 'pending').length}</div>
              </div>
              
              <div className="stat-card">
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
                          className="action-btn action-btn-danger"
                          onClick={() => handleDeleteEmployee(emp.username)}
                          data-testid={`delete-employee-${emp.username}`}
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
              <button className="primary-btn" onClick={() => setActiveTab('overview')}>Back to Overview</button>
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
                  {accessLogs.map((log, idx) => (
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
      </div>
    </div>
  );
}

export default AdminDashboard;
