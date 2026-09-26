from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db.session import dispose_db, get_session_factory, init_db
from app.main import create_app

pytestmark = pytest.mark.postgres


def test_health_connects_to_postgres(postgres_settings, monkeypatch) -> None:
    async def redis_ok() -> bool:
        return True

    monkeypatch.setattr("app.main.check_redis", redis_ok)
    client = TestClient(create_app(postgres_settings))
    response = client.get("/v1/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "redis": "ok",
        "database": "ok",
    }


def test_database_session_select_one(postgres_settings) -> None:
    async def run() -> None:
        await init_db(postgres_settings.database_url)
        factory = get_session_factory()
        async with factory() as session:
            result = await session.execute(text("SELECT 1"))
            assert result.scalar() == 1
        await dispose_db()

    asyncio.run(run())


def test_database_session_released_after_use(postgres_settings) -> None:
    async def run() -> None:
        await init_db(postgres_settings.database_url)
        factory = get_session_factory()
        async with factory() as session:
            await session.execute(text("SELECT 1"))
        assert session.is_active is False
        await dispose_db()

    asyncio.run(run())
