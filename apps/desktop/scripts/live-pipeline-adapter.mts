/**
 * Benchmark adapter for the current overlay pipeline: the same LivePipeline,
 * question gate and AutoAnswerController wiring as App.tsx, with real
 * transcription (/api/transcribe) and real answers (/api/live/answer).
 */
import type { PipelineAdapter, PipelineEvents } from "./live-pipeline-e2e.mts";
import { LivePipeline } from "../src/services/live-pipeline";
import { AutoAnswerController } from "../src/services/auto-answer-controller";
import { transcribeAudioBlob } from "../src/services/audio-listen";
import { configureAnswerApi, requestLiveAnswerStream } from "../src/services/live-answer";
import {
  cleanQuestionText,
  clearQuestionMemory,
  evaluateQuestion,
  getRecentExchanges,
  getRollingContext,
  pushRollingTranscript,
  rememberExchange,
} from "../src/services/question-detection";

export function createAdapter(opts: { base: string; sampleRate: number }): PipelineAdapter {
  let ev: PipelineEvents;
  let answering = 0;
  let lastNow = 0;

  const controller = new AutoAnswerController({
    generate: async ({ question, signal, onToken }) => {
      answering++;
      try {
        const result = await requestLiveAnswerStream(question, getRollingContext(4), {
          signal,
          history: getRecentExchanges(),
          onToken: (_token, full) => onToken(full),
        });
        if (!signal.aborted) rememberExchange(question, result.answer);
        return { answer: result.answer };
      } finally {
        answering--;
      }
    },
    onEvent: (e) => {
      const at = performance.now();
      if (e.type === "requested") ev.answerRequested({ id: e.id, question: e.question, at });
      else if (e.type === "first_token") ev.firstToken({ id: e.id, at });
      else if (e.type === "complete") ev.answerComplete({ id: e.id, answer: e.answer, at });
      else if (e.type === "superseded") ev.answerAborted({ id: e.id, at });
      else if (e.type === "failed") ev.answerFailed({ id: e.id, error: e.error, at });
      else if (e.type === "rejected") ev.skipped({ text: e.utteranceId, reason: e.reason, at });
    },
  });

  const pipeline = new LivePipeline({
    transcribe: async (job, signal) => {
      const res = await transcribeAudioBlob(job.wav, job.lane, opts.base, { prompt: job.prompt, signal });
      return { text: res?.text || "", uncertain: res?.uncertain };
    },
    onTranscript: (line) => {
      ev.transcript({ who: line.who, text: line.text, partial: line.partial, at: performance.now() });
      if (!line.partial) pushRollingTranscript(line.who, line.text);
    },
    onSegmentTiming: (t) => ev.transcribeTiming({ ms: t.transcribeMs, ok: t.ok, kind: t.kind }),
    onPending: (_who, text) => controller.pending(text),
    onDrop: (_who, text, reason) => ev.skipped({ text, reason, at: performance.now() }),
    onUtterance: (u) => {
      const decision = evaluateQuestion(u.text, {
        who: u.lane,
        allowSelfQuestions: true,
        finalized: true,
        turnFinalized: true,
        forceSystem: true,
      });
      if (!decision.accept) {
        ev.skipped({ text: u.text, reason: decision.reason, at: performance.now() });
        return;
      }
      controller.submit({
        utteranceId: u.id,
        text: cleanQuestionText(decision.question),
        finalizedAt: u.finalizedAt,
        source: "auto",
      });
    },
  });
  const lane = pipeline.addLane("System", opts.sampleRate);
  let ticker: ReturnType<typeof setInterval> | null = null;

  return {
    name: "new",
    start(events) {
      ev = events;
      configureAnswerApi(opts.base);
      clearQuestionMemory();
      controller.setListening(true);
      ticker = setInterval(() => pipeline.tick(Math.max(lastNow, performance.now())), 100);
    },
    push(chunk, now) {
      lastNow = now;
      lane.push(chunk, now);
    },
    idle() {
      return answering === 0 && !controller.busy && !pipeline.busy() && !lane.speaking;
    },
    async stop() {
      if (ticker) clearInterval(ticker);
      controller.cancel();
    },
  };
}
