from __future__ import annotations

import pytest

from app.core.celery import TASK_QUEUES, celery_app, create_celery_app
from app.tasks.health import health_check_task
import app.tasks.vision  # noqa: F401 — register cueai.analyze_screen


def test_celery_app_imports() -> None:
    assert celery_app.main == "cueai"


def test_health_task_registered() -> None:
    assert "cueai.health_check" in celery_app.tasks


def test_vision_task_registered() -> None:
    assert "cueai.analyze_screen" in celery_app.tasks


def test_vision_task_routes_to_ai_vision() -> None:
    routes = celery_app.conf.task_routes or {}
    assert routes.get("cueai.analyze_screen") == {"queue": "ai.vision"}


def test_future_queue_names_defined() -> None:
    assert "maintenance" in TASK_QUEUES
    assert "licensing" in TASK_QUEUES


def test_health_task_routes_to_maintenance() -> None:
    routes = celery_app.conf.task_routes or {}
    assert routes.get("cueai.health_check") == {"queue": "maintenance"}


def test_health_task_eager_execution() -> None:
    celery_app.conf.task_always_eager = True
    celery_app.conf.task_eager_propagates = True
    try:
        result = health_check_task.delay()
        assert result.get() == {"status": "ok"}
    finally:
        celery_app.conf.task_always_eager = False
        celery_app.conf.task_eager_propagates = False


def test_create_celery_app_uses_redis_urls(test_settings, monkeypatch) -> None:
    monkeypatch.setenv("REDIS_URL", test_settings.redis_url)
    monkeypatch.setenv("CORS_ORIGINS", ",".join(test_settings.cors_origins))
    app = create_celery_app()
    assert app.conf.broker_url == test_settings.redis_url
    assert app.conf.result_backend == test_settings.redis_url
