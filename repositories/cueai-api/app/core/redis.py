from __future__ import annotations

import logging

from redis.asyncio import Redis

logger = logging.getLogger("cueai.api.redis")

_client: Redis | None = None


async def init_redis(redis_url: str) -> None:
    global _client
    if _client is not None:
        return
    _client = Redis.from_url(
        redis_url,
        decode_responses=True,
        socket_connect_timeout=2,
        socket_timeout=2,
    )
    logger.info("Redis client initialized")


async def dispose_redis() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        logger.info("Redis client closed")
    _client = None


def get_redis() -> Redis:
    if _client is None:
        raise RuntimeError("Redis is not initialized")
    return _client


async def check_redis() -> bool:
    if _client is None:
        return False
    try:
        return bool(await _client.ping())
    except Exception:
        logger.warning("Redis health check failed", exc_info=True)
        return False


async def ping_redis() -> bool:
    """Connectivity check (PING). Same semantics as the health probe."""
    return await check_redis()
