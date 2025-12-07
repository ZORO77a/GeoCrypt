#!/bin/bash

# GeoCrypt Local Development Startup Script
# This script starts both the backend and frontend in separate terminal windows

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}GeoCrypt - Local Development Startup${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Check if we're in the right directory
if [ ! -d "backend" ] || [ ! -d "frontend" ]; then
    echo -e "${RED}Error: This script must be run from the project root directory${NC}"
    echo -e "${RED}Current directory: $(pwd)${NC}"
    exit 1
fi

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Error: Python 3 is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Python 3 found: $(python3 --version)${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js found: $(node --version)${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ npm found: $(npm --version)${NC}"

echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Starting Backend Server...${NC}"
echo -e "${BLUE}================================================${NC}"

# Check if backend dependencies are installed
if [ ! -d "backend/venv" ] && [ ! -d "backend/.venv" ]; then
    if ! python3 -c "import fastapi" 2>/dev/null; then
        echo -e "${BLUE}Installing backend dependencies...${NC}"
        cd backend
        pip3 install -r requirements.txt
        cd ..
    fi
fi

# Start backend in a new terminal
if command -v gnome-terminal &> /dev/null; then
    gnome-terminal --tab --title="GeoCrypt Backend" -- bash -c "cd backend && python3 server.py; sleep 1000"
elif command -v xterm &> /dev/null; then
    xterm -title "GeoCrypt Backend" -e "cd backend && python3 server.py; sleep 1000" &
elif command -v osascript &> /dev/null; then
    # macOS
    osascript -e 'tell app "Terminal" to do script "cd '"$(pwd)"'/backend && python3 server.py"'
elif command -v cmd &> /dev/null; then
    # Windows (Git Bash)
    start cmd /k "cd backend && python3 server.py"
else
    echo -e "${RED}Unable to open new terminal window${NC}"
    echo -e "${BLUE}Please manually run:${NC}"
    echo -e "${BLUE}cd backend && python3 server.py${NC}"
fi

echo -e "${GREEN}✓ Backend starting on http://localhost:8000${NC}"
echo ""

# Wait a moment for backend to start
sleep 3

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Starting Frontend Server...${NC}"
echo -e "${BLUE}================================================${NC}"

# Check if frontend dependencies are installed
if [ ! -d "frontend/node_modules" ]; then
    echo -e "${BLUE}Installing frontend dependencies...${NC}"
    cd frontend
    npm install
    cd ..
fi

# Start frontend in a new terminal
if command -v gnome-terminal &> /dev/null; then
    gnome-terminal --tab --title="GeoCrypt Frontend" -- bash -c "cd frontend && npm start; sleep 1000"
elif command -v xterm &> /dev/null; then
    xterm -title "GeoCrypt Frontend" -e "cd frontend && npm start; sleep 1000" &
elif command -v osascript &> /dev/null; then
    # macOS
    osascript -e 'tell app "Terminal" to do script "cd '"$(pwd)"'/frontend && npm start"'
elif command -v cmd &> /dev/null; then
    # Windows (Git Bash)
    start cmd /k "cd frontend && npm start"
else
    echo -e "${RED}Unable to open new terminal window${NC}"
    echo -e "${BLUE}Please manually run:${NC}"
    echo -e "${BLUE}cd frontend && npm start${NC}"
fi

echo -e "${GREEN}✓ Frontend starting on http://localhost:3000${NC}"
echo ""

echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}Both services are starting!${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo -e "${GREEN}✓ Backend API: ${NC}http://localhost:8000"
echo -e "${GREEN}✓ API Docs:    ${NC}http://localhost:8000/docs"
echo -e "${GREEN}✓ Frontend:    ${NC}http://localhost:3000"
echo ""
echo -e "${BLUE}Default Login Credentials:${NC}"
echo -e "${BLUE}  Username: admin${NC}"
echo -e "${BLUE}  Password: admin${NC}"
echo ""
echo -e "${BLUE}Note: Allow 5-10 seconds for services to fully start${NC}"
echo -e "${BLUE}Check LOCAL_SETUP.md for detailed setup instructions${NC}"
echo ""
