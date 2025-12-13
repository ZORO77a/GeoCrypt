import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { FileText, MapPin, Wifi, Clock, LogOut, Download } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function EmployeeDashboard() {
  const [files, setFiles] = useState([]);
  const [wfhStatus, setWfhStatus] = useState(null);
  const [serverTime, setServerTime] = useState(null);
  // Location state + persisted fallback
  const [location, setLocation] = useState(null);
  const lastKnownLocationRef = useRef(null);
  const [wifiSSID, setWifiSSID] = useState('');
  const lastKnownWifiRef = useRef(null);
  const [locationNotified, setLocationNotified] = useState(false);
  const [wifiNotified, setWifiNotified] = useState(false);
  const [lastWfhStatus, setLastWfhStatus] = useState(null);
  const [lastFilesAccessible, setLastFilesAccessible] = useState(false);
  const lastWfhStatusRef = useRef(null);
  const lastFilesAccessibleRef = useRef(false);

  // Keep refs in sync if state changes from other places
  useEffect(() => {
    lastWfhStatusRef.current = lastWfhStatus;
  }, [lastWfhStatus]);

  useEffect(() => {
    lastFilesAccessibleRef.current = lastFilesAccessible;
  }, [lastFilesAccessible]);
  const [wfhReason, setWfhReason] = useState('');
  const [showWFHForm, setShowWFHForm] = useState(false);
  const loadFailedRef = useRef(false);
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
    getWiFiSSID();

    // Refresh data every 10 seconds to detect WFH window changes dynamically
    const interval = setInterval(loadData, 10000);
    
    return () => clearInterval(interval);
  }, [token]);

  // Attempt to hydrate last-known location/wifi from localStorage on initial mount
  useEffect(() => {
    try {
      const storedLoc = localStorage.getItem('lastKnownLocation');
      if (storedLoc) {
        const parsed = JSON.parse(storedLoc);
        if (parsed && Number.isFinite(parsed.latitude) && Number.isFinite(parsed.longitude)) {
          lastKnownLocationRef.current = parsed;
        }
      }
      const storedWifi = localStorage.getItem('lastKnownWifi');
      if (storedWifi) {
        lastKnownWifiRef.current = storedWifi;
        // If wifiSSID is empty (state not set), seed it from last-known value so UI shows it
        if (!wifiSSID) setWifiSSID(storedWifi);
      }
    } catch (e) {
      // ignore parsing errors
    }
  }, []);

  // Keep the file list updated when geo/wifi changes but avoid re-running getUserLocation/getWiFiSSID
  useEffect(() => {
    if (!token) return;
    loadData();
  }, [location, wifiSSID]);

  const getUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
          setLocation(newLocation);
          lastKnownLocationRef.current = newLocation;
          try { localStorage.setItem('lastKnownLocation', JSON.stringify(newLocation)); } catch (e) { /* ignore */ }
          if (!locationNotified) {
            toast.success('Location detected');
            setLocationNotified(true);
          }
        },
        (error) => {
          if (!locationNotified) {
            toast.error('Please enable location access');
            setLocationNotified(true);
          }
        }
      );
    } else {
      toast.error('Geolocation not supported');
    }
  };

  const getWiFiSSID = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.get(`${API}/wifi-ssid`, { headers });
      if (response.data.ssid) {
        setWifiSSID(response.data.ssid);
        lastKnownWifiRef.current = response.data.ssid;
        try { localStorage.setItem('lastKnownWifi', response.data.ssid); } catch (e) { /* ignore */ }
        if (!wifiNotified) {
          toast.success(`WiFi detected: ${response.data.ssid}`);
          setWifiNotified(true);
        }
      } else {
        if (!wifiNotified) {
          toast.info('Could not detect WiFi. Please enter manually.');
          setWifiNotified(true);
        }
      }
    } catch (error) {
      console.error('Failed to detect WiFi SSID', error);
      // Silently fail - user can enter manually
    }
  };

  const loadData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const params = {};
      const locToUse = location || lastKnownLocationRef.current;
      const wifiToUse = wifiSSID || lastKnownWifiRef.current;
      if (locToUse) {
        params.latitude = locToUse.latitude;
        params.longitude = locToUse.longitude;
      }
      if (wifiToUse) {
        params.wifi_ssid = wifiToUse;
      }

      console.debug('Loading files with params:', params);
      const [filesRes, wfhRes, timeRes] = await Promise.all([
        axios.get(`${API}/files`, { headers, params }),
        axios.get(`${API}/wfh-request/status`, { headers }),
        axios.get(`${API}/time`, { headers })
      ]);

      setFiles(filesRes.data);
      setWfhStatus(wfhRes.data);
      if (timeRes?.data?.server_time) {
        setServerTime(timeRes.data.server_time);
      }

      // WFH status toast only when it changes
      const statusStr = wfhRes.data?.status || 'none';
      if (statusStr !== lastWfhStatusRef.current) {
        setLastWfhStatus(statusStr);
        lastWfhStatusRef.current = statusStr;
        if (statusStr === 'approved') {
          toast.success('Work From Home approved');
        } else if (statusStr === 'pending') {
          toast.info('Work From Home request pending');
        } else if (statusStr === 'rejected') {
          toast.error('Work From Home request rejected');
        } else {
          // none - do not show
        }
      }

      // Files accessible state - notify only on transition from not accessible -> accessible
      const anyAccessible = Array.isArray(filesRes.data) && filesRes.data.some(f => f.accessible);
      if (anyAccessible && !lastFilesAccessibleRef.current) {
        toast.success('Files are now accessible');
      }
      setLastFilesAccessible(anyAccessible);
      lastFilesAccessibleRef.current = anyAccessible;
      loadFailedRef.current = false;
    } catch (error) {
      if (!loadFailedRef.current) {
        toast.error('Failed to load data');
        loadFailedRef.current = true;
      }
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/employee/login');
  };

  const handleFileAccess = async (file) => {
    const locToUse = location || lastKnownLocationRef.current;
    const wifiToUse = wifiSSID || lastKnownWifiRef.current;

    // Determine if WFH bypass is active for this employee
    let wfhActive = false;
    if (wfhStatus && wfhStatus.status === 'approved') {
      try {
        if (wfhStatus.access_start && wfhStatus.access_end) {
          const start = new Date(wfhStatus.access_start);
          const end = new Date(wfhStatus.access_end);
          const now = new Date();
          if (start <= now && now <= end) {
            wfhActive = true;
          }
        }
      } catch (e) {
        // If parsing fails, treat as not active
      }
    }

    if (!wfhActive) {
      if (!locToUse) {
        toast.error('Location not detected. Please enable location access.');
        return;
      }
      if (!wifiToUse) {
        toast.error('Please enter WiFi SSID');
        return;
      }
    }

    try {
      console.debug('Attempting file access POST payload:', {
        file_id: file.file_id,
        latitude: locToUse.latitude,
        longitude: locToUse.longitude,
        wifi_ssid: wifiToUse
      });
      const payload = { file_id: file.file_id };
      if (!wfhActive) {
        payload.latitude = locToUse.latitude;
        payload.longitude = locToUse.longitude;
        payload.wifi_ssid = wifiToUse;
      }

      const response = await axios.post(
        `${API}/files/access`,
        payload,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );

      // When a blob is returned, create download link
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('File downloaded successfully');
    } catch (error) {
      // Parse JSON error if returned as blob when responseType='blob'
      let detail = error.response?.data?.detail;
      if (!detail && error.response && error.response.data instanceof Blob) {
        try {
          // Read blob text
          const text = await error.response.data.text();
          const parsed = JSON.parse(text);
          detail = parsed?.detail || text;
        } catch (err) {
          // ignore parsing errors
          detail = null;
        }
      }

      let errorMsg = 'Access denied';
      if (Array.isArray(detail)) {
        errorMsg = detail.map(d => d.msg || JSON.stringify(d)).join('; ');
      } else if (typeof detail === 'string') {
        errorMsg = detail;
      } else if (detail && typeof detail === 'object') {
        // If the server returned a structured validation result
        errorMsg = detail.reason || JSON.stringify(detail);
      }
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
      const detail = error.response?.data?.detail;
      let msg = 'Failed to submit request';
      if (Array.isArray(detail)) {
        msg = detail.map(d => d.msg || JSON.stringify(d)).join('; ');
      } else if (typeof detail === 'string') {
        msg = detail;
      }
      toast.error(msg);
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ color: '#111827', fontSize: '13px', fontWeight: 600 }}>
            { (location || lastKnownLocationRef.current) || wifiSSID || lastKnownWifiRef.current ? (
              <>
                Querying with:&nbsp;
                { (location || lastKnownLocationRef.current) ? `Lat: ${(location || lastKnownLocationRef.current).latitude.toFixed(5)}, Lon: ${(location || lastKnownLocationRef.current).longitude.toFixed(5)}` : ''}
                {location && wifiSSID ? ' | ' : ''}
                {(wifiSSID || lastKnownWifiRef.current) ? `WiFi: ${wifiSSID || lastKnownWifiRef.current}` : ''}
              </>
            ) : (
              'Querying with: No location or WiFi selected'
            )}
          </div>
          <div>
            <button
              className="secondary-btn"
              onClick={() => {
                localStorage.removeItem('lastKnownLocation');
                localStorage.removeItem('lastKnownWifi');
                lastKnownLocationRef.current = null;
                lastKnownWifiRef.current = null;
                setLocation(null);
                setWifiSSID('');
                toast.success('Cleared saved location and WiFi');
                loadData();
              }}
              style={{ marginLeft: '12px' }}
            >
              Clear Saved
            </button>
          </div>
        </div>
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
              {new Date().toLocaleTimeString()} {serverTime ? `(server: ${new Date(serverTime).toLocaleTimeString()})` : ''}
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
            <button
              className="secondary-btn"
              style={{ marginLeft: '12px' }}
              onClick={() => loadData()}
              data-testid="refresh-data-btn"
            >
              Refresh Data
            </button>
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
              <p style={{ color: '#111827', fontSize: '14px' }}>
                {(() => {
                  const loc = location || lastKnownLocationRef.current;
                  if (loc && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)) {
                    return `Lat: ${loc.latitude.toFixed(6)}, Lon: ${loc.longitude.toFixed(6)}`;
                  }
                  return 'Location not detected';
                })()}
              </p>
              {!location && (
                <button onClick={getUserLocation} className="primary-btn" style={{ marginTop: '8px' }}>
                  Detect Location
                </button>
              )}
              {(!location && lastKnownLocationRef.current) && (
                <div style={{ marginTop: '8px', color: '#111827', fontSize: '12px' }}>
                  Using last known location from previous session
                </div>
              )}
              {/* Manual location entry removed per user preference; auto-detected location is used and persisted */}
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
                onChange={(e) => {
                  setWifiSSID(e.target.value);
                  lastKnownWifiRef.current = e.target.value;
                  try { localStorage.setItem('lastKnownWifi', e.target.value); } catch (err) { }
                }}
                data-testid="wifi-ssid-input"
              />
              <button
                className="primary-btn"
                style={{ marginLeft: '8px', marginTop: '8px' }}
                onClick={getWiFiSSID}
                data-testid="detect-wifi-btn"
              >
                Detect WiFi
              </button>
              <p style={{ fontSize: '12px', color: '#111827', marginTop: '6px' }}>
                Note: Your browser typically cannot auto-detect the WiFi SSID. Click "Detect WiFi" to attempt a system-level detection which may work in some environments.
              </p>
              {(!wifiSSID && lastKnownWifiRef.current) && (
                <div style={{ marginTop: '6px', color: '#111827', fontSize: '12px' }}>
                  Using last known WiFi: {lastKnownWifiRef.current}
                </div>
              )}
            </div>

            {/* WFH Access Window Display */}
            <div style={{ marginTop: '16px' }}>
              <h4 style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>WFH Access Window</h4>
              {wfhStatus?.status === 'approved' ? (
                (() => {
                  const start = wfhStatus.access_start ? new Date(wfhStatus.access_start) : null;
                  const end = wfhStatus.access_end ? new Date(wfhStatus.access_end) : null;
                  const now = new Date();
                  const within = start && end ? (now >= start && now <= end) : false;
                  const expired = end ? (now > end) : false;

                  return (
                    <div style={{ color: within ? '#065f46' : '#6b7280' }}>
                      <div style={{ fontSize: '14px' }}>
                        <strong>Start:</strong> {start ? start.toLocaleString() : 'Not set'}
                      </div>
                      <div style={{ fontSize: '14px' }}>
                        <strong>End:</strong> {end ? end.toLocaleString() : 'Not set'}
                      </div>
                      {wfhStatus.admin_comment && (
                        <div style={{ fontSize: '14px', marginTop: '8px' }}>
                          <strong>Admin Comment:</strong> {wfhStatus.admin_comment}
                        </div>
                      )}
                      <div style={{ marginTop: '8px', fontWeight: 600 }}>
                        {expired ? (
                          <span style={{ color: '#b91c1c' }}>✗ Access window expired</span>
                        ) : within ? (
                          <span style={{ color: '#065f46' }}>✓ Within approved window</span>
                        ) : (
                          <span style={{ color: '#b91c1c' }}>✗ Outside approved window</span>
                        )}
                      </div>
                    </div>
                  );
                })()
              ) : wfhStatus?.status === 'pending' ? (
                <div style={{ color: '#92400e' }}>Your WFH request is pending approval.</div>
              ) : wfhStatus?.status === 'rejected' ? (
                <div style={{ padding: '12px', background: '#fee2e2', borderRadius: '8px', color: '#991b1b' }}>
                  <div style={{ fontWeight: 600, marginBottom: '8px' }}>⚠️ Request Rejected</div>
                  <div style={{ fontSize: '14px' }}>
                    Your WFH request has been rejected by the admin.
                  </div>
                  {wfhStatus.admin_comment && (
                    <div style={{ fontSize: '14px', marginTop: '8px' }}>
                      <strong>Reason:</strong> {wfhStatus.admin_comment}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ color: '#6b7280' }}>No WFH approval found.</div>
              )}
            </div>
          </div>
        </div>

        <div className="dashboard-section">
          <div className="section-header">
            <h2 className="section-title">Available Files</h2>
          </div>

          {(() => {
            // Check if WFH is approved and within time window
            const wfhApproved = wfhStatus?.status === 'approved';
            const start = wfhApproved && wfhStatus.access_start ? new Date(wfhStatus.access_start) : null;
            const end = wfhApproved && wfhStatus.access_end ? new Date(wfhStatus.access_end) : null;
            const now = new Date();
            const withinWindow = start && end ? (now >= start && now <= end) : false;
            const expired = end ? (now > end) : false;

            // We always show the list of files but indicate accessibility per file
            return (
              <>
                {wfhApproved && withinWindow && (
                  <div style={{ padding: '12px', background: '#d1fae5', borderRadius: '8px', marginBottom: '20px', color: '#065f46' }}>
                    <strong>✓ Work From Home Approved</strong> - You can access files without location/WiFi/time restrictions
                  </div>
                )}

                {wfhApproved && expired && (
                  <div style={{ padding: '12px', background: '#fee2e2', borderRadius: '8px', marginBottom: '20px', color: '#991b1b' }}>
                    <strong>✗ Access Window Expired</strong> - Your WFH access period has ended. You will need to be in the allowed location/WiFi/time to access files.
                  </div>
                )}

                {wfhApproved && !expired && !withinWindow && (
                  <div style={{ padding: '12px', background: '#fef3c7', borderRadius: '8px', marginBottom: '20px', color: '#92400e' }}>
                    <strong>⏳ Outside Access Window</strong> - You are outside your approved WFH time window. Files remain accessible only within the window or when in allowed location/WiFi.
                  </div>
                )}

                {wfhStatus?.status === 'pending' && (
                  <div style={{ padding: '12px', background: '#fef3c7', borderRadius: '8px', marginBottom: '20px', color: '#92400e' }}>
                    <strong>⏳ WFH Pending</strong> - Your WFH request is pending approval. Files can still be seen but are inaccessible unless you meet location/WiFi/time constraints.
                  </div>
                )}

                {!wfhApproved && wfhStatus?.status !== 'pending' && (
                  <div style={{ padding: '12px', background: '#fee2e2', borderRadius: '8px', marginBottom: '20px', color: '#991b1b' }}>
                    <strong>✗ No WFH Approval</strong> - Files are visible but accessible only when you meet the admin-specified location/WiFi/time constraints.
                    {!location && !wifiSSID && (
                      <div style={{ marginTop: '8px', color: '#6b7280' }}>
                        Please detect your Location and/or enter your WiFi SSID, then click "Refresh Data" to re-check accessibility.
                      </div>
                    )}
                  </div>
                )}

                <div className="file-grid">
                  {files.length > 0 ? (
                    files.map((file) => (
                      <div 
                        key={file.file_id} 
                        className="file-card"
                        data-testid={`file-card-${file.file_id}`}
                      >
                        <div className="file-icon">
                          <FileText size={48} style={{ color: '#667eea' }} />
                        </div>
                        <div className="file-name">{file.filename}</div>
                        <div className="file-size">{(file.size / 1024).toFixed(2)} KB</div>
                        <div style={{ marginTop: '12px' }}>
                          <span className="badge badge-success">Encrypted</span>
                          {!file.accessible && (
                            <span className="badge badge-warning" style={{ marginLeft: '8px' }} title={file.access_reason || 'Locked'}>
                              Locked
                            </span>
                          )}
                        </div>
                        {!file.accessible && file.access_reason && (
                          <div style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280' }}>{file.access_reason}</div>
                        )}
                        {file.validations && (
                          <div style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280' }}>
                            <div><strong>Validation:</strong></div>
                            <div style={{ fontSize: '11px' }}>Location: {file.validations.location}</div>
                            <div style={{ fontSize: '11px' }}>WiFi: {file.validations.wifi}</div>
                            <div style={{ fontSize: '11px' }}>Time: {file.validations.time}</div>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                          <button 
                            className="primary-btn" 
                            style={{ width: '100%' }}
                            data-testid={`download-btn-${file.file_id}`}
                            onClick={() => file.accessible ? handleFileAccess(file) : toast.error(file.access_reason || 'File is locked')}
                            disabled={!file.accessible}
                          >
                            <Download size={16} style={{ display: 'inline', marginRight: '6px' }} />
                            {file.accessible ? 'Download' : 'Locked'}
                          </button>
                          <button
                            className="secondary-btn"
                            style={{ width: '120px' }}
                            onClick={async () => {
                              try {
                                const headers = { Authorization: `Bearer ${token}` };
                                const params = {};
                                const locToUse = location || lastKnownLocationRef.current;
                                const wifiToUse = wifiSSID || lastKnownWifiRef.current;
                                if (locToUse) { params.latitude = locToUse.latitude; params.longitude = locToUse.longitude; }
                                if (wifiToUse) { params.wifi_ssid = wifiToUse; }
                                const res = await axios.get(`${API}/validate-access`, { headers, params });
                                if (res?.data) {
                                  const d = res.data;
                                  toast(`${d.reason}. validation: location=${d.validations.location}, wifi=${d.validations.wifi}, time=${d.validations.time}`);
                                }
                              } catch (e) {
                                toast.error('Failed to validate access');
                              }
                            }}
                          >
                            Validate
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#6b7280', padding: '20px' }}>
                      No files available
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

export default EmployeeDashboard;
