from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Depends, Header
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import motor.motor_asyncio
import os
import logging
from pathlib import Path
from datetime import datetime, timedelta
import io
from typing import Optional, List

from models import (
    UserRole, User, UserCreate, LoginRequest, OTPVerifyRequest,
    FileMetadata, AccessLog, WFHRequest, AccessRequest, GeofenceConfig,
    EmployeeActivity
)
from auth import hash_password, verify_password, create_access_token, verify_token, generate_otp
from email_service import send_otp_email
from crypto_service import CryptoService
from geofence import GeofenceValidator
from ml_service import AnomalyDetector

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
fs = motor.motor_asyncio.AsyncIOMotorGridFSBucket(db)

# Initialize services
crypto_service = CryptoService()
geofence_validator = GeofenceValidator()
anomaly_detector = AnomalyDetector()

# Create the main app
app = FastAPI(title="GeoCrypt API")
api_router = APIRouter(prefix="/api")

logger = logging.getLogger(__name__)

# Dependency for auth
async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = authorization.replace("Bearer ", "")
    payload = verify_token(token)
    
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user = await db.users.find_one({"username": payload.get("sub")}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    return user

# Initialize admin account on startup
@app.on_event("startup")
async def create_admin():
    admin_exists = await db.users.find_one({"username": "admin"})
    if not admin_exists:
        admin_user = {
            "email": "ananthakrishnan272004@gmail.com",
            "username": "admin",
            "password_hash": hash_password("admin"),
            "role": UserRole.ADMIN,
            "created_at": datetime.utcnow().isoformat(),
            "is_active": True
        }
        await db.users.insert_one(admin_user)
        logger.info("Admin user created")
    
    # Create default geofence config
    config_exists = await db.geofence_config.find_one({})
    if not config_exists:
        default_config = {
            "latitude": 10.8505,  # Example: Kerala, India
            "longitude": 76.2711,
            "radius": 500,  # 500 meters
            "allowed_ssid": "OfficeWiFi",
            "start_time": "09:00",
            "end_time": "17:00"
        }
        await db.geofence_config.insert_one(default_config)
        logger.info("Default geofence config created")

# Auth Routes
@api_router.post("/auth/login")
async def login(request: LoginRequest):
    user = await db.users.find_one({"username": request.username}, {"_id": 0})
    
    if not user or not verify_password(request.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account is disabled")
    
    # Generate OTP
    otp = generate_otp()
    otp_expiry = datetime.utcnow() + timedelta(minutes=5)
    
    await db.users.update_one(
        {"username": request.username},
        {"$set": {"otp": otp, "otp_expiry": otp_expiry.isoformat()}}
    )
    
    # Send OTP via email
    try:
        await send_otp_email(user["email"], otp, user["username"])
    except Exception as e:
        logger.error(f"Failed to send OTP: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to send OTP. Please check email configuration.")
    
    return {
        "message": "OTP sent to your email",
        "username": user["username"],
        "role": user["role"]
    }

@api_router.post("/auth/verify-otp")
async def verify_otp(request: OTPVerifyRequest):
    user = await db.users.find_one({"username": request.username}, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if not user.get("otp") or user["otp"] != request.otp:
        raise HTTPException(status_code=401, detail="Invalid OTP")
    
    # Check OTP expiry
    otp_expiry = datetime.fromisoformat(user["otp_expiry"])
    if datetime.utcnow() > otp_expiry:
        raise HTTPException(status_code=401, detail="OTP expired")
    
    # Clear OTP
    await db.users.update_one(
        {"username": request.username},
        {"$set": {"otp": None, "otp_expiry": None}}
    )
    
    # Create access token
    token = create_access_token({"sub": user["username"], "role": user["role"]})
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user["role"],
        "username": user["username"]
    }

# Admin Routes
@api_router.post("/admin/employees")
async def create_employee(employee: UserCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
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
    
    logs = await db.access_logs.find({}, {"_id": 0}).sort("timestamp", -1).to_list(1000)
    return logs

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
    
    result = await db.wfh_requests.update_one(
        {"employee_username": employee_username, "status": "pending"},
        {"$set": {
            "status": status,
            "admin_comment": comment,
            "approved_at": datetime.utcnow().isoformat()
        }}
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
    
    # Read file content
    file_content = await file.read()
    
    # Encrypt file
    encryption_key = crypto_service.generate_key()
    encrypted_content = crypto_service.encrypt_file(file_content, encryption_key)
    
    # Store in GridFS
    file_id = await fs.upload_from_stream(
        file.filename,
        encrypted_content
    )
    
    # Store metadata
    metadata = {
        "file_id": str(file_id),
        "filename": file.filename,
        "uploaded_by": current_user["username"],
        "uploaded_at": datetime.utcnow().isoformat(),
        "encrypted": True,
        "size": len(file_content),
        "encryption_key": crypto_service.key_to_string(encryption_key)
    }
    
    await db.file_metadata.insert_one(metadata)
    
    return {"message": "File uploaded and encrypted", "file_id": str(file_id)}

@api_router.get("/files")
async def list_files(current_user: dict = Depends(get_current_user)):
    files = await db.file_metadata.find(
        {},
        {"_id": 0, "encryption_key": 0}  # Don't expose encryption key
    ).to_list(1000)
    
    return files

@api_router.post("/files/access")
async def access_file(request: AccessRequest, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.EMPLOYEE:
        # Admin has unrestricted access
        file_meta = await db.file_metadata.find_one({"file_id": request.file_id}, {"_id": 0})
        if not file_meta:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Get encrypted file
        grid_out = await fs.open_download_stream(file_meta["file_id"])
        encrypted_content = await grid_out.read()
        
        # Decrypt
        key = crypto_service.string_to_key(file_meta["encryption_key"])
        decrypted_content = crypto_service.decrypt_file(encrypted_content, key)
        
        return StreamingResponse(
            io.BytesIO(decrypted_content),
            media_type="application/octet-stream",
            headers={"Content-Disposition": f"attachment; filename={file_meta['filename']}"}
        )
    
    # Employee access - check conditions
    # Check if WFH approved
    wfh_request = await db.wfh_requests.find_one({
        "employee_username": current_user["username"],
        "status": "approved"
    })
    wfh_approved = wfh_request is not None
    
    # Get geofence config
    config = await db.geofence_config.find_one({}, {"_id": 0})
    
    # Validate access
    validation_result = geofence_validator.validate_access(
        request.model_dump(),
        config,
        wfh_approved
    )
    
    # Log access attempt
    log = {
        "employee_username": current_user["username"],
        "file_id": request.file_id,
        "filename": "",
        "action": "access",
        "timestamp": datetime.utcnow().isoformat(),
        "location": {"lat": request.latitude, "lon": request.longitude},
        "wifi_ssid": request.wifi_ssid,
        "success": validation_result["allowed"],
        "reason": validation_result["reason"]
    }
    
    file_meta = await db.file_metadata.find_one({"file_id": request.file_id}, {"_id": 0})
    if file_meta:
        log["filename"] = file_meta["filename"]
    
    await db.access_logs.insert_one(log)
    
    if not validation_result["allowed"]:
        raise HTTPException(status_code=403, detail=validation_result["reason"])
    
    # Access granted - decrypt and return file
    if not file_meta:
        raise HTTPException(status_code=404, detail="File not found")
    
    grid_out = await fs.open_download_stream(file_meta["file_id"])
    encrypted_content = await grid_out.read()
    
    key = crypto_service.string_to_key(file_meta["encryption_key"])
    decrypted_content = crypto_service.decrypt_file(encrypted_content, key)
    
    return StreamingResponse(
        io.BytesIO(decrypted_content),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={file_meta['filename']}"}
    )

# WFH Request Routes
@api_router.post("/wfh-request")
async def create_wfh_request(request: WFHRequest, current_user: dict = Depends(get_current_user)):
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
        "requested_at": datetime.utcnow().isoformat(),
        "status": "pending"
    }
    
    await db.wfh_requests.insert_one(request_dict)
    
    return {"message": "Work from home request submitted"}

@api_router.get("/wfh-request/status")
async def get_wfh_status(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.EMPLOYEE:
        raise HTTPException(status_code=403, detail="Employee access only")
    
    request = await db.wfh_requests.find_one(
        {"employee_username": current_user["username"]},
        {"_id": 0}
    )
    
    if not request:
        return {"status": "none", "message": "No work from home request found"}
    
    return request

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
