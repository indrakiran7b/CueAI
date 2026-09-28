/**
 * Central RAG configuration (backend-only).
 */

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

function envInt(name: string, fallback: number): number {
  const n = Number(env(name));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function envFloat(name: string, fallback: number): number {
  const n = Number(env(name));
  return Number.isFinite(n) ? n : fallback;
}

export function ragConfig() {
  return {
    enabled: env("RAG_ENABLED", "true").toLowerCase() !== "false",
    embeddingProvider: env("RAG_EMBEDDING_PROVIDER", "openai"), // openai | gemini | local | none
    embeddingModel: env(
      "RAG_EMBEDDING_MODEL",
      env("RAG_EMBEDDING_PROVIDER", "openai") === "gemini"
        ? "text-embedding-004"
        : env("RAG_EMBEDDING_PROVIDER", "openai") === "local"
          ? "Xenova/all-MiniLM-L6-v2"
          : "text-embedding-3-small",
    ),
    chunkSize: envInt("RAG_CHUNK_SIZE", 700),
    chunkOverlap: envInt("RAG_CHUNK_OVERLAP", 100),
    topK: envInt("RAG_TOP_K", 5),
    maxContextChunks: envInt("RAG_MAX_CONTEXT_CHUNKS", 6),
    // Cosine similarity floor — tune per embedding model with test_knowledge.
    // MiniLM local: ~0.25–0.30; OpenAI 3-small: often ~0.30–0.45.
    scoreThreshold: envFloat("RAG_SCORE_THRESHOLD", 0.28),
    rerankerProvider: env("RAG_RERANKER_PROVIDER", "none"),
    qdrantUrl: env("QDRANT_URL"),
    qdrantApiKey: env("QDRANT_API_KEY"),
    qdrantCollection: env("QDRANT_COLLECTION", "cueai_knowledge"),
    maxUploadBytes: envInt("RAG_MAX_UPLOAD_BYTES", 10 * 1024 * 1024),
  };
}

export function isQdrantConfigured(): boolean {
  return Boolean(ragConfig().qdrantUrl);
}

/** True when Qdrant + embedding provider are both ready for semantic RAG. */
export function isSemanticRagAvailable(): boolean {
  if (!ragConfig().enabled) return false;
  if (!isQdrantConfigured()) return false;
  const provider = ragConfig().embeddingProvider;
  if (provider === "none") return false;
  if (provider === "local") return true;
  if (provider === "gemini") {
    return Boolean(
      process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim(),
    );
  }
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}
