import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  BookOpen,
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
import { TransparencyControl } from "./components/TransparencyControl";
import { useOverlayTransparency } from "./lib/use-overlay-transparency";
import { pickManualQuestion } from "./lib/manual-question";
import { useCompanionStore } from "./store/companion-store";
import { AIService } from "./services";
import {
  configureAnswerApi,
  requestLiveAnswerStream,
  type AnswerSource,
  type KnowledgeBaseSource,
  type KnowledgeBaseStatus,
} from "./services/live-answer";
import { createCueaiLatency } from "../../shared/cueai-latency";
import {
  AnswerSequencer,
  PipelineMetrics,
  QuestionGate,
  UtteranceAssembler,
  selectHistory,
  type Exchange,
  type FinalUtterance,
} from "../../shared/live-pipeline";
import { isFirstMeaningfulAnswer } from "../../shared/speech-capture";
import { answerBlocks } from "../../shared/answer-blocks";
import {
  cleanQuestionText,
  clearQuestionMemory,
  getRollingContext,
  pushRollingTranscript,
} from "./services/question-detection";
import { debugText, isPipelineDebug, pipelineLog } from "./services/pipeline-log";
import {
  configureLiveTranscription,
  getTranscribeStats,
  resetTranscriptionContext,
  startMicListen,
  startSystemAudioListen,
  stopAllListen,
  stopMicListen,
  stopSystemAudioListen,
  subscribeListenLevels,
  syncListenSources,
} from "./services/audio-listen";
import type { ScreenshotResult } from "./types/companion";
import { ResizeHandles } from "./components/ResizeHandles";
import {
  humanizeFetchError,
  type AudioSessionSnapshot,
  type AudioSessionState,
} from "./services/audio-session-manager";

type ListenKind = "mic" | "systemAudio";

const isCapturing = (s: AudioSessionState) => s === "listening" || s === "processing";
const isStarting = (s: AudioSessionState) => s === "requesting_permission" || s === "connecting";

const getDesktopSourceId = async () => (await window.cueai?.getDesktopAudioSourceId()) ?? null;

type AskOptions = {
  image?: string;
  echoAsYou?: boolean;
  /** Set for auto-answers; an utterance is answered at most once. */
  utteranceId?: string;
  uncertain?: boolean;
};

type LivePipeline = {
  assembler: UtteranceAssembler;
  gate: QuestionGate;
  sequencer: AnswerSequencer;
  metrics: PipelineMetrics;
};

function createLivePipeline(onFinal: (u: FinalUtterance) => void): LivePipeline {
  const metrics = new PipelineMetrics();
  const pipeline: LivePipeline = {
    assembler: new UtteranceAssembler({
      onFinal,
      onDebug: (e) => {
        if (isPipelineDebug()) {
          pipelineLog("question", `Assembler ${e.type}`, { who: e.who, seq: e.seq, detail: e.detail });
        }
      },
    }),
    gate: new QuestionGate(),
    sequencer: new AnswerSequencer(),
    metrics,
  };
  // Counters and per-stage latency only (no transcript text) for live diagnosis in DevTools.
  (window as unknown as { __cueaiPipeline?: unknown }).__cueaiPipeline = {
    counters: metrics.counters,
    rates: () => metrics.rates(),
    summarize: (utteranceId: string) => metrics.summarize(utteranceId),
    transcription: getTranscribeStats,
  };
  return pipeline;
}

const ANSWER_SOURCE_KEY = "cueai.overlay.answerSource";

function loadAnswerSource(): AnswerSource {
  try {
    return localStorage.getItem(ANSWER_SOURCE_KEY) === "knowledge_base" ? "knowledge_base" : "general";
  } catch {
    return "general";
  }
}

type KbMeta = { status: KnowledgeBaseStatus; sources: KnowledgeBaseSource[]; notice: string | null };

const KB_STATUS_LABEL: Record<KnowledgeBaseStatus, string> = {
  answered: "Answered from your Knowledge Base",
  partial: "Partly answered from your Knowledge Base",
  not_found: "Not found in your Knowledge Base",
  no_documents: "No Knowledge Base documents",
  not_ready: "Documents still indexing",
  indexing_failed: "Indexing failed",
};

function KnowledgeBaseFooter({ meta }: { meta: KbMeta }) {
  return (
    <div className="cue-kb" aria-label="Knowledge Base sources">
      <p className="cue-kb-status">{KB_STATUS_LABEL[meta.status]}</p>
      {meta.notice && <p className="cue-kb-note">{meta.notice}</p>}
      {meta.sources.length > 0 && (
        <ol className="cue-kb-sources">
          {meta.sources.map((s) => (
            <li key={`${s.ref}-${s.documentId}`}>
              <span className="cue-kb-file">
                [{s.ref}] {s.filename}
                {s.page != null ? ` · page ${s.page}` : ""}
              </span>
              <span className="cue-kb-excerpt">{s.excerpt}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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
  const [answerSource, setAnswerSource] = useState<AnswerSource>(loadAnswerSource);
  const answerSourceRef = useRef(answerSource);
  answerSourceRef.current = answerSource;
  const [kbMeta, setKbMeta] = useState<KbMeta | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const transparency = useOverlayTransparency();
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
    micError: null,
    systemError: null,
  });
  const [audioErrors, setAudioErrors] = useState<Record<ListenKind, string | null>>({
    mic: null,
    systemAudio: null,
  });
  const onUtteranceRef = useRef<(u: FinalUtterance) => void>(() => undefined);
  const pipelineRef = useRef<LivePipeline | null>(null);
  if (!pipelineRef.current) pipelineRef.current = createLivePipeline((u) => onUtteranceRef.current(u));
  const pipeline = pipelineRef.current;
  /** Question/answer pairs from the current meeting, oldest first. */
  const exchangesRef = useRef<Exchange[]>([]);
  const lastCompleteRef = useRef("");
  const startedAtRef = useRef(Date.now());
  const aiBusyRef = useRef(false);
  const autoAnswerRef = useRef(autoAnswer);
  autoAnswerRef.current = autoAnswer;
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;
  const streamingRef = useRef(streaming);
  streamingRef.current = streaming;
  const runAskRef = useRef<(prompt: string, opts?: AskOptions) => Promise<void>>(async () => undefined);
  const askRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const meetingKeyRef = useRef<string | null>(null);
  const systemOnRef = useRef(false);

  const privacyOn = capture?.requested !== false;
  /** Requested is the user's choice; applied is what the OS actually confirmed. */
  const privacyConfirmed = privacyOn && capture?.applied === true;
  const lastHeard = [...transcript].reverse().find((t) => t.who !== "CueAI");
  const hasAnswer = Boolean(answer.trim());
  const boardOpen = streaming || hasAnswer || Boolean(question.trim());
  const listening = audioSession.mic === "listening" || audioSession.system === "listening";
  const micLive = isCapturing(audioSession.mic);
  const systemLive = isCapturing(audioSession.system);
  const micStarting = isStarting(audioSession.mic);
  const systemStarting = isStarting(audioSession.system);
  systemOnRef.current = systemLive;
  const sourceProblem = [audioErrors.mic, audioErrors.systemAudio].filter(Boolean).join(" · ");
  const audioProblem = statusMsg || sourceProblem || audioSession.error;
  const cueAiOn = Boolean(session.active && session.cueAiMode !== "inactive");
  const cueAiOnRef = useRef(cueAiOn);
  const liveListening = Boolean(session.active && session.cueAiMode === "live");
  const liveListeningRef = useRef(false);
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
        appendTranscript({ who: line.who, text: line.text });
        pushRollingTranscript(line.who, line.text);
        setStatusMsg(null);
      },
      onError: (msg) => {
        pipeline.metrics.count("transcriptionErrors");
        setStatusMsg(msg);
      },
      onSpeechStart: (who, at) => pipeline.assembler.speechStart(who, at),
      onSpeechEnd: (who, at, lastVoiceAt) => pipeline.assembler.speechEnd(who, at, lastVoiceAt),
      onSegmentQueued: (who, seq) => pipeline.assembler.segmentQueued(who, seq),
      onSegmentResult: (who, seq, result) => pipeline.assembler.segmentResult(who, seq, result),
    });
    return () => {
      clearQuestionMemory();
      configureLiveTranscription(null);
      pipeline.assembler.reset();
      pipeline.sequencer.cancel();
    };
  }, [appendTranscript, webApiBase, pipeline]);

  onUtteranceRef.current = (u: FinalUtterance) => {
    const { metrics, gate } = pipeline;
    metrics.count("utterances");
    if (u.speechStartAt != null) metrics.mark(u.id, "speechStart", u.speechStartAt);
    if (u.lastVoiceAt != null) metrics.mark(u.id, "lastVoice", u.lastVoiceAt);
    if (u.speechEndAt != null) metrics.mark(u.id, "speechEnd", u.speechEndAt);
    if (u.transcribedAt != null) metrics.mark(u.id, "transcriptResponse", u.transcribedAt);
    metrics.mark(u.id, "finalized", u.finalizedAt);
    if (!u.complete) metrics.count("incomplete");

    // With system audio live the interviewer is on that lane; the mic is the candidate (context only).
    // With only the mic, the interviewer is heard through the mic, so it may trigger answers.
    const answerable = u.who === "System" || !systemOnRef.current;
    const decision = gate.evaluate(u, { answerable: answerable && autoAnswerRef.current });
    if (u.complete && answerable) {
      lastCompleteRef.current = decision.question;
      rememberQuestion(decision.question);
    }
    pipelineLog("question", decision.accept ? "Question accepted" : "Utterance not answered", {
      utterance: u.id,
      who: u.who,
      reason: !autoAnswerRef.current && answerable ? "auto_answer_off" : decision.reason,
      complete: u.complete,
      uncertain: u.uncertain,
      segments: u.segments,
      followUp: decision.followUp,
      text: debugText(u.text),
    });
    if (!decision.accept) {
      metrics.count(decision.reason === "duplicate" ? "duplicate" : "skipped");
      return;
    }
    void runAskRef.current(decision.question, {
      echoAsYou: false,
      utteranceId: u.id,
      uncertain: u.uncertain,
    });
  };

  useEffect(() => {
    if (!window.cueai) return;
    let cancelled = false;
    void (async () => {
      try {
        await syncListenSources({
          mic: listen.mic,
          systemAudio: listen.systemAudio,
          getDesktopSourceId,
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
    if (audioSession.mic === "error" && audioSession.micError) {
      setAudioErrors((e) => ({ ...e, mic: audioSession.micError }));
    } else if (isCapturing(audioSession.mic)) {
      setAudioErrors((e) => (e.mic ? { ...e, mic: null } : e));
    }
  }, [audioSession.mic, audioSession.micError]);

  useEffect(() => {
    if (audioSession.system === "error" && audioSession.systemError) {
      setAudioErrors((e) => ({ ...e, systemAudio: audioSession.systemError }));
    } else if (isCapturing(audioSession.system)) {
      setAudioErrors((e) => (e.systemAudio ? { ...e, systemAudio: null } : e));
    }
  }, [audioSession.system, audioSession.systemError]);

  useEffect(() => {
    const wasOn = cueAiOnRef.current;
    cueAiOnRef.current = cueAiOn;
    if (wasOn && !cueAiOn) void releaseAudio();
  }, [cueAiOn]);

  // Live mode means "listen now": open both lanes immediately instead of waiting for toolbar clicks.
  useEffect(() => {
    const was = liveListeningRef.current;
    liveListeningRef.current = liveListening;
    if (liveListening && !was) {
      const current = useCompanionStore.getState().listen;
      if (current.mic && current.systemAudio) return;
      pipelineLog("audio", "Live session started — starting microphone and system audio");
      void saveListen({ mic: true, systemAudio: true });
    } else if (!liveListening && was && cueAiOnRef.current) {
      pipelineLog("audio", "Left live mode — releasing capture");
      void releaseAudio();
    }
  }, [liveListening]);

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
    void window.cueai?.fitHeight?.(menuOpen ? 340 : sourceProblem ? 200 : 152);
  }, [menuOpen, boardOpen, expanded, sourceProblem]);

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
    clearQuestionMemory();
    resetTranscriptionContext();
    pipeline.assembler.reset();
    pipeline.gate.reset();
    pipeline.sequencer.reset();
    pipeline.metrics.reset();
    exchangesRef.current = [];
    lastCompleteRef.current = "";
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

  async function runAsk(prompt: string, image?: string, opts?: Omit<AskOptions, "image">) {
    const q = cleanQuestionText(prompt);
    if (!q) return;
    const { sequencer, metrics } = pipeline;
    // Newest question wins: the sequencer aborts any running answer; an utterance is answered once.
    const wasBusy = streamingRef.current;
    const ticket = sequencer.begin(opts?.utteranceId);
    if (!ticket) {
      pipelineLog("question", "Utterance already answered", { utterance: opts?.utteranceId });
      return;
    }
    if (wasBusy) metrics.count("answerSuperseded");
    const isStale = () => !sequencer.isCurrent(ticket.id);
    const metricId = opts?.utteranceId || `manual-${ticket.id}`;
    bumpActivity();
    if (!image) rememberQuestion(q);
    setStreaming(true);
    streamingRef.current = true;
    setAnswer("");
    setKbMeta(null);
    setStatusMsg(image ? null : "Answering...");
    aiBusyRef.current = true;
    const source = image ? "general" : answerSourceRef.current;
    const context = getRollingContext(3);
    if (!image && opts?.echoAsYou !== false) appendTranscript({ who: "You", text: q });
    const cueLat = createCueaiLatency("01");
    cueLat.mark("questionSent");
    metrics.mark(metricId, "llmRequest");

    let streamed = "";
    try {
      if (image) {
        const result = await AIService.ask(q, { transcript: context.map((t) => `${t.who}: ${t.text}`), image }, { fallback: false });
        if (isStale()) return;
        setAnswer(result.answer);
        setStatusMsg(null);
        appendTranscript({ who: "CueAI", text: result.answer });
        return;
      }
      let flushTimer: number | null = null;
      let pendingFull = "";
      let answerText = "";
      try {
        const result = await requestLiveAnswerStream(q, getRollingContext(6), {
          signal: ticket.signal,
          history: selectHistory(q, exchangesRef.current),
          uncertain: opts?.uncertain,
          source,
          onConnected: () => cueLat.mark("llmConnected"),
          onToken: (_token, full) => {
            if (isStale() || source === "knowledge_base") return;
            streamed = full;
            pendingFull = full;
            if (!cueLat.marks.firstToken) {
              cueLat.mark("firstToken");
              metrics.mark(metricId, "firstToken");
            }
            if (!cueLat.marks.firstRender) {
              if (!isFirstMeaningfulAnswer(full)) return;
              setStatusMsg(null);
              setAnswer(full);
              cueLat.mark("firstRender");
              return;
            }
            if (flushTimer != null) return;
            flushTimer = window.setTimeout(() => {
              flushTimer = null;
              if (!isStale()) setAnswer(pendingFull);
            }, 32);
          },
        });
        answerText = result.answer;
        if (result.kbStatus && !isStale()) {
          setKbMeta({ status: result.kbStatus, sources: result.sources || [], notice: result.notice ?? null });
        }
      } catch (err) {
        if (isStale()) throw err;
        // Knowledge Base mode never falls back to a general AI answer.
        if (source === "knowledge_base") throw err;
        // A partially streamed answer is shown as-is; retrying would duplicate or contradict it.
        if (streamed.trim()) {
          setAnswer(streamed);
          setStatusMsg("Answer was interrupted. Ask again to regenerate.");
          metrics.count("answerFailed");
          return;
        }
        pipelineLog("fallback", "Stream failed before any text — trying non-stream path", {
          error: err instanceof Error ? err.message.slice(0, 120) : "unknown",
        });
        const result = await AIService.ask(
          q,
          { transcript: context.map((t) => `${t.who}: ${t.text}`) },
          { fallback: false },
        );
        answerText = result.answer;
      } finally {
        if (flushTimer != null) window.clearTimeout(flushTimer);
      }
      if (isStale()) return;
      setAnswer(answerText);
      setStatusMsg(null);
      appendTranscript({ who: "CueAI", text: answerText });
      exchangesRef.current.push({ question: q, answer: answerText });
      if (exchangesRef.current.length > 40) exchangesRef.current.shift();
      cueLat.mark("complete");
      cueLat.report("macOS");
      metrics.mark(metricId, "answerComplete");
      metrics.count("answered");
      pipelineLog("perf", "Utterance latency", { utterance: metricId, ...metrics.summarize(metricId) });
    } catch (err) {
      if (isStale()) return;
      metrics.count("answerFailed");
      setStatusMsg(err instanceof Error ? err.message : "Unable to generate an answer. Try again.");
    } finally {
      if (!isStale()) {
        sequencer.finish(ticket.id);
        setStreaming(false);
        streamingRef.current = false;
        aiBusyRef.current = false;
      }
    }
  }
  runAskRef.current = (prompt, opts) =>
    runAsk(prompt, opts?.image, {
      echoAsYou: opts?.echoAsYou,
      utteranceId: opts?.utteranceId,
      uncertain: opts?.uncertain,
    });

  async function onAsk(e: FormEvent) {
    e.preventDefault();
    const prompt = ask.trim();
    if (!prompt) return;
    setAsk("");
    await runAsk(prompt);
  }

  /** Returns null when capture may proceed, otherwise the reason it can't. */
  async function ensurePermission(kind: "microphone" | "systemAudio"): Promise<string | null> {
    const api = window.cueai;
    if (!api?.getPermissions || !api.requestPermission) return null;
    const current = await api.getPermissions();
    const status = kind === "microphone" ? current.microphone : current.systemAudio;
    if (status.state === "granted") return null;
    if (status.state === "denied" || status.state === "restricted") return status.message;
    const next = await api.requestPermission(kind === "microphone" ? "microphone" : "systemAudio");
    if (next.state === "granted" || next.state === "not-determined") return null;
    return next.message;
  }

  async function generateAnswer() {
    const typed = ask.trim();
    const q = pickManualQuestion(typed, lastCompleteRef.current || lastHeard?.text);
    if (!q) {
      askRef.current?.focus();
      return;
    }
    if (q === typed) {
      setAsk("");
      await runAsk(q);
      return;
    }
    await runAsk(q, undefined, { echoAsYou: false });
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
      setStatusMsg("Copy failed. Select the answer text to copy it.");
    }
  }

  function clearBoard() {
    bumpActivity();
    pipeline.sequencer.cancel();
    streamingRef.current = false;
    aiBusyRef.current = false;
    setStreaming(false);
    setAnswer("");
    setKbMeta(null);
    setQuestion("");
    setStatusMsg(null);
  }

  function toggleAnswerSource() {
    bumpActivity();
    const next: AnswerSource = answerSource === "knowledge_base" ? "general" : "knowledge_base";
    setAnswerSource(next);
    try {
      localStorage.setItem(ANSWER_SOURCE_KEY, next);
    } catch {
      // Preference only; the toggle still applies for this window.
    }
  }

  async function onEndSession() {
    if (ending) return;
    setEnding(true);
    bumpActivity();
    try {
      await releaseAudio();
      await window.cueai?.endSession();
      clearBoard();
      setMenuOpen(false);
    } catch {
      setStatusMsg("Could not end the session. Try again.");
    } finally {
      setEnding(false);
    }
  }

  async function releaseAudio() {
    await stopAllListen();
    setAudioErrors({ mic: null, systemAudio: null });
    await saveListen({ mic: false, systemAudio: false });
  }

  async function saveListen(next: { mic: boolean; systemAudio: boolean }) {
    setListen(next);
    try {
      const saved = await window.cueai?.setListenSources(next);
      if (saved) setListen(saved);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Could not change listen sources.");
    }
  }

  async function togglePrivacy() {
    bumpActivity();
    try {
      const status = await window.cueai?.setExcludeCapture(!privacyOn);
      if (!status) {
        setStatusMsg("Privacy could not be changed.");
        return;
      }
      setCapture(status);
      if (status.requested && !status.applied) setStatusMsg(status.message);
    } catch {
      setStatusMsg("Privacy could not be changed.");
    }
  }

  async function toggleListen(kind: ListenKind) {
    bumpActivity();
    const state = kind === "mic" ? audioSession.mic : audioSession.system;
    const withSource = (on: boolean) => ({ ...useCompanionStore.getState().listen, [kind]: on });
    // Stopping clears the service's auto-recover intent, so a failed or disabled source stays off.
    const stop = () => (kind === "mic" ? stopMicListen() : stopSystemAudioListen());
    setAudioErrors((e) => ({ ...e, [kind]: null }));
    if (isCapturing(state) || isStarting(state)) {
      await stop();
      await saveListen(withSource(false));
      return;
    }
    const denied = await ensurePermission(kind === "mic" ? "microphone" : "systemAudio");
    if (denied) {
      await stop();
      setAudioErrors((e) => ({ ...e, [kind]: denied }));
      await saveListen(withSource(false));
      return;
    }
    // Flag first so the listen-sync effect joins this start instead of cancelling it.
    await saveListen(withSource(true));
    try {
      if (kind === "mic") await startMicListen();
      else await startSystemAudioListen(getDesktopSourceId);
    } catch (err) {
      await stop();
      setAudioErrors((e) => ({ ...e, [kind]: humanizeFetchError(err) }));
      await saveListen(withSource(false));
    }
  }

  const askPlaceholder = shotBusy
    ? "Reading what’s on screen…"
    : streaming
      ? "Composing a speakable reply…"
      : answerSource === "knowledge_base"
        ? "Ask your Knowledge Base"
        : "Ask CueAI for this call";

  return (
    <div
      ref={rootRef}
      className={cn(
        "cue-root",
        boardOpen && "is-open",
        !boardOpen && sourceProblem && "has-hint",
        transparency.value > 0 && "is-see-through",
      )}
      style={transparency.style}
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
              title={
                !privacyOn
                  ? "Visible in screen share"
                  : privacyConfirmed
                    ? "Hidden from screen share"
                    : `Hiding requested, not confirmed by macOS: ${capture?.message || "status unknown"}`
              }
              onClick={() => void togglePrivacy()}
            >
              <span className="cue-led" />
              {!privacyOn ? "Visible" : privacyConfirmed ? "Hidden" : "Unconfirmed"}
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
                <button type="button" role="menuitem" onClick={() => setPinned(!pinned)}>
                  <Pin className="h-4 w-4" />
                  <span>Keep on top</span>
                  <em>{pinned ? "Enabled" : "Disabled"}</em>
                </button>
                <button type="button" role="menuitem" onClick={() => setAutoAnswer((v) => !v)}>
                  <Sparkles className="h-4 w-4" />
                  <span>Auto-reply</span>
                  <em>{autoAnswer ? "Enabled" : "Disabled"}</em>
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
        <TransparencyControl
          value={transparency.value}
          error={transparency.error}
          onChange={(v) => {
            bumpActivity();
            transparency.change(v);
          }}
        />

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
            className={cn("cue-action", answerSource === "knowledge_base" && "is-on is-kb")}
            onClick={toggleAnswerSource}
            aria-pressed={answerSource === "knowledge_base"}
            aria-label={answerSource === "knowledge_base" ? "Answer source: Knowledge Base" : "Answer source: General AI"}
            title={
              answerSource === "knowledge_base"
                ? "Knowledge Base: answers only from your uploaded documents. Click for General AI."
                : "General AI. Click to answer only from your Knowledge Base documents."
            }
          >
            <BookOpen className="h-3.5 w-3.5" />
            {answerSource === "knowledge_base" ? "KB" : "General"}
          </button>
          <button
            type="button"
            className={cn("cue-action", shotBusy && "is-on")}
            onClick={() => void analyzeScreen()}
          >
            <Camera className="h-3.5 w-3.5" />
            {shotBusy ? "Reading" : "Screen"}
          </button>
          <button
            type="button"
            className={cn(
              "cue-action cue-src",
              micLive && "is-live",
              micStarting && "is-pending",
              audioErrors.mic && "is-error",
            )}
            onClick={() => void toggleListen("mic")}
            aria-label={micLive ? "Mic on" : "Mic off"}
            aria-pressed={micLive}
            aria-busy={micStarting}
            title={
              audioErrors.mic ||
              (micStarting ? "Starting microphone…" : micLive ? "Mic on — click to stop" : "Mic off — click to start")
            }
          >
            {micLive || micStarting ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
            <span className="cue-src-label">Mic</span>
            <span className="cue-src-dot" aria-hidden />
          </button>
          <button
            type="button"
            className={cn(
              "cue-action cue-src",
              systemLive && "is-live",
              systemStarting && "is-pending",
              audioErrors.systemAudio && "is-error",
            )}
            onClick={() => void toggleListen("systemAudio")}
            aria-label={systemLive ? "System Audio on" : "System Audio off"}
            aria-pressed={systemLive}
            aria-busy={systemStarting}
            title={
              audioErrors.systemAudio ||
              (systemStarting
                ? "Starting system audio…"
                : systemLive
                  ? "System Audio on — click to stop"
                  : "System Audio off — click to start")
            }
          >
            {systemLive || systemStarting ? (
              <Volume2 className="h-3.5 w-3.5" />
            ) : (
              <VolumeX className="h-3.5 w-3.5" />
            )}
            <span className="cue-src-label">System Audio</span>
            <span className="cue-src-dot" aria-hidden />
          </button>
        </form>

        {!boardOpen && sourceProblem && (
          <div className="cue-hint no-drag" role="alert">
            <p title={sourceProblem}>{sourceProblem}</p>
            {sourceProblem.includes("System Settings") && (
              <button
                type="button"
                onClick={() =>
                  void window.cueai?.openPrivacySettings?.(
                    audioErrors.mic?.includes("System Settings") ? "microphone" : "screen",
                  )
                }
              >
                Open Settings
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setAudioErrors({ mic: null, systemAudio: null })}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

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
            {(audioProblem) && (
              <p className="cue-error">
                {audioProblem}
                {audioProblem.includes("System Settings") && (
                  <button
                    type="button"
                    className="cue-action"
                    onClick={() =>
                      void window.cueai?.openPrivacySettings?.(
                        audioProblem.includes("Microphone")
                          ? "microphone"
                          : audioProblem.includes("Screen Recording") ||
                              audioProblem.includes("System audio")
                            ? "screen"
                            : "privacy",
                      )
                    }
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
                {answerBlocks(
                  answer || "Ask a question, or press Screen to read what’s in front of you.",
                ).map((block, i) =>
                  block.kind === "code" ? (
                    <pre key={i} aria-label={block.lang ? `${block.lang} code` : "code"}>
                      <code>{block.text}</code>
                    </pre>
                  ) : (
                    <p key={i}>{block.text}</p>
                  ),
                )}
                {kbMeta && <KnowledgeBaseFooter meta={kbMeta} />}
              </div>
            )}
          </section>
        )}
      </div>
      <ResizeHandles />
    </div>
  );
}
