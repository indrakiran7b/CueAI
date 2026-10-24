"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  extractAndRememberResume,
  getResumeById,
  loadSavedResumes,
  resumeHasText,
  type SavedResume,
} from "@/lib/resume-store";
import type { MockInterviewPublic, MockOrigin, MockSetup } from "@/lib/mock-interview-types";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";

export { apiErrorMessage };

const MAX_JD_CHARS = 8000;

export type ResumeRoleValue = { resumeId: string; jobTitle: string; jobDescription: string };

export function newRequestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Date.now()}${Math.random().toString(36).slice(2)}`;
}

/** Validation messages for the resume + role fields, or null when both are usable. */
export function resumeRoleErrors(value: ResumeRoleValue) {
  const resume = getResumeById(value.resumeId);
  return {
    title: value.jobTitle.trim() ? undefined : "Enter the job role you are preparing for.",
    resume: resumeHasText(resume)
      ? null
      : resume
        ? "This resume has no readable text. Upload a text-based PDF or DOCX."
        : "Select or upload your resume.",
  };
}

/** Resume (select or upload), target role, and optional job description (paste or upload). */
export function ResumeRoleFields({
  value,
  onChange,
  disabled,
  showErrors,
  preferredResumeName,
  titleOptional,
}: {
  value: ResumeRoleValue;
  onChange: (patch: Partial<ResumeRoleValue>) => void;
  disabled?: boolean;
  showErrors?: boolean;
  preferredResumeName?: string;
  titleOptional?: boolean;
}) {
  const [resumes, setResumes] = useState<SavedResume[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [jdBusy, setJdBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resumeFileRef = useRef<HTMLInputElement>(null);
  const jdFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Saved resumes live in browser storage; read after mount to keep server and client markup identical.
    queueMicrotask(() => {
      const saved = loadSavedResumes();
      setResumes(saved);
      if (value.resumeId) return;
      const preferred =
        saved.find((r) => preferredResumeName && r.name === preferredResumeName && resumeHasText(r)) ||
        saved.find((r) => resumeHasText(r));
      if (preferred) onChange({ resumeId: preferred.id });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const errors = resumeRoleErrors(value);
  const titleError = showErrors && !titleOptional ? errors.title : undefined;
  const resumeError = showErrors ? errors.resume : null;

  async function onResumeUpload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!/\.(pdf|docx)$/i.test(file.name)) {
      setError("Upload a PDF or DOCX resume.");
      return;
    }
    setUploadBusy(true);
    setError(null);
    try {
      const saved = await extractAndRememberResume(file);
      setResumes(loadSavedResumes());
      onChange({ resumeId: saved.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that resume.");
    } finally {
      setUploadBusy(false);
      if (resumeFileRef.current) resumeFileRef.current.value = "";
    }
  }

  async function onJdUpload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!/\.(pdf|docx|txt|md)$/i.test(file.name)) {
      setError("Upload the job description as PDF, DOCX, or TXT.");
      return;
    }
    setJdBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("resume", file);
      form.append("purpose", "job_description");
      const res = await fetch("/api/resume/extract", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { text?: string };
      if (!res.ok || !body.text) throw new Error(apiErrorMessage(body, "Could not read that job description."));
      onChange({ jobDescription: body.text.slice(0, MAX_JD_CHARS) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that job description.");
    } finally {
      setJdBusy(false);
      if (jdFileRef.current) jdFileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4 text-left">
      <div className="space-y-1.5">
        <label htmlFor="mock-resume" className="text-sm font-medium text-foreground/90">
          Resume
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <select
              id="mock-resume"
              className="ls-wizard-select"
              value={value.resumeId}
              onChange={(e) => onChange({ resumeId: e.target.value })}
              disabled={disabled}
              aria-invalid={Boolean(resumeError)}
              aria-describedby="mock-resume-help"
            >
              {resumes.length === 0 ? (
                <option value="">No resume uploaded yet</option>
              ) : (
                <>
                  {!value.resumeId && <option value="">Select a resume</option>}
                  {resumes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </>
              )}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={uploadBusy}
            disabled={disabled}
            onClick={() => resumeFileRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            Upload
          </Button>
          <input
            ref={resumeFileRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => void onResumeUpload(e.target.files)}
          />
        </div>
        <p id="mock-resume-help" className={cn("text-xs", resumeError ? "text-[var(--cue-danger)]" : "text-subtle")}>
          {resumeError || "Questions only use what your resume actually says."}
        </p>
      </div>

      <Input
        label={titleOptional ? "Target job role (optional)" : "Target job role"}
        placeholder="e.g. Frontend Developer"
        value={value.jobTitle}
        onChange={(e) => onChange({ jobTitle: e.target.value.slice(0, 120) })}
        error={titleError}
        disabled={disabled}
        required={!titleOptional}
      />

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="mock-jd" className="text-sm font-medium text-foreground/90">
            Job description <span className="font-normal text-subtle">(optional)</span>
          </label>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground disabled:opacity-50"
            onClick={() => jdFileRef.current?.click()}
            disabled={jdBusy || disabled}
          >
            <FileText className="h-3.5 w-3.5" />
            {jdBusy ? "Reading…" : "Upload file"}
          </button>
          <input
            ref={jdFileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            className="hidden"
            onChange={(e) => void onJdUpload(e.target.files)}
          />
        </div>
        <textarea
          id="mock-jd"
          rows={3}
          placeholder="Paste the job description to focus questions on its requirements."
          value={value.jobDescription}
          onChange={(e) => onChange({ jobDescription: e.target.value.slice(0, MAX_JD_CHARS) })}
          className="ls-wizard-textarea"
          disabled={disabled}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-[var(--cue-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Start a mock interview meeting. `requestId` is reused when retrying the same start so the
 * server doesn't create a duplicate session. Returns the new meeting id.
 */
export async function startMockInterview(input: {
  value: ResumeRoleValue;
  requestId: string;
  difficulty?: MockSetup["difficulty"];
  origin?: MockOrigin;
  signal?: AbortSignal;
}): Promise<{ id: string; mock: MockInterviewPublic | null }> {
  const resume = getResumeById(input.value.resumeId);
  if (!resume || !resumeHasText(resume)) throw new Error("Select or upload your resume.");
  const res = await fetch("/api/meetings/mock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: input.signal,
    body: JSON.stringify({
      clientRequestId: input.requestId,
      setup: {
        jobTitle: input.value.jobTitle.trim(),
        jobDescription: input.value.jobDescription.trim() || undefined,
        difficulty: input.difficulty,
        resumeName: resume.name,
        origin: input.origin,
      },
      resumeText: resume.text,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiErrorMessage(body, "Could not start the mock interview."));
  const meeting = (body as { meeting: { id: string; mock?: MockInterviewPublic | null } }).meeting;
  return { id: meeting.id, mock: meeting.mock ?? null };
}
