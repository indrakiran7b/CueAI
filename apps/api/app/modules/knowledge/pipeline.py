"""Knowledge / RAG pipeline boundaries.

Production RAG (upload, extract, chunk, embed, Qdrant, grounded query) lives in the
Next.js admin knowledge API:

  apps/web/src/lib/server/rag/*
  apps/web/src/app/api/admin/knowledge/*

This FastAPI module keeps a thin protocol for future Celery workers. Do not add a
second vector store or parallel knowledge database here.
"""

from __future__ import annotations

from typing import Any, Protocol


class KnowledgeStore(Protocol):
    def list_sources(self, workspace_id: str) -> list[dict[str, Any]]: ...


def ingest_manual_upload(*, title: str, content: str) -> dict[str, str]:
    """Manual upload is accepted; persistence is owned by the Next admin API."""
    return {"source": "manual_upload", "title": title, "status": "accepted"}


def chunk_document(text: str, *, size: int = 800, overlap: int = 100) -> list[str]:
    """Simple paragraph-aware chunker for Celery/local experiments.

    Production chunking uses apps/web/src/lib/server/rag/chunker.ts
    with RAG_CHUNK_SIZE / RAG_CHUNK_OVERLAP.
    """
    text = text.strip()
    if not text:
        return []
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    buf = ""
    for para in paragraphs:
        candidate = f"{buf}\n\n{para}".strip() if buf else para
        if len(candidate.split()) <= size:
            buf = candidate
            continue
        if buf:
            chunks.append(buf)
            words = buf.split()
            keep = max(1, int(len(words) * (overlap / max(size, 1))))
            buf = " ".join(words[-keep:] + para.split())
        else:
            words = para.split()
            step = max(1, size - overlap)
            for i in range(0, len(words), step):
                piece = " ".join(words[i : i + size])
                if piece:
                    chunks.append(piece)
            buf = ""
    if buf:
        chunks.append(buf)
    return chunks


def embed_chunks(chunks: list[str]) -> None:
    """Embeddings run in the Next.js EmbeddingService (OpenAI/Gemini)."""
    raise NotImplementedError(
        "Use the Next.js Knowledge Base RAG pipeline for embeddings and Qdrant indexing."
    )


def retrieve(query: str, *, workspace_id: str) -> list[dict[str, str]]:
    """Retrieval is implemented in Next.js rag-service (workspace-filtered)."""
    _ = (query, workspace_id)
    return []
