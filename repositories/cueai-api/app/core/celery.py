from __future__ import annotations

from celery import Celery
from kombu import Queue

from app.core.config import get_settings

# Future module queues (no business tasks yet).
TASK_QUEUES = (
    "ai.chat",
    "ai.vision",
    "ai.resume",
    "speech",
    "translate",
    "email",
    "maintenance",
    "licensing",
)


def _worker_queue_list() -> str:
    return ",".join((*TASK_QUEUES, "celery"))


def create_celery_app() -> Celery:
    settings = get_settings()
    app = Celery("cueai")
    app.conf.update(
        broker_url=settings.redis_url,
        result_backend=settings.redis_url,
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        result_accept_content=["json"],
        timezone="UTC",
        enable_utc=True,
        task_track_started=True,
        worker_hijack_root_logger=False,
        task_queues=tuple(Queue(name) for name in TASK_QUEUES) + (Queue("celery"),),
        task_routes={
            "cueai.health_check": {"queue": "maintenance"},
            "cueai.analyze_screen": {"queue": "ai.vision"},
        },
        imports=("app.tasks.health", "app.tasks.vision"),
    )
    return app


celery_app = create_celery_app()
WORKER_QUEUES = _worker_queue_list()
