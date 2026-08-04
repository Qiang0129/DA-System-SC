from datetime import datetime, timedelta
import hashlib
import secrets

import bcrypt
from fastapi import Response
from jose import JWTError, jwt

from .config import get_settings
from .time_utils import utc_now


REFRESH_COOKIE_NAME = "soft_web_refresh"
REFRESH_COOKIE_PATH = "/api/auth"
REFRESH_COOKIE_SAMESITE = "lax"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def set_refresh_cookie(response: Response, refresh_token: str) -> None:
    settings = get_settings()
    environment = settings.app_env.strip().lower()
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        httponly=True,
        secure=environment not in {"development", "test"},
        samesite=REFRESH_COOKIE_SAMESITE,
        path=REFRESH_COOKIE_PATH,
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path=REFRESH_COOKIE_PATH,
        samesite=REFRESH_COOKIE_SAMESITE,
    )


def create_access_token(user_id: int, username: str) -> str:
    settings = get_settings()
    expires_at = utc_now() + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": str(user_id),
        "username": username,
        "exp": expires_at,
        "type": "access",
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_turnstile_pass_token() -> tuple[str, datetime]:
    settings = get_settings()
    expires_at = utc_now() + timedelta(minutes=settings.turnstile_pass_expire_minutes)
    payload = {
        "sub": "turnstile",
        "scope": "auth",
        "exp": expires_at,
        "type": "turnstile_pass",
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm), expires_at


def decode_turnstile_pass_token(token: str) -> bool:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return False

    return payload.get("type") == "turnstile_pass" and payload.get("scope") == "auth"


def decode_access_token(token: str) -> int | None:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None

    if payload.get("type") != "access":
        return None

    subject = payload.get("sub")
    if subject is None:
        return None

    try:
        return int(subject)
    except ValueError:
        return None
