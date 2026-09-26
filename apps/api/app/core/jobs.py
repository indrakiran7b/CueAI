"""Generic async job status in Redis (queued → running → completed | failed)."""

from __future__ import annotations

import json
import logging
from typing import Any

from redis import Redis
from redis.asyncio import Redis as AsyncRedis

from app.core.redis import get_redis

logger = logging.getLogger("cueai.api.jobs")

JOB_KEY_PREFIX = "cueai:job:"
JOB_TTL_SECONDS = 3600

VALID_STATUSES = frozenset({"queued", "running", "completed", "failed"})


def job_redis_key(job_id: str) -> str:
    return f"{JOB_KEY_PREFIX}{job_id}"


def _encode(payload: dict[str, Any]) -> str:
    return json.dumps(payload, separators=(",", ":"))


def _decode(raw: str | bytes | None) -> dict[str, Any] | None:
    if raw is None:
        return None
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("invalid job payload in redis")
        return None
    return data if isinstance(data, dict) else None


async def create_job(
    job_id: str,
    *,
    job_type: str,
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "jobId": job_id,
        "type": job_type,
        "status": "queued",
    }
    if meta:
        payload["meta"] = meta
    client = get_redis()
    await client.setex(job_redis_key(job_id), JOB_TTL_SECONDS, _encode(payload))
    return payload


async def get_job(job_id: str) -> dict[str, Any] | None:
    client = get_redis()
    return _decode(await client.get(job_redis_key(job_id)))


def sync_redis(redis_url: str) -> Redis:
    return Redis.from_url(redis_url, decode_responses=True)


def create_job_sync(
    redis_url: str,
    job_id: str,
    *,
    job_type: str,
    meta: dict[str, Any] | None = None,
) -> None:
    payload: dict[str, Any] = {
        "jobId": job_id,
        "type": job_type,
        "status": "queued",
    }
    if meta:
        payload["meta"] = meta
    sync_redis(redis_url).setex(job_redis_key(job_id), JOB_TTL_SECONDS, _encode(payload))


def update_job_sync(
    redis_url: str,
    job_id: str,
    status: str,
    *,
    result: dict[str, Any] | None = None,
    error: str | None = None,
) -> None:
    if status not in VALID_STATUSES:
        raise ValueError(f"invalid job status: {status}")
    client = sync_redis(redis_url)
    key = job_redis_key(job_id)
    existing = _decode(client.get(key)) or {"jobId": job_id}
    existing["status"] = status
    if result is not None:
        existing["result"] = result
    if error is not None:
        existing["error"] = error
    client.setex(key, JOB_TTL_SECONDS, _encode(existing))


def get_job_sync(redis_url: str, job_id: str) -> dict[str, Any] | None:
    return _decode(sync_redis(redis_url).get(job_redis_key(job_id)))
