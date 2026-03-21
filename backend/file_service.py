"""
File Management Service
Handles all file operations: upload, download, list, decrypt, encrypt
Separates file management logic from API endpoints
"""

import io
import time
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from bson import ObjectId

logger = logging.getLogger(__name__)


class FileService:
    """Service for managing file operations including encryption/decryption"""
    
    def __init__(self, fs, db, crypto_service):
        """
        Initialize FileService
        
        Args:
            fs: GridFS instance for file storage
            db: MongoDB database instance
            crypto_service: CryptoService instance for encryption/decryption
        """
        self.fs = fs
        self.db = db
        self.crypto_service = crypto_service
    
    async def upload_file(
        self, 
        file_content: bytes,
        filename: str,
        uploaded_by: str,
        file_object=None
    ) -> Dict[str, Any]:
        """
        Upload and encrypt a file
        
        Args:
            file_content: Raw file content bytes
            filename: Name of the file
            uploaded_by: Username of the uploader
            file_object: Optional file object for direct upload
            
        Returns:
            Dictionary containing file_id, filename, and metadata with timing info
        """
        start_total = time.perf_counter()
        
        # Read file content if not provided
        if file_object and not file_content:
            start = time.perf_counter()
            file_content = await file_object.read()
            read_time = time.perf_counter() - start
        else:
            read_time = 0
        
        # Encrypt file
        start = time.perf_counter()
        encryption_key = self.crypto_service.generate_key()
        encrypted_content = self.crypto_service.encrypt_file(file_content, encryption_key)
        encrypt_time = time.perf_counter() - start
        
        # Store in GridFS
        start = time.perf_counter()
        file_id = await self.fs.upload_from_stream(
            filename,
            encrypted_content
        )
        store_time = time.perf_counter() - start
        
        total_time = time.perf_counter() - start_total
        
        # Store metadata
        metadata = {
            "file_id": str(file_id),
            "filename": filename,
            "uploaded_by": uploaded_by,
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "encrypted": True,
            "size": len(file_content),
            "encryption_key": self.crypto_service.key_to_string(encryption_key),
            "timings_ms": {
                "read_ms": round(read_time * 1000, 3),
                "encrypt_ms": round(encrypt_time * 1000, 3),
                "store_ms": round(store_time * 1000, 3),
                "total_ms": round(total_time * 1000, 3)
            }
        }
        
        await self.db.file_metadata.insert_one(metadata)
        
        logger.info(f"File uploaded: {metadata['file_id']} by {uploaded_by}. Timings: {metadata['timings_ms']}")
        
        return {
            "file_id": str(file_id),
            "filename": filename,
            "message": "File uploaded and encrypted",
            "timings_ms": metadata["timings_ms"]
        }
    
    async def list_files(
        self,
        uploaded_by: Optional[str] = None,
        exclude_encryption_key: bool = True
    ) -> List[Dict[str, Any]]:
        """
        List files, optionally filtered by uploader
        
        Args:
            uploaded_by: Optional username to filter by
            exclude_encryption_key: Whether to exclude encryption key from response
            
        Returns:
            List of file metadata dictionaries
        """
        query = {}
        if uploaded_by:
            query = {"uploaded_by": uploaded_by}
        
        projection = {"_id": 0}
        if exclude_encryption_key:
            projection["encryption_key"] = 0
        
        files = await self.db.file_metadata.find(query, projection).to_list(1000)
        
        logger.info(f"Listed {len(files)} files with query {query}")
        
        return files
    
    async def get_file_metadata(self, file_id: str) -> Optional[Dict[str, Any]]:
        """
        Get file metadata by ID
        
        Args:
            file_id: ID of the file
            
        Returns:
            File metadata dictionary or None
        """
        metadata = await self.db.file_metadata.find_one(
            {"file_id": file_id},
            {"_id": 0}
        )
        return metadata
    
    async def download_file(self, file_id: str) -> tuple[bytes, str]:
        """
        Download and decrypt a file
        
        Args:
            file_id: ID of the file to download
            
        Returns:
            Tuple of (decrypted_content, filename)
            
        Raises:
            ValueError: If file not found
        """
        # Get metadata
        file_meta = await self.get_file_metadata(file_id)
        if not file_meta:
            raise ValueError(f"File {file_id} not found")
        
        # Download encrypted file
        grid_out = await self.fs.open_download_stream(ObjectId(file_meta["file_id"]))
        encrypted_content = await grid_out.read()
        
        # Decrypt
        key = self.crypto_service.string_to_key(file_meta["encryption_key"])
        decrypted_content = self.crypto_service.decrypt_file(encrypted_content, key)
        
        logger.info(f"File downloaded: {file_id}")
        
        return decrypted_content, file_meta["filename"]
    
    async def access_file(
        self,
        file_id: str,
        user_ip: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Access a file and return decrypted content with media type info
        
        Args:
            file_id: ID of the file
            user_ip: Optional IP address of the requester
            
        Returns:
            Dictionary with content, filename, and media_type
            
        Raises:
            ValueError: If file not found
        """
        decrypted_content, filename = await self.download_file(file_id)
        media_type = self._get_media_type(filename)
        
        logger.info(f"File accessed: {file_id} by IP {user_ip}")
        
        return {
            "content": decrypted_content,
            "filename": filename,
            "media_type": media_type
        }
    
    def _get_media_type(self, filename: str) -> str:
        """
        Determine media type based on file extension
        
        Args:
            filename: Name of the file
            
        Returns:
            MIME type string
        """
        filename_lower = filename.lower()
        
        mime_types = {
            '.pdf': 'application/pdf',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.txt': 'text/plain',
            '.log': 'text/plain',
            '.json': 'application/json',
            '.csv': 'text/csv',
            '.md': 'text/markdown',
            '.webp': 'image/webp',
            '.bmp': 'image/bmp'
        }
        
        # Support Microsoft Office Open XML formats with in-browser handlers where available
        office_mime_types = {
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.ppt': 'application/vnd.ms-powerpoint',
            '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            '.xls': 'application/vnd.ms-excel',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.odt': 'application/vnd.oasis.opendocument.text',
            '.odp': 'application/vnd.oasis.opendocument.presentation',
            '.ods': 'application/vnd.oasis.opendocument.spreadsheet'
        }

        for ext, mime_type in office_mime_types.items():
            if filename_lower.endswith(ext):
                return mime_type

        for ext, mime_type in mime_types.items():
            if filename_lower.endswith(ext):
                return mime_type

        return 'application/octet-stream'
    
    async def log_file_access(
        self,
        employee_username: str,
        file_id: str,
        filename: str,
        action: str = 'access',
        success: bool = True,
        reason: str = '',
        location: Optional[Dict[str, float]] = None,
        wifi_ssid: Optional[str] = None,
        wfh_request_id: Optional[str] = None
    ) -> None:
        """
        Log file access attempt
        
        Args:
            employee_username: Username of the employee
            file_id: ID of the file accessed
            filename: Name of the file
            action: Type of action ('access', 'download', etc.)
            success: Whether the access was successful
            reason: Reason for success/failure
            location: Dictionary with 'lat' and 'lon'
            wifi_ssid: WiFi SSID if available
            wfh_request_id: Associated WFH request ID if applicable
        """
        log = {
            "employee_username": employee_username,
            "file_id": file_id,
            "filename": filename,
            "action": action,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "success": success,
            "reason": reason
        }
        
        if location:
            log["location"] = location
        if wifi_ssid:
            log["wifi_ssid"] = wifi_ssid
        if wfh_request_id:
            log["wfh_request_id"] = wfh_request_id
        
        await self.db.access_logs.insert_one(log)
        
        logger.info(f"File access logged: {file_id} by {employee_username}, success={success}")
    
    async def delete_file(self, file_id: str) -> bool:
        """
        Delete a file and its metadata
        
        Args:
            file_id: ID of the file to delete
            
        Returns:
            True if deleted, False if not found
        """
        # Get metadata to get GridFS ID
        file_meta = await self.get_file_metadata(file_id)
        if not file_meta:
            logger.warning(f"File {file_id} not found for deletion")
            return False
        
        # Delete from GridFS
        await self.fs.delete(ObjectId(file_meta["file_id"]))
        
        # Delete metadata
        await self.db.file_metadata.delete_one({"file_id": file_id})
        
        logger.info(f"File deleted: {file_id}")
        return True
    
    async def get_file_stats(self) -> Dict[str, Any]:
        """
        Get file management statistics
        
        Returns:
            Dictionary with file stats
        """
        total_files = await self.db.file_metadata.count_documents({})
        
        # Get total size
        stats = await self.db.file_metadata.aggregate([
            {
                "$group": {
                    "_id": None,
                    "total_size": {"$sum": "$size"},
                    "file_count": {"$sum": 1}
                }
            }
        ]).to_list(1)
        
        if stats:
            total_size = stats[0].get("total_size", 0)
        else:
            total_size = 0
        
        # Get access logs count
        access_count = await self.db.access_logs.count_documents({})
        
        return {
            "total_files": total_files,
            "total_size_bytes": total_size,
            "total_accesses": access_count
        }
    
    async def validate_file_exists(self, file_id: str) -> bool:
        """
        Check if a file exists
        
        Args:
            file_id: ID of the file
            
        Returns:
            True if file exists
        """
        metadata = await self.get_file_metadata(file_id)
        return metadata is not None


class FilePermissionValidator:
    """Validates file access permissions"""
    
    def __init__(self, db):
        self.db = db
    
    async def can_access_file(
        self,
        user_role: str,
        user_username: str,
        file_id: str,
        has_wfh_approval: bool = False
    ) -> tuple[bool, str]:
        """
        Check if user can access a file
        
        Args:
            user_role: User's role (ADMIN or EMPLOYEE)
            user_username: Username of the user
            file_id: ID of the file
            has_wfh_approval: Whether user has WFH approval
            
        Returns:
            Tuple of (allowed: bool, reason: str)
        """
        # Check if file exists
        file_meta = await self.db.file_metadata.find_one({"file_id": file_id})
        if not file_meta:
            return False, "File not found"
        
        # Admins can access everything
        if user_role == "ADMIN":
            return True, "Admin access"
        
        # Employees can only access admin-uploaded files
        if file_meta.get("uploaded_by") != "admin":
            return False, "File not uploaded by admin"
        
        # WFH approval allows access
        if has_wfh_approval:
            return True, "WFH approved"
        
        # Otherwise need geofence validation (handled by caller)
        return False, "Geofence validation required"
