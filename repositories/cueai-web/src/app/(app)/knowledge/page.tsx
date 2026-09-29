"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, RefreshCw, Search, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_CATEGORY_LABELS,
  type KnowledgeCategory,
  categoryLabel,
} from "@/lib/knowledge-categories";
import {
  formatRelativeTime,
  knowledgeApi,
  statusLabel,
  type KnowledgeDocument,
  type KnowledgeQueryResponse,
} from "@/lib/knowledge-store";
import { useAuth } from "@/components/providers/auth-provider";
import { can } from "@/lib/roles";
import { cn } from "@/lib/utils";

type CategoryFilter = "all" | KnowledgeCategory;

function statusVariant(
  status: KnowledgeDocument["status"],
): "success" | "warning" | "danger" | "default" {
  if (status === "indexed") return "success";
  if (status === "processing" || status === "uploaded") return "warning";
  if (status === "failed") return "danger";
  return "default";
}

export default function KnowledgePage() {
  const { session } = useAuth();
  const canWrite = can(session?.role, "knowledge.write");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [docs, setDocs] = useState<KnowledgeDocument[]>([]);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [filter, setFilter] = useState("");
  const [uploadCategory, setUploadCategory] = useState<KnowledgeCategory>("engineering");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vectorConfigured, setVectorConfigured] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchResult, setSearchResult] = useState<KnowledgeQueryResponse | null>(null);

  const refresh = useCallback(async () => {
    const data = await knowledgeApi.listDocuments({
      category: category === "all" ? undefined : category,
      q: filter.trim() || undefined,
    });
    setDocs(data.items);
    setVectorConfigured(Boolean(data.rag?.vectorConfigured));
  }, [category, filter]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      void (async () => {
        try {
          const data = await knowledgeApi.listDocuments({
            category: category === "all" ? undefined : category,
            q: filter.trim() || undefined,
          });
          if (cancelled) return;
          setDocs(data.items);
          setVectorConfigured(Boolean(data.rag?.vectorConfigured));
        } catch (err) {
          if (!cancelled) {
            setError(
              err instanceof Error ? err.message : "Failed to load Knowledge Base.",
            );
          }
        }
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [category, filter]);

  useEffect(() => {
    const pending = docs.some(
      (d) => d.status === "processing" || d.status === "uploaded",
    );
    if (!pending) return;
    const t = setInterval(() => {
      void refresh().catch(() => undefined);
    }, 2500);
    return () => clearInterval(t);
  }, [docs, refresh]);

  async function onUpload(files: FileList | null) {
    if (!files?.length || !canWrite) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      let count = 0;
      for (const file of Array.from(files)) {
        await knowledgeApi.uploadDocument(file, { category: uploadCategory });
        count += 1;
      }
      await refresh();
      setShowUpload(false);
      setMessage(
        count === 1
          ? "Document uploaded and processing."
          : `${count} documents uploaded and processing.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function onReindexAll() {
    if (!canWrite || !docs.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const doc of docs) {
        await knowledgeApi.reindexDocument(doc.id);
      }
      await refresh();
      setMessage("Re-index started for visible documents.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-index failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onAsk() {
    const q = searchQuery.trim();
    if (!q) return;
    setSearchBusy(true);
    setError(null);
    try {
      const result = await knowledgeApi.query({ query: q });
      setSearchResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed.");
      setSearchResult(null);
    } finally {
      setSearchBusy(false);
    }
  }

  const filters: { id: CategoryFilter; label: string }[] = [
    { id: "all", label: "All" },
    ...KNOWLEDGE_CATEGORIES.map((id) => ({
      id,
      label: KNOWLEDGE_CATEGORY_LABELS[id],
    })),
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Knowledge Base
          </h1>
          <p className="mt-1 text-sm text-muted">
            Upload docs to your workspace — searchable and cited in AI answers.
          </p>
        </div>
        <div className="flex gap-2">
          {canWrite && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onReindexAll()}
              disabled={busy || docs.length === 0}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Re-index
            </Button>
          )}
          {canWrite && (
            <Button
              variant="gradient"
              size="sm"
              loading={busy}
              onClick={() => setShowUpload((v) => !v)}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload
            </Button>
          )}
        </div>
      </div>

      {(message || error) && (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            error
              ? "border-red-500/30 bg-red-500/10 text-red-200"
              : "border-teal-500/30 bg-teal-500/10 text-teal-100",
          )}
        >
          {error || message}
        </div>
      )}

      {showUpload && canWrite && (
        <Card className="space-y-4 p-5">
          <h2 className="font-semibold tracking-tight">Upload Document</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1.5 block text-subtle">File</span>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md,.markdown,.csv,text/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--surface-active)] file:px-3 file:py-1.5 file:text-foreground"
                onChange={(e) => void onUpload(e.target.files)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-subtle">Category</span>
              <select
                value={uploadCategory}
                onChange={(e) =>
                  setUploadCategory(e.target.value as KnowledgeCategory)
                }
                className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
              >
                {KNOWLEDGE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {KNOWLEDGE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-subtle">
            Supported: PDF, DOCX, TXT, Markdown, CSV. Processing runs in the background.
          </p>
        </Card>
      )}

      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search documents…"
        leftIcon={<Search className="h-4 w-4" />}
      />

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setCategory(f.id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm transition",
              category === f.id
                ? "bg-[var(--primary-muted)] text-foreground"
                : "bg-[var(--surface-active)]/50 text-muted hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {docs.map((doc) => (
          <button
            key={doc.id}
            type="button"
            onClick={() => router.push(`/knowledge/documents/${doc.id}`)}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:border-[var(--primary)]/40 hover:bg-[var(--surface-hover)]"
          >
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate font-medium">
                  {doc.originalFilename || doc.title}
                </p>
                <p className="text-xs text-muted">{categoryLabel(doc.category)}</p>
                <p className="text-xs text-subtle">
                  {doc.type.toUpperCase()} · {doc.sizeLabel}
                </p>
                <div className="pt-1">
                  <Badge variant={statusVariant(doc.status)}>
                    {statusLabel(doc.status)}
                  </Badge>
                </div>
                <p className="text-xs text-subtle">
                  Updated {formatRelativeTime(doc.updatedAt)}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {docs.length === 0 && (
        <p className="py-10 text-center text-sm text-muted">
          No documents in this category yet.
        </p>
      )}

      <Card className="p-5">
        <h2 className="font-semibold tracking-tight">Admin diagnostics</h2>
        <p className="mt-1 text-xs text-subtle">
          Ask a question to validate RAG retrieval and general AI fallback.
          {vectorConfigured
            ? " Vector search is configured."
            : " Keyword fallback active until Qdrant + embeddings are configured."}
        </p>
        <div className="mt-4 flex gap-2">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="What framework is used for the backend?"
            onKeyDown={(e) => {
              if (e.key === "Enter") void onAsk();
            }}
          />
          <Button
            variant="gradient"
            size="sm"
            loading={searchBusy}
            onClick={() => void onAsk()}
          >
            Ask
          </Button>
        </div>

        {searchResult && (
          <div className="mt-5 space-y-4 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
                Answer
              </p>
              <p className="mt-2 leading-relaxed whitespace-pre-wrap">
                {searchResult.answer}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              <span>
                Knowledge Used:{" "}
                <strong>{searchResult.knowledgeUsed ? "YES" : "NO"}</strong>
              </span>
              <span>
                Retrieval:{" "}
                <strong>
                  {searchResult.retrievalMethod === "semantic"
                    ? "Semantic"
                    : searchResult.retrievalMethod === "keyword"
                      ? "Keyword"
                      : "None"}
                </strong>
              </span>
              <span>
                Source type:{" "}
                <strong>
                  {searchResult.sourceType === "general_ai"
                    ? "General AI"
                    : "Knowledge Base"}
                </strong>
              </span>
            </div>
            {searchResult.knowledgeUsed && searchResult.sources.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
                  Sources
                </p>
                <ul className="mt-2 space-y-1 text-muted">
                  {searchResult.sources.map((s) => (
                    <li key={s.chunkId}>
                      <Link
                        href={`/knowledge/documents/${s.documentId}`}
                        className="hover:text-foreground"
                      >
                        {s.filename}
                        {s.page != null ? ` · Page ${s.page}` : ""}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!searchResult.knowledgeUsed && (
              <p className="text-xs text-subtle">
                No Knowledge Base sources (general AI fallback).
              </p>
            )}
            {searchResult.diagnostics && (
              <div className="space-y-1 rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-subtle">
                <p>
                  Retrieval:{" "}
                  <strong className="text-foreground">
                    {(
                      searchResult.retrievalMethod ||
                      searchResult.diagnostics.retrievalMethod ||
                      "none"
                    ).replace(/^./, (c) => c.toUpperCase())}
                  </strong>
                  {" · "}
                  {searchResult.diagnostics.embeddingMs}ms embed ·{" "}
                  {searchResult.diagnostics.retrievalMs}ms retrieve
                </p>
                <p>
                  LLM: {searchResult.diagnostics.llmMs}ms · Total:{" "}
                  {searchResult.diagnostics.totalMs}ms · Chunks:{" "}
                  {searchResult.diagnostics.chunksRetrieved}
                </p>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
