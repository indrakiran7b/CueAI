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
  getListenActive,
  stopAllListen,
  syncListenSources,
} from "./services/audio-listen";
import {
  clearQuestionMemory,
  assembleUtterance,
  beginQuestionProcessing,
  endQuestionProcessing,
  evaluateQuestion,
  getRollingContext,
  pushRollingTranscript,
} from "./services/question-detection";
import { createLatencyTracker, pipelineLog, prewarmAnswerApi } from "./services/pipeline-log";
import { requestLiveAnswerStream } from "./services/live-answer";
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
  const streamingRef = useRef(false);
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
  const answerHeardRef = useRef<
    (
      questionText: string,
      opts?: {
        questionId?: string;
        questionWho?: string;
        source?: "auto" | "manual" | "screen";
        latency?: ReturnType<typeof createLatencyTracker>;
      },
    ) => Promise<void>
  >(async () => undefined);

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
    const offPush = window.cueai?.onPushAnswer?.((payload) => {
      if (!payload?.answer?.trim()) return;
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
    const id = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    configureLiveTranscription({
      apiBase: webApiBase,
      onResult: (line) => {
        appendTranscript(line);
        pushRollingTranscript(line.who, line.text);
        setStatusMsg(null);
        if (line.partial && line.who === "System") {
          console.log("[SYSTEM-AUDIO] Partial transcript:", line.text);
        }
        pipelineLog(
          "transcription",
          line.partial ? "Partial transcript" : "Final transcript fragment",
          { who: line.who, chars: line.text.length },
        );

        // Persist finalized speech only (not partials).
        if (!line.partial && line.text.trim()) {
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

        // System Audio alone drives auto-answer — Mic is not required.
        // Never auto-answer the candidate's own mic ("You").
        if (line.who === "You") return;

        assembleUtterance(
          line.who,
          line.text,
          (utterance) => {
            console.log(
              "[SYSTEM-AUDIO] FINAL TRANSCRIPT:\n" + JSON.stringify(utterance.text),
            );
            console.log("[AUTO-ANSWER] Final system question received");
            console.log(
              "[AUTO-ANSWER] Auto-answer enabled:",
              autoAnswerRef.current,
            );
            console.log("[AUTO-ANSWER] Current setting:", autoAnswerRef.current);

            if (!autoAnswerRef.current) {
              pipelineLog("question", "Auto-answer off — transcript only");
              return;
            }

            const decision = evaluateQuestion(utterance.text, {
              who: utterance.who,
              allowSelfQuestions: true,
              finalized: true,
              forceSystem: utterance.who === "System",
            });

            if (!decision.accept) {
              pipelineLog("question", "Skipped segment", { reason: decision.reason });
              console.log("[AUTO-ANSWER] Skipped", decision.reason);
              return;
            }

            const questionText = decision.question;
            const qid = decision.questionId || questionText;
            if (!beginQuestionProcessing(qid)) {
              pipelineLog("question", "Duplicate in-flight — skipped", { id: qid });
              console.log("[AUTO-ANSWER] Duplicate skipped", qid);
              return;
            }

            console.log("[AUTO-ANSWER] Question ID:", qid);
            console.log("[AUTO-ANSWER] Triggering existing answer function");
            pipelineLog("question", "Complete question detected", {
              who: utterance.who,
              chars: questionText.length,
            });

            const latency = createLatencyTracker(questionText);
            if (utterance.audioEndAt != null) latency.mark("audioEnd", utterance.audioEndAt);
            else if (line.audioEndAt != null) latency.mark("audioEnd", line.audioEndAt);
            if (utterance.transcribedAt != null) {
              latency.mark("transcriptionFinal", utterance.transcribedAt);
            } else if (line.transcribedAt != null) {
              latency.mark("transcriptionFinal", line.transcribedAt);
            }
            latency.mark("questionDetected");

            // Pass the FINAL QUESTION TEXT directly — never rely on React state.
            void answerHeardRef
              .current(questionText, {
                questionId: qid,
                questionWho:
                  utterance.who === "System" ? "Interviewer" : utterance.who,
                source: "auto",
                latency,
              })
              .finally(() => endQuestionProcessing(qid));
          },
          {
            audioEndAt: line.audioEndAt,
            transcribedAt: line.transcribedAt,
            partial: line.partial,
          },
        );
      },
      onError: (msg) => setStatusMsg(msg),
    });
    return () => {
      configureLiveTranscription(null);
      answerAbortRef.current?.abort();
    };
  }, [appendTranscript, webApiBase]);

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
  async function answerHeardQuestion(
    questionText: string,
    opts?: {
      questionId?: string;
      questionWho?: string;
      source?: "auto" | "manual" | "screen";
      latency?: ReturnType<typeof createLatencyTracker>;
    },
  ) {
    const q = questionText.trim();
    if (!q) return;

    // Abort any in-flight stream so follow-ups / auto-answer are never
    // silently dropped by a stale `streaming` React state guard.
    answerAbortRef.current?.abort();
    const abort = new AbortController();
    answerAbortRef.current = abort;

    bumpActivity();
    rememberQuestion(q);
    streamingRef.current = true;
    setStreaming(true);
    setAnswer("");
    setStatusMsg(null);
    aiBusyRef.current = true;

    const latency = opts?.latency || createLatencyTracker(q);
    latency.mark("aiRequest");
    console.log("[GROQ] Request started");
    pipelineLog("ai", "Request started", {
      source: opts?.source || "unknown",
      chars: q.length,
      questionId: opts?.questionId,
    });

    try {
      const rolling = getRollingContext(3);
      const result = await requestLiveAnswerStream(q, rolling, {
        signal: abort.signal,
        onToken: (_token, full) => {
          setAnswer(full);
          if (!latency.marks.firstToken) {
            latency.mark("firstToken");
            latency.mark("answerVisible");
            console.log("[GROQ] First token received");
            pipelineLog("response", "First token received");
          }
        },
      });
      if (abort.signal.aborted) return;
      setAnswer(result.answer);
      latency.mark("answerVisible");
      latency.report(opts?.source === "manual" ? "manual_answer" : "auto_answer");
      appendTranscript({ who: "CueAI", text: result.answer });
      console.log("[ANSWER] Answer rendered");
      pipelineLog("overlay", "Answer rendered");
      console.log("[MEETING] Question saved");
      console.log("[MEETING] Answer saved");
    } catch (err) {
      if (abort.signal.aborted) return;
      try {
        const result = await AIService.ask(q, {
          transcript: rollingLinesFallback({
            who: opts?.questionWho || "Interviewer",
            text: q,
          }),
        }, { fallback: false });
        if (abort.signal.aborted) return;
        setAnswer(result.answer);
        appendTranscript({ who: "CueAI", text: result.answer });
        console.log("[ANSWER] Answer rendered");
        pipelineLog("fallback", "Used non-stream AIService path");
        console.log("[MEETING] Question saved");
        console.log("[MEETING] Answer saved");
      } catch (inner) {
        persistFailedQuestion({
          prompt: q,
          questionWho: opts?.questionWho || "Interviewer",
          meetingId: meetingIdRef.current,
        });
        setStatusMsg(
          inner instanceof Error
            ? inner.message
            : err instanceof Error
              ? err.message
              : "Unable to generate an answer.",
        );
      }
    } finally {
      if (!abort.signal.aborted) {
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
    const last = lastHeard?.text?.trim();
    if (!last) {
      await answerHeardQuestion(
        "Give me a ready-to-say self-introduction from my resume and the job briefing.",
        { source: "manual", questionWho: "You" },
      );
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
    clearQuestionMemory();
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
