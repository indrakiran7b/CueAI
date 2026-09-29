from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.session import SESSION_COOKIE, sign_session, verify_session
from app.main import create_app
from app.modules.entitlements.service import (
    FREE_MEETING_QA_LIMIT,
    can_view_full_meeting_qa,
    resolve_plan,
)
from app.persistence.store import read_store, store_path, update_store


async def _noop_async(*_args, **_kwargs):
    return None


async def _redis_ok():
    return True


@pytest.fixture
def api_client(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    monkeypatch.setenv("CUEAI_DATA_DIR", str(data_dir))
    monkeypatch.setenv("AUTH_SECRET", "test-secret")
    monkeypatch.setenv("NEXT_PUBLIC_AUTH_BYPASS", "false")
    monkeypatch.setenv("NEXT_PUBLIC_SKIP_AUTH", "false")
    monkeypatch.setattr("app.main.init_redis", _noop_async)
    monkeypatch.setattr("app.main.dispose_redis", _noop_async)
    monkeypatch.setattr("app.main.check_redis", _redis_ok)
    # Reset store module cache
    import app.persistence.store as store_mod

    store_mod._memory = None
    store_mod._loaded_mtime = 0.0

    settings = Settings(
        cueai_env="test",
        api_host="127.0.0.1",
        api_port=8000,
        cors_origins=["http://localhost:3000"],
        redis_url=os.environ["REDIS_URL"],
        database_url=None,
    )
    return TestClient(create_app(settings))


def test_session_sign_verify_roundtrip() -> None:
    os.environ["AUTH_SECRET"] = "test-secret"
    token = sign_session(
        {
            "userId": "usr_test",
            "email": "a@b.com",
            "name": "A",
            "role": "User",
            "workspaceId": "ws_default",
            "workspace": "CueAI Workspace",
        },
    )
    payload = verify_session(token)
    assert payload is not None
    assert payload["userId"] == "usr_test"


def test_me_unauthenticated(api_client: TestClient) -> None:
    res = api_client.get("/v1/auth/me")
    assert res.status_code == 401
    assert res.json()["authenticated"] is False


def test_login_service_direct(tmp_path, monkeypatch) -> None:
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    monkeypatch.setenv("CUEAI_DATA_DIR", str(data_dir))
    monkeypatch.setenv("AUTH_SECRET", "test-secret")
    import app.persistence.store as store_mod

    store_mod._memory = None
    store_mod._loaded_mtime = 0.0
    from app.modules.auth import service

    body, token = service.login("admin@cueai.local", "admin123")
    assert body["user"]["email"] == "admin@cueai.local"
    assert token


def test_login_invalid_credentials(api_client: TestClient) -> None:
    res = api_client.post(
        "/v1/auth/login",
        json={"email": "admin@cueai.local", "password": "wrong"},
    )
    assert res.status_code == 401


def test_login_success_sets_cookie(api_client: TestClient) -> None:
    res = api_client.post(
        "/v1/auth/login",
        json={"email": "admin@cueai.local", "password": "admin123"},
    )
    assert res.status_code == 200
    assert SESSION_COOKIE in res.cookies
    body = res.json()
    assert body["user"]["email"] == "admin@cueai.local"


def test_me_authenticated(api_client: TestClient) -> None:
    login = api_client.post(
        "/v1/auth/login",
        json={"email": "admin@cueai.local", "password": "admin123"},
    )
    cookie = login.cookies.get(SESSION_COOKIE)
    res = api_client.get("/v1/auth/me", cookies={SESSION_COOKIE: cookie})
    assert res.status_code == 200
    assert res.json()["authenticated"] is True


def test_workspaces_requires_auth(api_client: TestClient) -> None:
    assert api_client.get("/v1/workspaces").status_code == 401


def test_workspaces_list(api_client: TestClient) -> None:
    login = api_client.post(
        "/v1/auth/login",
        json={"email": "admin@cueai.local", "password": "admin123"},
    )
    cookie = login.cookies.get(SESSION_COOKIE)
    res = api_client.get("/v1/workspaces", cookies={SESSION_COOKIE: cookie})
    assert res.status_code == 200
    assert res.json()["workspaces"][0]["current"] is True


def test_entitlements_free_user(api_client: TestClient) -> None:
    login = api_client.post(
        "/v1/auth/login",
        json={"email": "admin@cueai.local", "password": "admin123"},
    )
    cookie = login.cookies.get(SESSION_COOKIE)
    res = api_client.get("/v1/entitlements/me", cookies={SESSION_COOKIE: cookie})
    data = res.json()
    assert data["freeMeetingQaLimit"] == FREE_MEETING_QA_LIMIT
    assert data["canViewFullMeetingQa"] is True  # Admin


def test_entitlements_premium_rules() -> None:
    from app.modules.entitlements.service import can_view_full_transcript

    assert resolve_plan("premium") == "premium"
    assert can_view_full_meeting_qa(role="User", plan="free") is False
    assert can_view_full_meeting_qa(role="User", plan="premium") is True
    assert can_view_full_transcript(role="User", plan="free") is False
    assert can_view_full_transcript(role="Admin", plan="free") is True


def _client(tmp_path, monkeypatch, **env_flags) -> TestClient:
    data_dir = tmp_path / "data"
    data_dir.mkdir(exist_ok=True)
    monkeypatch.setenv("CUEAI_DATA_DIR", str(data_dir))
    monkeypatch.setenv("AUTH_SECRET", "test-secret")
    monkeypatch.setattr("app.main.init_redis", _noop_async)
    monkeypatch.setattr("app.main.dispose_redis", _noop_async)
    monkeypatch.setattr("app.main.check_redis", _redis_ok)
    for key, value in env_flags.items():
        monkeypatch.setenv(key, value)
    import app.persistence.store as store_mod

    store_mod._memory = None
    store_mod._loaded_mtime = 0.0
    settings = Settings(
        cueai_env="test",
        api_host="127.0.0.1",
        api_port=8000,
        cors_origins=["http://localhost:3000"],
        redis_url=os.environ["REDIS_URL"],
        database_url=None,
    )
    return TestClient(create_app(settings))


def test_credentials_bypass_login(tmp_path, monkeypatch) -> None:
    client = _client(
        tmp_path,
        monkeypatch,
        NEXT_PUBLIC_AUTH_BYPASS="true",
        NEXT_PUBLIC_SKIP_AUTH="false",
    )
    res = client.post("/v1/auth/login", json={})
    assert res.status_code == 200
    assert res.json()["user"]["email"]


def test_auth_bypass_me(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("NEXT_PUBLIC_SKIP_AUTH", "true")
    monkeypatch.setattr("app.api.deps.auth_bypass", lambda: True)
    client = _client(tmp_path, monkeypatch)
    res = client.get("/v1/auth/me")
    assert res.status_code == 200
    assert res.json()["authenticated"] is True


def test_store_uses_configured_path(api_client: TestClient, tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("CUEAI_DATA_DIR", str(tmp_path / "data2"))
    import app.persistence.store as store_mod

    store_mod._memory = None
    read_store()
    assert store_path().parent == tmp_path / "data2"
