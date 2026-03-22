from pathlib import Path
from dotenv import load_dotenv
import os

ROOT_DIR = Path(__file__).parent
env_path = ROOT_DIR / '.env'
print('ROOT_DIR:', ROOT_DIR)
print('Env file path:', env_path)
print('Env file exists:', env_path.exists())

# Try loading
result = load_dotenv(env_path)
print('Load result:', result)

# Check if variables are loaded
print('After loading:')
print('GMAIL_USER:', os.environ.get('GMAIL_USER'))
print('GMAIL_APP_PASSWORD:', os.environ.get('GMAIL_APP_PASSWORD'))
print('OTP_DELIVERY_MODE:', os.environ.get('OTP_DELIVERY_MODE'))
