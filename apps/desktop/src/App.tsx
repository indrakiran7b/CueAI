import { useEffect, useState, type FormEvent, type ReactNode } from "react";
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
import { cn } from "./lib/utils";
import { useCompanionStore } from "./store/companion-store";
import { AIService, TranslationService } from "./services";

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

export default function App() {
  const {
    mode,
    pinned,
    panel,
    session,
    capture,
    setMode,
    setPinned,
    setPanel,
    setSession,
    setCapture,
  } = useCompanionStore();

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
    void window.cueai?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    void window.cueai?.pin(pinned);
  }, [pinned]);

  // Keep window-level opacity fully clear (no dimming).
  useEffect(() => {
    void window.cueai?.setOpacity(1);
  }, []);

  useEffect(() => {
    void window.cueai?.getCaptureStatus().then((s) => s && setCapture(s));
    void window.cueai?.getSession().then((s) => s && setSession(s));
    const offMode = window.cueai?.onMode((m) => setMode(m));
    const offSession = window.cueai?.onSession((s) => s && setSession(s));
    const offCapture = window.cueai?.onCaptureStatus((s) => s && setCapture(s));
    return () => {
      offMode?.();
      offSession?.();
      offCapture?.();
    };
  }, [setCapture, setMode, setSession]);

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
      const result = await AIService.ask(q);
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
      await window.cueai?.endSession();
    } finally {
      setEnding(false);
    }
  }

  const privacyOn = capture?.applied === true && capture?.supported !== false;

  async function togglePrivacy() {
    bumpActivity();
    const status = await window.cueai?.setExcludeCapture(!privacyOn);
    if (status) setCapture(status);
  }

  const presenting = mode === "presenter" || session.screenSharing;

  return (
    <div
      className="flex h-full flex-col bg-transparent p-1.5"
      onMouseMove={bumpActivity}
      onFocus={bumpActivity}
    >
      <div
        className={cn(
          "glass flex h-full flex-col overflow-hidden rounded-xl",
          mode === "collapsed" && "justify-center"
        )}
      >
        <header className="drag-region flex items-center gap-1.5 border-b border-white/15 px-2.5 py-1.5">
          <GripVertical className="h-3.5 w-3.5 text-zinc-400" />
          <Sparkles className="h-3 w-3 text-teal-400" />
          <span className="text-[11px] font-semibold tracking-tight">CueAI</span>
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
          <div className="no-drag ml-auto flex items-center">
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
              onClick={() => {
                bumpActivity();
                setMode(mode === "presenter" ? "full" : "presenter");
              }}
            >
              <Presentation className={cn("h-3 w-3", presenting && "text-teal-400")} />
            </IconBtn>
            {!presenting && (
              <IconBtn
                label="Mini"
                onClick={() => {
                  bumpActivity();
                  setMode(mode === "mini" ? "full" : "mini");
                }}
              >
                <Minimize2 className="h-3 w-3" />
              </IconBtn>
            )}
            <IconBtn label="Hide" onClick={() => void window.cueai?.hide()}>
              <X className="h-3 w-3" />
            </IconBtn>
          </div>
        </header>

        {mode === "collapsed" ? (
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-200">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-400" />
              </span>
              Listening · Privacy {privacyOn ? "on" : "off"}
            </div>
            <button
              className="no-drag rounded px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-white/10"
              onClick={() => setMode("full")}
            >
              Expand
            </button>
          </div>
        ) : (
          <div className="no-drag flex min-h-0 flex-1 flex-col gap-1.5 p-2">
            {mode === "full" && (
              <div className="flex gap-0.5">
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
              <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-black/35 p-2 text-[11px]">
                {transcript.map((line) => (
                  <p key={line.text}>
                    <span className="font-medium text-teal-300">{line.who}:</span>{" "}
                    <span className="text-zinc-100">{line.text}</span>
                  </p>
                ))}
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
                  "answer-panel rounded-xl border border-teal-500/35 p-2",
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

            {mode === "mini" && (
              <button
                type="button"
                className="text-[9px] text-zinc-400 hover:text-zinc-200"
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
