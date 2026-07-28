from datetime import timedelta
from email.message import EmailMessage
from email.utils import formataddr
import hashlib
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
from .security import utc_now


logger = logging.getLogger(__name__)

EMAIL_CODE_PURPOSE_REGISTER = "register"
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
EMAIL_CODE_PATTERN = re.compile(r"^\d{6}$")


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


def send_email_code(email: str, code: str) -> None:
    settings = get_settings()
    username = settings.smtp_username.strip()
    password = settings.smtp_password.strip()
    from_email = (settings.smtp_from_email or username).strip()

    if not settings.smtp_host.strip() or not username or not password or not from_email:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="邮件服务未配置")

    message = EmailMessage()
    message["From"] = formataddr((settings.smtp_from_name, from_email))
    message["To"] = email
    message["Subject"] = "OMELET Lab 注册验证码"
    message.set_content(
        "\n".join(
            [
                f"您的注册验证码是：{code}",
                f"验证码 {settings.email_code_expire_minutes} 分钟内有效，请勿转发给他人。",
                "如果这不是您本人操作，可以忽略这封邮件。",
            ],
        ),
    )

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
