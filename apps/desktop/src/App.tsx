import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Camera,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Pin,
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
  subscribeListenLevels,
  syncListenSources,
  type ListenActiveState,
} from "./services/audio-listen";
import type { ScreenshotResult } from "./types/companion";
import { ResizeHandles } from "./components/ResizeHandles";

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function App() {
  const {
    pinned,
    opacity,
    session,
    capture,
    listen,
    transcript,
    setPinned,
    setOpacity,
    setSession,
    setCapture,
    setListen,
    appendTranscript,
  } = useCompanionStore();

  const [ask, setAsk] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [answer, setAnswer] = useState("");
  const [copied, setCopied] = useState(false);
  const [ending, setEnding] = useState(false);
  const [autoAnswer, setAutoAnswer] = useState(true);
  const [listenLive, setListenLive] = useState<ListenActiveState>({
    mic: "idle",
    system: "idle",
    micLevel: 0,
    systemLevel: 0,
    error: null,
  });
  const [listenBusy, setListenBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [webApiBase, setWebApiBase] = useState("http://127.0.0.1:3000");
  const [expanded, setExpanded] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [shotBusy, setShotBusy] = useState(false);
  const startedAtRef = useRef(Date.now());
  const aiBusyRef = useRef(false);
  const autoAnswerRef = useRef(autoAnswer);
  autoAnswerRef.current = autoAnswer;
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;

  useEffect(() => {
    void window.cueai?.pin(pinned);
  }, [pinned]);

  useEffect(() => {
    void window.cueai?.setOpacity(opacity);
  }, [opacity]);

  useEffect(() => {
    void window.cueai?.getCaptureStatus().then((s) => s && setCapture(s));
    void window.cueai?.getSession().then((s) => s && setSession(s));
    void window.cueai?.getListenSources().then((s) => s && setListen(s));
    void window.cueai?.getWindowState?.().then((s) => s && setExpanded(s.expanded));
    const offSession = window.cueai?.onSession((s) => s && setSession(s));
    const offCapture = window.cueai?.onCaptureStatus((s) => s && setCapture(s));
    const offListen = window.cueai?.onListenSources((s) => setListen(s));
    const offWindow = window.cueai?.onWindowState?.((s) => setExpanded(s.expanded));
    return () => {
      offSession?.();
      offCapture?.();
      offListen?.();
      offWindow?.();
    };
  }, [setCapture, setListen, setSession]);

  useEffect(() => {
    return subscribeListenLevels(setListenLive);
  }, []);

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
    setListenBusy(true);
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
      } finally {
        if (!cancelled) setListenBusy(false);
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

  function bumpActivity() {
    void window.cueai?.activity();
  }

  async function runAsk(prompt: string, image?: string) {
    const q = prompt.trim();
    if (!q || streaming) return;
    bumpActivity();
    setStreaming(true);
    setCopied(false);
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
    const last = [...transcript].reverse().find((t) => t.who !== "CueAI");
    await runAsk(
      last
        ? `Brief response to: ${last.text}`
        : "Give me a ready-to-say self-introduction from my resume and the job briefing.",
    );
  }

  async function analyzeScreen() {
    bumpActivity();
    if (shotBusy || streaming) return;
    setShotBusy(true);
    setStatusMsg(null);
    try {
      const result = (await window.cueai?.captureScreenshot({
        save: false,
      })) as ScreenshotResult | undefined;
      if (!result?.ok || !result.dataUrl) {
        setStatusMsg(result?.error || "Could not capture the screen.");
        return;
      }
      await runAsk(
        "Analyze this screen. If it shows an interview question, coding problem, or prompt, give me the best thing to say or do next. Use my resume and job briefing.",
        result.dataUrl,
      );
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Screenshot failed.");
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

  async function onEndSession() {
    if (ending) return;
    setEnding(true);
    bumpActivity();
    try {
      await stopAllListen();
      await window.cueai?.endSession();
    } finally {
      setEnding(false);
    }
  }

  const privacyOn = capture?.requested !== false;

  async function toggleExpand() {
    bumpActivity();
    if (expanded) {
      const ok = await window.cueai?.restore();
      if (ok !== false) setExpanded(false);
    } else {
      const ok = await window.cueai?.expand();
      if (ok !== false) setExpanded(true);
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

  const lastHeard = [...transcript].reverse().find((t) => t.who !== "CueAI");
  const listeningAny = listen.mic || listen.systemAudio;
  const hasAnswer = Boolean(answer.trim());

  return (
    <div className="overlay-root" onMouseMove={bumpActivity} onFocus={bumpActivity}>
      <div className="glass overlay-shell pk-shell">
        <ResizeHandles />

        <header className="no-drag flex shrink-0 items-center gap-2 px-3 pt-2.5 pb-1.5">
          <div
            className="header-drag min-w-0 flex-1"
            onDoubleClick={() => void toggleExpand()}
          >
            <GripVertical className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-teal-400" />
            <span className="text-[13px] font-semibold tracking-tight">CueAI</span>
            {session.cueAiMode === "live" && (
              <span className="rounded-full bg-teal-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-teal-200">
                Live
              </span>
            )}
          </div>
          <button
            type="button"
            title={
              capture?.message ||
              (privacyOn ? "Hidden from screen share" : "Visible in screen share")
            }
            onClick={() => void togglePrivacy()}
            className={cn(
              "no-drag inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold",
              privacyOn
                ? "bg-teal-500/15 text-teal-200"
                : "bg-amber-500/15 text-amber-100",
            )}
          >
            {privacyOn ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {privacyOn ? "Hidden" : "Visible"}
          </button>
          <IconBtn
            label={expanded ? "Restore compact size" : "Expand overlay"}
            onClick={() => void toggleExpand()}
          >
            {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </IconBtn>
          <IconBtn
            label={pinned ? "Unpin" : "Pin always on top"}
            onClick={() => {
              bumpActivity();
              setPinned(!pinned);
            }}
          >
            <Pin className={cn("h-3.5 w-3.5", pinned && "text-teal-400")} />
          </IconBtn>
          <IconBtn label="Hide overlay" onClick={() => void window.cueai?.hide()}>
            <X className="h-3.5 w-3.5" />
          </IconBtn>
        </header>

        <div className="overlay-body no-drag gap-2.5 px-3 pb-3">
          <div
            className={cn(
              "pk-banner",
              privacyOn ? "pk-banner-on" : "pk-banner-off",
            )}
          >
            {privacyOn
              ? "Hidden from screen share — the window behind this overlay is what others see."
              : "Visible in screen share. Turn Hidden on before you present."}
          </div>

          <div className="flex items-center gap-1.5">
            <SourceChip
              active={listen.mic}
              busy={listenBusy || listenLive.mic === "connecting"}
              live={listenLive.mic === "listening"}
              error={listenLive.mic === "error"}
              disabled={listenBusy}
              onClick={() => void toggleListen("mic")}
              icon={listen.mic ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3" />}
              label={listen.mic && listenLive.mic === "listening" ? "Mic" : "Mic"}
            />
            <SourceChip
              active={listen.systemAudio}
              busy={listenBusy || listenLive.system === "connecting"}
              live={listenLive.system === "listening"}
              error={listenLive.system === "error"}
              disabled={listenBusy}
              onClick={() => void toggleListen("systemAudio")}
              icon={
                listen.systemAudio ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />
              }
              label="System"
            />
            <span className="ml-auto text-[12px] font-semibold tabular-nums text-zinc-200">
              {formatElapsed(elapsedMs)}
            </span>
            <button
              type="button"
              disabled={ending}
              onClick={() => void onEndSession()}
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-zinc-300 hover:bg-white/10 hover:text-white disabled:opacity-60"
            >
              <Square className="h-2.5 w-2.5 fill-current" />
              {ending ? "Ending…" : "End"}
            </button>
          </div>

          {(listenLive.error || statusMsg) && (
            <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-100">
              {listenLive.error || statusMsg}
            </p>
          )}

          <div className="pk-heard">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              {listeningAny && <span className="pk-dot" />}
              {lastHeard ? lastHeard.who : listeningAny ? "Listening" : "Transcript"}
            </div>
            <p className="text-[13px] leading-snug text-zinc-100">
              {lastHeard
                ? lastHeard.text
                : listeningAny
                  ? "Speak naturally. The last question appears here."
                  : "Turn on Mic or System, then click Answer."}
            </p>
          </div>

          <div className="answer-panel overlay-scroll pk-answer">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-teal-300/90">
              <Sparkles className="h-3 w-3" />
              Answer
              {hasAnswer && !streaming && (
                <button
                  type="button"
                  onClick={() => void copyAnswer()}
                  className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-zinc-300 hover:bg-white/10"
                >
                  <Copy className="h-3 w-3" />
                  {copied ? "Copied" : "Copy"}
                </button>
              )}
            </div>
            {streaming ? (
              <div className="flex gap-1 py-3" aria-label="Generating answer">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="typing-dot h-1.5 w-1.5 rounded-full bg-teal-400"
                    style={{ animationDelay: `${i * 0.2}s` }}
                  />
                ))}
              </div>
            ) : hasAnswer ? (
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-50">{answer}</p>
            ) : (
              <p className="pk-empty">No messages yet. Click Answer to start!</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={streaming}
              onClick={() => void generateAnswer()}
              className="pk-cta pk-cta-primary"
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI Answer
            </button>
            <button
              type="button"
              disabled={shotBusy || streaming}
              onClick={() => void analyzeScreen()}
              className="pk-cta pk-cta-secondary"
            >
              <Camera className="h-3.5 w-3.5" />
              {shotBusy ? "Capturing…" : "Analyze Screen"}
            </button>
          </div>

          <form className="flex gap-1.5" onSubmit={(e) => void onAsk(e)}>
            <input
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              placeholder="Ask CueAI…"
              className="h-9 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 text-[12px] text-white outline-none placeholder:text-zinc-500 focus:border-teal-500/40"
            />
            <button
              type="submit"
              disabled={streaming || !ask.trim()}
              className="btn-gradient h-9 rounded-xl px-3 text-[12px] font-semibold text-white disabled:opacity-40"
            >
              Ask
            </button>
          </form>

          <div className="flex items-center gap-3 pt-0.5">
            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-300">
              <span className={cn("pk-switch", autoAnswer && "pk-switch-on")}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={autoAnswer}
                  onChange={(e) => setAutoAnswer(e.target.checked)}
                />
                <span className="pk-switch-knob" />
              </span>
              Auto-answer
            </label>
            <span className="ml-auto text-[10px] text-zinc-500">Opacity</span>
            <input
              type="range"
              min={35}
              max={100}
              step={1}
              value={Math.round(opacity * 100)}
              onChange={(e) => {
                bumpActivity();
                setOpacity(Number(e.target.value) / 100);
              }}
              className="h-1 w-16 cursor-pointer accent-teal-400"
              title={`${Math.round(opacity * 100)}%`}
            />
          </div>
        </div>
      </div>
    </div>
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
      className="rounded-md p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  );
}

function SourceChip({
  active,
  live,
  busy,
  error,
  disabled,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  live: boolean;
  busy: boolean;
  error: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-full px-2 text-[11px] font-semibold disabled:opacity-60",
        error
          ? "bg-red-500/15 text-red-100"
          : active
            ? "bg-teal-500/15 text-teal-100"
            : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200",
      )}
    >
      {icon}
      {label}
      {live && <span className="pk-dot" />}
      {busy && <span className="text-[9px] font-medium opacity-70">…</span>}
    </button>
  );
}
