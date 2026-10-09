from fastapi.testclient import TestClient

from app.core.session import SESSION_COOKIE, sign_session
from app.main import create_app


def _client(redis_settings):
    return TestClient(create_app(redis_settings))


def test_live_answer_requires_session(redis_settings) -> None:
    with _client(redis_settings) as client:
        res = client.post("/v1/live/answer", json={"prompt": "hello"})
    assert res.status_code == 401


def test_live_screen_requires_session(redis_settings) -> None:
    with _client(redis_settings) as client:
        res = client.post("/v1/live/screen", json={"image": "data:image/png;base64,xx"})
    assert res.status_code == 401


def test_jobs_require_session(redis_settings) -> None:
    with _client(redis_settings) as client:
        res = client.get("/v1/jobs/not-a-real-job")
    assert res.status_code == 401


def test_live_answer_valid_session_reaches_handler(redis_settings) -> None:
    token = sign_session(
        {
            "userId": "usr_test",
            "email": "test@cueai.local",
            "name": "Test",
            "role": "User",
            "workspaceId": "ws_default",
            "workspace": "Test",
        }
    )
    with _client(redis_settings) as client:
        res = client.post(
            "/v1/live/answer",
            json={"prompt": "hello"},
            cookies={SESSION_COOKIE: token},
        )
    # Auth passed. Provider execution may be skipped when no LLM key is configured.
    assert res.status_code != 401
