"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { InterviewerPanel, type InterviewerStatus } from "@/components/mock-interview/interviewer-panel";
import { PracticeInterview } from "@/components/mock-interview/practice-interview";
import { useSpeech } from "@/components/mock-interview/use-speech";
import {
  ResumeRoleFields,
  resumeRoleErrors,
  type ResumeRoleValue,
} from "@/components/mock-interview/mock-interview-setup";
import { fetchMeeting } from "@/lib/meetings-client";
import { getResumeById } from "@/lib/resume-store";
import type { MockDifficulty } from "@/lib/mock-interview-types";
import { cn } from "@/lib/utils";

const EXPERIENCE_LEVELS: { id: MockDifficulty; label: string }[] = [
  { id: "beginner", label: "Fresher" },
  { id: "intermediate", label: "Some experience" },
  { id: "advanced", label: "Experienced" },
];

/**
 * Live Session's Mock Interview mode: resume/role setup, the virtual interviewer, and the
 * question-by-question interview. Sessions are saved to Meetings.
 */
export function MockInterviewMode({
  active,
  sessionId,
  practiceId,
  onSessionChange,
}: {
  active: boolean;
  /** Continue an existing (owned) mock interview. */
  sessionId: string | null;
  /** Prefill role, job description and level from a finished interview ("Practice again"). */
  practiceId: string | null;
  onSessionChange: (meetingId: string | null) => void;
}) {
  const speech = useSpeech();
  const [status, setStatus] = useState<InterviewerStatus>("ready");
  const [value, setValue] = useState<ResumeRoleValue>({ resumeId: "", jobTitle: "", jobDescription: "" });
  const [level, setLevel] = useState<MockDifficulty>("intermediate");
  const [showErrors, setShowErrors] = useState(false);
  const [running, setRunning] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(!sessionId);
  const [preferredResume, setPreferredResume] = useState<string | undefined>();
  const [fieldsKey, setFieldsKey] = useState(0);

  useEffect(() => {
    if (!practiceId) return;
    void fetchMeeting(practiceId).then((result) => {
      const mock = result.ok ? result.meeting.mock : null;
      if (!mock?.isOwner) return;
      setValue({ resumeId: "", jobTitle: mock.setup.jobTitle, jobDescription: mock.setup.jobDescription || "" });
      setLevel(mock.setup.difficulty);
      setPreferredResume(mock.setup.resumeName);
      setFieldsKey((k) => k + 1);
    });
  }, [practiceId]);

  function validate() {
    setShowErrors(true);
    const errors = resumeRoleErrors(value);
    if (errors.title || errors.resume) {
      setDetailsOpen(true);
      return false;
    }
    return true;
  }

  const onSession = useCallback(
    (id: string | null, isRunning: boolean) => {
      setRunning(isRunning);
      if (isRunning) setDetailsOpen(false);
      onSessionChange(id && isRunning ? id : null);
    },
    [onSessionChange],
  );

  const resumeName = getResumeById(value.resumeId)?.name;
  const levelLabel = EXPERIENCE_LEVELS.find((l) => l.id === level)?.label;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 text-left lg:grid-cols-[240px_minmax(0,1fr)]">
      <Card className="h-fit p-5 lg:sticky lg:top-4">
        <InterviewerPanel status={status} speech={speech} />
      </Card>

      <Card className="space-y-4 p-4 sm:p-5">
        <section className="rounded-xl border border-[var(--border)]">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((o) => !o)}
          >
            <span>
              <span className="block text-sm font-medium">Interview setup</span>
              <span className="block text-xs text-muted">
                {[resumeName || "No resume selected", value.jobTitle.trim() || "No role yet", levelLabel].join(" · ")}
              </span>
            </span>
            <ChevronDown className={cn("h-4 w-4 text-subtle transition-transform", detailsOpen && "rotate-180")} />
          </button>
          {detailsOpen && (
            <div className="space-y-4 border-t border-[var(--border)] px-4 py-4">
              {running && (
                <p className="text-xs text-amber-400">
                  The setup is locked while the interview is running. End it to change these details.
                </p>
              )}
              <ResumeRoleFields
                key={fieldsKey}
                value={value}
                onChange={(patch) => setValue((v) => ({ ...v, ...patch }))}
                disabled={running}
                showErrors={showErrors}
                preferredResumeName={preferredResume}
              />
              <fieldset className="space-y-2" disabled={running}>
                <legend className="text-sm font-medium text-foreground/90">Experience level</legend>
                <div className="flex flex-wrap gap-2">
                  {EXPERIENCE_LEVELS.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      aria-pressed={level === l.id}
                      onClick={() => setLevel(l.id)}
                      className={cn(
                        "rounded-xl border px-3 py-1.5 text-sm transition-colors disabled:opacity-50",
                        level === l.id
                          ? "border-[var(--primary)] bg-[var(--primary-muted)] text-foreground"
                          : "border-[var(--border-strong)] text-muted hover:border-[var(--border-glow)] hover:text-foreground",
                      )}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          )}
        </section>

        <PracticeInterview
          context={value}
          level={level}
          validate={validate}
          active={active}
          speech={speech}
          onStatus={setStatus}
          onSession={onSession}
          resumeSessionId={sessionId}
        />
      </Card>
    </div>
  );
}
