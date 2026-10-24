"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  Bookmark,
  Mic,
  Pause,
  Play,
  Square,
  Volume2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LiveAnswerCard, useLiveAnswers } from "@/components/live/live-answers";
import { TestCueAi } from "@/components/live/test-cueai";
import { MockInterviewMode } from "@/components/mock-interview/mock-interview-mode";
import { cn } from "@/lib/utils";
import {
  hideCompanionOverlay,
  isDesktopApp,
  openCompanionOverlay,
  startDesktopMeetingSession,
} from "@/lib/desktop";
import { CreateSessionWizard } from "@/components/meetings/create-session-wizard";
import {
  clearLiveSessionConfig,
  saveLiveSessionConfig,
  sessionTitle,
  type LiveSessionConfig,
} from "@/lib/live-session-config";
import Link from "next/link";
import { persistDesktopQuery, withDesktopParam } from "@/lib/desktop-query";
import { formatShortcut } from "@/lib/shortcuts";
import "./live-session.css";

type InterviewMode = "regular" | "mock" | "test";

const INTERVIEW_MODES: { id: InterviewMode; label: string }[] = [
  { id: "regular", label: "Regular Interview" },
  { id: "mock", label: "Mock Interview" },
  { id: "test", label: "Test CueAI" },
];

const MODE_DESCRIPTIONS: Record<InterviewMode, string> = {
  regular: "Start a live session to open Create Session. Cancel returns here without creating a meeting.",
  mock: "Practice with an AI interviewer. Questions come from your resume and target role; results are saved to Meetings.",
  test: "Ask CueAI an interview question by voice or text and see the answer it would give in a Regular Interview.",
};

function setLiveQuery(params: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  window.history.replaceState(null, "", url.toString());
}

type TranscriptLine = {
  id: number;
  speaker: string;
  role: string;
  text: string;
  time: string;
  confidence: number;
};

export default function LiveMeetingPage() {
  const [session, setSession] = useState<LiveSessionConfig | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const meetingIdRef = useRef<string | null>(null);
  meetingIdRef.current = meetingId;
  const [hydrated, setHydrated] = useState(false);
  const setupAbortRef = useRef(false);
  const [mode, setMode] = useState<InterviewMode>("regular");
  /** Modes stay mounted once opened, so switching tabs never drops a running interview or test answers. */
  const [opened, setOpened] = useState<InterviewMode[]>(["regular"]);
  const [mockSessionId, setMockSessionId] = useState<string | null>(null);
  const [practiceId, setPracticeId] = useState<string | null>(null);

  useEffect(() => {
    setHydrated(true);
    persistDesktopQuery();
    const params = new URLSearchParams(window.location.search);
    // `?mock=<id>` is the older link format for continuing a mock interview.
    const session = params.get("session") || params.get("mock");
    const practice = params.get("practice");
    const requested = params.get("mode");
    const initial: InterviewMode | null =
      requested === "test" ? "test" : session || practice || requested === "mock" ? "mock" : null;
    if (!initial) return;
    queueMicrotask(() => {
      setMode(initial);
      setOpened((list) => (list.includes(initial) ? list : [...list, initial]));
      setMockSessionId(session);
      setPracticeId(practice);
      if (params.get("mock")) setLiveQuery({ mock: null, session, mode: "mock" });
      if (practice) setLiveQuery({ practice: null });
    });
  }, []);

  function changeMode(next: InterviewMode) {
    setMode(next);
    setOpened((list) => (list.includes(next) ? list : [...list, next]));
    setLiveQuery({ mode: next === "regular" ? null : next });
  }

  const onMockSessionChange = useCallback((id: string | null) => {
    setLiveQuery({ session: id });
  }, []);

  useEffect(() => {
    function onEndFromOverlay() {
      endSession();
    }
    window.addEventListener("cueai:end-session", onEndFromOverlay);
    return () => window.removeEventListener("cueai:end-session", onEndFromOverlay);
  }, []);

  function cancelSetup() {
    setupAbortRef.current = true;
    clearLiveSessionConfig();
    setMeetingId(null);
    setSession(null);
    setSetupOpen(false);
    void startDesktopMeetingSession({
      active: false,
      screenSharing: false,
      cueAiMode: "inactive",
      hideCompanion: true,
    });
    void hideCompanionOverlay();
  }

  async function beginSession(config: LiveSessionConfig) {
    setupAbortRef.current = false;
    const title = sessionTitle(config);
    saveLiveSessionConfig(config);
    let createdId: string | null = null;
    try {
      await fetch("/api/live/briefing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: config.kind,
          company: config.company,
          jobDescription: config.jobDescription,
          jobLink: config.jobLink,
          resumeName: config.resumeName,
          resumeText: config.resumeText,
          description: config.description,
          documentIds: config.documentIds,
          pendingKnowledgeIds: config.pendingKnowledgeIds,
        }),
      });
    } catch {
      // Briefing write is best-effort; meeting create still tries.
    }
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: config.kind,
          title,
          company: config.company,
          jobDescription: config.jobDescription,
          jobLink: config.jobLink,
          resumeName: config.resumeName,
          resumeText: config.resumeText,
          description: config.description,
          documentIds: config.documentIds,
          pendingKnowledgeIds: config.pendingKnowledgeIds,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { meeting?: { id?: string } };
      createdId = data.meeting?.id || null;
    } catch {
      // Overlay still works if persistence fails.
    }
    if (setupAbortRef.current) {
      if (createdId) {
        void fetch(`/api/meetings/${createdId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ end: true, durationSec: 0, transcript: [] }),
        });
      }
      clearLiveSessionConfig();
      return;
    }
    const next = { ...config, meetingId: createdId || config.meetingId };
    saveLiveSessionConfig(next);
    setMeetingId(next.meetingId || null);
    setSetupOpen(false);
    void openCompanionOverlay();
    void startDesktopMeetingSession({
      active: true,
      screenSharing: false,
      meetingId: next.meetingId || `live-${config.kind}-${Date.now()}`,
      title,
      cueAiMode: config.startMode,
      showCompanion: true,
    });
    setSession(next);
  }

  function endSession(durationSec = 0, spoken: { who: string; text: string }[] = []) {
    const id = meetingIdRef.current || meetingId;
    if (id) {
      void fetch(`/api/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          end: true,
          durationSec,
          transcript: spoken.map((l) => ({ who: l.who, text: l.text })),
        }),
      }).catch(() => undefined);
    }
    clearLiveSessionConfig();
    setMeetingId(null);
    setSession(null);
    setSetupOpen(false);
    void startDesktopMeetingSession({
      active: false,
      screenSharing: false,
      cueAiMode: "inactive",
      hideCompanion: true,
    });
    void hideCompanionOverlay();
  }

  if (!hydrated) {
    return (
      <div data-live className="animate-fade-up py-8">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-[var(--surface-active)]" />
        <div className="mt-3 h-4 w-96 max-w-full animate-pulse rounded-lg bg-[var(--surface-active)]" />
      </div>
    );
  }

  if (!session && !setupOpen) {
    return (
      <div
        data-live
        className={cn(
          "mx-auto space-y-6 text-center animate-fade-up",
          mode === "regular" ? "max-w-xl py-16" : mode === "mock" ? "max-w-6xl py-6" : "max-w-3xl py-6",
        )}
      >
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Live Session</h1>
          <p className="mt-2 text-sm text-muted">{MODE_DESCRIPTIONS[mode]}</p>
        </div>
        <div className="flex justify-center">
          <div className="ls-mode-group">
            <span className="text-xs font-medium text-muted">Mode</span>
            <div className="ls-mode-toggle" role="group" aria-label="Live Session mode">
              {INTERVIEW_MODES.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={mode === id}
                  onClick={() => changeMode(id)}
                  className="ls-mode-btn"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {mode === "regular" && (
          <Button
            variant="gradient"
            onClick={() => {
              setupAbortRef.current = false;
              setSetupOpen(true);
            }}
          >
            Start Live Session
          </Button>
        )}
        {opened.includes("mock") && (
          <div hidden={mode !== "mock"}>
            <MockInterviewMode
              active={mode === "mock"}
              sessionId={mockSessionId}
              practiceId={practiceId}
              onSessionChange={onMockSessionChange}
            />
          </div>
        )}
        {opened.includes("test") && (
          <div hidden={mode !== "test"}>
            <TestCueAi active={mode === "test"} />
          </div>
        )}
      </div>
    );
  }

  if (!session) {
    return (
      <div data-live>
        <CreateSessionWizard
          onCancel={cancelSetup}
          onComplete={(config) => void beginSession(config)}
        />
        <p className="mt-4 text-center text-xs text-subtle">
          Starting a session opens the CueAI desktop overlay (same as{" "}
          {formatShortcut("mod", "shift", "Space")}). Keep
          CueAI Desktop running for the pop-out window.
        </p>
      </div>
    );
  }

  return (
    <ActiveLiveSession config={session} meetingId={meetingId} onEnd={endSession} />
  );
}

type CueAiMode = "inactive" | "private" | "live";
type CueAiProcessing = "idle" | "initializing" | "listening" | "stopped" | "error";

function ActiveLiveSession({
  config,
  meetingId,
  onEnd,
}: {
  config: LiveSessionConfig;
  meetingId: string | null;
  onEnd: (durationSec?: number, spoken?: { who: string; text: string }[]) => void;
}) {
  const title = sessionTitle(config);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [sharing, setSharing] = useState(false);
  const [cueAiMode, setCueAiMode] = useState<CueAiMode>(config.startMode);
  const [cueAiProcessing, setCueAiProcessing] = useState<CueAiProcessing>("initializing");
  const [desktopReady, setDesktopReady] = useState(false);
  const [bookmarkCount, setBookmarkCount] = useState(0);
  const [bookmarkedIds, setBookmarkedIds] = useState<number[]>([]);
  const answers = useLiveAnswers();
  const [ask, setAsk] = useState("");
  const asking = answers.busy;
  const latestAnswer = answers.latest;
  const askReply = latestAnswer?.status === "error" ? null : latestAnswer?.answer || null;
  const askNotice = latestAnswer?.status === "error" ? latestAnswer.error ?? null : null;
  const [playheadPct, setPlayheadPct] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cueAiModeRef = useRef<CueAiMode>("private");

  useEffect(() => {
    setDesktopReady(isDesktopApp());
  }, []);

  useEffect(() => {
    cueAiModeRef.current = cueAiMode;
  }, [cueAiMode]);

  // Single sync path — avoids show/hide races that caused the Live toggle glitch.
  useEffect(() => {
    let cancelled = false;

    async function syncDesktop() {
      await startDesktopMeetingSession({
        active: true,
        screenSharing: sharing,
        meetingId: `live-${config.kind}`,
        title,
        cueAiMode,
        showCompanion: cueAiMode !== "inactive",
        hideCompanion: cueAiMode === "inactive",
      });
      if (cancelled) return;

      if (cueAiMode === "inactive") {
        setCueAiProcessing("idle");
        return;
      }

      await openCompanionOverlay();
      if (cancelled) return;
      setCueAiProcessing("initializing");
      await new Promise((r) => setTimeout(r, 400));
      if (!cancelled && cueAiModeRef.current === cueAiMode) {
        setCueAiProcessing("listening");
      }
    }

    void syncDesktop();
    return () => {
      cancelled = true;
      // Intentionally no hide here — React Strict Mode remount was killing the popout.
    };
  }, [config.kind, title, cueAiMode, sharing]);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [paused]);

  // Real transcript comes from desktop live capture — no simulated lines.
  useEffect(() => {
    if (cueAiMode !== "live") {
      setLines([]);
    }
  }, [cueAiMode]);
  useEffect(() => {
    if (cueAiMode === "inactive") {
      setLines([]);
    }
  }, [cueAiMode]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [lines]);

  function toggleCueAi(mode: "private" | "live") {
    setCueAiMode((current) => {
      if (current === mode) return "inactive";
      // Switching Private ↔ Live should keep the overlay up (no hide pulse).
      return mode;
    });
  }

  function bookmarkLatest() {
    const target = lines[lines.length - 1];
    if (!target) {
      setBookmarkCount((n) => n + 1);
      return;
    }
    setBookmarkedIds((ids) =>
      ids.includes(target.id) ? ids.filter((id) => id !== target.id) : [...ids, target.id]
    );
    setBookmarkCount((n) => n + 1);
  }

  function onAskSubmit(e: FormEvent) {
    e.preventDefault();
    const prompt = ask.trim();
    if (!prompt || asking) return;
    if (cueAiMode === "inactive") return;
    setAsk("");
    void answers.ask(prompt, {
      transcript: lines.map((line) => ({ who: line.speaker, text: line.text })),
    });
    if (cueAiMode === "private") {
      void openCompanionOverlay();
    }
  }

  const cueAiActive = cueAiMode !== "inactive";
  const showLiveProcessing =
    cueAiMode === "live" && cueAiProcessing === "listening" && !paused;
  const showInitializing = cueAiActive && cueAiProcessing === "initializing";

  return (
    <div data-live className="flex flex-col gap-4 animate-fade-up lg:h-[calc(100vh-7rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="ls-hero-title" style={{ fontSize: "clamp(1.25rem, 2.5vw, 1.5rem)" }}>
              {title}
            </h1>
            <Badge variant="success">
              <span className="ls-live-dot mr-1" />
              In meeting
            </Badge>
            {cueAiMode === "private" && <Badge variant="default">CueAI Private</Badge>}
            {cueAiMode === "live" && <Badge variant="default">CueAI Live</Badge>}
            {paused && <Badge variant="warning">Paused</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted">
            {config.kind === "interview" ? "Interview" : "Regular call"}
            {cueAiMode === "inactive"
              ? " · CueAI off"
              : cueAiMode === "private"
                ? " · Private assistant"
                : " · Live transcription"}
            {bookmarkCount > 0 ? ` · ${bookmarkCount} bookmarks` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="ls-mode-group">
            <span className="text-xs font-medium text-muted">CueAI</span>
            <div className="ls-mode-toggle">
              <button
                type="button"
                aria-pressed={cueAiMode === "private"}
                onClick={() => toggleCueAi("private")}
                className="ls-mode-btn"
              >
                Private
              </button>
              <button
                type="button"
                aria-pressed={cueAiMode === "live"}
                onClick={() => toggleCueAi("live")}
                className="ls-mode-btn"
              >
                Live
              </button>
            </div>
          </div>
          <span className="ls-timer">{formatTime(seconds)}</span>
          {desktopReady && (
            <Button
              variant={sharing ? "primary" : "outline"}
              size="sm"
              onClick={() => setSharing((s) => !s)}
              aria-pressed={sharing}
            >
              {sharing ? "Sharing · Presenter mode" : "Mark screen sharing"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setPaused((p) => !p)}>
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {paused ? "Resume" : "Pause"}
          </Button>
          <Link
            href={
              meetingId
                ? withDesktopParam(`/meetings/${meetingId}/summary`)
                : withDesktopParam("/meetings")
            }
            onClick={() =>
              onEnd(
                seconds,
                lines.map((l) => ({ who: l.speaker, text: l.text })),
              )
            }
          >
            <Button variant="danger" size="sm">
              <Square className="h-3.5 w-3.5" />
              End Session
            </Button>
          </Link>
        </div>
      </div>

      <div className="ls-panel flex items-center gap-4 p-4">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Mic className={cn("h-4 w-4", !paused && "text-foreground")} />
          Mic
        </div>
        <div className="flex h-10 flex-1 items-end gap-[3px]">
          {Array.from({ length: 48 }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "ls-wave-bar",
                !paused && cueAiMode === "live" && "wave-bar is-active",
                cueAiMode === "inactive" && "opacity-40"
              )}
              style={{
                height:
                  paused || cueAiMode === "inactive"
                    ? "30%"
                    : `${20 + ((i * 13) % 80)}%`,
                animationDelay: `${(i % 12) * 0.07}s`,
              }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted">
          <Volume2
            className={cn("h-4 w-4", cueAiMode === "live" ? "text-foreground" : "text-subtle")}
          />
          {cueAiMode === "live" ? "System audio" : "Meeting audio"}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1.25fr_0.85fr]">
        <div className="ls-panel flex min-h-[420px] flex-col overflow-hidden p-0 lg:min-h-0">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <p className="text-sm font-medium tracking-tight">Live transcript</p>
            <div className="flex items-center gap-1">
              <span className="mr-1 text-[11px] text-subtle">{bookmarkCount}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Bookmark latest line"
                onClick={bookmarkLatest}
                disabled={cueAiMode !== "live" || lines.length === 0}
              >
                <Bookmark className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div ref={scrollRef} className="cue-scroll flex-1 space-y-3 overflow-y-auto p-4">
            {cueAiMode === "inactive" && (
              <div className="ls-empty">
                <p className="text-sm font-medium">CueAI is off</p>
                <p className="max-w-sm text-xs text-muted">
                  Choose <span className="ls-highlight">Private</span> or{" "}
                  <span className="ls-highlight">Live</span> above to start the assistant. Your
                  meeting continues independently.
                </p>
              </div>
            )}
            {cueAiMode === "private" && (
              <div className="ls-empty">
                {showInitializing ? (
                  <>
                    <p className="text-sm font-medium">Starting CueAI Private…</p>
                    <p className="text-xs text-muted">Initializing private assistant</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">Private mode active</p>
                    <p className="max-w-sm text-xs text-muted">
                      The CueAI overlay is available privately. Switch to Live for full
                      transcription and AI suggestions in this workspace.
                    </p>
                    {askReply && <p className="ls-reply">{askReply}</p>}
                    {askNotice && <p className="mt-2 text-xs text-amber-400">{askNotice}</p>}
                  </>
                )}
              </div>
            )}
            {cueAiMode === "live" && lines.length === 0 && (
              <div className="ls-empty">
                <p className="text-sm font-medium">Waiting for a question…</p>
                <p className="max-w-sm text-xs text-muted">
                  Live transcript appears here when CueAI&apos;s live audio assistance captures speech. CueAI does
                  not invent meeting dialogue.
                </p>
              </div>
            )}
            {cueAiMode === "live" &&
              lines.map((line) => (
                <div
                  key={line.id}
                  className={cn(
                    "ls-line",
                    line.role === "You" && "is-you",
                    bookmarkedIds.includes(line.id) && "is-bookmarked"
                  )}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{line.speaker}</span>
                    <Badge variant="default">{line.role}</Badge>
                    {bookmarkedIds.includes(line.id) && (
                      <Badge variant="warning">Bookmarked</Badge>
                    )}
                    <span className="ml-auto font-mono text-[11px] text-subtle">
                      {line.time}
                    </span>
                    <button
                      type="button"
                      aria-label="Toggle bookmark"
                      className="rounded-md p-1 text-subtle hover:bg-[var(--surface-hover)] hover:text-foreground"
                      onClick={() => {
                        const was = bookmarkedIds.includes(line.id);
                        setBookmarkedIds((ids) =>
                          was ? ids.filter((id) => id !== line.id) : [...ids, line.id]
                        );
                        setBookmarkCount((n) => (was ? Math.max(0, n - 1) : n + 1));
                      }}
                    >
                      <Bookmark
                        className={cn(
                          "h-3.5 w-3.5",
                          bookmarkedIds.includes(line.id) && "fill-amber-400 text-amber-400"
                        )}
                      />
                    </button>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/90">{line.text}</p>
                  <p className="mt-1.5 text-[11px] text-subtle">
                    Confidence {(line.confidence * 100).toFixed(0)}%
                  </p>
                </div>
              ))}
            {showInitializing && cueAiMode === "live" && (
              <p className="px-2 text-xs text-muted">Starting CueAI Live…</p>
            )}
            {showLiveProcessing && (
              <div className="flex items-center gap-1.5 px-2 text-subtle">
                <span className="typing-dot h-1.5 w-1.5 rounded-full bg-foreground" />
                <span
                  className="typing-dot h-1.5 w-1.5 rounded-full bg-foreground"
                  style={{ animationDelay: "0.2s" }}
                />
                <span
                  className="typing-dot h-1.5 w-1.5 rounded-full bg-foreground"
                  style={{ animationDelay: "0.4s" }}
                />
                <span className="ml-2 text-xs">Listening…</span>
              </div>
            )}
          </div>
          <div className="border-t border-[var(--border)] px-4 py-3">
            <div className="ls-playhead">
              <div
                className={cn(
                  "ls-playhead-fill",
                  cueAiMode === "live" ? "opacity-100" : "w-[12%] opacity-40"
                )}
                style={cueAiMode === "live" ? { width: `${playheadPct}%` } : undefined}
              />
              {cueAiMode === "live" && (
                <>
                  <button
                    type="button"
                    className="ls-playhead-knob"
                    style={{ left: `${playheadPct}%` }}
                    aria-label="Scrub transcript playhead"
                    onClick={() => {
                      const next = playheadPct >= 85 ? 28 : playheadPct + 18;
                      setPlayheadPct(next);
                      scrollRef.current?.scrollTo({
                        top: (scrollRef.current.scrollHeight * next) / 100,
                        behavior: "smooth",
                      });
                    }}
                  />
                  <button
                    type="button"
                    className="ls-bookmark-mark"
                    style={{ left: "28%" }}
                    title="Jump to bookmark"
                    aria-label="Jump to bookmark"
                    onClick={() => {
                      setPlayheadPct(28);
                      const el = scrollRef.current;
                      if (!el) return;
                      el.scrollTo({ top: el.scrollHeight * 0.28, behavior: "smooth" });
                    }}
                  />
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-4">
          <div className="ls-panel flex-1 space-y-3 overflow-y-auto p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium tracking-tight">AI suggestions</p>
              {cueAiMode === "live" && cueAiProcessing === "listening" ? (
                <Badge variant="default">Streaming</Badge>
              ) : cueAiMode === "private" ? (
                <Badge variant="default">Private</Badge>
              ) : (
                <Badge>Off</Badge>
              )}
            </div>
            {cueAiMode !== "live" && (
              <div className="flex min-h-[160px] flex-col items-center justify-center rounded-[12px] border border-dashed border-[var(--border)] px-4 py-8 text-center">
                <p className="text-sm text-muted">
                  {cueAiMode === "private"
                    ? "Private mode uses the desktop overlay. Ask below or switch to Live for in-workspace suggestions."
                    : "Enable CueAI Live to stream AI suggestions for this meeting."}
                </p>
                {askReply && cueAiMode === "private" && (
                  <p className="mt-3 text-left text-xs text-foreground/90">{askReply}</p>
                )}
                {askNotice && cueAiMode === "private" && (
                  <p className="mt-2 text-left text-xs text-amber-400">{askNotice}</p>
                )}
              </div>
            )}
            {cueAiMode === "live" &&
              cueAiProcessing === "listening" &&
              answers.items.length === 0 && (
                <p className="px-1 py-6 text-sm text-muted">No AI answers yet.</p>
              )}
            {cueAiMode === "live" &&
              cueAiProcessing === "listening" &&
              answers.items.map((item) => (
                <LiveAnswerCard
                  key={item.id}
                  item={item}
                  onPin={() => answers.togglePin(item.id)}
                  onRegenerate={() => answers.regenerate(item.id)}
                  onStop={() => answers.stop(item.id)}
                />
              ))}
            {cueAiMode === "live" && showInitializing && (
              <p className="text-xs text-muted">Preparing suggestions…</p>
            )}
          </div>

          <div className="ls-panel p-3">
            <form className="flex gap-2" onSubmit={onAskSubmit}>
              <input
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
                className="ls-ask-input"
                placeholder={
                  cueAiActive ? "Ask CueAI anything…" : "Enable CueAI Private or Live to ask…"
                }
                disabled={!cueAiActive || asking}
              />
              <Button
                type="submit"
                variant="primary"
                disabled={!cueAiActive || asking || !ask.trim()}
              >
                {asking ? "…" : "Ask"}
              </Button>
            </form>
            <p className="mt-2 text-center text-[11px] text-subtle">
              Hotkey {formatShortcut("mod", "shift", "Space")} · Privacy: audio only
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}
