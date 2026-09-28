"""Knowledge pipeline unit tests — import module directly (no app.core.redis)."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

PIPELINE = Path(__file__).resolve().parents[1] / "app" / "modules" / "knowledge" / "pipeline.py"


def _load_pipeline():
    spec = importlib.util.spec_from_file_location("knowledge_pipeline_standalone", PIPELINE)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


pipeline = _load_pipeline()


def test_ingest_manual_upload_returns_accepted() -> None:
    result = pipeline.ingest_manual_upload(title="Handbook", content="18 leave days")
    assert result["status"] == "accepted"
    assert result["title"] == "Handbook"


def test_chunk_document_empty() -> None:
    assert pipeline.chunk_document("") == []
    assert pipeline.chunk_document("   ") == []


def test_chunk_document_splits_long_text() -> None:
    text = "\n\n".join([f"Paragraph {i} with enough words to grow." for i in range(40)])
    chunks = pipeline.chunk_document(text, size=40, overlap=5)
    assert len(chunks) >= 2


def test_retrieve_is_noop_until_worker_wired() -> None:
    assert pipeline.retrieve("leave policy", workspace_id="ws_a") == []


def test_embed_chunks_points_to_next_pipeline() -> None:
    with pytest.raises(NotImplementedError):
        pipeline.embed_chunks(["hello"])
