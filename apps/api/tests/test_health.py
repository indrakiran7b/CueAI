from fastapi.testclient import TestClient

from app.main import create_app


def test_health_returns_ok_when_redis_is_healthy(
    test_settings,
    monkeypatch,
) -> None:
    async def redis_ok() -> bool:
        return True

    monkeypatch.setattr("app.main.check_redis", redis_ok)
    client = TestClient(create_app(test_settings))
    response = client.get("/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "redis": "ok"}


def test_health_degraded_when_redis_is_unavailable(
    test_settings,
    monkeypatch,
) -> None:
    async def redis_down() -> bool:
        return False

    monkeypatch.setattr("app.main.check_redis", redis_down)
    client = TestClient(create_app(test_settings))
    response = client.get("/v1/health")
    assert response.status_code == 503
    assert response.json() == {
        "status": "degraded",
        "redis": "unavailable",
    }


def test_health_includes_database_when_configured(
    test_settings,
    monkeypatch,
) -> None:
    from app.core.config import Settings

    settings = test_settings
    if not settings.database_url:
        settings = Settings(
            cueai_env=test_settings.cueai_env,
            api_host=test_settings.api_host,
            api_port=test_settings.api_port,
            cors_origins=test_settings.cors_origins,
            redis_url=test_settings.redis_url,
            database_url="postgresql+asyncpg://cueai:cueai@127.0.0.1:5432/cueai",
        )

    async def redis_ok() -> bool:
        return True

    async def db_ok() -> bool:
        return True

    monkeypatch.setattr("app.main.check_redis", redis_ok)
    monkeypatch.setattr("app.main.check_database", db_ok)
    client = TestClient(create_app(settings))
    response = client.get("/v1/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "redis": "ok",
        "database": "ok",
    }


def test_health_degraded_when_database_unavailable_but_redis_ok(
    test_settings,
    monkeypatch,
) -> None:
    from app.core.config import Settings

    settings = Settings(
        cueai_env=test_settings.cueai_env,
        api_host=test_settings.api_host,
        api_port=test_settings.api_port,
        cors_origins=test_settings.cors_origins,
        redis_url=test_settings.redis_url,
        database_url="postgresql+asyncpg://cueai:cueai@127.0.0.1:5432/cueai",
    )

    async def redis_ok() -> bool:
        return True

    async def db_down() -> bool:
        return False

    monkeypatch.setattr("app.main.check_redis", redis_ok)
    monkeypatch.setattr("app.main.check_database", db_down)
    client = TestClient(create_app(settings))
    response = client.get("/v1/health")
    assert response.status_code == 503
    assert response.json() == {
        "status": "degraded",
        "redis": "ok",
        "database": "unavailable",
    }


def test_fastapi_starts(test_settings) -> None:
    app = create_app(test_settings)
    assert app.title == "CueAI API"
