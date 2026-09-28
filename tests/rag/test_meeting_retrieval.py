"""Meeting-aware knowledge retrieval isolation tests."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTEXT = ROOT / "apps" / "api" / "app" / "modules" / "live" / "context.py"


def _load():
    spec = importlib.util.spec_from_file_location("live_context_standalone", CONTEXT)
    assert spec and spec.loader
    # Stub persistence so import does not need full app.
    class _Stub:
        @staticmethod
        def read_store():
            return {
                "workspace": {"id": "ws1"},
                "knowledge": [
                    {
                        "id": "a",
                        "workspaceId": "ws1",
                        "meetingId": "mtg_a",
                        "status": "indexed",
                        "title": "Client_A.pdf",
                        "content": "Client A requirements include REST API integration",
                    },
                    {
                        "id": "b",
                        "workspaceId": "ws1",
                        "meetingId": "mtg_b",
                        "status": "indexed",
                        "title": "Client_B.pdf",
                        "content": "Client B requirements include GraphQL",
                    },
                    {
                        "id": "w",
                        "workspaceId": "ws1",
                        "status": "indexed",
                        "title": "Product.pdf",
                        "content": "Product supports REST API integration",
                    },
                ],
                "meetings": [],
                "liveBriefing": {},
            }

        @staticmethod
        def update_store(_fn):
            return None

    sys.modules["app.persistence.store"] = type(sys)("app.persistence.store")
    sys.modules["app.persistence.store"].read_store = _Stub.read_store
    sys.modules["app.persistence.store"].update_store = _Stub.update_store
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


ctx = _load()


def test_meeting_a_does_not_retrieve_meeting_b() -> None:
    text = ctx.retrieve_knowledge(
        "What are Client B requirements?",
        workspace_id="ws1",
        meeting_id="mtg_a",
        document_ids=[],
    )
    assert "Client_B" not in text
    # May fall back to workspace or return empty — never Meeting B.
    assert "GraphQL" not in text or "MEETING KNOWLEDGE" not in text


def test_meeting_a_retrieves_own_docs() -> None:
    text = ctx.retrieve_knowledge(
        "What are the Client A requirements for REST?",
        workspace_id="ws1",
        meeting_id="mtg_a",
    )
    assert "MEETING KNOWLEDGE" in text
    assert "Client_A" in text or "REST" in text


def test_casual_phrase_skips_retrieval() -> None:
    assert ctx.retrieve_knowledge("Okay, let's move on.", meeting_id="mtg_a") == ""
