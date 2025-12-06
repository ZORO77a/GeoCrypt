import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
import logging

logger = logging.getLogger(__name__)

async def send_otp_email(to_email: str, otp: str, username: str):
    """
    Send OTP via Gmail SMTP
    Requires GMAIL_USER and GMAIL_APP_PASSWORD in environment
    """
    gmail_user = os.environ.get("GMAIL_USER")
    gmail_password = os.environ.get("GMAIL_APP_PASSWORD")
    
    if not gmail_user or not gmail_password:
        logger.error("Gmail credentials not configured")
        raise ValueError("Email service not configured")
    
    msg = MIMEMultipart('alternative')
    msg['Subject'] = f"GeoCrypt - Your OTP Code"
    msg['From'] = gmail_user
    msg['To'] = to_email
    
    html = f"""
    <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; background: #f5f5f5; padding: 30px; border-radius: 10px;">
                <h2 style="color: #2c3e50;">GeoCrypt Authentication</h2>
                <p>Hello {username},</p>
                <p>Your One-Time Password (OTP) for login is:</p>
                <div style="background: #fff; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
                    <h1 style="color: #3498db; letter-spacing: 5px; margin: 0;">{otp}</h1>
                </div>
                <p style="color: #7f8c8d;">This OTP will expire in 5 minutes.</p>
                <p style="color: #7f8c8d; font-size: 12px; margin-top: 30px;">If you didn't request this code, please ignore this email.</p>
            </div>
        </body>
    </html>
    """
    
    part = MIMEText(html, 'html')
    msg.attach(part)
    
    try:
        await aiosmtplib.send(
            msg,
            hostname="smtp.gmail.com",
            port=587,
            start_tls=True,
            username=gmail_user,
            password=gmail_password,
        )
        logger.info(f"OTP email sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send OTP email: {str(e)}")
        raise
