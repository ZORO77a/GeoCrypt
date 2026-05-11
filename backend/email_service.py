import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
import logging
import asyncio

logger = logging.getLogger(__name__)

async def send_otp_email(to_email: str, otp: str, username: str):
    """
    Send OTP via configurable SMTP. Supports local dev fallback to console.
    """
    # Core email content
    smtp_user = os.environ.get("SMTP_USER", "").strip() or os.environ.get("GMAIL_USER", "").strip()
    smtp_pass = os.environ.get("SMTP_PASS", "").replace(" ", "")
    gmail_app_password = os.environ.get("GMAIL_APP_PASSWORD", "").replace(" ", "")
    smtp_password = smtp_pass or gmail_app_password
    smtp_host = os.environ.get("SMTP_HOST", "").strip()
    smtp_port = int(os.environ.get("SMTP_PORT", "587")) if os.environ.get("SMTP_PORT") else 0
    smtp_use_starttls = os.environ.get("SMTP_USE_TLS", "true").lower() in ("1", "true", "yes")
    smtp_use_ssl = os.environ.get("SMTP_USE_SSL", "false").lower() in ("1", "true", "yes")

    password_candidates = []
    if smtp_pass:
        password_candidates.append(smtp_pass)
    if gmail_app_password and gmail_app_password != smtp_pass:
        password_candidates.append(gmail_app_password)

    if not smtp_host and os.environ.get("GMAIL_USER"):
        smtp_host = "smtp.gmail.com"
        if smtp_port == 0:
            smtp_port = 587

    otp_delivery_mode = os.environ.get("OTP_DELIVERY_MODE", "smtp").lower()

    if otp_delivery_mode not in ("smtp", "console"):
        otp_delivery_mode = "smtp"

    if otp_delivery_mode == "console":
        logger.warning(f"OTP_CONSOLE: {otp} for {username} -> {to_email} (smtp skipped)")
        return True

    if not smtp_user or not smtp_password or not smtp_host or smtp_port == 0:
        logger.error("SMTP configuration incomplete. Please set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS.")
        logger.warning(f"FALLBACK - OTP for '{username}' ({to_email}): {otp}")
        return True

    smtp_from = os.environ.get("SMTP_FROM", smtp_user)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "GeoCrypt - Your OTP Code"
    msg["From"] = smtp_from
    msg["To"] = to_email

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

    part = MIMEText(html, "html")
    msg.attach(part)

    # Attempt delivery modes
    last_error = None

    # Try primary configured host/port first, then fallback to standard SendGrid/Gmail options
    candidates = []
    if smtp_host and smtp_port:
        candidates.append((smtp_host, smtp_port, smtp_use_ssl, smtp_use_starttls))

    # Add fallback SMTP options when in both mode (for resilience, but on trusted networks not required)
    if otp_delivery_mode == "both":
        for fallback in [
            ("smtp.sendgrid.net", 587, False, True),  # STARTTLS
            ("smtp.sendgrid.net", 465, True, False),   # SSL 
            ("smtp.gmail.com", 587, False, True),
            ("smtp.gmail.com", 465, True, False),
        ]:
            if fallback not in candidates:
                candidates.append(fallback)

    async def do_send(host, p, use_tls=False, start_tls=False, password=None):
        await asyncio.wait_for(
            aiosmtplib.send(
                msg,
                hostname=host,
                port=p,
                username=smtp_user,
                password=password,
                timeout=30.0,
                use_tls=use_tls,
                start_tls=start_tls,
            ),
            timeout=45.0,
        )

    for host, port, use_tls, start_tls in candidates:
        for password in password_candidates:
            try:
                logger.info(f"Attempting OTP SMTP send via {host}:{port} (use_tls={use_tls}, start_tls={start_tls})")
                await do_send(host, port, use_tls=use_tls, start_tls=start_tls, password=password)
                logger.info(f"OTP email sent successfully to {to_email} via {host}:{port}")
                return True
            except Exception as e:
                last_error = e
                logger.warning(f"OTP send failed via {host}:{port} ({type(e).__name__}: {e})", exc_info=True)

    logger.error("All OTP SMTP modes failed; falling back to console logging", exc_info=True)
    logger.warning("════════════════════════════════════════")
    logger.warning(f"FALLBACK - OTP for '{username}' ({to_email}): {otp}")
    logger.warning("════════════════════════════════════════")
    if last_error:
        logger.warning(f"Last SMTP error type: {type(last_error).__name__}, message: {last_error}")

    return True



