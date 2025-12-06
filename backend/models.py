from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum

class UserRole(str, Enum):
    ADMIN = "admin"
    EMPLOYEE = "employee"

class User(BaseModel):
    email: EmailStr
    username: str
    password_hash: str
    role: UserRole
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True
    otp: Optional[str] = None
    otp_expiry: Optional[datetime] = None

class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str
    role: UserRole = UserRole.EMPLOYEE

class LoginRequest(BaseModel):
    username: str
    password: str

class OTPVerifyRequest(BaseModel):
    username: str
    otp: str

class FileMetadata(BaseModel):
    file_id: str
    filename: str
    uploaded_by: str
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    encrypted: bool = True
    size: int
    encryption_key: Optional[str] = None

class GeofenceConfig(BaseModel):
    latitude: float
    longitude: float
    radius: float  # in meters
    allowed_ssid: str
    start_time: str  # HH:MM
    end_time: str  # HH:MM

class AccessLog(BaseModel):
    employee_username: str
    file_id: str
    filename: str
    action: str  # access, download, denied
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    location: Optional[dict] = None
    wifi_ssid: Optional[str] = None
    success: bool
    reason: Optional[str] = None

class WFHRequest(BaseModel):
    employee_username: str
    reason: str
    requested_at: datetime = Field(default_factory=datetime.utcnow)
    status: str = "pending"  # pending, approved, rejected
    admin_comment: Optional[str] = None
    approved_at: Optional[datetime] = None

class AccessRequest(BaseModel):
    latitude: float
    longitude: float
    wifi_ssid: Optional[str] = None
    file_id: str

class EmployeeActivity(BaseModel):
    employee_username: str
    activity_type: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict = {}
