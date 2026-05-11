#!/usr/bin/env python3
"""
GeoCrypt Local Development Startup Script
Starts both backend and frontend services
"""

import subprocess
import sys
import time
import os
import platform
import shutil
import socket

# Colors for output
class Colors:
    GREEN = '\033[0;32m'
    BLUE = '\033[0;34m'
    RED = '\033[0;31m'
    YELLOW = '\033[0;33m'
    NC = '\033[0m'  # No Color

def get_local_ip():
    """Get the local IP address for network access"""
    try:
        # Create a socket to get the local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))  # Connect to Google DNS
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        return "localhost"

def print_header(text):
    print(f"{Colors.BLUE}{'='*50}{Colors.NC}")
    print(f"{Colors.BLUE}{text}{Colors.NC}")
    print(f"{Colors.BLUE}{'='*50}{Colors.NC}")

def print_success(text):
    print(f"{Colors.GREEN}✓ {text}{Colors.NC}")

def print_error(text):
    print(f"{Colors.RED}✗ {text}{Colors.NC}")

def print_info(text):
    print(f"{Colors.BLUE}ℹ {text}{Colors.NC}")

def check_prerequisites():
    """Check if all prerequisites are installed"""
    print_header("Checking Prerequisites")
    
    # Check Python
    try:
        result = subprocess.run(['python3', '--version'], capture_output=True, text=True)
        print_success(f"Python 3 found: {result.stdout.strip()}")
    except FileNotFoundError:
        print_error("Python 3 is not installed")
        return False
    
    # Check Node.js
    try:
        result = subprocess.run(['node', '--version'], capture_output=True, text=True)
        print_success(f"Node.js found: {result.stdout.strip()}")
    except FileNotFoundError:
        print_error("Node.js is not installed")
        return False
    
    # Check npm
    try:
        result = subprocess.run(['npm', '--version'], capture_output=True, text=True)
        print_success(f"npm found: {result.stdout.strip()}")
    except FileNotFoundError:
        print_error("npm is not installed")
        return False
    
    # Check MongoDB - CRITICAL
    print_info("Checking MongoDB connection...")
    try:
        # Try mongosh first, then fall back to mongo
        try:
            result = subprocess.run(['mongosh', '--eval', 'db.version()'], 
                                  capture_output=True, timeout=5, text=True)
            mongo_cmd = 'mongosh'
        except FileNotFoundError:
            result = subprocess.run(['mongo', '--eval', 'db.version()'], 
                                  capture_output=True, timeout=5, text=True)
            mongo_cmd = 'mongo'
        
        if result.returncode == 0:
            version_line = [l for l in result.stdout.split('\n') if any(c.isdigit() for c in l)]
            version = version_line[0].strip() if version_line else "running"
            print_success(f"MongoDB is running")
        else:
            print_error("MongoDB is installed but not running")
            print_error("  Start MongoDB with: sudo systemctl start mongodb (Linux/Kali)")
            print_error("  Or: brew services start mongodb-community (macOS)")
            print_error("  See MONGODB_SETUP.md for detailed instructions")
            return False
    except FileNotFoundError:
        print_error("MongoDB is not installed!")
        print_error("  Please install MongoDB first: See MONGODB_SETUP.md")
        return False
    except subprocess.TimeoutExpired:
        print_error("MongoDB connection timed out - MongoDB might not be responding")
        return False
    except Exception as e:
        print_error(f"MongoDB check failed: {e}")
        return False
    
    # Check Python venv support
    try:
        result = subprocess.run([sys.executable, '-m', 'venv', '--help'], 
                              capture_output=True, timeout=5)
        print_success("Python venv support available")
    except (FileNotFoundError, subprocess.TimeoutExpired):
        print_error("Python venv not available - required for installation")
        return False
    
    print()
    return True

def install_dependencies():
    """Install backend and frontend dependencies"""
    print_header("Installing Dependencies")
    
    # Backend dependencies
    print_info("Checking backend dependencies...")
    backend_path = os.path.join(os.getcwd(), 'backend')
    venv_path = os.path.join(backend_path, 'venv')
    venv_python = os.path.join(venv_path, 'bin', 'python')
    
    if not os.path.exists(venv_path):
        print_info("Creating Python virtual environment...")
        try:
            subprocess.run([sys.executable, '-m', 'venv', 'venv'],
                          cwd=backend_path, check=True, timeout=60)
            print_success("Virtual environment created")
        except subprocess.CalledProcessError as e:
            print_error(f"Failed to create virtual environment: {e}")
            return False
        except subprocess.TimeoutExpired:
            print_error("Virtual environment creation timed out")
            return False
        
        # Only install pip packages if venv was just created
        print_info("Installing backend packages (this may take a minute)...")
        try:
            subprocess.run([venv_python, '-m', 'pip', 'install', '--upgrade', 'pip'],
                          cwd=backend_path, check=True, timeout=120)
            subprocess.run([venv_python, '-m', 'pip', 'install', '-r', 'requirements.txt'],
                          cwd=backend_path, check=True, timeout=300)
            print_success("Backend dependencies installed")
        except subprocess.CalledProcessError as e:
            print_error(f"Failed to install backend dependencies: {e}")
            return False
        except subprocess.TimeoutExpired:
            print_error("Backend dependency installation timed out - this can happen with slow connections")
            print_error("You may need to run manually: cd backend && python -m pip install -r requirements.txt")
            print_error("Continuing anyway...")
    else:
        print_success("Backend virtual environment already exists")
    
    # Frontend dependencies
    print_info("Checking frontend dependencies...")
    frontend_path = os.path.join(os.getcwd(), 'frontend')
    node_modules = os.path.join(frontend_path, 'node_modules')
    
    if os.path.exists(node_modules):
        print_success("Frontend dependencies already installed")
    else:
        print_info("Installing frontend dependencies (this may take a minute)...")
        try:
            subprocess.run(['npm', 'install', '--legacy-peer-deps'], 
                          cwd=frontend_path, check=True, timeout=300)
            print_success("Frontend dependencies installed")
        except subprocess.CalledProcessError as e:
            print_error(f"Failed to install frontend dependencies: {e}")
            return False
        except subprocess.TimeoutExpired:
            print_error("Frontend dependency installation timed out - this can happen with slow connections")
            print_error("You may need to run manually: cd frontend && npm install --legacy-peer-deps")
            print_error("Continuing anyway...")
    
    print()
    return True

def check_and_free_ports():
    """Check for and free up required ports"""
    print_info("Checking and freeing required ports...")
    
    ports_to_check = [8000, 3000]
    for port in ports_to_check:
        try:
            # Check if port is in use
            result = subprocess.run(['lsof', '-ti', f':{port}'], 
                                  capture_output=True, text=True, timeout=5)
            if result.returncode == 0 and result.stdout.strip():
                pids = result.stdout.strip().split('\n')
                print_info(f"Port {port} is in use by PIDs: {', '.join(pids)}. Killing...")
                for pid in pids:
                    try:
                        subprocess.run(['kill', '-9', pid], timeout=5)
                        print_info(f"Killed process {pid} on port {port}")
                    except subprocess.TimeoutExpired:
                        print_error(f"Failed to kill process {pid}")
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass  # lsof not available or timeout
    
    # Give processes time to die
    time.sleep(2)
    print_success("Port check complete")

def start_services():
    """Start both backend and frontend services"""
    print_header("Starting Services")
    
    # Get local IP for network access
    local_ip = get_local_ip()
    print_info(f"Local IP detected: {local_ip}")
    
    # Check and free ports first
    check_and_free_ports()
    
    # Backend process
    print_info("Starting backend server...")
    backend_path = os.path.join(os.getcwd(), 'backend')
    venv_python = os.path.join(backend_path, 'venv', 'bin', 'python')
    
    # Set CORS_ORIGINS to allow both localhost and network access
    backend_env = os.environ.copy()
    backend_env['CORS_ORIGINS'] = f'http://localhost:3000,http://{local_ip}:3000'
    
    backend_process = subprocess.Popen(
        [venv_python, 'server.py'],
        cwd=backend_path,
        env=backend_env
    )
    print_success(f"Backend process started (PID: {backend_process.pid})")
    
    # Wait for backend to start
    time.sleep(5)
    
    # Frontend process
    print_info("Starting frontend server...")
    frontend_path = os.path.join(os.getcwd(), 'frontend')
    
    # Update frontend .env for network access
    env_file = os.path.join(frontend_path, '.env')
    with open(env_file, 'r') as f:
        env_content = f.read()
    env_content = env_content.replace('REACT_APP_BACKEND_URL=http://localhost:8000', f'REACT_APP_BACKEND_URL=http://{local_ip}:8000')
    with open(env_file, 'w') as f:
        f.write(env_content)
    
    frontend_env = os.environ.copy()
    frontend_env['HOST'] = '0.0.0.0'
    frontend_env['BROWSER'] = 'none'
    
    frontend_process = subprocess.Popen(
        ['npm', 'start'],
        cwd=frontend_path,
        env=frontend_env
    )
    print_success(f"Frontend process started (PID: {frontend_process.pid})")
    
    print()
    return backend_process, frontend_process

def print_startup_info(local_ip):
    """Print startup information"""
    print_header("Startup Complete")
    
    print_success("Backend API:   http://localhost:8000")
    print_success("API Docs:      http://localhost:8000/docs")
    print_success("Frontend:      http://localhost:3000")
    print()
    if local_ip != "localhost":
        print_success(f"Network Backend: http://{local_ip}:8000")
        print_success(f"Network Frontend: http://{local_ip}:3000")
        print()
    
    print(f"{Colors.BLUE}Default Login Credentials:{Colors.NC}")
    print(f"{Colors.BLUE}  Username: admin{Colors.NC}")
    print(f"{Colors.BLUE}  Password: admin{Colors.NC}")
    print()
    
    print(f"{Colors.YELLOW}Note: Allow 10-15 seconds for services to fully start{Colors.NC}")
    print(f"{Colors.BLUE}Press Ctrl+C to stop both services{Colors.NC}")
    print()

def main():
    print()
    print_header("GeoCrypt - Local Development Startup")
    print()
    
    # Check if we're in the right directory
    if not os.path.exists('backend') or not os.path.exists('frontend'):
        print_error("This script must be run from the project root directory")
        print_error(f"Current directory: {os.getcwd()}")
        sys.exit(1)
    
    # Check prerequisites
    if not check_prerequisites():
        sys.exit(1)
    
    # Install dependencies
    if not install_dependencies():
        sys.exit(1)
    
    # Start services
    backend_process, frontend_process = start_services()
    
    # Get local IP for display
    local_ip = get_local_ip()
    
    # Print startup info
    print_startup_info(local_ip)
    
    # Keep processes running
    try:
        while True:
            # Check if processes are still running
            if backend_process.poll() is not None:
                print_error("Backend process exited unexpectedly")
                if frontend_process.poll() is None:
                    frontend_process.terminate()
                sys.exit(1)
            
            if frontend_process.poll() is not None:
                print_error("Frontend process exited unexpectedly")
                if backend_process.poll() is None:
                    backend_process.terminate()
                sys.exit(1)
            
            time.sleep(1)
    
    except KeyboardInterrupt:
        print()
        print_info("Shutting down...")
        
        # Terminate processes
        backend_process.terminate()
        frontend_process.terminate()
        
        try:
            backend_process.wait(timeout=5)
            print_success("Backend stopped")
        except subprocess.TimeoutExpired:
            backend_process.kill()
            print_success("Backend stopped (killed)")
        
        try:
            frontend_process.wait(timeout=5)
            print_success("Frontend stopped")
        except subprocess.TimeoutExpired:
            frontend_process.kill()
            print_success("Frontend stopped (killed)")
        
        print_success("All services stopped")
        print()

if __name__ == '__main__':
    main()
