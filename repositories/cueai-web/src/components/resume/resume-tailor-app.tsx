"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, Eye, FileUp, Pencil, RotateCcw, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { docxBlob, downloadBlob } from "@cueai/export-service/exportDocument";
import { extractAndRememberResume, rememberResume } from "@/lib/resume-store";
import { resumeDocumentXml } from "@/lib/resume/docx";
import { layoutResume } from "@/lib/resume/layout";
import { getMeasurer, resumeFileName, type ResumeMeasurer } from "@/lib/resume/pdf";
import { applyRewrites } from "@/lib/resume/rewrites";
import { TEMPLATES } from "@/lib/resume/templates";
import type { ResumeRewrite, StructuredResume, TemplateId } from "@/lib/resume/types";
import { ResumeEditor } from "./resume-editor";
import { ResumePageSvg } from "./resume-page-svg";

type Analysis = {
  resume: StructuredResume;
  rewriteSet: ResumeRewrite[];
};

type Status = { kind: "success" | "error"; text: string };

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];
const MAX_BYTES = 5 * 1024 * 1024;

function isAllowedFile(file: File) {
  return ACCEPTED_TYPES.includes(file.type) || /\.(pdf|docx|txt)$/i.test(file.name);
}

export default function ResumeTailorApp() {
  const inputRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);

  const [file, setFile] = useState<File | null>(null);
  const [jd, setJd] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzedKey, setAnalyzedKey] = useState("");
  const [showInputs, setShowInputs] = useState(true);

  const [edited, setEdited] = useState<StructuredResume | null>(null);
  const [editing, setEditing] = useState(false);
  const [editPending, setEditPending] = useState(false);
  const [template, setTemplate] = useState<TemplateId>(TEMPLATES[0]!.id);
  const [browse, setBrowse] = useState(0);

  const [measurer, setMeasurer] = useState<ResumeMeasurer | null>(null);
  const [measurerFailed, setMeasurerFailed] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    getMeasurer()
      .then((m) => alive && setMeasurer(m))
      .catch(() => alive && setMeasurerFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!previewOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setPreviewOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewOpen]);

  const requestKey = file ? `${file.name}|${file.size}|${file.lastModified}|${jd.trim()}` : "";
  const upToDate = Boolean(analysis && analyzedKey === requestKey);

  /** Valid rewrites are applied automatically; lines that failed the fact checks keep their original text. */
  const tailored = useMemo(() => (analysis ? applyRewrites(analysis.resume, analysis.rewriteSet) : null), [analysis]);
  const appliedCount = analysis?.rewriteSet.filter((r) => r.valid).length ?? 0;
  const finalResume = edited ?? tailored;

  const browsed = TEMPLATES[browse]!;
  const selected = TEMPLATES.find((t) => t.id === template)!;

  const layout = useMemo(
    () => (measurer && finalResume ? layoutResume(finalResume, template, measurer) : null),
    [measurer, finalResume, template],
  );
  const thumbLayout = useMemo(() => {
    if (!measurer || !finalResume) return null;
    return browsed.id === template ? layout : layoutResume(finalResume, browsed.id, measurer);
  }, [measurer, finalResume, browsed.id, template, layout]);

  const unsupportedChars = layout && measurer ? [...measurer.unsupported] : [];
  const exportReady = Boolean(layout && finalResume && !editPending && !exporting);

  function assignFile(next: File | null) {
    setError(null);
    if (!next) return;
    if (!isAllowedFile(next)) {
      setError("Please upload a PDF, DOCX, or TXT file.");
      return;
    }
    if (next.size > MAX_BYTES) {
      setError("File is larger than 5 MB.");
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
    if (inFlight.current) return;
    if (!file) {
      setError("Upload a resume to continue.");
      return;
    }
    if (upToDate) {
      setShowInputs(false);
      return;
    }
    inFlight.current = true;
    setAnalyzing(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("resume", file);
      if (jd.trim()) body.append("jobDescription", jd.trim());
      const res = await fetch("/api/resume/analyze", { method: "POST", body, credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as Partial<Analysis> & { error?: string };
      if (!res.ok || !data.resume) throw new Error(data.error || "We couldn't tailor your resume. Please try again.");
      // Results are replaced only after a successful run, so a failed retry never clears a finished resume.
      setAnalysis({ resume: data.resume, rewriteSet: data.rewriteSet ?? [] });
      setAnalyzedKey(requestKey);
      setEdited(null);
      setEditing(false);
      setStatus(null);
      setShowInputs(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't tailor your resume. Please try again.");
    } finally {
      inFlight.current = false;
      setAnalyzing(false);
    }
  }

  function step(delta: number) {
    setBrowse((i) => (i + delta + TEMPLATES.length) % TEMPLATES.length);
  }

  function onCarouselKey(e: KeyboardEvent<HTMLElement>) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    }
  }

  function selectBrowsed() {
    setTemplate(browsed.id);
    setStatus(null);
  }

  async function downloadPdf() {
    if (!finalResume || !exportReady) return;
    setExporting("pdf");
    setStatus(null);
    try {
      const res = await fetch("/api/resume/pdf", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: finalResume, template }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Could not generate the PDF.");
      }
      const blob = await res.blob();
      if (!blob.type.includes("pdf") || blob.size < 500) throw new Error("The server did not return a PDF.");
      const filename =
        /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || resumeFileName(finalResume.name);
      downloadBlob(filename, blob);
      setStatus({ kind: "success", text: `Downloaded ${filename}` });
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof Error ? err.message : "Could not generate the PDF." });
    } finally {
      setExporting(null);
    }
  }

  function downloadDocx() {
    if (!finalResume || !layout || !exportReady) return;
    setExporting("docx");
    setStatus(null);
    try {
      const filename = resumeFileName(finalResume.name, "docx");
      downloadBlob(filename, docxBlob(resumeDocumentXml(layout)));
      setStatus({ kind: "success", text: `Downloaded ${filename}` });
    } catch {
      setStatus({ kind: "error", text: "Could not generate the Word document." });
    } finally {
      setExporting(null);
    }
  }

  const pagesLabel = layout ? `${layout.pages.length} page${layout.pages.length === 1 ? "" : "s"}` : "";

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Resume Tailor</h1>
          <p className="mt-1 text-sm text-muted">Tailor your resume to a job and download it as an ATS-friendly PDF or Word file.</p>
        </div>
        {analysis && !showInputs && (
          <Button variant="outline" size="sm" onClick={() => setShowInputs(true)}>
            <RotateCcw className="h-3.5 w-3.5" />
            New resume or job
          </Button>
        )}
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <span>{error}</span>
          {file && !analyzing && showInputs && (
            <Button size="sm" variant="outline" onClick={() => void runAnalyze()}>
              Try again
            </Button>
          )}
        </div>
      )}

      {showInputs && (
        <Card className="p-5">
          <form onSubmit={(e) => void runAnalyze(e)} className="grid gap-4 md:grid-cols-2">
            <div
              className={cn(
                "flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-strong)] p-6 text-center transition-colors",
                dragOver && "border-primary bg-[var(--primary-muted)]/30",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--primary-muted)] text-primary">
                <Upload className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-medium">Upload resume</p>
              <p className="mt-1 text-xs text-subtle">PDF, DOCX, or TXT · Max 5 MB</p>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                className="hidden"
                onChange={onBrowseChange}
              />
              <Button variant="outline" size="sm" className="mt-4" type="button" onClick={() => inputRef.current?.click()}>
                <FileUp className="h-3.5 w-3.5" />
                Browse files
              </Button>
              <p className={cn("mt-3 break-all text-xs", file ? "text-teal-400" : "text-subtle")}>
                {file ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB` : "No file selected yet"}
              </p>
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-medium" htmlFor="job-description">
                Job description
              </label>
              <textarea
                id="job-description"
                value={jd}
                onChange={(e) => setJd(e.target.value)}
                rows={8}
                maxLength={20000}
                placeholder="Paste the job description here…"
                className="mt-2 w-full flex-1 resize-y rounded-xl border border-[var(--border-strong)] bg-[var(--background-elevated)] p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-[var(--primary-muted)]"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="gradient" size="sm" type="submit" loading={analyzing} disabled={!file || analyzing}>
                  <Sparkles className="h-3.5 w-3.5" />
                  {analyzing ? "Tailoring your resume…" : upToDate ? "Back to resume" : "Tailor my resume"}
                </Button>
                {analysis && !analyzing && !upToDate && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowInputs(false)}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </form>
        </Card>
      )}

      {analysis && finalResume && !showInputs && (
        <>
          <section
            aria-roledescription="carousel"
            aria-label="ATS resume templates"
            onKeyDown={onCarouselKey}
            className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-5"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <h2 className="text-base font-semibold">Choose Your ATS Resume Template</h2>
              <span className="text-xs tabular-nums text-subtle" aria-live="polite">
                {browse + 1} of {TEMPLATES.length}
              </span>
            </div>
            <div className="grid items-center gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
              <div className="flex min-w-0 items-center justify-center gap-1.5 sm:gap-3">
                <Button variant="outline" size="icon" className="shrink-0" onClick={() => step(-1)} aria-label="Previous template">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <button
                  type="button"
                  onClick={selectBrowsed}
                  aria-label={`${browsed.name}, template ${browse + 1} of ${TEMPLATES.length}${browsed.id === template ? ", selected" : ". Select this template"}`}
                  className={cn(
                    "w-[300px] min-w-0 max-w-full shrink overflow-hidden rounded-lg bg-white shadow-lg ring-offset-2 ring-offset-[var(--background)] transition",
                    browsed.id === template ? "ring-2 ring-primary" : "ring-1 ring-[var(--border)] hover:ring-[var(--border-strong)]",
                  )}
                >
                  {thumbLayout?.pages[0] ? (
                    <ResumePageSvg layout={thumbLayout} page={thumbLayout.pages[0]} className="block w-full" title={`${browsed.name} preview`} />
                  ) : (
                    <div className="flex aspect-[595/842] items-center justify-center text-xs text-neutral-500">
                      {measurerFailed ? "Preview unavailable" : "Loading…"}
                    </div>
                  )}
                </button>
                <Button variant="outline" size="icon" className="shrink-0" onClick={() => step(1)} aria-label="Next template">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="min-w-0 space-y-3 text-center lg:text-left">
                <div>
                  <p className="text-lg font-semibold">{browsed.name}</p>
                  <p className="mt-1 text-sm text-muted">{browsed.useCase}</p>
                </div>
                <ul className="space-y-1 text-xs text-subtle">
                  {browsed.characteristics.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <Button
                  size="sm"
                  variant={browsed.id === template ? "secondary" : "gradient"}
                  onClick={selectBrowsed}
                  disabled={browsed.id === template}
                  aria-pressed={browsed.id === template}
                >
                  {browsed.id === template ? "Selected" : "Select Template"}
                </Button>
                <div className="flex justify-center gap-1.5 pt-1 lg:justify-start">
                  {TEMPLATES.map((t, i) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setBrowse(i)}
                      aria-label={`Show ${t.name}`}
                      aria-current={i === browse}
                      className={cn(
                        "h-2 rounded-full transition-all",
                        i === browse ? "w-5 bg-primary" : "w-2 bg-[var(--border-strong)] hover:bg-[var(--muted)]",
                        t.id === template && i !== browse && "bg-primary/50",
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Final Resume Preview</h2>
                <p className="mt-0.5 text-xs text-subtle">
                  {selected.name}
                  {pagesLabel && ` · ${pagesLabel}`}
                  {appliedCount > 0 && ` · ${appliedCount} AI improvement${appliedCount === 1 ? "" : "s"} applied`}
                  {edited && " · edited"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)} disabled={!layout}>
                  <Eye className="h-3.5 w-3.5" />
                  Preview Resume
                </Button>
                <Button size="sm" variant={editing ? "secondary" : "outline"} onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
                  <Pencil className="h-3.5 w-3.5" />
                  {editing ? "Close Editor" : "Edit Content"}
                </Button>
                <Button size="sm" variant="gradient" onClick={() => void downloadPdf()} loading={exporting === "pdf"} disabled={!exportReady}>
                  <Download className="h-3.5 w-3.5" />
                  {exporting === "pdf" ? "Generating…" : "Download PDF"}
                </Button>
                <Button size="sm" variant="outline" onClick={downloadDocx} loading={exporting === "docx"} disabled={!exportReady}>
                  <Download className="h-3.5 w-3.5" />
                  Download DOCX
                </Button>
              </div>
            </div>

            {status && (
              <p role="status" className={cn("mb-3 text-sm", status.kind === "success" ? "text-emerald-400" : "text-red-300")}>
                {status.text}
              </p>
            )}
            {unsupportedChars.length > 0 && (
              <p className="mb-3 text-xs text-amber-400">
                Some characters can&apos;t be shown in the PDF fonts and appear as “?”: {unsupportedChars.join(" ")}. The DOCX keeps them.
              </p>
            )}

            {editing && (
              <div className="mb-4">
                <ResumeEditor
                  key={analyzedKey}
                  value={finalResume}
                  onChange={(next) => {
                    setEdited(next);
                    setStatus(null);
                  }}
                  onPendingChange={setEditPending}
                />
                {edited && (
                  <button
                    type="button"
                    className="mt-2 text-xs text-subtle underline underline-offset-2 hover:text-muted"
                    onClick={() => {
                      setEdited(null);
                      setEditing(false);
                    }}
                  >
                    Discard my edits
                  </button>
                )}
              </div>
            )}

            {layout ? (
              <div className="space-y-4 rounded-xl bg-black/20 p-3 sm:p-5">
                {layout.pages.map((p, i) => (
                  <ResumePageSvg key={i} layout={layout} page={p} title={`Page ${i + 1}`} className="mx-auto block w-full max-w-[760px] shadow-lg" />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">{measurerFailed ? "Preview unavailable. Refresh and try again." : "Preparing preview…"}</p>
            )}
          </section>
        </>
      )}

      {previewOpen &&
        layout &&
        createPortal(
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4 sm:p-8"
            role="dialog"
            aria-modal="true"
            aria-label="Resume preview"
            onClick={() => setPreviewOpen(false)}
          >
            <div className="mx-auto max-w-[860px] space-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-white">
                  {selected.name} · {pagesLabel}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="gradient" onClick={() => void downloadPdf()} loading={exporting === "pdf"} disabled={!exportReady}>
                    <Download className="h-3.5 w-3.5" />
                    Download PDF
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setPreviewOpen(false)} autoFocus>
                    <X className="h-3.5 w-3.5" />
                    Close
                  </Button>
                </div>
              </div>
              {layout.pages.map((p, i) => (
                <ResumePageSvg key={i} layout={layout} page={p} title={`Page ${i + 1}`} className="block w-full shadow-2xl" />
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
