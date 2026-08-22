from datetime import timedelta
import logging

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_session
from .email_verification import (
    create_register_email_code,
    ensure_email_not_registered,
    normalize_email,
    try_normalize_email,
    verify_register_email_code,
)
from .models import User, UserSession
from .schemas import (
    AccessTokenResponse,
    AuthResponse,
    EmailCodeRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    TurnstilePassRequest,
    TurnstilePassResponse,
    UserResponse,
)
from .security import (
    create_access_token,
    create_refresh_token,
    create_turnstile_pass_token,
    clear_refresh_cookie,
    hash_password,
    hash_token,
    REFRESH_COOKIE_NAME,
    set_refresh_cookie,
    utc_now,
    verify_password,
)
from .turnstile import verify_turnstile_access, verify_turnstile_token

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)


def get_user_by_username(session: Session, username: str) -> User | None:
    return session.scalar(select(User).where(User.username == username))


def get_user_by_login_identifier(session: Session, identifier: str) -> User | None:
    normalized_email = try_normalize_email(identifier)
    if normalized_email is not None:
        user = session.scalar(select(User).where(User.email == normalized_email))
        if user is not None:
            return user

    return get_user_by_username(session, identifier.strip())


def get_active_user_or_401(session: Session, identifier: str, password: str) -> User:
    user = get_user_by_login_identifier(session, identifier)
    if not user or user.status != "active" or not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
        )
    return user


def create_user_session(session: Session, user: User) -> tuple[str, str]:
    settings = get_settings()
    refresh_token = create_refresh_token()
    refresh_token_hash = hash_token(refresh_token)
    user_session = UserSession(
        user_id=user.id,
        refresh_token_hash=refresh_token_hash,
        expires_at=utc_now() + timedelta(days=settings.refresh_token_expire_days),
    )
    session.add(user_session)
    access_token = create_access_token(user.id, user.username)
    return access_token, refresh_token


def revoke_all_user_sessions(session: Session, user_id: int, revoked_at) -> None:
    session.execute(
        update(UserSession)
        .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
        .values(revoked_at=revoked_at),
    )


def _raise_refresh_error(message: str) -> None:
    """通过异常响应明确清除浏览器中的刷新 Cookie。"""
    cookie_response = Response()
    clear_refresh_cookie(cookie_response)
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=message,
        headers={"set-cookie": cookie_response.headers["set-cookie"]},
    )


def parse_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="缺少登录凭证")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="登录凭证格式无效")
    return token


@router.post("/turnstile-pass", response_model=TurnstilePassResponse)
def create_turnstile_pass(payload: TurnstilePassRequest):
    verify_turnstile_token(payload.turnstile_token, payload.action)
    pass_token, expires_at = create_turnstile_pass_token()
    expires_in_seconds = max(0, int((expires_at - utc_now()).total_seconds()))
    return TurnstilePassResponse(
        turnstile_pass_token=pass_token,
        expires_at=expires_at,
        expires_in_seconds=expires_in_seconds,
    )


@router.post("/register/email-code", response_model=MessageResponse)
def send_register_email_code(
    payload: EmailCodeRequest,
    request: Request,
    session: Session = Depends(get_session),
):
    if not get_settings().email_verification_required:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="当前部署未启用邮箱验证码",
        )

    verify_turnstile_access(payload.turnstile_token, payload.turnstile_pass_token, "register")

    email = normalize_email(payload.email)
    client_ip = request.client.host if request.client else None
    try:
        create_register_email_code(session, email, client_ip)
        session.commit()
    except HTTPException:
        session.rollback()
        raise

    return MessageResponse(message="验证码已发送")


def get_current_user(
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
) -> User:
    from .security import decode_access_token

    token = parse_bearer_token(authorization)
    user_id = decode_access_token(token)
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="登录凭证无效或已过期")

    user = session.get(User, user_id)
    if not user or user.status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不可用")
    return user


@router.post("/register", response_model=AuthResponse)
def register(payload: RegisterRequest, response: Response, session: Session = Depends(get_session)):
    settings = get_settings()
    email: str | None = None
    email_code_record = None

    if settings.email_verification_required:
        if payload.email is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请填写邮箱")
        email = normalize_email(payload.email)
        ensure_email_not_registered(session, email)
        email_code_record = verify_register_email_code(session, email, payload.email_code)
    elif payload.email:
        email = normalize_email(payload.email)
        ensure_email_not_registered(session, email)

    user = User(
        username=payload.username,
        email=email,
        password_hash=hash_password(payload.password),
        role="user",
        status="active",
    )
    session.add(user)
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="用户名或邮箱已存在") from exc

    user.last_login_at = utc_now()
    if email_code_record is not None:
        email_code_record.consumed_at = utc_now()

    access_token, refresh_token = create_user_session(session, user)
    session.commit()
    session.refresh(user)
    set_refresh_cookie(response, refresh_token)

    return AuthResponse(
        user=UserResponse.model_validate(user),
        access_token=access_token,
    )


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, response: Response, session: Session = Depends(get_session)):
    verify_turnstile_access(payload.turnstile_token, payload.turnstile_pass_token, "login")

    user = get_active_user_or_401(session, payload.username, payload.password)
    user.last_login_at = utc_now()
    access_token, refresh_token = create_user_session(session, user)
    session.commit()
    session.refresh(user)
    set_refresh_cookie(response, refresh_token)

    return AuthResponse(
        user=UserResponse.model_validate(user),
        access_token=access_token,
    )


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)):
    return UserResponse.model_validate(user)


@router.post("/refresh", response_model=AccessTokenResponse)
def refresh(
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
    session: Session = Depends(get_session),
):
    if not refresh_token:
        _raise_refresh_error("缺少刷新凭证")

    token_hash = hash_token(refresh_token)
    now = utc_now()
    user_session = session.scalar(
        select(UserSession)
        .where(UserSession.refresh_token_hash == token_hash)
        .with_for_update(),
    )
    if not user_session:
        _raise_refresh_error("刷新凭证无效或已过期")

    if user_session.revoked_at is not None:
        revoke_all_user_sessions(session, user_session.user_id, now)
        session.commit()
        logger.warning(
            "refresh token reuse detected",
            extra={"user_id": user_session.user_id, "session_id": user_session.id},
        )
        _raise_refresh_error("检测到刷新凭证重复使用，请重新登录")

    if user_session.expires_at <= now or user_session.user.status != "active":
        user_session.revoked_at = now
        session.commit()
        _raise_refresh_error("刷新凭证无效或已过期")

    user_session.revoked_at = now
    access_token, next_refresh_token = create_user_session(session, user_session.user)
    session.commit()
    set_refresh_cookie(response, next_refresh_token)
    return AccessTokenResponse(
        access_token=access_token,
    )


@router.post("/logout", response_model=MessageResponse)
def logout(
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
    session: Session = Depends(get_session),
):
    if not refresh_token:
        clear_refresh_cookie(response)
        return MessageResponse(message="已退出登录")

    token_hash = hash_token(refresh_token)
    user_session = session.scalar(
        select(UserSession).where(UserSession.refresh_token_hash == token_hash),
    )
    if user_session and user_session.revoked_at is None:
        user_session.revoked_at = utc_now()
        session.commit()

    clear_refresh_cookie(response)
    return MessageResponse(message="已退出登录")
