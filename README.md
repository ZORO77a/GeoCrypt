# GeoCrypt - Geofencing Based Access Control System

> Geolocation-based Access Control System with Encryption and Anomaly Detection

## 🚀 Quick Start (LOCAL SETUP)

**TL;DR**: Run this command to start everything:
```bash
python3 start-local.py
```

Then open: **http://localhost:3000**

### Default Admin Credentials
- **Username:** `admin`
- **Password:** `admin` (local development; update `backend/.env` `ADMIN_PASSWORD` before production)
- **Email:** `ananthakrishnan272004@gmail.com`

### Service URLs (Local)
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000
- **API Docs:** http://localhost:8000/docs
- **Database:** mongodb://localhost:27017

### Setup Guides
- **Quick Start (3 steps):** See `QUICK_START.md` ⭐
- **Comprehensive Guide:** See `LOCAL_SETUP.md`

## Features

✅ **Admin Dashboard**
- Employee management (create, view, delete)
- File upload with post-quantum encryption
- Access log monitoring
- Work from home request approval
- Geofence configuration
- ML-based anomaly detection

✅ **Employee Dashboard**
- Geolocation-based file access
- WiFi SSID validation
- Time-based restrictions
- Work from home requests
- Secure file download

✅ **Security**
- Two-factor authentication (OTP via email)
- AES-256 encryption (quantum-resistant)
- JWT token authentication
- Role-based access control
- Activity logging

✅ **Geofencing**
- Location validation using Haversine formula
- WiFi SSID matching
- Time-based access control
- Configurable by admin

✅ **AI Monitoring**
- Machine learning anomaly detection
- Pattern analysis (scikit-learn)
- Risk level assessment
- Suspicious activity alerts

## Technology Stack

**Backend:**
- FastAPI (Python)
- MongoDB + GridFS
- PyCryptodome (AES-256)
- scikit-learn (ML)
- aiosmtplib (Email)

**Frontend:**
- React 19
- Axios
- React Router
- Tailwind CSS
- Lucide React (Icons)

## How It Works

### 1. Authentication Flow
```
Login → OTP via Email → Verify OTP → Dashboard Access
```

### 2. Employee File Access
```
Employee clicks file → System validates:
├─ Location (within geofence radius)
├─ WiFi (matches allowed SSID)
└─ Time (within working hours)

If WFH approved → Bypass all checks
If all pass → Decrypt & download file
If any fail → Deny & log reason
```

### 3. File Encryption
```
Upload → Generate Key → AES-256 Encrypt → Store in GridFS
Download → Validate Access → Decrypt → Send to User
```

## Configuration

### Geofence Settings (Admin Dashboard)
- **Latitude/Longitude:** Office location coordinates
- **Radius:** Allowed distance in meters (default: 500m)
- **WiFi SSID:** Allowed network name (default: "OfficeWiFi")
- **Working Hours:** Start and end time (default: 09:00 - 17:00)

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login and send OTP
- `POST /api/auth/verify-otp` - Verify OTP and get token

### Admin
- `POST /api/admin/employees` - Create employee
- `GET /api/admin/employees` - List employees
- `DELETE /api/admin/employees/{username}` - Delete employee
- `GET /api/admin/access-logs` - View access logs
- `GET /api/admin/wfh-requests` - View WFH requests
- `PUT /api/admin/wfh-requests/{username}` - Approve/reject
- `GET /api/admin/geofence-config` - Get configuration
- `PUT /api/admin/geofence-config` - Update configuration
- `GET /api/admin/analytics/{username}` - Get ML analytics

### Files
- `POST /api/files/upload` - Upload and encrypt file
- `GET /api/files` - List all files
- `POST /api/files/access` - Access file with validation

### Employee
- `POST /api/wfh-request` - Submit WFH request
- `GET /api/wfh-request/status` - Check WFH status

## Testing Instructions

### 1. Test Admin Login
1. Go to admin login page
2. Enter credentials: `admin` / `admin`
3. Check email for OTP
4. Enter OTP to access dashboard

### 2. Create Employee
1. In admin dashboard, go to "Manage Employees"
2. Fill form: username, email, password
3. Click "Create Employee"

### 3. Upload File
1. In admin dashboard, go to "Manage Files"
2. Click upload zone and select file
3. File will be encrypted and stored

### 4. Test Employee Access
1. Login as employee
2. Allow location permission
3. Enter WiFi SSID
4. Click on file to download
5. System validates all conditions

### 5. Test WFH Request
1. In employee dashboard, click "Request Work From Home"
2. Enter reason and submit
3. Admin approves in WFH requests section
4. Employee can now access files without restrictions

## Security Notes

⚠️ **Important:**
- Change `SECRET_KEY` in production
- Use strong passwords for admin account
- Keep Gmail app password secure
- Enable HTTPS in production
- Rotate encryption keys periodically

## Gmail SMTP Setup

1. Enable 2-Step Verification: https://myaccount.google.com/security
2. Generate App Password: https://myaccount.google.com/apppasswords
3. Add to `/app/backend/.env`:
```env
GMAIL_USER="your-email@gmail.com"
GMAIL_APP_PASSWORD="your-16-char-password"
```

## Project Structure

```
/app/
├── backend/
│   ├── server.py              # Main FastAPI app
│   ├── models.py              # Data models
│   ├── auth.py                # Authentication
│   ├── email_service.py       # Email service
│   ├── crypto_service.py      # Encryption
│   ├── geofence.py            # Geofencing
│   ├── ml_service.py          # ML analytics
│   ├── requirements.txt       # Dependencies
│   └── .env                   # Environment vars
├── frontend/
│   └── src/
│       ├── App.js             # Main component
│       ├── App.css            # Styles
│       └── pages/             # Page components
│           ├── AdminLogin.jsx
│           ├── EmployeeLogin.jsx
│           ├── OTPVerification.jsx
│           ├── AdminDashboard.jsx
│           └── EmployeeDashboard.jsx
├── TUTORIAL.md                # Complete tutorial
└── README.md                  # This file
```

## Troubleshooting

**OTP not received?**
- Check spam folder
- Verify Gmail credentials in .env
- Ensure 2-Step Verification is enabled

**Location not detected?**
- Enable browser location permissions
- Use HTTPS (required by browsers)
- Click "Detect Location" button

**File access denied?**
- Check if within geofence radius
- Verify WiFi SSID matches
- Ensure within working hours
- Or request WFH approval

**Backend not running?**
```bash
sudo supervisorctl status backend
sudo supervisorctl restart backend
```

## Documentation

See `TUTORIAL.md` for:
- Complete feature documentation
- API reference with examples
- Code explanations
- Deployment guide
- Security best practices

---

**Built with ❤️ for secure file access control**
