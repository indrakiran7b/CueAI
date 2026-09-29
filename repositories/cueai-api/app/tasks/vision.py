from __future__ import annotations

import logging

from app.core.celery import celery_app
from app.core.config import get_settings
from app.core.jobs import get_job_sync, update_job_sync
from app.modules.live.context import record_usage
from app.modules.live.screen_vision import analyze_screen_with_gemini

logger = logging.getLogger("cueai.tasks.vision")


@celery_app.task(name="cueai.analyze_screen", bind=True)
def analyze_screen_task(
    self,
    job_id: str,
    image_data_url: str,
    prompt: str,
    recent_context: str,
) -> dict:
    settings = get_settings()
    redis_url = settings.redis_url
    update_job_sync(redis_url, job_id, "running")

    try:
        result = analyze_screen_with_gemini(image_data_url, prompt, recent_context)
        update_job_sync(redis_url, job_id, "completed", result=result)

        job = get_job_sync(redis_url, job_id) or {}
        meta = job.get("meta") if isinstance(job.get("meta"), dict) else {}
        session = meta.get("session") if isinstance(meta.get("session"), dict) else None
        if session and session.get("userId"):
            total = max(
                1,
                int(result.get("inputTokens") or 0) + int(result.get("outputTokens") or 0),
            )
            record_usage(
                session,
                provider=str(result.get("provider") or "gemini"),
                model=str(result.get("model") or ""),
                total=total,
                feature="screen_context",
            )
        return result
    except Exception as exc:
        logger.exception("screen_analysis_failed job_id=%s", job_id)
        message = "Screen analysis failed"
        if isinstance(exc, RuntimeError) and str(exc).strip():
            message = str(exc).strip()
        update_job_sync(redis_url, job_id, "failed", error=message)
        raise
