from __future__ import annotations

import base64
import json
import sys
import time

import httpx
import pytest
from celery.contrib.testing.worker import start_worker
from fastapi.testclient import TestClient

from app.core.celery import TASK_QUEUES, celery_app
from app.main import create_app
from app.modules.live.gemini import gemini_generate_json
from app.modules.live.screen_service import ScreenAnalysisError, validate_screen_request
from app.modules.live.screen_vision import analyze_screen_with_gemini

PNG_DATA_URL = (
    "data:image/png;base64,"
    + base64.b64encode(
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
        b"\x00\x00\x05\x00\x01\r\n-\xdb\x00\x00\x00\x00IEND\xaeB`\x82"
    ).decode("ascii")
)


def test_validate_missing_image() -> None:
    with pytest.raises(ScreenAnalysisError) as exc:
        validate_screen_request({})
    assert exc.value.status == 400


def test_validate_oversized_image() -> None:
    huge = "data:image/png;base64," + ("a" * 6_000_001)
    with pytest.raises(ScreenAnalysisError) as exc:
        validate_screen_request({"image": huge})
    assert exc.value.status == 413


def test_validate_invalid_base64_payload() -> None:
    with pytest.raises(ScreenAnalysisError):
        validate_screen_request({"image": "data:image/png;base64,"})


def test_gemini_plain_text_response(monkeypatch) -> None:
    def fake_gemini(*_args, **_kwargs):
        return {"text": "plain answer", "model": "gemini-2.5-flash", "inputTokens": 1, "outputTokens": 2}

    monkeypatch.setattr("app.modules.live.screen_vision.gemini_generate_json_sync", fake_gemini)
    result = analyze_screen_with_gemini(PNG_DATA_URL, "prompt", "")
    assert result["answer"] == "plain answer"
    assert result["provider"] == "gemini"


def test_gemini_json_string_response(monkeypatch) -> None:
    def fake_gemini(*_args, **_kwargs):
        return {"text": '"red"', "model": "gemini-2.5-flash", "inputTokens": 0, "outputTokens": 0}

    monkeypatch.setattr("app.modules.live.screen_vision.gemini_generate_json_sync", fake_gemini)
    result = analyze_screen_with_gemini(PNG_DATA_URL, "", "")
    assert result["answer"] == "red"


def test_gemini_provider_error(monkeypatch) -> None:
    def fake_gemini(*_args, **_kwargs):
        raise RuntimeError("Screen analysis failed")

    monkeypatch.setattr("app.modules.live.screen_vision.gemini_generate_json_sync", fake_gemini)
    with pytest.raises(RuntimeError):
        analyze_screen_with_gemini(PNG_DATA_URL, "", "")


@pytest.mark.redis
def test_screen_post_returns_job_id(monkeypatch, redis_settings) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    class FakeAsyncResult:
        def __init__(self):
            self.id = "fake"

    def fake_delay(*_args, **_kwargs):
        return FakeAsyncResult()

    monkeypatch.setattr("app.tasks.vision.analyze_screen_task.apply_async", fake_delay)

    with TestClient(create_app(redis_settings)) as client:
        res = client.post(
            "/v1/live/screen",
            json={"image": PNG_DATA_URL, "prompt": "What is on screen?"},
        )
    assert res.status_code == 200
    body = res.json()
    assert "jobId" in body


def test_screen_missing_gemini_key(monkeypatch, redis_settings) -> None:
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("VERTEX_API_KEY", raising=False)
    with TestClient(create_app(redis_settings)) as client:
        res = client.post("/v1/live/screen", json={"image": PNG_DATA_URL})
    assert res.status_code == 503


@pytest.mark.redis
def test_job_status_not_found(redis_settings) -> None:
    with TestClient(create_app(redis_settings)) as client:
        res = client.get("/v1/jobs/does-not-exist")
    assert res.status_code == 404


@pytest.mark.celery
@pytest.mark.redis
def test_screen_end_to_end_celery_redis(monkeypatch, redis_settings) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    def fake_gemini(*_args, **_kwargs):
        return {
            "text": json.dumps({"answer": "visible text", "confidence": 0.82}),
            "model": "gemini-2.5-flash",
            "inputTokens": 10,
            "outputTokens": 5,
        }

    monkeypatch.setattr("app.modules.live.screen_vision.gemini_generate_json_sync", fake_gemini)

    celery_app.conf.task_always_eager = True
    celery_app.conf.task_eager_propagates = True
    try:
        with TestClient(create_app(redis_settings)) as client:
            res = client.post(
                "/v1/live/screen",
                json={"image": PNG_DATA_URL, "prompt": "Read screen"},
            )
            assert res.status_code == 200
            job_id = res.json()["jobId"]
            job_res = client.get(f"/v1/jobs/{job_id}")
            job = job_res.json()
    finally:
        celery_app.conf.task_always_eager = False
        celery_app.conf.task_eager_propagates = False

    assert job["status"] == "completed"
    assert job["result"]["answer"] == "visible text"


@pytest.mark.celery
@pytest.mark.redis
@pytest.mark.skipif(sys.platform.startswith("win"), reason="Separate Celery worker pickup is verified on Linux CI")
def test_screen_end_to_end_with_worker(monkeypatch, redis_settings) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    def fake_gemini(*_args, **_kwargs):
        return {
            "text": json.dumps({"answer": "worker path", "confidence": 0.5}),
            "model": "gemini-2.5-flash",
            "inputTokens": 1,
            "outputTokens": 1,
        }

    monkeypatch.setattr("app.modules.live.screen_vision.gemini_generate_json_sync", fake_gemini)

    celery_app.conf.task_always_eager = False
    with start_worker(
        celery_app,
        perform_ping_check=False,
        concurrency=1,
        pool="solo",
        queues=[*TASK_QUEUES, "celery"],
    ):
        with TestClient(create_app(redis_settings)) as client:
            res = client.post(
                "/v1/live/screen",
                json={"image": PNG_DATA_URL, "prompt": "Read screen"},
            )
            assert res.status_code == 200
            job_id = res.json()["jobId"]

            deadline = time.time() + 25
            job = None
            while time.time() < deadline:
                job_res = client.get(f"/v1/jobs/{job_id}")
                job = job_res.json()
                if job.get("status") in {"completed", "failed"}:
                    break
                time.sleep(0.25)

    assert job is not None
    assert job["status"] == "completed"
    assert job["result"]["answer"] == "worker path"


def test_gemini_generate_json_malformed(monkeypatch) -> None:
    class FakeResponse:
        status_code = 200

        def json(self):
            return {"candidates": []}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, *args, **kwargs):
            return FakeResponse()

    monkeypatch.setenv("GEMINI_API_KEY", "key")
    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)
    import asyncio

    with pytest.raises(RuntimeError, match="Screen analysis failed"):
        asyncio.run(gemini_generate_json("sys", "prompt"))
