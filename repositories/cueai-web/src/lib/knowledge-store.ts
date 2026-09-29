/**
 * Knowledge Base API client (Admin/Manager).
 * Server-backed — no localStorage documents, no dummy data.
 */

import type { KnowledgeCategory } from "@/lib/knowledge-categories";

export type KnowledgeDocumentStatus =
  | "uploaded"
  | "processing"
  | "indexed"
  | "failed"
  | "deleting";

export type KnowledgeDocument = {
  id: string;
  workspaceId?: string;
  title: string;
  type: string;
  status: KnowledgeDocumentStatus;
  category?: KnowledgeCategory | string | null;
  sizeLabel: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  originalFilename?: string;
  mimeType?: string;
  fileSize?: number;
  checksum?: string;
  chunkCount?: number;
  pageCount?: number;
  processingError?: string;
  processedAt?: string;
  documentVersion?: number;
  preview?: string;
  hasFile?: boolean;
  embeddingStatus?: string;
  vectorIndexed?: boolean;
  rag?: {
    embedding?: string;
    vectorIndex?: string;
    chunks?: number;
    vectorConfigured?: boolean;
    semanticAvailable?: boolean;
  };
};

export type KnowledgeDocumentContent = {
  documentId: string;
  filename: string;
  pageCount: number;
  pages: Array<{ pageNumber: number; text: string }>;
};

/** @deprecated Prefer KnowledgeDocument — kept for session wizard compatibility. */
export type KnowledgeDoc = {
  id: string;
  name: string;
  folder: string;
  tags: string[];
  updated: string;
  size: string;
  preview: string;
};

export type KnowledgeSource = {
  documentId: string;
  filename: string;
  category?: string | null;
  page?: number | null;
  section?: string | null;
  chunkId: string;
  score: number;
};

export type KnowledgeQueryRequest = {
  query: string;
  topK?: number;
};

export type KnowledgeQueryResponse = {
  answer: string;
  knowledgeUsed: boolean;
  sourceType: "knowledge_base" | "meeting_knowledge" | "workspace_knowledge" | "general_ai";
  sources: KnowledgeSource[];
  retrievalMethod?: "semantic" | "keyword" | "none";
  diagnostics?: {
    chunksRetrieved: number;
    retrievalMs: number;
    embeddingMs: number;
    llmMs: number;
    totalMs: number;
    mode: "vector" | "keyword";
    retrievalMethod?: "semantic" | "keyword" | "none";
  };
};

type ListResponse = {
  items: KnowledgeDocument[];
  rag?: { enabled: boolean; vectorConfigured: boolean };
};

function errorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const err = (body as { error?: unknown }).error;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: string }).message || fallback);
  }
  return fallback;
}

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

export const knowledgeApi = {
  async listDocuments(opts?: {
    q?: string;
    category?: string;
  }): Promise<ListResponse> {
    const params = new URLSearchParams();
    if (opts?.q?.trim()) params.set("q", opts.q.trim());
    if (opts?.category && opts.category !== "all") {
      params.set("category", opts.category);
    }
    const qs = params.toString();
    const url = qs ? `/api/admin/knowledge?${qs}` : "/api/admin/knowledge";
    const res = await fetch(url, { cache: "no-store" });
    const body = await parseJson<ListResponse & { error?: unknown }>(res);
    if (!res.ok) throw new Error(errorMessage(body, "Failed to load documents."));
    return { items: body.items || [], rag: body.rag };
  },

  async getDocument(id: string): Promise<KnowledgeDocument> {
    const res = await fetch(`/api/admin/knowledge/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    const body = await parseJson<{ item?: KnowledgeDocument; error?: unknown }>(res);
    if (!res.ok || !body.item) throw new Error(errorMessage(body, "Document not found."));
    return body.item;
  },

  async getDocumentContent(id: string): Promise<KnowledgeDocumentContent> {
    const res = await fetch(
      `/api/admin/knowledge/${encodeURIComponent(id)}/content`,
      { cache: "no-store" },
    );
    const body = await parseJson<KnowledgeDocumentContent & { error?: unknown }>(res);
    if (!res.ok) throw new Error(errorMessage(body, "Failed to load content."));
    return body;
  },

  openDocumentUrl(id: string): string {
    return `/api/admin/knowledge/${encodeURIComponent(id)}/file`;
  },

  async uploadDocument(
    file: File,
    opts?: { title?: string; category?: KnowledgeCategory | string },
  ): Promise<KnowledgeDocument> {
    const form = new FormData();
    form.append("file", file);
    if (opts?.title?.trim()) form.append("title", opts.title.trim());
    if (opts?.category) form.append("category", String(opts.category));
    const res = await fetch("/api/admin/knowledge", { method: "POST", body: form });
    const body = await parseJson<{ item?: KnowledgeDocument; error?: unknown }>(res);
    if (!res.ok || !body.item) {
      throw new Error(errorMessage(body, "Upload failed."));
    }
    return body.item;
  },

  async deleteDocument(id: string): Promise<void> {
    const res = await fetch(`/api/admin/knowledge/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const body = await parseJson<{ error?: unknown }>(res);
    if (!res.ok) throw new Error(errorMessage(body, "Delete failed."));
  },

  async reindexDocument(id: string): Promise<void> {
    const res = await fetch(
      `/api/admin/knowledge/${encodeURIComponent(id)}/reindex`,
      { method: "POST" },
    );
    const body = await parseJson<{ error?: unknown }>(res);
    if (!res.ok) throw new Error(errorMessage(body, "Re-index failed."));
  },

  async query(req: KnowledgeQueryRequest): Promise<KnowledgeQueryResponse> {
    const res = await fetch("/api/admin/knowledge/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: req.query, top_k: req.topK }),
    });
    const body = await parseJson<
      KnowledgeQueryResponse & {
        knowledge_used?: boolean;
        source_type?: KnowledgeQueryResponse["sourceType"];
        retrieval_method?: KnowledgeQueryResponse["retrievalMethod"];
        error?: unknown;
      }
    >(res);
    if (!res.ok) throw new Error(errorMessage(body, "Query failed."));
    return {
      answer: body.answer,
      knowledgeUsed: body.knowledgeUsed ?? body.knowledge_used ?? false,
      sourceType: body.sourceType ?? body.source_type ?? "general_ai",
      sources: body.sources || [],
      retrievalMethod:
        body.retrievalMethod ??
        body.retrieval_method ??
        body.diagnostics?.retrievalMethod ??
        (body.knowledgeUsed || body.knowledge_used
          ? body.diagnostics?.mode === "vector"
            ? "semantic"
            : "keyword"
          : "none"),
      diagnostics: body.diagnostics,
    };
  },
};

export function statusLabel(status: KnowledgeDocumentStatus | string): string {
  switch (status) {
    case "uploaded":
      return "Uploaded";
    case "processing":
      return "Processing";
    case "indexed":
      return "Ready";
    case "failed":
      return "Failed";
    case "deleting":
      return "Deleting";
    default:
      return status;
  }
}

export function formatRelativeTime(iso?: string): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

export function isUnsafeDocumentText(text: string | undefined | null): boolean {
  const head = String(text || "")
    .slice(0, 64)
    .replace(/^\uFEFF/, "");
  return head.startsWith("%PDF") || /%PDF-\d/.test(head);
}

/** Map API docs to the lightweight shape used by the live session wizard. */
export function toWizardDocs(items: KnowledgeDocument[]): KnowledgeDoc[] {
  return items
    .filter((d) => d.status === "indexed")
    .map((d) => ({
      id: d.id,
      name: d.originalFilename || d.title,
      folder: d.category || "Knowledge",
      tags: [statusLabel(d.status), d.category || "engineering"].filter(Boolean),
      updated: d.updatedAt?.slice(0, 10) || "",
      size: d.sizeLabel,
      preview: isUnsafeDocumentText(d.preview) ? "" : d.preview || "",
    }));
}

/** @deprecated Use knowledgeApi.listDocuments */
export function loadKnowledgeDocs(): KnowledgeDoc[] {
  return [];
}

/** @deprecated Use knowledgeApi.uploadDocument */
export async function addKnowledgeFiles(files: FileList | File[]): Promise<KnowledgeDoc[]> {
  const list = Array.from(files);
  for (const file of list) {
    await knowledgeApi.uploadDocument(file);
  }
  const { items } = await knowledgeApi.listDocuments();
  return toWizardDocs(items);
}

/** @deprecated Use knowledgeApi.deleteDocument */
export async function deleteKnowledgeDoc(id: string): Promise<KnowledgeDoc[]> {
  await knowledgeApi.deleteDocument(id);
  const { items } = await knowledgeApi.listDocuments();
  return toWizardDocs(items);
}

/** @deprecated Use knowledgeApi.reindexDocument */
export async function reindexKnowledgeDocs(): Promise<KnowledgeDoc[]> {
  const { items } = await knowledgeApi.listDocuments();
  for (const item of items) {
    await knowledgeApi.reindexDocument(item.id);
  }
  const next = await knowledgeApi.listDocuments();
  return toWizardDocs(next.items);
}
