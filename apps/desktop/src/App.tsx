import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Bookmark,
  Camera,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  GripVertical,
  Languages,
  ListTodo,
  Mic,
  MicOff,
  Minimize2,
  Maximize2,
  Pin,
  Presentation,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { cn } from "./lib/utils";
import { useCompanionStore } from "./store/companion-store";
import { AIService, TranslationService } from "./services";
import {
  configureLiveTranscription,
  stopAllListen,
  subscribeListenLevels,
  syncListenSources,
  type ListenActiveState,
} from "./services/audio-listen";
import type { ScreenshotResult } from "./types/companion";
import { ResizeHandles } from "./components/ResizeHandles";

const suggestions = [
  "Summarize risks for the board",
  "Draft action items",
  "Translate last answer",
];

export default function App() {
  const {
    mode,
    pinned,
    opacity,
    panel,
    session,
    capture,
    listen,
    transcript,
    setMode,
    setPinned,
    setOpacity,
    setPanel,
    setSession,
    setCapture,
    setListen,
    appendTranscript,
  } = useCompanionStore();

  const [ask, setAsk] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [answer, setAnswer] = useState(
    "Turn on Mic or System and speak — transcript and a reply appear within ~2 seconds."
  );
  const [confidence, setConfidence] = useState(0.92);
  const [bookmarkCount, setBookmarkCount] = useState(2);
  const [answerPinned, setAnswerPinned] = useState(false);
  const [copied, setCopied] = useState(false);
  const [translated, setTranslated] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [activeLang, setActiveLang] = useState<string | null>(null);
  const [listenLive, setListenLive] = useState<ListenActiveState>({
    mic: "idle",
    system: "idle",
    micLevel: 0,
    systemLevel: 0,
    error: null,
  });
  const [listenBusy, setListenBusy] = useState(false);
  const [listenMsg, setListenMsg] = useState<string | null>(null);
  const [webApiBase, setWebApiBase] = useState("http://127.0.0.1:3000");
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const aiBusyRef = useRef(false);
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;
  const [shotBusy, setShotBusy] = useState(false);
  const [shotPreview, setShotPreview] = useState<string | null>(null);
  const [shotMsg, setShotMsg] = useState<string | null>(null);

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
    const offMode = window.cueai?.onMode((m) => setMode(m));
    const offSession = window.cueai?.onSession((s) => s && setSession(s));
    const offCapture = window.cueai?.onCaptureStatus((s) => s && setCapture(s));
    const offListen = window.cueai?.onListenSources((s) => setListen(s));
    const offWindow = window.cueai?.onWindowState?.((s) => setExpanded(s.expanded));
    return () => {
      offMode?.();
      offSession?.();
      offCapture?.();
      offListen?.();
      offWindow?.();
    };
  }, [setCapture, setListen, setMode, setSession]);

  useEffect(() => {
    return subscribeListenLevels(setListenLive);
  }, []);

  useEffect(() => {
    void window.cueai?.getWebOrigin?.().then((origin) => {
      if (origin) setWebApiBase(origin.replace(/\/$/, ""));
    });
  }, []);

  useEffect(() => {
    configureLiveTranscription({
      apiBase: webApiBase,
      onResult: (line) => {
        appendTranscript(line);
        setPanel("answer");
        setListenMsg(null);
        if (aiBusyRef.current) return;
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
            });
            setAnswer(result.answer);
            setConfidence(result.confidence);
          } catch {
            setListenMsg("Unable to generate an answer. Try again.");
          } finally {
            setStreaming(false);
            aiBusyRef.current = false;
          }
        })();
      },
      onError: (msg) => setListenMsg(msg),
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
          setListenMsg(err instanceof Error ? err.message : "Listen failed");
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

  async function runAsk(prompt: string) {
    const q = prompt.trim();
    if (!q || streaming) return;
    bumpActivity();
    setStreaming(true);
    setPanel("answer");
    setAnswerPinned(false);
    setCopied(false);
    try {
      const result = await AIService.ask(q, {
        transcript: transcript.map((t) => `${t.who}: ${t.text}`),
      });
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
    bumpActivity();
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

  async function resetWindowSize() {
    bumpActivity();
    setMenuOpen(false);
    const ok = await window.cueai?.resetSize();
    if (ok !== false) setExpanded(false);
  }

  function setPresenterMode(next: boolean) {
    bumpActivity();
    const m = next ? "presenter" : "full";
    setMode(m);
    void window.cueai?.setMode(m);
  }

  function micLabel() {
    if (listenBusy || listenLive.mic === "requesting_permission" || listenLive.mic === "connecting")
      return "Starting…";
    if (listenLive.mic === "processing") return "Thinking";
    if (listenLive.mic === "error") return "Mic err";
    if (listen.mic && listenLive.mic === "listening") return "Listening";
    return "Mic";
  }

  function systemLabel() {
    if (listenBusy || listenLive.system === "connecting") return "Starting…";
    if (listenLive.system === "processing") return "Thinking";
    if (listenLive.system === "error") return "Sys err";
    if (listen.systemAudio && listenLive.system === "listening") return "Listening";
    return "System";
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

  async function captureScreenshot() {
    bumpActivity();
    if (shotBusy) return;
    setShotBusy(true);
    setShotMsg(null);
    try {
      const result = (await window.cueai?.captureScreenshot({
        save: false,
      })) as ScreenshotResult | undefined;
      if (!result?.ok) {
        setShotMsg(result?.error || "Screenshot failed.");
        return;
      }
      if (result.dataUrl) setShotPreview(result.dataUrl);
      setShotMsg("Shot captured");
    } catch (err) {
      setShotMsg(err instanceof Error ? err.message : "Screenshot failed.");
    } finally {
      setShotBusy(false);
    }
  }

  const presenting = mode === "presenter" || session.screenSharing;
  const listeningAny = listen.mic || listen.systemAudio;

  return (
    <div className="overlay-root" onMouseMove={bumpActivity} onFocus={bumpActivity}>
      <div className="glass overlay-shell">
        <ResizeHandles />
        <header className="no-drag flex shrink-0 items-center gap-1 border-b border-white/15 px-2 py-1.5">
          <div
            className="header-drag min-w-0 flex-1"
            onDoubleClick={() => void toggleExpand()}
          >
            <GripVertical className="inline h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <Sparkles className="ml-1 inline h-3 w-3 shrink-0 text-teal-400" />
            <span className="ml-1 text-[11px] font-semibold tracking-tight">CueAI</span>
          {session.cueAiMode === "private" && (
            <span className="rounded border border-white/20 bg-white/10 px-1 py-0.5 text-[9px] text-zinc-200">
              Private
            </span>
          )}
          {session.cueAiMode === "live" && (
            <span className="rounded border border-teal-500/30 bg-teal-500/15 px-1 py-0.5 text-[9px] text-teal-200">
              Live
            </span>
          )}
          </div>
          <button
            type="button"
            title={capture?.message || (privacyOn ? "Hidden from screen share" : "Visible in screen share")}
            onClick={() => void togglePrivacy()}
            className={cn(
              "no-drag inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold transition-colors",
              privacyOn
                ? "border border-teal-500/40 bg-teal-500/20 text-teal-200 hover:bg-teal-500/30"
                : "border border-amber-500/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25"
            )}
          >
            {privacyOn ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
            Privacy {privacyOn ? "on" : "off"}
          </button>
          <button
            type="button"
            disabled={listenBusy}
            title={listen.mic ? "Microphone on" : "Microphone off"}
            onClick={() => void toggleListen("mic")}
            className={cn(
              "no-drag header-btn inline-flex items-center justify-center gap-0.5 rounded px-1 py-0.5 text-[8px] font-semibold transition-colors disabled:opacity-60",
              listen.mic
                ? "border border-teal-500/40 bg-teal-500/20 text-teal-200 hover:bg-teal-500/30"
                : "border border-white/20 bg-white/5 text-zinc-300 hover:bg-white/10"
            )}
          >
            {listen.mic ? <Mic className="h-2 w-2 shrink-0" /> : <MicOff className="h-2 w-2 shrink-0" />}
            <span className="min-w-[3.5rem] text-center">{micLabel()}</span>
          </button>
          <button
            type="button"
            disabled={listenBusy}
            title={listen.systemAudio ? "System audio on" : "System audio off"}
            onClick={() => void toggleListen("systemAudio")}
            className={cn(
              "no-drag header-btn inline-flex items-center justify-center gap-0.5 rounded px-1 py-0.5 text-[8px] font-semibold transition-colors disabled:opacity-60",
              listen.systemAudio
                ? "border border-sky-500/40 bg-sky-500/20 text-sky-100 hover:bg-sky-500/30"
                : "border border-white/20 bg-white/5 text-zinc-300 hover:bg-white/10"
            )}
          >
            {listen.systemAudio ? (
              <Volume2 className="h-2 w-2 shrink-0" />
            ) : (
              <VolumeX className="h-2 w-2 shrink-0" />
            )}
            <span className="min-w-[3.5rem] text-center">{systemLabel()}</span>
          </button>
          <button
            type="button"
            disabled={shotBusy}
            title="Capture screenshot"
            onClick={() => void captureScreenshot()}
            className={cn(
              "no-drag inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[8px] font-semibold transition-colors disabled:opacity-60",
              shotBusy
                ? "border border-violet-500/40 bg-violet-500/20 text-violet-100"
                : "border border-white/20 bg-white/5 text-zinc-300 hover:bg-white/10"
            )}
          >
            <Camera className="h-2 w-2" />
            {shotBusy ? "…" : "Shot"}
          </button>
          <div className="no-drag relative ml-auto flex shrink-0 items-center">
            <IconBtn
              label={expanded ? "Restore compact size" : "Expand overlay"}
              onClick={() => void toggleExpand()}
            >
              {expanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            </IconBtn>
            <IconBtn
              label={pinned ? "Unpin" : "Pin always on top"}
              onClick={() => {
                bumpActivity();
                setPinned(!pinned);
              }}
            >
              <Pin className={cn("h-3 w-3", pinned && "text-teal-400")} />
            </IconBtn>
            <IconBtn
              label="Presenter mode"
              onClick={() => setPresenterMode(mode !== "presenter")}
            >
              <Presentation className={cn("h-3 w-3", presenting && "text-teal-400")} />
            </IconBtn>
            <div className="relative">
              <IconBtn label="More options" onClick={() => setMenuOpen((o) => !o)}>
                <span className="text-[10px] font-bold leading-none">⋯</span>
              </IconBtn>
              {menuOpen && (
                <div className="absolute right-0 top-full z-30 mt-1 min-w-[9rem] rounded-lg border border-white/15 bg-[#0e1416]/95 py-1 shadow-lg">
                  <button
                    type="button"
                    className="block w-full px-2 py-1 text-left text-[10px] text-zinc-200 hover:bg-white/10"
                    onClick={() => void resetWindowSize()}
                  >
                    Reset window size
                  </button>
                  <button
                    type="button"
                    className="block w-full px-2 py-1 text-left text-[10px] text-zinc-200 hover:bg-white/10"
                    onClick={() => {
                      setMenuOpen(false);
                      void window.cueai?.hide();
                    }}
                  >
                    Hide overlay
                  </button>
                </div>
              )}
            </div>
            <IconBtn label="Hide" onClick={() => void window.cueai?.hide()}>
              <X className="h-3 w-3" />
            </IconBtn>
          </div>
        </header>

        <div className="overlay-body no-drag gap-1.5 p-2">
            {listenLive.error && (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-100">
                {listenLive.error}
              </p>
            )}
            {listenMsg && (
              <p className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] text-red-100">
                {listenMsg}
              </p>
            )}
            {listeningAny && (
              <p className="shrink-0 rounded-md border border-teal-500/20 bg-teal-500/5 px-2 py-1 text-[10px] text-teal-100/90">
                Live transcription active — speak naturally; updates every ~2s.
              </p>
            )}
            {shotMsg && (
              <p className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[10px] text-violet-100">
                {shotMsg}
              </p>
            )}
            {shotPreview && mode === "full" && (
              <div className="relative overflow-hidden rounded-lg border border-white/15">
                <img
                  src={shotPreview}
                  alt="Latest screenshot"
                  className="max-h-28 w-full object-cover object-top"
                />
                <button
                  type="button"
                  className="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-zinc-100 hover:bg-black/80"
                  onClick={() => {
                    setShotPreview(null);
                    setShotMsg(null);
                  }}
                >
                  Dismiss
                </button>
              </div>
            )}
            {mode === "full" && (
              <div className="flex shrink-0 gap-0.5">
                {(
                  [
                    ["answer", "Answer"],
                    ["transcript", "Transcript"],
                    ["actions", "Actions"],
                    ["translate", "Translate"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      bumpActivity();
                      setPanel(id);
                    }}
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[10px]",
                      panel === id
                        ? "bg-teal-500/25 text-teal-100"
                        : "text-zinc-300 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {mode === "full" && panel === "transcript" && (
              <div className="overlay-scroll space-y-1 rounded-lg border border-white/10 bg-black/35 p-2 text-[11px]">
                {transcript.length === 0 ? (
                  <p className="text-zinc-400">
                    Turn Mic or System on and speak — lines appear here every ~2 seconds.
                  </p>
                ) : (
                  transcript.map((line) => (
                    <p key={line.id}>
                      <span className="font-medium text-teal-300">{line.who}:</span>{" "}
                      <span className="text-zinc-100">{line.text}</span>
                    </p>
                  ))
                )}
              </div>
            )}

            {mode === "full" && panel === "actions" && (
              <div className="space-y-0.5 rounded-lg border border-white/10 bg-black/35 p-2 text-[11px] text-zinc-100">
                <p className="inline-flex items-center gap-1 text-teal-300">
                  <ListTodo className="h-3 w-3" /> Suggested next steps
                </p>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="block w-full rounded-md px-1.5 py-1 text-left hover:bg-white/10"
                    onClick={() => void runAsk(s)}
                    disabled={streaming}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {mode === "full" && panel === "translate" && (
              <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/35 p-2 text-[11px]">
                <p className="inline-flex items-center gap-1 text-teal-300">
                  <Languages className="h-3 w-3" /> Live translation
                </p>
                <div className="flex gap-1">
                  {["es", "fr", "de", "ja"].map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      className={cn(
                        "rounded-md border px-1.5 py-0.5 uppercase text-zinc-300 hover:border-teal-500/40 hover:text-teal-200",
                        activeLang === lang
                          ? "border-teal-500/50 text-teal-200"
                          : "border-white/15"
                      )}
                      onClick={() => {
                        bumpActivity();
                        setActiveLang(lang);
                        void TranslationService.translate(answer, lang).then((r) =>
                          setTranslated(r.text)
                        );
                      }}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
                <p className="text-zinc-100">{translated || answer}</p>
              </div>
            )}

            {(panel === "answer" || mode !== "full") && (
              <div
                className={cn(
                  "answer-panel overlay-scroll rounded-xl border border-teal-500/35 p-2",
                  presenting && "flex-1"
                )}
              >
                <div className="mb-0.5 flex items-center gap-1 text-[10px] font-medium text-teal-300">
                  <Sparkles className="h-3 w-3" />
                  {presenting ? "Presenter answer" : "AI Answer"}
                  {!streaming && (
                    <span className="ml-auto text-[9px] text-zinc-400">
                      {Math.round(confidence * 100)}%
                    </span>
                  )}
                </div>
                {streaming ? (
                  <div className="flex gap-1 py-1" aria-label="Generating answer">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="typing-dot h-1.5 w-1.5 rounded-full bg-teal-400"
                        style={{ animationDelay: `${i * 0.2}s` }}
                      />
                    ))}
                  </div>
                ) : (
                  <p
                    className={cn(
                      "leading-snug text-zinc-50",
                      mode === "mini" ? "text-[11px]" : "text-xs"
                    )}
                  >
                    {mode === "mini" ? "QA can finish by Wed EOD." : answer}
                  </p>
                )}
                {!streaming && mode !== "mini" && (
                  <div className="mt-1.5 flex flex-wrap gap-0.5">
                    <Chip
                      onClick={() => {
                        bumpActivity();
                        setAnswerPinned((p) => !p);
                      }}
                    >
                      <Pin className={cn("h-2.5 w-2.5", answerPinned && "text-teal-400")} />
                      {answerPinned ? "Pinned" : "Pin"}
                    </Chip>
                    <Chip onClick={() => void copyAnswer()}>
                      <Copy className="h-2.5 w-2.5" />
                      {copied ? "Copied" : "Copy"}
                    </Chip>
                    <Chip
                      onClick={() => {
                        void runAsk("regenerate");
                      }}
                    >
                      <RefreshCw className="h-2.5 w-2.5" />
                    </Chip>
                    {!presenting && (
                      <>
                        <Chip
                          onClick={() => {
                            bumpActivity();
                            setBookmarkCount((n) => n + 1);
                          }}
                        >
                          <Bookmark className="h-2.5 w-2.5" /> {bookmarkCount}
                        </Chip>
                        <Chip
                          onClick={() => {
                            void runAsk("Explain this simply");
                          }}
                        >
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
                  className="h-7 flex-1 rounded-lg border border-white/15 bg-black/40 px-2 text-[11px] text-white outline-none placeholder:text-zinc-400 focus:border-teal-500/50"
                />
                <button
                  type="submit"
                  disabled={streaming || !ask.trim()}
                  className="btn-gradient h-7 rounded-lg px-2.5 text-[11px] font-medium text-white disabled:opacity-50"
                >
                  {streaming ? "…" : "Ask"}
                </button>
              </form>
            )}

            {mode === "full" && panel === "answer" && (
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-1">
                  {(["Summarize", "Actions", "Risks"] as const).map((q) => (
                    <button
                      key={q}
                      type="button"
                      disabled={streaming}
                      className="rounded-md border border-white/15 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:border-white/30 hover:text-white disabled:opacity-50"
                      onClick={() => void runAsk(q)}
                    >
                      {q}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="ml-auto inline-flex items-center gap-0.5 text-[9px] text-zinc-400 hover:text-zinc-200"
                    onClick={() => void window.cueai?.openDashboard()}
                  >
                    Dashboard <ExternalLink className="h-2.5 w-2.5" />
                  </button>
                </div>
                <button
                  type="button"
                  disabled={ending}
                  onClick={() => void onEndSession()}
                  className="inline-flex h-7 w-full items-center justify-center gap-1 rounded-lg border border-red-500/40 bg-red-500/20 px-2 text-[11px] font-semibold text-red-100 hover:bg-red-500/30 disabled:opacity-60"
                >
                  <Square className="h-3 w-3 fill-current" />
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
                  className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-lg border border-red-500/40 bg-red-500/20 px-2 text-[11px] font-semibold text-red-100 hover:bg-red-500/30 disabled:opacity-60"
                >
                  <Square className="h-3 w-3 fill-current" />
                  {ending ? "Ending…" : "End Session"}
                </button>
              </div>
            )}

            <div className="no-drag mt-auto flex shrink-0 items-center gap-2 border-t border-white/10 pt-1.5">
              <span className="shrink-0 text-[9px] font-medium text-zinc-400">Opacity</span>
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
                className="h-1 w-full cursor-pointer accent-teal-400"
                title={`${Math.round(opacity * 100)}%`}
              />
              <span className="w-7 shrink-0 text-right text-[9px] tabular-nums text-zinc-300">
                {Math.round(opacity * 100)}%
              </span>
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
      className="rounded p-1 text-zinc-300 hover:bg-white/10 hover:text-white"
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
      className="inline-flex items-center gap-0.5 rounded-md border border-white/15 bg-black/30 px-1.5 py-0.5 text-[10px] text-zinc-200 hover:border-white/30"
    >
      {children}
    </button>
  );
}
