"""Knowledge module — Python RAG service + live/pipeline boundaries."""

from . import live_bridge, pipeline
from .rag import (
    build_context,
    chunk_document,
    embed_text,
    embed_texts,
    ensure_collection,
    index_document,
    index_chunks,
    is_qdrant_configured,
    is_semantic_rag_available,
    rag_config,
    retrieve,
    retrieve_chunks,
    retrieve_for_meeting,
    retrieve_knowledge_context_for_live,
    search_vectors,
    should_retrieve_knowledge,
)

__all__ = [
    "live_bridge",
    "pipeline",
    "rag_config",
    "is_qdrant_configured",
    "is_semantic_rag_available",
    "chunk_document",
    "embed_text",
    "embed_texts",
    "ensure_collection",
    "index_document",
    "index_chunks",
    "search_vectors",
    "retrieve",
    "retrieve_chunks",
    "retrieve_for_meeting",
    "retrieve_knowledge_context_for_live",
    "build_context",
    "should_retrieve_knowledge",
]
