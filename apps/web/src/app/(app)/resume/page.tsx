"use client";

import { useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import {
  Check,
  Download,
  FileUp,
  Loader2,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Gauge, Progress, Tabs } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { extractAndRememberResume, rememberResume } from "@/lib/resume-store";

type ResumeRewrite = {
  section: string;
  original: string;
  rewritten: string;
};

type ResumeAnalysis = {
  matchScore: number;
  atsScore: number;
  keywordCoverage: number;
  missingKeywords: string[];
  suggestedSkills: string[];
  summary: string;
  rewrites: ResumeRewrite[];
  resumeText: string;
  resumePreview: string;
  usedJobDescription: boolean;
};

type RewriteDecision = "pending" | "accepted" | "rejected";

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

function isAllowedFile(file: File) {
  const name = file.name.toLowerCase();
  return (
    ACCEPTED_TYPES.includes(file.type) ||
    name.endsWith(".pdf") ||
    name.endsWith(".docx") ||
    name.endsWith(".txt")
  );
}

/** Collapse whitespace for fuzzy matching when exact excerpt differs slightly. */
function normalizeWs(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace the first match of `original` in `source` with `replacement`.
 * Tries exact match, then whitespace-normalized match.
 */
function replaceExcerpt(source: string, original: string, replacement: string): string {
  if (!original.trim()) return source;
  if (source.includes(original)) {
    return source.replace(original, replacement);
  }

  const normSource = normalizeWs(source);
  const normOriginal = normalizeWs(original).trim();
  const idx = normSource.indexOf(normOriginal);
  if (idx < 0) return source;

  // Map normalized index back approximately by rebuilding via regex on flexible whitespace.
  const flexible = escapeRegExp(normOriginal).replace(/ /g, "\\s+").replace(/\\n/g, "\\s*");
  const re = new RegExp(flexible);
  return source.replace(re, replacement);
}

function buildImprovedResume(
  baseText: string,
  rewrites: ResumeRewrite[],
  decisions: RewriteDecision[]
): string {
  let next = baseText;
  rewrites.forEach((rewrite, i) => {
    if (decisions[i] !== "accepted") return;
    const applied = replaceExcerpt(next, rewrite.original, rewrite.rewritten);
    // If excerpt wasn't found, append the accepted rewrite under its section.
    if (applied === next) {
      next = `${next.trimEnd()}\n\n[${rewrite.section} — improved]\n${rewrite.rewritten}\n`;
    } else {
      next = applied;
    }
  });
  return next.trim() + "\n";
}

function exportFileName(originalName: string | undefined) {
  const base = (originalName || "resume").replace(/\.[^.]+$/, "");
  return `${base}-tailored.txt`;
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ResumePage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState("editor");
  const [file, setFile] = useState<File | null>(null);
  const [jd, setJd] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null);
  const [rewriteIndex, setRewriteIndex] = useState(0);
  const [decisions, setDecisions] = useState<RewriteDecision[]>([]);

  const acceptedCount = useMemo(
    () => decisions.filter((d) => d === "accepted").length,
    [decisions]
  );

  const improvedResume = useMemo(() => {
    if (!analysis) return "";
    const base = analysis.resumeText || analysis.resumePreview || "";
    return buildImprovedResume(base, analysis.rewrites, decisions);
  }, [analysis, decisions]);

  const canExport = Boolean(analysis && acceptedCount > 0 && improvedResume.trim());

  function assignFile(next: File | null) {
    setError(null);
    setAnalysis(null);
    setDecisions([]);
    setRewriteIndex(0);
    if (!next) {
      setFile(null);
      return;
    }
    if (!isAllowedFile(next)) {
      setError("Please upload a PDF, DOCX, or TXT file.");
      setFile(null);
      return;
    }
    if (next.size > 5 * 1024 * 1024) {
      setError("File is larger than 5 MB.");
      setFile(null);
      return;
    }
    rememberResume(next.name);
    setFile(next);
    void extractAndRememberResume(next).catch(() => undefined);
  }

  function onBrowseChange(e: ChangeEvent<HTMLInputElement>) {
    assignFile(e.target.files?.[0] ?? null);
    e.target.value = "";
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    assignFile(e.dataTransfer.files?.[0] ?? null);
  }

  async function runAnalyze(e?: FormEvent) {
    e?.preventDefault();
    if (!file) {
      setError("Upload a resume before analyzing.");
      return;
    }
    setAnalyzing(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("resume", file);
      if (jd.trim()) body.append("jobDescription", jd.trim());

      const res = await fetch("/api/resume/analyze", {
        method: "POST",
        body,
      });
      const data = (await res.json()) as ResumeAnalysis & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Analysis failed.");
      }
      setAnalysis(data);
      setDecisions(data.rewrites.map(() => "pending"));
      setRewriteIndex(0);
      setTab("editor");
    } catch (err) {
      setAnalysis(null);
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  }

  function setDecision(index: number, decision: RewriteDecision) {
    setDecisions((prev) => prev.map((d, i) => (i === index ? decision : d)));
    if (decision === "accepted") {
      setTab("improved");
    }
  }

  function handleExport() {
    if (!canExport) {
      setError("Accept at least one AI rewrite before exporting.");
      return;
    }
    setError(null);
    downloadTextFile(exportFileName(file?.name), improvedResume);
  }

  const activeRewrite = analysis?.rewrites[rewriteIndex];
  const activeDecision = decisions[rewriteIndex] ?? "pending";

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Resume Tailor
          </h1>
          <p className="mt-1 text-sm text-muted">
            Upload a resume, optionally paste a job description, then get ATS
            scores, missing keywords, skills, and AI rewrites.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="gradient"
            size="sm"
            loading={analyzing}
            disabled={!file || analyzing}
            onClick={() => void runAnalyze()}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {analyzing ? "Analyzing…" : "Analyze with AI"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canExport}
            onClick={handleExport}
            title={
              canExport
                ? "Download improved resume"
                : "Accept at least one rewrite to export"
            }
          >
            <Download className="h-3.5 w-3.5" />
            Export
            {acceptedCount > 0 ? ` (${acceptedCount})` : ""}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <Card
            className={cn(
              "border-dashed p-8 text-center transition-colors",
              dragOver && "border-primary bg-[var(--primary-muted)]/30"
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary-muted)] text-primary">
              <Upload className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-medium">Drag & drop your resume</p>
            <p className="mt-1 text-xs text-subtle">PDF, DOCX, or TXT · Max 5 MB</p>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              className="hidden"
              onChange={onBrowseChange}
            />
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              type="button"
              onClick={() => inputRef.current?.click()}
            >
              <FileUp className="h-3.5 w-3.5" />
              Browse files
            </Button>
            {file ? (
              <p className="mt-3 text-xs text-teal-400">
                {file.name} · {(file.size / 1024).toFixed(1)} KB ready
              </p>
            ) : (
              <p className="mt-3 text-xs text-subtle">No file selected yet</p>
            )}
            {file && (
              <button
                type="button"
                className="mt-2 text-xs text-muted underline-offset-2 hover:underline"
                onClick={() => assignFile(null)}
              >
                Clear file
              </button>
            )}
          </Card>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <Tabs
            tabs={[
              { id: "editor", label: "Side-by-side" },
              { id: "improved", label: `Improved resume${acceptedCount ? ` · ${acceptedCount}` : ""}` },
              { id: "jd", label: "Job description (optional)" },
            ]}
            active={tab}
            onChange={setTab}
          />

          {tab === "jd" ? (
            <Card className="p-4">
              <form onSubmit={(e) => void runAnalyze(e)}>
                <label className="text-sm font-medium" htmlFor="job-description">
                  Job description <span className="text-subtle">(optional)</span>
                </label>
                <p className="mt-1 text-xs text-subtle">
                  Paste a JD to improve match scoring and keyword gaps. Leave blank
                  for general ATS / rewrite feedback.
                </p>
                <textarea
                  id="job-description"
                  value={jd}
                  onChange={(e) => setJd(e.target.value)}
                  rows={10}
                  placeholder="Paste the job description here…"
                  className="mt-2 w-full resize-y rounded-xl border border-[var(--border-strong)] bg-[var(--background-elevated)] p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-[var(--primary-muted)]"
                />
                <Button
                  className="mt-3"
                  variant="primary"
                  size="sm"
                  type="submit"
                  loading={analyzing}
                  disabled={!file || analyzing}
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Analyzing…
                    </>
                  ) : (
                    "Analyze match"
                  )}
                </Button>
              </form>
            </Card>
          ) : tab === "improved" ? (
            <Card className="p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Fresh improved resume</p>
                  <p className="text-xs text-subtle">
                    Accepted rewrites replace the original Summary, Experience,
                    Projects, and Skills excerpts.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!canExport}
                  onClick={handleExport}
                >
                  <Download className="h-3.5 w-3.5" />
                  Export .txt
                </Button>
              </div>
              {analysis ? (
                <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--background-elevated)] p-4 text-sm leading-relaxed text-muted">
                  {improvedResume || analysis.resumeText || analysis.resumePreview}
                </pre>
              ) : (
                <p className="text-sm text-subtle">
                  Analyze a resume and accept rewrites to build an improved version here.
                </p>
              )}
              {analysis && acceptedCount === 0 && (
                <p className="mt-3 text-xs text-amber-200/90">
                  Accept one or more AI rewrites to update this draft, then use Export.
                </p>
              )}
            </Card>
          ) : (
            <div className="space-y-3">
              {analysis?.summary && (
                <Card className="p-4 text-sm leading-relaxed text-muted">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-subtle">
                    AI summary
                  </p>
                  {analysis.summary}
                  {!analysis.usedJobDescription && (
                    <p className="mt-2 text-xs text-amber-200/90">
                      No job description provided — scores reflect general ATS readiness.
                    </p>
                  )}
                </Card>
              )}

              {analysis && analysis.rewrites.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {analysis.rewrites.map((r, i) => (
                    <button
                      key={`${r.section}-${i}`}
                      type="button"
                      onClick={() => setRewriteIndex(i)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs",
                        i === rewriteIndex
                          ? "border-primary bg-[var(--primary-muted)] text-primary"
                          : "border-[var(--border)] text-muted hover:border-[var(--border-strong)]"
                      )}
                    >
                      {r.section}
                      {decisions[i] === "accepted"
                        ? " · accepted"
                        : decisions[i] === "rejected"
                          ? " · rejected"
                          : ""}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                <Card className="p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">
                    Original
                  </p>
                  <p className="text-sm leading-relaxed text-muted whitespace-pre-wrap">
                    {activeRewrite?.original ||
                      analysis?.resumePreview ||
                      "Upload and analyze a resume to see excerpts here."}
                  </p>
                </Card>
                <Card
                  className={cn(
                    "p-4",
                    activeDecision === "accepted" &&
                      "border-teal-500/30 bg-teal-500/5",
                    activeDecision === "pending" && analysis && "glow-border"
                  )}
                >
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">
                    AI rewrite
                  </p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {activeRewrite?.rewritten ||
                      "AI rewrites will appear after analysis."}
                  </p>
                  {activeRewrite && (
                    <div className="mt-4 flex gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => setDecision(rewriteIndex, "accepted")}
                        disabled={activeDecision === "accepted"}
                      >
                        <Check className="h-3.5 w-3.5" />
                        {activeDecision === "accepted" ? "Accepted" : "Accept"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDecision(rewriteIndex, "rejected")}
                      >
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card className="flex flex-col items-center p-5">
            <CardTitle className="mb-4 self-start">Match scores</CardTitle>
            <Gauge value={analysis?.matchScore ?? 0} label="AI Match" />
            <div className="mt-6 w-full space-y-3">
              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-muted">ATS Score</span>
                  <span>{analysis?.atsScore ?? 0}</span>
                </div>
                <Progress value={analysis?.atsScore ?? 0} />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-muted">Keyword coverage</span>
                  <span>{analysis?.keywordCoverage ?? 0}</span>
                </div>
                <Progress value={analysis?.keywordCoverage ?? 0} />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader>
              <CardTitle>Missing keywords</CardTitle>
            </CardHeader>
            <div className="flex flex-wrap gap-1.5">
              {(analysis?.missingKeywords?.length
                ? analysis.missingKeywords
                : ["Upload a resume to see gaps"]
              ).map((k) => (
                <Badge key={k} variant={analysis ? "warning" : "default"}>
                  {k}
                </Badge>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader>
              <CardTitle>Suggested skills</CardTitle>
            </CardHeader>
            <div className="flex flex-wrap gap-1.5">
              {(analysis?.suggestedSkills?.length
                ? analysis.suggestedSkills
                : ["Skills appear after analysis"]
              ).map((k) => (
                <Badge key={k} variant={analysis ? "info" : "default"}>
                  {k}
                </Badge>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
