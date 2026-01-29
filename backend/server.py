from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Depends, Header, Response, BackgroundTasks
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import motor.motor_asyncio
import os
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
import io
import time
from typing import Optional, List
from contextlib import asynccontextmanager
from collections import defaultdict
import re
from hmac import compare_digest

from models import (
    UserRole, User, UserCreate, LoginRequest, OTPVerifyRequest, ResendOTPRequest,
    ForgotPasswordRequest, ResetPasswordRequest, ChangePasswordRequest, CSRFTokenResponse,
    RefreshTokenRequest, TokenRefreshResponse,
    FileMetadata, AccessLog, WFHRequest, AccessRequest, GeofenceConfig,
    EmployeeActivity, WFHRequestCreate
)
from auth import hash_password, verify_password, create_access_token, verify_token, generate_otp, hash_otp, verify_otp, create_reset_token, verify_reset_token, create_csrf_token, verify_csrf_token, create_refresh_token, verify_refresh_token
from email_service import send_otp_email
from crypto_service import CryptoService
from geofence import GeofenceValidator
from ml_service import AnomalyDetector
from wifi_service import WiFiService
from file_service import FileService, FilePermissionValidator

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = None
db = None
fs = None

# Initialize services (will be set during startup)
crypto_service = CryptoService()
geofence_validator = GeofenceValidator()
anomaly_detector = AnomalyDetector()
file_service = None
file_permission_validator = None

# Rate limiting storage
login_attempts = defaultdict(list)
RATE_LIMIT_MAX_ATTEMPTS = int(os.environ.get('RATE_LIMIT_MAX_ATTEMPTS', '5'))
RATE_LIMIT_WINDOW_MINUTES = int(os.environ.get('RATE_LIMIT_WINDOW_MINUTES', '15'))

# IP-based rate limiting for general API requests
IP_RATE_LIMIT_MAX_REQUESTS = int(os.environ.get('IP_RATE_LIMIT_MAX_REQUESTS', '100'))
IP_RATE_LIMIT_WINDOW_MINUTES = int(os.environ.get('IP_RATE_LIMIT_WINDOW_MINUTES', '1'))
ip_request_attempts = defaultdict(list)

# Token blacklist for logout functionality
token_blacklist = set()

# CSRF token storage (map of session identifiers to tokens)
csrf_tokens = {}

# Redis support (optional - for distributed token blacklist)
redis_client = None
REDIS_ENABLED = False
try:
    import redis
    REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379')
    redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
    redis_client.ping()  # Test connection
    REDIS_ENABLED = True
    logger_setup = logging.getLogger(__name__)
    logger_setup.info("✅ Redis connected for token blacklist persistence")
except Exception as e:
    REDIS_ENABLED = False
    # Fallback to in-memory blacklist (logged during startup)

def is_token_blacklisted(token: str) -> bool:
    """Check if token is blacklisted (logged out)"""
    if REDIS_ENABLED:
        return redis_client.exists(f"blacklist:{token}") > 0
    return token in token_blacklist

def blacklist_token(token: str):
    """Add token to blacklist on logout"""
    if REDIS_ENABLED:
        # Store in Redis with expiration matching JWT expiry (30 minutes)
        redis_client.setex(f"blacklist:{token}", 1800, "1")
    else:
        token_blacklist.add(token)

def check_rate_limit(identifier: str) -> bool:
    """Check if user has exceeded rate limit. Returns True if allowed, False if blocked."""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=RATE_LIMIT_WINDOW_MINUTES)
    
    # Clean old attempts
    login_attempts[identifier] = [attempt for attempt in login_attempts[identifier] if attempt > cutoff]
    
    # Check if exceeded limit
    if len(login_attempts[identifier]) >= RATE_LIMIT_MAX_ATTEMPTS:
        return False
    
    # Record this attempt
    login_attempts[identifier].append(now)
    return True

def check_ip_rate_limit(ip_address: str) -> bool:
    """Check if IP has exceeded request rate limit."""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=IP_RATE_LIMIT_WINDOW_MINUTES)
    
    # Clean old attempts
    ip_request_attempts[ip_address] = [attempt for attempt in ip_request_attempts[ip_address] if attempt > cutoff]
    
    # Check if exceeded limit (100 requests per minute per IP)
    if len(ip_request_attempts[ip_address]) >= IP_RATE_LIMIT_MAX_REQUESTS:
        return False
    
    # Record this attempt
    ip_request_attempts[ip_address].append(now)
    return True

def get_client_ip(request) -> str:
    """Extract client IP from request, considering proxies"""
    # Check X-Forwarded-For header (behind proxy)
    if "x-forwarded-for" in request.headers:
        return request.headers["x-forwarded-for"].split(",")[0].strip()
    # Check X-Real-IP header
    if "x-real-ip" in request.headers:
        return request.headers["x-real-ip"]
    # Direct connection
    return request.client.host if request.client else "unknown"

def validate_username(username: str) -> bool:
    """Validate username format to prevent injection"""
    return bool(re.match(r'^[a-zA-Z0-9_]{3,20}$', username))

def validate_email(email: str) -> bool:
    """Validate email format"""
    return bool(re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email))

# Initialize admin account and config
async def init_admin():
    try:
        admin_exists = await db.users.find_one({"username": "admin"})
        if not admin_exists:
            # Get admin credentials from environment variables
            admin_username = os.environ.get('ADMIN_USERNAME', 'admin')
            admin_email = os.environ.get('ADMIN_EMAIL', 'admin@example.com')
            admin_password = os.environ.get('ADMIN_PASSWORD')
            
            # Require strong admin password in production
            if not admin_password or admin_password == 'admin':
                logger.warning("⚠️  No ADMIN_PASSWORD set or using default 'admin'. Set ADMIN_PASSWORD environment variable with a strong password!")
                admin_password = 'ChangeMe123!@#'  # Force change
            
            admin_user = {
                "email": admin_email,
                "username": admin_username,
                "password_hash": hash_password(admin_password),
                "role": UserRole.ADMIN,
                "created_at": datetime.utcnow().isoformat(),
                "is_active": True
            }
            await db.users.insert_one(admin_user)
            logger.info(f"Admin user '{admin_username}' created. Please change password immediately!")
        
        # Create default geofence config
        config_exists = await db.geofence_config.find_one({})
        if not config_exists:
            default_config = {
                "latitude": 10.8505,
                "longitude": 76.2711,
                "radius": 500,
                "allowed_ssid": "OfficeWiFi",
                "start_time": "09:00",
                "end_time": "17:00"
            }
            await db.geofence_config.insert_one(default_config)
            logger.info("Default geofence config created")
    except Exception as e:
        logger.error(f"Error initializing admin: {e}")

# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global client, db, fs, file_service, file_permission_validator
    logger.info("Starting up application...")
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
    fs = motor.motor_asyncio.AsyncIOMotorGridFSBucket(db)
    
    # Initialize file service
    file_service = FileService(fs, db, crypto_service)
    file_permission_validator = FilePermissionValidator(db)
    
    await init_admin()
    logger.info("Application startup complete")
    
    yield
    
    # Shutdown
    logger.info("Shutting down application...")
    if client:
        client.close()
    logger.info("Application shutdown complete")

# Create the main app with lifespan
app = FastAPI(title="GeoCrypt API", lifespan=lifespan)

# Create API router
api_router = APIRouter(prefix="/api")

logger = logging.getLogger(__name__)

# Dependency for auth
async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = authorization.replace("Bearer ", "")
    
    # Check if token is blacklisted (logged out)
    if is_token_blacklisted(token):
        raise HTTPException(status_code=401, detail="Token has been revoked. Please login again.")
    
    payload = verify_token(token)
    
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user = await db.users.find_one({"username": payload.get("sub")}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    return user


def _parse_iso_to_utc(s: Optional[str]) -> Optional[datetime]:
    """
    Parse an ISO 8601 string to a timezone-aware UTC datetime.
    Accepts values with 'Z' or explicit offsets or naive datetimes and returns UTC aware.
    Returns None on parse failure or if s is None.
    """
    if not s:
        return None
    try:
        # Replace Z with +00:00 so fromisoformat can parse it
        normalized = s.replace('Z', '+00:00') if isinstance(s, str) else s
        dt = datetime.fromisoformat(normalized)
    except Exception:
        return None
    # Make the datetime timezone-aware and converted to UTC
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt

# Auth Routes
@api_router.post("/auth/login")
async def login(request: LoginRequest, background_tasks: BackgroundTasks):
    # Rate limiting check
    if not check_rate_limit(request.username):
        logger.warning(f"Rate limit exceeded for user: {request.username}")
        # Log failed login due to rate limit
        await db.access_logs.insert_one({
            "employee_username": request.username,
            "action": "login_failed",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "success": False,
            "reason": "Rate limit exceeded",
            "log_type": "authentication"
        })
        raise HTTPException(status_code=429, detail="Too many login attempts. Please try again later.")
    
    # Input validation
    if not validate_username(request.username):
        raise HTTPException(status_code=400, detail="Invalid username format")
    
    user = await db.users.find_one({"username": request.username}, {"_id": 0})
    
    if not user or not verify_password(request.password, user["password_hash"]):
        # Log failed login attempt
        logger.warning(f"Failed login attempt for user: {request.username}")
        await db.access_logs.insert_one({
            "employee_username": request.username,
            "action": "login_failed",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "success": False,
            "reason": "Invalid credentials",
            "log_type": "authentication"
        })
        # Generic error message to prevent user enumeration
        raise HTTPException(status_code=401, detail="Authentication failed")
    
    if not user.get("is_active", True):
        # Log failed login for disabled account
        await db.access_logs.insert_one({
            "employee_username": request.username,
            "action": "login_failed",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "success": False,
            "reason": "Account is disabled",
            "log_type": "authentication"
        })
        raise HTTPException(status_code=403, detail="Account is disabled")
    
    # Generate OTP
    otp = generate_otp()
    otp_expiry = datetime.now(timezone.utc) + timedelta(minutes=5)
    hashed_otp = hash_otp(otp)  # Hash OTP before storing
    
    await db.users.update_one(
        {"username": request.username},
        {"$set": {"otp": hashed_otp, "otp_expiry": otp_expiry.isoformat(), "otp_sent_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Send OTP via email in background (non-blocking)
    background_tasks.add_task(send_otp_email, user["email"], otp, user["username"])
    
    return {
        "message": "OTP sent to your email",
        "username": user["username"],
        "role": user["role"]
    }



@api_router.post("/auth/resend-otp")
async def resend_otp(request: ResendOTPRequest, background_tasks: BackgroundTasks):
    user = await db.users.find_one({"username": request.username}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Authentication failed")  # Generic error

    # Rate-limit: Don't allow resending OTPs more than once per 30 seconds
    now = datetime.now(timezone.utc)
    otp_sent_at = None
    if user.get("otp_sent_at"):
        try:
            otp_sent_at = datetime.fromisoformat(user["otp_sent_at"])
        except Exception:
            otp_sent_at = None

    if otp_sent_at and (now - otp_sent_at).total_seconds() < 30:
        raise HTTPException(status_code=429, detail="Please wait before requesting a new OTP")

    # Generate new OTP & send
    otp = generate_otp()
    otp_expiry = datetime.now(timezone.utc) + timedelta(minutes=5)
    hashed_otp = hash_otp(otp)  # Hash OTP before storing
    await db.users.update_one(
        {"username": request.username},
        {"$set": {"otp": hashed_otp, "otp_expiry": otp_expiry.isoformat(), "otp_sent_at": datetime.now(timezone.utc).isoformat()}}
    )

    # Send OTP via email in background (non-blocking)
    background_tasks.add_task(send_otp_email, user["email"], otp, user["username"])

    return {"message": "OTP resent to your email"}

@api_router.post("/auth/verify-otp")
async def verify_otp_endpoint(request: OTPVerifyRequest, response: Response):
    user = await db.users.find_one({"username": request.username}, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=401, detail="Authentication failed")  # Generic error to prevent user enumeration
    
    if not user.get("otp"):
        # Log failed OTP verification - no OTP generated
        await db.access_logs.insert_one({
            "employee_username": request.username,
            "action": "otp_verify_failed",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "success": False,
            "reason": "No OTP generated",
            "log_type": "authentication"
        })
        raise HTTPException(status_code=401, detail="No OTP generated. Please login again.")
    
    # Hash the provided OTP and compare with stored hashed OTP
    hashed_provided_otp = hash_otp(request.otp)
    if hashed_provided_otp != user["otp"]:
        # Log failed OTP verification - invalid OTP
        await db.access_logs.insert_one({
            "employee_username": request.username,
            "action": "otp_verify_failed",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "success": False,
            "reason": "Invalid OTP",
            "log_type": "authentication"
        })
        raise HTTPException(status_code=401, detail="Invalid OTP")
    
    # Check OTP expiry
    otp_expiry = datetime.fromisoformat(user["otp_expiry"])
    if datetime.now(timezone.utc) > otp_expiry:
        # Log failed OTP verification - expired OTP
        await db.access_logs.insert_one({
            "employee_username": request.username,
            "action": "otp_verify_failed",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "success": False,
            "reason": "OTP expired",
            "log_type": "authentication"
        })
        raise HTTPException(status_code=401, detail="OTP expired")
    
    # Clear OTP
    await db.users.update_one(
        {"username": request.username},
        {"$set": {"otp": None, "otp_expiry": None}}
    )
    
    # Create access token and refresh token
    access_token = create_access_token({"sub": user["username"], "role": user["role"]})
    refresh_token = create_refresh_token({"sub": user["username"]})
    
    # Set secure httpOnly cookies
    is_secure = os.environ.get("SECURE_COOKIES", "False").lower() == "true"
    response.set_cookie(
        "access_token",
        access_token,
        httponly=True,  # Cannot be accessed by JavaScript (prevents XSS token theft)
        secure=is_secure,  # HTTPS only in production
        samesite="Strict",  # CSRF protection
        max_age=1800,  # 30 minutes
        path="/"
    )
    response.set_cookie(
        "refresh_token",
        refresh_token,
        httponly=True,
        secure=is_secure,
        samesite="Strict",
        max_age=604800,  # 7 days
        path="/"
    )
    
    # Also return tokens for immediate use (backward compatibility)
    # Log successful login
    await db.access_logs.insert_one({
        "employee_username": request.username,
        "action": "login",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "success": True,
        "reason": "Successful OTP verification",
        "log_type": "authentication"
    })
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "role": user["role"],
        "username": user["username"],
        "note": "Tokens also set in httpOnly cookies - use cookies for production"
    }

@api_router.post("/auth/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    """Request password reset token - sends email with reset link"""
    user = await db.users.find_one({"email": request.email}, {"_id": 0})
    
    if not user:
        # Don't reveal whether email exists (prevent user enumeration)
        return {"message": "If email exists, a reset link has been sent"}
    
    # Create reset token with 1-hour expiration
    reset_token = create_reset_token({"email": user["email"]})
    
    # Store reset token in database with expiration
    reset_expiry = datetime.now(timezone.utc) + timedelta(hours=1)
    await db.users.update_one(
        {"email": request.email},
        {"$set": {"password_reset_token": reset_token, "password_reset_expiry": reset_expiry.isoformat()}}
    )
    
    # Send reset email
    try:
        # In production, send actual email with reset link
        reset_link = f"http://localhost:3000/reset-password?token={reset_token}"
        await send_otp_email(user["email"], f"Reset link: {reset_link}", user["username"])
        logger.info(f"Password reset token sent to {user['email']}")
    except Exception as e:
        logger.error(f"Failed to send reset email: {str(e)}")
        # Don't expose email service errors
        return {"message": "If email exists, a reset link has been sent"}
    
    return {"message": "If email exists, a reset link has been sent"}

@api_router.post("/auth/reset-password")
async def reset_password(request: ResetPasswordRequest):
    """Reset password using reset token"""
    # Verify reset token
    email = verify_reset_token(request.token)
    
    if not email:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    
    # Find user
    user = await db.users.find_one({"email": email}, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    
    # Verify token in database (defense in depth)
    if user.get("password_reset_token") != request.token:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    
    # Check token expiration
    if user.get("password_reset_expiry"):
        try:
            reset_expiry = datetime.fromisoformat(user["password_reset_expiry"])
            if datetime.now(timezone.utc) > reset_expiry:
                raise HTTPException(status_code=400, detail="Reset link has expired")
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    
    # Validate new password
    if len(request.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")
    
    # Update password
    new_password_hash = hash_password(request.new_password)
    await db.users.update_one(
        {"email": email},
        {
            "$set": {
                "password_hash": new_password_hash,
                "password_reset_token": None,
                "password_reset_expiry": None
            }
        }
    )
    
    logger.info(f"Password reset successfully for {email}")
    
    return {"message": "Password has been reset successfully. Please login with your new password."}

@api_router.post("/auth/change-password")
async def change_password(request: ChangePasswordRequest, current_user: dict = Depends(get_current_user)):
    """Change password for authenticated user"""
    # Verify old password
    if not verify_password(request.old_password, current_user["password_hash"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    
    # Validate new password
    if len(request.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters long")
    
    # Ensure new password is different from old
    if request.old_password == request.new_password:
        raise HTTPException(status_code=400, detail="New password must be different from current password")
    
    # Update password
    new_password_hash = hash_password(request.new_password)
    await db.users.update_one(
        {"username": current_user["username"]},
        {"$set": {"password_hash": new_password_hash}}
    )
    
    logger.info(f"Password changed for user {current_user['username']}")
    
    return {"message": "Password changed successfully"}

@api_router.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None), current_user: dict = Depends(get_current_user)):
    """Logout user by blacklisting their token"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = authorization.replace("Bearer ", "")
    
    # Blacklist the token
    blacklist_token(token)
    
    logger.info(f"User {current_user['username']} logged out")
    
    return {"message": "Logged out successfully"}

@api_router.post("/auth/refresh-token")
async def refresh_access_token(request: dict = None, response: Response = None, refresh_token: Optional[str] = None):
    """Refresh expired access token using refresh token"""
    # Try to get refresh token from cookie first (preferred), then from request body
    if response is None:
        response = Response()
    
    token_to_verify = refresh_token
    
    if not token_to_verify:
        raise HTTPException(status_code=401, detail="Refresh token required")
    
    # Verify refresh token
    username = verify_refresh_token(token_to_verify)
    
    if not username:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
    
    # Get user from database
    user = await db.users.find_one({"username": username}, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    # Create new access token
    new_access_token = create_access_token({"sub": user["username"], "role": user["role"]})
    
    # Set new access token in cookie
    is_secure = os.environ.get("SECURE_COOKIES", "False").lower() == "true"
    response.set_cookie(
        "access_token",
        new_access_token,
        httponly=True,
        secure=is_secure,
        samesite="Strict",
        max_age=1800,
        path="/"
    )
    
    logger.info(f"Access token refreshed for user {username}")
    
    return {
        "access_token": new_access_token,
        "token_type": "bearer",
        "expires_in": 1800
    }

@api_router.post("/auth/csrf-token")
async def get_csrf_token(current_user: dict = Depends(get_current_user)):
    """Get CSRF token for state-changing requests"""
    # Generate CSRF token
    csrf_token = create_csrf_token({"username": current_user["username"]})
    
    # Store CSRF token associated with user
    csrf_tokens[current_user["username"]] = csrf_token
    
    logger.info(f"CSRF token issued to {current_user['username']}")
    
    return CSRFTokenResponse(csrf_token=csrf_token)

def verify_csrf_protection(request_csrf_token: str, current_user: dict) -> bool:
    """Verify CSRF token matches stored token for user"""
    stored_token = csrf_tokens.get(current_user["username"])
    if not stored_token:
        return False
    
    # Verify tokens match using constant-time comparison
    return compare_digest(request_csrf_token, stored_token)

# WiFi Detection Routes
@api_router.get("/wifi-ssid")
async def get_wifi_ssid():
    """
    Detect and return the currently connected WiFi SSID.
    Available to all authenticated users.
    """
    ssid = WiFiService.get_connected_ssid()
    return {"ssid": ssid}


@api_router.get("/validate-access")
async def validate_access_route(latitude: Optional[float] = None, longitude: Optional[float] = None, wifi_ssid: Optional[str] = None):
    """
    Debug endpoint - validate a hypothetical access request using current geofence configuration.
    Returns the validation_result returned by GeofenceValidator.
    """
    config = await db.geofence_config.find_one({}, {"_id": 0})
    # Use minimal request object
    req = {"latitude": latitude, "longitude": longitude, "wifi_ssid": wifi_ssid}
    result = geofence_validator.validate_access(req, config, False)
    return result


@api_router.get("/time")
async def get_server_time():
    """
    Return the server current time in ISO format and timezone info for debugging.
    """
    now = datetime.now(timezone.utc)
    return {"server_time": now.isoformat(), "timezone": "UTC"}

# Admin Routes
@api_router.post("/admin/employees")
async def create_employee(employee: UserCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Input validation
    if not validate_username(employee.username):
        raise HTTPException(status_code=400, detail="Invalid username format (3-20 chars, alphanumeric and underscore only)")
    
    if not validate_email(employee.email):
        raise HTTPException(status_code=400, detail="Invalid email format")
    
    if len(employee.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")
    
    # Check if user exists
    existing = await db.users.find_one({"username": employee.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    existing_email = await db.users.find_one({"email": employee.email})
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_dict = {
        "email": employee.email,
        "username": employee.username,
        "password_hash": hash_password(employee.password),
        "role": UserRole.EMPLOYEE,
        "created_at": datetime.utcnow().isoformat(),
        "is_active": True
    }
    
    await db.users.insert_one(user_dict)
    logger.info(f"Employee '{employee.username}' created by {current_user['username']}")
    
    return {"message": "Employee created successfully", "username": employee.username}

@api_router.get("/admin/employees")
async def get_employees(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    employees = await db.users.find(
        {"role": UserRole.EMPLOYEE},
        {"_id": 0, "password_hash": 0, "otp": 0, "otp_expiry": 0}
    ).to_list(1000)
    
    return employees

@api_router.put("/admin/employees/{username}")
async def update_employee(username: str, updates: dict, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Don't allow password to be updated directly
    if "password" in updates:
        updates["password_hash"] = hash_password(updates.pop("password"))
    
    result = await db.users.update_one(
        {"username": username, "role": UserRole.EMPLOYEE},
        {"$set": updates}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    return {"message": "Employee updated successfully"}

@api_router.delete("/admin/employees/{username}")
async def delete_employee(username: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.users.delete_one({"username": username, "role": UserRole.EMPLOYEE})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    return {"message": "Employee deleted successfully"}

@api_router.get("/admin/access-logs")
async def get_access_logs(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Get both file access logs and authentication logs, sorted by timestamp (newest first)
    logs = await db.access_logs.find({}, {"_id": 0}).sort("timestamp", -1).to_list(1000)
    return logs

@api_router.get("/admin/suspicious-activities")
async def analyze_suspicious_activities(current_user: dict = Depends(get_current_user)):
    """
    AI-powered analysis of suspicious activities using ML detection
    Combines statistical anomaly detection with rule-based pattern matching
    """
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        # Get all access logs (last 2000 for performance)
        logs = await db.access_logs.find({}, {"_id": 0}).sort("timestamp", -1).to_list(2000)
        
        if not logs:
            return {
                "total_activities": 0,
                "suspicious_count": 0,
                "risk_level": "low",
                "findings": [],
                "rule_based_anomalies": [],
                "high_risk_employees": {},
                "patterns": [],
                "recommendations": ["No activities to analyze yet"],
                "analysis_timestamp": datetime.now(timezone.utc).isoformat()
            }
        
        # Train model with historical data if enough samples
        if len(logs) >= 50:
            anomaly_detector.train(logs)
        
        # Run comprehensive analysis
        analysis_result = anomaly_detector.analyze_suspicious_activities(logs)
        
        logger.info(f"Suspicious activity analysis completed: {analysis_result['suspicious_count']} anomalies detected")
        
        return analysis_result
    
    except Exception as e:
        logger.error(f"Error in suspicious activity analysis: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@api_router.get("/admin/check-ins")
async def get_check_ins(current_user: dict = Depends(get_current_user)):
    """Get all employee check-in logs (login events)"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Get all login-related logs
    check_ins = await db.access_logs.find(
        {"action": {"$in": ["login", "login_failed"]}}, 
        {"_id": 0}
    ).sort("timestamp", -1).to_list(1000)
    
    return check_ins

@api_router.get("/admin/file-access")
async def get_file_access(current_user: dict = Depends(get_current_user)):
    """Get all file access logs"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Get all file access and download logs
    file_access = await db.access_logs.find(
        {"action": {"$in": ["access", "download", "denied"]}}, 
        {"_id": 0}
    ).sort("timestamp", -1).to_list(1000)
    
    return file_access

@api_router.get("/admin/wfh-requests")
async def get_wfh_requests(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    requests = await db.wfh_requests.find({}, {"_id": 0}).sort("requested_at", -1).to_list(1000)
    return requests

@api_router.put("/admin/wfh-requests/{employee_username}")
async def update_wfh_request(employee_username: str, action: dict, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    status = action.get("status")  # approved or rejected
    comment = action.get("comment", "")
    access_start = action.get("access_start")
    access_end = action.get("access_end")

    # Build update document
    update_doc = {
        "status": status,
        "admin_comment": comment,
        "approved_at": datetime.now(timezone.utc).isoformat()
    }

    # If admin provided access window, validate and store as ISO strings
    if access_start:
        try:
            # Parse to timezone-aware UTC and persist as ISO strings with tz info
            start_dt = _parse_iso_to_utc(access_start)
            if not start_dt:
                raise ValueError("Invalid access_start format")
            update_doc["access_start"] = start_dt.isoformat()
        except (ValueError, AttributeError):
            raise HTTPException(status_code=400, detail=f"Invalid access_start format: {access_start}. Use ISO 8601 format (e.g., 2025-12-07T09:00:00 or 2025-12-07T09:00:00+00:00)")
    
    if access_end:
        try:
            end_dt = _parse_iso_to_utc(access_end)
            if not end_dt:
                raise ValueError("Invalid access_end format")
            update_doc["access_end"] = end_dt.isoformat()
        except (ValueError, AttributeError):
            raise HTTPException(status_code=400, detail=f"Invalid access_end format: {access_end}. Use ISO 8601 format (e.g., 2025-12-07T17:00:00 or 2025-12-07T17:00:00+00:00)")
    
    # If both provided, validate that end > start
    if access_start and access_end:
        try:
            start_dt = datetime.fromisoformat(access_start.replace('Z', '+00:00'))
            end_dt = datetime.fromisoformat(access_end.replace('Z', '+00:00'))
            if end_dt <= start_dt:
                raise HTTPException(status_code=400, detail="access_end must be after access_start")
        except ValueError:
            pass  # Already caught above
    result = await db.wfh_requests.update_one(
        {"employee_username": employee_username, "status": "pending"},
        {"$set": update_doc}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Request not found or already processed")
    
    return {"message": f"Request {status}"}

@api_router.get("/admin/geofence-config")
async def get_geofence_config(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    config = await db.geofence_config.find_one({}, {"_id": 0})
    return config

@api_router.put("/admin/geofence-config")
async def update_geofence_config(config: GeofenceConfig, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    await db.geofence_config.update_one({}, {"$set": config.model_dump()}, upsert=True)
    
    return {"message": "Configuration updated successfully"}

@api_router.get("/admin/analytics/{employee_username}")
async def get_employee_analytics(employee_username: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Get employee activities
    activities = await db.access_logs.find(
        {"employee_username": employee_username},
        {"_id": 0}
    ).to_list(1000)
    
    # Train and analyze
    if len(activities) >= 10:
        anomaly_detector.train(activities)
    
    analysis = anomaly_detector.analyze_employee_behavior(activities)
    
    return analysis

# File Routes
@api_router.post("/files/upload")
async def upload_file(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        file_content = await file.read()
        result = await file_service.upload_file(
            file_content=file_content,
            filename=file.filename,
            uploaded_by=current_user["username"]
        )
        return result
    except Exception as e:
        logger.error(f"File upload error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@api_router.get("/files")
async def list_files(latitude: Optional[float] = None, longitude: Optional[float] = None, wifi_ssid: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """
    List files. Employees will only see files uploaded by admin.
    Optional query params latitude/longitude/wifi_ssid will be used to compute per-file accessibility flag.
    """
    uploaded_by = "admin" if current_user["role"] == UserRole.EMPLOYEE else None
    files_cursor = await file_service.list_files(uploaded_by=uploaded_by)

    # Evaluate accessibility for each file for this employee if coordinates/wifi are provided
    config = await db.geofence_config.find_one({}, {"_id": 0})
    result_files = []
    logger.info(f"Listing files called by user={current_user['username']} with lat={latitude}, lon={longitude}, wifi={wifi_ssid}")
    logger.info(f"Geofence config: {config}")
    for f in files_cursor:
        file_obj = f.copy()
        file_obj["accessible"] = False
        file_obj["access_reason"] = "Access conditions not met"

        if current_user["role"] != UserRole.EMPLOYEE:
            # Admins can access everything
            file_obj["accessible"] = True
            file_obj["access_reason"] = "Admin access"
            result_files.append(file_obj)
            continue

        # Check WFH override first
        # Prefer the latest approved WFH request (sorted by approved_at desc) to avoid using stale requests
        wfh_request = await db.wfh_requests.find_one(
            {"employee_username": current_user["username"], "status": "approved"},
            sort=[("approved_at", -1)]
        )
        now = datetime.now(timezone.utc)
        if wfh_request:
            access_start = _parse_iso_to_utc(wfh_request.get("access_start"))
            access_end = _parse_iso_to_utc(wfh_request.get("access_end"))
            if access_start and access_end:
                # We expect access_start/access_end to already be timezone-aware UTC datetimes
                if access_start <= now <= access_end:
                    file_obj["accessible"] = True
                    file_obj["access_reason"] = "WFH approved - within access window"
                    # Include the WFH request id for audit/debugging
                    file_obj["wfh_request_id"] = str(wfh_request.get("_id"))
                    result_files.append(file_obj)
                    continue

        # If coords/wifi not provided, we cannot determine access - keep accessible False
        if latitude is None or longitude is None or wifi_ssid is None:
            file_obj["accessible"] = False
            file_obj["access_reason"] = "Location/WiFi not provided"
            result_files.append(file_obj)
            continue

        # Otherwise validate geofence
        validation_result = geofence_validator.validate_access(
            {"latitude": latitude, "longitude": longitude, "wifi_ssid": wifi_ssid},
            config,
            False
        )
        logger.info(f"Per-file validation for {file_obj['file_id']}: {validation_result}")
        file_obj["accessible"] = validation_result.get("allowed", False)
        file_obj["access_reason"] = validation_result.get("reason", "Access denied")
        file_obj["validations"] = validation_result.get("validations")

        result_files.append(file_obj)

    return result_files

@api_router.post("/files/access")
async def access_file(request: AccessRequest, current_user: dict = Depends(get_current_user)):
    try:
        logger.info(f"File access attempt: user={current_user['username']}, file_id={request.file_id}, lat={request.latitude}, lon={request.longitude}, wifi={request.wifi_ssid}")
        
        if current_user["role"] != UserRole.EMPLOYEE:
            # Admin has unrestricted access
            try:
                file_data = await file_service.access_file(request.file_id)
                
                return StreamingResponse(
                    io.BytesIO(file_data["content"]),
                    media_type=file_data["media_type"],
                    headers={"Content-Disposition": f"inline; filename={file_data['filename']}"}
                )
            except ValueError as e:
                raise HTTPException(status_code=404, detail=str(e))
        
        # Employee access - check conditions
        # Check if WFH approved and whether access window allows bypass
        wfh_request = await db.wfh_requests.find_one(
            {"employee_username": current_user["username"], "status": "approved"},
            sort=[("approved_at", -1)]
        )

        # Get geofence config
        config = await db.geofence_config.find_one({}, {"_id": 0})
        logger.info(f"Geofence config: {config}")

        now = datetime.now(timezone.utc)
        # Default validation result - not allowed until checks run
        validation_result = {"allowed": False, "reason": "Access denied"}
        wfh_id = None

        if wfh_request:
            # If admin approved, require an allocated access window
            access_start = _parse_iso_to_utc(wfh_request.get("access_start"))
            access_end = _parse_iso_to_utc(wfh_request.get("access_end"))

            if access_start and access_end:
                if access_start <= now <= access_end:
                    # WFH approved and within admin-allocated window: bypass wifi/location checks
                    validation_result = {"allowed": True, "reason": "WFH approved - time window active"}
                    wfh_id = str(wfh_request.get("_id"))
                else:
                    # WFH exists but not active. Fall back to normal geofence validation rather than blocking.
                    validation_result = geofence_validator.validate_access(
                        request.model_dump(),
                        config,
                        False
                    )
            else:
                # Admin approved WFH but no window allocated, fall back to normal validation
                validation_result = geofence_validator.validate_access(
                    request.model_dump(),
                    config,
                    False
                )
        else:
            # No WFH approval - validate normally (must satisfy wifi, location, and time bounds)
            validation_result = geofence_validator.validate_access(
                request.model_dump(),
                config,
                False
            )
        logger.info(f"Validation result for file {request.file_id}: {validation_result}")
        
        # Get file metadata for logging
        file_meta = await file_service.get_file_metadata(request.file_id)
        filename = file_meta.get("filename", "") if file_meta else ""
        
        # Log access attempt
        await file_service.log_file_access(
            employee_username=current_user["username"],
            file_id=request.file_id,
            filename=filename,
            action="access",
            success=validation_result["allowed"],
            reason=validation_result["reason"],
            location={"lat": request.latitude, "lon": request.longitude},
            wifi_ssid=request.wifi_ssid,
            wfh_request_id=wfh_id
        )
        
        if not validation_result["allowed"]:
            # Return structured validation result for better frontend debugging
            raise HTTPException(status_code=403, detail=validation_result)
        
        # Access granted - get file
        try:
            file_data = await file_service.access_file(request.file_id)
            
            return StreamingResponse(
                io.BytesIO(file_data["content"]),
                media_type=file_data["media_type"],
                headers={"Content-Disposition": f"inline; filename={file_data['filename']}"}
            )
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
            
    except HTTPException:
        # Re-raise HTTP exceptions as-is (with CORS headers)
        raise
    except Exception as e:
        logger.error(f"Error in file access endpoint: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

# WFH Request Routes
@api_router.post("/wfh-request")
async def create_wfh_request(request: WFHRequestCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.EMPLOYEE:
        raise HTTPException(status_code=403, detail="Employee access only")
    
    # Check if pending request exists
    existing = await db.wfh_requests.find_one({
        "employee_username": current_user["username"],
        "status": "pending"
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="You already have a pending request")
    
    request_dict = {
        "employee_username": current_user["username"],
        "reason": request.reason,
        "requested_at": datetime.now(timezone.utc).isoformat(),
        "status": "pending"
    }
    
    await db.wfh_requests.insert_one(request_dict)
    
    return {"message": "Work from home request submitted"}

@api_router.get("/wfh-request/status")
async def get_wfh_status(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.EMPLOYEE:
        raise HTTPException(status_code=403, detail="Employee access only")
    
    # Get the latest (most recent) WFH request, sorted by requested_at descending
    request = await db.wfh_requests.find_one(
        {"employee_username": current_user["username"]},
        {"_id": 0},
        sort=[("requested_at", -1)]
    )
    
    if not request:
        return {"status": "none", "message": "No work from home request found"}
    
    return request

# Include router FIRST
app.include_router(api_router)

# Add CORS middleware AFTER router - FastAPI middleware stack is processed in reverse order
# So last added = first applied
# Get allowed origins from environment, default to localhost:3000
cors_origins = os.environ.get('CORS_ORIGINS', 'http://localhost:3000').split(',')
cors_origins = [origin.strip() for origin in cors_origins]  # Clean whitespace

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,  # Restricted to specific origins
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],  # Explicit methods only
    allow_headers=["Content-Type", "Authorization"],  # Explicit headers only
)

# IP-based rate limiting middleware
@app.middleware("http")
async def ip_rate_limit_middleware(request, call_next):
    """Apply rate limiting per IP address"""
    client_ip = get_client_ip(request)
    
    # Check rate limit
    if not check_ip_rate_limit(client_ip):
        return HTTPException(status_code=429, detail="Too many requests from your IP. Please try again later.")
    
    response = await call_next(request)
    return response

# Security headers middleware
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    return response

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)