"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Check, Download, Eye, FileText, Pencil, RefreshCw, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { docxBlob, downloadBlob } from "@cueai/export-service/exportDocument";
import type { ResumeAnalysisResult, TailoredResult } from "@/app/api/resume/analyze/route";
import { extractAndRememberResume, rememberResume } from "@/lib/resume-store";
import { formattingChecks, scoreResume } from "@/lib/resume/ats";
import { docxMatchesLayout, resumeDocumentXml } from "@/lib/resume/docx";
import { fitResume } from "@/lib/resume/fit";
import {
  JOB_DESCRIPTION_MAX_CHARS,
  JOB_DESCRIPTION_REQUIRED_MESSAGE,
  composeJobDescription,
  normalizeJobDescription,
} from "@/lib/resume/job-description";
import { layoutResume } from "@/lib/resume/layout";
import { getMeasurer, resumeFileName, type ResumeMeasurer } from "@/lib/resume/pdf";
import { TEMPLATES } from "@/lib/resume/templates";
import type { MatchReport, Recommendation, StructuredResume, TemplateId } from "@/lib/resume/types";
import { FullAnalysis, MatchSummary, type PanelBusy } from "./ats-analysis-panel";
import { ResumeEditor } from "./resume-editor";
import { ResumePageSvg } from "./resume-page-svg";
import { StepIndicator, TailorSteps, previewContent, tailorSteps, workflowSteps } from "./tailor-progress";

type Status = { kind: "success" | "error"; text: string };
type Keyed<T> = { key: string; data: T };
type Rescore = { key: string; match: MatchReport; recommendations: Recommendation[]; at: string };
type Stage = "analyze" | "rewrite";

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];
const MAX_BYTES = 5 * 1024 * 1024;
const CARD = "rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6";
const INPUT =
  "w-full rounded-xl border border-[var(--border-strong)] bg-[var(--background-elevated)] px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-[var(--primary-muted)]";

function isAllowedFile(file: File) {
  return ACCEPTED_TYPES.includes(file.type) || /\.(pdf|docx|txt)$/i.test(file.name);
}

function fileKind(file: File) {
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1];
  return ext ? ext.toUpperCase() : file.type || "File";
}

class StageError extends Error {
  constructor(
    readonly stage: Stage,
    message: string,
  ) {
    super(message);
  }
}

async function readError(res: Response, fallback: string) {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error || fallback;
}

export default function ResumeTailorApp() {
  const inputRef = useRef<HTMLInputElement>(null);
  /** Increments per request; responses from an older request are ignored. */
  const requestSeq = useRef(0);
  const inputKeyRef = useRef("");

  const [file, setFile] = useState<File | null>(null);
  const [jd, setJd] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jdError, setJdError] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [showInputs, setShowInputs] = useState(true);

  // Separate state: the original (inside the analysis), the analysis, the tailored version,
  // manual edits, a re-check of edited content, and the presentation template.
  const [analysis, setAnalysis] = useState<Keyed<ResumeAnalysisResult> | null>(null);
  const [tailored, setTailored] = useState<Keyed<TailoredResult> | null>(null);
  const [edited, setEdited] = useState<StructuredResume | null>(null);
  const [rescore, setRescore] = useState<Rescore | null>(null);
  const [busy, setBusy] = useState<PanelBusy>(null);
  const [phase, setPhase] = useState<Stage | null>(null);
  const [failedAt, setFailedAt] = useState<Stage | null>(null);
  const [failure, setFailure] = useState<{ text: string; retry: () => void } | null>(null);

  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editPending, setEditPending] = useState(false);
  const [template, setTemplate] = useState<TemplateId>(TEMPLATES[0]!.id);

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

  const jobDescription = composeJobDescription(jd, jobTitle, company);
  const inputKey = file ? `${file.name}|${file.size}|${file.lastModified}|${jobDescription ?? ""}` : "";
  useEffect(() => {
    inputKeyRef.current = inputKey;
  }, [inputKey]);

  const stale = Boolean(analysis && analysis.key !== inputKey);
  const tailoredCurrent = tailored && analysis && tailored.key === analysis.key ? tailored : null;
  const { resume: current, kind: contentKind } = previewContent<StructuredResume>({
    edited,
    tailored: tailoredCurrent?.data.resume ?? null,
    original: analysis?.data.resume ?? null,
  });
  const contentKey = `${analysis?.key ?? ""}|${tailoredCurrent?.data.tailoredAt ?? "original"}`;

  const rescoreCurrent = rescore && rescore.key === `${contentKey}|${edited ? JSON.stringify(edited) : ""}` ? rescore : null;
  // After manual edits the last score stays visible (marked outdated) until it is re-checked.
  const report: MatchReport | null = rescoreCurrent?.match ?? tailoredCurrent?.data.match ?? analysis?.data.match ?? null;
  const recommendations = rescoreCurrent?.recommendations ?? tailoredCurrent?.data.recommendations ?? analysis?.data.recommendations ?? [];
  const scoreSource = rescoreCurrent ? "reanalyzed" : tailoredCurrent ? "tailored" : "original";
  const requirementWhy = useMemo(() => new Map((analysis?.data.job.requirements ?? []).map((r) => [r.id, r.why])), [analysis]);
  const formatting = useMemo(() => (current ? { score: scoreResume(current, [], false).formatting, checks: formattingChecks(current) } : null), [current]);

  const selected = TEMPLATES.find((t) => t.id === template)!;
  const fit = useMemo(() => (measurer && current ? fitResume(current, template, measurer) : null), [measurer, current, template]);
  const layout = fit?.layout ?? null;
  const thumbs = useMemo(() => {
    if (!measurer || !current) return null;
    return new Map(TEMPLATES.map((t) => [t.id, t.id === template && layout ? layout : layoutResume(current, t.id, measurer)]));
  }, [measurer, current, template, layout]);

  const unsupportedChars = layout && measurer ? [...measurer.unsupported] : [];
  const exportReady = Boolean(layout && current && fit?.validation.ok && !editPending && !exporting);
  const analyzedNow = Boolean(analysis && !stale);
  const scorable = analysis?.data.match.status === "scored";
  const tailoredValid = contentKind === "tailored" ? (fit ? fit.validation.ok : null) : null;

  function assignFile(next: File | null) {
    setFileError(null);
    if (!next) return;
    if (!isAllowedFile(next)) {
      setFileError("Please upload a PDF, DOCX, or TXT file.");
      return;
    }
    if (next.size > MAX_BYTES) {
      setFileError("File is larger than 5 MB.");
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

  function viewUploaded() {
    if (!file) return;
    const url = URL.createObjectURL(file);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  /** Common checks before any request. The uploaded file is kept when validation fails. */
  function ready(): boolean {
    if (!file) {
      setFileError("Upload a resume to continue.");
      return false;
    }
    if (!jobDescription) {
      setJdError(true);
      setShowInputs(true);
      return false;
    }
    return true;
  }

  async function postAnalyze(mode: "analyze" | "tailor") {
    const body = new FormData();
    body.append("resume", file!);
    body.append("jobDescription", jobDescription!);
    body.append("mode", mode);
    body.append("template", template);
    return fetch("/api/resume/analyze", { method: "POST", body, credentials: "include" });
  }

  /** A new analysis replaces the old one (and anything derived from it) only after it succeeds. */
  function adoptAnalysis(key: string, data: ResumeAnalysisResult) {
    setAnalysis({ key, data });
    setTailored(null);
    setEdited(null);
    setRescore(null);
    setEditing(false);
    setStatus(null);
    setShowInputs(false);
  }

  /** Analysis for the current inputs: reused when present, otherwise requested. */
  async function ensureAnalysis(seq: number, key: string): Promise<ResumeAnalysisResult | null> {
    if (analysis && analysis.key === key) return analysis.data;
    setPhase("analyze");
    const res = await postAnalyze("analyze");
    if (!res.ok) throw new StageError("analyze", await readError(res, "We couldn't analyze your resume. Please try again."));
    const data = (await res.json()) as ResumeAnalysisResult;
    if (!data.match || !data.resume) throw new StageError("analyze", "The analysis came back incomplete. Please try again.");
    if (seq !== requestSeq.current || key !== inputKeyRef.current) return null;
    adoptAnalysis(key, data);
    return data;
  }

  function begin(kind: PanelBusy) {
    setBusy(kind);
    setFailedAt(null);
    setFailure(null);
    setStatus(null);
  }

  function fail(seq: number, err: unknown, retry: () => void) {
    if (seq !== requestSeq.current) return;
    const stage = err instanceof StageError ? err.stage : "analyze";
    setFailedAt(stage);
    setFailure({ text: err instanceof Error ? err.message : "Something went wrong. Please try again.", retry });
  }

  function finish(seq: number) {
    if (seq !== requestSeq.current) return;
    setBusy(null);
    setPhase(null);
  }

  async function runAnalyze(e?: FormEvent) {
    e?.preventDefault();
    if (busy || !ready()) return;
    if (analysis && !stale) {
      setShowInputs(false);
      return;
    }
    const seq = ++requestSeq.current;
    begin("analyze");
    try {
      await ensureAnalysis(seq, inputKey);
    } catch (err) {
      fail(seq, err, () => void runAnalyze());
    } finally {
      finish(seq);
    }
  }

  /**
   * Analyze (reused when current), then rewrite for this job. The server caches the analysis, so this
   * never repeats an AI call. A failed attempt keeps the last valid tailored resume.
   */
  async function runTailor() {
    if (busy || !ready()) return;
    const seq = ++requestSeq.current;
    const key = inputKey;
    begin("tailor");
    try {
      const base = await ensureAnalysis(seq, key);
      // A JD too thin to score is explained in the summary, where Tailor stays disabled.
      if (!base || base.match.status !== "scored") return;
      setPhase("rewrite");
      const res = await postAnalyze("tailor");
      if (!res.ok) throw new StageError("rewrite", await readError(res, "We couldn't tailor your resume. Please try again."));
      const data = (await res.json()) as ResumeAnalysisResult & { tailored?: TailoredResult };
      const next = data.tailored;
      if (!next?.resume || !next.match || !next.changes?.length) {
        throw new StageError("rewrite", "Tailoring came back incomplete. Your previous resume is unchanged.");
      }
      if (next.jdHash !== base.jdHash || !next.changeCounts?.hasMeaningfulChanges) {
        throw new StageError("rewrite", "Tailoring did not produce a validated result for this job description. Your previous resume is unchanged.");
      }
      if (seq !== requestSeq.current || key !== inputKeyRef.current) return;
      setTailored({ key, data: next });
      setEdited(null);
      setRescore(null);
      setEditing(false);
      const made = next.changeCounts.rewritten + next.changeCounts.added;
      const before = base.match.score ?? 0;
      const after = next.match.score ?? before;
      setStatus({
        kind: "success",
        text:
          after > before
            ? `Resume validated: match improved from ${before} to ${after}, with ${made} content change${made === 1 ? "" : "s"}.`
            : `Resume validated with ${made} content change${made === 1 ? "" : "s"}; the match score remains ${after}. No score improvement is claimed.`,
      });
    } catch (err) {
      fail(seq, err, () => void runTailor());
    } finally {
      finish(seq);
    }
  }

  /** Same scoring on edited content against the same job profile (no AI call). */
  async function runRecheck() {
    if (busy || !analysis || !current || stale || !ready()) return;
    const seq = ++requestSeq.current;
    const key = `${contentKey}|${edited ? JSON.stringify(edited) : ""}`;
    begin("rescore");
    try {
      const res = await fetch("/api/resume/score", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: current, jobDescription, job: analysis.data.job }),
      });
      if (!res.ok) throw new StageError("analyze", await readError(res, "Re-checking the score failed. Please try again."));
      const data = (await res.json()) as { match?: MatchReport; recommendations?: Recommendation[]; analyzedAt?: string };
      if (!data.match) throw new StageError("analyze", "The score came back incomplete.");
      if (seq !== requestSeq.current) return;
      setRescore({ key, match: data.match, recommendations: data.recommendations ?? [], at: data.analyzedAt ?? new Date().toISOString() });
    } catch (err) {
      fail(seq, err, () => void runRecheck());
    } finally {
      finish(seq);
    }
  }

  async function downloadPdf() {
    if (!current || !fit || !exportReady) return;
    setExporting("pdf");
    setStatus(null);
    try {
      const res = await fetch("/api/resume/pdf", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: current, template }),
      });
      if (!res.ok) throw new Error(await readError(res, "Could not generate the PDF."));
      const blob = await res.blob();
      if (!blob.type.includes("pdf") || blob.size < 500) throw new Error("The server did not return a PDF.");
      const pages = Number(res.headers.get("X-Resume-Pages"));
      if (pages !== fit.pageCount) {
        throw new Error(`The generated PDF has ${pages || "an unknown number of"} page(s) but the preview shows ${fit.pageCount}. Please try again.`);
      }
      const filename = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || resumeFileName(current.name);
      downloadBlob(filename, blob);
      setStatus({ kind: "success", text: `Downloaded ${filename} (${pages} page${pages === 1 ? "" : "s"}).` });
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof Error ? err.message : "Could not generate the PDF." });
    } finally {
      setExporting(null);
    }
  }

  function downloadDocx() {
    if (!current || !layout || !exportReady) return;
    setExporting("docx");
    setStatus(null);
    try {
      const xml = resumeDocumentXml(layout);
      if (!docxMatchesLayout(xml, layout)) throw new Error("mismatch");
      const blob = docxBlob(xml);
      if (blob.size < 500) throw new Error("empty");
      const filename = resumeFileName(current.name, "docx");
      downloadBlob(filename, blob);
      setStatus({ kind: "success", text: `Downloaded ${filename}` });
    } catch {
      setStatus({ kind: "error", text: "Could not generate a Word document that matches the preview." });
    } finally {
      setExporting(null);
    }
  }

  const steps = workflowSteps({ hasFile: Boolean(file), analyzed: analyzedNow, downloadReady: analyzedNow && contentKind !== "original" && exportReady });
  const progress = tailorSteps({
    phase,
    failedAt,
    analyzed: analyzedNow && scorable,
    tailored: Boolean(tailoredCurrent) && !stale,
    rescored: tailoredCurrent?.data.match.status === "scored",
    documentValid: tailoredValid,
  });
  const showProgress = busy === "tailor" || failedAt !== null || (Boolean(tailoredCurrent) && tailoredValid !== true);
  const pagesLabel = fit ? `${fit.pageCount} page${fit.pageCount === 1 ? "" : "s"}` : "";
  const contentLabel = contentKind === "tailored" ? (tailoredValid ? "Tailored" : "Tailored · checking layout") : contentKind === "edited" ? "Edited" : "Original";
  const validatedChanges = scoreSource === "tailored" && tailoredCurrent ? tailoredCurrent.data.changeCounts.rewritten + tailoredCurrent.data.changeCounts.added : null;
  const metricPrompts = tailoredCurrent?.data.metricPrompts ?? [];
  const notices = [
    ...(analysis?.data.extraction?.warnings ?? []),
    ...(fit?.validation.warnings ?? []),
    ...(unsupportedChars.length ? [`Some characters can't be shown in the PDF fonts and appear as “?”: ${unsupportedChars.join(" ")}. The DOCX keeps them.`] : []),
  ];

  const tailorAction = (
    <Button variant="gradient" onClick={() => void runTailor()} loading={busy === "tailor"} disabled={busy !== null || !jobDescription || !file || (analyzedNow && !scorable)}>
      <Sparkles className="h-4 w-4" />
      {busy === "tailor" ? "Tailoring…" : tailoredCurrent ? "Tailor Again" : "Tailor My Resume"}
    </Button>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-up">
      <header className="space-y-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Resume Tailor</h1>
          <p className="mt-1 text-sm text-muted">Customize your resume for a job and download an ATS-friendly version.</p>
        </div>
        <StepIndicator steps={steps} />
      </header>

      {analysis && !showInputs && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--surface)] px-4 py-2.5 text-sm">
          <span className="min-w-0 truncate text-muted">
            <FileText className="mr-1.5 inline h-4 w-4 align-[-3px]" />
            {file?.name}
            {(jobTitle || analysis.data.job.title) && <span className="text-subtle"> · for {jobTitle || analysis.data.job.title}</span>}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setShowInputs(true)} disabled={busy !== null}>
            Change resume or job
          </Button>
        </div>
      )}

      {showInputs && (
        <form onSubmit={(e) => void runAnalyze(e)} className="grid gap-4 md:grid-cols-2">
          <section aria-label="Your resume" className={CARD}>
            <h2 className="text-base font-semibold">Your Resume</h2>
            {file ? (
              <div className="mt-4 space-y-4">
                <div className="flex items-center gap-3 rounded-xl bg-[var(--background-elevated)] p-3">
                  <FileText className="h-8 w-8 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-subtle">
                      {fileKind(file)} · {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                    <Upload className="h-3.5 w-3.5" />
                    Replace Resume
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={viewUploaded}>
                    <Eye className="h-3.5 w-3.5" />
                    View Resume
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className={cn(
                  "mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-strong)] px-4 py-10 text-center transition-colors",
                  dragOver && "border-primary bg-[var(--primary-muted)]/30",
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
              >
                <Upload className="h-6 w-6 text-primary" />
                <p className="mt-2 text-sm">Drag your resume here</p>
                <p className="mt-0.5 text-xs text-subtle">PDF, DOCX or TXT · up to 5 MB</p>
                <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => inputRef.current?.click()}>
                  Browse files
                </Button>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              className="hidden"
              onChange={onBrowseChange}
            />
            {fileError && (
              <p role="alert" className="mt-3 text-xs text-red-400">
                {fileError}
              </p>
            )}
          </section>

          <section aria-label="Job description" className={cn(CARD, "flex flex-col")}>
            <label className="text-base font-semibold" htmlFor="job-description">
              Job Description{" "}
              <span className="text-red-400" aria-hidden>
                *
              </span>
            </label>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <input className={INPUT} placeholder="Job title (optional)" aria-label="Job title (optional)" value={jobTitle} maxLength={120} onChange={(e) => setJobTitle(e.target.value)} />
              <input className={INPUT} placeholder="Company (optional)" aria-label="Company (optional)" value={company} maxLength={120} onChange={(e) => setCompany(e.target.value)} />
            </div>
            <textarea
              id="job-description"
              value={jd}
              onChange={(e) => {
                setJd(e.target.value);
                if (e.target.value.trim()) setJdError(false);
              }}
              onBlur={() => setJdError(!normalizeJobDescription(jd) && Boolean(jd))}
              rows={9}
              maxLength={JOB_DESCRIPTION_MAX_CHARS}
              aria-required="true"
              aria-invalid={jdError}
              aria-describedby="job-description-help"
              placeholder="Paste the full job description, including requirements and responsibilities…"
              className={cn(INPUT, "mt-2 flex-1 resize-y p-3", jdError && "border-red-500/60")}
            />
            <p id="job-description-help" role={jdError ? "alert" : undefined} className={cn("mt-1.5 text-xs", jdError ? "text-red-400" : "text-subtle")}>
              {jdError ? `Please paste a job description. ${JOB_DESCRIPTION_REQUIRED_MESSAGE}` : "Required. The more complete the description, the better the match."}
            </p>
            {failure && !analysis && (
              <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-200">
                <span>
                  <span className="font-medium">Analysis unavailable.</span> {failure.text}
                </span>
                <Button size="sm" variant="outline" onClick={failure.retry} disabled={busy !== null}>
                  Retry
                </Button>
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="gradient" type="submit" loading={busy === "analyze"} disabled={!file || !jobDescription || busy !== null}>
                {busy === "analyze" ? "Analyzing…" : analyzedNow ? "Continue" : "Analyze & Continue"}
              </Button>
              {analysis && busy === null && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowInputs(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </section>
        </form>
      )}

      {analysis && report && current && (
        <>
          <MatchSummary
            report={report}
            originalReport={analysis.data.match}
            recommendations={recommendations}
            scoreSource={scoreSource}
            outdated={stale ? "inputs" : edited && !rescoreCurrent ? "edited" : null}
            validatedChanges={validatedChanges}
            action={
              edited && !rescoreCurrent && !stale ? (
                <Button variant="outline" onClick={() => void runRecheck()} loading={busy === "rescore"} disabled={busy !== null}>
                  <RefreshCw className="h-4 w-4" />
                  Re-check score
                </Button>
              ) : (
                tailorAction
              )
            }
          >
            {showProgress && (
              <div className="mt-4 border-t border-[var(--border)] pt-4">
                <TailorSteps steps={progress} />
              </div>
            )}
            {failure && analysis && (
              <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-200">
                <span className="min-w-0">{failure.text}</span>
                <Button size="sm" variant="outline" onClick={failure.retry} disabled={busy !== null}>
                  Retry
                </Button>
              </div>
            )}
          </MatchSummary>

          <FullAnalysis
            open={analysisOpen}
            onToggle={() => setAnalysisOpen((v) => !v)}
            report={report}
            originalReport={analysis.data.match}
            scoreSource={scoreSource}
            recommendations={recommendations}
            requirementWhy={requirementWhy}
            changes={tailoredCurrent?.data.changes ?? null}
            formatting={formatting}
          />

          <section aria-label="Resume template" className={CARD}>
            <h2 className="text-base font-semibold">Template</h2>
            <p className="mt-0.5 text-xs text-subtle">Changes the look only — your content stays the same.</p>
            <div role="radiogroup" aria-label="Resume templates" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {TEMPLATES.map((t) => {
                const thumb = thumbs?.get(t.id);
                const isSelected = t.id === template;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => {
                      setTemplate(t.id);
                      setStatus(null);
                    }}
                    className={cn(
                      "group relative rounded-xl p-2 text-left transition-colors",
                      isSelected ? "bg-[var(--primary-muted)] ring-2 ring-primary" : "hover:bg-[var(--surface-hover)]",
                    )}
                  >
                    <div className="overflow-hidden rounded-md bg-white shadow-sm">
                      {thumb?.pages[0] ? (
                        <ResumePageSvg layout={thumb} page={thumb.pages[0]} className="block w-full" title={`${t.name} preview`} />
                      ) : (
                        <div className="flex aspect-[595/842] items-center justify-center text-[10px] text-neutral-500">{measurerFailed ? "Unavailable" : "Loading…"}</div>
                      )}
                    </div>
                    <p className="mt-2 text-xs font-medium leading-tight">{t.name}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-subtle">{t.useCase}</p>
                    {isSelected && (
                      <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                        <Check className="h-3 w-3" aria-label="Selected" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-label="Final resume" className={CARD}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Final Resume</h2>
                <p className="mt-0.5 text-xs text-subtle">
                  <span className={cn("font-medium", contentKind === "original" ? "text-amber-300" : "text-foreground")}>{contentLabel}</span>
                  {" · "}
                  {selected.name}
                  {pagesLabel && ` · ${pagesLabel}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => setPreviewOpen(true)} disabled={!layout}>
                  <Eye className="h-3.5 w-3.5" />
                  Preview Resume
                </Button>
                <Button size="sm" variant={editing ? "secondary" : "ghost"} onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
                  <Pencil className="h-3.5 w-3.5" />
                  {editing ? "Close Editor" : "Edit Content"}
                </Button>
              </div>
            </div>

            {contentKind === "original" && (
              <p className="mt-3 text-sm text-muted">
                {busy === "tailor"
                  ? "Tailoring in progress — this still shows your original resume."
                  : "This is your original resume. Use Tailor My Resume to rewrite it for this job."}
              </p>
            )}
            {fit && !fit.validation.ok && (
              <p role="alert" className="mt-3 text-sm text-red-300">
                Layout check failed: {fit.validation.issues[0]} Downloads are disabled until this is fixed.
              </p>
            )}
            {metricPrompts.length > 0 && contentKind === "tailored" && (
              <p className="mt-3 text-xs text-amber-200">
                Tip: add real numbers to {metricPrompts.length === 1 ? "one bullet" : `${metricPrompts.length} bullets`} if you have them. CueAI never invents metrics.
              </p>
            )}
            {contentKind === "tailored" &&
              (tailoredCurrent?.data.duplicateReview ?? []).map((d) => (
                <p key={`${d.first}|${d.second}`} className="mt-2 text-xs text-amber-200">
                  Possible duplicate: {d.first} and {d.second}. Both are kept — remove one with Edit Content if needed.
                </p>
              ))}
            {notices.map((n) => (
              <p key={n} className="mt-2 text-xs text-amber-300">
                {n}
              </p>
            ))}

            {editing && (
              <div className="mt-4">
                <ResumeEditor
                  key={contentKey}
                  value={current}
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

            <div className="mt-4 space-y-4 rounded-xl bg-black/20 p-3 sm:p-5">
              {layout ? (
                layout.pages.map((p, i) => (
                  <ResumePageSvg key={i} layout={layout} page={p} title={`Page ${i + 1}`} className="mx-auto block w-full max-w-[640px] shadow-lg" />
                ))
              ) : (
                <p className="py-10 text-center text-sm text-muted">{measurerFailed ? "Preview unavailable. Refresh and try again." : "Preparing preview…"}</p>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="gradient" onClick={() => void downloadPdf()} loading={exporting === "pdf"} disabled={!exportReady}>
                <Download className="h-4 w-4" />
                {exporting === "pdf" ? "Generating…" : "Download PDF"}
              </Button>
              <Button variant="outline" onClick={downloadDocx} loading={exporting === "docx"} disabled={!exportReady}>
                <Download className="h-4 w-4" />
                Download DOCX
              </Button>
              {status && (
                <p role="status" className={cn("text-sm", status.kind === "success" ? "text-emerald-400" : "text-red-300")}>
                  {status.text}
                </p>
              )}
            </div>
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
                  {contentLabel} · {selected.name} · {pagesLabel}
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
