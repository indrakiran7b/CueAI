/**
 * Qdrant vector store via REST API (no frontend exposure of keys).
 */

import { ragConfig, isQdrantConfigured } from "@/lib/server/rag/config";
import { getEmbeddingDimension } from "@/lib/server/rag/embeddings";

export type VectorPointPayload = {
  workspace_id: string;
  meeting_id: string | null;
  document_id: string;
  chunk_id: string;
  filename: string;
  page_number?: number | null;
  section_title?: string | null;
  chunk_index: number;
  knowledge_scope: "meeting" | "workspace";
  category?: string | null;
  text: string;
};

export type VectorSearchHit = {
  id: string;
  score: number;
  payload: VectorPointPayload;
};

function headers(): HeadersInit {
  const cfg = ragConfig();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.qdrantApiKey) h["api-key"] = cfg.qdrantApiKey;
  return h;
}

function baseUrl(): string {
  return ragConfig().qdrantUrl.replace(/\/$/, "");
}

async function qdrantFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers || {}) },
  });
}

let collectionReady = false;

export async function ensureCollection(): Promise<void> {
  if (!isQdrantConfigured()) return;
  if (collectionReady) return;
  const cfg = ragConfig();
  const dim = getEmbeddingDimension();
  const check = await qdrantFetch(`/collections/${encodeURIComponent(cfg.qdrantCollection)}`);
  if (check.ok) {
    const info = (await check.json().catch(() => null)) as {
      result?: { config?: { params?: { vectors?: { size?: number } } } };
    } | null;
    const existingDim = info?.result?.config?.params?.vectors?.size;
    if (existingDim && existingDim !== dim) {
      const del = await qdrantFetch(
        `/collections/${encodeURIComponent(cfg.qdrantCollection)}`,
        { method: "DELETE" },
      );
      if (!del.ok) {
        throw new Error(
          `Qdrant collection dimension mismatch (${existingDim} vs ${dim}) and recreate failed.`,
        );
      }
    } else {
      collectionReady = true;
      return;
    }
  }
  const create = await qdrantFetch(`/collections/${encodeURIComponent(cfg.qdrantCollection)}`, {
    method: "PUT",
    body: JSON.stringify({
      vectors: { size: dim, distance: "Cosine" },
    }),
  });
  if (!create.ok) {
    const err = await create.text().catch(() => "");
    throw new Error(`Qdrant collection create failed: ${err.slice(0, 200)}`);
  }
  collectionReady = true;
}

export async function upsertVectors(
  points: Array<{ id: string; vector: number[]; payload: VectorPointPayload }>,
): Promise<void> {
  if (!isQdrantConfigured() || !points.length) return;
  await ensureCollection();
  const cfg = ragConfig();
  const res = await qdrantFetch(
    `/collections/${encodeURIComponent(cfg.qdrantCollection)}/points?wait=true`,
    {
      method: "PUT",
      body: JSON.stringify({
        points: points.map((p) => ({
          id: p.id,
          vector: p.vector,
          payload: p.payload,
        })),
      }),
    },
  );
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Qdrant upsert failed: ${err.slice(0, 200)}`);
  }
}

export async function deleteDocumentVectors(
  workspaceId: string,
  documentId: string,
): Promise<void> {
  if (!isQdrantConfigured()) return;
  await ensureCollection();
  const cfg = ragConfig();
  const res = await qdrantFetch(
    `/collections/${encodeURIComponent(cfg.qdrantCollection)}/points/delete?wait=true`,
    {
      method: "POST",
      body: JSON.stringify({
        filter: {
          must: [
            { key: "workspace_id", match: { value: workspaceId } },
            { key: "document_id", match: { value: documentId } },
          ],
        },
      }),
    },
  );
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Qdrant delete failed: ${err.slice(0, 200)}`);
  }
}

export async function searchVectors(input: {
  workspaceId: string;
  vector: number[];
  topK: number;
  scoreThreshold?: number;
  /** When set, restrict to this meeting's knowledge. */
  meetingId?: string | null;
  /** When set, restrict to these document ids (must also match workspace). */
  documentIds?: string[];
  knowledgeScope?: "meeting" | "workspace";
}): Promise<VectorSearchHit[]> {
  if (!isQdrantConfigured()) return [];
  await ensureCollection();
  const cfg = ragConfig();
  const must: Array<Record<string, unknown>> = [
    { key: "workspace_id", match: { value: input.workspaceId } },
  ];
  if (input.meetingId) {
    must.push({ key: "meeting_id", match: { value: input.meetingId } });
  }
  if (input.knowledgeScope) {
    must.push({ key: "knowledge_scope", match: { value: input.knowledgeScope } });
  }
  if (input.documentIds?.length) {
    must.push({ key: "document_id", match: { any: input.documentIds } });
  }
  const res = await qdrantFetch(
    `/collections/${encodeURIComponent(cfg.qdrantCollection)}/points/search`,
    {
      method: "POST",
      body: JSON.stringify({
        vector: input.vector,
        limit: input.topK,
        with_payload: true,
        score_threshold: input.scoreThreshold ?? cfg.scoreThreshold,
        filter: { must },
      }),
    },
  );
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Qdrant search failed: ${err.slice(0, 200)}`);
  }
  const body = (await res.json()) as {
    result?: Array<{ id: string | number; score: number; payload?: VectorPointPayload }>;
  };
  return (body.result || []).map((r) => ({
    id: String(r.id),
    score: r.score,
    payload: r.payload as VectorPointPayload,
  }));
}

export async function qdrantHealth(): Promise<boolean> {
  if (!isQdrantConfigured()) return false;
  try {
    const res = await qdrantFetch("/readyz");
    return res.ok;
  } catch {
    return false;
  }
}

export async function countCollectionPoints(): Promise<number> {
  if (!isQdrantConfigured()) return 0;
  await ensureCollection();
  const cfg = ragConfig();
  const res = await qdrantFetch(
    `/collections/${encodeURIComponent(cfg.qdrantCollection)}`,
  );
  if (!res.ok) return 0;
  const body = (await res.json()) as {
    result?: { points_count?: number; indexed_vectors_count?: number };
  };
  return body.result?.points_count ?? 0;
}

/** Reset in-memory ready flag (tests / collection recreate). */
export function resetCollectionCache(): void {
  collectionReady = false;
}
