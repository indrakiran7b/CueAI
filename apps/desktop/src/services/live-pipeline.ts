/**
 * Audio → transcript → finished question, per capture lane.
 *
 * segmenter (audio clock) → ordered transcription queue → turn detector.
 * Pure TypeScript with injected I/O so the overlay and the real-audio benchmark
 * (scripts/live-pipeline-e2e.mts) run exactly the same logic.
 */

import { prepareGroqWav } from "./audio-pcm";
import { SpeechSegmenter, type SegmenterConfig, type SegmenterEvent } from "./speech-segmenter";
import {
  TranscriptionQueue,
  type TranscribeJob,
  type TranscribeResult,
  type TranscribeTiming,
} from "./transcription-queue";
import { TurnDetector, type FinalUtterance, type TurnConfig, type TurnDebug } from "./turn-detector";

export type LaneName = "You" | "System";

export type PipelineTranscript = {
  who: LaneName;
  text: string;
  partial: boolean;
  segmentId: number;
  uncertain: boolean;
  speechStartAt: number;
  lastVoiceAt: number;
  timing: TranscribeTiming;
};

export type SegmentTiming = {
  who: LaneName;
  segmentId: number;
  kind: string;
  ok: boolean;
  audioMs: number;
  queueMs: number;
  transcribeMs: number;
  attempts: number;
  error?: string;
};

export type LivePipelineOptions = {
  transcribe: (job: TranscribeJob, signal: AbortSignal) => Promise<TranscribeResult>;
  onTranscript?: (line: PipelineTranscript) => void;
  onUtterance: (u: FinalUtterance) => void;
  onPending?: (who: LaneName, text: string | null) => void;
  onDrop?: (who: LaneName, text: string, reason: string) => void;
  onTranscribeError?: (who: LaneName, message: string) => void;
  onSegmentTiming?: (t: SegmentTiming) => void;
  onDebug?: (d: TurnDebug | { lane: string; action: string; reason: string }) => void;
  segmenter?: Partial<SegmenterConfig>;
  turn?: Partial<TurnConfig>;
  /** Partial transcripts cost extra STT calls; disable on tight rate limits. */
  partials?: boolean;
  now?: () => number;
};

export type LaneHandle = {
  push(chunk: Float32Array, now: number): number;
  flush(now: number): void;
  readonly speaking: boolean;
  readonly level: number;
};

const PROMPT_WORDS = 40;

export class LivePipeline {
  private opts: LivePipelineOptions;
  private queue: TranscriptionQueue;
  private detector: TurnDetector;
  private lanes = new Map<LaneName, SpeechSegmenter>();
  private recentText = new Map<LaneName, string>();
  private meta = new Map<string, { speechStartAt: number; lastVoiceAt: number; durationMs: number }>();
  private partialsPausedUntil = 0;

  constructor(opts: LivePipelineOptions) {
    this.opts = opts;
    const now = opts.now || (() => performance.now());
    this.detector = new TurnDetector({
      config: opts.turn,
      onFinal: (u) => opts.onUtterance(u),
      onPending: (lane, text) => opts.onPending?.(lane as LaneName, text),
      onDrop: (lane, text, reason) => opts.onDrop?.(lane as LaneName, text, reason),
      onDebug: (d) => opts.onDebug?.(d),
    });
    this.queue = new TranscriptionQueue({
      now,
      transcribe: opts.transcribe,
      onResult: (job, result, timing) => this.onResult(job, result, timing),
      onError: (job, error, timing) => this.onError(job, error, timing),
    });
  }

  addLane(who: LaneName, sampleRate: number): LaneHandle {
    const cfg: Partial<SegmenterConfig> = { ...this.opts.segmenter };
    if (this.opts.partials === false) cfg.partialIntervalMs = 0;
    const segmenter = new SpeechSegmenter(sampleRate, (e) => this.onSegmenterEvent(who, e), cfg);
    this.lanes.set(who, segmenter);
    const tick = (now: number) => this.detector.tick(now);
    return {
      push(chunk, now) {
        const level = segmenter.push(chunk, now);
        tick(now);
        return level;
      },
      flush(now) {
        segmenter.flush(now);
        tick(now);
      },
      get speaking() {
        return segmenter.isSpeaking;
      },
      get level() {
        return segmenter.level;
      },
    };
  }

  /** Close a lane (capture stopped); its open speech is still transcribed. */
  removeLane(who: LaneName, now: number) {
    const seg = this.lanes.get(who);
    if (!seg) return;
    seg.flush(now);
    this.lanes.delete(who);
    this.detector.speechDiscard(who);
  }

  /** Backup clock for when no audio is flowing. */
  tick(now: number) {
    this.detector.tick(now);
  }

  busy() {
    return this.queue.size > 0 || this.detector.busy();
  }

  reset() {
    this.queue.clear();
    this.detector.reset();
    this.recentText.clear();
    for (const seg of this.lanes.values()) seg.reset();
  }

  private whisperPrompt(who: LaneName) {
    const words = (this.recentText.get(who) || "").split(/\s+/).filter(Boolean);
    return words.slice(-PROMPT_WORDS).join(" ");
  }

  private onSegmenterEvent(who: LaneName, e: SegmenterEvent) {
    if (e.type === "speech_start") {
      this.detector.speechStart(who, e.at);
      return;
    }
    if (e.type === "speech_discard") {
      this.detector.speechDiscard(who);
      this.opts.onDebug?.({ lane: who, action: "discard", reason: `noise_${e.durationMs}ms` });
      return;
    }
    const s = e.segment;
    if (s.kind === "partial") {
      if (this.partialsPausedUntil > s.endedAt) return;
    } else {
      this.detector.segmentEnded(who, s.segmentId, {
        lastVoiceAt: s.lastVoiceAt,
        endedAt: s.endedAt,
        kind: s.kind,
      });
    }
    this.meta.set(`${who}:${s.segmentId}:${s.kind}`, {
      speechStartAt: s.speechStartAt,
      lastVoiceAt: s.lastVoiceAt,
      durationMs: s.durationMs,
    });
    this.queue.enqueue({
      lane: who,
      segmentId: s.segmentId,
      kind: s.kind,
      wav: prepareGroqWav(s.samples, s.sampleRate),
      prompt: this.whisperPrompt(who),
    });
  }

  private takeMeta(job: TranscribeJob) {
    const key = `${job.lane}:${job.segmentId}:${job.kind}`;
    const m = this.meta.get(key);
    this.meta.delete(key);
    return m || { speechStartAt: 0, lastVoiceAt: 0, durationMs: 0 };
  }

  private onResult(job: TranscribeJob, result: TranscribeResult, timing: TranscribeTiming) {
    const who = job.lane as LaneName;
    const m = this.takeMeta(job);
    const text = result.text.trim();
    this.opts.onSegmentTiming?.({
      who,
      segmentId: job.segmentId,
      kind: job.kind,
      ok: true,
      audioMs: m.durationMs,
      queueMs: Math.round(timing.startedAt - timing.queuedAt),
      transcribeMs: Math.round(timing.finishedAt - timing.startedAt),
      attempts: timing.attempts,
    });
    if (job.kind === "partial") {
      if (text) {
        this.detector.partial(who, text);
        this.opts.onTranscript?.({ who, text, partial: true, segmentId: job.segmentId, uncertain: Boolean(result.uncertain), speechStartAt: m.speechStartAt, lastVoiceAt: m.lastVoiceAt, timing });
      }
      return;
    }
    if (text) {
      const prev = this.recentText.get(who) || "";
      this.recentText.set(who, `${prev} ${text}`.split(/\s+/).slice(-PROMPT_WORDS * 2).join(" "));
      this.opts.onTranscript?.({ who, text, partial: false, segmentId: job.segmentId, uncertain: Boolean(result.uncertain), speechStartAt: m.speechStartAt, lastVoiceAt: m.lastVoiceAt, timing });
    }
    this.detector.transcript(who, job.segmentId, {
      text,
      at: timing.finishedAt,
      requestAt: timing.startedAt,
      uncertain: result.uncertain,
    });
  }

  private onError(job: TranscribeJob, error: Error, timing: TranscribeTiming) {
    const who = job.lane as LaneName;
    const m = this.takeMeta(job);
    this.opts.onSegmentTiming?.({
      who,
      segmentId: job.segmentId,
      kind: job.kind,
      ok: false,
      audioMs: m.durationMs,
      queueMs: Math.round(timing.startedAt - timing.queuedAt),
      transcribeMs: Math.round(timing.finishedAt - timing.startedAt),
      attempts: timing.attempts,
      error: error.message.slice(0, 120),
    });
    if (job.kind === "partial") {
      if ((error as { status?: number }).status === 429) this.partialsPausedUntil = timing.finishedAt + 60_000;
      return;
    }
    // A failed segment must not block the turn forever.
    this.detector.transcript(who, job.segmentId, { text: "", at: timing.finishedAt });
    this.opts.onTranscribeError?.(who, error.message);
  }
}

export type { FinalUtterance, TurnDebug };
