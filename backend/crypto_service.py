from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes
from Crypto.Protocol.KDF import PBKDF2
import base64
import os

class CryptoService:
    """
    Post-Quantum Cryptography service using AES-256
    Note: This uses AES-256 which is quantum-resistant for symmetric encryption
    For full PQC, CRYSTALS-Kyber can be integrated via liboqs Python bindings
    """
    
    @staticmethod
    def generate_key() -> bytes:
        """Generate a random 256-bit key"""
        return get_random_bytes(32)
    
    @staticmethod
    def encrypt_file(file_data: bytes, key: bytes) -> bytes:
        """
        Encrypt file data using AES-256 in GCM mode
        GCM provides authenticated encryption
        """
        cipher = AES.new(key, AES.MODE_GCM)
        ciphertext, tag = cipher.encrypt_and_digest(file_data)
        
        # Combine nonce + tag + ciphertext
        encrypted_data = cipher.nonce + tag + ciphertext
        return encrypted_data
    
    @staticmethod
    def decrypt_file(encrypted_data: bytes, key: bytes) -> bytes:
        """
        Decrypt file data
        """
        # Extract nonce, tag, and ciphertext
        nonce = encrypted_data[:16]
        tag = encrypted_data[16:32]
        ciphertext = encrypted_data[32:]
        
        cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
        plaintext = cipher.decrypt_and_verify(ciphertext, tag)
        return plaintext
    
    @staticmethod
    def key_to_string(key: bytes) -> str:
        """Convert key to base64 string for storage"""
        return base64.b64encode(key).decode('utf-8')
    
    @staticmethod
    def string_to_key(key_str: str) -> bytes:
        """Convert base64 string back to key"""
        return base64.b64decode(key_str)
