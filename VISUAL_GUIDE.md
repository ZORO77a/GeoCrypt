# 🚀 GeoCrypt Local Setup - Visual Quick Reference

## One-Command Start

```bash
python3 start-local.py
```

Then open: **http://localhost:3000**

---

## 📊 Service Diagram

```
Your Machine
│
├─ Frontend (React)          http://localhost:3000
│  └─ Port 3000 ✓
│
├─ Backend (FastAPI)         http://localhost:8000
│  └─ Port 8000 ✓
│
└─ Database (MongoDB)        mongodb://localhost:27017
   └─ Port 27017 ✓
```

---

## 🔐 Login & Navigation

```
http://localhost:3000
│
├─ Admin Login
│  ├─ Username: admin
│  ├─ Password: admin
│  └─ → Admin Dashboard
│     ├─ Employee Management
│     ├─ File Management
│     ├─ Access Logs
│     ├─ WFH Requests
│     └─ Geofence Config
│
└─ Employee Login
   ├─ Username: (created by admin)
   ├─ Password: (created by admin)
   └─ → Employee Dashboard
      ├─ View Profile
      ├─ Request WFH
      └─ Download Files
```

---

## 📋 Setup Checklist

- [ ] Python 3.9+ installed (`python3 --version`)
- [ ] Node.js 18+ installed (`node --version`)
- [ ] MongoDB running (`mongosh --eval "db.version()"`)
- [ ] Clone/Extract project
- [ ] Dependencies installed (`python3 start-local.py` does this)
- [ ] Services running (`python3 start-local.py`)
- [ ] Access http://localhost:3000
- [ ] Login with admin/admin
- [ ] ✅ Done!

---

## 🛠️ Troubleshooting Quick Links

| Issue | Solution |
|-------|----------|
| MongoDB not running | See **LOCAL_SETUP.md** → Troubleshooting |
| Port already in use | See **LOCAL_SETUP.md** → Troubleshooting |
| Dependencies fail | See **LOCAL_SETUP.md** → Troubleshooting |
| API connection error | Check Frontend `.env` has correct URL |
| Email OTP fails | Check Gmail credentials in Backend `.env` |

---

## 📁 Important Files

```
geofence-emergent/
│
├─ 🚀 start-local.py         ← RUN THIS FIRST!
├─ ⭐ QUICK_START.md           ← Read this second
│
├─ 📖 LOCAL_SETUP.md          ← Comprehensive guide
├─ 📝 SETUP_COMPLETE.md       ← Detailed info
├─ 📋 README.md               ← Project overview
│
├─ backend/
│  ├─ .env                    ← Already configured ✓
│  ├─ requirements.txt
│  └─ server.py
│
└─ frontend/
   ├─ .env                    ← Already configured ✓
   ├─ package.json
   └─ src/
```

---

## 🔄 Typical Workflow

### First Time Setup
```bash
# 1. Navigate to project
cd geofence-emergent

# 2. Run startup script (installs dependencies)
python3 start-local.py

# 3. Wait for both services to start (5-10 seconds)

# 4. Open browser
http://localhost:3000

# 5. Login
Username: admin
Password: admin
```

### Later Sessions
```bash
# Just run the startup script again
python3 start-local.py

# Services will start immediately (dependencies already installed)
```

### Manual Start (if needed)
```bash
# Terminal 1 - Backend
cd backend
python3 server.py

# Terminal 2 - Frontend
cd frontend
npm start
```

---

## 📚 Documentation Map

```
QUICK_START.md
├─ 3-step installation
├─ Default credentials
├─ Service URLs
└─ Basic troubleshooting

LOCAL_SETUP.md
├─ Detailed prerequisites
├─ Step-by-step setup
├─ Configuration details
├─ Comprehensive troubleshooting
└─ API documentation

SETUP_COMPLETE.md
├─ Changes made summary
├─ Architecture explanation
├─ Security notes
└─ Production checklist

README.md
├─ Project overview
├─ Features list
├─ Technology stack
└─ Learning resources
```

---

## 🎯 What Each Document Is For

| Document | Read When | Time |
|----------|-----------|------|
| **This File** | You need quick overview | 2 min |
| **QUICK_START.md** | Setting up for first time | 5 min |
| **LOCAL_SETUP.md** | Detailed help or troubleshooting | 15 min |
| **SETUP_COMPLETE.md** | Want full details of changes | 10 min |
| **README.md** | Understanding the project | 10 min |

---

## ✅ Verification Checklist

After running `python3 start-local.py`, verify:

- [ ] Backend terminal shows "Uvicorn running on http://0.0.0.0:8000"
- [ ] Frontend terminal shows "Compiled successfully!"
- [ ] Browser opens http://localhost:3000 automatically
- [ ] Login page appears with admin/employee options
- [ ] Can log in with admin/admin
- [ ] Admin Dashboard loads successfully

If any check fails, see **LOCAL_SETUP.md** troubleshooting section.

---

## 🚨 Common Issues & Quick Fixes

### Port 8000 already in use
```bash
lsof -i :8000 | grep LISTEN | awk '{print $2}' | xargs kill -9
```

### Port 3000 already in use
```bash
lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs kill -9
```

### MongoDB not running
```bash
# macOS
brew services start mongodb-community

# Ubuntu/Debian
sudo systemctl start mongodb
```

### Clear and reinstall
```bash
cd backend && pip install --upgrade -r requirements.txt && cd ..
cd frontend && rm -rf node_modules && npm install && cd ..
```

---

## 🔑 Key URLs & Credentials

| Item | Value |
|------|-------|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |
| MongoDB | mongodb://localhost:27017 |
| Admin Username | admin |
| Admin Password | admin |
| Admin Email | ananthakrishnan272004@gmail.com |

---

## 🎓 Learning Resources

While setup runs, learn about:
- **Geofencing**: Location-based access control
- **Encryption**: AES-256 file security
- **JWT**: Secure token authentication
- **Anomaly Detection**: ML-based threat detection
- **FastAPI**: Modern Python web framework
- **React**: UI component library

---

## 🚀 Ready?

```
1. Run: python3 start-local.py
2. Wait: 10 seconds for startup
3. Open: http://localhost:3000
4. Login: admin / admin
5. Enjoy! 🎉
```

For questions, check:
- QUICK_START.md (3-step guide)
- LOCAL_SETUP.md (detailed guide)
- http://localhost:8000/docs (API docs)

---

**Happy coding!** 🚀🔐
