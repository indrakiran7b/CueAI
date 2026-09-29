"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { categoryLabel } from "@/lib/knowledge-categories";
import {
  formatRelativeTime,
  isUnsafeDocumentText,
  knowledgeApi,
  statusLabel,
  type KnowledgeDocument,
  type KnowledgeDocumentContent,
} from "@/lib/knowledge-store";
import { useAuth } from "@/components/providers/auth-provider";
import { can } from "@/lib/roles";
import { cn } from "@/lib/utils";

function statusVariant(
  status: KnowledgeDocument["status"],
): "success" | "warning" | "danger" | "default" {
  if (status === "indexed") return "success";
  if (status === "processing" || status === "uploaded") return "warning";
  if (status === "failed") return "danger";
  return "default";
}

export default function KnowledgeDocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const { session } = useAuth();
  const canWrite = can(session?.role, "knowledge.write");

  const [doc, setDoc] = useState<KnowledgeDocument | null>(null);
  const [content, setContent] = useState<KnowledgeDocumentContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const item = await knowledgeApi.getDocument(id);
    setDoc(item);
    if (item.status === "indexed" || item.status === "failed") {
      try {
        const pages = await knowledgeApi.getDocumentContent(id);
        setContent(pages);
      } catch {
        setContent(null);
      }
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      void (async () => {
        try {
          await load();
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Document not found.");
          }
        }
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (!doc || (doc.status !== "processing" && doc.status !== "uploaded")) return;
    const t = setInterval(() => {
      void load().catch(() => undefined);
    }, 2500);
    return () => clearInterval(t);
  }, [doc, load]);

  async function onReindex() {
    if (!id || !canWrite) return;
    setBusy(true);
    setError(null);
    try {
      await knowledgeApi.reindexDocument(id);
      setMessage("Re-index started.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-index failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!id || !canWrite) return;
    if (!window.confirm("Delete this document, its chunks, and vectors?")) return;
    setBusy(true);
    try {
      await knowledgeApi.deleteDocument(id);
      router.push("/knowledge");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
      setBusy(false);
    }
  }

  if (error && !doc) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <Link
          href="/knowledge"
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Knowledge Base
        </Link>
        <p className="text-sm text-red-300">{error}</p>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-sm text-muted">Loading document…</div>
    );
  }

  const filename = doc.originalFilename || doc.title;

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-up">
      <Link
        href="/knowledge"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Knowledge Base
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {filename}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>{categoryLabel(doc.category)}</span>
            <Badge variant={statusVariant(doc.status)}>{statusLabel(doc.status)}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {doc.hasFile !== false && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                window.open(knowledgeApi.openDocumentUrl(doc.id), "_blank", "noopener")
              }
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open PDF
            </Button>
          )}
          {canWrite && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || doc.status === "processing"}
                onClick={() => void onReindex()}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Re-index
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void onDelete()}
              >
                <Trash2 className="h-3.5 w-3.5 text-red-400" />
                Delete
              </Button>
            </>
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

      {doc.processingError && (
        <p className="text-sm text-red-300">{doc.processingError}</p>
      )}

      <Card className="space-y-3 p-5 text-sm">
        <h2 className="font-semibold tracking-tight">Document Information</h2>
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-subtle">File type</dt>
            <dd className="uppercase">{doc.type}</dd>
          </div>
          <div>
            <dt className="text-subtle">Size</dt>
            <dd>{doc.sizeLabel}</dd>
          </div>
          <div>
            <dt className="text-subtle">Pages</dt>
            <dd>{doc.pageCount ?? 0}</dd>
          </div>
          <div>
            <dt className="text-subtle">Chunks</dt>
            <dd>{doc.chunkCount ?? 0}</dd>
          </div>
          <div>
            <dt className="text-subtle">RAG Index</dt>
            <dd>{doc.vectorIndexed ? "Indexed" : statusLabel(doc.status)}</dd>
          </div>
          <div>
            <dt className="text-subtle">Uploaded</dt>
            <dd>{formatRelativeTime(doc.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-subtle">Updated</dt>
            <dd>{formatRelativeTime(doc.updatedAt)}</dd>
          </div>
        </dl>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-semibold tracking-tight">Extracted Content</h2>
        {!content?.pages?.length ? (
          <p className="text-sm text-muted">
            {doc.status === "processing" || doc.status === "uploaded"
              ? "Extraction in progress…"
              : "No extractable text available."}
          </p>
        ) : (
          <div className="max-h-[28rem] space-y-4 overflow-y-auto text-sm">
            {content.pages
              .filter((page) => page.text && !isUnsafeDocumentText(page.text))
              .map((page) => (
              <div key={page.pageNumber}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-subtle">
                  Page {page.pageNumber}
                </p>
                <p className="whitespace-pre-wrap leading-relaxed text-muted">
                  {page.text}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-3 p-5 text-sm">
        <h2 className="font-semibold tracking-tight">RAG Information</h2>
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-subtle">Embedding</dt>
            <dd className="capitalize">
              {doc.embeddingStatus || doc.rag?.embedding || "pending"}
            </dd>
          </div>
          <div>
            <dt className="text-subtle">Vector index</dt>
            <dd className="capitalize">
              {doc.vectorIndexed
                ? "ready"
                : doc.rag?.vectorIndex || "pending"}
            </dd>
          </div>
          <div>
            <dt className="text-subtle">Chunks</dt>
            <dd>{doc.rag?.chunks ?? doc.chunkCount ?? 0}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
