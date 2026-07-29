from datetime import timedelta

import httpx
from fastapi.testclient import TestClient
from jose import jwt

from app.database import Base, get_session, make_engine, make_session_factory
from main import app


def make_test_client():
    engine = make_engine("sqlite+pysqlite:///:memory:")
    TestingSessionLocal = make_session_factory(engine)
    Base.metadata.create_all(bind=engine)

    def override_get_session():
        with TestingSessionLocal() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    return TestClient(app)


class TurnstileSettings:
    turnstile_secret_key = "test-secret"
    turnstile_verify_url = "https://turnstile.example.test/siteverify"
    turnstile_timeout_seconds = 3.0


class FakeTurnstileResponse:
    def __init__(self, payload: dict):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class FakeTurnstileClient:
    requests: list[dict] = []
    response_payload: dict = {"success": True, "action": "register"}
    error: Exception | None = None

    def __init__(self, timeout: float):
        self.timeout = timeout

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def post(self, url: str, data: dict):
        if self.error:
            raise self.error
        self.requests.append({"url": url, "data": data, "timeout": self.timeout})
        return FakeTurnstileResponse(self.response_payload)


def enable_turnstile(monkeypatch, payload: dict | None = None, error: Exception | None = None):
    from app import turnstile

    FakeTurnstileClient.requests = []
    FakeTurnstileClient.response_payload = payload or {"success": True, "action": "register"}
    FakeTurnstileClient.error = error
    monkeypatch.setattr(turnstile, "get_settings", lambda: TurnstileSettings())
    monkeypatch.setattr(turnstile.httpx, "Client", FakeTurnstileClient)


def make_invalid_turnstile_pass(payload: dict) -> str:
    from app import security

    settings = security.get_settings()
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def test_register_login_me_and_logout_flow():
    client = make_test_client()

    register_response = client.post(
        "/api/auth/register",
        json={
            "username": "alice",
            "email": "Alice@example.com",
            "password": "secret123",
            "confirm_password": "secret123",
        },
    )

    assert register_response.status_code == 200
    register_body = register_response.json()
    assert register_body["user"]["username"] == "alice"
    assert register_body["user"]["email"] == "alice@example.com"
    assert register_body["user"]["role"] == "user"
    assert register_body["access_token"]
    assert register_body["refresh_token"]

    duplicate_response = client.post(
        "/api/auth/register",
        json={
            "username": "alice",
            "email": "alice2@example.com",
            "password": "secret123",
            "confirm_password": "secret123",
        },
    )
    assert duplicate_response.status_code == 409

    duplicate_email_response = client.post(
        "/api/auth/register",
        json={
            "username": "bob",
            "email": "alice@example.com",
            "password": "secret123",
            "confirm_password": "secret123",
        },
    )
    assert duplicate_email_response.status_code == 409

    bad_login_response = client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "wrong-password"},
    )
    assert bad_login_response.status_code == 401

    login_response = client.post(
        "/api/auth/login",
        json={"username": "alice@example.com", "password": "secret123"},
    )
    assert login_response.status_code == 200
    login_body = login_response.json()

    me_response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {login_body['access_token']}"},
    )
    assert me_response.status_code == 200
    assert me_response.json()["username"] == "alice"

    refresh_response = client.post(
        "/api/auth/refresh",
        json={"refresh_token": login_body["refresh_token"]},
    )
    assert refresh_response.status_code == 200
    assert refresh_response.json()["access_token"]

    logout_response = client.post(
        "/api/auth/logout",
        json={"refresh_token": login_body["refresh_token"]},
    )
    assert logout_response.status_code == 200

    revoked_refresh_response = client.post(
        "/api/auth/refresh",
        json={"refresh_token": login_body["refresh_token"]},
    )
    assert revoked_refresh_response.status_code == 401


def test_email_verification_register_flow_and_login_by_email(monkeypatch):
    from app import auth, email_verification

    base_settings = auth.get_settings()

    class EmailRequiredSettings:
        email_verification_required = True

        def __getattr__(self, name: str):
            return getattr(base_settings, name)

    sent_codes: list[tuple[str, str]] = []
    monkeypatch.setattr(auth, "get_settings", lambda: EmailRequiredSettings())
    monkeypatch.setattr(email_verification, "generate_email_code", lambda: "123456")
    monkeypatch.setattr(email_verification, "send_email_code", lambda email, code: sent_codes.append((email, code)))
    client = make_test_client()

    code_response = client.post(
        "/api/auth/register/email-code",
        json={"email": "Alice@Example.com"},
    )

    assert code_response.status_code == 200
    assert code_response.json()["message"] == "验证码已发送"
    assert sent_codes == [("alice@example.com", "123456")]

    register_response = client.post(
        "/api/auth/register",
        json={
            "username": "alice",
            "email": "Alice@Example.com",
            "password": "secret123",
            "confirm_password": "secret123",
            "email_code": "123456",
        },
    )

    assert register_response.status_code == 200
    assert register_response.json()["user"]["email"] == "alice@example.com"

    login_response = client.post(
        "/api/auth/login",
        json={"username": "alice@example.com", "password": "secret123"},
    )
    assert login_response.status_code == 200

    duplicate_code_response = client.post(
        "/api/auth/register/email-code",
        json={"email": "alice@example.com"},
    )
    assert duplicate_code_response.status_code == 409


def test_turnstile_secret_requires_token(monkeypatch):
    enable_turnstile(monkeypatch)
    client = make_test_client()

    response = client.post(
        "/api/auth/register/email-code",
        json={
            "email": "alice@example.com",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "请先完成人机验证"
    assert FakeTurnstileClient.requests == []


def test_turnstile_success_allows_email_code_send(monkeypatch):
    from app import email_verification

    enable_turnstile(monkeypatch, {"success": True, "action": "register"})
    sent_codes: list[tuple[str, str]] = []
    monkeypatch.setattr(email_verification, "generate_email_code", lambda: "123456")
    monkeypatch.setattr(email_verification, "send_email_code", lambda email, code: sent_codes.append((email, code)))
    client = make_test_client()

    response = client.post(
        "/api/auth/register/email-code",
        json={
            "email": "alice@example.com",
            "turnstile_token": "cf-token",
        },
    )

    assert response.status_code == 200
    assert response.json()["message"] == "验证码已发送"
    assert sent_codes == [("alice@example.com", "123456")]
    assert FakeTurnstileClient.requests == [
        {
            "url": TurnstileSettings.turnstile_verify_url,
            "data": {"secret": "test-secret", "response": "cf-token"},
            "timeout": TurnstileSettings.turnstile_timeout_seconds,
        },
    ]


def test_turnstile_success_allows_login(monkeypatch):
    enable_turnstile(monkeypatch, {"success": True, "action": "register"})
    client = make_test_client()

    register_response = client.post(
        "/api/auth/register",
        json={
            "username": "alice",
            "password": "secret123",
            "confirm_password": "secret123",
        },
    )
    assert register_response.status_code == 200

    FakeTurnstileClient.requests = []
    FakeTurnstileClient.response_payload = {"success": True, "action": "login"}
    login_response = client.post(
        "/api/auth/login",
        json={
            "username": "alice",
            "password": "secret123",
            "turnstile_token": "login-token",
        },
    )

    assert login_response.status_code == 200
    assert login_response.json()["access_token"]
    assert FakeTurnstileClient.requests[0]["data"] == {
        "secret": "test-secret",
        "response": "login-token",
    }


def test_turnstile_pass_exchange_returns_short_lived_token(monkeypatch):
    enable_turnstile(monkeypatch, {"success": True, "action": "login"})
    client = make_test_client()

    response = client.post(
        "/api/auth/turnstile-pass",
        json={
            "turnstile_token": "login-token",
            "action": "login",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["turnstile_pass_token"]
    assert body["expires_at"]
    assert 1 <= body["expires_in_seconds"] <= 300
    assert FakeTurnstileClient.requests == [
        {
            "url": TurnstileSettings.turnstile_verify_url,
            "data": {"secret": "test-secret", "response": "login-token"},
            "timeout": TurnstileSettings.turnstile_timeout_seconds,
        },
    ]


def test_login_turnstile_pass_can_cover_login_and_register_email_code(monkeypatch):
    from app import email_verification

    enable_turnstile(monkeypatch, {"success": True, "action": "login"})
    sent_codes: list[tuple[str, str]] = []
    monkeypatch.setattr(email_verification, "generate_email_code", lambda: "123456")
    monkeypatch.setattr(email_verification, "send_email_code", lambda email, code: sent_codes.append((email, code)))
    client = make_test_client()

    register_response = client.post(
        "/api/auth/register",
        json={
            "username": "alice",
            "password": "secret123",
            "confirm_password": "secret123",
        },
    )
    assert register_response.status_code == 200

    pass_response = client.post(
        "/api/auth/turnstile-pass",
        json={
            "turnstile_token": "login-token",
            "action": "login",
        },
    )
    assert pass_response.status_code == 200
    turnstile_pass_token = pass_response.json()["turnstile_pass_token"]

    FakeTurnstileClient.requests = []
    code_response = client.post(
        "/api/auth/register/email-code",
        json={
            "email": "bob@example.com",
            "turnstile_pass_token": turnstile_pass_token,
        },
    )
    login_response = client.post(
        "/api/auth/login",
        json={
            "username": "alice",
            "password": "secret123",
            "turnstile_pass_token": turnstile_pass_token,
        },
    )

    assert code_response.status_code == 200
    assert login_response.status_code == 200
    assert sent_codes == [("bob@example.com", "123456")]
    assert FakeTurnstileClient.requests == []


def test_register_turnstile_pass_can_cover_login(monkeypatch):
    enable_turnstile(monkeypatch, {"success": True, "action": "register"})
    client = make_test_client()

    register_response = client.post(
        "/api/auth/register",
        json={
            "username": "alice",
            "password": "secret123",
            "confirm_password": "secret123",
        },
    )
    assert register_response.status_code == 200

    pass_response = client.post(
        "/api/auth/turnstile-pass",
        json={
            "turnstile_token": "register-token",
            "action": "register",
        },
    )
    assert pass_response.status_code == 200
    turnstile_pass_token = pass_response.json()["turnstile_pass_token"]

    FakeTurnstileClient.requests = []
    login_response = client.post(
        "/api/auth/login",
        json={
            "username": "alice",
            "password": "secret123",
            "turnstile_pass_token": turnstile_pass_token,
        },
    )

    assert login_response.status_code == 200
    assert FakeTurnstileClient.requests == []


def test_turnstile_pass_rejects_expired_invalid_and_wrong_type_tokens(monkeypatch):
    from app.security import utc_now

    enable_turnstile(monkeypatch)
    client = make_test_client()
    expired_token = make_invalid_turnstile_pass({
        "sub": "turnstile",
        "scope": "auth",
        "exp": utc_now() - timedelta(minutes=1),
        "type": "turnstile_pass",
    })
    wrong_type_token = make_invalid_turnstile_pass({
        "sub": "turnstile",
        "scope": "auth",
        "exp": utc_now() + timedelta(minutes=5),
        "type": "access",
    })

    for token in ["not-a-jwt", expired_token, wrong_type_token]:
        response = client.post(
            "/api/auth/login",
            json={
                "username": "alice",
                "password": "secret123",
                "turnstile_token": "login-token",
                "turnstile_pass_token": token,
            },
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "人机验证已过期，请重新验证"

    assert FakeTurnstileClient.requests == []


def test_turnstile_rejects_failed_response(monkeypatch):
    enable_turnstile(monkeypatch, {"success": False, "action": "register"})
    client = make_test_client()

    response = client.post(
        "/api/auth/register/email-code",
        json={
            "email": "alice@example.com",
            "turnstile_token": "bad-token",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "人机验证失败，请重新验证"


def test_turnstile_rejects_action_mismatch(monkeypatch):
    enable_turnstile(monkeypatch, {"success": True, "action": "login"})
    client = make_test_client()

    response = client.post(
        "/api/auth/register/email-code",
        json={
            "email": "alice@example.com",
            "turnstile_token": "cf-token",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "人机验证场景不匹配，请重新验证"


def test_turnstile_service_error_fails_closed(monkeypatch):
    enable_turnstile(monkeypatch, error=httpx.ConnectError("turnstile unavailable"))
    client = make_test_client()

    response = client.post(
        "/api/auth/register/email-code",
        json={
            "email": "alice@example.com",
            "turnstile_token": "cf-token",
        },
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "人机验证服务暂不可用"
