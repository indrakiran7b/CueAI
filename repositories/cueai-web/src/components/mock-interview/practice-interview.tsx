"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { ExternalLink, Mic, Pause, Play, RotateCcw, SkipForward, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MockInterviewResults } from "@/components/mock-interview/mock-interview-report";
import {
  newRequestId,
  startMockInterview,
  type ResumeRoleValue,
} from "@/components/mock-interview/mock-interview-setup";
import { useVoiceCapture } from "@/components/mock-interview/use-voice-capture";
import type { InterviewerStatus } from "@/components/mock-interview/interviewer-panel";
import type { Speech } from "@/components/mock-interview/use-speech";
import { apiErrorMessage } from "@/lib/api-error";
import { fetchMeeting } from "@/lib/meetings-client";
import { withDesktopParam } from "@/lib/desktop-query";
import { MOCK_QUESTION_LIMIT, type MockDifficulty, type MockInterviewPublic } from "@/lib/mock-interview-types";
import { cn } from "@/lib/utils";

export const MOCK_GREETING =
  "Hello! Welcome to your mock interview. I'll ask you questions based on your resume and target role, evaluate your answers, and help you improve. Are you ready to begin?";

/** Pause after speech that ends a spoken answer; long enough for a thinking pause mid-answer. */
const ANSWER_END_OF_SPEECH_MS = 2000;

type Phase = "setup" | "starting" | "running" | "finishing" | "results";
type PrepError = { message: string; action: "start" | "retry_answer" | "finish" };

export function Bubble({
  from,
  meta,
  children,
}: {
  from: "interviewer" | "candidate";
  meta?: string;
  children: ReactNode;
}) {
  const interviewer = from === "interviewer";
  return (
    <div className={cn("flex gap-2.5", !interviewer && "justify-end")}>
      {interviewer && (
        <span className="relative mt-0.5 h-7 w-7 shrink-0 overflow-hidden rounded-full">
          <Image src="/mock-interview/interviewer.jpg" alt="" fill sizes="28px" className="object-cover" />
        </span>
      )}
      <div
        className={cn(
          "min-w-0 max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          interviewer
            ? "rounded-tl-sm border border-[var(--border)] bg-[var(--surface)]"
            : "rounded-tr-sm bg-[var(--primary-muted)] text-foreground",
        )}
      >
        {meta && <p className="mb-1 text-[11px] uppercase tracking-wide text-subtle">{meta}</p>}
        <div className="whitespace-pre-wrap">{children}</div>
      </div>
    </div>
  );
}

export function TypingDots({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 pl-10 text-subtle" aria-live="polite">
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-foreground" />
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-foreground" style={{ animationDelay: "0.2s" }} />
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-foreground" style={{ animationDelay: "0.4s" }} />
      <span className="ml-2 text-xs">{label}</span>
    </div>
  );
}

async function loadMock(id: string): Promise<MockInterviewPublic> {
  const result = await fetchMeeting(id);
  if (!result.ok || !result.meeting.mock) throw new Error(result.ok ? "Interview not found." : result.error);
  return result.meeting.mock;
}

/** Mode A: realistic mock interview, one question at a time, saved to Meetings. */
export function PracticeInterview({
  context,
  level,
  validate,
  active,
  speech,
  onStatus,
  onSession,
  resumeSessionId,
}: {
  context: ResumeRoleValue;
  level: MockDifficulty;
  /** Shows field errors and returns true when the resume and role are usable. */
  validate: () => boolean;
  active: boolean;
  speech: Speech;
  onStatus: (status: InterviewerStatus) => void;
  /** Called with the meeting id while an interview runs, and null when it is reset. */
  onSession: (meetingId: string | null, running: boolean) => void;
  resumeSessionId: string | null;
}) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [mock, setMock] = useState<MockInterviewPublic | null>(null);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [pendingAnswer, setPendingAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<PrepError | null>(null);
  const [autoListen, setAutoListen] = useState(true);
  const [showFeedback, setShowFeedback] = useState(true);
  const requestIdRef = useRef(newRequestId());
  const busyRef = useRef(false);
  const runningRef = useRef(false);
  const pausedRef = useRef(false);
  const autoListenRef = useRef(true);
  const activeRef = useRef(active);
  const scrollRef = useRef<HTMLDivElement>(null);

  const voice = useVoiceCapture({
    endOfSpeechMs: ANSWER_END_OF_SPEECH_MS,
    onText: (text, finished) => {
      const combined = answer.trim() ? `${answer.trim()} ${text}` : text;
      setAnswer(combined);
      if (finished) void submit({ text: combined, source: "voice" });
    },
  });

  useEffect(() => {
    activeRef.current = active;
    autoListenRef.current = autoListen;
  });

  const current = mock?.turns[mock.turns.length - 1];
  const pendingRetry = Boolean(current?.answeredAt && !current.evaluation);
  const recording = voice.state === "listening" || voice.state === "speaking";

  const status: InterviewerStatus =
    phase === "setup" || phase === "results"
      ? speech.speaking
        ? "speaking"
        : "ready"
      : paused
        ? "paused"
        : speech.speaking
          ? "speaking"
          : recording
            ? "listening"
            : busy || phase === "starting" || phase === "finishing" || voice.state === "transcribing"
              ? "thinking"
              : "ready";

  useEffect(() => {
    if (active) onStatus(status);
  }, [active, status, onStatus]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [mock, pendingAnswer, busy]);

  useEffect(() => {
    if (!active && runningRef.current && !pausedRef.current) queueMicrotask(() => pause());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    if (!resumeSessionId) return;
    let cancelled = false;
    void loadMock(resumeSessionId)
      .then((m) => {
        if (cancelled || !m.isOwner) return;
        setMeetingId(resumeSessionId);
        setMock(m);
        if (m.status === "active" && !m.report) {
          runningRef.current = true;
          pausedRef.current = true;
          setPaused(true);
          setPhase("running");
          onSession(resumeSessionId, true);
        } else {
          setPhase("results");
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeSessionId]);

  function listen() {
    if (!runningRef.current || pausedRef.current || !autoListenRef.current || !activeRef.current) return;
    void voice.start();
  }

  async function present(m: MockInterviewPublic, withWelcome: boolean) {
    const q = m.turns[m.turns.length - 1];
    if (!q) return;
    await speech.speak(withWelcome ? `${m.welcome} ${q.question}` : q.question);
    listen();
  }

  async function start() {
    if (!validate() || phase !== "setup") return;
    setError(null);
    speech.cancel();
    setPhase("starting");
    try {
      const started = await startMockInterview({
        value: context,
        requestId: requestIdRef.current,
        difficulty: level,
        origin: "live_session",
      });
      const m = started.mock ?? (await loadMock(started.id));
      requestIdRef.current = newRequestId();
      runningRef.current = true;
      pausedRef.current = false;
      setPaused(false);
      setMeetingId(started.id);
      setMock(m);
      setPhase("running");
      onSession(started.id, true);
      void present(m, true);
    } catch (err) {
      setPhase("setup");
      setError({
        message:
          err instanceof TypeError
            ? "Network error. Check your connection and retry."
            : err instanceof Error
              ? err.message
              : "Could not start the interview.",
        action: "start",
      });
    }
  }

  async function submit(input: { text?: string; source: "text" | "voice"; skip?: boolean }) {
    if (!mock || !current || !meetingId || busyRef.current || phase !== "running") return;
    const text = input.skip ? "" : (input.text ?? answer).trim();
    if (!input.skip && !text && !pendingRetry) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    if (input.source === "text") voice.cancel();
    speech.cancel();
    setPendingAnswer(input.skip || pendingRetry ? null : text);
    try {
      const res = await fetch(`/api/meetings/${encodeURIComponent(meetingId)}/mock/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnId: current.id, answer: text || undefined, source: input.source, skip: Boolean(input.skip) }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        mock?: MockInterviewPublic;
        done?: boolean;
        error?: { message: string };
      };
      if (!res.ok || !body.mock) throw new Error(apiErrorMessage(body, "Could not submit your answer."));
      setMock(body.mock);
      setAnswer("");
      if (body.error) {
        setError({ message: body.error.message, action: "retry_answer" });
        return;
      }
      if (body.done) {
        busyRef.current = false;
        await finish();
        return;
      }
      void present(body.mock, false);
    } catch (err) {
      setError({
        message: err instanceof TypeError ? "Network error. Your answer is still here — retry when you're back online." : err instanceof Error ? err.message : "Could not submit your answer.",
        action: "retry_answer",
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
      setPendingAnswer(null);
    }
  }

  async function finish() {
    if (!meetingId) return;
    runningRef.current = false;
    voice.cancel();
    speech.cancel();
    setPhase("finishing");
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${encodeURIComponent(meetingId)}/mock/finish`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { mock?: MockInterviewPublic };
      if (!res.ok || !body.mock) throw new Error(apiErrorMessage(body, "Could not finish the interview."));
      setMock(body.mock);
      setPhase("results");
      onSession(meetingId, false);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Could not finish the interview.", action: "finish" });
    }
  }

  function pause() {
    pausedRef.current = true;
    setPaused(true);
    voice.cancel();
    speech.cancel();
  }

  function resume() {
    pausedRef.current = false;
    setPaused(false);
    if (!pendingRetry && !busyRef.current) listen();
  }

  function reset() {
    speech.cancel();
    voice.cancel();
    runningRef.current = false;
    setMock(null);
    setMeetingId(null);
    setAnswer("");
    setError(null);
    setPaused(false);
    pausedRef.current = false;
    setPhase("setup");
    onSession(null, false);
  }

  function retry() {
    if (!error) return;
    if (error.action === "start") void start();
    else if (error.action === "finish") void finish();
    else if (current) void submit({ text: answer || current.answer, source: current.answerSource || "text", skip: current.skipped });
  }

  const errorBox = error && (
    <p role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
      {error.message}
      <button type="button" className="underline" onClick={retry}>
        Retry
      </button>
    </p>
  );

  if (phase === "setup" || phase === "starting") {
    return (
      <div className="space-y-4">
        <Bubble from="interviewer">{MOCK_GREETING}</Bubble>
        <p className="pl-10 text-xs text-subtle">
          Up to {MOCK_QUESTION_LIMIT[20]} questions in about 20 minutes, based on your resume and target role. Answer by
          voice or text; the session is saved to Meetings.
        </p>
        {errorBox}
        <div className="pl-10">
          <Button variant="gradient" loading={phase === "starting"} onClick={() => void start()}>
            <Play className="h-4 w-4" />
            {phase === "starting" ? "Preparing your first question…" : "Start Mock Interview"}
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "results" && mock && meetingId) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-medium">Interview complete</h2>
            <p className="text-sm text-muted">Your results are saved in Meetings.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={withDesktopParam(`/meetings/${encodeURIComponent(meetingId)}/summary`)}>
              <Button variant="outline" size="sm">
                <ExternalLink className="h-3.5 w-3.5" />
                Open in Meetings
              </Button>
            </Link>
            <Button variant="gradient" size="sm" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" />
              Practice again
            </Button>
          </div>
        </div>
        <MockInterviewResults meetingId={meetingId} mock={mock} onUpdated={setMock} />
      </div>
    );
  }

  if (!mock) return null;
  const finishing = phase === "finishing";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <Badge variant="info">
          Question {mock.turns.length} of {mock.questionLimit}
        </Badge>
        {current?.kind === "follow_up" && <Badge>Follow-up</Badge>}
        {paused && <Badge variant="warning">Paused</Badge>}
      </div>

      <div ref={scrollRef} className="cue-scroll max-h-[50vh] min-h-[240px] space-y-3 overflow-y-auto pr-1">
        <Bubble from="interviewer">{mock.welcome}</Bubble>
        {mock.turns.map((t, i) => (
          <Fragment key={t.id}>
            <Bubble from="interviewer" meta={`Question ${i + 1}${t.kind === "follow_up" ? " · Follow-up" : ""}`}>
              {t.question}
            </Bubble>
            {(t.answer || t.skipped) && (
              <Bubble from="candidate" meta={t.answerSource === "voice" ? "You · voice" : "You"}>
                {t.skipped ? "Skipped" : t.answer}
              </Bubble>
            )}
            {showFeedback && t.evaluation && (
              <p className="pl-10 text-xs text-muted">
                <span className="font-medium text-foreground/80">Feedback ({t.evaluation.score}/10):</span> {t.evaluation.feedback}
              </p>
            )}
          </Fragment>
        ))}
        {pendingAnswer && !current?.answer && (
          <Bubble from="candidate" meta="You">
            {pendingAnswer}
          </Bubble>
        )}
        {(busy || finishing) && <TypingDots label={finishing ? "Preparing your results…" : "The interviewer is reviewing your answer…"} />}
      </div>

      {errorBox}

      {!finishing && (
        <div className="space-y-2 border-t border-[var(--border)] pt-3">
          {(recording || voice.state === "transcribing") && (
            <p className="flex items-center gap-2 text-xs text-muted" aria-live="polite">
              <span
                className={cn("h-2 w-2 rounded-full", voice.state === "speaking" ? "animate-pulse bg-red-400" : "bg-red-400/60")}
                aria-hidden
              />
              {voice.state === "transcribing"
                ? "Transcribing your answer…"
                : voice.state === "speaking"
                  ? "Recording — pause for a moment when you're done"
                  : "Listening… start speaking"}
            </p>
          )}
          {voice.error && <p className="text-xs text-[var(--cue-danger)]">{voice.error}</p>}
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => (recording ? voice.stop() : void voice.start())}
              disabled={busy || paused || pendingRetry || voice.state === "transcribing"}
              aria-pressed={recording}
              aria-label={recording ? "Stop recording and submit" : "Answer by voice"}
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition disabled:opacity-40",
                recording
                  ? "border-red-400/60 bg-red-500/15 text-red-300"
                  : "border-[var(--border-strong)] text-muted hover:text-foreground",
              )}
            >
              {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <label htmlFor="prep-answer" className="sr-only">
              Your answer
            </label>
            <textarea
              id="prep-answer"
              rows={2}
              className="ls-wizard-textarea min-h-[44px] flex-1"
              placeholder={pendingRetry ? "Your answer is saved — retry above." : "Type your answer, or use the mic…"}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void submit({ source: "text" });
                }
              }}
              disabled={busy || paused || pendingRetry}
            />
            <Button
              type="button"
              variant="primary"
              loading={busy}
              disabled={busy || paused || pendingRetry || !answer.trim()}
              onClick={() => void submit({ source: "text" })}
            >
              Submit
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={autoListen}
                  onChange={(e) => setAutoListen(e.target.checked)}
                  className="accent-[var(--primary)]"
                />
                Listen automatically after each question
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={showFeedback}
                  onChange={(e) => setShowFeedback(e.target.checked)}
                  className="accent-[var(--primary)]"
                />
                Show feedback after each answer
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy || paused || pendingRetry}
                onClick={() => void submit({ source: "text", skip: true })}
              >
                <SkipForward className="h-3.5 w-3.5" />
                Skip
              </Button>
              {paused ? (
                <Button type="button" variant="secondary" size="sm" onClick={resume}>
                  <Play className="h-3.5 w-3.5" />
                  Resume
                </Button>
              ) : (
                <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={pause}>
                  <Pause className="h-3.5 w-3.5" />
                  Pause
                </Button>
              )}
              <Button type="button" variant="danger" size="sm" disabled={busy} onClick={() => void finish()}>
                <Square className="h-3.5 w-3.5" />
                End Interview
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
