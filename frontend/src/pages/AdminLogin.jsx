import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post(`${API}/auth/login`, {
        username,
        password
      });

      if (response.data.role === 'admin') {
        toast.success('OTP sent to your email!');
        navigate('/verify-otp', { state: { username, role: 'admin' } });
      } else {
        toast.error('Admin access only');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container" data-testid="admin-login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">G</div>
          <h1 className="login-title">Admin Login</h1>
          <p className="login-subtitle">GeoCrypt Access Control System</p>
        </div>

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
              data-testid="admin-username-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              data-testid="admin-password-input"
            />
          </div>

          <button 
            type="submit" 
            className="submit-btn" 
            disabled={loading}
            data-testid="admin-login-btn"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className="login-footer">
          <a href="/employee/login">Employee Login</a>
        </div>
      </div>
    </div>
  );
}

export default AdminLogin;
