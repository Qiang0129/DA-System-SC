import logging

import httpx
from fastapi import HTTPException, status

from .config import get_settings
from .security import decode_turnstile_pass_token


logger = logging.getLogger(__name__)


def verify_turnstile_token(token: str | None, expected_action: str) -> None:
    settings = get_settings()
    secret_key = settings.turnstile_secret_key.strip()

    if not secret_key:
        return

    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请先完成人机验证",
        )

    # Turnstile token 只能使用一次，认证前先完成服务端校验，避免创建无效会话。
    try:
        with httpx.Client(timeout=settings.turnstile_timeout_seconds) as client:
            response = client.post(
                settings.turnstile_verify_url,
                data={
                    "secret": secret_key,
                    "response": token,
                },
            )
            response.raise_for_status()
            result = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Cloudflare Turnstile verification request failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="人机验证服务暂不可用",
        ) from exc

    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="人机验证失败，请重新验证",
        )

    if result.get("action") != expected_action:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="人机验证场景不匹配，请重新验证",
        )


def verify_turnstile_access(
    turnstile_token: str | None,
    turnstile_pass_token: str | None,
    expected_action: str,
) -> None:
    settings = get_settings()
    secret_key = settings.turnstile_secret_key.strip()

    if not secret_key:
        return

    if turnstile_pass_token:
        if decode_turnstile_pass_token(turnstile_pass_token):
            return
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="人机验证已过期，请重新验证",
        )

    verify_turnstile_token(turnstile_token, expected_action)
