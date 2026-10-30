"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { apiErrorMessage } from "@/lib/api-error";
import { READINESS_LABELS } from "@/lib/mock-interview-logic";
import type { MockInterviewPublic, MockReadiness } from "@/lib/mock-interview-types";

function scoreTone(score: number) {
  if (score >= 75) return "text-teal-300";
  if (score >= 50) return "text-amber-300";
  return "text-red-300";
}

const READINESS_BADGE: Record<MockReadiness, "success" | "info" | "warning" | "danger"> = {
  ready: "success",
  nearly_ready: "info",
  needs_practice: "warning",
  not_ready: "danger",
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-subtle">{label}</p>
      <div className="mt-0.5 text-sm text-muted">{children}</div>
    </div>
  );
}

/**
 * Saved results of a mock interview, laid out like the regular meeting summary.
 * Rendered from stored data; never regenerated once saved.
 */
export function MockInterviewResults({
  meetingId,
  mock,
  onUpdated,
}: {
  meetingId: string;
  mock: MockInterviewPublic;
  onUpdated: (next: MockInterviewPublic) => void;
}) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const report = mock.report;
  const answered = mock.turns.filter((t) => t.answer && !t.skipped).length;
  const feedbackByTurn = new Map((report?.questionFeedback || []).map((f) => [f.turnId, f]));

  async function retryReport() {
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch(`/api/meetings/${encodeURIComponent(meetingId)}/mock/finish`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiErrorMessage(body, "Could not create the results."));
      onUpdated((body as { mock: MockInterviewPublic }).mock);
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Could not create the results.");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <>
      {report ? (
        <Card glow className="p-6">
          <CardTitle className="mb-1">Overview</CardTitle>
          <p className="mb-3 text-xs text-subtle">
            Scores are AI estimates for practice, not an official assessment.
          </p>
          <div className="flex flex-wrap items-start gap-6">
            <div>
              <p className={`text-4xl font-semibold ${scoreTone(report.overallScore)}`}>
                {report.overallScore}
                <span className="text-lg text-muted">/100</span>
              </p>
              <p className="mt-1 text-xs text-subtle">{report.assessmentLabel}</p>
            </div>
            <div className="min-w-[240px] flex-1 space-y-2">
              <Badge variant={READINESS_BADGE[report.readiness]}>{READINESS_LABELS[report.readiness]}</Badge>
              <p className="text-sm leading-relaxed text-muted">{report.summary}</p>
              {report.readinessNote && <p className="text-xs text-subtle">{report.readinessNote}</p>}
            </div>
          </div>
          {report.categories.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2 text-xs">
              {report.categories.map((c) => (
                <li key={c.key} className="rounded-full border border-[var(--border)] px-3 py-1" title={c.comment}>
                  <span className="text-muted">{c.label}</span> <span className={scoreTone(c.score)}>{c.score}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : (
        <Card glow className="space-y-3 p-6">
          <CardTitle>Overview</CardTitle>
          <p className="text-sm text-muted">
            {mock.reportError || "Results have not been generated for this interview yet."}
          </p>
          {mock.isOwner && answered > 0 && (
            <Button type="button" variant="primary" loading={retrying} onClick={() => void retryReport()}>
              {mock.reportError ? "Retry results" : "Generate results from answered questions"}
            </Button>
          )}
          {retryError && <p className="text-sm text-[var(--cue-danger)]">{retryError}</p>}
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {report && report.strengths.length > 0 && (
          <Card className="p-5">
            <CardHeader>
              <CardTitle>Strengths</CardTitle>
            </CardHeader>
            <ul className="space-y-3">
              {report.strengths.map((s) => (
                <li key={s.point} className="flex gap-2 text-sm text-foreground/90">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-400" />
                  <span>
                    {s.point}
                    {s.evidence && <span className="text-muted"> — {s.evidence}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {report && report.improvements.length > 0 && (
          <Card className="p-5">
            <CardHeader>
              <CardTitle>Areas to improve</CardTitle>
            </CardHeader>
            <ul className="space-y-2">
              {report.improvements.map((imp) => (
                <li key={imp.area}>
                  <details className="text-sm">
                    <summary className="flex cursor-pointer list-none gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                      <span className="font-medium text-amber-300">{imp.area}</span>
                    </summary>
                    <div className="mt-2 space-y-2 pl-6">
                      {imp.whyItMatters && <Field label="Why it matters">{imp.whyItMatters}</Field>}
                      {imp.whatToPractice && <Field label="What to practice">{imp.whatToPractice}</Field>}
                      {imp.exercise && <Field label="Exercise">{imp.exercise}</Field>}
                      {imp.nextSteps && <Field label="Next steps">{imp.nextSteps}</Field>}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="p-5 md:col-span-2">
          <CardHeader>
            <CardTitle>Questions &amp; Answers</CardTitle>
          </CardHeader>
          {mock.turns.length === 0 ? (
            <p className="text-sm text-muted">No questions were asked.</p>
          ) : (
            <ol className="space-y-2">
              {mock.turns.map((t, i) => {
                const fb = feedbackByTurn.get(t.id);
                return (
                  <li key={t.id}>
                    <details className="rounded-xl border border-[var(--border)] p-3 text-sm">
                      <summary className="cursor-pointer list-none">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">Question {i + 1}</span>
                          {t.kind === "follow_up" && <Badge>Follow-up</Badge>}
                          {t.skipped ? (
                            <span className="text-subtle">Skipped</span>
                          ) : t.evaluation ? (
                            <span className={scoreTone(t.evaluation.score * 10)}>{t.evaluation.score}/10</span>
                          ) : !t.answeredAt ? (
                            <span className="text-subtle">Not answered</span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-foreground/90">{t.question}</p>
                      </summary>
                      <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
                        <Field label={`Your answer${t.answerSource === "voice" ? " (voice)" : ""}`}>
                          <p className="whitespace-pre-wrap">{t.skipped ? "Skipped." : t.answer || "Not answered."}</p>
                        </Field>
                        {t.evaluation ? (
                          <Field label="Feedback">
                            <p>{t.evaluation.feedback}</p>
                          </Field>
                        ) : t.evaluationError ? (
                          <p className="text-xs text-amber-400">This answer was saved but not evaluated.</p>
                        ) : null}
                        {t.evaluation?.correct && t.evaluation.correct.length > 0 && (
                          <Field label="What you got right">
                            <ul className="list-disc space-y-0.5 pl-5">
                              {t.evaluation.correct.map((c) => (
                                <li key={c}>{c}</li>
                              ))}
                            </ul>
                          </Field>
                        )}
                        {fb?.expected && (
                          <Field label="What the interviewer expected">
                            <p>{fb.expected}</p>
                          </Field>
                        )}
                        {t.evaluation && t.evaluation.missing.length > 0 && (
                          <Field label="Missing or incorrect">
                            <ul className="list-disc space-y-0.5 pl-5">
                              {t.evaluation.missing.map((m) => (
                                <li key={m}>{m}</li>
                              ))}
                            </ul>
                          </Field>
                        )}
                        {fb && fb.recommendations.length > 0 && (
                          <Field label="How to improve">
                            <ul className="list-disc space-y-0.5 pl-5">
                              {fb.recommendations.map((r) => (
                                <li key={r}>{r}</li>
                              ))}
                            </ul>
                          </Field>
                        )}
                        {fb?.improvedAnswer && (
                          <Field label="Suggested improved answer">
                            <p className="whitespace-pre-wrap">{fb.improvedAnswer}</p>
                          </Field>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        {report && (report.practicePlan.length > 0 || report.practiceQuestions.length > 0) && (
          <Card className="p-5 md:col-span-2">
            <CardHeader>
              <CardTitle>Topics to practice before a real interview</CardTitle>
            </CardHeader>
            {report.practicePlan.length > 0 && (
              <ul className="space-y-3">
                {[...report.practicePlan]
                  .sort((a, b) => a.priority - b.priority)
                  .map((p) => (
                    <li key={`${p.priority}-${p.action}`} className="flex gap-2 text-sm text-foreground/90">
                      <Target className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                      <span>
                        {p.action}
                        {p.focus && <span className="text-muted"> — {p.focus}</span>}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
            {report.practiceQuestions.length > 0 && (
              <div className="mt-4 space-y-1">
                <p className="text-xs uppercase tracking-wide text-subtle">Questions to practice next</p>
                <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted">
                  {report.practiceQuestions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
