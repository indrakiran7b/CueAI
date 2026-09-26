from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from app.core.redis import check_redis, dispose_redis, init_redis, ping_redis
from app.main import create_app

pytestmark = pytest.mark.redis


def test_redis_ping(redis_settings) -> None:
    async def run() -> None:
        await init_redis(redis_settings.redis_url)
        assert await ping_redis() is True
        await dispose_redis()

    asyncio.run(run())


def test_redis_closed_after_dispose(redis_settings) -> None:
    async def run() -> None:
        await init_redis(redis_settings.redis_url)
        assert await check_redis() is True
        await dispose_redis()
        assert await check_redis() is False

    asyncio.run(run())


def test_health_reports_redis_ok(redis_settings) -> None:
    with TestClient(create_app(redis_settings)) as client:
        response = client.get("/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["redis"] == "ok"
