import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  EyeOff,
  Languages,
  MessageCircle,
  Minus,
  RefreshCw,
  Send,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";
import { CueLogo } from "./CueLogo";
import { copilotReplies, transcriptLines, type CopilotMode } from "../data/mock";
import "./CopilotOverlay.css";

const modes: { id: CopilotMode; label: string; icon: typeof Sparkles }[] = [
  { id: "assist", label: "Assist", icon: Sparkles },
  { id: "suggest", label: "What to say", icon: Wand2 },
  { id: "followup", label: "Follow-ups", icon: MessageCircle },
  { id: "recap", label: "Recap", icon: RefreshCw },
];

export function FloatingBubble({
  open,
  onToggle,
  privacyOn,
  position,
  onPositionChange,
}: {
  open: boolean;
  onToggle: () => void;
  privacyOn: boolean;
  position: { x: number; y: number };
  onPositionChange: (pos: { x: number; y: number }) => void;
}) {
  const dragging = useRef<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const moved = useRef(false);

  if (open) return null;

  function onPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = { ox: e.clientX, oy: e.clientY, x: position.x, y: position.y };
    moved.current = false;
  }

  function onPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragging.current) return;
    const dx = e.clientX - dragging.current.ox;
    const dy = e.clientY - dragging.current.oy;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved.current = true;
    onPositionChange({
      x: Math.max(8, dragging.current.x + dx),
      y: Math.max(40, dragging.current.y + dy),
    });
  }

  function onPointerUp() {
    const wasDrag = moved.current;
    dragging.current = null;
    if (!wasDrag) onToggle();
  }

  return (
    <button
      type="button"
      className="cue-bubble"
      style={{ left: position.x, top: position.y, right: "auto", bottom: "auto" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      aria-label="Open CueAI overlay window"
    >
      <span className="cue-bubble-ring" />
      <span className="cue-bubble-core">
        <CueLogo size={22} />
      </span>
      {privacyOn && (
        <span className="cue-bubble-badge" title="Excluded from screen share">
          <EyeOff size={10} />
        </span>
      )}
    </button>
  );
}

export function CopilotOverlay({
  open,
  onClose,
  privacyOn,
  onPrivacyToggle,
  position,
  onPositionChange,
  excludedFromCapture,
}: {
  open: boolean;
  onClose: () => void;
  privacyOn: boolean;
  onPrivacyToggle: () => void;
  position: { x: number; y: number };
  onPositionChange: (pos: { x: number; y: number }) => void;
  excludedFromCapture: boolean;
}) {
  const [mode, setMode] = useState<CopilotMode>("assist");
  const [query, setQuery] = useState("");
  const [typing, setTyping] = useState(false);
  const [answer, setAnswer] = useState(copilotReplies.assist);
  const [lang, setLang] = useState("EN");
  const [lineIdx, setLineIdx] = useState(0);
  const drag = useRef<{ ox: number; oy: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setTyping(true);
    const t = window.setTimeout(() => {
      setAnswer(copilotReplies[mode]);
      setTyping(false);
    }, 550);
    return () => window.clearTimeout(t);
  }, [mode, open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => {
      setLineIdx((i) => (i + 1) % transcriptLines.length);
    }, 4200);
    return () => window.clearInterval(t);
  }, [open]);

  const display = useMemo(() => {
    if (!typing) return answer;
    return answer.slice(0, Math.max(24, Math.floor(answer.length * 0.35))) + "…";
  }, [answer, typing]);

  const liveLine = transcriptLines[lineIdx];

  if (!open) return null;

  function runQuery() {
    const q = query.trim();
    if (!q) {
      setMode("assist");
      return;
    }
    setTyping(true);
    window.setTimeout(() => {
      setAnswer(
        `Based on your meeting and knowledge base:\n\n“${q}”\n\nCueAI recommends anchoring on Presenter Privacy Mode so this separate overlay window is excluded from Zoom / Meet / Teams screen share while still assisting you privately.`,
      );
      setTyping(false);
      setQuery("");
    }, 700);
  }

  function onTitlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { ox: e.clientX, oy: e.clientY, x: position.x, y: position.y };
  }

  function onTitlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    onPositionChange({
      x: Math.max(6, drag.current.x + (e.clientX - drag.current.ox)),
      y: Math.max(36, drag.current.y + (e.clientY - drag.current.oy)),
    });
  }

  function onTitlePointerUp() {
    drag.current = null;
  }

  return (
    <div
      className={`cue-float-window${excludedFromCapture ? " cue-excluded" : " cue-captured"}`}
      role="dialog"
      aria-label="CueAI system overlay window"
      style={{ left: position.x, top: position.y }}
    >
      {/* Compact Android-style control island — drag handle */}
      <div
        className="cue-island"
        onPointerDown={onTitlePointerDown}
        onPointerMove={onTitlePointerMove}
        onPointerUp={onTitlePointerUp}
      >
        <span className="cue-island-logo">
          <CueLogo size={13} />
        </span>
        <div className="cue-island-meta grow">
          <strong>CueAI</strong>
          <span>Overlay · drag to move</span>
        </div>
        <button
          type="button"
          className={`cue-privacy-chip${privacyOn ? " on" : ""}`}
          onClick={onPrivacyToggle}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <EyeOff size={11} />
          {privacyOn ? "Private" : "Visible"}
        </button>
        <button
          type="button"
          className="cue-icon-btn"
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Minimize overlay"
        >
          <Minus size={14} />
        </button>
      </div>

      {/* Transparent glass body */}
      <div className="cue-glass">
        <div className="cue-glass-shine" />
        <div className="cue-glass-edge" />

        <div className={`cue-capture-banner${excludedFromCapture ? "" : " warn"}`}>
          {excludedFromCapture
            ? "Hidden from screen share · Meet / Zoom / Teams won’t capture this"
            : "Warning · Visible in presenting / screen share"}
        </div>

        <div className="cue-live-strip">
          <span className="live-dot" style={{ width: 6, height: 6 }} />
          <span className="cue-live-speaker">{liveLine.speaker}</span>
          <span className="cue-live-text">{liveLine.text}</span>
        </div>

        <div className="row space-between" style={{ marginBottom: 10, position: "relative" }}>
          <span className="chip cue-listening">
            <span className="live-dot" style={{ width: 6, height: 6 }} />
            Listening
          </span>
          <button
            type="button"
            className="btn btn-primary cue-say-btn"
            onClick={() => setMode("suggest")}
          >
            What should I say?
          </button>
        </div>

        <div className="cue-answer">
          {display.split("\n").map((line, i) => (
            <p key={i}>{line || "\u00A0"}</p>
          ))}
          {typing && <span className="cue-caret" />}
        </div>

        <div className="cue-modes">
          {modes.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`cue-mode${mode === id ? " active" : ""}`}
              onClick={() => setMode(id)}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        <div className="cue-input-row">
          <button type="button" className="cue-smart" title="Smart context">
            <Zap size={12} />
            Smart
          </button>
          <button
            type="button"
            className="cue-lang"
            onClick={() => setLang((l) => (l === "EN" ? "ES" : l === "ES" ? "HI" : "EN"))}
          >
            <Languages size={12} />
            {lang}
          </button>
          <input
            className="cue-input"
            placeholder="Ask about the call or screen…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runQuery();
            }}
          />
          <button type="button" className="cue-send" onClick={runQuery} aria-label="Send">
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
