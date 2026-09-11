import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Camera,
  Copy,
  Mic,
  MicOff,
  MoreHorizontal,
  Shield,
  ShieldOff,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { cn } from "./lib/utils";
import { useCompanionStore } from "./store/companion-store";
import { AIService } from "./services";
import { configureAnswerApi } from "./services/live-answer";
import {
  configureLiveTranscription,
  stopAllListen,
  syncListenSources,
} from "./services/audio-listen";
import type { ScreenshotResult } from "./types/companion";
import { ResizeHandles } from "./components/ResizeHandles";

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function answerLines(text: string) {
  const bullets = text
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
  if (bullets.length > 1) return bullets;
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return sentences.length > 1 ? sentences.slice(0, 6) : [text.trim()];
}

export default function App() {
  const {
    pinned,
    capture,
    listen,
    transcript,
    setPinned,
    setSession,
    setCapture,
    setListen,
    session,
    appendTranscript,
    clearTranscript,
  } = useCompanionStore();

  const [ask, setAsk] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [answer, setAnswer] = useState("");
  const [question, setQuestion] = useState("");
  const [copied, setCopied] = useState(false);
  const [ending, setEnding] = useState(false);
  const [autoAnswer, setAutoAnswer] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [webApiBase, setWebApiBase] = useState("http://127.0.0.1:3000");
  const [expanded, setExpanded] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [shotBusy, setShotBusy] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const startedAtRef = useRef(Date.now());
  const aiBusyRef = useRef(false);
  const autoAnswerRef = useRef(autoAnswer);
  autoAnswerRef.current = autoAnswer;
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;
  const askRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const meetingKeyRef = useRef<string | null>(null);

  const privacyOn = capture?.requested !== false;
  const lastHeard = [...transcript].reverse().find((t) => t.who !== "CueAI");
  const hasAnswer = Boolean(answer.trim());
  const boardOpen = streaming || hasAnswer || Boolean(question.trim());

  useEffect(() => {
    void window.cueai?.pin(pinned);
  }, [pinned]);

  useEffect(() => {
    void window.cueai?.getCaptureStatus().then((s) => s && setCapture(s));
    void window.cueai?.getSession().then((s) => s && setSession(s));
    void window.cueai?.getListenSources().then((s) => s && setListen(s));
    void window.cueai?.getWindowState?.().then((s) => s && setExpanded(s.expanded));
    const offSession = window.cueai?.onSession((s) => s && setSession(s));
    const offCapture = window.cueai?.onCaptureStatus((s) => s && setCapture(s));
    const offListen = window.cueai?.onListenSources((s) => setListen(s));
    const offWindow = window.cueai?.onWindowState?.((s) => s && setExpanded(s.expanded));
    return () => {
      offSession?.();
      offCapture?.();
      offListen?.();
      offWindow?.();
    };
  }, [setCapture, setListen, setSession]);

  useEffect(() => {
    void window.cueai?.getWebOrigin?.().then((origin) => {
      if (origin) setWebApiBase(origin.replace(/\/$/, ""));
    });
  }, []);

  useEffect(() => {
    configureAnswerApi(webApiBase);
  }, [webApiBase]);

  useEffect(() => {
    const id = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    configureLiveTranscription({
      apiBase: webApiBase,
      onResult: (line) => {
        appendTranscript(line);
        setStatusMsg(null);
        if (!autoAnswerRef.current || aiBusyRef.current) return;
        aiBusyRef.current = true;
        void (async () => {
          rememberQuestion(line.text);
          setStreaming(true);
          try {
            const ctx = [
              ...transcriptRef.current.map((t) => `${t.who}: ${t.text}`),
              `${line.who}: ${line.text}`,
            ];
            const result = await AIService.ask(`Brief response to: ${line.text}`, {
              transcript: ctx,
            }, { fallback: false });
            setAnswer(result.answer);
            appendTranscript({ who: "CueAI", text: result.answer });
          } catch (err) {
            setStatusMsg(err instanceof Error ? err.message : "Unable to generate an answer.");
          } finally {
            setStreaming(false);
            aiBusyRef.current = false;
          }
        })();
      },
      onError: (msg) => setStatusMsg(msg),
    });
    return () => configureLiveTranscription(null);
  }, [appendTranscript, webApiBase]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await syncListenSources({
          mic: listen.mic,
          systemAudio: listen.systemAudio,
          getDesktopSourceId: async () =>
            (await window.cueai?.getDesktopAudioSourceId()) ?? null,
        });
      } catch (err) {
        if (!cancelled) {
          setStatusMsg(err instanceof Error ? err.message : "Listen failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listen.mic, listen.systemAudio]);

  useEffect(() => {
    return () => {
      void stopAllListen();
    };
  }, []);

  useEffect(() => {
    if (boardOpen && !expanded) {
      void window.cueai?.expand().then((ok) => {
        if (ok !== false) setExpanded(true);
      });
    }
    if (!boardOpen && expanded) {
      void window.cueai?.restore().then((ok) => {
        if (ok !== false) setExpanded(false);
      });
    }
  }, [boardOpen, expanded]);

  useEffect(() => {
    if (boardOpen || expanded) return;
    void window.cueai?.fitHeight?.(menuOpen ? 260 : 76);
  }, [menuOpen, boardOpen, expanded]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      setNarrow(entry.contentRect.width < 580);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
    setStatusMsg(null);
    setMenuOpen(false);
    setCopied(false);
    clearTranscript();
    startedAtRef.current = Date.now();
    setElapsedMs(0);
  }, [session.active, session.meetingId, clearTranscript]);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  function bumpActivity() {
    void window.cueai?.activity();
  }

  function rememberQuestion(next: string) {
    const text = next.trim();
    if (text) setQuestion(text);
  }

  async function runAsk(prompt: string, image?: string) {
    const q = prompt.trim();
    if (!q || (streaming && !image)) return;
    bumpActivity();
    if (!image) rememberQuestion(q);
    setStreaming(true);
    const context = transcript.map((t) => `${t.who}: ${t.text}`);
    if (!image) appendTranscript({ who: "You", text: q });

    try {
      const result = await AIService.ask(q, { transcript: context, image }, { fallback: false });
      setAnswer(result.answer);
      setStatusMsg(null);
      appendTranscript({ who: "CueAI", text: result.answer });
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Unable to generate an answer. Try again.");
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

  async function generateAnswer() {
    const last = lastHeard?.text;
    await runAsk(
      last
        ? `Brief response to: ${last}`
        : "Give me a ready-to-say self-introduction from my resume and the job briefing.",
    );
  }

  async function analyzeScreen() {
    bumpActivity();
    if (shotBusy) return;
    setShotBusy(true);
    setStatusMsg(null);
    rememberQuestion("What's on screen?");
    setStreaming(true);
    try {
      const result = (await window.cueai?.captureScreenshot({
        save: false,
      })) as ScreenshotResult | undefined;
      if (!result?.ok || !result.dataUrl) {
        setStatusMsg(result?.error || "Could not capture the screen.");
        setStreaming(false);
        return;
      }
      await runAsk(
        "What is happening on this screen? Describe it briefly, then give me a first-person interview-ready answer I can say out loud if there is a question, coding problem, or prompt.",
        result.dataUrl,
      );
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Screenshot failed.");
      setStreaming(false);
    } finally {
      setShotBusy(false);
    }
  }

  async function copyAnswer() {
    if (!answer) return;
    bumpActivity();
    try {
      await navigator.clipboard.writeText(answer);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  function clearBoard() {
    bumpActivity();
    setAnswer("");
    setQuestion("");
    setStatusMsg(null);
  }

  async function onEndSession() {
    if (ending) return;
    setEnding(true);
    bumpActivity();
    try {
      await stopAllListen();
      await window.cueai?.endSession();
      clearBoard();
    } finally {
      setEnding(false);
    }
  }

  async function togglePrivacy() {
    bumpActivity();
    const status = await window.cueai?.setExcludeCapture(!privacyOn);
    if (status) setCapture(status);
  }

  async function toggleListen(kind: "mic" | "systemAudio") {
    bumpActivity();
    const next = {
      mic: kind === "mic" ? !listen.mic : listen.mic,
      systemAudio: kind === "systemAudio" ? !listen.systemAudio : listen.systemAudio,
    };
    setListen(next);
    const saved = await window.cueai?.setListenSources(next);
    if (saved) setListen(saved);
  }

  return (
    <div
      ref={rootRef}
      className={cn("ov-root", boardOpen && "is-open", menuOpen && "is-menu", narrow && "is-narrow")}
      onMouseMove={bumpActivity}
      onFocus={bumpActivity}
    >
      {boardOpen && <ResizeHandles />}

      <div className="ov-bar header-drag">
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
          onClick={() => void generateAnswer()}
          aria-label="Answer"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="ov-btn-label">Answer</span>
        </button>
        <button
          type="button"
          className="ov-btn no-drag"
          onClick={() => void analyzeScreen()}
          aria-label={shotBusy ? "Capture" : "Screen"}
        >
          <Camera className="h-3.5 w-3.5" />
          <span className="ov-btn-label">{shotBusy ? "Capture" : "Screen"}</span>
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
              <button type="button" role="menuitem" onClick={() => void toggleListen("mic")}>
                {listen.mic ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
                Mic {listen.mic ? "on" : "off"}
              </button>
              <button type="button" role="menuitem" onClick={() => void toggleListen("systemAudio")}>
                {listen.systemAudio ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                System {listen.systemAudio ? "on" : "off"}
              </button>
              <button type="button" role="menuitem" onClick={() => { setPinned(!pinned); setMenuOpen(false); }}>
                Pin {pinned ? "on" : "off"}
              </button>
              <label>
                <input type="checkbox" checked={autoAnswer} onChange={(e) => setAutoAnswer(e.target.checked)} />
                Auto-answer
              </label>
              <button type="button" role="menuitem" className="is-danger" onClick={() => void onEndSession()}>
                <Square className="h-3 w-3 fill-current" />
                {ending ? "Ending…" : "End"}
              </button>
            </div>
          )}
        </div>
        <button type="button" className="ov-icon no-drag" aria-label="Hide" onClick={() => void window.cueai?.hide()}>
          <X className="h-4 w-4" />
        </button>
      </div>

      {boardOpen && (
        <section className="ov-card no-drag">
          <header>
            <p>{question || lastHeard?.text || "Working…"}</p>
            <div>
              {hasAnswer && (
                <button type="button" onClick={() => void copyAnswer()}>
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? "Copied" : "Copy"}
                </button>
              )}
              <button type="button" onClick={clearBoard}>Close</button>
            </div>
          </header>
          {statusMsg && <p className="ov-error">{statusMsg}</p>}
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
}
