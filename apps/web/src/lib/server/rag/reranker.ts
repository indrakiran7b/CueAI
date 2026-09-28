/**
 * Optional reranker — no-op when RAG_RERANKER_PROVIDER=none.
 */

import type { RetrievedChunk } from "@/lib/server/rag/types";
import { ragConfig } from "@/lib/server/rag/config";

export async function rerankChunks(
  query: string,
  chunks: RetrievedChunk[],
  topN?: number,
): Promise<RetrievedChunk[]> {
  void query;
  const cfg = ragConfig();
  const limit = topN ?? cfg.maxContextChunks;
  if (!chunks.length) return [];
  if (cfg.rerankerProvider === "none" || !cfg.rerankerProvider) {
    return chunks.slice(0, Math.max(limit, cfg.topK));
  }
  // Provider hooks can be added later without changing call sites.
  return chunks.slice(0, Math.max(limit, cfg.topK));
}
