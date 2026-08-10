from datetime import timedelta
from email.message import EmailMessage
from email.utils import formataddr
import hashlib
from html import escape
import hmac
import logging
import re
import secrets
import smtplib
import ssl

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .models import EmailVerificationCode, User
from .product import SOFTWARE_SHORT_NAME
from .security import utc_now


logger = logging.getLogger(__name__)

EMAIL_CODE_PURPOSE_REGISTER = "register"
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
EMAIL_CODE_PATTERN = re.compile(r"^\d{6}$")
DEFAULT_EMAIL_BRAND_NAME = SOFTWARE_SHORT_NAME
EMAIL_BRAND_COLOR = "#2f8ff0"


def normalize_email(value: str | None) -> str:
    email = (value or "").strip().lower()
    if len(email) > 255 or not EMAIL_PATTERN.fullmatch(email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="邮箱格式不正确")
    return email


def try_normalize_email(value: str | None) -> str | None:
    email = (value or "").strip().lower()
    if len(email) > 255 or not EMAIL_PATTERN.fullmatch(email):
        return None
    return email


def generate_email_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_email_code(email: str, code: str) -> str:
    settings = get_settings()
    payload = f"{email}:{code}".encode("utf-8")
    return hmac.new(settings.jwt_secret_key.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def ensure_email_not_registered(session: Session, email: str) -> None:
    exists = session.scalar(select(User.id).where(User.email == email))
    if exists is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该邮箱已注册")


def get_email_brand_name() -> str:
    brand_name = get_settings().smtp_from_name.strip()
    return brand_name or DEFAULT_EMAIL_BRAND_NAME


def build_email_code_plain_text(email: str, code: str) -> str:
    settings = get_settings()
    brand_name = get_email_brand_name()
    return "\n".join(
        [
            f"{email}，您好：",
            "您的验证码是：",
            code,
            f"验证码将在 {settings.email_code_expire_minutes} 分钟后失效。",
            "如果不是您本人操作，请忽略此邮件。",
            f"This email was sent by {brand_name}. Please do not reply directly.",
        ],
    )


def build_email_code_html(email: str, code: str) -> str:
    settings = get_settings()
    brand_name = get_email_brand_name()
    email_html = escape(email, quote=True)
    code_html = escape(code, quote=True)
    brand_html = escape(brand_name, quote=True)
    expire_minutes = settings.email_code_expire_minutes

    return f"""<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>邮箱验证码</title>
  </head>
  <body style="margin:0;padding:0;background:#f1f5f9;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background:#f1f5f9;">
      <tr>
        <td align="center" style="padding:48px 16px;">
          <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;border-collapse:separate;border-spacing:0;background:#ffffff;border-radius:16px;overflow:hidden;">
            <tr>
              <td bgcolor="{EMAIL_BRAND_COLOR}" style="padding:34px 48px;background:{EMAIL_BRAND_COLOR};color:#ffffff;font-family:Lato,'Helvetica Neue',Arial,'Microsoft YaHei',sans-serif;font-size:28px;line-height:1.3;font-weight:800;">
                邮箱验证码
              </td>
            </tr>
            <tr>
              <td style="padding:44px 48px 48px;background:#ffffff;color:#1f2937;font-family:Lato,'Helvetica Neue',Arial,'Microsoft YaHei',sans-serif;">
                <p style="margin:0 0 28px;font-size:20px;line-height:1.7;color:#1f2937;">{email_html}，您好：</p>
                <p style="margin:0 0 26px;font-size:20px;line-height:1.7;color:#1f2937;">您的验证码是：</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td align="center" style="padding:22px 0 34px;color:#111827;font-family:Lato,'Helvetica Neue',Arial,'Microsoft YaHei',sans-serif;font-size:48px;line-height:1;font-weight:800;letter-spacing:12px;white-space:nowrap;mso-line-height-rule:exactly;">
                      {code_html}
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 28px;font-size:20px;line-height:1.7;color:#1f2937;">验证码将在 <strong style="font-weight:800;">{expire_minutes}</strong> 分钟后失效。</p>
                <p style="margin:0;font-size:20px;line-height:1.7;color:#1f2937;">如果不是您本人操作，请忽略此邮件。</p>
              </td>
            </tr>
            <tr>
              <td bgcolor="#f8fafc" style="padding:24px 48px 30px;background:#f8fafc;color:#6b7280;font-family:Lato,'Helvetica Neue',Arial,'Microsoft YaHei',sans-serif;font-size:16px;line-height:1.55;">
                This email was sent by {brand_html}. Please do not reply directly.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""


def build_register_email_message(email: str, code: str) -> EmailMessage:
    settings = get_settings()
    username = settings.smtp_username.strip()
    from_email = (settings.smtp_from_email or username).strip()
    brand_name = get_email_brand_name()

    message = EmailMessage()
    message["From"] = formataddr((brand_name, from_email))
    message["To"] = email
    message["Subject"] = f"[{brand_name}] 邮箱验证码"
    message.set_content(build_email_code_plain_text(email, code))
    message.add_alternative(build_email_code_html(email, code), subtype="html")
    return message


def deliver_email_message(message: EmailMessage) -> None:
    settings = get_settings()
    username = settings.smtp_username.strip()
    password = settings.smtp_password.strip()
    from_email = (settings.smtp_from_email or username).strip()

    if not settings.smtp_host.strip() or not username or not password or not from_email:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="邮件服务未配置")

    context = ssl.create_default_context()
    try:
        if settings.smtp_use_ssl:
            with smtplib.SMTP_SSL(
                settings.smtp_host,
                settings.smtp_port,
                timeout=settings.smtp_timeout_seconds,
                context=context,
            ) as smtp:
                smtp.login(username, password)
                smtp.send_message(message)
        else:
            with smtplib.SMTP(
                settings.smtp_host,
                settings.smtp_port,
                timeout=settings.smtp_timeout_seconds,
            ) as smtp:
                smtp.starttls(context=context)
                smtp.login(username, password)
                smtp.send_message(message)
    except (OSError, smtplib.SMTPException) as exc:
        logger.warning("Register email verification code send failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="验证码邮件发送失败") from exc


def send_email_code(email: str, code: str) -> None:
    deliver_email_message(build_register_email_message(email, code))


def create_register_email_code(session: Session, email: str, client_ip: str | None = None) -> None:
    settings = get_settings()
    now = utc_now()

    ensure_email_not_registered(session, email)

    recent_code = session.scalar(
        select(EmailVerificationCode)
        .where(
            EmailVerificationCode.email == email,
            EmailVerificationCode.purpose == EMAIL_CODE_PURPOSE_REGISTER,
            EmailVerificationCode.consumed_at.is_(None),
            EmailVerificationCode.created_at >= now - timedelta(seconds=settings.email_code_resend_cooldown_seconds),
        )
        .order_by(EmailVerificationCode.created_at.desc(), EmailVerificationCode.id.desc()),
    )
    if recent_code is not None:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="验证码发送过于频繁，请稍后再试")

    for existing_code in session.scalars(
        select(EmailVerificationCode).where(
            EmailVerificationCode.email == email,
            EmailVerificationCode.purpose == EMAIL_CODE_PURPOSE_REGISTER,
            EmailVerificationCode.consumed_at.is_(None),
        ),
    ):
        existing_code.consumed_at = now

    code = generate_email_code()
    session.add(
        EmailVerificationCode(
            email=email,
            purpose=EMAIL_CODE_PURPOSE_REGISTER,
            code_hash=hash_email_code(email, code),
            client_ip=client_ip,
            expires_at=now + timedelta(minutes=settings.email_code_expire_minutes),
            created_at=now,
        ),
    )
    send_email_code(email, code)


def verify_register_email_code(session: Session, email: str, code: str | None) -> EmailVerificationCode:
    normalized_code = (code or "").strip()
    if not EMAIL_CODE_PATTERN.fullmatch(normalized_code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="邮箱验证码不正确或已过期")

    now = utc_now()
    record = session.scalar(
        select(EmailVerificationCode)
        .where(
            EmailVerificationCode.email == email,
            EmailVerificationCode.purpose == EMAIL_CODE_PURPOSE_REGISTER,
            EmailVerificationCode.consumed_at.is_(None),
        )
        .order_by(EmailVerificationCode.created_at.desc(), EmailVerificationCode.id.desc()),
    )
    if record is None or record.expires_at <= now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="邮箱验证码不正确或已过期")

    if not hmac.compare_digest(record.code_hash, hash_email_code(email, normalized_code)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="邮箱验证码不正确或已过期")

    return record
