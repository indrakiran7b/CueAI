"""Knowledge pipeline + rag.py unit tests."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
API_ROOT = ROOT / "apps" / "api"
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.modules.knowledge import pipeline, rag  # noqa: E402


def test_ingest_manual_upload_returns_accepted() -> None:
    result = pipeline.ingest_manual_upload(title="Handbook", content="18 leave days")
    assert result["status"] == "accepted"
    assert result["title"] == "Handbook"


def test_chunk_document_empty() -> None:
    assert pipeline.chunk_document("") == []
    assert pipeline.chunk_document("   ") == []
    assert rag.chunk_document("") == []


def test_chunk_document_splits_long_text() -> None:
    text = "\n\n".join([f"Paragraph {i} with enough words to grow." for i in range(40)])
    chunks = pipeline.chunk_document(text, size=40, overlap=5)
    assert len(chunks) >= 2
    typed = rag.chunk_document(text, size=40, overlap=5)
    assert len(typed) >= 2
    assert all(c.text for c in typed)


def test_retrieve_without_store_returns_empty() -> None:
    assert pipeline.retrieve("leave policy", workspace_id="ws_a") == []
    assert rag.retrieve("leave policy", workspace_id="ws_a") == []


def test_embed_chunks_points_to_rag_module() -> None:
    with pytest.raises(NotImplementedError):
        pipeline.embed_chunks(["hello"])


def test_rag_config_defaults() -> None:
    cfg = rag.rag_config()
    assert cfg.qdrant_collection == "cueai_knowledge" or bool(cfg.qdrant_collection)
    assert cfg.chunk_size > 0
    assert cfg.score_threshold > 0


def test_should_retrieve_knowledge_filters_smalltalk() -> None:
    assert rag.should_retrieve_knowledge("ok") is False
    assert rag.should_retrieve_knowledge("What is our authentication architecture?") is True


def test_embedding_dimension_openai_default() -> None:
    dim = rag.get_embedding_dimension()
    assert dim in (384, 768, 1536, 3072)


def test_build_context_empty() -> None:
    assert rag.build_context([]) == ""


def test_meeting_retrieve_skips_smalltalk() -> None:
    result = rag.retrieve_for_meeting(
        workspace_id="ws_a",
        query="thanks",
    )
    assert result.knowledge_used is False
    assert result.retrieval_method == "none"
