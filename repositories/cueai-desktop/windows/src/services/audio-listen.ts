/**
 * Continuous mic + system loopback → PCM ring buffer → VAD segments → 16 kHz mono WAV
 * → Groq Whisper (Gemini STT fallback server-side).
 *
 * Streams stay open while Mic/System are ON. MediaRecorder is not used.
 * Each lane numbers its segments; results are delivered with that sequence number so the
 * utterance assembler can re-order them. Long speech is split at natural pauses so text
 * arrives while the speaker is still talking.
 */

import {
  clearAudioError,
  emitLevelsThrottled,
  endMicStart,
  endSystemStart,
  humanizeFetchError,
  resetAudioSessionState,
  setAudioError,
  setMicLevel,
  setMicState,
  setSystemLevel,
  setSystemState,
  subscribeAudioSession,
  tryBeginMicStart,
  tryBeginSystemStart,
  type AudioSessionSnapshot,
} from "./audio-session-manager";
import {
  mixToMono,
  prepareGroqWav,
  PcmRingBuffer,
  rmsLevel,
} from "./audio-pcm";
import { debugText, pipelineLog } from "./pipeline-log";
import {
  PREFIX_MS,
  POST_ROLL_MS,
  SPEECH_END_SILENCE_MS,
  MIN_SPEECH_MS,
  MAX_SPEECH_MS,
  VOICE_THRESHOLD,
  VOICE_HANGOVER_THRESHOLD,
  adaptiveSilenceMs,
  captureQuality,
  looksTruncatedTranscript,
  logCaptureMetrics,
  wordCount,
} from "./speech-capture";

export type ListenActiveState = AudioSessionSnapshot;

export type LiveSegmentResult = {
  text: string;
  uncertain?: boolean;
  transcribedAt: number;
};

export type LiveTranscribeConfig = {
  apiBase: string;
  /** Every non-empty transcript, in arrival order (display / persistence). */
  onResult: (line: {
    who: string;
    text: string;
    seq: number;
    uncertain?: boolean;
    audioEndAt?: number;
    transcribedAt?: number;
    transcribeStartedAt?: number;
    partial?: boolean;
  }) => void;
  onError: (msg: string) => void;
  /** VAD detected voice on a lane. */
  onSpeechStart?: (who: string, at: number) => void;
  /** VAD decided the speaker paused long enough to end the speech run. */
  onSpeechEnd?: (who: string, at: number, lastVoiceAt: number) => void;
  /** A segment was handed to transcription; `seq` is monotonic per lane. */
  onSegmentQueued?: (who: string, seq: number) => void;
  /** Transcription finished for `seq`; `null` when empty, dropped or failed. */
  onSegmentResult?: (who: string, seq: number, result: LiveSegmentResult | null) => void;
  /** Extra vocabulary for Whisper (job title, stack names). Never secrets. */
  getVocabulary?: () => string;
};

type HeldBurst = { startAbs: number; endAbs: number; startedPerf: number; timer: number };

type CaptureLane = {
  who: "You" | "System";
  kind: "mic" | "system";
  stream: MediaStream;
  ctx: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  mute: GainNode;
  ring: PcmRingBuffer;
  speechActive: boolean;
  /** Ring index where the current (not yet sent) segment starts. */
  speechStartAbs: number;
  lastVoiceAbs: number;
  lastVoiceAt: number;
  speechStartedPerf: number | null;
  /** When the current not-yet-sent segment started (for soft splits). */
  segmentStartedPerf: number | null;
  /** A soft split already happened inside the current pause. */
  splitInPause: boolean;
  noiseFloor: number;
  windowMin: number;
  windowChunks: number;
  held: HeldBurst | null;
  inFlight: number;
  onEnded: (() => void) | null;
};

export { SPEECH_END_SILENCE_MS, PREFIX_MS, POST_ROLL_MS };
const MIN_WAV_BYTES = 1600;
/** Bursts shorter than this are clicks / breaths. */
const MIN_BURST_MS = 220;
/** A short burst ("Why?") waits this long for more speech before being sent alone. */
const SHORT_BURST_HOLD_MS = 650;
/** Long speech is split at a pause this long so text arrives while the speaker continues. */
const SOFT_SPLIT_PAUSE_MS = 240;
const SOFT_SPLIT_MIN_MS = 4_000;
/** Overlap kept when a hard split has to cut through continuous speech. */
const HARD_SPLIT_OVERLAP_MS = 300;
const MAX_CONCURRENT_TRANSCRIBE = 3;
const MAX_QUEUED_TRANSCRIBE = 6;
const MAX_TRANSCRIBE_ATTEMPTS = 2;
const PROMPT_CONTEXT_CHARS = 200;
const NOISE_WINDOW_CHUNKS = 40;

let micStream: MediaStream | null = null;
let systemStream: MediaStream | null = null;
let micLane: CaptureLane | null = null;
let systemLane: CaptureLane | null = null;
let liveConfig: LiveTranscribeConfig | null = null;
let micStartPromise: Promise<void> | null = null;
let systemStartPromise: Promise<void> | null = null;
let deviceChangeHandler: (() => void) | null = null;

const laneSeq: Record<string, number> = { You: 0, System: 0 };
const laneContext: Record<string, string> = { You: "", System: "" };

export type TranscribeStats = {
  requests: number;
  retries: number;
  failures: number;
  dropped: number;
  empty: number;
};
const stats: TranscribeStats = { requests: 0, retries: 0, failures: 0, dropped: 0, empty: 0 };

export function getTranscribeStats(): TranscribeStats {
  return { ...stats };
}

export function configureLiveTranscription(config: LiveTranscribeConfig | null) {
  liveConfig = config;
  if (!config) {
    queue.length = 0;
    laneContext.You = "";
    laneContext.System = "";
  }
}

/** Forget per-speaker Whisper context (new meeting / session). */
export function resetTranscriptionContext() {
  laneContext.You = "";
  laneContext.System = "";
}

export function getListenActive(): { mic: boolean; systemAudio: boolean } {
  return {
    mic: Boolean(micStream?.getAudioTracks().some((t) => t.readyState === "live")),
    systemAudio: Boolean(
      systemStream?.getAudioTracks().some((t) => t.readyState === "live"),
    ),
  };
}

function humanizeMediaError(err: unknown, kind: "mic" | "system"): string {
  if (!(err instanceof Error) && !(err instanceof DOMException)) {
    return kind === "mic" ? "Microphone unavailable." : "System audio capture unavailable.";
  }
  const name = "name" in err ? String(err.name) : "";
  const msg = String((err as Error).message || "").toLowerCase();
  if (name === "NotAllowedError" || msg.includes("permission") || msg.includes("denied")) {
    return kind === "mic"
      ? "Microphone permission denied. Allow mic access for CueAI."
      : "System audio permission denied.";
  }
  if (name === "NotFoundError" || msg.includes("not found") || msg.includes("device")) {
    return kind === "mic"
      ? "No microphone device found."
      : "No system audio / loopback device found.";
  }
  if (name === "NotReadableError" || msg.includes("in use") || msg.includes("busy")) {
    return kind === "mic"
      ? "Microphone is already in use by another app."
      : "System audio device is unavailable or in use.";
  }
  if (msg.includes("system audio") || msg.includes("loopback")) {
    return "System audio capture is unavailable on this device.";
  }
  return humanizeFetchError(err);
}

/* ------------------------------------------------------------------ */
/* Transcription queue                                                 */
/* ------------------------------------------------------------------ */

type TranscribeJob = {
  who: "You" | "System";
  seq: number;
  wav: Blob;
  audioEndAt: number;
  final: boolean;
};

const queue: TranscribeJob[] = [];
let inFlightTotal = 0;

class TranscribeError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly retryAfterSec?: number,
  ) {
    super(message);
  }
}

function isRetryable(err: unknown): err is TranscribeError {
  if (!(err instanceof TranscribeError)) return false;
  return err.status === 0 || err.status === 429 || err.status === 504 || err.status >= 500;
}

function laneFor(who: string): CaptureLane | null {
  return who === "You" ? micLane : systemLane;
}

function refreshLaneState(who: string) {
  const lane = laneFor(who);
  if (who === "You") {
    if (micStream) setMicState(lane && lane.inFlight > 0 ? "processing" : "listening");
  } else if (systemStream) {
    setSystemState(lane && lane.inFlight > 0 ? "processing" : "listening");
  }
}

function buildPrompt(who: string): string {
  const vocab = liveConfig?.getVocabulary?.().trim() || "";
  const recent = laneContext[who]?.slice(-PROMPT_CONTEXT_CHARS) || "";
  return [vocab, recent].filter(Boolean).join(" ").slice(-400);
}

function enqueueSegment(lane: CaptureLane, wav: Blob, audioEndAt: number, final: boolean) {
  if (!liveConfig) return;
  if (wav.size < MIN_WAV_BYTES) return;
  const seq = ++laneSeq[lane.who];
  liveConfig.onSegmentQueued?.(lane.who, seq);
  queue.push({ who: lane.who, seq, wav, audioEndAt, final });
  while (queue.length > MAX_QUEUED_TRANSCRIBE) {
    const dropped = queue.shift()!;
    stats.dropped++;
    pipelineLog("transcription", "Queue full — dropped oldest segment", {
      who: dropped.who,
      seq: dropped.seq,
    });
    liveConfig.onSegmentResult?.(dropped.who, dropped.seq, null);
  }
  pumpQueue();
}

function pumpQueue() {
  while (inFlightTotal < MAX_CONCURRENT_TRANSCRIBE && queue.length) {
    const job = queue.shift()!;
    inFlightTotal++;
    const lane = laneFor(job.who);
    if (lane) lane.inFlight++;
    refreshLaneState(job.who);
    void runTranscribeJob(job).finally(() => {
      inFlightTotal--;
      const l = laneFor(job.who);
      if (l) l.inFlight = Math.max(0, l.inFlight - 1);
      refreshLaneState(job.who);
      pumpQueue();
    });
  }
}

async function runTranscribeJob(job: TranscribeJob) {
  const config = liveConfig;
  if (!config) return;
  const started = performance.now();
  const prompt = buildPrompt(job.who);
  let line: { text: string; uncertain: boolean } | null = null;
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= MAX_TRANSCRIBE_ATTEMPTS; attempt++) {
    stats.requests++;
    try {
      line = await transcribeAudioBlob(job.wav, job.who, config.apiBase, prompt);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      if (attempt >= MAX_TRANSCRIBE_ATTEMPTS || !isRetryable(err)) break;
      stats.retries++;
      const waitMs = Math.min(2000, err.retryAfterSec ? err.retryAfterSec * 1000 : 350);
      pipelineLog("transcription", "Retrying segment", {
        who: job.who,
        seq: job.seq,
        status: err.status,
        waitMs,
      });
      await new Promise((r) => window.setTimeout(r, waitMs));
      if (liveConfig !== config) return;
    }
  }

  const transcribedAt = performance.now();
  if (liveConfig !== config) return;

  if (lastErr) {
    stats.failures++;
    const msg = humanizeFetchError(lastErr);
    pipelineLog("transcription", "Transcription failed", {
      who: job.who,
      seq: job.seq,
      status: lastErr instanceof TranscribeError ? lastErr.status : undefined,
      error: msg.slice(0, 120),
    });
    setAudioError(msg);
    config.onError(msg);
    config.onSegmentResult?.(job.who, job.seq, null);
    return;
  }

  clearAudioError();
  const text = line?.text.trim() || "";
  pipelineLog("transcription", text ? "Segment transcribed" : "Segment empty", {
    who: job.who,
    seq: job.seq,
    final: job.final,
    chars: text.length,
    uncertain: Boolean(line?.uncertain),
    latencyMs: Math.round(transcribedAt - started),
    audioToTextMs: Math.round(transcribedAt - job.audioEndAt),
    text: text ? debugText(text) : undefined,
  });
  if (!text) {
    stats.empty++;
    config.onSegmentResult?.(job.who, job.seq, null);
    return;
  }

  logCaptureMetrics("transcription", {
    who: job.who,
    transcription_latency: Math.round(transcribedAt - started),
    transcript_length: text.length,
    question_capture_quality: captureQuality({
      transcriptChars: text.length,
      words: wordCount(text),
      truncated: looksTruncatedTranscript(text),
    }),
  });
  laneContext[job.who] = `${laneContext[job.who]} ${text}`.slice(-PROMPT_CONTEXT_CHARS * 2);
  config.onResult({
    who: job.who,
    text,
    seq: job.seq,
    uncertain: Boolean(line?.uncertain),
    audioEndAt: job.audioEndAt,
    transcribedAt,
    transcribeStartedAt: started,
    partial: !job.final,
  });
  config.onSegmentResult?.(job.who, job.seq, {
    text,
    uncertain: Boolean(line?.uncertain),
    transcribedAt,
  });
}

/* ------------------------------------------------------------------ */
/* VAD + segmentation                                                  */
/* ------------------------------------------------------------------ */

function msToSamples(lane: CaptureLane, ms: number) {
  return Math.floor((ms / 1000) * lane.ring.sampleRate);
}

function emitRange(lane: CaptureLane, startAbs: number, endAbs: number, final: boolean, reason: string) {
  const from = Math.max(lane.ring.startIndex, startAbs);
  const samples = lane.ring.slice(from, Math.min(lane.ring.endIndex, endAbs));
  if (samples.length < lane.ring.sampleRate * 0.2) {
    pipelineLog("audio", "Segment too small — skipped", { who: lane.who, reason });
    return;
  }
  const audioEndAt = performance.now();
  const wav = prepareGroqWav(samples, lane.ring.sampleRate);
  const durationMs = Math.round((samples.length / lane.ring.sampleRate) * 1000);
  pipelineLog("audio", final ? "Speech segment ended" : "Speech segment split", {
    who: lane.who,
    reason,
    durationMs,
    wavBytes: wav.size,
  });
  logCaptureMetrics("audio", {
    who: lane.who,
    speech_end: Math.round(audioEndAt),
    audio_duration: durationMs,
    pre_roll: PREFIX_MS,
    post_roll: POST_ROLL_MS,
    question_capture_quality: captureQuality({ durationMs }),
  });
  enqueueSegment(lane, wav, audioEndAt, final);
}

function clearHeld(lane: CaptureLane) {
  if (lane.held) window.clearTimeout(lane.held.timer);
  lane.held = null;
}

function flushHeld(lane: CaptureLane, reason: string) {
  const held = lane.held;
  if (!held) return;
  clearHeld(lane);
  emitRange(lane, held.startAbs, held.endAbs, true, reason);
}

/** End of a speech run: send the remaining audio as the final segment of the run. */
function finalizeSpeech(lane: CaptureLane, reason: string) {
  if (!lane.speechActive || lane.speechStartedPerf == null) {
    lane.speechActive = false;
    lane.speechStartedPerf = null;
    return;
  }
  const now = performance.now();
  const runMs = now - lane.speechStartedPerf;
  const endAbs = Math.min(lane.ring.endIndex, lane.lastVoiceAbs + msToSamples(lane, POST_ROLL_MS));
  const startAbs = lane.speechStartAbs;
  const segmentMs = lane.segmentStartedPerf != null ? lane.lastVoiceAt - lane.segmentStartedPerf : runMs;

  lane.speechActive = false;
  lane.speechStartedPerf = null;
  lane.segmentStartedPerf = null;
  liveConfig?.onSpeechEnd?.(lane.who, now, lane.lastVoiceAt);

  if (reason !== "stop" && runMs < MIN_SPEECH_MS && segmentMs < MIN_SPEECH_MS) {
    if (runMs < MIN_BURST_MS) {
      pipelineLog("audio", "Noise burst ignored", { who: lane.who, durationMs: Math.round(runMs) });
      return;
    }
    // A short burst ("Why?", "And?") is kept and merged if the speaker continues.
    clearHeld(lane);
    lane.held = {
      startAbs,
      endAbs,
      startedPerf: now - runMs,
      timer: window.setTimeout(() => flushHeld(lane, "short_burst"), SHORT_BURST_HOLD_MS),
    };
    pipelineLog("audio", "Short speech held for continuation", {
      who: lane.who,
      durationMs: Math.round(runMs),
    });
    return;
  }
  emitRange(lane, startAbs, endAbs, true, reason);
}

function voiceThresholds(lane: CaptureLane) {
  const enter = Math.min(0.08, Math.max(VOICE_THRESHOLD, lane.noiseFloor * 2.5));
  const stay = Math.min(enter, Math.max(VOICE_HANGOVER_THRESHOLD, lane.noiseFloor * 1.6));
  return { enter, stay };
}

function trackNoiseFloor(lane: CaptureLane, level: number) {
  lane.windowMin = Math.min(lane.windowMin, level);
  lane.windowChunks += 1;
  if (lane.windowChunks >= NOISE_WINDOW_CHUNKS) {
    lane.noiseFloor = lane.noiseFloor * 0.7 + lane.windowMin * 0.3;
    lane.windowMin = Number.POSITIVE_INFINITY;
    lane.windowChunks = 0;
  }
}

function onPcmChunk(lane: CaptureLane, mono: Float32Array) {
  lane.ring.push(mono);
  const level = rmsLevel(mono);
  if (lane.kind === "mic") setMicLevel(level);
  else setSystemLevel(level);
  emitLevelsThrottled(125);
  trackNoiseFloor(lane, level);

  const now = performance.now();
  const { enter, stay } = voiceThresholds(lane);
  const voiced = level >= (lane.speechActive ? stay : enter);

  if (voiced) {
    lane.lastVoiceAt = now;
    lane.lastVoiceAbs = lane.ring.endIndex;
    lane.splitInPause = false;
    if (!lane.speechActive) {
      lane.speechActive = true;
      const chunkStart = Math.max(0, lane.ring.endIndex - mono.length);
      if (lane.held) {
        lane.speechStartAbs = lane.held.startAbs;
        lane.speechStartedPerf = lane.held.startedPerf;
        clearHeld(lane);
      } else {
        lane.speechStartAbs = Math.max(lane.ring.startIndex, chunkStart - msToSamples(lane, PREFIX_MS));
        lane.speechStartedPerf = now;
      }
      lane.segmentStartedPerf = lane.speechStartedPerf;
      liveConfig?.onSpeechStart?.(lane.who, now);
      pipelineLog("audio", "Speech started", { who: lane.who });
    }
    const segmentMs = now - (lane.segmentStartedPerf ?? now);
    if (segmentMs >= MAX_SPEECH_MS) {
      // Continuous speech with no pause: cut with overlap; the assembler de-duplicates words.
      const cut = lane.ring.endIndex;
      emitRange(lane, lane.speechStartAbs, cut, false, "max_duration");
      lane.speechStartAbs = Math.max(lane.ring.startIndex, cut - msToSamples(lane, HARD_SPLIT_OVERLAP_MS));
      lane.segmentStartedPerf = now;
    }
    return;
  }

  if (!lane.speechActive) return;
  const silentFor = now - lane.lastVoiceAt;
  const runMs = lane.speechStartedPerf != null ? now - lane.speechStartedPerf : 0;
  if (silentFor >= adaptiveSilenceMs(runMs)) {
    finalizeSpeech(lane, "silence");
    return;
  }
  const segmentMs = lane.lastVoiceAt - (lane.segmentStartedPerf ?? lane.lastVoiceAt);
  if (!lane.splitInPause && silentFor >= SOFT_SPLIT_PAUSE_MS && segmentMs >= SOFT_SPLIT_MIN_MS) {
    // Mid-question pause: send what we have now; the speaker may continue.
    lane.splitInPause = true;
    const cut = Math.min(lane.ring.endIndex, lane.lastVoiceAbs + msToSamples(lane, 150));
    emitRange(lane, lane.speechStartAbs, cut, false, "pause_split");
    lane.speechStartAbs = cut;
    lane.segmentStartedPerf = now;
  }
}

function attachPcmLane(
  stream: MediaStream,
  who: "You" | "System",
  kind: "mic" | "system",
): CaptureLane {
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  // Prefer stereo in → mix in onaudioprocess; works for mic (mono) and loopback.
  const processor = ctx.createScriptProcessor(2048, 2, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;
  const ring = new PcmRingBuffer(ctx.sampleRate, 24);

  const lane: CaptureLane = {
    who,
    kind,
    stream,
    ctx,
    source,
    processor,
    mute,
    ring,
    speechActive: false,
    speechStartAbs: 0,
    lastVoiceAbs: 0,
    lastVoiceAt: 0,
    speechStartedPerf: null,
    segmentStartedPerf: null,
    splitInPause: false,
    noiseFloor: 0,
    windowMin: Number.POSITIVE_INFINITY,
    windowChunks: 0,
    held: null,
    inFlight: 0,
    onEnded: null,
  };

  processor.onaudioprocess = (ev) => {
    const input = ev.inputBuffer;
    const channels: Float32Array[] = [];
    for (let c = 0; c < input.numberOfChannels; c++) {
      channels.push(input.getChannelData(c));
    }
    onPcmChunk(lane, mixToMono(channels));
  };

  // Chromium can suspend an AudioContext (device switch, sleep); resume so capture continues.
  ctx.onstatechange = () => {
    if (ctx.state === "suspended") {
      pipelineLog("audio", "Audio context suspended — resuming", { who });
      void ctx.resume().catch(() => undefined);
    }
  };

  source.connect(processor);
  processor.connect(mute);
  mute.connect(ctx.destination);
  void ctx.resume();
  return lane;
}

function tearDownLane(lane: CaptureLane | null) {
  if (!lane) return;
  clearHeld(lane);
  if (lane.onEnded) {
    lane.stream.getTracks().forEach((t) => t.removeEventListener("ended", lane.onEnded!));
  }
  lane.ctx.onstatechange = null;
  lane.processor.onaudioprocess = null;
  try {
    lane.processor.disconnect();
    lane.source.disconnect();
    lane.mute.disconnect();
  } catch {
    /* ignore */
  }
  void lane.ctx.close();
  lane.ring.clear();
}

function wireTrackEnded(lane: CaptureLane, onDead: () => void) {
  const handler = () => {
    pipelineLog("audio", "Audio device disconnected", { who: lane.who });
    onDead();
  };
  lane.onEnded = handler;
  lane.stream.getTracks().forEach((t) => t.addEventListener("ended", handler));
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Restart the mic if the device it was bound to disappeared (headset unplugged, default changed). */
function watchDeviceChanges() {
  if (deviceChangeHandler || !navigator.mediaDevices?.addEventListener) return;
  deviceChangeHandler = () => {
    void (async () => {
      const track = micStream?.getAudioTracks()[0];
      if (!track) return;
      const deviceId = track.getSettings().deviceId;
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      const stillThere =
        track.readyState === "live" &&
        (!deviceId || devices.some((d) => d.kind === "audioinput" && d.deviceId === deviceId));
      if (stillThere) return;
      pipelineLog("audio", "Microphone device changed — restarting capture");
      await stopMicListen();
      try {
        await startMicListen();
      } catch {
        /* startMicListen already reported the error */
      }
    })();
  };
  navigator.mediaDevices.addEventListener("devicechange", deviceChangeHandler);
}

function unwatchDeviceChanges() {
  if (!deviceChangeHandler) return;
  navigator.mediaDevices?.removeEventListener?.("devicechange", deviceChangeHandler);
  deviceChangeHandler = null;
}

export function subscribeListenLevels(cb: (state: ListenActiveState) => void) {
  return subscribeAudioSession(cb);
}

async function startMicListenInternal(): Promise<void> {
  if (micStream) return;
  if (!tryBeginMicStart()) {
    if (micStartPromise) await micStartPromise;
    return;
  }

  micStartPromise = (async () => {
    let ok = false;
    try {
      setMicState("connecting");
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });
      micLane = attachPcmLane(micStream, "You", "mic");
      wireTrackEnded(micLane, () => {
        void stopMicListen();
        setAudioError("Microphone disconnected.");
        setMicState("error");
      });
      watchDeviceChanges();
      setMicState("listening");
      clearAudioError();
      pipelineLog("audio", "Microphone capture started", {
        tracks: micStream.getAudioTracks().length,
        sampleRate: micLane.ctx.sampleRate,
      });
      ok = true;
    } catch (err) {
      const msg = humanizeMediaError(err, "mic");
      setAudioError(msg);
      setMicState("error");
      stopStream(micStream);
      micStream = null;
      micLane = null;
      pipelineLog("audio", "Microphone capture failed", { error: msg });
      throw new Error(msg);
    } finally {
      endMicStart(ok);
      micStartPromise = null;
    }
  })();

  await micStartPromise;
}

export async function startMicListen(): Promise<void> {
  return startMicListenInternal();
}

export async function stopMicListen(): Promise<Blob | null> {
  setMicState("stopping");
  if (micLane) {
    if (micLane.speechActive) finalizeSpeech(micLane, "stop");
    flushHeld(micLane, "stop");
  }
  tearDownLane(micLane);
  micLane = null;
  stopStream(micStream);
  micStream = null;
  unwatchDeviceChanges();
  setMicLevel(0);
  setMicState("idle");
  pipelineLog("audio", "Microphone capture stopped");
  return null;
}

async function captureSystemStream(
  getSourceId: () => Promise<string | null>,
): Promise<MediaStream> {
  if (typeof navigator.mediaDevices.getDisplayMedia === "function") {
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      if (display.getAudioTracks().length) {
        display.getVideoTracks().forEach((t) => {
          t.enabled = false;
        });
        return display;
      }
      stopStream(display);
    } catch (err) {
      pipelineLog("audio", "getDisplayMedia loopback failed — trying desktop source", {
        error: err instanceof Error ? err.message.slice(0, 120) : "unknown",
      });
    }
  }

  const sourceId = await getSourceId();
  if (!sourceId) throw new Error("System audio capture is unavailable on this device.");

  const constraints = {
    audio: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: sourceId,
      },
    },
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: sourceId,
        maxWidth: 1280,
        maxHeight: 720,
        maxFrameRate: 5,
      },
    },
  } as unknown as MediaStreamConstraints;

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  stream.getVideoTracks().forEach((t) => {
    t.enabled = false;
  });
  if (!stream.getAudioTracks().length) {
    stopStream(stream);
    throw new Error("System audio capture is unavailable on this device.");
  }
  return stream;
}

async function startSystemAudioListenInternal(
  getSourceId: () => Promise<string | null>,
): Promise<void> {
  if (systemStream) return;
  if (!tryBeginSystemStart()) {
    if (systemStartPromise) await systemStartPromise;
    return;
  }

  systemStartPromise = (async () => {
    let ok = false;
    try {
      setSystemState("connecting");
      systemStream = await captureSystemStream(getSourceId);
      systemLane = attachPcmLane(systemStream, "System", "system");
      wireTrackEnded(systemLane, () => {
        void stopSystemAudioListen();
        setAudioError("System audio disconnected.");
        setSystemState("error");
      });
      setSystemState("listening");
      clearAudioError();
      pipelineLog("audio", "System loopback capture started", {
        sampleRate: systemLane.ctx.sampleRate,
      });
      ok = true;
    } catch (err) {
      const msg = humanizeMediaError(err, "system");
      setAudioError(msg);
      setSystemState("error");
      stopStream(systemStream);
      systemStream = null;
      systemLane = null;
      pipelineLog("audio", "System loopback capture failed", { error: msg });
      throw new Error(msg);
    } finally {
      endSystemStart(ok);
      systemStartPromise = null;
    }
  })();

  await systemStartPromise;
}

export async function startSystemAudioListen(
  getSourceId: () => Promise<string | null>,
): Promise<void> {
  return startSystemAudioListenInternal(getSourceId);
}

export async function stopSystemAudioListen(): Promise<Blob | null> {
  setSystemState("stopping");
  if (systemLane) {
    if (systemLane.speechActive) finalizeSpeech(systemLane, "stop");
    flushHeld(systemLane, "stop");
  }
  tearDownLane(systemLane);
  systemLane = null;
  stopStream(systemStream);
  systemStream = null;
  setSystemLevel(0);
  setSystemState("idle");
  pipelineLog("audio", "System loopback capture stopped");
  return null;
}

export async function syncListenSources(opts: {
  mic: boolean;
  systemAudio: boolean;
  getDesktopSourceId: () => Promise<string | null>;
}): Promise<{ mic: boolean; systemAudio: boolean }> {
  const errors: string[] = [];

  // Start both lanes concurrently so neither waits on the other's permission prompt.
  await Promise.all([
    (async () => {
      if (opts.mic) {
        if (getListenActive().mic) return;
        try {
          await startMicListen();
        } catch (err) {
          errors.push(err instanceof Error ? err.message : "Mic failed");
        }
      } else if (micStream) {
        await stopMicListen();
      }
    })(),
    (async () => {
      if (opts.systemAudio) {
        if (getListenActive().systemAudio) return;
        try {
          await startSystemAudioListen(opts.getDesktopSourceId);
        } catch (err) {
          errors.push(err instanceof Error ? err.message : "System audio failed");
        }
      } else if (systemStream) {
        await stopSystemAudioListen();
      }
    })(),
  ]);

  const active = getListenActive();
  if (errors.length) {
    const msg = errors.join(" · ");
    setAudioError(msg);
    throw new Error(msg);
  }
  return active;
}

export async function stopAllListen(): Promise<{
  micBlob: Blob | null;
  systemBlob: Blob | null;
}> {
  const micBlob = micStream ? await stopMicListen() : null;
  const systemBlob = systemStream ? await stopSystemAudioListen() : null;
  resetAudioSessionState();
  return { micBlob, systemBlob };
}

const FETCH_TRANSCRIBE_TIMEOUT_MS = 15_000;

export async function transcribeAudioBlob(
  blob: Blob,
  who: string,
  apiBase = "http://127.0.0.1:3000",
  prompt = "",
): Promise<{ who: string; text: string; uncertain: boolean } | null> {
  if (!blob || blob.size < MIN_WAV_BYTES) return null;

  const mime = blob.type || "audio/wav";

  if (typeof window !== "undefined" && window.cueai?.transcribe) {
    const buffer = await blob.arrayBuffer();
    const data = await window.cueai.transcribe({
      data: buffer,
      mime,
      label: who,
      prompt,
      workflow: "interview",
    });
    if (data.error) throw new TranscribeError(data.error, data.status ?? 0, data.retryAfter);
    if (data.retry && data.message) throw new TranscribeError(data.message, 422);
    if (!data.text?.trim()) return null;
    return { who: data.who || who, text: data.text.trim(), uncertain: Boolean(data.uncertain) };
  }

  const body = new FormData();
  const ext = mime.includes("wav") ? "wav" : mime.includes("ogg") ? "ogg" : "webm";
  body.append("audio", blob, `listen.${ext}`);
  body.append("label", who);
  body.append("workflow", "interview");
  if (prompt) body.append("prompt", prompt);
  const { deviceAuthHeaders } = await import("../../../shared/device-auth-headers");
  let res: Response;
  try {
    res = await fetch(`${apiBase.replace(/\/$/, "")}/api/transcribe`, {
      method: "POST",
      headers: await deviceAuthHeaders(),
      body,
      signal: AbortSignal.timeout(FETCH_TRANSCRIBE_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new TranscribeError(
      timedOut ? "Transcription timed out." : "Unable to reach the transcription service.",
      timedOut ? 504 : 0,
    );
  }
  let data: {
    text?: string;
    who?: string;
    error?: string;
    uncertain?: boolean;
    retry?: boolean;
    message?: string;
  } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    if (res.ok) throw new TranscribeError("Transcription returned an unreadable response.", 502);
  }
  if (!res.ok) {
    throw new TranscribeError(
      data.error || "Unable to transcribe audio.",
      res.status,
      Number(res.headers.get("retry-after")) || undefined,
    );
  }
  if (data.retry && data.message) throw new TranscribeError(data.message, 422);
  if (!data.text?.trim()) return null;
  return { who: data.who || who, text: data.text.trim(), uncertain: Boolean(data.uncertain) };
}
