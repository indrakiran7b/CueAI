from __future__ import annotations

import asyncio
import os

import pytest

from app.core.config import Settings

# Ensure `app.main` can import before a local `.env` exists (pytest loads conftest first).
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")
os.environ.setdefault("AUTH_SECRET", "test-auth-secret")
os.environ.setdefault(
    "REDIS_URL",
    os.environ.get("CUEAI_TEST_REDIS_URL", "redis://127.0.0.1:6379/0"),
)


async def _noop_async(*_args, **_kwargs):
    return None


async def _redis_ok():
    return True


@pytest.fixture(autouse=True)
def _stub_redis_lifecycle(request, monkeypatch):
    """Avoid blocked Redis connections in unit tests. Real Redis/Celery tests opt out."""
    if request.node.get_closest_marker("redis") or request.node.get_closest_marker("celery"):
        return
    monkeypatch.setattr("app.core.redis.init_redis", _noop_async)
    monkeypatch.setattr("app.core.redis.dispose_redis", _noop_async)
    monkeypatch.setattr("app.core.redis.check_redis", _redis_ok)
    monkeypatch.setattr("app.main.init_redis", _noop_async)
    monkeypatch.setattr("app.main.dispose_redis", _noop_async)
    monkeypatch.setattr("app.main.check_redis", _redis_ok)


@pytest.fixture
def test_settings() -> Settings:
    return Settings(
        cueai_env="test",
        api_host="127.0.0.1",
        api_port=8000,
        cors_origins=["http://localhost:3000"],
        redis_url=os.environ["REDIS_URL"],
        database_url=None,
    )


def _redis_reachable(redis_url: str) -> bool:
    from app.core.redis import check_redis, dispose_redis, init_redis

    async def probe() -> bool:
        try:
            await init_redis(redis_url)
            return await check_redis()
        except Exception:
            return False
        finally:
            await dispose_redis()

    return asyncio.run(probe())


@pytest.fixture
def redis_settings(test_settings: Settings) -> Settings:
    url = os.environ.get("CUEAI_TEST_REDIS_URL") or test_settings.redis_url
    settings = test_settings if url == test_settings.redis_url else Settings(
        cueai_env=test_settings.cueai_env,
        api_host=test_settings.api_host,
        api_port=test_settings.api_port,
        cors_origins=test_settings.cors_origins,
        redis_url=url,
        database_url=test_settings.database_url,
    )
    if not _redis_reachable(settings.redis_url):
        pytest.skip(
            "Redis is not available — start with: docker compose up redis -d",
        )
    return settings


def _postgres_reachable(database_url: str) -> bool:
    from app.db.session import check_database, dispose_db, init_db

    async def probe() -> bool:
        try:
            await init_db(database_url)
            return await check_database()
        except Exception:
            return False
        finally:
            await dispose_db()

    return asyncio.run(probe())


@pytest.fixture
def postgres_settings(test_settings: Settings) -> Settings:
    url = os.environ.get("CUEAI_TEST_DATABASE_URL", "").strip()
    if not url:
        pytest.skip(
            "PostgreSQL integration tests require DATABASE_URL or CUEAI_TEST_DATABASE_URL",
        )
    settings = Settings(
        cueai_env=test_settings.cueai_env,
        api_host=test_settings.api_host,
        api_port=test_settings.api_port,
        cors_origins=test_settings.cors_origins,
        redis_url=test_settings.redis_url,
        database_url=url,
    )
    if not _postgres_reachable(settings.database_url):
        pytest.skip(
            "PostgreSQL is not available — start with: docker compose up postgres -d",
        )
    return settings
