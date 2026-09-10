import { useEffect, useRef, useState } from "react";
import { Keyboard, Mic, Monitor, Sparkles, Send, Brain } from "lucide-react";
import { runAi } from "../ai/client";
import { transcriptLines, copilotReplies } from "../data/mock";
import {
  appendMemory,
  memorySummary,
  startMeetingMemory,
  type MeetingMemory,
} from "../lib/sessionMemory";

const MOCK_OCR = `Screen OCR (mock)
— Slide: Architecture overview
— Bullet: p95 live suggestions < 800ms
— Bullet: Screen Context opt-in
— Logo: CueAI Companion
— Speaker notes: “SSO deferred to Phase 3”`;

const EXTRA_LINES = [
  { speaker: "You", text: "Latency SLOs should stay under 800ms for enterprise pilots." },
  { speaker: "Priya", text: "Agreed — let's capture that as a decision." },
  { speaker: "Marcus", text: "I'll own the SLO doc and circulate tomorrow." },
  { speaker: "You", text: "Any blockers on Presenter Privacy for the demo?" },
  { speaker: "Priya", text: "Only if entire-screen share is required — then we hide CueAI." },
];

export function LiveSessionTools({
  host,
  privacyOn,
  hiddenForShare,
  screenContext,
  sessionActive,
  onHideForShare,
  onShowOverlay,
}: {
  host: string;
  privacyOn: boolean;
  hiddenForShare: boolean;
  screenContext: boolean;
  sessionActive: boolean;
  onHideForShare: () => void;
  onShowOverlay: () => void;
}) {
  const [memory, setMemory] = useState<MeetingMemory | null>(null);
  const [lines, setLines] = useState<{ speaker: string; text: string }[]>([]);
  const [listening, setListening] = useState(false);
  const [ocr, setOcr] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ask, setAsk] = useState("");
  const [answer, setAnswer] = useState(copilotReplies.suggest);
  const [askBusy, setAskBusy] = useState(false);
  const [hotkeyFlash, setHotkeyFlash] = useState<string | null>(null);
  const tick = useRef(0);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionActive) {
      setListening(false);
      setLines([]);
      setOcr(null);
      setMemory(null);
      sessionIdRef.current = null;
      tick.current = 0;
      return;
    }
    const session = startMeetingMemory(host);
    sessionIdRef.current = session.sessionId;
    setMemory(session);
    setListening(true);
    setLines(transcriptLines.map((t) => ({ ...t })));
  }, [sessionActive, host]);

  useEffect(() => {
    if (!sessionActive || !listening) return;
    const pool = [...transcriptLines, ...EXTRA_LINES];
    const id = window.setInterval(() => {
      const next = pool[tick.current % pool.length];
      tick.current += 1;
      setLines((prev) => [...prev, next].slice(-12));
      const sid = sessionIdRef.current;
      if (sid) {
        const updated = appendMemory(sid, "transcript", `${next.speaker}: ${next.text}`);
        if (updated) setMemory({ ...updated });
        if (next.text.toLowerCase().includes("agreed") || next.text.toLowerCase().includes("own")) {
          const u2 = appendMemory(sid, "decision", next.text);
          if (u2) setMemory({ ...u2 });
        }
      }
    }, 3200);
    return () => window.clearInterval(id);
  }, [sessionActive, listening]);

  useEffect(() => {
    if (!sessionActive) return;
    function onKey(e: KeyboardEvent) {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      if (e.key.toLowerCase() === "h" && !e.shiftKey) {
        e.preventDefault();
        onHideForShare();
        setHotkeyFlash("Hotkey: Hide overlay (Ctrl/⌘+H)");
      }
      if (e.key.toLowerCase() === "h" && e.shiftKey) {
        e.preventDefault();
        onShowOverlay();
        setHotkeyFlash("Hotkey: Show overlay (Ctrl/⌘+Shift+H)");
      }
      if (e.key.toLowerCase() === "m") {
        e.preventDefault();
        setListening((v) => !v);
        setHotkeyFlash("Hotkey: Toggle mock transcription (Ctrl/⌘+M)");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sessionActive, onHideForShare, onShowOverlay]);

  useEffect(() => {
    if (!hotkeyFlash) return;
    const t = window.setTimeout(() => setHotkeyFlash(null), 1800);
    return () => window.clearTimeout(t);
  }, [hotkeyFlash]);

  function runOcr() {
    if (!screenContext) {
      setOcr("Screen context is off in Settings — enable Visual screen context to run OCR.");
      return;
    }
    setOcrBusy(true);
    window.setTimeout(() => {
      setOcr(MOCK_OCR);
      setOcrBusy(false);
      const sid = sessionIdRef.current;
      if (sid) {
        const updated = appendMemory(sid, "ocr", "Captured Architecture overview slide + SSO deferral note");
        if (updated) setMemory({ ...updated });
      }
    }, 700);
  }

  async function submitAsk() {
    const prompt = ask.trim() || "What should I say about Presenter Privacy Mode?";
    setAskBusy(true);
    try {
      const sid = sessionIdRef.current;
      if (sid) {
        const updated = appendMemory(sid, "ask", prompt);
        if (updated) setMemory({ ...updated });
      }
      const ctx = sid ? memorySummary(sid) : "";
      const text = await runAi({ task: "live-suggest", prompt, context: ctx });
      setAnswer(text);
      setAsk("");
    } catch (err) {
      setAnswer(err instanceof Error ? err.message : "Ask failed");
    } finally {
      setAskBusy(false);
    }
  }

  if (!sessionActive) return null;

  return (
    <>
      <div className="card section-gap privacy-dual">
        <strong style={{ fontSize: 13 }}>Presenter Privacy — what each side sees</strong>
        <div className="privacy-grid">
          <div className="privacy-pane">
            <span className="chip">You</span>
            <p className="muted" style={{ margin: "8px 0 0", fontSize: 12 }}>
              {hiddenForShare
                ? "Overlay hidden locally while sharing (mock of Android hide-while-share)."
                : "CueAI panel visible to you for Assist / Ask / transcript."}
            </p>
          </div>
          <div className={`privacy-pane${privacyOn ? " clean" : " leak"}`}>
            <span className={`chip${privacyOn ? "" : " warn-chip"}`}>Others on share</span>
            <p className="muted" style={{ margin: "8px 0 0", fontSize: 12 }}>
              {privacyOn || hiddenForShare
                ? "Clear screen — no CueAI, no black patches (mock)."
                : "CueAI may appear in entire-screen share."}
            </p>
            <div className="privacy-share-frame">{privacyOn || hiddenForShare ? "Slides only" : "Slides + CueAI leak"}</div>
          </div>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 11 }}>
          Mock dual-view. Real Android cannot keep the overlay on your screen and exclude it from capture without
          blacking the share.
        </p>
      </div>

      <div className="card section-gap">
        <div className="row space-between">
          <div className="row" style={{ gap: 8 }}>
            <Mic size={16} color="var(--teal-bright)" />
            <strong style={{ fontSize: 13 }}>Live transcription</strong>
          </div>
          <button type="button" className={`chip${listening ? "" : " neutral"}`} onClick={() => setListening((v) => !v)}>
            {listening ? "Listening (mock STT)" : "Paused"}
          </button>
        </div>
        <div className="live-transcript">
          {lines.map((l, i) => (
            <p key={`${l.speaker}-${i}-${l.text.slice(0, 12)}`}>
              <strong>{l.speaker}</strong> {l.text}
            </p>
          ))}
        </div>
      </div>

      <div className="card section-gap">
        <div className="row space-between">
          <div className="row" style={{ gap: 8 }}>
            <Monitor size={16} color="var(--teal-bright)" />
            <strong style={{ fontSize: 13 }}>Screen OCR</strong>
          </div>
          <button type="button" className="btn btn-teal-outline" style={{ padding: "6px 10px", fontSize: 12 }} disabled={ocrBusy} onClick={runOcr}>
            {ocrBusy ? "Analyzing…" : "Analyze screen"}
          </button>
        </div>
        <pre className="live-ocr">{ocr ?? "Run analysis to capture on-screen text (mock OCR)."}</pre>
      </div>

      <div className="card section-gap">
        <div className="row" style={{ gap: 8 }}>
          <Brain size={16} color="var(--teal-bright)" />
          <strong style={{ fontSize: 13 }}>Meeting context memory</strong>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          {memory ? `${memory.facts.length} facts stored locally for this session.` : "Starting…"}
        </p>
        <pre className="live-memory">{memory ? memorySummary(memory.sessionId) : "—"}</pre>
      </div>

      <div className="card section-gap">
        <div className="row space-between">
          <div className="row" style={{ gap: 8 }}>
            <Sparkles size={16} color="var(--teal-bright)" />
            <strong style={{ fontSize: 13 }}>AI suggestion</strong>
          </div>
          <span className="chip neutral">Uses memory</span>
        </div>
        <pre className="live-suggest">{answer}</pre>
        <div className="live-ask-row">
          <input
            className="field grow"
            placeholder="Ask AI during the call…"
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitAsk();
            }}
          />
          <button type="button" className="btn btn-primary" disabled={askBusy} onClick={() => void submitAsk()}>
            <Send size={14} />
            {askBusy ? "…" : "Ask"}
          </button>
        </div>
      </div>

      <div className="card section-gap">
        <div className="row" style={{ gap: 8 }}>
          <Keyboard size={16} color="var(--teal-bright)" />
          <strong style={{ fontSize: 13 }}>Hotkeys</strong>
        </div>
        <ul className="hotkey-list">
          <li>
            <code>Ctrl/⌘+H</code> Hide for share
          </li>
          <li>
            <code>Ctrl/⌘+Shift+H</code> Show overlay
          </li>
          <li>
            <code>Ctrl/⌘+M</code> Pause/resume mock STT
          </li>
        </ul>
        {hotkeyFlash && <p className="muted" style={{ margin: 0, fontSize: 12 }}>{hotkeyFlash}</p>}
      </div>

      <style>{sessionToolsCss}</style>
    </>
  );
}

const sessionToolsCss = `
  .privacy-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .privacy-pane {
    border-radius: 12px;
    border: 1px solid var(--border);
    background: rgba(0,0,0,0.22);
    padding: 10px;
  }
  .privacy-pane.clean {
    border-color: rgba(0, 153, 255, 0.35);
  }
  .privacy-pane.leak {
    border-color: rgba(248, 113, 113, 0.4);
  }
  .privacy-share-frame {
    margin-top: 8px;
    padding: 10px;
    border-radius: 8px;
    background: #111;
    border: 1px dashed rgba(255,255,255,0.18);
    font-size: 11px;
    font-weight: 650;
    text-align: center;
    color: var(--text-muted);
  }
  .live-transcript {
    max-height: 140px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .live-transcript p {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--text-muted);
  }
  .live-transcript strong {
    color: var(--teal-bright);
    margin-right: 6px;
  }
  .live-ocr, .live-memory, .live-suggest {
    margin: 0;
    white-space: pre-wrap;
    font-family: var(--font-body);
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-muted);
    max-height: 140px;
    overflow: auto;
  }
  .live-ask-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .hotkey-list {
    margin: 0;
    padding-left: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .hotkey-list code {
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 6px;
    background: rgba(0,0,0,0.35);
    margin-right: 8px;
    color: var(--teal-bright);
  }
  .warn-chip {
    background: rgba(248, 113, 113, 0.15) !important;
    color: #fecaca !important;
    border-color: rgba(248, 113, 113, 0.35) !important;
  }
`;
