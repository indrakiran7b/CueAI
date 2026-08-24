"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Bookmark,
  Hash,
  Mic,
  MonitorPlay,
  Pause,
  Pin,
  Play,
  RefreshCw,
  Square,
  Users,
  Video,
  Volume2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { aiAnswers, transcript } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import {
  getDesktop,
  hideCompanionOverlay,
  isDesktopApp,
  openCompanionOverlay,
  startDesktopMeetingSession,
} from "@/lib/desktop";
import Link from "next/link";
import "./live-session.css";

type MeetingPlatform = "meet" | "teams" | "zoom" | "slack" | "webex";

type PlatformOption = {
  id: MeetingPlatform;
  name: string;
  description: string;
  icon: ReactNode;
};

type Suggestion = (typeof aiAnswers)[number] & { regenerating?: boolean };

const PLATFORMS: PlatformOption[] = [
  {
    id: "meet",
    name: "Google Meet",
    description: "Join or create a Google Meet session",
    icon: <Video className="h-5 w-5" />,
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    description: "Join or create a Microsoft Teams session",
    icon: <Users className="h-5 w-5" />,
  },
  {
    id: "zoom",
    name: "Zoom",
    description: "Join or create a Zoom session",
    icon: <Video className="h-5 w-5" />,
  },
  {
    id: "slack",
    name: "Slack Huddles",
    description: "Join or create a Slack Huddle",
    icon: <Hash className="h-5 w-5" />,
  },
  {
    id: "webex",
    name: "Webex",
    description: "Join or create a Webex session",
    icon: <MonitorPlay className="h-5 w-5" />,
  },
];

const PLATFORM_LABEL: Record<MeetingPlatform, string> = {
  meet: "Google Meet",
  teams: "Microsoft Teams",
  zoom: "Zoom",
  slack: "Slack Huddles",
  webex: "Webex",
};

const DEFAULT_ASK_ANSWER =
  "Based on the live transcript, the team is aligned on shipping before the board meeting if QA clears by Thursday.";

export default function LiveMeetingPage() {
  const [session, setSession] = useState<{
    platform: MeetingPlatform;
    title: string;
  } | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Refresh / direct navigation lands on setup and never auto-starts.
  // In-memory `session` keeps an active view if the user re-clicks Live Session
  // without leaving the page.
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      try {
        if (isDesktopApp()) {
          const desktop = getDesktop();
          const current = await Promise.race([
            desktop?.getMeetingSession() ?? Promise.resolve(undefined),
            new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 1500)),
          ]);
          if (current?.active) {
            await desktop?.setMeetingSession({
              active: false,
              screenSharing: false,
              cueAiMode: "inactive",
            });
            await desktop?.hideCompanion();
          }
        }
      } catch {
        // Ignore desktop IPC failures — still show the setup UI.
      }
      if (!cancelled) setHydrated(true);
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onEndFromOverlay() {
      setSession(null);
      void hideCompanionOverlay();
      void startDesktopMeetingSession({
        active: false,
        screenSharing: false,
        cueAiMode: "inactive",
        hideCompanion: true,
      });
    }
    window.addEventListener("cueai:end-session", onEndFromOverlay);
    return () => window.removeEventListener("cueai:end-session", onEndFromOverlay);
  }, []);

  function startPlatformSession(platform: MeetingPlatform) {
    const title = `${PLATFORM_LABEL[platform]} live session`;
    // Fire the popout immediately — same window as Ctrl+Shift+Space.
    void openCompanionOverlay();
    void startDesktopMeetingSession({
      active: true,
      screenSharing: false,
      meetingId: `live-${platform}`,
      title,
      cueAiMode: "private",
      showCompanion: true,
    });
    setSession({ platform, title });
  }

  function endSession() {
    setSession(null);
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

  if (!session) {
    return <LiveSessionSetup onStart={startPlatformSession} />;
  }

  return (
    <ActiveLiveSession
      platform={session.platform}
      title={session.title}
      onEnd={endSession}
    />
  );
}

function LiveSessionSetup({
  onStart,
}: {
  onStart: (platform: MeetingPlatform) => void;
}) {
  return (
    <div data-live className="space-y-8 animate-fade-up" style={{ maxWidth: "64rem" }}>
      <div>
        <h1 className="ls-hero-title">Start a Live Session</h1>
        <p className="ls-hero-sub">
          Choose your meeting platform to begin an AI-assisted live session.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {PLATFORMS.map((platform) => (
          <div
            key={platform.id}
            className="ls-panel ls-panel-hover flex flex-col p-5"
          >
            <div className="ls-platform-icon mb-4">{platform.icon}</div>
            <h3 className="text-base font-medium tracking-tight">{platform.name}</h3>
            <p className="mt-1.5 flex-1 text-sm text-muted">{platform.description}</p>
            <Button
              className="mt-5 w-full"
              variant="primary"
              onClick={() => onStart(platform.id)}
            >
              Start Session
            </Button>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-subtle">
        Starting a session opens the CueAI companion overlay (same as Ctrl+Shift+Space). Keep CueAI
        Desktop running for the pop-out window.
      </p>
    </div>
  );
}

type CueAiMode = "inactive" | "private" | "live";
type CueAiProcessing = "idle" | "initializing" | "listening" | "stopped" | "error";

function ActiveLiveSession({
  platform,
  title,
  onEnd,
}: {
  platform: MeetingPlatform;
  title: string;
  onEnd: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [lines, setLines] = useState<typeof transcript>([]);
  const [sharing, setSharing] = useState(false);
  // Client-only mount after Start Session click — start in Private (opens overlay).
  const [cueAiMode, setCueAiMode] = useState<CueAiMode>("private");
  const [cueAiProcessing, setCueAiProcessing] = useState<CueAiProcessing>("initializing");
  const [desktopReady, setDesktopReady] = useState(false);
  const [bookmarkCount, setBookmarkCount] = useState(1);
  const [bookmarkedIds, setBookmarkedIds] = useState<number[]>([2]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>(() =>
    aiAnswers.map((a) => ({ ...a }))
  );
  const [ask, setAsk] = useState("");
  const [asking, setAsking] = useState(false);
  const [askReply, setAskReply] = useState<string | null>(null);
  const [playheadPct, setPlayheadPct] = useState(62);
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
        meetingId: `live-${platform}`,
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
  }, [platform, title, cueAiMode, sharing]);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [paused]);

  // Transcript / AI simulation only in CueAI Live after initialization.
  useEffect(() => {
    if (cueAiMode !== "live" || cueAiProcessing !== "listening" || paused) return;

    if (lines.length === 0) {
      setLines(transcript);
    }

    const extra = [
      "We should confirm SSO requirements with Security before Phase 3.",
      "Knowledge base citations need to show source titles in the Companion.",
      "Let's bookmark this decision for the summary.",
    ];
    let i = 0;
    const t = setInterval(() => {
      const text = extra[i % extra.length];
      i += 1;
      setLines((prev) => [
        ...prev,
        {
          id: prev.length + 1,
          speaker: i % 2 === 0 ? "Priya Nair" : "Marcus Lee",
          role: i % 2 === 0 ? "PM" : "Eng",
          text,
          time: formatTime(seconds + i),
          confidence: 0.93 + (i % 5) * 0.01,
        },
      ]);
    }, 5000);
    return () => clearInterval(t);
  }, [cueAiMode, cueAiProcessing, paused, seconds, lines.length]);

  useEffect(() => {
    if (cueAiMode === "inactive") {
      setLines([]);
      setAskReply(null);
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

  function togglePin(id: string) {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s))
    );
  }

  async function regenerateSuggestion(id: string) {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, regenerating: true } : s))
    );
    await new Promise((r) => setTimeout(r, 450));
    setSuggestions((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              regenerating: false,
              answer: `Refreshed: ${s.answer.replace(/^Refreshed:\s*/, "")}`,
            }
          : s
      )
    );
  }

  async function onAskSubmit(e: FormEvent) {
    e.preventDefault();
    const prompt = ask.trim();
    if (!prompt || asking) return;
    if (cueAiMode === "inactive") return;
    setAsking(true);
    setAsk("");
    await new Promise((r) => setTimeout(r, 400));
    const lower = prompt.toLowerCase();
    const reply =
      lower.includes("latency")
        ? "Target p95 under 800ms for live suggestions; defer full RAG when confidence drops below 0.7."
        : lower.includes("risk")
          ? "Main risks: QA slip past Thursday and unestimated design polish compressing the buffer."
          : `${DEFAULT_ASK_ANSWER} (re: “${prompt.slice(0, 60)}”)`;
    setAskReply(reply);
    setSuggestions((prev) => [
      {
        id: `ask_${Date.now()}`,
        question: prompt,
        answer: reply,
        pinned: false,
      },
      ...prev,
    ]);
    if (cueAiMode === "private") {
      void openCompanionOverlay();
    }
    setAsking(false);
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
            {PLATFORM_LABEL[platform]}
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
          <Link href="/meetings/m2/summary" onClick={onEnd}>
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
                      The CueAI companion is available privately. Switch to Live for full
                      transcription and AI suggestions in this workspace.
                    </p>
                    {askReply && <p className="ls-reply">{askReply}</p>}
                  </>
                )}
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
                    ? "Private mode uses the companion overlay. Ask below or switch to Live for in-workspace suggestions."
                    : "Enable CueAI Live to stream AI suggestions for this meeting."}
                </p>
                {askReply && cueAiMode === "private" && (
                  <p className="mt-3 text-left text-xs text-foreground/90">{askReply}</p>
                )}
              </div>
            )}
            {cueAiMode === "live" &&
              cueAiProcessing === "listening" &&
              suggestions.map((a) => (
                <div key={a.id} className="ls-suggestion">
                  <p className="ls-suggestion-q">{a.question}</p>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/90">
                    {a.regenerating ? "Regenerating…" : a.answer}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant={a.pinned ? "primary" : "outline"}
                      onClick={() => togglePin(a.id)}
                    >
                      <Pin className="h-3 w-3" />
                      {a.pinned ? "Pinned" : "Pin"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={a.regenerating}
                      onClick={() => void regenerateSuggestion(a.id)}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Regenerate
                    </Button>
                  </div>
                </div>
              ))}
            {cueAiMode === "live" && showInitializing && (
              <p className="text-xs text-muted">Preparing suggestions…</p>
            )}
          </div>

          <div className="ls-panel p-3">
            <form className="flex gap-2" onSubmit={(e) => void onAskSubmit(e)}>
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
              Hotkey ⌘⇧Space · Privacy: audio only
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
