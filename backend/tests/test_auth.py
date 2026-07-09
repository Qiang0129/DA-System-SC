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
