/**
 * Voice-activity segmenter driven only by the audio clock (each PCM chunk), so
 * window timer throttling can never delay an endpoint. Short pauses close a
 * segment early so transcription overlaps the rest of the speaker's silence;
 * whether the *question* is finished is decided later by the turn detector.
 */

import { PcmRingBuffer, rmsLevel } from "./audio-pcm";

export type SegmenterConfig = {
  /** Audio kept before speech onset so first syllables are not clipped. */
  prefixMs: number;
  /** Audio kept after the last voiced frame. */
  postRollMs: number;
  /** Silence that closes a segment for long speech (shorter bursts wait longer). */
  segmentSilenceMs: number;
  /** Bursts shorter than this are noise and are discarded. */
  minSpeechMs: number;
  /** Long monologues are split here, with `overlapMs` of shared audio. */
  maxSegmentMs: number;
  overlapMs: number;
  voiceThreshold: number;
  hangoverThreshold: number;
  /** Rolling partial transcripts while someone speaks (0 disables). */
  partialIntervalMs: number;
  partialMinSpeechMs: number;
  ringSeconds: number;
};

export const DEFAULT_SEGMENTER_CONFIG: SegmenterConfig = {
  prefixMs: 350,
  postRollMs: 300,
  segmentSilenceMs: 420,
  minSpeechMs: 260,
  maxSegmentMs: 20_000,
  overlapMs: 600,
  voiceThreshold: 0.018,
  hangoverThreshold: 0.01,
  partialIntervalMs: 2500,
  partialMinSpeechMs: 3000,
  ringSeconds: 32,
};

export type SegmentKind = "final" | "split" | "partial";

export type SpeechSegment = {
  segmentId: number;
  kind: SegmentKind;
  samples: Float32Array;
  sampleRate: number;
  speechStartAt: number;
  lastVoiceAt: number;
  endedAt: number;
  durationMs: number;
};

export type SegmenterEvent =
  | { type: "speech_start"; segmentId: number; at: number }
  | { type: "speech_discard"; segmentId: number; at: number; durationMs: number }
  | { type: "segment"; segment: SpeechSegment };

/** Short bursts are often mid-question pauses, so they need a little more silence. */
export function segmentSilenceFor(speechMs: number, base: number) {
  if (speechMs < 900) return base + 150;
  if (speechMs < 1600) return base + 80;
  return base;
}

export class SpeechSegmenter {
  readonly cfg: SegmenterConfig;
  private ring: PcmRingBuffer;
  private emit: (e: SegmenterEvent) => void;
  private speaking = false;
  private segmentId = 0;
  private startAbs = 0;
  private startAt = 0;
  private lastVoiceAbs = 0;
  private lastVoiceAt = 0;
  private lastPartialAt = 0;
  private noiseFloor = 0;
  private lastLevel = 0;

  constructor(sampleRate: number, emit: (e: SegmenterEvent) => void, cfg: Partial<SegmenterConfig> = {}) {
    this.cfg = { ...DEFAULT_SEGMENTER_CONFIG, ...cfg };
    this.ring = new PcmRingBuffer(sampleRate, this.cfg.ringSeconds);
    this.emit = emit;
  }

  get sampleRate() {
    return this.ring.sampleRate;
  }

  get isSpeaking() {
    return this.speaking;
  }

  get level() {
    return this.lastLevel;
  }

  /** Adaptive onset threshold: never below the configured floor. */
  get threshold() {
    return Math.min(0.2, Math.max(this.cfg.voiceThreshold, this.noiseFloor * 2.5));
  }

  push(chunk: Float32Array, now: number): number {
    this.ring.push(chunk);
    const level = rmsLevel(chunk);
    this.lastLevel = level;
    const onset = this.threshold;
    const hold = Math.min(onset, Math.max(this.cfg.hangoverThreshold, this.noiseFloor * 1.6));
    const voiced = level >= (this.speaking ? hold : onset);

    if (!voiced && !this.speaking) {
      this.noiseFloor = this.noiseFloor === 0 ? level : this.noiseFloor * 0.97 + level * 0.03;
    }

    if (voiced) {
      this.lastVoiceAt = now;
      this.lastVoiceAbs = this.ring.endIndex;
      if (!this.speaking) {
        this.speaking = true;
        this.segmentId += 1;
        this.startAt = now - (chunk.length / this.sampleRate) * 1000;
        this.startAbs = Math.max(0, this.ring.endIndex - chunk.length);
        this.lastPartialAt = now;
        this.emit({ type: "speech_start", segmentId: this.segmentId, at: this.startAt });
      }
    }

    if (!this.speaking) return level;

    const speechMs = this.lastVoiceAt - this.startAt;
    if (now - this.startAt >= this.cfg.maxSegmentMs) {
      this.split(now);
      return level;
    }
    if (!voiced && now - this.lastVoiceAt >= segmentSilenceFor(speechMs, this.cfg.segmentSilenceMs)) {
      this.close(now, "final");
      return level;
    }
    if (
      this.cfg.partialIntervalMs > 0 &&
      speechMs >= this.cfg.partialMinSpeechMs &&
      now - this.lastPartialAt >= this.cfg.partialIntervalMs
    ) {
      this.lastPartialAt = now;
      this.emit({ type: "segment", segment: this.build("partial", now, this.ring.endIndex) });
    }
    return level;
  }

  /** Close any open speech (e.g. capture stopping). */
  flush(now: number) {
    if (this.speaking) this.close(now, "final");
  }

  reset() {
    this.speaking = false;
    this.ring.clear();
    this.noiseFloor = 0;
  }

  private build(kind: SegmentKind, now: number, endAbs: number): SpeechSegment {
    const sr = this.sampleRate;
    const start = Math.max(0, this.startAbs - Math.floor((this.cfg.prefixMs / 1000) * sr));
    const samples = this.ring.slice(start, endAbs);
    return {
      segmentId: this.segmentId,
      kind,
      samples,
      sampleRate: sr,
      speechStartAt: this.startAt,
      lastVoiceAt: this.lastVoiceAt,
      endedAt: now,
      durationMs: Math.round(this.lastVoiceAt - this.startAt),
    };
  }

  private close(now: number, kind: "final") {
    this.speaking = false;
    const durationMs = this.lastVoiceAt - this.startAt;
    if (durationMs < this.cfg.minSpeechMs) {
      this.emit({ type: "speech_discard", segmentId: this.segmentId, at: now, durationMs: Math.round(durationMs) });
      return;
    }
    const post = Math.floor((this.cfg.postRollMs / 1000) * this.sampleRate);
    const endAbs = Math.min(this.ring.endIndex, this.lastVoiceAbs + post);
    this.emit({ type: "segment", segment: this.build(kind, now, endAbs) });
  }

  /** Long speech: ship what we have and keep listening with overlapping audio. */
  private split(now: number) {
    const segment = this.build("split", now, this.ring.endIndex);
    this.emit({ type: "segment", segment });
    const overlap = Math.floor((this.cfg.overlapMs / 1000) * this.sampleRate);
    this.segmentId += 1;
    this.startAbs = Math.max(0, this.ring.endIndex - overlap);
    this.startAt = now - this.cfg.overlapMs;
    this.lastPartialAt = now;
    this.emit({ type: "speech_start", segmentId: this.segmentId, at: this.startAt });
  }
}
