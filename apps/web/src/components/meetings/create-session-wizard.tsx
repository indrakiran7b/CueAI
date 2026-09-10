"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Briefcase,
  ChevronDown,
  Phone,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadKnowledgeDocs } from "@/lib/knowledge-store";
import {
  DEFAULT_LIVE_SESSION_CONFIG,
  type LiveGuidanceLevel,
  type LiveSessionConfig,
  type LiveSessionKind,
} from "@/lib/live-session-config";
import {
  extractAndRememberResume,
  getResumeById,
  loadSavedResumes,
  resumeHasText,
} from "@/lib/resume-store";
import { ONBOARDING_QUESTIONS } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

const GUIDANCE_CHOICES =
  ONBOARDING_QUESTIONS.find((q) => q.id === "assistLevel")?.choices ?? [];

type WizardStep = 1 | 2;

function companyHintFromUrl(url: string): string {
  try {
    const host = new URL(url.trim()).hostname.replace(/^www\./, "");
    const token = host.split(".")[0] || "";
    if (!token || token.length < 2) return "";
    return token.charAt(0).toUpperCase() + token.slice(1);
  } catch {
    return "";
  }
}

export function CreateSessionWizard({
  onCancel,
  onComplete,
}: {
  onCancel?: () => void;
  onComplete: (config: LiveSessionConfig) => void;
}) {
  const [step, setStep] = useState<WizardStep>(1);
  const [config, setConfig] = useState<LiveSessionConfig>(DEFAULT_LIVE_SESSION_CONFIG);
  const [jobLinkOpen, setJobLinkOpen] = useState(false);
  const [jobLinkDraft, setJobLinkDraft] = useState("");
  const [resumeUploadBusy, setResumeUploadBusy] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);

  const [resumes, setResumes] = useState(loadSavedResumes);
  const documents = useMemo(() => loadKnowledgeDocs(), []);

  useEffect(() => {
    const first = resumes[0];
    if (!first) return;
    if (!config.resumeId) {
      setConfig((c) => ({
        ...c,
        resumeId: first.id,
        resumeName: first.name,
        resumeText: first.text,
      }));
    }
  }, [config.resumeId, resumes]);

  function patch(partial: Partial<LiveSessionConfig>) {
    setConfig((c) => ({ ...c, ...partial }));
  }

  function setKind(kind: LiveSessionKind) {
    patch({ kind });
  }

  function onJobLinkConfirm(e: FormEvent) {
    e.preventDefault();
    const url = jobLinkDraft.trim();
    if (!url) return;
    const hint = companyHintFromUrl(url);
    patch({
      jobLink: url,
      company: config.company?.trim() || hint,
    });
    setJobLinkOpen(false);
    setJobLinkDraft("");
  }

  async function onResumeUpload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setResumeUploadBusy(true);
    setResumeError(null);
    try {
      const saved = await extractAndRememberResume(file);
      setResumes(loadSavedResumes());
      patch({ resumeId: saved.id, resumeName: saved.name, resumeText: saved.text });
    } catch (err) {
      setResumeError(err instanceof Error ? err.message : "Could not read that resume.");
    } finally {
      setResumeUploadBusy(false);
      if (resumeInputRef.current) resumeInputRef.current.value = "";
    }
  }

  function canContinueStep1() {
    if (config.kind === "interview") {
      return Boolean(
        config.company?.trim() || config.jobDescription?.trim() || config.resumeText?.trim(),
      );
    }
    return true;
  }

  function onNext() {
    if (step === 1) {
      if (!canContinueStep1()) return;
      setStep(2);
      return;
    }
    const resume = getResumeById(config.resumeId);
    onComplete({
      ...config,
      resumeName: config.resumeName || resume?.name,
      resumeText: config.resumeText || resume?.text,
    });
  }

  function onBack() {
    if (step === 2) setStep(1);
    else onCancel?.();
  }

  return (
    <div className="ls-wizard-shell animate-fade-up">
      <div className="ls-wizard">
        {/* Sidebar */}
        <aside className="ls-wizard-sidebar">
          <div>
            <h1 className="ls-wizard-title">Create Session</h1>
            <p className="ls-wizard-sub">
              Enter the details &amp; select what you need for this call.
            </p>
          </div>

          <ol className="ls-wizard-steps">
            <li className={cn("ls-wizard-step", step === 1 && "is-active")}>
              <span className="ls-wizard-step-num">1</span>
              <span>Details</span>
            </li>
            <li className={cn("ls-wizard-step", step === 2 && "is-active")}>
              <span className="ls-wizard-step-num">2</span>
              <span>Preferences</span>
            </li>
          </ol>

          <div className="mt-auto space-y-2">
            <button
              type="button"
              className="ls-wizard-side-btn"
              onClick={() => {
                patch({
                  kind: "interview",
                  company: "Mock Company",
                  jobDescription:
                    "Practice behavioral and system design questions for a senior software engineer role.",
                });
                setStep(1);
              }}
            >
              <Briefcase className="h-4 w-4" />
              Mock Interview
            </button>
          </div>
        </aside>

        {/* Main panel */}
        <div className="ls-wizard-main">
          {onCancel && (
            <button
              type="button"
              className="ls-wizard-close"
              aria-label="Close"
              onClick={onCancel}
            >
              <X className="h-4 w-4" />
            </button>
          )}

          {step === 1 ? (
            <div className="ls-wizard-body">
              <div className="ls-kind-toggle" role="tablist" aria-label="Session type">
                <button
                  type="button"
                  role="tab"
                  aria-selected={config.kind === "interview"}
                  className={cn(config.kind === "interview" && "is-active")}
                  onClick={() => setKind("interview")}
                >
                  <Briefcase className="h-4 w-4" />
                  Interview
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={config.kind === "regular"}
                  className={cn(config.kind === "regular" && "is-active")}
                  onClick={() => setKind("regular")}
                >
                  <Phone className="h-4 w-4" />
                  Regular
                </button>
              </div>

              {config.kind === "interview" ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted">
                      Have a link to the job post? Import the details automatically.
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setJobLinkDraft(config.jobLink || "");
                        setJobLinkOpen(true);
                      }}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Paste a job link
                    </Button>
                  </div>
                  {config.jobLink && (
                    <p className="text-xs text-subtle">
                      Job link saved:{" "}
                      <span className="text-muted">{config.jobLink}</span>
                    </p>
                  )}

                  <Input
                    label="Company"
                    placeholder="Enter company name"
                    value={config.company || ""}
                    onChange={(e) => patch({ company: e.target.value })}
                  />

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="job-description" className="text-sm font-medium text-foreground/90">
                      Job Description
                    </label>
                    <textarea
                      id="job-description"
                      rows={6}
                      placeholder="Enter job description"
                      value={config.jobDescription || ""}
                      onChange={(e) => patch({ jobDescription: e.target.value })}
                      className="ls-wizard-textarea"
                    />
                  </div>

                  <fieldset className="space-y-3">
                    <legend className="text-sm font-medium text-foreground/90">Context</legend>

                    <div className="space-y-1.5">
                      <label htmlFor="resume-select" className="text-xs text-muted">
                        CV / Resume
                      </label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <select
                            id="resume-select"
                            className="ls-wizard-select"
                            value={config.resumeId || ""}
                            onChange={(e) => {
                              const resume = getResumeById(e.target.value);
                              patch({
                                resumeId: e.target.value || undefined,
                                resumeName: resume?.name,
                                resumeText: resume?.text,
                              });
                            }}
                          >
                            {resumes.length === 0 ? (
                              <option value="">No resume uploaded yet</option>
                            ) : (
                              resumes.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name}
                                </option>
                              ))
                            )}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          loading={resumeUploadBusy}
                          onClick={() => resumeInputRef.current?.click()}
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Upload
                        </Button>
                        <input
                          ref={resumeInputRef}
                          type="file"
                          accept=".pdf,.docx,.txt"
                          className="hidden"
                          onChange={(e) => void onResumeUpload(e.target.files)}
                        />
                      </div>
                      {resumeError && (
                        <p className="text-xs text-[var(--cue-danger)]">{resumeError}</p>
                      )}
                      {config.resumeText ? (
                        <p className="text-xs text-teal-400">
                          Resume loaded ({Math.round(config.resumeText.length / 100) / 10}k
                          characters) — CueAI will use it for answers.
                        </p>
                      ) : config.resumeId && !resumeHasText(getResumeById(config.resumeId)) ? (
                        <p className="text-xs text-amber-400">
                          That file name is saved, but the text was never extracted. Upload the PDF
                          again so CueAI can read it.
                        </p>
                      ) : null}
                      {resumes.length === 0 && (
                        <p className="text-xs text-subtle">
                          Upload here or on{" "}
                          <Link href="/resume" className="text-primary hover:underline">
                            Resume Tailor
                          </Link>
                          .
                        </p>
                      )}
                    </div>

                    <DocumentSelect
                      value={config.documentScope}
                      documents={documents}
                      onChange={(documentScope) => patch({ documentScope })}
                    />
                  </fieldset>
                </div>
              ) : (
                <div className="space-y-5">
                  <Input
                    label="Call Title (Optional)"
                    placeholder="Enter call title"
                    value={config.callTitle || ""}
                    onChange={(e) => patch({ callTitle: e.target.value })}
                  />

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="call-description" className="text-sm font-medium text-foreground/90">
                      Description (Optional)
                    </label>
                    <textarea
                      id="call-description"
                      rows={6}
                      placeholder="Enter description"
                      value={config.description || ""}
                      onChange={(e) => patch({ description: e.target.value })}
                      className="ls-wizard-textarea"
                    />
                  </div>

                  <fieldset className="space-y-3">
                    <legend className="text-sm font-medium text-foreground/90">Context</legend>
                    <DocumentSelect
                      value={config.documentScope}
                      documents={documents}
                      onChange={(documentScope) => patch({ documentScope })}
                    />
                  </fieldset>
                </div>
              )}
            </div>
          ) : (
            <div className="ls-wizard-body space-y-6">
              <div>
                <h2 className="text-base font-medium tracking-tight">Session preferences</h2>
                <p className="mt-1 text-sm text-muted">
                  Tune how CueAI behaves during this call. You can change these later in Settings.
                </p>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-foreground/90">
                  How much live guidance do you want?
                </legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {GUIDANCE_CHOICES.map((choice) => (
                    <button
                      key={choice.id}
                      type="button"
                      aria-pressed={config.guidance === choice.id}
                      className={cn(
                        "rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                        config.guidance === choice.id
                          ? "border-[var(--primary)] bg-[var(--primary-muted)] text-foreground"
                          : "border-[var(--border-strong)] text-muted hover:border-[var(--border-glow)] hover:text-foreground",
                      )}
                      onClick={() => patch({ guidance: choice.id as LiveGuidanceLevel })}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-foreground/90">
                  Start the companion in
                </legend>
                <div className="flex gap-2">
                  {(
                    [
                      ["private", "Private — overlay only"],
                      ["live", "Live — in-workspace suggestions"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={config.startMode === id}
                      className={cn(
                        "flex-1 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                        config.startMode === id
                          ? "border-[var(--primary)] bg-[var(--primary-muted)] text-foreground"
                          : "border-[var(--border-strong)] text-muted hover:border-[var(--border-glow)]",
                      )}
                      onClick={() => patch({ startMode: id })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border-strong)] px-4 py-3">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-[var(--border-strong)]"
                  checked={config.autoAnswer}
                  onChange={(e) => patch({ autoAnswer: e.target.checked })}
                />
                <span>
                  <span className="block text-sm font-medium text-foreground/90">
                    Auto-answer when new speech is transcribed
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    CueAI generates a short reply in the overlay after each transcribed line.
                  </span>
                </span>
              </label>
            </div>
          )}

          <footer className="ls-wizard-footer">
            <Button type="button" variant="secondary" onClick={onBack}>
              {step === 1 ? "Cancel" : "Back"}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={step === 1 && !canContinueStep1()}
              onClick={onNext}
            >
              {step === 2 ? "Start session" : "Next"}
            </Button>
          </footer>
        </div>
      </div>

      {jobLinkOpen && (
        <div className="ls-wizard-modal-backdrop" role="presentation">
          <div className="ls-wizard-modal" role="dialog" aria-labelledby="job-link-title">
            <h2 id="job-link-title" className="text-base font-medium">
              Paste a job link
            </h2>
            <p className="mt-1 text-sm text-muted">
              We&apos;ll save the URL and pre-fill the company when we can. Review the job
              description before starting.
            </p>
            <form className="mt-4 space-y-4" onSubmit={onJobLinkConfirm}>
              <Input
                label="Job posting URL"
                type="url"
                placeholder="https://…"
                value={jobLinkDraft}
                onChange={(e) => setJobLinkDraft(e.target.value)}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setJobLinkOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={!jobLinkDraft.trim()}>
                  Import link
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentSelect({
  value,
  documents,
  onChange,
}: {
  value: string;
  documents: { id: string; name: string }[];
  onChange: (next: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor="doc-select" className="text-xs text-muted">
        Documents
      </label>
      <div className="relative">
        <select
          id="doc-select"
          className="ls-wizard-select"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="all">All documents</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
      </div>
    </div>
  );
}
