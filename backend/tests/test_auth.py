import httpx
from fastapi.testclient import TestClient

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


def test_register_login_me_and_logout_flow():
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
    register_body = register_response.json()
    assert register_body["user"]["username"] == "alice"
    assert register_body["user"]["role"] == "user"
    assert register_body["access_token"]
    assert register_body["refresh_token"]

    duplicate_response = client.post(
        "/api/auth/register",
        json={
            "username": "alice",
            "password": "secret123",
            "confirm_password": "secret123",
        },
    )
    assert duplicate_response.status_code == 409

    bad_login_response = client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "wrong-password"},
    )
    assert bad_login_response.status_code == 401

    login_response = client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "secret123"},
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


def test_turnstile_secret_requires_token(monkeypatch):
    enable_turnstile(monkeypatch)
    client = make_test_client()

    response = client.post(
        "/api/auth/register",
        json={
            "username": "alice",
            "password": "secret123",
            "confirm_password": "secret123",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "请先完成人机验证"
    assert FakeTurnstileClient.requests == []


def test_turnstile_success_allows_register(monkeypatch):
    enable_turnstile(monkeypatch, {"success": True, "action": "register"})
    client = make_test_client()

    response = client.post(
        "/api/auth/register",
        json={
            "username": "alice",
            "password": "secret123",
            "confirm_password": "secret123",
            "turnstile_token": "cf-token",
        },
    )

    assert response.status_code == 200
    assert response.json()["user"]["username"] == "alice"
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
            "turnstile_token": "register-token",
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


def test_turnstile_rejects_failed_response(monkeypatch):
    enable_turnstile(monkeypatch, {"success": False, "action": "register"})
    client = make_test_client()

    response = client.post(
        "/api/auth/register",
        json={
            "username": "alice",
            "password": "secret123",
            "confirm_password": "secret123",
            "turnstile_token": "bad-token",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "人机验证失败，请重新验证"


def test_turnstile_rejects_action_mismatch(monkeypatch):
    enable_turnstile(monkeypatch, {"success": True, "action": "login"})
    client = make_test_client()

    response = client.post(
        "/api/auth/register",
        json={
            "username": "alice",
            "password": "secret123",
            "confirm_password": "secret123",
            "turnstile_token": "cf-token",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "人机验证场景不匹配，请重新验证"


def test_turnstile_service_error_fails_closed(monkeypatch):
    enable_turnstile(monkeypatch, error=httpx.ConnectError("turnstile unavailable"))
    client = make_test_client()

    response = client.post(
        "/api/auth/register",
        json={
            "username": "alice",
            "password": "secret123",
            "confirm_password": "secret123",
            "turnstile_token": "cf-token",
        },
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "人机验证服务暂不可用"
