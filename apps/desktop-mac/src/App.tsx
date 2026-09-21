import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Camera,
  Check,
  Copy,
  Mic,
  MicOff,
  MoreHorizontal,
  Pin,
  Search,
  Sparkles,
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
  subscribeListenLevels,
  syncListenSources,
} from "./services/audio-listen";
import type { ScreenshotResult } from "./types/companion";
import { ResizeHandles } from "./components/ResizeHandles";
import type { AudioSessionSnapshot } from "./services/audio-session-manager";

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

function Waveform({ active }: { active: boolean }) {
  return (
    <span className={cn("cue-wave", active && "is-live")} aria-hidden>
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  );
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
  const [webApiBase, setWebApiBase] = useState("http://127.0.0.1:3002");
  const [expanded, setExpanded] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [shotBusy, setShotBusy] = useState(false);
  const [audioSession, setAudioSession] = useState<AudioSessionSnapshot>({
    mic: "idle",
    system: "idle",
    micLevel: 0,
    systemLevel: 0,
    error: null,
  });
  const lastAnsweredRef = useRef("");
  const startedAtRef = useRef(Date.now());
  const aiBusyRef = useRef(false);
  const autoAnswerRef = useRef(autoAnswer);
  autoAnswerRef.current = autoAnswer;
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;
  const streamingRef = useRef(streaming);
  streamingRef.current = streaming;
  const pendingUtteranceRef = useRef({ text: "", who: "", timer: 0 });
  const runAskRef = useRef<(prompt: string, opts?: { image?: string; echoAsYou?: boolean }) => Promise<void>>(
    async () => undefined,
  );
  const askRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const meetingKeyRef = useRef<string | null>(null);

  const privacyOn = capture?.requested !== false;
  const lastHeard = [...transcript].reverse().find((t) => t.who !== "CueAI");
  const hasAnswer = Boolean(answer.trim());
  const boardOpen = streaming || hasAnswer || Boolean(question.trim());
  const listening = audioSession.mic === "listening" || audioSession.system === "listening";
  const micLive = audioSession.mic === "listening";
  const systemLive = audioSession.system === "listening";
  const kicker = shotBusy
    ? "Reading screen"
    : streaming
      ? "Composing"
      : hasAnswer
        ? "Suggested reply"
        : "Ready";

  useEffect(() => {
    void window.cueai?.pin(pinned);
  }, [pinned]);

  useEffect(() => {
    return subscribeListenLevels(setAudioSession);
  }, []);

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
    if (!window.cueai) return;
    configureLiveTranscription({
      apiBase: webApiBase,
      onResult: (line) => {
        appendTranscript(line);
        setStatusMsg(null);
        const chunk = line.text.trim();
        if (!chunk) return;
        const pending = pendingUtteranceRef.current;
        const sameSpeaker = !pending.who || pending.who === line.who;
        pending.text = sameSpeaker ? `${pending.text} ${chunk}`.trim() : chunk;
        pending.who = line.who;
        window.clearTimeout(pending.timer);
        pending.timer = window.setTimeout(() => {
          const finalQuestion = pending.text.trim();
          pending.text = "";
          pending.who = "";
          pending.timer = 0;
          if (finalQuestion.length < 8) return;
          console.log("[TRANSCRIPT] Final transcript received");
          if (!autoAnswerRef.current || aiBusyRef.current || streamingRef.current) return;
          const key = finalQuestion.toLowerCase().replace(/\s+/g, " ");
          if (key === lastAnsweredRef.current) return;
          void runAskRef.current(`Brief response to: ${finalQuestion}`, { echoAsYou: false });
        }, 1400);
      },
      onError: (msg) => setStatusMsg(msg),
    });
    return () => {
      window.clearTimeout(pendingUtteranceRef.current.timer);
      configureLiveTranscription(null);
    };
  }, [appendTranscript, webApiBase]);

  useEffect(() => {
    if (!window.cueai) return;
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
    void window.cueai?.fitHeight?.(menuOpen ? 320 : 120);
  }, [menuOpen, boardOpen, expanded]);

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
      const target = e.target as HTMLElement | null;
      if (target?.closest(".cue-menu, [aria-label='More']")) return;
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

  async function runAsk(prompt: string, image?: string, opts?: { echoAsYou?: boolean }) {
    const q = prompt.trim();
    if (!q || (streamingRef.current && !image)) return;
    bumpActivity();
    const spoken = q.replace(/^Brief response to:\s*/i, "").trim();
    if (!image) rememberQuestion(spoken || q);
    setStreaming(true);
    aiBusyRef.current = true;
    const context = transcriptRef.current.map((t) => `${t.who}: ${t.text}`);
    if (!image && opts?.echoAsYou !== false) appendTranscript({ who: "You", text: q });

    try {
      const result = await AIService.ask(q, { transcript: context, image }, { fallback: false });
      setAnswer(result.answer);
      setStatusMsg(null);
      appendTranscript({ who: "CueAI", text: result.answer });
      lastAnsweredRef.current = spoken.toLowerCase().replace(/\s+/g, " ");
    } catch (err) {
      lastAnsweredRef.current = "";
      setStatusMsg(err instanceof Error ? err.message : "Unable to generate an answer. Try again.");
    } finally {
      setStreaming(false);
      aiBusyRef.current = false;
    }
  }
  runAskRef.current = (prompt, opts) => runAsk(prompt, opts?.image, { echoAsYou: opts?.echoAsYou });

  async function onAsk(e: FormEvent) {
    e.preventDefault();
    const prompt = ask.trim();
    if (!prompt) return;
    setAsk("");
    await runAsk(prompt);
  }

  async function ensurePermission(kind: "microphone" | "systemAudio"): Promise<boolean> {
    const api = window.cueai;
    if (!api?.getPermissions || !api.requestPermission) return true;
    const current = await api.getPermissions();
    const status = kind === "microphone" ? current.microphone : current.systemAudio;
    if (status.state === "granted") return true;
    if (status.state === "denied" || status.state === "restricted") {
      setStatusMsg(status.message);
      return false;
    }
    const next = await api.requestPermission(kind === "microphone" ? "microphone" : "systemAudio");
    if (next.state === "granted" || next.state === "not-determined") return true;
    setStatusMsg(next.message);
    return false;
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
      setMenuOpen(false);
    } finally {
      setEnding(false);
    }
  }

  async function togglePrivacy() {
    bumpActivity();
    const status = await window.cueai?.setExcludeCapture(!privacyOn);
    if (status) {
      setCapture(status);
      return;
    }
    setCapture({
      requested: !privacyOn,
      applied: !privacyOn,
      supported: true,
      message: privacyOn ? "Visible in screen share" : "Hidden from screen share",
    });
  }

  async function toggleListen(kind: "mic" | "systemAudio") {
    bumpActivity();
    const turningOn = kind === "mic" ? !listen.mic : !listen.systemAudio;
    if (turningOn) {
      const ok = await ensurePermission(kind === "mic" ? "microphone" : "systemAudio");
      if (!ok) return;
    }
    const next = {
      mic: kind === "mic" ? !listen.mic : listen.mic,
      systemAudio: kind === "systemAudio" ? !listen.systemAudio : listen.systemAudio,
    };
    setListen(next);
    try {
      const saved = await window.cueai?.setListenSources(next);
      if (saved) setListen(saved);
    } catch (err) {
      setListen({
        mic: kind === "mic" ? listen.mic : next.mic,
        systemAudio: kind === "systemAudio" ? listen.systemAudio : next.systemAudio,
      });
      setStatusMsg(err instanceof Error ? err.message : "Could not change listen sources.");
    }
  }

  const askPlaceholder = shotBusy
    ? "Reading what’s on screen…"
    : streaming
      ? "Composing a speakable reply…"
      : "Ask CueAI for this call";

  return (
    <div
      ref={rootRef}
      className={cn("cue-root", boardOpen && "is-open")}
      onMouseMove={bumpActivity}
      onFocus={bumpActivity}
    >
      <div className="cue-hud">
        <header className="cue-title header-drag">
          <span className="cue-logo">CueAI</span>
          <span className="cue-status no-drag">
            <Waveform active={listening} />
            <span className="cue-time">{formatElapsed(elapsedMs)}</span>
            <button
              type="button"
              className={cn("cue-privacy", privacyOn ? "is-hidden" : "is-visible")}
              aria-label={privacyOn ? "Privacy on" : "Privacy off"}
              aria-pressed={privacyOn}
              title={privacyOn ? "Hidden from screen share" : "Visible in screen share"}
              onClick={() => void togglePrivacy()}
            >
              <span className="cue-led" />
              {privacyOn ? "Hidden" : "Visible"}
            </button>
          </span>
          <div className="cue-more no-drag">
            <button
              type="button"
              className={cn("cue-icon", menuOpen && "is-on")}
              aria-label="More"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="cue-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => void toggleListen("mic")}>
                  {micLive ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                  <span>Microphone</span>
                  <em>{micLive ? "Listening" : "Off"}</em>
                </button>
                <button type="button" role="menuitem" onClick={() => void toggleListen("systemAudio")}>
                  {systemLive ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  <span>System audio</span>
                  <em>{systemLive ? "Listening" : "Off"}</em>
                </button>
                <hr />
                <button type="button" role="menuitem" onClick={() => setPinned(!pinned)}>
                  <Pin className="h-4 w-4" />
                  <span>Keep on top</span>
                  {pinned && <Check className="h-3.5 w-3.5 cue-tick" />}
                </button>
                <button type="button" role="menuitem" onClick={() => setAutoAnswer((v) => !v)}>
                  <Sparkles className="h-4 w-4" />
                  <span>Auto-reply</span>
                  {autoAnswer && <Check className="h-3.5 w-3.5 cue-tick" />}
                </button>
                <hr />
                <button type="button" role="menuitem" className="is-danger" onClick={() => void onEndSession()}>
                  {ending ? "Ending…" : "End session"}
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className="cue-icon no-drag"
            aria-label="Hide"
            onClick={() => void window.cueai?.hide()}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <form className="cue-composer no-drag" onSubmit={(e) => void onAsk(e)}>
          <Search className="cue-search-icon" aria-hidden />
          <input
            ref={askRef}
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void onAsk(e);
              }
            }}
            placeholder={askPlaceholder}
            aria-label="Ask CueAI"
          />
          <button
            type="button"
            className={cn("cue-action", streaming && !shotBusy && "is-on")}
            onClick={() => void generateAnswer()}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Reply
          </button>
          <button
            type="button"
            className={cn("cue-action", shotBusy && "is-on")}
            onClick={() => void analyzeScreen()}
          >
            <Camera className="h-3.5 w-3.5" />
            {shotBusy ? "Reading" : "Screen"}
          </button>
        </form>

        {boardOpen && (
          <section className="cue-sheet no-drag">
            <div className="cue-sheet-top">
              <p className="cue-kicker">{kicker}</p>
              <div className="cue-sheet-actions">
                {hasAnswer && (
                  <button type="button" onClick={() => void copyAnswer()}>
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                )}
                <button type="button" onClick={clearBoard}>
                  Done
                </button>
              </div>
            </div>
            <h1>{question || lastHeard?.text || "Ready when you are"}</h1>
            {(statusMsg || audioSession.error) && (
              <p className="cue-error">
                {statusMsg || audioSession.error}
                {(statusMsg || audioSession.error)?.includes("System Settings") && (
                  <button
                    type="button"
                    className="cue-action"
                    onClick={() => {
                      const msg = `${statusMsg || ""} ${audioSession.error || ""}`.toLowerCase();
                      const pane = msg.includes("microphone")
                        ? "microphone"
                        : msg.includes("screen recording") || msg.includes("system audio")
                          ? "screen"
                          : "privacy";
                      void window.cueai?.openPrivacySettings?.(pane);
                    }}
                  >
                    Open System Settings
                  </button>
                )}
              </p>
            )}
            {streaming ? (
              <div className="cue-think">
                <span className="cue-pulse" aria-hidden />
                Writing a first-person answer you can say out loud…
              </div>
            ) : (
              <div className="cue-answer">
                {answerLines(
                  answer || "Ask a question, or press Screen to read what’s in front of you.",
                ).map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
      <ResizeHandles />
    </div>
  );
}
