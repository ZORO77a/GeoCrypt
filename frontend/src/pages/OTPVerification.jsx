import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function OTPVerification() {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendNotified, setResendNotified] = useState(false);
  const [otpTimer, setOtpTimer] = useState(300); // 5 minutes = 300 seconds
  const navigate = useNavigate();
  const location = useLocation();
  const inputRefs = useRef([]);

  const { username, role, debug_otp } = location.state || {};

  useEffect(() => {
    if (!username || !role) {
      toast.error('Invalid session');
      navigate('/admin/login');
      return;
    }
    if (debug_otp) {
      toast.success(`Dev OTP: ${debug_otp}`);
    }
  }, [username, role, debug_otp, navigate]);

  // OTP Timer
  useEffect(() => {
    if (otpTimer <= 0) {
      toast.error('OTP has expired. Please request a new one.');
      return;
    }

    const timer = setInterval(() => {
      setOtpTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [otpTimer]);

  const handleChange = (index, value) => {
    if (value.length > 1) value = value[0];
    if (!/^[0-9]*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    const otpCode = otp.join('');

    if (otpCode.length !== 6) {
      toast.error('Please enter complete OTP');
      return;
    }

    if (otpTimer <= 0) {
      toast.error('OTP has expired. Please request a new one.');
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post(`${API}/auth/verify-otp`, {
        username,
        otp: otpCode
      });

      localStorage.setItem('token', response.data.access_token);
      localStorage.setItem('username', username);
      localStorage.setItem('role', role);

      toast.success('Login successful!');
      
      if (role === 'admin') {
        navigate('/admin/dashboard');
      } else {
        navigate('/employee/dashboard');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!username) {
      toast.error('Invalid session');
      return;
    }
    if (resendCooldown && resendCooldown > 0) return;

    setResending(true);
    try {
      await axios.post(`${API}/auth/resend-otp`, { username });
      toast.success('OTP resent to your email');
      setResendCooldown(30);
      setResendNotified(true);
      // Decrement cooldown
      const interval = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (error) {
      if (error.response?.status === 429) {
        toast.error(error.response?.data?.detail || 'Too many requests. Please wait.');
      } else {
        toast.error(error.response?.data?.detail || 'Failed to resend OTP');
      }
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="login-container" data-testid="otp-verification-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">🔒</div>
          <h1 className="login-title">Verify OTP</h1>
          <p className="login-subtitle">Enter the code sent to your email</p>
          {debug_otp && (
            <p style={{ color: '#14b8a6', fontWeight: '600', marginTop: '0.5rem' }}>
              Dev OTP: {debug_otp}
            </p>
          )}
        </div>

        <form onSubmit={handleVerify}>
          <div className="otp-container">
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                type="text"
                maxLength="1"
                className="otp-input"
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                data-testid={`otp-input-${index}`}
              />
            ))}
          </div>

          <button 
            type="submit" 
            className="submit-btn" 
            disabled={loading || otpTimer <= 0}
            data-testid="verify-otp-btn"
          >
            {loading ? 'Verifying...' : 'Verify OTP'}
          </button>
        </form>

        <div className="login-footer">
          <p style={{ 
            color: otpTimer <= 60 ? '#dc2626' : '#6b7280', 
            fontSize: '14px',
            fontWeight: otpTimer <= 60 ? 'bold' : 'normal'
          }}>
            OTP expires in {Math.floor(otpTimer / 60)}:{(otpTimer % 60).toString().padStart(2, '0')}
            {otpTimer <= 60 && ' ⚠️'}
          </p>
          <div style={{ marginTop: '8px' }}>
            <button
              className="resend-btn"
              onClick={handleResend}
              disabled={resendCooldown > 0 || resending}
              data-testid="resend-otp-btn"
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : resending ? 'Resending...' : 'Resend OTP'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OTPVerification;
