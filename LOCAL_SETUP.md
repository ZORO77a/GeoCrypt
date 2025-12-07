# Local Development Setup Guide - GeoCrypt

This guide will help you run both the frontend and backend locally on your machine.

## Prerequisites

- **Node.js** (v18+) and npm
- **Python** (v3.9+)
- **MongoDB** (running locally) - **REQUIRED**
- **Git** (optional)

## Architecture

- **Backend**: FastAPI server running on `http://localhost:8000`
- **Frontend**: React app running on `http://localhost:3000`
- **Database**: MongoDB on `mongodb://localhost:27017`

## Step 1: Install Dependencies

### Backend Setup

```bash
cd backend
pip install -r requirements.txt
```

### Frontend Setup

```bash
cd frontend
npm install
```

## Step 2: Verify MongoDB Connection

Ensure MongoDB is running locally:

```bash
# Check if MongoDB is running
mongosh --eval "db.version()"
```

If MongoDB is not running, install and start it:

**On Ubuntu/Debian:**
```bash
sudo apt-get install mongodb
sudo systemctl start mongodb
```

**On macOS:**
```bash
brew install mongodb-community
brew services start mongodb-community
```

## Step 3: Configure Environment Variables

### Backend (.env)

The backend `.env` is already configured:
- `MONGO_URL="mongodb://localhost:27017"` - Local MongoDB
- `DB_NAME="test_database"` - Test database
- `CORS_ORIGINS="*"` - Allow all origins (safe for local dev)

**File location:** `backend/.env`

### Frontend (.env)

The frontend `.env` is already configured for localhost:
- `REACT_APP_BACKEND_URL=http://localhost:8000` - Backend API endpoint
- `WDS_SOCKET_PORT=3000` - React dev server port

**File location:** `frontend/.env`

## Step 4: Start the Services

### Method 1: Terminal Tabs (Recommended for Development)

**Terminal 1 - Backend:**
```bash
cd backend
python server.py
```

The backend will start on `http://localhost:8000`
- API base: `http://localhost:8000/api`
- Docs: `http://localhost:8000/docs` (Swagger UI)

**Terminal 2 - Frontend:**
```bash
cd frontend
npm start
```

The frontend will start on `http://localhost:3000`

### Method 2: Using the Startup Script

Run both services with a single command:

```bash
chmod +x start-local.sh
./start-local.sh
```

This will open both services in separate terminal windows.

## Step 5: Access the Application

Open your browser and navigate to:
```
http://localhost:3000
```

### Login Credentials

**Admin Account:**
- Username: `admin`
- Password: `admin`
- Email: `ananthakrishnan272004@gmail.com`

## Default Configuration

The system initializes with:

### Geofence Config
- **Location**: Kochi, India (latitude: 10.8505, longitude: 76.2711)
- **Radius**: 500 meters
- **Work Hours**: 09:00 - 17:00
- **WiFi SSID**: OfficeWiFi

You can modify these through the Admin Dashboard after login.

## Troubleshooting

### Backend Issues

**Port 8000 already in use:**
```bash
# Find and kill the process using port 8000
lsof -i :8000
kill -9 <PID>
```

**MongoDB connection error:**
- Ensure MongoDB is running: `sudo systemctl status mongodb`
- Check connection string in `backend/.env`
- Try connecting: `mongosh --url "mongodb://localhost:27017"`

**Module import errors:**
- Reinstall dependencies: `pip install --upgrade -r requirements.txt`
- Verify Python version: `python --version` (should be 3.9+)

### Frontend Issues

**Port 3000 already in use:**
```bash
# Kill the process using port 3000
lsof -i :3000
kill -9 <PID>
```

**Module not found errors:**
- Clear node_modules: `rm -rf node_modules package-lock.json`
- Reinstall: `npm install`
- Clear npm cache: `npm cache clean --force`

**API connection errors:**
- Verify backend is running on `http://localhost:8000`
- Check `.env` file in `frontend/.env` has correct URL
- Check browser console for detailed errors

### Email/OTP Issues

The system uses Gmail for sending OTPs. Email configuration is in `backend/.env`:
```
GMAIL_USER="ananthakrshnang@gmail.com"
GMAIL_APP_PASSWORD="dhna wvvd ccrw hrdw"
```

If OTP sending fails:
1. Check email credentials in `.env`
2. Ensure less-secure app access is enabled on Gmail
3. Check backend logs for detailed error messages

## Testing the Integration

### Admin Flow:
1. Navigate to `http://localhost:3000`
2. Click "Admin Login"
3. Enter credentials: admin / admin
4. OTP will be sent to configured email
5. Enter OTP to complete login
6. Access Admin Dashboard

### Employee Flow:
1. Admin must first create an employee
2. Employee navigates to `http://localhost:3000`
3. Click "Employee Login"
4. Enter employee credentials
5. OTP will be sent to employee email
6. Access Employee Dashboard

## API Documentation

Once the backend is running, access the interactive API docs:
```
http://localhost:8000/docs
```

This provides a complete list of all available endpoints and their parameters.

## File Structure for Reference

```
geofence-emergent/
├── backend/
│   ├── server.py          # FastAPI application
│   ├── models.py          # Database models
│   ├── auth.py            # Authentication logic
│   ├── crypto_service.py  # File encryption
│   ├── email_service.py   # OTP email sending
│   ├── geofence.py        # Location validation
│   ├── ml_service.py      # Anomaly detection
│   ├── requirements.txt   # Python dependencies
│   └── .env               # Backend configuration
├── frontend/
│   ├── src/
│   │   ├── App.js         # Main component
│   │   ├── index.js       # Entry point
│   │   └── pages/         # Page components
│   ├── public/            # Static files
│   ├── package.json       # Node dependencies
│   └── .env               # Frontend configuration
└── LOCAL_SETUP.md         # This file
```

## Development Workflow

1. **Backend Development:**
   - Edit files in `backend/`
   - Server auto-reloads on changes (if using uvicorn with --reload)
   - Check logs in backend terminal

2. **Frontend Development:**
   - Edit files in `frontend/src/`
   - Browser auto-refreshes on changes
   - Check browser console for errors

3. **Database:**
   - Use MongoDB compass for GUI: `brew install mongodb-compass`
   - Or connect via command line: `mongosh`

## Production Deployment

This setup is for **local development only**. For production:

1. Update `CORS_ORIGINS` in backend `.env`
2. Change `SECRET_KEY` in backend `.env`
3. Update email credentials with production account
4. Implement proper SSL/HTTPS
5. Use environment-specific configuration
6. Consider using Docker for consistent environments

## Additional Resources

- **FastAPI Docs**: https://fastapi.tiangolo.com/
- **React Docs**: https://react.dev/
- **MongoDB Docs**: https://docs.mongodb.com/
- **Python Installation**: https://www.python.org/downloads/

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review backend logs: `backend/` terminal
3. Check frontend console: Browser DevTools (F12)
4. Check MongoDB connection: `mongosh`
