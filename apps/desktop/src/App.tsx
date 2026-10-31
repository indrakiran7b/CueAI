import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, Copy, MoreHorizontal, Sparkles, X } from "lucide-react";
import { cn } from "./lib/utils";
import { useCompanionStore } from "./store/companion-store";
import { AIService } from "./services";
import {
  configureAnswerApi,
  LiveAnswerUnavailable,
  probeLiveAnswerHealth,
  requestLiveAnswerStream,
} from "./services/live-answer";
import {
  configureLiveTranscription,
  getListenActive,
  resetLivePipeline,
  stopAllListen,
  syncListenSources,
} from "./services/audio-listen";
import {
  clearQuestionMemory,
  evaluateQuestion,
  getRecentExchanges,
  getRollingContext,
  pushRollingTranscript,
  cleanQuestionText,
  rememberExchange,
} from "./services/question-detection";
import { isFirstMeaningfulAnswer } from "./services/speech-capture";
import { pipelineLog, prewarmAnswerApi } from "./services/pipeline-log";
import {
  AutoAnswerController,
  type AnswerSnapshot,
  type GenerateRequest,
} from "./services/auto-answer-controller";
import {
  debugLog,
  finishTimeline,
  markTimeline,
  pipelineCounters,
  startTimeline,
  timelineFor,
} from "./services/utterance-timeline";
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
import { OverlayMenu } from "./components/OverlayMenu";
import { AnswerContent } from "./components/AnswerContent";
import { ResizeHandles } from "./components/ResizeHandles";
import { TransparencyControl } from "./components/TransparencyControl";
import { useOverlayTransparency } from "./lib/use-overlay-transparency";
import { pickManualQuestion } from "./lib/manual-question";

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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
  const transparency = useOverlayTransparency();
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [apiHealthError, setApiHealthError] = useState<string | null>(null);
  const [webApiBase, setWebApiBase] = useState("http://127.0.0.1:3000");
  const [expanded, setExpanded] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [shotBusy, setShotBusy] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [captureNotice, setCaptureNotice] = useState<string | null>(null);
  const startedAtRef = useRef(Date.now());
  const autoAnswerRef = useRef(autoAnswer);
  autoAnswerRef.current = autoAnswer;
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;
  const meetingIdRef = useRef(session?.meetingId);
  meetingIdRef.current = session?.meetingId;
  const answerAbortRef = useRef<AbortController | null>(null);
  const askRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const meetingKeyRef = useRef<string | null>(null);
  const lastCompleteRef = useRef("");
  const lastSyncedAnswerRef = useRef("");
  const sessionActiveRef = useRef(false);
  const generateRef = useRef<(req: GenerateRequest) => Promise<{ answer: string }>>(async () => ({
    answer: "",
  }));
  const controllerRef = useRef<AutoAnswerController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new AutoAnswerController({
      generate: (req) => generateRef.current(req),
      onChange: (snap) => syncAnswerSnapshot(snap),
      onEvent: (e) => {
        if (e.type === "requested") {
          pipelineCounters.triggered += 1;
          markTimeline(e.utteranceId, "llmRequest", e.at);
          debugLog("answer requested", { utterance: e.utteranceId, merged: e.merged });
        } else if (e.type === "rejected") {
          if (e.reason.startsWith("duplicate")) pipelineCounters.duplicates += 1;
          finishTimeline(e.utteranceId, "skipped", { reason: e.reason });
          debugLog("answer not triggered", { utterance: e.utteranceId, reason: e.reason });
        }
      },
    });
  }
  const controller = controllerRef.current;

  const privacyOn = capture?.requested !== false;
  const lastHeard = [...transcript].reverse().find((t) => t.who !== "CueAI");
  const hasAnswer = Boolean(answer.trim());
  const boardOpen =
    streaming || hasAnswer || Boolean(question.trim()) || Boolean(pendingQuestion?.trim());

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
      controllerRef.current?.cancel();
      rememberQuestion(payload.question?.trim() || "Screen context");
      setAnswer(payload.answer.trim());
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
    let cancelled = false;
    let timer: number | null = null;
    const tick = async () => {
      const health = await probeLiveAnswerHealth();
      if (cancelled) return;
      if (health.liveAnswer === "ready") {
        setApiHealthError(null);
        timer = window.setTimeout(tick, 20_000);
        return;
      }
      setApiHealthError(
        health.error || "CueAI live answers are unavailable. Start the web app and retry.",
      );
      timer = window.setTimeout(tick, 4_000);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [webApiBase]);

  useEffect(() => {
    const id = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    configureLiveTranscription({
      apiBase: webApiBase,
      onResult: (line) => {
        if (line.partial) return;
        appendTranscript({ who: line.who, text: line.text });
        pushRollingTranscript(line.who, line.text);
        setStatusMsg(null);
        persistTranscriptLine({
          who: line.who,
          text: line.text,
          source: line.who === "You" ? "microphone" : line.who === "System" ? "system" : undefined,
          meetingId: meetingIdRef.current,
        });
      },
      onPending: (who, text) => {
        // Only the interviewer's in-progress question drives the overlay preview.
        if (who !== "System") return;
        setPendingQuestion(text);
        controllerRef.current?.pending(text);
      },
      onDrop: (who, _text, reason) => {
        if (reason.startsWith("incomplete")) pipelineCounters.droppedIncomplete += 1;
        debugLog("turn not answered", { who, reason });
      },
      onSegmentTiming: (t) => {
        pipelineCounters.transcribeRequests += t.attempts;
        if (t.attempts > 1) pipelineCounters.transcribeRetries += t.attempts - 1;
        if (!t.ok) pipelineCounters.transcribeErrors += 1;
      },
      onDebug: (d) => debugLog("turn", d as Record<string, unknown>),
      onCaptureNotice: (msg) => setCaptureNotice(msg),
      onUtterance: (u) => {
        startTimeline(u);
        const assembled = cleanQuestionText(u.text);
        lastCompleteRef.current = assembled;

        // Never auto-answer the candidate's own microphone.
        if (u.lane === "You") {
          finishTimeline(u.id, "skipped", { reason: "own_microphone" });
          return;
        }
        if (!autoAnswerRef.current) {
          finishTimeline(u.id, "skipped", { reason: "auto_answer_off" });
          setQuestion(assembled);
          return;
        }
        // Only a genuine question or request is answered; other interviewer speech is context.
        const decision = evaluateQuestion(u.text, {
          who: u.lane,
          allowSelfQuestions: true,
          finalized: true,
          turnFinalized: true,
        });
        if (!decision.accept) {
          if (decision.reason === "duplicate") pipelineCounters.duplicates += 1;
          pipelineCounters.skipped += 1;
          finishTimeline(u.id, "skipped", { reason: decision.reason });
          debugLog("answer not triggered", { utterance: u.id, reason: decision.reason });
          return;
        }
        controllerRef.current?.submit({
          utteranceId: u.id,
          text: cleanQuestionText(decision.question),
          finalizedAt: u.finalizedAt,
          source: "auto",
        });
      },
      onError: (msg) => setStatusMsg(msg),
    });
    return () => {
      configureLiveTranscription(null);
    };
  }, [appendTranscript, webApiBase]);

  function syncAnswerSnapshot(snap: AnswerSnapshot) {
    const generating = snap.state === "generating";
    setStreaming(generating);
    if (snap.question) setQuestion(snap.question);
    if (snap.answer !== lastSyncedAnswerRef.current) {
      lastSyncedAnswerRef.current = snap.answer;
      // A new request owns a new answer. Clear the previous answer immediately,
      // then avoid flashing single-character fragments from the new stream.
      if (generating && !snap.answer) {
        setAnswer("");
      } else if (!generating || isFirstMeaningfulAnswer(snap.answer)) {
        setAnswer(snap.answer);
        if (snap.answer && generating) markTimeline(snap.utteranceId, "firstRender");
      }
    }
    if (snap.state === "error_recovery" && snap.error) setStatusMsg(snap.error);
    if (generating) setStatusMsg(null);
  }

  /** The single answer path for auto-answer, typed questions and the Answer button. */
  generateRef.current = async ({ utteranceId, question: q, signal, onToken }: GenerateRequest) => {
    bumpActivity();
    const record = timelineFor(utteranceId);
    pipelineLog("ai", "Request started", { utterance: utteranceId, chars: q.length });
    try {
      const result = await requestLiveAnswerStream(q, getRollingContext(4), {
        signal,
        history: getRecentExchanges(),
        onMeta: (meta) => {
          if (record && typeof meta.contextMs === "number") record.contextMs = meta.contextMs;
        },
        onToken: (_token, full) => {
          markTimeline(utteranceId, "firstToken");
          onToken(full);
        },
      });
      if (signal.aborted) throw new DOMException("superseded", "AbortError");
      markTimeline(utteranceId, "complete");
      finishTimeline(utteranceId, "answered", { provider: result.provider || result.model });
      rememberExchange(q, result.answer);
      appendTranscript({ who: "CueAI", text: result.answer });
      return { answer: result.answer };
    } catch (err) {
      if (signal.aborted) {
        finishTimeline(utteranceId, "superseded");
        throw err;
      }
      // The server already ran its whole provider chain; a second call would duplicate it.
      if (err instanceof LiveAnswerUnavailable && err.serverReported) {
        persistFailedQuestion({ prompt: q, questionWho: "Interviewer", meetingId: meetingIdRef.current });
        finishTimeline(utteranceId, "failed", { reason: "provider_chain_failed" });
        throw err;
      }
      try {
        const result = await AIService.ask(
          q,
          { transcript: getRollingContext(4).map((t) => `${t.who}: ${t.text}`) },
          { fallback: false },
        );
        if (signal.aborted) throw new DOMException("superseded", "AbortError");
        onToken(result.answer);
        markTimeline(utteranceId, "complete");
        finishTimeline(utteranceId, "answered", { provider: "non_stream" });
        rememberExchange(q, result.answer);
        appendTranscript({ who: "CueAI", text: result.answer });
        return { answer: result.answer };
      } catch (inner) {
        if (signal.aborted) {
          finishTimeline(utteranceId, "superseded");
          throw inner;
        }
        persistFailedQuestion({ prompt: q, questionWho: "Interviewer", meetingId: meetingIdRef.current });
        finishTimeline(utteranceId, "failed", { reason: "stream_and_fallback_failed" });
        throw inner instanceof Error ? inner : err;
      }
    }
  };

  /** Manual entry points (typed question, Answer button) share the controller. */
  function answerHeardQuestion(questionText: string, source: "manual" | "auto" = "manual") {
    const q = cleanQuestionText(questionText);
    if (!q) return;
    controller.submit({
      utteranceId: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: q,
      finalizedAt: performance.now(),
      source,
    });
  }

  async function onAsk(e: FormEvent) {
    e.preventDefault();
    const prompt = ask.trim();
    if (!prompt) return;
    setAsk("");
    answerHeardQuestion(prompt);
  }

  function generateAnswer() {
    const q = pickManualQuestion(ask, lastCompleteRef.current || lastHeard?.text);
    if (!q) {
      askRef.current?.focus();
      return;
    }
    if (q === ask.trim()) setAsk("");
    answerHeardQuestion(q);
  }

  useEffect(() => {
    controller.setListening(listen.mic || listen.systemAudio);
  }, [controller, listen.mic, listen.systemAudio]);

  useEffect(() => {
    const wasActive = sessionActiveRef.current;
    sessionActiveRef.current = Boolean(session.active);
    if (!session.active || wasActive) return;
    // A live session just started: capture the interviewer right away instead of
    // waiting for someone to find the System toggle.
    void window.cueai?.getListenSources().then(async (current) => {
      if (current && (current.mic || current.systemAudio)) return;
      const saved = await window.cueai?.setListenSources({ systemAudio: true });
      if (saved) setListen(saved);
      pipelineLog("audio", "Live session started — system audio listening enabled");
    });
  }, [session.active, setListen]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const active = await syncListenSources({
          mic: listen.mic,
          systemAudio: listen.systemAudio,
          getDesktopSourceId: async () =>
            (await window.cueai?.getDesktopAudioSourceId()) ?? null,
        });
        if (cancelled) return;
        // UI must reflect real capture — never leave Mic/System "on" after failure.
        if (active.mic !== listen.mic || active.systemAudio !== listen.systemAudio) {
          setListen(active);
          await window.cueai?.setListenSources(active);
        }
      } catch (err) {
        if (cancelled) return;
        const active = getListenActive();
        setListen(active);
        await window.cueai?.setListenSources(active);
        setStatusMsg(err instanceof Error ? err.message : "Listen failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listen.mic, listen.systemAudio, setListen]);

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
    void window.cueai?.fitHeight?.(menuOpen ? 300 : 104);
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
    clearQuestionMemory();
    resetLivePipeline();
    controllerRef.current?.reset();
    lastSyncedAnswerRef.current = "";
    setPendingQuestion(null);
    setCaptureNotice(null);
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
    controller.cancel();
    rememberQuestion("What's on screen?");
    setStreaming(true);
    setAnswer("");
    pipelineLog("overlay", "[SCREEN] Capture requested");
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
    setMenuOpen(false);
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "ov-root",
        boardOpen && "is-open",
        menuOpen && "is-menu",
        narrow && "is-narrow",
        transparency.value > 0 && "is-see-through",
      )}
      style={transparency.style}
      onMouseMove={bumpActivity}
      onFocus={bumpActivity}
    >
      {boardOpen && <ResizeHandles />}

      <div className="ov-bar header-drag">
        <div className="ov-bar-row">
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
              <OverlayMenu
                listen={listen}
                pinned={pinned}
                autoAnswer={autoAnswer}
                privacyOn={privacyOn}
                ending={ending}
                onToggleMic={() => void toggleListen("mic")}
                onToggleSystemAudio={() => void toggleListen("systemAudio")}
                onTogglePin={() => { setPinned(!pinned); setMenuOpen(false); }}
                onAutoAnswerChange={setAutoAnswer}
                onTogglePrivacy={() => { void togglePrivacy(); setMenuOpen(false); }}
                onEndSession={() => void onEndSession()}
              />
            )}
          </div>
          <button type="button" className="ov-icon no-drag" aria-label="Hide" onClick={() => void window.cueai?.hide()}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <TransparencyControl
          value={transparency.value}
          error={transparency.error}
          onChange={(v) => {
            bumpActivity();
            transparency.change(v);
          }}
        />
      </div>

      {boardOpen && (
        <section className="ov-card no-drag">
          <header>
            <p>
              {pendingQuestion && !streaming ? (
                <>
                  <span className="ov-muted">Hearing: </span>
                  {pendingQuestion}
                </>
              ) : (
                question || lastHeard?.text || "Working…"
              )}
            </p>
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
          {apiHealthError && !streaming && !statusMsg && (
            <p className="ov-error">{apiHealthError}</p>
          )}
          {statusMsg && <p className="ov-error">{statusMsg}</p>}
          {captureNotice && !statusMsg && <p className="ov-muted">{captureNotice}</p>}
          {pendingQuestion && !streaming ? (
            <p className="ov-muted">Listening for the complete question…</p>
          ) : streaming && !hasAnswer ? (
            <p className="ov-muted">Thinking…</p>
          ) : (
            <AnswerContent answer={answer || "Waiting for a question."} />
          )}
        </section>
      )}
    </div>
  );
}
