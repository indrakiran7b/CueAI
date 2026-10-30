/**
 * Renderer-side audio capture — delegates session state to AudioSessionManager.
 *
 * Mic + system audio → PCM ring buffer → VAD segments → 16 kHz mono WAV → /api/transcribe.
 * Each lane numbers its segments; results carry that sequence number so the utterance
 * assembler can re-order them. Long speech is split at natural pauses so text arrives
 * while the speaker is still talking.
 */

import {
  clearAudioError,
  emitLevelsThrottled,
  endMicStart,
  endSystemStart,
  humanizeFetchError,
  resetAudioSessionState,
  setMicError,
  setSystemError,
  setMicLevel,
  setMicState,
  setSystemLevel,
  setSystemState,
  subscribeAudioSession,
  tryBeginMicStart,
  tryBeginSystemStart,
  type AudioSessionSnapshot,
} from "./audio-session-manager";
import { mixToMono, prepareGroqWav, PcmRingBuffer, rmsLevel } from "./audio-pcm";
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
} from "../../../shared/speech-capture";

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

type LevelTap = {
  ctx: AudioContext;
  analyser: AnalyserNode;
  source: MediaStreamAudioSourceNode;
  raf: number;
};

type HeldBurst = { startAbs: number; endAbs: number; startedPerf: number; timer: number };

type PcmLane = {
  who: "You" | "System";
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
const FETCH_TRANSCRIBE_TIMEOUT_MS = 15_000;

let micStream: MediaStream | null = null;
let systemStream: MediaStream | null = null;
let micTap: LevelTap | null = null;
let systemTap: LevelTap | null = null;
let micPcm: PcmLane | null = null;
let systemPcm: PcmLane | null = null;
let liveConfig: LiveTranscribeConfig | null = null;
let micStartPromise: Promise<void> | null = null;
let systemStartPromise: Promise<void> | null = null;
let lastMicLevelLog = 0;
let lastSystemLevelLog = 0;
let healthTimer: number | null = null;
let micWanted = false;
let systemWanted = false;
let micRecoverTimer: number | null = null;
let systemRecoverTimer: number | null = null;
let deviceChangeBound = false;
let lifecycleBound = false;
let permissionWatchBound = false;
let sharedAudioCtx: AudioContext | null = null;
let systemSourceFn: (() => Promise<string | null>) | null = null;
let micRecoverAttempts = 0;
let systemRecoverAttempts = 0;

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

function readLevel(analyser: AnalyserNode) {
  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i]! - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / data.length) * 4);
}

function liveAudioTrack(stream: MediaStream | null) {
  return stream?.getAudioTracks().find((track) => track.readyState === "live") ?? null;
}

function streamAlive(stream: MediaStream | null) {
  return Boolean(stream?.active && liveAudioTrack(stream));
}

function captureRunning(kind: "mic" | "system") {
  return kind === "mic" ? Boolean(micPcm) : Boolean(systemPcm);
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

function laneFor(who: string): PcmLane | null {
  return who === "You" ? micPcm : systemPcm;
}

function refreshLaneState(who: string) {
  const lane = laneFor(who);
  const next = lane && lane.inFlight > 0 ? "processing" : "listening";
  if (who === "You") {
    if (streamAlive(micStream) && captureRunning("mic")) setMicState(next);
    else if (micWanted && !streamAlive(micStream)) setMicState("error");
  } else if (streamAlive(systemStream) && captureRunning("system")) {
    setSystemState(next);
  } else if (systemWanted && !streamAlive(systemStream)) {
    setSystemState("error");
  }
}

function buildPrompt(who: string): string {
  const vocab = liveConfig?.getVocabulary?.().trim() || "";
  const recent = laneContext[who]?.slice(-PROMPT_CONTEXT_CHARS) || "";
  return [vocab, recent].filter(Boolean).join(" ").slice(-400);
}

function enqueueSegment(lane: PcmLane, wav: Blob, audioEndAt: number, final: boolean) {
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
    if (job.who === "You") setMicError(msg);
    else setSystemError(msg);
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

function msToSamples(lane: PcmLane, ms: number) {
  return Math.floor((ms / 1000) * lane.ring.sampleRate);
}

function emitRange(lane: PcmLane, startAbs: number, endAbs: number, final: boolean, reason: string) {
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

function clearHeld(lane: PcmLane) {
  if (lane.held) window.clearTimeout(lane.held.timer);
  lane.held = null;
}

function flushHeld(lane: PcmLane, reason: string) {
  const held = lane.held;
  if (!held) return;
  clearHeld(lane);
  emitRange(lane, held.startAbs, held.endAbs, true, reason);
}

/** End of a speech run: send the remaining audio as the final segment of the run. */
function finalizeSpeech(lane: PcmLane, reason: string) {
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

function voiceThresholds(lane: PcmLane) {
  const enter = Math.min(0.08, Math.max(VOICE_THRESHOLD, lane.noiseFloor * 2.5));
  const stay = Math.min(enter, Math.max(VOICE_HANGOVER_THRESHOLD, lane.noiseFloor * 1.6));
  return { enter, stay };
}

function trackNoiseFloor(lane: PcmLane, level: number) {
  lane.windowMin = Math.min(lane.windowMin, level);
  lane.windowChunks += 1;
  if (lane.windowChunks >= NOISE_WINDOW_CHUNKS) {
    lane.noiseFloor = lane.noiseFloor * 0.7 + lane.windowMin * 0.3;
    lane.windowMin = Number.POSITIVE_INFINITY;
    lane.windowChunks = 0;
  }
}

function onPcmChunk(lane: PcmLane, mono: Float32Array) {
  lane.ring.push(mono);
  const level = rmsLevel(mono);
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

function startPcmSlicer(stream: MediaStream, who: "You" | "System"): PcmLane | null {
  const ctx = getSharedAudioContext();
  const audioTracks = stream.getAudioTracks();
  if (!audioTracks.length) return null;
  const audioOnly = new MediaStream(audioTracks);
  const source = ctx.createMediaStreamSource(audioOnly);
  const processor = ctx.createScriptProcessor(2048, 2, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;
  const lane: PcmLane = {
    who,
    source,
    processor,
    mute,
    ring: new PcmRingBuffer(ctx.sampleRate, 24),
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
  };
  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer;
    const channels: Float32Array[] = [];
    for (let c = 0; c < input.numberOfChannels; c++) channels.push(input.getChannelData(c));
    onPcmChunk(lane, mixToMono(channels));
  };
  source.connect(processor);
  processor.connect(mute);
  mute.connect(ctx.createMediaStreamDestination());
  return lane;
}

function releasePcm(lane: PcmLane | null) {
  if (!lane) return;
  clearHeld(lane);
  lane.processor.onaudioprocess = null;
  try {
    lane.source.disconnect();
    lane.processor.disconnect();
    lane.mute.disconnect();
  } catch {
    /* ignore */
  }
  lane.ring.clear();
}

function getSharedAudioContext() {
  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    sharedAudioCtx = new AudioContext();
  }
  return sharedAudioCtx;
}

async function closeSharedAudioContextIfIdle() {
  if (micTap || systemTap) return;
  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    sharedAudioCtx = null;
    return;
  }
  try {
    await sharedAudioCtx.close();
  } catch {
    /* ignore */
  }
  sharedAudioCtx = null;
}

function bindDeviceWatch() {
  if (deviceChangeBound || !navigator.mediaDevices?.addEventListener) return;
  deviceChangeBound = true;
  navigator.mediaDevices.addEventListener("devicechange", () => {
    console.log("[Audio] Device list changed");
    if (micWanted) scheduleMicRecover("devicechange");
    if (systemWanted) scheduleSystemRecover("devicechange");
  });
}

function bindLifecycleWatch() {
  if (lifecycleBound) return;
  lifecycleBound = true;
  document.addEventListener("visibilitychange", () => {
    void resumeCaptureGraph("visibilitychange");
  });
  window.addEventListener("focus", () => {
    void resumeCaptureGraph("focus");
  });
  window.cueai?.onVisibility?.((visible) => {
    void resumeCaptureGraph(visible ? "overlay shown" : "overlay hidden");
  });
}

function bindPermissionWatch() {
  if (permissionWatchBound || !navigator.permissions?.query) return;
  permissionWatchBound = true;
  void navigator.permissions
    .query({ name: "microphone" as PermissionName })
    .then((status) => {
      console.log("[Audio] Microphone permission:", status.state);
      status.onchange = () => {
        console.log("[Audio] Microphone permission:", status.state);
        if (status.state === "denied") {
          setMicState("error");
          setMicError(
            "Microphone access is off. Enable CueAI in System Settings → Privacy & Security → Microphone.",
          );
          void releaseMicCapture();
          return;
        }
        if (status.state === "granted" && micWanted) {
          micRecoverAttempts = 0;
          scheduleMicRecover("permission granted");
        }
      };
    })
    .catch(() => undefined);
}

async function resumeCaptureGraph(reason: string) {
  if (sharedAudioCtx?.state === "suspended") {
    await sharedAudioCtx.resume().catch(() => undefined);
    console.log("[Audio] AudioContext state:", sharedAudioCtx.state);
  }
  if (micWanted && (!streamAlive(micStream) || !captureRunning("mic"))) {
    scheduleMicRecover(reason);
  }
  if (systemWanted && (!streamAlive(systemStream) || !captureRunning("system"))) {
    scheduleSystemRecover(reason);
  }
}

function scheduleMicRecover(reason: string) {
  if (!micWanted) return;
  if (micRecoverAttempts >= 8) {
    console.log("[Audio] Microphone recover stopped:", reason);
    return;
  }
  if (micRecoverTimer != null) window.clearTimeout(micRecoverTimer);
  micRecoverTimer = window.setTimeout(() => {
    micRecoverTimer = null;
    void recoverMicrophone(reason);
  }, 450);
}

function scheduleSystemRecover(reason: string) {
  if (!systemWanted || !systemSourceFn) return;
  if (systemRecoverAttempts >= 8) {
    console.log("[Audio] System audio recover stopped:", reason);
    return;
  }
  if (systemRecoverTimer != null) window.clearTimeout(systemRecoverTimer);
  systemRecoverTimer = window.setTimeout(() => {
    systemRecoverTimer = null;
    void recoverSystemAudio(reason);
  }, 450);
}

async function recoverMicrophone(reason: string) {
  if (!micWanted) return;
  micRecoverAttempts += 1;
  console.log("[Audio] Reinitializing microphone:", reason);
  await releaseMicCapture();
  try {
    await startMicListenInternal();
    micRecoverAttempts = 0;
  } catch (err) {
    console.log("[Audio] Microphone recover failed:", err instanceof Error ? err.message : err);
  }
}

async function recoverSystemAudio(reason: string) {
  if (!systemWanted || !systemSourceFn) return;
  systemRecoverAttempts += 1;
  console.log("[Audio] Reinitializing system audio:", reason);
  await releaseSystemCapture();
  try {
    await startSystemAudioListenInternal(systemSourceFn);
    systemRecoverAttempts = 0;
  } catch (err) {
    console.log("[Audio] System audio recover failed:", err instanceof Error ? err.message : err);
  }
}

async function releaseMicCapture() {
  releasePcm(micPcm);
  micPcm = null;
  releaseTap(micTap);
  micTap = null;
  stopStream(micStream);
  micStream = null;
  setMicLevel(0);
  await closeSharedAudioContextIfIdle();
}

async function releaseSystemCapture() {
  releasePcm(systemPcm);
  systemPcm = null;
  releaseTap(systemTap);
  systemTap = null;
  stopStream(systemStream);
  systemStream = null;
  setSystemLevel(0);
  await closeSharedAudioContextIfIdle();
}

async function ensureMicrophonePermission() {
  const api = window.cueai;
  if (!api?.getPermissions || !api.requestPermission) return;
  const current = await api.getPermissions();
  console.log("[Audio] Microphone permission:", current.microphone.state);
  if (current.microphone.state === "granted") return;
  if (current.microphone.state === "denied" || current.microphone.state === "restricted") {
    throw new Error(current.microphone.message);
  }
  const next = await api.requestPermission("microphone");
  console.log("[Audio] Microphone permission:", next.state);
  if (next.state === "denied" || next.state === "restricted") {
    throw new Error(next.message);
  }
}

function attachMicTrackWatch(track: MediaStreamTrack) {
  track.addEventListener("ended", () => {
    console.log("[Audio] Microphone track ended");
    setMicState("error");
    setMicError("Microphone disconnected.");
    if (micWanted) scheduleMicRecover("track ended");
  });
}

function ensureHealthWatch() {
  if (healthTimer != null) return;
  healthTimer = window.setInterval(() => {
    if (micWanted && (!streamAlive(micStream) || !captureRunning("mic"))) {
      console.log("[Audio] Microphone stream ended");
      setMicState("error");
      setMicError("Microphone stream ended.");
      scheduleMicRecover("dead stream");
    }
    if (systemWanted && (!streamAlive(systemStream) || !captureRunning("system"))) {
      console.log("[Audio] System audio stream ended");
      setSystemState("error");
      setSystemError("System audio stream ended.");
      scheduleSystemRecover("dead stream");
    }
    if (!micWanted && !systemWanted && !micStream && !systemStream && healthTimer != null) {
      window.clearInterval(healthTimer);
      healthTimer = null;
    }
  }, 2000);
}

function attachTap(stream: MediaStream, kind: "mic" | "system"): LevelTap {
  const ctx = getSharedAudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  const tap: LevelTap = { ctx, analyser, source, raf: 0 };
  const tick = () => {
    const level = readLevel(analyser);
    if (kind === "mic") {
      setMicLevel(level);
      if (level > 0.02 && Date.now() - lastMicLevelLog > 1500) {
        lastMicLevelLog = Date.now();
        console.log("[Audio] Microphone capture active");
      }
    } else {
      setSystemLevel(level);
      if (level > 0.02 && Date.now() - lastSystemLevelLog > 1500) {
        lastSystemLevelLog = Date.now();
        console.log("[Audio] System audio capture active");
      }
    }
    emitLevelsThrottled(125);
    tap.raf = requestAnimationFrame(tick);
  };
  tap.raf = requestAnimationFrame(tick);
  if (ctx.state === "suspended") void ctx.resume();
  return tap;
}

function releaseTap(tap: LevelTap | null) {
  if (!tap) return;
  cancelAnimationFrame(tap.raf);
  try {
    tap.source.disconnect();
  } catch {
    /* ignore */
  }
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

export function subscribeListenLevels(cb: (state: ListenActiveState) => void) {
  return subscribeAudioSession(cb);
}

async function startMicListenInternal(): Promise<void> {
  if (micStream && streamAlive(micStream) && captureRunning("mic")) return;
  if (!tryBeginMicStart()) {
    if (micStartPromise) await micStartPromise;
    return;
  }

  micStartPromise = (async () => {
    let ok = false;
    try {
      setMicState("connecting");
      bindDeviceWatch();
      bindLifecycleWatch();
      bindPermissionWatch();
      await ensureMicrophonePermission();
      if (!micWanted) {
        setMicState("idle");
        ok = true;
        return;
      }
      if (micStream) await releaseMicCapture();
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      } catch {
        console.log("[Audio] Microphone constraint fallback");
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }
      if (!micWanted) {
        await releaseMicCapture();
        setMicState("idle");
        ok = true;
        return;
      }
      console.log("[Audio] Microphone stream started");
      const tracks = micStream.getAudioTracks();
      console.log("[Audio] Audio tracks:", tracks.length);
      const liveTrack = liveAudioTrack(micStream);
      if (!micStream.active || !liveTrack) {
        throw new Error("Microphone stream failed to start.");
      }
      if (!liveTrack.enabled) liveTrack.enabled = true;
      attachMicTrackWatch(liveTrack);
      micTap = attachTap(micStream, "mic");
      if (micTap.ctx.state === "suspended") {
        await micTap.ctx.resume().catch(() => undefined);
      }
      console.log("[Audio] AudioContext state:", micTap.ctx.state);
      micPcm = startPcmSlicer(micStream, "You");
      if (!micPcm) throw new Error("Microphone recorder unavailable");
      if (micTap.ctx.state !== "running") {
        await micTap.ctx.resume().catch(() => undefined);
      }
      if (micTap.ctx.state !== "running" || !streamAlive(micStream) || !captureRunning("mic")) {
        throw new Error("Microphone stream failed to start.");
      }
      micRecoverAttempts = 0;
      setMicState("listening");
      console.log("[Audio] Microphone capture active");
      setMicError(null);
      ensureHealthWatch();
      ok = true;
    } catch (err) {
      const msg = humanizeFetchError(err);
      setMicError(msg);
      setMicState("error");
      await releaseMicCapture();
      throw err;
    } finally {
      endMicStart(ok);
      micStartPromise = null;
    }
  })();

  await micStartPromise;
}

export async function startMicListen(): Promise<void> {
  micWanted = true;
  return startMicListenInternal();
}

export async function stopMicListen(): Promise<Blob | null> {
  micWanted = false;
  micRecoverAttempts = 0;
  if (micRecoverTimer != null) {
    window.clearTimeout(micRecoverTimer);
    micRecoverTimer = null;
  }
  setMicState("stopping");
  await releaseMicCapture();
  setMicState("idle");
  return null;
}

async function startSystemAudioListenInternal(
  getSourceId: () => Promise<string | null>
): Promise<void> {
  systemSourceFn = getSourceId;
  if (systemStream && streamAlive(systemStream) && captureRunning("system")) return;
  if (!tryBeginSystemStart()) {
    if (systemStartPromise) await systemStartPromise;
    return;
  }

  systemStartPromise = (async () => {
    let ok = false;
    try {
      setSystemState("connecting");
      bindDeviceWatch();
      bindLifecycleWatch();
      if (window.cueai?.getPermissions && window.cueai.requestPermission) {
        const current = await window.cueai.getPermissions();
        console.log("[Audio] System audio permission:", current.systemAudio.state);
        if (current.systemAudio.state === "denied" || current.systemAudio.state === "restricted") {
          throw new Error(current.systemAudio.message);
        }
        if (current.systemAudio.state !== "granted") {
          const permission = await window.cueai.requestPermission("systemAudio");
          console.log("[Audio] System audio permission:", permission.state);
          if (permission.state === "denied" || permission.state === "restricted") {
            throw new Error(permission.message);
          }
        }
      }
      if (!systemWanted) {
        setSystemState("idle");
        ok = true;
        return;
      }
      const sourceId = await getSourceId();
      if (!sourceId) {
        throw new Error(
          "System audio is not available. Grant Screen Recording in System Settings, then try again."
        );
      }

      if (systemStream) await releaseSystemCapture();

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

      systemStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (!systemWanted) {
        await releaseSystemCapture();
        setSystemState("idle");
        ok = true;
        return;
      }
      systemStream.getVideoTracks().forEach((t) => {
        t.enabled = false;
      });
      console.log("[Audio] System audio stream started");
      console.log("[Audio] System audio tracks:", systemStream.getAudioTracks().length);
      const liveTrack = liveAudioTrack(systemStream);
      if (!systemStream.active || !liveTrack) {
        await releaseSystemCapture();
        throw new Error("System audio capture is unavailable on this device.");
      }
      liveTrack.addEventListener("ended", () => {
        console.log("[Audio] System audio track ended");
        setSystemState("error");
        setSystemError("System audio stream ended.");
        if (systemWanted) scheduleSystemRecover("track ended");
      });
      systemTap = attachTap(systemStream, "system");
      if (systemTap.ctx.state === "suspended") {
        await systemTap.ctx.resume().catch(() => undefined);
      }
      console.log("[Audio] AudioContext state:", systemTap.ctx.state);
      systemPcm = startPcmSlicer(systemStream, "System");
      if (!systemPcm) throw new Error("System audio recorder unavailable");
      if (systemTap.ctx.state !== "running") {
        await systemTap.ctx.resume().catch(() => undefined);
      }
      if (systemTap.ctx.state !== "running" || !streamAlive(systemStream) || !captureRunning("system")) {
        throw new Error("System audio capture is unavailable on this device.");
      }
      systemRecoverAttempts = 0;
      setSystemState("listening");
      console.log("[Audio] System audio capture active");
      setSystemError(null);
      ensureHealthWatch();
      ok = true;
    } catch (err) {
      const msg = humanizeFetchError(err);
      setSystemError(msg);
      setSystemState("error");
      await releaseSystemCapture();
      throw err;
    } finally {
      endSystemStart(ok);
      systemStartPromise = null;
    }
  })();

  await systemStartPromise;
}

export async function startSystemAudioListen(
  getSourceId: () => Promise<string | null>
): Promise<void> {
  systemWanted = true;
  systemSourceFn = getSourceId;
  return startSystemAudioListenInternal(getSourceId);
}

export async function stopSystemAudioListen(): Promise<Blob | null> {
  systemWanted = false;
  systemRecoverAttempts = 0;
  if (systemRecoverTimer != null) {
    window.clearTimeout(systemRecoverTimer);
    systemRecoverTimer = null;
  }
  setSystemState("stopping");
  await releaseSystemCapture();
  setSystemState("idle");
  return null;
}

export async function syncListenSources(opts: {
  mic: boolean;
  systemAudio: boolean;
  getDesktopSourceId: () => Promise<string | null>;
}): Promise<{ micBlob: Blob | null; systemBlob: Blob | null }> {
  micWanted = opts.mic;
  systemWanted = opts.systemAudio;
  bindDeviceWatch();
  let micBlob: Blob | null = null;
  let systemBlob: Blob | null = null;

  if (opts.mic) {
    if (!streamAlive(micStream) || !captureRunning("mic")) {
      try {
        await startMicListen();
      } catch (err) {
        console.log("[Audio] Microphone start failed:", err instanceof Error ? err.message : err);
      }
    }
  } else {
    micBlob = await stopMicListen();
  }

  if (opts.systemAudio) {
    if (!streamAlive(systemStream) || !captureRunning("system")) {
      try {
        await startSystemAudioListen(opts.getDesktopSourceId);
      } catch (err) {
        console.log("[Audio] System audio start failed:", err instanceof Error ? err.message : err);
      }
    }
  } else {
    systemBlob = await stopSystemAudioListen();
  }

  return { micBlob, systemBlob };
}

export async function stopAllListen(): Promise<{
  micBlob: Blob | null;
  systemBlob: Blob | null;
}> {
  micWanted = false;
  systemWanted = false;
  micRecoverAttempts = 0;
  systemRecoverAttempts = 0;
  if (micRecoverTimer != null) {
    window.clearTimeout(micRecoverTimer);
    micRecoverTimer = null;
  }
  if (systemRecoverTimer != null) {
    window.clearTimeout(systemRecoverTimer);
    systemRecoverTimer = null;
  }
  const micBlob = micStream ? await stopMicListen() : null;
  const systemBlob = systemStream ? await stopSystemAudioListen() : null;
  resetAudioSessionState();
  return { micBlob, systemBlob };
}

export async function transcribeAudioBlob(
  blob: Blob,
  who: string,
  apiBase = "http://127.0.0.1:3002",
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
  const ext = mime.includes("wav")
    ? "wav"
    : mime.includes("ogg")
      ? "ogg"
      : mime.includes("mp4")
        ? "m4a"
        : "webm";
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
