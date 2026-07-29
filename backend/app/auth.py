from datetime import timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
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
    RefreshRequest,
    RegisterRequest,
    TurnstilePassRequest,
    TurnstilePassResponse,
    UserResponse,
)
from .security import (
    create_access_token,
    create_refresh_token,
    create_turnstile_pass_token,
    hash_password,
    hash_token,
    utc_now,
    verify_password,
)
from .turnstile import verify_turnstile_access, verify_turnstile_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


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
def register(payload: RegisterRequest, session: Session = Depends(get_session)):
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

    return AuthResponse(
        user=UserResponse.model_validate(user),
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, session: Session = Depends(get_session)):
    verify_turnstile_access(payload.turnstile_token, payload.turnstile_pass_token, "login")

    user = get_active_user_or_401(session, payload.username, payload.password)
    user.last_login_at = utc_now()
    access_token, refresh_token = create_user_session(session, user)
    session.commit()
    session.refresh(user)

    return AuthResponse(
        user=UserResponse.model_validate(user),
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)):
    return UserResponse.model_validate(user)


@router.post("/refresh", response_model=AccessTokenResponse)
def refresh(payload: RefreshRequest, session: Session = Depends(get_session)):
    token_hash = hash_token(payload.refresh_token)
    user_session = session.scalar(
        select(UserSession).where(UserSession.refresh_token_hash == token_hash),
    )
    if (
        not user_session
        or user_session.revoked_at is not None
        or user_session.expires_at <= utc_now()
        or user_session.user.status != "active"
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="刷新凭证无效或已过期")

    return AccessTokenResponse(
        access_token=create_access_token(user_session.user.id, user_session.user.username),
    )


@router.post("/logout", response_model=MessageResponse)
def logout(payload: RefreshRequest, session: Session = Depends(get_session)):
    token_hash = hash_token(payload.refresh_token)
    user_session = session.scalar(
        select(UserSession).where(UserSession.refresh_token_hash == token_hash),
    )
    if user_session and user_session.revoked_at is None:
        user_session.revoked_at = utc_now()
        session.commit()

    return MessageResponse(message="已退出登录")
