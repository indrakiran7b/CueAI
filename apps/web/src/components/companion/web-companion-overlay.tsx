"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Camera, Copy, MoreHorizontal, Shield, ShieldOff, Sparkles, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDesktop, type MeetingSession } from "@/lib/desktop";
import { CompanionAI } from "./companion-services";
import { useWebCompanion } from "./web-companion-provider";

type Pos = { x: number; y: number };

function overlaySize(
  boardOpen: boolean,
  menuOpen: boolean,
  isMobile: boolean,
  viewport: { w: number; h: number },
) {
  const vw = viewport?.w || 1280;
  const vh = viewport?.h || 800;
  const maxW = Math.max(280, vw - 16);
  const maxH = Math.max(76, vh - 24);
  if (isMobile) {
    return {
      width: maxW,
      height: boardOpen ? Math.min(520, maxH) : menuOpen ? Math.min(280, maxH) : 76,
    };
  }
  return {
    width: Math.min(boardOpen ? 880 : 720, maxW),
    height: boardOpen ? Math.min(540, maxH) : menuOpen ? Math.min(340, maxH) : 76,
  };
}

const transcriptSeed = [
  { who: "Sarah", text: "Can we ship before the board meeting?" },
  { who: "Alex", text: "If QA finishes by Thursday, yes." },
];

function answerLines(text: string) {
  const bullets = text
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
  if (bullets.length > 1) return bullets;
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return sentences.length > 1 ? sentences.slice(0, 6) : [text.trim()];
}

function clampPos(pos: Pos, size: { width: number; height: number }): Pos {
  if (typeof window === "undefined") return pos;
  return {
    x: Math.min(Math.max(8, pos.x), Math.max(8, window.innerWidth - size.width - 8)),
    y: Math.min(Math.max(8, pos.y), Math.max(8, window.innerHeight - size.height - 8)),
  };
}

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function WebCompanionOverlay() {
  const router = useRouter();
  const { isOpen, close, setSession, session, capture, setCapture } = useWebCompanion();

  const panelRef = useRef<HTMLDivElement>(null);
  const askRef = useRef<HTMLInputElement>(null);
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
  const [answer, setAnswer] = useState("");
  const [question, setQuestion] = useState("");
  const [copied, setCopied] = useState(false);
  const [ending, setEnding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ w: 1280, h: 800 });
  const startedAtRef = useRef(Date.now());
  const meetingKeyRef = useRef<string | null>(null);

  const privacyOn = capture?.requested !== false;
  const hasAnswer = Boolean(answer.trim());
  const boardOpen = streaming || hasAnswer || Boolean(question.trim());
  const size = overlaySize(boardOpen, menuOpen, isMobile, viewport);
  const narrow = size.width < 580;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    void getDesktop()?.getCaptureStatus?.().then((status) => {
      if (status) setCapture(status);
    });
  }, [setCapture]);

  useEffect(() => {
    const key = session.meetingId || null;
    if (!session.active || !key) {
      if (!session.active) meetingKeyRef.current = null;
      return;
    }
    if (meetingKeyRef.current === key) return;
    meetingKeyRef.current = key;
    setAsk("");
    setAnswer("");
    setQuestion("");
    setNotice(null);
    setMenuOpen(false);
    startedAtRef.current = Date.now();
    setElapsedMs(0);
  }, [session.active, session.meetingId]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => {
      setIsMobile(mq.matches);
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };
    update();
    mq.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      mq.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setPos((current) => {
      if (current) return clampPos(current, size);
      return {
        x: Math.max(8, Math.round((window.innerWidth - size.width) / 2)),
        y: 16,
      };
    });
  }, [isOpen, size.width, size.height]);

  useEffect(() => {
    if (!isOpen) return;
    const id = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 1000);
    return () => window.clearInterval(id);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  function rememberQuestion(next: string) {
    const text = next.trim();
    if (text) setQuestion(text);
  }

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
    setPos(
      clampPos(
        { x: drag.originX + (e.clientX - drag.startX), y: drag.originY + (e.clientY - drag.startY) },
        size,
      ),
    );
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

  async function runAsk(prompt: string, image?: string) {
    const q = prompt.trim();
    if (!q || (streaming && !image)) return;
    if (!image) rememberQuestion(q);
    setStreaming(true);
    try {
      const result = await CompanionAI.ask(q, transcriptSeed, image);
      setAnswer(result.answer);
      setNotice(result.notice ?? null);
    } finally {
      setStreaming(false);
    }
  }

  async function analyzeScreen() {
    rememberQuestion("What's on screen?");
    setStreaming(true);
    try {
      const shot = await getDesktop()?.captureScreenshot?.({ save: false });
      if (!shot?.ok || !shot.dataUrl) {
        setNotice(shot?.error || "Could not capture the screen. Use CueAI Desktop for Screen.");
        setStreaming(false);
        return;
      }
      await runAsk(
        "What is happening on this screen? Describe it briefly, then give me a first-person interview-ready answer I can say out loud if there is a question, coding problem, or prompt.",
        shot.dataUrl,
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Screenshot failed.");
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
    if (!answer) return;
    try {
      await navigator.clipboard.writeText(answer);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  function clearBoard() {
    setAnswer("");
    setQuestion("");
    setNotice(null);
  }

  async function togglePrivacy() {
    const next = !privacyOn;
    setCapture({
      requested: next,
      applied: false,
      supported: Boolean(getDesktop()?.setExcludeCapture),
      message: next
        ? "Privacy on — hide CueAI from screen share when Desktop is available"
        : "Privacy off — overlay may appear in screen share",
    });
    const status = await getDesktop()?.setExcludeCapture?.(next);
    if (status) setCapture(status);
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
      clearBoard();
      close();
      router.push("/meetings/live");
    } finally {
      setEnding(false);
    }
  }

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
        "cue-web-companion ov-root fixed z-[80]",
        isMobile && "inset-x-2 top-2 h-auto w-auto max-h-[min(90vh,520px)]",
        menuOpen && "is-menu",
        narrow && "is-narrow",
        dragging && "cursor-grabbing",
      )}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="ov-bar">
        {!narrow && <span className="ov-brand">CueAI</span>}
        <form className="ov-ask no-drag" onSubmit={(e) => void onAsk(e)}>
          <input
            ref={askRef}
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder={narrow ? "Ask…" : "Ask a question"}
          />
        </form>
        <button
          type="button"
          className={cn("ov-btn no-drag", streaming && "is-on")}
          aria-label="Answer"
          onClick={() =>
            void runAsk(
              question ||
                "Give me a ready-to-say self-introduction from my resume and the job briefing.",
            )
          }
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="ov-btn-label">Answer</span>
        </button>
        <button
          type="button"
          className="ov-btn no-drag"
          aria-label="Screen"
          onClick={() => void analyzeScreen()}
        >
          <Camera className="h-3.5 w-3.5" />
          <span className="ov-btn-label">Screen</span>
        </button>
        <span className="ov-timer">{formatElapsed(elapsedMs)}</span>
        <button
          type="button"
          className={cn("ov-icon no-drag", privacyOn && "is-on")}
          aria-label={privacyOn ? "Privacy on" : "Privacy off"}
          aria-pressed={privacyOn}
          title={privacyOn ? "Privacy on — hidden from screen share" : "Privacy off — visible on screen share"}
          onClick={() => void togglePrivacy()}
        >
          {privacyOn ? <Shield className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}
        </button>
        <div className="ov-more no-drag">
          <button
            type="button"
            className="ov-icon"
            aria-label="More"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="ov-menu" role="menu">
              <button type="button" role="menuitem" className="is-danger" onClick={() => void onEndSession()}>
                <Square className="h-3 w-3 fill-current" />
                {ending ? "Ending…" : "End"}
              </button>
            </div>
          )}
        </div>
        <button type="button" className="ov-icon no-drag" aria-label="Hide" onClick={close}>
          <X className="h-4 w-4" />
        </button>
      </div>

      {boardOpen && (
        <section className="ov-card no-drag">
          <header>
            <p>{question || "Working…"}</p>
            <div>
              {hasAnswer && (
                <button type="button" onClick={() => void copyAnswer()}>
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? "Copied" : "Copy"}
                </button>
              )}
              <button type="button" onClick={clearBoard}>
                Close
              </button>
            </div>
          </header>
          {notice && <p className="ov-error">{notice}</p>}
          {streaming ? (
            <p className="ov-muted">Thinking…</p>
          ) : (
            <div className="ov-answer">
              {answerLines(answer || "Waiting for a question.").map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );

  return createPortal(overlay, document.body);
}
