from math import radians, sin, cos, sqrt, atan2
from datetime import datetime
from typing import Tuple, Dict
import logging

logger = logging.getLogger(__name__)

class GeofenceValidator:
    """
    Validate employee access based on geofencing, WiFi, and time conditions
    """
    
    @staticmethod
    def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """
        Calculate distance between two coordinates using Haversine formula
        Returns distance in meters
        """
        R = 6371000  # Earth's radius in meters
        
        lat1_rad = radians(lat1)
        lat2_rad = radians(lat2)
        delta_lat = radians(lat2 - lat1)
        delta_lon = radians(lon2 - lon1)
        
        a = sin(delta_lat / 2) ** 2 + cos(lat1_rad) * cos(lat2_rad) * sin(delta_lon / 2) ** 2
        c = 2 * atan2(sqrt(a), sqrt(1 - a))
        
        distance = R * c
        return distance
    
    @staticmethod
    def validate_location(employee_lat: float, employee_lon: float, 
                         config_lat: float, config_lon: float, radius: float) -> Tuple[bool, str]:
        """
        Validate if employee is within allowed geofence
        """
        distance = GeofenceValidator.calculate_distance(
            employee_lat, employee_lon, config_lat, config_lon
        )
        
        if distance <= radius:
            return True, f"Location validated (distance: {distance:.2f}m)"
        else:
            return False, f"Outside allowed area (distance: {distance:.2f}m, max: {radius}m)"
    
    @staticmethod
    def validate_wifi(employee_ssid: str, allowed_ssid: str) -> Tuple[bool, str]:
        """
        Validate if employee is connected to allowed WiFi
        """
        if not employee_ssid:
            return False, "WiFi SSID not provided"
        
        if employee_ssid.lower() == allowed_ssid.lower():
            return True, f"WiFi validated ({employee_ssid})"
        else:
            return False, f"Unauthorized WiFi network ({employee_ssid})"
    
    @staticmethod
    def validate_time(start_time: str, end_time: str) -> Tuple[bool, str]:
        """
        Validate if current time is within allowed hours
        start_time and end_time format: HH:MM
        """
        now = datetime.now()
        current_time = now.strftime("%H:%M")
        
        if start_time <= current_time <= end_time:
            return True, f"Time validated ({current_time})"
        else:
            return False, f"Outside allowed hours (current: {current_time}, allowed: {start_time}-{end_time})"
    
    @staticmethod
    def validate_access(request: Dict, config: Dict, wfh_approved: bool = False) -> Dict:
        """
        Complete validation of access request
        Returns dict with validation results
        """
        if wfh_approved:
            return {
                "allowed": True,
                "reason": "Work from home approved",
                "validations": {
                    "location": "bypassed",
                    "wifi": "bypassed",
                    "time": "bypassed"
                }
            }
        
        validations = {}
        reasons = []
        
        # Validate location
        location_valid, location_msg = GeofenceValidator.validate_location(
            request.get('latitude', 0),
            request.get('longitude', 0),
            config.get('latitude', 0),
            config.get('longitude', 0),
            config.get('radius', 100)
        )
        validations['location'] = location_msg
        if not location_valid:
            reasons.append(location_msg)
        
        # Validate WiFi
        wifi_valid, wifi_msg = GeofenceValidator.validate_wifi(
            request.get('wifi_ssid', ''),
            config.get('allowed_ssid', '')
        )
        validations['wifi'] = wifi_msg
        if not wifi_valid:
            reasons.append(wifi_msg)
        
        # Validate time
        time_valid, time_msg = GeofenceValidator.validate_time(
            config.get('start_time', '09:00'),
            config.get('end_time', '17:00')
        )
        validations['time'] = time_msg
        if not time_valid:
            reasons.append(time_msg)
        
        allowed = location_valid and wifi_valid and time_valid
        
        return {
            "allowed": allowed,
            "reason": "Access granted" if allowed else "; ".join(reasons),
            "validations": validations
        }
