"use client";

import { useEffect, useRef, useState } from "react";
import {
  Folder,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  addKnowledgeFiles,
  deleteKnowledgeDoc,
  loadKnowledgeDocs,
  reindexKnowledgeDocs,
  type KnowledgeDoc,
} from "@/lib/knowledge-store";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";
import { isAdminUser } from "@/lib/app-access";
import { useRouter } from "next/navigation";
import { withDesktopParam } from "@/lib/desktop-query";

const folders = ["All", "Security", "GTM", "Engineering", "Sales"];

export default function KnowledgePage() {
  const { session, ready } = useAuth();
  const router = useRouter();
  const admin = isAdminUser(session?.role);
  const inputRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [folder, setFolder] = useState("All");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!admin) {
      router.replace(withDesktopParam("/dashboard"));
      return;
    }
    const loaded = loadKnowledgeDocs();
    setDocs(loaded);
    setSelected(loaded[0]?.id ?? null);
  }, [ready, admin, router]);

  const filtered = docs.filter((d) => {
    const inFolder = folder === "All" || d.folder === folder;
    const inQuery =
      !query ||
      d.name.toLowerCase().includes(query.toLowerCase()) ||
      d.tags.some((t) => t.toLowerCase().includes(query.toLowerCase())) ||
      d.preview.toLowerCase().includes(query.toLowerCase());
    return inFolder && inQuery;
  });

  const active = docs.find((d) => d.id === selected) ?? filtered[0] ?? null;

  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      const next = await addKnowledgeFiles(files);
      setDocs(next);
      setSelected(next[0]?.id ?? null);
      setMessage(`Uploaded ${files.length} file${files.length > 1 ? "s" : ""}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onReindex() {
    const next = reindexKnowledgeDocs();
    setDocs(next);
    setMessage("Re-index complete.");
  }

  function onDelete(id: string) {
    const next = deleteKnowledgeDoc(id);
    setDocs(next);
    setSelected(next[0]?.id ?? null);
    setMessage("Document deleted.");
  }

  if (!ready || !admin) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
        {ready ? "Redirecting…" : "Loading workspace…"}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-up">
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
          <Button variant="outline" size="sm" onClick={onReindex} disabled={busy || !docs.length}>
            <RefreshCw className="h-3.5 w-3.5" />
            Re-index
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.txt,.md,.csv,.json,text/*,application/pdf"
            className="hidden"
            onChange={(e) => void onUpload(e.target.files)}
          />
          <Button
            variant="gradient"
            size="sm"
            loading={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            Upload
          </Button>
        </div>
      </div>

      {(message || error) && (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            error
              ? "border-red-500/30 bg-red-500/10 text-red-200"
              : "border-teal-500/30 bg-teal-500/10 text-teal-100"
          )}
        >
          {error || message}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="min-w-[240px] flex-1">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search uploaded docs…"
            leftIcon={<Search className="h-4 w-4" />}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {folders.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFolder(f)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm transition",
              folder === f
                ? "border-teal-500/30 bg-[var(--primary-muted)] text-primary"
                : "border-[var(--border)] text-muted hover:text-foreground"
            )}
          >
            <Folder className="h-3.5 w-3.5" />
            {f}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="divide-y divide-[var(--border)] overflow-hidden p-0">
          {filtered.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => setSelected(doc.id)}
              className={cn(
                "flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-[var(--surface-hover)]",
                selected === doc.id && "bg-[var(--primary-muted)]/40"
              )}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-active)] text-primary">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{doc.name}</p>
                <p className="mt-0.5 text-xs text-subtle">
                  {doc.folder} · {doc.size} · Updated {doc.updated}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {doc.tags.map((t) => (
                    <Badge key={t} variant="default">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="p-8 text-center text-sm text-muted">
              No documents yet. Click Upload to add files.
            </p>
          )}
        </Card>

        <Card className="p-5">
          {active ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold tracking-tight">{active.name}</h3>
                  <p className="mt-1 text-xs text-subtle">
                    Source · {active.folder} · Indexed
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete"
                  onClick={() => onDelete(active.id)}
                >
                  <Trash2 className="h-4 w-4 text-red-400" />
                </Button>
              </div>
              <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--background)]/50 p-4 text-sm leading-relaxed text-muted whitespace-pre-wrap">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">
                  Preview
                </p>
                {active.preview || "No preview text extracted for this file."}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">Upload a document to preview it here.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
