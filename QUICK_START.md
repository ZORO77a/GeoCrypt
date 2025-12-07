# Quick Start Guide - GeoCrypt Local Setup

## Fastest Way to Get Started (3 Steps)

### Prerequisites
**MongoDB MUST be running before anything else!**

```bash
# Check if MongoDB is running
mongosh --eval "db.version()"
```

If MongoDB is not running, see **MONGODB_SETUP.md** for installation instructions.

### Step 1: Install Dependencies
```bash
# Backend
cd backend
pip install -r requirements.txt
cd ..

# Frontend
cd frontend
npm install
cd ..
```

### Step 2: Start Both Services
Choose one method:

**Option A: Python Script (Recommended)**
```bash
python3 start-local.py
```

**Option B: Bash Script**
```bash
chmod +x start-local.sh
./start-local.sh
```

**Option C: Manual (Two Terminal Tabs)**
```bash
# Terminal 1
cd backend && python3 server.py

# Terminal 2
cd frontend && npm start
```

### Step 3: Access the Application
- **Frontend**: http://localhost:3000
- **API Docs**: http://localhost:8000/docs
- **Login**: admin / admin

## Requirements
- Python 3.9+
- Node.js 18+
- **MongoDB running on localhost:27017** ⚠️ CRITICAL

**Don't have MongoDB?** See MONGODB_SETUP.md for quick installation.

## Configuration

### What's Already Configured:
✓ Backend `.env` - points to localhost MongoDB  
✓ Frontend `.env` - points to localhost backend  
✓ CORS - enabled for localhost  
✓ Default admin account - admin/admin  

### To Change Geofence Location/Settings:
1. Login as admin
2. Go to Settings in Admin Dashboard
3. Update geofence coordinates and radius

## Troubleshooting

**MongoDB not running?**
```bash
# Ubuntu/Debian
sudo systemctl start mongodb

# macOS
brew services start mongodb-community
```

**Port already in use?**
```bash
# Kill process on port 8000 (backend)
lsof -i :8000 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Kill process on port 3000 (frontend)
lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs kill -9
```

**Module errors?**
```bash
# Reinstall backend
cd backend && pip install --upgrade -r requirements.txt

# Reinstall frontend
cd frontend && rm -rf node_modules package-lock.json && npm install
```

## Next Steps

- See **LOCAL_SETUP.md** for comprehensive documentation
- Visit http://localhost:8000/docs for API documentation
- Create test employees in Admin Dashboard
- Test WFH requests and geofence validation

## Project Structure

```
├── backend/           → FastAPI server
├── frontend/          → React application
├── LOCAL_SETUP.md     → Full setup guide
├── start-local.sh     → Bash startup script
└── start-local.py     → Python startup script
```

Happy coding! 🚀
