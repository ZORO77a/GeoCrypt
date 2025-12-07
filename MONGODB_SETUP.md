# MongoDB Setup for GeoCrypt

MongoDB is **REQUIRED** for the GeoCrypt application to run. Here's how to install and start it.

## Installation

### Ubuntu / Debian / Kali Linux

```bash
# Update package manager
sudo apt-get update

# Install MongoDB
sudo apt-get install -y mongodb

# Start MongoDB service
sudo systemctl start mongodb

# Enable MongoDB to start on boot (optional)
sudo systemctl enable mongodb

# Verify MongoDB is running
sudo systemctl status mongodb
```

### macOS

```bash
# Using Homebrew
brew tap mongodb/brew

# Install MongoDB Community Edition
brew install mongodb-community

# Start MongoDB service
brew services start mongodb-community

# Verify MongoDB is running
brew services list | grep mongodb
```

### Windows

1. Download MongoDB Community Server from: https://www.mongodb.com/try/download/community
2. Run the installer and follow the installation wizard
3. MongoDB will typically start automatically after installation
4. Verify: Open PowerShell and run `mongosh`

### Docker (Alternative)

If you prefer to run MongoDB in Docker:

```bash
# Pull MongoDB image
docker pull mongo

# Run MongoDB container
docker run -d -p 27017:27017 --name geofence-mongodb mongo

# Verify running
docker ps | grep geofence-mongodb
```

---

## Verification

### Check MongoDB Connection

```bash
# Using mongosh (MongoDB Shell)
mongosh --eval "db.version()"

# Or connect to MongoDB
mongosh
# In the shell, type: db.version()
# Should return MongoDB version number
```

If you see a version number, MongoDB is running correctly!

---

## Starting/Stopping MongoDB

### Linux/Kali

```bash
# Start MongoDB
sudo systemctl start mongodb

# Stop MongoDB
sudo systemctl stop mongodb

# Check status
sudo systemctl status mongodb

# Restart MongoDB
sudo systemctl restart mongodb
```

### macOS

```bash
# Start MongoDB
brew services start mongodb-community

# Stop MongoDB
brew services stop mongodb-community

# Check status
brew services list
```

### Docker

```bash
# Start container
docker start geofence-mongodb

# Stop container
docker stop geofence-mongodb

# Remove container
docker rm geofence-mongodb
```

---

## Troubleshooting

### MongoDB not starting on Linux?

```bash
# Check if MongoDB service exists
sudo systemctl list-unit-files | grep mongodb

# Try manual installation
sudo apt-get remove mongodb
sudo apt-get clean
sudo apt-get update
sudo apt-get install -y mongodb

# Start service
sudo systemctl start mongodb
```

### Port 27017 already in use?

```bash
# Find process using port 27017
lsof -i :27017

# Kill the process
kill -9 <PID>

# Restart MongoDB
sudo systemctl restart mongodb
```

### Cannot connect to MongoDB?

```bash
# Test MongoDB connection
mongosh --eval "db.adminCommand('ping')"

# Check MongoDB logs
# Linux: journalctl -u mongodb
# macOS: /opt/homebrew/var/log/mongodb/mongo.log
```

### Using Docker and container won't start?

```bash
# Check Docker daemon
sudo systemctl start docker

# Check container logs
docker logs geofence-mongodb

# Remove old container and create new one
docker rm geofence-mongodb
docker run -d -p 27017:27017 --name geofence-mongodb mongo
```

---

## Verification Before Starting GeoCrypt

Before running `python3 start-local.py`, always verify:

```bash
# Test MongoDB connection
mongosh --eval "db.version()"
```

You should see output like:
```
6.0.0
```

If this fails, MongoDB is not running. Please install and start it using the instructions above.

---

## Next Steps

Once MongoDB is running and verified:

1. Run the startup script: `python3 start-local.py`
2. Open browser: http://localhost:3000
3. Login: admin / admin

---

## Default MongoDB Configuration

GeoCrypt uses:
- **Host**: localhost
- **Port**: 27017
- **Database**: test_database
- **No Authentication**: By default (can be added for production)

Connection string in `.env`:
```
MONGO_URL="mongodb://localhost:27017"
```

---

## Important Notes

- MongoDB must be running before starting GeoCrypt
- The startup script checks for MongoDB but cannot start it
- After system restart, remember to restart MongoDB:
  ```bash
  # Linux
  sudo systemctl start mongodb
  
  # macOS
  brew services start mongodb-community
  ```

- For production, enable MongoDB authentication
- For development, the default configuration is fine

---

## Additional Resources

- MongoDB Documentation: https://docs.mongodb.com/
- MongoDB Installation Guide: https://docs.mongodb.com/manual/installation/
- MongoDB Community Server: https://www.mongodb.com/try/download/community
- Docker MongoDB: https://hub.docker.com/_/mongo

---

**MongoDB setup complete!** You can now proceed with GeoCrypt setup.
