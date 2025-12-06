import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { FileText, MapPin, Wifi, Clock, LogOut, Download } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function EmployeeDashboard() {
  const [files, setFiles] = useState([]);
  const [wfhStatus, setWfhStatus] = useState(null);
  const [location, setLocation] = useState(null);
  const [wifiSSID, setWifiSSID] = useState('');
  const [wfhReason, setWfhReason] = useState('');
  const [showWFHForm, setShowWFHForm] = useState(false);
  const navigate = useNavigate();

  const token = localStorage.getItem('token');
  const username = localStorage.getItem('username');

  useEffect(() => {
    if (!token) {
      navigate('/employee/login');
      return;
    }
    loadData();
    getUserLocation();
  }, [token]);

  const getUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
          toast.success('Location detected');
        },
        (error) => {
          toast.error('Please enable location access');
        }
      );
    } else {
      toast.error('Geolocation not supported');
    }
  };

  const loadData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      const [filesRes, wfhRes] = await Promise.all([
        axios.get(`${API}/files`, { headers }),
        axios.get(`${API}/wfh-request/status`, { headers })
      ]);

      setFiles(filesRes.data);
      setWfhStatus(wfhRes.data);
    } catch (error) {
      toast.error('Failed to load data');
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/employee/login');
  };

  const handleFileAccess = async (file) => {
    if (!location) {
      toast.error('Location not detected. Please enable location access.');
      return;
    }

    if (!wifiSSID) {
      toast.error('Please enter WiFi SSID');
      return;
    }

    try {
      const response = await axios.post(
        `${API}/files/access`,
        {
          file_id: file.file_id,
          latitude: location.latitude,
          longitude: location.longitude,
          wifi_ssid: wifiSSID
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.filename);
      document.body.appendChild(link);
      link.click();
      link.remove();

      toast.success('File downloaded successfully');
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Access denied';
      toast.error(errorMsg);
    }
  };

  const handleWFHRequest = async (e) => {
    e.preventDefault();
    try {
      await axios.post(
        `${API}/wfh-request`,
        { reason: wfhReason },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Work from home request submitted');
      setWfhReason('');
      setShowWFHForm(false);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit request');
    }
  };

  return (
    <div className="dashboard-container" data-testid="employee-dashboard">
      <div className="dashboard-header">
        <div className="dashboard-logo">
          <div className="logo-icon">G</div>
          <div className="logo-text">
            <h1>GeoCrypt Employee</h1>
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
        <div className="stats-grid">
          <div className="stat-card">
            <MapPin size={32} style={{ color: '#667eea', marginBottom: '12px' }} />
            <div className="stat-label">Location Status</div>
            <div className="stat-value" style={{ fontSize: '18px' }}>
              {location ? '✓ Detected' : '✗ Not Detected'}
            </div>
          </div>
          
          <div className="stat-card">
            <Clock size={32} style={{ color: '#10b981', marginBottom: '12px' }} />
            <div className="stat-label">Current Time</div>
            <div className="stat-value" style={{ fontSize: '18px' }}>
              {new Date().toLocaleTimeString()}
            </div>
          </div>
          
          <div className="stat-card">
            <FileText size={32} style={{ color: '#f59e0b', marginBottom: '12px' }} />
            <div className="stat-label">Available Files</div>
            <div className="stat-value">{files.length}</div>
          </div>
          
          <div className="stat-card">
            <Wifi size={32} style={{ color: '#8b5cf6', marginBottom: '12px' }} />
            <div className="stat-label">WFH Status</div>
            <div className="stat-value" style={{ fontSize: '18px' }}>
              {wfhStatus?.status === 'approved' ? '✓ Approved' : 
               wfhStatus?.status === 'pending' ? '⏳ Pending' : '✗ None'}
            </div>
          </div>
        </div>

        <div className="dashboard-section">
          <div className="section-header">
            <h2 className="section-title">Access Requirements</h2>
            {!showWFHForm && (
              <button 
                className="primary-btn" 
                onClick={() => setShowWFHForm(true)}
                data-testid="request-wfh-btn"
              >
                Request Work From Home
              </button>
            )}
          </div>

          {showWFHForm && (
            <form onSubmit={handleWFHRequest} style={{ marginBottom: '20px', padding: '20px', background: '#f9fafb', borderRadius: '12px' }}>
              <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: '600' }}>Submit WFH Request</h3>
              <textarea
                className="form-input"
                placeholder="Reason for work from home"
                value={wfhReason}
                onChange={(e) => setWfhReason(e.target.value)}
                required
                rows="4"
                data-testid="wfh-reason-input"
              />
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="submit" className="primary-btn" data-testid="submit-wfh-btn">
                  Submit Request
                </button>
                <button 
                  type="button" 
                  className="logout-btn" 
                  onClick={() => setShowWFHForm(false)}
                  style={{ background: '#6b7280' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div style={{ padding: '20px', background: '#f9fafb', borderRadius: '12px' }}>
            <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: '600' }}>Your Access Information</h3>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px' }}>
                <MapPin size={16} style={{ display: 'inline', marginRight: '6px' }} />
                Location
              </label>
              <p style={{ color: '#6b7280', fontSize: '14px' }}>
                {location 
                  ? `Lat: ${location.latitude.toFixed(6)}, Lon: ${location.longitude.toFixed(6)}`
                  : 'Location not detected'}
              </p>
              {!location && (
                <button onClick={getUserLocation} className="primary-btn" style={{ marginTop: '8px' }}>
                  Detect Location
                </button>
              )}
            </div>

            <div className="form-group">
              <label>
                <Wifi size={16} style={{ display: 'inline', marginRight: '6px' }} />
                WiFi SSID
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="Enter WiFi SSID (e.g., OfficeWiFi)"
                value={wifiSSID}
                onChange={(e) => setWifiSSID(e.target.value)}
                data-testid="wifi-ssid-input"
              />
              <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '6px' }}>
                Note: Browser cannot auto-detect WiFi SSID. Please enter manually.
              </p>
            </div>
          </div>
        </div>

        <div className="dashboard-section">
          <div className="section-header">
            <h2 className="section-title">Available Files</h2>
          </div>

          {wfhStatus?.status === 'approved' && (
            <div style={{ padding: '12px', background: '#d1fae5', borderRadius: '8px', marginBottom: '20px', color: '#065f46' }}>
              <strong>✓ Work From Home Approved</strong> - You can access files without location/WiFi/time restrictions
            </div>
          )}

          <div className="file-grid">
            {files.map((file) => (
              <div 
                key={file.file_id} 
                className="file-card"
                onClick={() => handleFileAccess(file)}
                data-testid={`file-card-${file.file_id}`}
              >
                <div className="file-icon">
                  <FileText size={48} style={{ color: '#667eea' }} />
                </div>
                <div className="file-name">{file.filename}</div>
                <div className="file-size">{(file.size / 1024).toFixed(2)} KB</div>
                <div style={{ marginTop: '12px' }}>
                  <span className="badge badge-success">Encrypted</span>
                </div>
                <button 
                  className="primary-btn" 
                  style={{ marginTop: '12px', width: '100%', padding: '8px' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFileAccess(file);
                  }}
                  data-testid={`download-file-${file.file_id}`}
                >
                  <Download size={14} style={{ display: 'inline', marginRight: '6px' }} />
                  Access File
                </button>
              </div>
            ))}
          </div>

          {files.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
              <FileText size={64} style={{ marginBottom: '16px', opacity: 0.5 }} />
              <p>No files available</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default EmployeeDashboard;
