"""Knowledge / RAG pipeline boundaries.

Canonical Python RAG lives in:

  app.modules.knowledge.rag

Production web upload / live answers still use the Next.js RAG pipeline:

  apps/web/src/lib/server/rag/*

This module keeps a thin protocol for Celery/manual experiments and delegates
chunking/retrieval helpers to rag.py where appropriate.
"""

from __future__ import annotations

from typing import Any, Protocol

from .rag import (
    chunk_document as rag_chunk_document,
    retrieve as rag_retrieve,
)


class KnowledgeStore(Protocol):
    def list_sources(self, workspace_id: str) -> list[dict[str, Any]]: ...


def ingest_manual_upload(*, title: str, content: str) -> dict[str, str]:
    """Manual upload is accepted; persistence is owned by the Next admin API."""
    return {"source": "manual_upload", "title": title, "status": "accepted"}


def chunk_document(text: str, *, size: int = 800, overlap: int = 100) -> list[str]:
    """Paragraph-aware chunker returning plain strings (pipeline-compatible).

    Uses the production chunker in rag.py (RAG_CHUNK_SIZE / RAG_CHUNK_OVERLAP
    defaults apply when size/overlap match config; explicit args are honored).
    """
    chunks = rag_chunk_document(text, size=size, overlap=overlap)
    return [c.text for c in chunks]


def embed_chunks(chunks: list[str]) -> None:
    """Embeddings: use rag.embed_texts / index_document for production indexing."""
    raise NotImplementedError(
        "Use app.modules.knowledge.rag.embed_texts / index_document "
        "(or the Next.js Knowledge Base RAG pipeline) for embeddings and Qdrant indexing."
    )


def retrieve(query: str, *, workspace_id: str) -> list[dict[str, str]]:
    """Workspace retrieve via rag.py (keyword/semantic depending on config)."""
    return rag_retrieve(query, workspace_id=workspace_id)
