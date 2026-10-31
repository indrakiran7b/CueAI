import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  BookOpen,
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
import { configureAnswerApi, prefetchSessionContext } from "./services/live-answer";
import {
  configureLiveTranscription,
  getListenActive,
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
import type { AudioSessionState } from "./services/audio-session-manager";
import {
  clearQuestionMemory,
  getRollingContext,
  pushRollingTranscript,
  cleanQuestionText,
} from "./services/question-detection";
import { isFirstMeaningfulAnswer } from "./services/speech-capture";
import {
  createLatencyTracker,
  debugText,
  isPipelineDebug,
  pipelineLog,
  prewarmAnswerApi,
} from "./services/pipeline-log";
import {
  requestLiveAnswerStream,
  type AnswerSource,
  type KnowledgeBaseSource,
  type KnowledgeBaseStatus,
} from "./services/live-answer";
import {
  AnswerSequencer,
  PipelineMetrics,
  QuestionGate,
  UtteranceAssembler,
  selectHistory,
  type Exchange,
  type FinalUtterance,
} from "../../shared/live-pipeline";
import {
  configureMeetingPersist,
  persistFailedQuestion,
  persistTranscriptLine,
} from "./services/meeting-persist";
import {
  configureScreenContextApi,
  requestScreenContext,
} from "./services/screen-context";
import type { ScreenshotResult } from "./types/companion";
import { ResizeHandles } from "./components/ResizeHandles";
import { AnswerContent } from "./components/AnswerContent";

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
    <div className="ov-kb" aria-label="Knowledge Base sources">
      <p className="ov-kb-status">{KB_STATUS_LABEL[meta.status]}</p>
      {meta.notice && <p className="ov-kb-note">{meta.notice}</p>}
      {meta.sources.length > 0 && (
        <ol className="ov-kb-sources">
          {meta.sources.map((s) => (
            <li key={`${s.ref}-${s.documentId}`}>
              <span className="ov-kb-file">
                [{s.ref}] {s.filename}
                {s.page != null ? ` · page ${s.page}` : ""}
              </span>
              <span className="ov-kb-excerpt">{s.excerpt}</span>
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

type ListenKind = "mic" | "systemAudio";

type AnswerOptions = {
  utteranceId?: string;
  questionWho?: string;
  source?: "auto" | "manual" | "screen";
  latency?: ReturnType<typeof createLatencyTracker>;
  uncertain?: boolean;
};

const ANSWER_SOURCE_KEY = "cueai.overlay.answerSource";

function loadAnswerSource(): AnswerSource {
  try {
    return localStorage.getItem(ANSWER_SOURCE_KEY) === "knowledge_base" ? "knowledge_base" : "general";
  } catch {
    return "general";
  }
}

type KbMeta = { status: KnowledgeBaseStatus; sources: KnowledgeBaseSource[]; notice: string | null };

const isCapturing = (s: AudioSessionState) => s === "listening" || s === "processing";
const isStarting = (s: AudioSessionState) => s === "requesting_permission" || s === "connecting";

const getDesktopSourceId = async () => (await window.cueai?.getDesktopAudioSourceId()) ?? null;

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
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [webApiBase, setWebApiBase] = useState("http://127.0.0.1:3000");
  const [expanded, setExpanded] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [shotBusy, setShotBusy] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [audio, setAudio] = useState<{ mic: AudioSessionState; system: AudioSessionState }>({
    mic: "idle",
    system: "idle",
  });
  const [audioErrors, setAudioErrors] = useState<Record<ListenKind, string | null>>({
    mic: null,
    systemAudio: null,
  });
  const startedAtRef = useRef(Date.now());
  const aiBusyRef = useRef(false);
  const streamingRef = useRef(false);
  const autoAnswerRef = useRef(autoAnswer);
  autoAnswerRef.current = autoAnswer;
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;
  const meetingIdRef = useRef(session?.meetingId);
  meetingIdRef.current = session?.meetingId;
  /** Ad-hoc listening outside a live session has no meeting to save into. */
  const persistRef = useRef(Boolean(session?.active));
  persistRef.current = Boolean(session?.active);
  const answerAbortRef = useRef<AbortController | null>(null);
  const askRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const meetingKeyRef = useRef<string | null>(null);
  const lastCompleteRef = useRef("");
  const answerHeardRef = useRef<(questionText: string, opts?: AnswerOptions) => Promise<void>>(
    async () => undefined,
  );
  const onUtteranceRef = useRef<(u: FinalUtterance) => void>(() => undefined);
  const pipelineRef = useRef<LivePipeline | null>(null);
  if (!pipelineRef.current) pipelineRef.current = createLivePipeline((u) => onUtteranceRef.current(u));
  const pipeline = pipelineRef.current;
  /** Question/answer pairs from the current meeting, oldest first. */
  const exchangesRef = useRef<Exchange[]>([]);
  const systemOnRef = useRef(false);

  const privacyOn = capture?.requested !== false;
  /** Requested is the user's choice; applied is what the OS actually confirmed. */
  const privacyConfirmed = privacyOn && capture?.applied === true;
  const lastHeard = [...transcript].reverse().find((t) => t.who !== "CueAI");
  const hasAnswer = Boolean(answer.trim());
  const boardOpen = streaming || hasAnswer || Boolean(question.trim());
  const micOn = isCapturing(audio.mic);
  const systemOn = isCapturing(audio.system);
  const micStarting = isStarting(audio.mic);
  const systemStarting = isStarting(audio.system);
  const audioProblem = [audioErrors.mic, audioErrors.systemAudio].filter(Boolean).join(" · ");
  const cueAiOn = Boolean(session.active && session.cueAiMode !== "inactive");
  const cueAiOnRef = useRef(cueAiOn);
  const liveListening = Boolean(session.active && session.cueAiMode === "live");
  const liveListeningRef = useRef(false);
  systemOnRef.current = systemOn;

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
    const offPush = window.cueai?.onPushAnswer?.((payload) => {
      if (!payload?.answer?.trim()) return;
      rememberQuestion(payload.question?.trim() || "Screen context");
      setAnswer(payload.answer.trim());
      setKbMeta(null);
      setStreaming(false);
      setStatusMsg(null);
      appendTranscript({ who: "CueAI", text: payload.answer.trim() });
      pipelineLog("overlay", "[SCREEN-AI] Answer pushed from Screen Context page");
    });
    return () => {
      offSession?.();
      offCapture?.();
      offListen?.();
      offWindow?.();
      offPush?.();
    };
  }, [setCapture, setListen, setSession]);

  useEffect(() => {
    void window.cueai?.getWebOrigin?.().then((origin) => {
      if (origin) setWebApiBase(origin.replace(/\/$/, ""));
    });
  }, []);

  useEffect(() => {
    configureAnswerApi(webApiBase);
    configureScreenContextApi(webApiBase);
    configureMeetingPersist(webApiBase);
    prewarmAnswerApi(webApiBase);
  }, [webApiBase]);

  useEffect(() => {
    const id = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    configureLiveTranscription({
      apiBase: webApiBase,
      onResult: (line) => {
        appendTranscript({ who: line.who, text: line.text });
        pushRollingTranscript(line.who, line.text);
        setStatusMsg(null);

        // Every segment is final text for its stretch of audio (splits are not re-transcribed).
        if (line.text.trim() && persistRef.current) {
          persistTranscriptLine({
            who: line.who,
            text: line.text,
            source:
              line.who === "You"
                ? "microphone"
                : line.who === "System"
                  ? "system"
                  : undefined,
            meetingId: meetingIdRef.current,
          });
        }
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
      configureLiveTranscription(null);
      pipeline.assembler.reset();
      pipeline.sequencer.cancel();
      answerAbortRef.current?.abort();
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

    const latency = createLatencyTracker(decision.question);
    if (u.lastVoiceAt != null) latency.mark("audioEnd", u.lastVoiceAt);
    if (u.transcribedAt != null) latency.mark("transcriptionFinal", u.transcribedAt);
    latency.mark("questionDetected", u.finalizedAt);

    void answerHeardRef.current(decision.question, {
      utteranceId: u.id,
      questionWho: u.who === "System" ? "Interviewer" : u.who,
      source: "auto",
      latency,
      uncertain: u.uncertain,
    });
  };

  function rollingLinesFallback(utterance: { who: string; text: string }) {
    return [
      ...transcriptRef.current.slice(-4).map((t) => `${t.who}: ${t.text}`),
      `${utterance.who}: ${utterance.text}`,
    ];
  }

  /**
   * Shared answer path used by Auto-answer AND the manual Answer button.
   * Streams via Groq (Gemini fallback on server) and renders in the companion.
   */
  async function answerHeardQuestion(questionText: string, opts?: AnswerOptions) {
    const q = cleanQuestionText(questionText);
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
    answerAbortRef.current?.abort();
    answerAbortRef.current = null;
    const isStale = () => !sequencer.isCurrent(ticket.id);
    const metricId = opts?.utteranceId || `manual-${ticket.id}`;

    bumpActivity();
    rememberQuestion(q);
    streamingRef.current = true;
    setStreaming(true);
    setAnswer("");
    setKbMeta(null);
    setStatusMsg(null);
    aiBusyRef.current = true;
    const source = answerSourceRef.current;

    const latency = opts?.latency || createLatencyTracker(q);
    latency.mark("aiRequest");
    metrics.mark(metricId, "llmRequest");
    const history = selectHistory(q, exchangesRef.current);
    pipelineLog("ai", "Request started", {
      source: opts?.source || "unknown",
      utterance: opts?.utteranceId,
      chars: q.length,
      history: history.length,
      uncertain: Boolean(opts?.uncertain),
    });

    let streamed = "";
    try {
      let answerText = "";
      try {
        const result = await requestLiveAnswerStream(q, getRollingContext(6), {
          signal: ticket.signal,
          history,
          uncertain: opts?.uncertain,
          source,
          onToken: (_token, full) => {
            if (source === "knowledge_base") return;
            if (isStale()) return;
            streamed = full;
            if (!latency.marks.firstToken) {
              latency.mark("firstToken");
              metrics.mark(metricId, "firstToken");
            }
            if (!latency.marks.answerVisible) {
              if (!isFirstMeaningfulAnswer(full)) return;
              latency.mark("answerVisible");
            }
            setAnswer(full);
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
          { transcript: rollingLinesFallback({ who: opts?.questionWho || "Interviewer", text: q }) },
          { fallback: false },
        );
        answerText = result.answer;
      }
      if (isStale()) return;
      setAnswer(answerText);
      latency.mark("answerVisible");
      metrics.mark(metricId, "answerComplete");
      metrics.count("answered");
      latency.report(opts?.source === "manual" ? "manual_answer" : "auto_answer");
      pipelineLog("perf", "Utterance latency", { utterance: metricId, ...metrics.summarize(metricId) });
      appendTranscript({ who: "CueAI", text: answerText });
      exchangesRef.current.push({ question: q, answer: answerText });
      if (exchangesRef.current.length > 40) exchangesRef.current.shift();
    } catch (err) {
      if (isStale()) return;
      metrics.count("answerFailed");
      if (persistRef.current) {
        persistFailedQuestion({
          prompt: q,
          questionWho: opts?.questionWho || "Interviewer",
          meetingId: meetingIdRef.current,
        });
      }
      setStatusMsg(err instanceof Error ? err.message : "Unable to generate an answer.");
    } finally {
      if (!isStale()) {
        sequencer.finish(ticket.id);
        streamingRef.current = false;
        setStreaming(false);
        aiBusyRef.current = false;
      }
    }
  }
  answerHeardRef.current = answerHeardQuestion;

  async function onAsk(e: FormEvent) {
    e.preventDefault();
    const prompt = ask.trim();
    if (!prompt) return;
    setAsk("");
    await answerHeardQuestion(prompt, { source: "manual", questionWho: "You" });
  }

  async function generateAnswer() {
    const typed = ask.trim();
    if (typed) {
      setAsk("");
      await answerHeardQuestion(typed, { source: "manual", questionWho: "You" });
      return;
    }
    const last = lastCompleteRef.current.trim() || lastHeard?.text?.trim();
    if (!last) {
      askRef.current?.focus();
      return;
    }
    // Same function as Auto-answer — re-trigger / retry for the last heard question.
    console.log("[AUTO-ANSWER] Manual Answer button → same answer function");
    await answerHeardQuestion(last, {
      source: "manual",
      questionWho: lastHeard?.who === "System" ? "Interviewer" : lastHeard?.who || "Interviewer",
    });
  }
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const active = await syncListenSources({
          mic: listen.mic,
          systemAudio: listen.systemAudio,
          getDesktopSourceId,
        });
        if (cancelled) return;
        // UI must reflect real capture — never leave Mic/System "on" after failure.
        if (active.mic !== listen.mic || active.systemAudio !== listen.systemAudio) {
          setListen(active);
          await window.cueai?.setListenSources(active);
        }
      } catch {
        // Per-source failures surface through the audio session subscription.
        if (cancelled) return;
        const active = getListenActive();
        setListen(active);
        await window.cueai?.setListenSources(active);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listen.mic, listen.systemAudio, setListen]);

  useEffect(() => {
    let prev: { mic: AudioSessionState; system: AudioSessionState } = {
      mic: "idle",
      system: "idle",
    };
    return subscribeListenLevels((s) => {
      if (s.mic === prev.mic && s.system === prev.system) return;
      if (s.mic === "error" && prev.mic !== "error") {
        setAudioErrors((e) => ({ ...e, mic: s.error || "Microphone capture failed." }));
      }
      if (s.system === "error" && prev.system !== "error") {
        setAudioErrors((e) => ({ ...e, systemAudio: s.error || "System audio capture failed." }));
      }
      if (isCapturing(s.mic)) setAudioErrors((e) => (e.mic ? { ...e, mic: null } : e));
      if (isCapturing(s.system)) {
        setAudioErrors((e) => (e.systemAudio ? { ...e, systemAudio: null } : e));
      }
      prev = { mic: s.mic, system: s.system };
      setAudio(prev);
    });
  }, []);

  // A source that dies mid-session (device unplugged, share ended) must not stay flagged on.
  useEffect(() => {
    const current = useCompanionStore.getState().listen;
    const next = {
      mic: current.mic && audio.mic !== "error",
      systemAudio: current.systemAudio && audio.system !== "error",
    };
    if (next.mic === current.mic && next.systemAudio === current.systemAudio) return;
    setListen(next);
    void window.cueai?.setListenSources(next);
  }, [audio.mic, audio.system, setListen]);

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
      prefetchSessionContext();
      const current = useCompanionStore.getState().listen;
      if (current.mic && current.systemAudio) return;
      const next = { mic: true, systemAudio: true };
      pipelineLog("audio", "Live session started — starting microphone and system audio");
      setListen(next);
      void window.cueai?.setListenSources(next);
    } else if (!liveListening && was && cueAiOnRef.current) {
      pipelineLog("audio", "Left live mode — releasing capture");
      void releaseAudio();
    }
  }, [liveListening, setListen]);

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
    void window.cueai?.fitHeight?.(menuOpen ? 260 : audioProblem ? 110 : 76);
  }, [menuOpen, boardOpen, expanded, audioProblem]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      setNarrow(entry.contentRect.width < 650);
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
    clearQuestionMemory();
    resetTranscriptionContext();
    pipeline.assembler.reset();
    pipeline.gate.reset();
    pipeline.sequencer.reset();
    pipeline.metrics.reset();
    exchangesRef.current = [];
    prefetchSessionContext(true);
    lastCompleteRef.current = "";
    answerAbortRef.current?.abort();
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

  async function analyzeScreen() {
    bumpActivity();
    if (shotBusy) return;
    setShotBusy(true);
    setStatusMsg(null);
    rememberQuestion("What's on screen?");
    setStreaming(true);
    setAnswer("");
    setKbMeta(null);
    pipelineLog("overlay", "[SCREEN] Capture requested");
    pipeline.sequencer.cancel();
    streamingRef.current = false;
    answerAbortRef.current?.abort();
    const abort = new AbortController();
    answerAbortRef.current = abort;
    const captureStarted = performance.now();

    try {
      const result = (await window.cueai?.captureScreenshot({
        save: false,
      })) as ScreenshotResult | undefined;
      if (abort.signal.aborted) return;
      if (!result?.ok || !result.dataUrl) {
        setStatusMsg(result?.error || "Screen capture failed. Please try again.");
        setStreaming(false);
        pipelineLog("overlay", "[SCREEN] Capture failed");
        return;
      }
      console.log("[SCREEN-PERF] capture_ms", Math.round(performance.now() - captureStarted));
      pipelineLog("overlay", "[SCREEN-AI] Request started", {
        chars: result.dataUrl.length,
      });

      const recent = getRollingContext(3)
        .map((t) => `${t.who}: ${t.text}`)
        .join("\n");

      const vision = await requestScreenContext({
        imageDataUrl: result.dataUrl,
        recentContext: recent,
        signal: abort.signal,
      });
      if (abort.signal.aborted) return;
      setAnswer(vision.answer);
      setStatusMsg(null);
      appendTranscript({ who: "CueAI", text: vision.answer });
      console.log(
        "[SCREEN-PERF] total_ms",
        Math.round(performance.now() - captureStarted),
        vision.provider,
      );
      pipelineLog("overlay", "[SCREEN-AI] Answer rendered");
    } catch (err) {
      if (abort.signal.aborted) return;
      setStatusMsg(
        err instanceof Error ? err.message : "Unable to analyze the screen. Please try again.",
      );
      pipelineLog("overlay", "[SCREEN-AI] Failed");
    } finally {
      if (!abort.signal.aborted) setStreaming(false);
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
    answerAbortRef.current?.abort();
    answerAbortRef.current = null;
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
    } catch {
      setStatusMsg("Could not end the session. Try again.");
    } finally {
      setEnding(false);
    }
  }

  async function releaseAudio() {
    await stopAllListen();
    setAudioErrors({ mic: null, systemAudio: null });
    const off = { mic: false, systemAudio: false };
    setListen(off);
    await window.cueai?.setListenSources(off);
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
    const state = kind === "mic" ? audio.mic : audio.system;
    if (isStarting(state)) return;
    setAudioErrors((e) => ({ ...e, [kind]: null }));
    const save = async (on: boolean) => {
      const next = { ...useCompanionStore.getState().listen, [kind]: on };
      setListen(next);
      await window.cueai?.setListenSources(next);
    };
    if (isCapturing(state)) {
      await (kind === "mic" ? stopMicListen() : stopSystemAudioListen());
      await save(false);
      return;
    }
    // Flag first so the listen-sync effect joins this start instead of cancelling it.
    await save(true);
    try {
      await (kind === "mic" ? startMicListen() : startSystemAudioListen(getDesktopSourceId));
    } catch (err) {
      const fallback = kind === "mic" ? "Microphone capture failed." : "System audio capture failed.";
      setAudioErrors((e) => ({ ...e, [kind]: err instanceof Error ? err.message : fallback }));
    }
    if (!getListenActive()[kind]) await save(false);
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
            placeholder={
              answerSource === "knowledge_base"
                ? narrow
                  ? "Ask KB…"
                  : "Ask your Knowledge Base"
                : narrow
                  ? "Ask…"
                  : "Ask a question"
            }
            aria-label={answerSource === "knowledge_base" ? "Ask your Knowledge Base" : "Ask a question"}
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
          className={cn("ov-btn no-drag", answerSource === "knowledge_base" && "is-on is-kb")}
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
          <span className="ov-btn-label">{answerSource === "knowledge_base" ? "KB" : "General"}</span>
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
        <button
          type="button"
          className={cn(
            "ov-btn ov-src no-drag",
            micOn && "is-on is-live",
            micStarting && "is-pending",
            audioErrors.mic && "is-error",
          )}
          onClick={() => void toggleListen("mic")}
          aria-label={micOn ? "Mic on" : "Mic off"}
          aria-pressed={micOn}
          aria-busy={micStarting}
          title={
            audioErrors.mic ||
            (micStarting ? "Starting microphone…" : micOn ? "Mic on — click to stop" : "Mic off — click to start")
          }
        >
          {micOn || micStarting ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
          <span className="ov-btn-label">Mic</span>
          <span className="ov-src-dot" aria-hidden />
        </button>
        <button
          type="button"
          className={cn(
            "ov-btn ov-src no-drag",
            systemOn && "is-on is-live",
            systemStarting && "is-pending",
            audioErrors.systemAudio && "is-error",
          )}
          onClick={() => void toggleListen("systemAudio")}
          aria-label={systemOn ? "System Audio on" : "System Audio off"}
          aria-pressed={systemOn}
          aria-busy={systemStarting}
          title={
            audioErrors.systemAudio ||
            (systemStarting
              ? "Starting system audio…"
              : systemOn
                ? "System Audio on — click to stop"
                : "System Audio off — click to start")
          }
        >
          {systemOn || systemStarting ? (
            <Volume2 className="h-3.5 w-3.5" />
          ) : (
            <VolumeX className="h-3.5 w-3.5" />
          )}
          <span className="ov-btn-label">System Audio</span>
          <span className="ov-src-dot" aria-hidden />
        </button>
        <span className="ov-timer">{formatElapsed(elapsedMs)}</span>
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
              <button type="button" role="menuitem" onClick={() => { setPinned(!pinned); setMenuOpen(false); }}>
                Pin {pinned ? "on" : "off"}
              </button>
              <label>
                <input type="checkbox" checked={autoAnswer} onChange={(e) => setAutoAnswer(e.target.checked)} />
                Auto-answer
              </label>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={privacyOn}
                title={
                  !privacyOn
                    ? "Privacy off — visible on screen share"
                    : privacyConfirmed
                      ? "Privacy on — hidden from screen share"
                      : `Privacy on, but not confirmed by Windows: ${capture?.message || "status unknown"}`
                }
                onClick={() => { void togglePrivacy(); setMenuOpen(false); }}
              >
                {privacyOn ? <Shield className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}
                Privacy {!privacyOn ? "off" : privacyConfirmed ? "on" : "on (unconfirmed)"}
              </button>
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

      {!boardOpen && audioProblem && (
        <div className="ov-hint no-drag" role="alert">
          <p title={audioProblem}>{audioProblem}</p>
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
          {audioProblem && <p className="ov-error">{audioProblem}</p>}
          {streaming ? (
            <p className="ov-muted">Thinking…</p>
          ) : (
            <div className="ov-answer">
              <AnswerContent answer={answer || "Waiting for a question."} />
              {kbMeta && <KnowledgeBaseFooter meta={kbMeta} />}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
