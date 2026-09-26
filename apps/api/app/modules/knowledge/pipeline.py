"""Knowledge / RAG pipeline boundaries.

Storage today is the existing JSON workspace store (admin knowledge items).
PostgreSQL + pgvector replaces the storage adapter in the final migration phase.
Do not add a second database here.
"""

from __future__ import annotations

from typing import Any, Protocol


class KnowledgeStore(Protocol):
    def list_sources(self, workspace_id: str) -> list[dict[str, Any]]: ...


def ingest_manual_upload(*, title: str, content: str) -> dict[str, str]:
    """Manual upload is the initial source type. Persistence stays in Next admin API."""
    return {"source": "manual_upload", "title": title, "status": "accepted"}


def chunk_document(text: str, *, size: int = 800) -> list[str]:
    text = text.strip()
    if not text:
        return []
    return [text[i : i + size] for i in range(0, len(text), size)]


def embed_chunks(chunks: list[str]) -> None:
    """Embedding is deferred until the PostgreSQL + pgvector phase."""
    raise NotImplementedError("Embeddings are not available until pgvector migration.")


def retrieve(query: str, *, workspace_id: str) -> list[dict[str, str]]:
    """Retrieval stays a no-op until a vector store exists."""
    return []
