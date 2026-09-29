from __future__ import annotations

from app.core.celery import celery_app


@celery_app.task(name="cueai.health_check", bind=True)
def health_check_task(self) -> dict[str, str]:
    """No-op connectivity task for worker/broker verification."""
    return {"status": "ok"}


@celery_app.task(name="cueai.health_check_fail")
def health_check_fail_task() -> None:
    """Infrastructure-only task used to verify worker failures are not swallowed."""
    raise RuntimeError("expected test failure")


def enqueue_health_check_task():
    """Enqueue the health task (for tests and dev verification)."""
    return health_check_task.delay()
