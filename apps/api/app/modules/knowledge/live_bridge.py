"""Boundary: live session output → future knowledge ingestion.

Live answer/transcript processing stays in the existing Next.js live routes.
This module only names the handoff so RAG can subscribe later without mixing
live inference code into knowledge storage.
"""

from __future__ import annotations

from typing import Any


def extract_candidates_from_live_session(payload: dict[str, Any]) -> list[dict[str, str]]:
    """Return empty until a product rule defines what live content may be stored."""
    _ = payload
    return []
