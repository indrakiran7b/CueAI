/**
 * RAG retrieve + grounded answer generation (meeting-aware).
 */

import { readStore, type DbKnowledge } from "@/lib/server/db";
import {
  ragConfig,
  isQdrantConfigured,
  isSemanticRagAvailable,
} from "@/lib/server/rag/config";
import { embedText, embeddingAvailable } from "@/lib/server/rag/embeddings";
import { searchVectors } from "@/lib/server/rag/vector-store";
import {
  buildRagContext,
  buildRagSystemPrompt,
  buildRagUserPrompt,
} from "@/lib/server/rag/context-builder";
import { rerankChunks } from "@/lib/server/rag/reranker";
import type {
  KnowledgeQueryResult,
  RetrievedChunk,
  KnowledgeSource,
  MeetingRetrieveResult,
  KnowledgeSourceType,
  RetrievalMethod,
} from "@/lib/server/rag/types";
import { logRag } from "@/lib/server/rag/log";

function toRetrievalMethod(
  mode: "vector" | "keyword",
  knowledgeUsed: boolean,
): RetrievalMethod {
  if (!knowledgeUsed) return "none";
  return mode === "vector" ? "semantic" : "keyword";
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

/** Skip expensive RAG for casual non-questions. */
export function shouldRetrieveKnowledge(question: string): boolean {
  const q = question.trim();
  if (q.length < 12) return false;
  const lower = q.toLowerCase();
  if (
    /^(okay|ok|alright|thanks|thank you|got it|sure|yeah|yes|no|hmm|uh|um)\b/i.test(
      lower,
    )
  ) {
    return false;
  }
  if (/^(let'?s move on|moving on|next question|continue)\b/i.test(lower)) {
    return false;
  }
  if (/[?]/.test(q)) return true;
  if (
    /^(what|why|how|when|where|who|which|can you|could you|tell me|describe|explain|walk me|walk us)\b/i.test(
      lower,
    )
  ) {
    return true;
  }
  if (
    /\b(project|architecture|technolog|stack|experience|implement|integrat|requirement|client|resume|company)\b/i.test(
      lower,
    )
  ) {
    return true;
  }
  return false;
}

function docScope(doc: DbKnowledge): "meeting" | "workspace" {
  return doc.knowledgeScope || (doc.meetingId ? "meeting" : "workspace");
}

function scoreDocChunks(
  doc: DbKnowledge,
  tokens: string[],
  scored: RetrievedChunk[],
): void {
  const chunks =
    doc.chunks?.length
      ? doc.chunks
      : doc.content
        ? [{ id: `${doc.id}_full`, index: 0, text: doc.content.slice(0, 4000) }]
        : [];
  for (const chunk of chunks) {
    const hay = `${doc.title}\n${chunk.text}`.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (hay.includes(t)) score += t.length > 5 ? 2 : 1;
    }
    if (score <= 0) continue;
    scored.push({
      chunkId: chunk.id,
      documentId: doc.id,
      filename: doc.originalFilename || doc.title,
      text: chunk.text,
      score,
      page: chunk.pageNumber ?? null,
      section: chunk.sectionTitle ?? null,
      chunkIndex: chunk.index,
      knowledgeScope: docScope(doc),
      meetingId: doc.meetingId || null,
      category: doc.category ?? null,
    });
  }
}

async function keywordRetrieve(input: {
  workspaceId: string;
  query: string;
  topK: number;
  meetingId?: string | null;
  documentIds?: string[];
  knowledgeScope?: "meeting" | "workspace";
}): Promise<RetrievedChunk[]> {
  const tokens = tokenize(input.query);
  if (!tokens.length) return [];
  const store = await readStore();
  const attachSet = new Set(input.documentIds || []);

  const docs = store.knowledge.filter((d) => {
    if (d.status !== "indexed") return false;
    if (d.workspaceId && d.workspaceId !== input.workspaceId) return false;

    if (input.knowledgeScope === "meeting") {
      if (!input.meetingId) return false;
      return d.meetingId === input.meetingId;
    }
    if (input.knowledgeScope === "workspace") {
      // Workspace docs: no meetingId, optionally limited to attached ids.
      if (d.meetingId) return false;
      if (attachSet.size && !attachSet.has(d.id)) return false;
      return true;
    }

    // Unscoped legacy path: all workspace-visible docs (admin query).
    return true;
  });

  const scored: RetrievedChunk[] = [];
  for (const doc of docs) scoreDocChunks(doc, tokens, scored);
  return scored.sort((a, b) => b.score - a.score).slice(0, input.topK);
}

function mapVectorHits(
  hits: Awaited<ReturnType<typeof searchVectors>>,
  workspaceId: string,
): RetrievedChunk[] {
  return hits
    .filter((h) => h.payload?.workspace_id === workspaceId)
    .map((h) => ({
      chunkId: h.payload.chunk_id,
      documentId: h.payload.document_id,
      filename: h.payload.filename,
      text: h.payload.text,
      score: h.score,
      page: h.payload.page_number,
      section: h.payload.section_title,
      chunkIndex: h.payload.chunk_index,
      knowledgeScope: h.payload.knowledge_scope || "workspace",
      meetingId: h.payload.meeting_id ?? null,
      category: h.payload.category ?? null,
    }));
}

async function retrieveScoped(input: {
  workspaceId: string;
  query: string;
  topK: number;
  meetingId?: string | null;
  documentIds?: string[];
  knowledgeScope?: "meeting" | "workspace";
}): Promise<{ chunks: RetrievedChunk[]; mode: "vector" | "keyword"; embeddingMs: number; retrievalMs: number }> {
  const t0 = Date.now();
  let embeddingMs = 0;
  const cfg = ragConfig();
  const semanticReady = isSemanticRagAvailable() && embeddingAvailable() && isQdrantConfigured();

  if (semanticReady) {
    try {
      const te = Date.now();
      const vector = await embedText(input.query);
      embeddingMs = Date.now() - te;
      const tr = Date.now();
      const hits = await searchVectors({
        workspaceId: input.workspaceId,
        vector,
        topK: input.topK,
        scoreThreshold: cfg.scoreThreshold,
        meetingId: input.knowledgeScope === "meeting" ? input.meetingId : undefined,
        documentIds:
          input.knowledgeScope === "workspace" && input.documentIds?.length
            ? input.documentIds
            : undefined,
        knowledgeScope: input.knowledgeScope,
      });
      const retrievalMs = Date.now() - tr;
      const chunks = mapVectorHits(hits, input.workspaceId);
      // Successful semantic path — even empty results (below threshold).
      // Do not silently fall through to keyword when semantic infra works.
      return { chunks, mode: "vector", embeddingMs, retrievalMs };
    } catch (err) {
      logRag("retrieve.vector_fallback", {
        error: err instanceof Error ? err.message : "vector failed",
        scope: input.knowledgeScope || "all",
      });
      // Infrastructure failure only → keyword fallback below.
    }
  }

  const tr = Date.now();
  const chunks = await keywordRetrieve({
    workspaceId: input.workspaceId,
    query: input.query,
    topK: input.topK,
    meetingId: input.meetingId,
    documentIds: input.documentIds,
    knowledgeScope: input.knowledgeScope,
  });
  return {
    chunks,
    mode: "keyword",
    embeddingMs,
    retrievalMs: Date.now() - tr + Math.max(0, Date.now() - t0 - embeddingMs),
  };
}

/** Admin / workspace-wide retrieve (legacy). */
export async function retrieveChunks(input: {
  workspaceId: string;
  query: string;
  topK?: number;
}): Promise<{ chunks: RetrievedChunk[]; mode: "vector" | "keyword"; embeddingMs: number; retrievalMs: number }> {
  return retrieveScoped({
    workspaceId: input.workspaceId,
    query: input.query,
    topK: input.topK ?? ragConfig().topK,
  });
}

/**
 * Meeting-first retrieval for Live Session.
 * 1) Meeting knowledge (meeting_id filter)
 * 2) Workspace knowledge fallback (optional attached documentIds or all workspace docs)
 */
export async function retrieveForMeeting(input: {
  workspaceId: string;
  meetingId?: string | null;
  query: string;
  /** Workspace doc ids attached to this meeting; empty = all workspace docs. */
  documentIds?: string[];
  /** When false, skip workspace fallback. Default true. */
  includeWorkspace?: boolean;
  topK?: number;
}): Promise<MeetingRetrieveResult> {
  const cfg = ragConfig();
  const topK = input.topK ?? Math.min(cfg.topK, 8);
  const totalStart = Date.now();
  const q = input.query.trim();

  if (!q || !shouldRetrieveKnowledge(q)) {
    return {
      chunks: [],
      knowledgeUsed: false,
      sourceType: "general_ai",
      mode: "keyword",
      retrievalMethod: "none",
      embeddingMs: 0,
      retrievalMs: 0,
      totalMs: Date.now() - totalStart,
    };
  }

  let embeddingMs = 0;
  let retrievalMs = 0;
  let mode: "vector" | "keyword" = "keyword";
  let sourceType: KnowledgeSourceType = "general_ai";
  let chunks: RetrievedChunk[] = [];

  if (input.meetingId) {
    const meetingResult = await retrieveScoped({
      workspaceId: input.workspaceId,
      query: q,
      topK,
      meetingId: input.meetingId,
      knowledgeScope: "meeting",
    });
    embeddingMs += meetingResult.embeddingMs;
    retrievalMs += meetingResult.retrievalMs;
    mode = meetingResult.mode;
    if (chunksAreRelevant(meetingResult.chunks, meetingResult.mode)) {
      chunks = meetingResult.chunks;
      sourceType = "meeting_knowledge";
    }
  }

  const needFallback =
    chunks.length === 0 && input.includeWorkspace !== false;

  if (needFallback) {
    const wsResult = await retrieveScoped({
      workspaceId: input.workspaceId,
      query: q,
      topK,
      documentIds: input.documentIds,
      knowledgeScope: "workspace",
    });
    embeddingMs += wsResult.embeddingMs;
    retrievalMs += wsResult.retrievalMs;
    if (wsResult.mode === "vector") mode = "vector";
    else if (chunks.length === 0) mode = wsResult.mode;
    if (chunksAreRelevant(wsResult.chunks, wsResult.mode)) {
      chunks = wsResult.chunks;
      sourceType = "workspace_knowledge";
    }
  }

  const ranked = await rerankChunks(q, chunks, cfg.maxContextChunks);
  const knowledgeUsed = chunksAreRelevant(ranked, mode);
  const finalChunks = knowledgeUsed ? ranked : [];
  const retrievalMethod = toRetrievalMethod(mode, knowledgeUsed);

  logRag("retrieve.meeting", {
    workspaceId: input.workspaceId,
    meetingId: input.meetingId || null,
    sourceType: knowledgeUsed ? sourceType : "general_ai",
    retrievalMethod,
    chunks: finalChunks.length,
    ms: Date.now() - totalStart,
  });

  return {
    chunks: finalChunks,
    knowledgeUsed,
    sourceType: knowledgeUsed ? sourceType : "general_ai",
    mode,
    retrievalMethod,
    embeddingMs,
    retrievalMs,
    totalMs: Date.now() - totalStart,
  };
}

async function generateAnswer(
  query: string,
  context: string,
  opts?: { userId?: string | null; workspaceId?: string | null },
): Promise<{ answer: string; llmMs: number }> {
  const system = buildRagSystemPrompt();
  const user = buildRagUserPrompt(query, context);
  const t0 = Date.now();

  const { resolveCredential } = await import("@/lib/server/credential-resolver");
  const { generateWithCredential } = await import("@/lib/server/llm-generate");

  const cred = await resolveCredential({
    userId: opts?.userId,
    workspaceId: opts?.workspaceId,
    capability: "rag",
  });
  if (cred) {
    try {
      const result = await generateWithCredential(cred, {
        system,
        prompt: user,
        temperature: 0.2,
        maxOutputTokens: 900,
      });
      return { answer: (result.text || "").trim(), llmMs: Date.now() - t0 };
    } catch (err) {
      logRag("query.byok_failed", {
        provider: cred.provider,
        source: cred.source,
        error: err instanceof Error ? err.message : "llm",
      });
      // Fall through to legacy env Groq → Gemini.
    }
  }

  try {
    const { generateGroqText, resolveGroqApiKey } = await import("@/lib/server/groq");
    if (resolveGroqApiKey()) {
      const result = await generateGroqText({
        system,
        prompt: user,
        temperature: 0.2,
        maxOutputTokens: 900,
      });
      return { answer: (result.text || "").trim(), llmMs: Date.now() - t0 };
    }
  } catch {
    // fall through to Gemini
  }

  const { resolveGeminiCredentials, generateGeminiText } = await import(
    "@/lib/server/gemini"
  );
  const credentials = await resolveGeminiCredentials();
  if (!credentials) {
    throw new Error("No LLM provider configured for Knowledge answers.");
  }
  const result = await generateGeminiText({
    credentials,
    prompt: user,
    system,
    temperature: 0.2,
  });
  return { answer: (result.text || "").trim(), llmMs: Date.now() - t0 };
}

async function generateGeneralAnswer(
  query: string,
  opts?: { userId?: string | null; workspaceId?: string | null },
): Promise<{ answer: string; llmMs: number }> {
  const system = `You are CueAI. Answer the user's question helpfully and accurately.
You do NOT have access to the user's uploaded Knowledge Base for this question.
Do not invent citations or claim that an answer came from uploaded documents.
Be concise and clear.`;
  const user = `USER QUESTION:\n${query.trim()}\n\nAnswer directly. Do not invent document sources.`;
  const t0 = Date.now();

  const { resolveCredential } = await import("@/lib/server/credential-resolver");
  const { generateWithCredential } = await import("@/lib/server/llm-generate");

  const cred = await resolveCredential({
    userId: opts?.userId,
    workspaceId: opts?.workspaceId,
    capability: "general_ai",
  });
  if (cred) {
    try {
      const result = await generateWithCredential(cred, {
        system,
        prompt: user,
        temperature: 0.35,
        maxOutputTokens: 700,
      });
      return { answer: (result.text || "").trim(), llmMs: Date.now() - t0 };
    } catch (err) {
      logRag("query.general_byok_failed", {
        provider: cred.provider,
        source: cred.source,
        error: err instanceof Error ? err.message : "llm",
      });
    }
  }

  try {
    const { generateGroqText, resolveGroqApiKey } = await import("@/lib/server/groq");
    if (resolveGroqApiKey()) {
      const result = await generateGroqText({
        system,
        prompt: user,
        temperature: 0.35,
        maxOutputTokens: 700,
      });
      return { answer: (result.text || "").trim(), llmMs: Date.now() - t0 };
    }
  } catch {
    // fall through
  }

  const { resolveGeminiCredentials, generateGeminiText } = await import(
    "@/lib/server/gemini"
  );
  const credentials = await resolveGeminiCredentials();
  if (!credentials) {
    throw new Error("No LLM provider configured.");
  }
  const result = await generateGeminiText({
    credentials,
    prompt: user,
    system,
    temperature: 0.35,
  });
  return { answer: (result.text || "").trim(), llmMs: Date.now() - t0 };
}

function chunksAreRelevant(
  chunks: RetrievedChunk[],
  mode: "vector" | "keyword",
): boolean {
  if (!chunks.length) return false;
  const cfg = ragConfig();
  if (mode === "vector") {
    return chunks.some((c) => c.score >= cfg.scoreThreshold);
  }
  // Keyword scores are token-hit counts; require a meaningful match.
  return chunks.some((c) => c.score >= 3);
}

/**
 * Admin / diagnostics Knowledge query.
 * Document-first: use RAG when relevant chunks exist; otherwise general AI fallback.
 */
export async function queryKnowledge(input: {
  workspaceId: string;
  query: string;
  topK?: number;
  /** When false, do not call general AI if KB misses. Default true. */
  allowGeneralFallback?: boolean;
  /** Authenticated user — used for BYOK credential resolution. */
  userId?: string | null;
}): Promise<KnowledgeQueryResult> {
  const totalStart = Date.now();
  const q = input.query.trim();
  if (!q) {
    return {
      answer: "Please enter a question.",
      knowledgeUsed: false,
      sourceType: "general_ai",
      sources: [],
      retrievalMethod: "none",
    };
  }

  const { chunks, mode, embeddingMs, retrievalMs } = await retrieveChunks({
    workspaceId: input.workspaceId,
    query: q,
    topK: input.topK,
  });

  const ranked = await rerankChunks(q, chunks);
  const relevant = chunksAreRelevant(ranked, mode);
  const retrievalMethod = toRetrievalMethod(mode, relevant);

  if (!relevant) {
    if (input.allowGeneralFallback === false) {
      return {
        answer: "No relevant information was found in the Knowledge Base.",
        knowledgeUsed: false,
        sourceType: "general_ai",
        sources: [],
        retrievalMethod: "none",
        diagnostics: {
          chunksRetrieved: 0,
          retrievalMs,
          embeddingMs,
          llmMs: 0,
          totalMs: Date.now() - totalStart,
          mode,
          retrievalMethod: "none",
        },
      };
    }

    let answer: string;
    let llmMs = 0;
    try {
      const gen = await generateGeneralAnswer(q, {
        userId: input.userId,
        workspaceId: input.workspaceId,
      });
      answer = gen.answer;
      llmMs = gen.llmMs;
    } catch (err) {
      logRag("query.general_llm_failed", {
        error: err instanceof Error ? err.message : "llm",
      });
      answer =
        "No relevant information was found in the Knowledge Base, and the language model is temporarily unavailable.";
    }

    logRag("query.general_fallback", {
      workspaceId: input.workspaceId,
      retrievalMethod: "none",
      attemptedMode: mode,
      totalMs: Date.now() - totalStart,
    });

    return {
      answer,
      knowledgeUsed: false,
      sourceType: "general_ai",
      sources: [],
      retrievalMethod: "none",
      diagnostics: {
        chunksRetrieved: 0,
        retrievalMs,
        embeddingMs,
        llmMs,
        totalMs: Date.now() - totalStart,
        mode,
        retrievalMethod: "none",
      },
    };
  }

  const context = buildRagContext(ranked);
  let answer: string;
  let llmMs = 0;
  try {
    const gen = await generateAnswer(q, context, {
      userId: input.userId,
      workspaceId: input.workspaceId,
    });
    answer = gen.answer;
    llmMs = gen.llmMs;
  } catch (err) {
    logRag("query.llm_failed", { error: err instanceof Error ? err.message : "llm" });
    answer =
      "The Knowledge Base retrieved relevant sources, but the language model is temporarily unavailable.";
  }

  if (!answer) {
    answer = "The Knowledge Base does not contain enough information to answer that question.";
  }

  const sources: KnowledgeSource[] = ranked.slice(0, ragConfig().maxContextChunks).map((c) => ({
    documentId: c.documentId,
    filename: c.filename,
    category: c.category ?? null,
    page: c.page,
    section: c.section,
    chunkId: c.chunkId,
    score: Number(c.score.toFixed(4)),
  }));

  logRag("query.ok", {
    workspaceId: input.workspaceId,
    mode,
    retrievalMethod,
    chunks: ranked.length,
    sourceType: "knowledge_base",
    totalMs: Date.now() - totalStart,
  });

  return {
    answer,
    knowledgeUsed: true,
    sourceType: "knowledge_base",
    sources,
    retrievalMethod,
    diagnostics: {
      chunksRetrieved: ranked.length,
      retrievalMs,
      embeddingMs,
      llmMs,
      totalMs: Date.now() - totalStart,
      mode,
      retrievalMethod,
    },
  };
}

/** Compact context string for live meeting answers (meeting-first RAG). */
export async function retrieveKnowledgeContextForLive(
  question: string,
  opts?: {
    workspaceId?: string | null;
    meetingId?: string | null;
    documentIds?: string[];
    includeWorkspace?: boolean;
    maxChars?: number;
  },
): Promise<{
  context: string;
  knowledgeUsed: boolean;
  sourceType: KnowledgeSourceType;
  sources: KnowledgeSource[];
  retrievalMs: number;
}> {
  const ws = opts?.workspaceId || "ws_default";
  const result = await retrieveForMeeting({
    workspaceId: ws,
    meetingId: opts?.meetingId,
    query: question,
    documentIds: opts?.documentIds,
    includeWorkspace: opts?.includeWorkspace,
    topK: 5,
  });
  const max = opts?.maxChars ?? 2800;
  const context = buildRagContext(result.chunks).slice(0, max);
  return {
    context,
    knowledgeUsed: result.knowledgeUsed,
    sourceType: result.sourceType,
    sources: result.chunks.slice(0, ragConfig().maxContextChunks).map((c) => ({
      documentId: c.documentId,
      filename: c.filename,
      page: c.page,
      section: c.section,
      chunkId: c.chunkId,
      score: Number(c.score.toFixed(4)),
    })),
    retrievalMs: result.totalMs,
  };
}
