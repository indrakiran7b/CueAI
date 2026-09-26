from __future__ import annotations

import pytest
from celery.contrib.testing.worker import start_worker

from app.core.celery import celery_app
from app.tasks.health import health_check_fail_task, health_check_task

pytestmark = pytest.mark.celery


@pytest.fixture
def celery_worker(redis_settings):
    celery_app.conf.task_always_eager = False
    celery_app.conf.task_eager_propagates = False
    with start_worker(
        celery_app,
        perform_ping_check=False,
        concurrency=1,
        pool="solo",
    ):
        yield
    celery_app.conf.task_always_eager = False


def test_enqueue_health_task_with_worker(celery_worker) -> None:
    result = health_check_task.delay()
    assert result.get(timeout=15) == {"status": "ok"}


def test_task_failure_propagates(celery_worker) -> None:
    result = health_check_fail_task.delay()
    with pytest.raises(RuntimeError, match="expected test failure"):
        result.get(timeout=15, propagate=True)
