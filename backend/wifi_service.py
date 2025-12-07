import subprocess
import platform
import logging

logger = logging.getLogger(__name__)

class WiFiService:
    """
    Detect the currently connected WiFi SSID across different platforms.
    Supports Linux, macOS, and Windows.
    """
    
    @staticmethod
    def get_connected_ssid() -> str:
        """
        Detect and return the currently connected WiFi SSID.
        Returns empty string if not connected or detection fails.
        """
        system = platform.system()
        
        try:
            if system == "Linux":
                return WiFiService._get_ssid_linux()
            elif system == "Darwin":  # macOS
                return WiFiService._get_ssid_macos()
            elif system == "Windows":
                return WiFiService._get_ssid_windows()
            else:
                logger.warning(f"WiFi detection not supported on {system}")
                return ""
        except Exception as e:
            logger.error(f"Error detecting WiFi SSID: {e}")
            return ""
    
    @staticmethod
    def _get_ssid_linux() -> str:
        """
        Detect WiFi SSID on Linux using nmcli or iwconfig.
        nmcli is preferred if available.
        """
        try:
            # Try nmcli first (NetworkManager)
            result = subprocess.run(
                ["nmcli", "-t", "-f", "active,ssid", "dev", "wifi"],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0:
                lines = result.stdout.strip().split('\n')
                for line in lines:
                    parts = line.split(':', 1)
                    if len(parts) == 2 and parts[0].strip() == "yes":
                        ssid = parts[1].strip()
                        if ssid:
                            return ssid
            
            # Fallback to iwconfig if nmcli fails
            result = subprocess.run(
                ["iwconfig"],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0:
                for line in result.stdout.split('\n'):
                    if 'ESSID' in line:
                        # Extract SSID from line like: ESSID:"NetworkName"
                        parts = line.split('ESSID:')
                        if len(parts) > 1:
                            ssid = parts[1].strip().strip('"')
                            if ssid and ssid != "off/any":
                                return ssid
            
            return ""
        except FileNotFoundError:
            logger.warning("nmcli or iwconfig not found on Linux system")
            return ""
        except subprocess.TimeoutExpired:
            logger.warning("WiFi detection command timed out")
            return ""
    
    @staticmethod
    def _get_ssid_macos() -> str:
        """
        Detect WiFi SSID on macOS using airport utility.
        """
        try:
            result = subprocess.run(
                ["/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport", "-I"],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0:
                for line in result.stdout.split('\n'):
                    if 'SSID:' in line:
                        parts = line.split('SSID:')
                        if len(parts) > 1:
                            ssid = parts[1].strip()
                            if ssid:
                                return ssid
            
            return ""
        except FileNotFoundError:
            logger.warning("airport utility not found on macOS system")
            return ""
        except subprocess.TimeoutExpired:
            logger.warning("WiFi detection command timed out")
            return ""
    
    @staticmethod
    def _get_ssid_windows() -> str:
        """
        Detect WiFi SSID on Windows using netsh command.
        """
        try:
            result = subprocess.run(
                ["netsh", "wlan", "show", "interfaces"],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0:
                for line in result.stdout.split('\n'):
                    if 'SSID' in line:
                        parts = line.split(':')
                        if len(parts) > 1:
                            ssid = parts[1].strip()
                            if ssid and ssid.lower() != "none":
                                return ssid
            
            return ""
        except FileNotFoundError:
            logger.warning("netsh command not found on Windows system")
            return ""
        except subprocess.TimeoutExpired:
            logger.warning("WiFi detection command timed out")
            return ""
