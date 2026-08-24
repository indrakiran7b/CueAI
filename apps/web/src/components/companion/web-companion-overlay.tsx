"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  GripVertical,
  Languages,
  ListTodo,
  Minimize2,
  Pin,
  Presentation,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CaptureStatus, MeetingSession } from "@/lib/desktop";
import { CompanionAI, CompanionTranslation } from "./companion-services";
import { useWebCompanion, type CompanionMode, type CompanionPanel } from "./web-companion-provider";

type Pos = { x: number; y: number };

const MODE_SIZE: Record<CompanionMode, { width: number; height: number }> = {
  full: { width: 380, height: 420 },
  mini: { width: 300, height: 220 },
  collapsed: { width: 240, height: 64 },
  presenter: { width: 340, height: 200 },
};

const transcript = [
  { who: "Sarah", text: "Can we ship before the board meeting?" },
  { who: "Alex", text: "If QA finishes by Thursday, yes." },
  { who: "You", text: "CueAI — what's left in QA?" },
];

const suggestions = [
  "Summarize risks for the board",
  "Draft action items",
  "Translate last answer",
];

function defaultPos(mode: CompanionMode): Pos {
  if (typeof window === "undefined") return { x: 24, y: 24 };
  const { width, height } = MODE_SIZE[mode];
  return {
    x: Math.max(8, window.innerWidth - width - 24),
    y: Math.max(8, Math.round(window.innerHeight * 0.12)),
  };
}

function clampPos(pos: Pos, mode: CompanionMode): Pos {
  if (typeof window === "undefined") return pos;
  const { width, height } = MODE_SIZE[mode];
  const maxX = Math.max(8, window.innerWidth - width - 8);
  const maxY = Math.max(8, window.innerHeight - height - 8);
  return {
    x: Math.min(maxX, Math.max(8, pos.x)),
    y: Math.min(maxY, Math.max(8, pos.y)),
  };
}

export function WebCompanionOverlay() {
  const router = useRouter();
  const {
    isOpen,
    close,
    mode,
    setMode,
    panel,
    setPanel,
    pinned,
    setPinned,
    session,
    setSession,
    capture,
    setCapture,
  } = useWebCompanion();

  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [dragging, setDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [ask, setAsk] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [answer, setAnswer] = useState(
    "QA has 14 SP left. Velocity supports Wednesday EOD finish — Thursday remains buffer before the 5pm deck freeze."
  );
  const [confidence, setConfidence] = useState(0.92);
  const [bookmarkCount, setBookmarkCount] = useState(2);
  const [answerPinned, setAnswerPinned] = useState(false);
  const [copied, setCopied] = useState(false);
  const [translated, setTranslated] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [activeLang, setActiveLang] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (isOpen && pos === null) setPos(defaultPos(mode));
  }, [isOpen, pos, mode]);

  useEffect(() => {
    if (!isOpen) return;
    setPos((p) => (p ? clampPos(p, mode) : defaultPos(mode)));
  }, [mode, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || isMobile || !pos) return;
    const target = e.target as HTMLElement;
    if (target.closest("a, button, input, textarea, .no-drag")) return;

    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
    };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    setPos(clampPos({ x: drag.originX + dx, y: drag.originY + dy }, mode));
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }

  async function runAsk(prompt: string) {
    const q = prompt.trim();
    if (!q || streaming) return;
    setStreaming(true);
    setPanel("answer");
    setAnswerPinned(false);
    setCopied(false);
    try {
      const result = await CompanionAI.ask(q);
      setAnswer(result.answer);
      setConfidence(result.confidence);
      setTranslated(null);
      setActiveLang(null);
    } finally {
      setStreaming(false);
    }
  }

  async function onAsk(e: FormEvent) {
    e.preventDefault();
    const prompt = ask.trim();
    if (!prompt) return;
    setAsk("");
    await runAsk(prompt);
  }

  async function copyAnswer() {
    try {
      await navigator.clipboard.writeText(translated || answer);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  async function onEndSession() {
    if (ending) return;
    setEnding(true);
    try {
      const next: MeetingSession = {
        active: false,
        screenSharing: false,
        cueAiMode: "inactive",
      };
      setSession(next);
      window.dispatchEvent(new CustomEvent("cueai:end-session"));
      close();
      router.push("/meetings/live");
    } finally {
      setEnding(false);
    }
  }

  const privacyOn = capture.requested !== false;

  function togglePrivacy() {
    const nextRequested = !privacyOn;
    const next: CaptureStatus = {
      requested: nextRequested,
      applied: false,
      supported: false,
      message: nextRequested
        ? "Privacy preference saved — screen-share exclusion requires CueAI Desktop"
        : "Visible in screen share (web overlay cannot exclude capture)",
    };
    setCapture(next);
  }

  const presenting = mode === "presenter" || session.screenSharing;
  const size = MODE_SIZE[mode];

  if (!isOpen || !mounted) return null;

  const style: CSSProperties | undefined = isMobile
    ? undefined
    : pos
      ? { left: pos.x, top: pos.y, width: size.width, height: size.height }
      : { width: size.width, height: size.height };

  const overlay = (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="CueAI Companion"
      aria-modal="false"
      className={cn(
        "cue-web-companion fixed z-[80] flex flex-col p-0",
        isMobile && "inset-x-2 bottom-2 top-auto h-auto w-auto max-h-[min(90vh,420px)]"
      )}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className={cn(
          "companion-shell flex h-full flex-col overflow-hidden rounded-2xl",
          mode === "collapsed" && "justify-center"
        )}
      >
        <header
          className={cn(
            "flex items-center gap-1.5 border-b border-[var(--border)] px-3 py-2",
            isMobile ? "cursor-default" : dragging ? "cursor-grabbing" : "cursor-grab"
          )}
        >
          {!isMobile && (
            <GripVertical className="h-3.5 w-3.5 text-subtle" aria-hidden />
          )}
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-foreground text-[var(--background)]">
            <Sparkles className="h-3 w-3" />
          </span>
          <span className="text-[12px] font-semibold tracking-tight text-foreground">
            CueAI
          </span>
          {session.cueAiMode === "private" && (
            <StatusChip>Private</StatusChip>
          )}
          {session.cueAiMode === "live" && (
            <StatusChip tone="live">Live</StatusChip>
          )}
          <button
            type="button"
            title={
              capture.message ||
              (privacyOn ? "Hidden from screen share" : "Visible in screen share")
            }
            onClick={togglePrivacy}
            className={cn(
              "no-drag inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold transition-colors",
              privacyOn
                ? "border-[var(--border)] bg-[var(--surface-active)] text-foreground hover:bg-[var(--surface-hover)]"
                : "border-[var(--border-strong)] bg-[var(--primary-muted)] text-muted hover:text-foreground"
            )}
          >
            {privacyOn ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
            Privacy {privacyOn ? "on" : "off"}
          </button>
          <div className="no-drag ml-auto flex items-center gap-0.5">
            <IconBtn
              label={pinned ? "Unpin (visual only on web)" : "Pin (visual only on web)"}
              onClick={() => setPinned(!pinned)}
            >
              <Pin className={cn("h-3 w-3", pinned && "text-[var(--accent)]")} />
            </IconBtn>
            <IconBtn
              label="Presenter mode"
              onClick={() => setMode(mode === "presenter" ? "full" : "presenter")}
            >
              <Presentation className={cn("h-3 w-3", presenting && "text-[var(--accent)]")} />
            </IconBtn>
            {!presenting && (
              <IconBtn
                label="Mini"
                onClick={() => setMode(mode === "mini" ? "full" : "mini")}
              >
                <Minimize2 className="h-3 w-3" />
              </IconBtn>
            )}
            <IconBtn label="Hide" onClick={close}>
              <X className="h-3 w-3" />
            </IconBtn>
          </div>
        </header>

        {mode !== "collapsed" && (
          <div className="no-drag border-b border-[var(--border)] bg-[var(--primary-muted)] px-3 py-1.5 text-[10px] leading-snug text-muted">
            <span className="font-medium text-foreground">Limited browser preview.</span>{" "}
            System-wide always-on-top and screen-share privacy need{" "}
            <button
              type="button"
              className="text-[var(--accent)] underline-offset-2 hover:underline"
              onClick={() => router.push("/companion")}
            >
              CueAI Desktop
            </button>
            . Closing this tab dismisses this preview.
          </div>
        )}

        {mode === "collapsed" ? (
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-40" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
              </span>
              Listening · Privacy {privacyOn ? "on" : "off"}
            </div>
            <button
              type="button"
              className="no-drag rounded-full px-2 py-0.5 text-[10px] font-medium text-foreground hover:bg-[var(--surface-hover)]"
              onClick={() => setMode("full")}
            >
              Expand
            </button>
          </div>
        ) : (
          <div className="no-drag flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2.5">
            {mode === "full" && (
              <div className="companion-nested flex gap-0.5 rounded-lg p-0.5">
                {(
                  [
                    ["answer", "Answer"],
                    ["transcript", "Transcript"],
                    ["actions", "Actions"],
                    ["translate", "Translate"],
                  ] as const satisfies ReadonlyArray<readonly [CompanionPanel, string]>
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPanel(id)}
                    className={cn(
                      "flex-1 rounded-md px-1.5 py-1 text-[10px] font-medium transition-colors",
                      panel === id
                        ? "companion-nested-strong text-foreground shadow-sm"
                        : "text-muted hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {mode === "full" && panel === "transcript" && (
              <div className="companion-nested max-h-28 space-y-1.5 overflow-y-auto rounded-xl border p-2.5 text-[11px]">
                {transcript.map((line) => (
                  <p key={line.text}>
                    <span className="font-medium text-[var(--accent)]">{line.who}:</span>{" "}
                    <span className="text-foreground">{line.text}</span>
                  </p>
                ))}
              </div>
            )}

            {mode === "full" && panel === "actions" && (
              <div className="companion-nested space-y-0.5 rounded-xl border p-2.5 text-[11px]">
                <p className="mb-1 inline-flex items-center gap-1 font-medium text-muted">
                  <ListTodo className="h-3 w-3" /> Suggested next steps
                </p>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-foreground hover:bg-[var(--surface-hover)]"
                    onClick={() => void runAsk(s)}
                    disabled={streaming}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {mode === "full" && panel === "translate" && (
              <div className="companion-nested space-y-1.5 rounded-xl border p-2.5 text-[11px]">
                <p className="inline-flex items-center gap-1 font-medium text-muted">
                  <Languages className="h-3 w-3" /> Live translation
                </p>
                <div className="flex gap-1">
                  {["es", "fr", "de", "ja"].map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      className={cn(
                        "rounded-full border px-2 py-0.5 uppercase transition-colors",
                        activeLang === lang
                          ? "border-[var(--accent)] text-[var(--accent)]"
                          : "border-[var(--border)] text-muted hover:border-[var(--border-strong)] hover:text-foreground"
                      )}
                      onClick={() => {
                        setActiveLang(lang);
                        void CompanionTranslation.translate(answer, lang).then((r) =>
                          setTranslated(r.text)
                        );
                      }}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
                <p className="text-foreground">{translated || answer}</p>
              </div>
            )}

            {(panel === "answer" || mode !== "full") && (
              <div
                className={cn(
                  "companion-answer-panel rounded-xl p-2.5",
                  presenting && "flex-1"
                )}
              >
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-muted">
                  <Sparkles className="h-3 w-3 text-[var(--accent)]" />
                  {presenting ? "Presenter answer" : "AI Answer"}
                  {!streaming && (
                    <span className="ml-auto text-[9px] text-subtle">
                      {Math.round(confidence * 100)}%
                    </span>
                  )}
                </div>
                {streaming ? (
                  <div className="flex gap-1 py-1.5" aria-label="Generating answer">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="typing-dot h-1.5 w-1.5 rounded-full"
                        style={{ animationDelay: `${i * 0.2}s` }}
                      />
                    ))}
                  </div>
                ) : (
                  <p
                    className={cn(
                      "leading-snug text-foreground",
                      mode === "mini" ? "text-[11px]" : "text-xs"
                    )}
                  >
                    {mode === "mini" ? "QA can finish by Wed EOD." : answer}
                  </p>
                )}
                {!streaming && mode !== "mini" && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Chip onClick={() => setAnswerPinned((p) => !p)}>
                      <Pin className={cn("h-2.5 w-2.5", answerPinned && "text-[var(--accent)]")} />
                      {answerPinned ? "Pinned" : "Pin"}
                    </Chip>
                    <Chip onClick={() => void copyAnswer()}>
                      <Copy className="h-2.5 w-2.5" />
                      {copied ? "Copied" : "Copy"}
                    </Chip>
                    <Chip onClick={() => void runAsk("regenerate")}>
                      <RefreshCw className="h-2.5 w-2.5" />
                    </Chip>
                    {!presenting && (
                      <>
                        <Chip onClick={() => setBookmarkCount((n) => n + 1)}>
                          <Bookmark className="h-2.5 w-2.5" /> {bookmarkCount}
                        </Chip>
                        <Chip onClick={() => void runAsk("Explain this simply")}>
                          <Search className="h-2.5 w-2.5" /> Explain
                        </Chip>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {!presenting && mode !== "mini" && (
              <form className="flex gap-1.5" onSubmit={(e) => void onAsk(e)}>
                <input
                  value={ask}
                  onChange={(e) => setAsk(e.target.value)}
                  placeholder="Ask CueAI…"
                  className="companion-nested h-8 flex-1 rounded-full border px-3 text-[11px] text-foreground outline-none placeholder:text-subtle focus:border-[var(--border-strong)] focus:ring-1 focus:ring-[var(--ring)]"
                />
                <button
                  type="submit"
                  disabled={streaming || !ask.trim()}
                  className="companion-btn-primary h-8 rounded-full px-3.5 text-[11px] font-semibold"
                >
                  {streaming ? "…" : "Ask"}
                </button>
              </form>
            )}

            {mode === "full" && panel === "answer" && (
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-1">
                  {(["Summarize", "Actions", "Risks"] as const).map((q) => (
                    <button
                      key={q}
                      type="button"
                      disabled={streaming}
                      className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] text-muted hover:border-[var(--border-strong)] hover:text-foreground disabled:opacity-50"
                      onClick={() => void runAsk(q)}
                    >
                      {q}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="ml-auto inline-flex items-center gap-0.5 text-[9px] text-[var(--accent)] hover:underline"
                    onClick={() => {
                      router.push("/dashboard");
                    }}
                  >
                    Dashboard <ExternalLink className="h-2.5 w-2.5" />
                  </button>
                </div>
                <button
                  type="button"
                  disabled={ending}
                  onClick={() => void onEndSession()}
                  className="companion-nested-strong inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-full border px-2 text-[11px] font-semibold text-foreground hover:bg-[var(--surface-hover)] disabled:opacity-60"
                >
                  <Square className="h-3 w-3 fill-current text-[var(--cue-danger)]" />
                  {ending ? "Ending…" : "End Session"}
                </button>
              </div>
            )}

            {!(mode === "full" && panel === "answer") && (
              <div className="flex items-center">
                <button
                  type="button"
                  disabled={ending}
                  onClick={() => void onEndSession()}
                  className="companion-nested-strong inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full border px-2 text-[11px] font-semibold text-foreground hover:bg-[var(--surface-hover)] disabled:opacity-60"
                >
                  <Square className="h-3 w-3 fill-current text-[var(--cue-danger)]" />
                  {ending ? "Ending…" : "End Session"}
                </button>
              </div>
            )}

            {mode === "mini" && (
              <button
                type="button"
                className="text-[9px] text-subtle hover:text-muted"
                onClick={() => setMode("collapsed")}
              >
                Collapse · Esc hides
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

function StatusChip({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: "live";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold",
        tone === "live"
          ? "border-[rgba(0,153,255,0.35)] bg-[var(--accent-muted)] text-[var(--accent)]"
          : "border-[var(--border)] bg-[var(--surface-active)] text-muted"
      )}
    >
      {tone === "live" && (
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
      )}
      {children}
    </span>
  );
}

function IconBtn({
  children,
  onClick,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded-lg p-1 text-muted transition-colors hover:bg-[var(--surface-hover)] hover:text-foreground"
    >
      {children}
    </button>
  );
}

function Chip({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="companion-nested inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px] text-muted transition-colors hover:border-[var(--border-strong)] hover:text-foreground"
    >
      {children}
    </button>
  );
}
