#!/usr/bin/env python3
"""Enqueue cueai.health_check and wait for the worker result (dev/CI helper)."""

from __future__ import annotations

import sys

from app.tasks.health import enqueue_health_check_task


def main() -> int:
    async_result = enqueue_health_check_task()
    print(f"Task id: {async_result.id}")
    try:
        payload = async_result.get(timeout=30)
    except Exception as exc:
        print(f"Task failed or timed out: {exc}", file=sys.stderr)
        print(
            "Ensure Redis is running and a Celery worker is started "
            "(see apps/api/README.md).",
            file=sys.stderr,
        )
        return 1

    print(f"Result: {payload}")
    if payload != {"status": "ok"}:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
