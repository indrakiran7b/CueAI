/**
 * Continuous mic + system loopback capture → LivePipeline
 * (audio-clock VAD segments → ordered Groq Whisper queue → turn detector).
 *
 * Streams stay open while Mic/System are ON. Each source is its own lane and is
 * never substituted for the other. Capture survives answers, stalls, ended
 * tracks and device changes (bounded automatic recovery).
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
import { mixToMono } from "./audio-pcm";
import { pipelineLog } from "./pipeline-log";
import { LivePipeline, type LaneHandle, type LaneName, type PipelineTranscript, type SegmentTiming } from "./live-pipeline";
import type { FinalUtterance, TurnDebug } from "./turn-detector";
import { TranscribeError, type TranscribeJob } from "./transcription-queue";

export type ListenActiveState = AudioSessionSnapshot;

export type LiveTranscribeConfig = {
  apiBase: string;
  onResult: (line: {
    who: string;
    text: string;
    audioEndAt?: number;
    transcribedAt?: number;
    transcribeStartedAt?: number;
    partial?: boolean;
    uncertain?: boolean;
  }) => void;
  onError: (msg: string) => void;
  /** A finished turn (question boundary) on a lane. */
  onUtterance?: (u: FinalUtterance) => void;
  /** Text of the turn still being spoken (null when it ends). */
  onPending?: (who: LaneName, text: string | null) => void;
  onDrop?: (who: LaneName, text: string, reason: string) => void;
  onSegmentTiming?: (t: SegmentTiming) => void;
  onDebug?: (d: TurnDebug | { lane: string; action: string; reason: string }) => void;
  /** Informational capture status (e.g. "System audio is silent"); null clears. */
  onCaptureNotice?: (msg: string | null) => void;
};

type CaptureLane = {
  who: LaneName;
  kind: "mic" | "system";
  stream: MediaStream;
  ctx: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  mute: GainNode;
  handle: LaneHandle;
  startedAt: number;
  lastChunkAt: number;
  lastVoiceAt: number;
  silentNoticeShown: boolean;
  trackHandlers: { track: MediaStreamTrack; type: string; fn: () => void }[];
};

const MIN_WAV_BYTES = 1600;
const WATCHDOG_MS = 1000;
const STALL_MS = 2500;
const SILENT_NOTICE_MS = 20_000;
const MAX_RECOVERY = 3;

function envNumber(name: string): number | undefined {
  const raw = (import.meta as { env?: Record<string, string | undefined> }).env?.[name];
  const n = Number(raw);
  return raw != null && raw !== "" && Number.isFinite(n) ? n : undefined;
}

function envFlag(name: string, fallback: boolean) {
  const raw = (import.meta as { env?: Record<string, string | undefined> }).env?.[name];
  if (raw == null || raw === "") return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

let micStream: MediaStream | null = null;
let systemStream: MediaStream | null = null;
let micLane: CaptureLane | null = null;
let systemLane: CaptureLane | null = null;
let liveConfig: LiveTranscribeConfig | null = null;
let micStartPromise: Promise<void> | null = null;
let systemStartPromise: Promise<void> | null = null;
let pipeline: LivePipeline | null = null;
let watchdog: number | null = null;
let systemSourceGetter: (() => Promise<string | null>) | null = null;
const wanted = { mic: false, system: false };
const recoveries = { mic: 0, system: 0 };
let deviceChangeBound = false;

function getPipeline(): LivePipeline {
  if (pipeline) return pipeline;
  pipeline = new LivePipeline({
    partials: envFlag("VITE_PARTIAL_TRANSCRIPTS", true),
    segmenter: compact({
      segmentSilenceMs: envNumber("VITE_SEGMENT_SILENCE_MS"),
      prefixMs: envNumber("VITE_SPEECH_PREFIX_MS"),
      postRollMs: envNumber("VITE_SPEECH_POST_ROLL_MS"),
    }),
    turn: compact({
      completeSilenceMs: envNumber("VITE_TURN_COMPLETE_SILENCE_MS"),
      softSilenceMs: envNumber("VITE_TURN_SOFT_SILENCE_MS"),
      neutralSilenceMs: envNumber("VITE_TURN_NEUTRAL_SILENCE_MS"),
      incompleteSilenceMs: envNumber("VITE_TURN_INCOMPLETE_SILENCE_MS"),
    }),
    transcribe: (job, signal) => transcribeJob(job, signal),
    onTranscript: (line) => deliverTranscript(line),
    onUtterance: (u) => liveConfig?.onUtterance?.(u),
    onPending: (who, text) => liveConfig?.onPending?.(who, text),
    onDrop: (who, text, reason) => liveConfig?.onDrop?.(who, text, reason),
    onSegmentTiming: (t) => {
      pipelineLog("transcription", t.ok ? "Segment transcribed" : "Segment failed", {
        who: t.who,
        kind: t.kind,
        audio_ms: t.audioMs,
        queue_ms: t.queueMs,
        transcribe_ms: t.transcribeMs,
        attempts: t.attempts,
        error: t.error,
      });
      liveConfig?.onSegmentTiming?.(t);
    },
    onTranscribeError: (_who, message) => {
      const msg = humanizeFetchError(new Error(message));
      setAudioError(msg);
      liveConfig?.onError(msg);
    },
    onDebug: (d) => liveConfig?.onDebug?.(d),
  });
  return pipeline;
}

// Remove undefined overrides so module defaults apply.
function compact<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function deliverTranscript(line: PipelineTranscript) {
  if (!line.partial) clearAudioError();
  liveConfig?.onResult({
    who: line.who,
    text: line.text,
    audioEndAt: line.lastVoiceAt,
    transcribeStartedAt: line.timing.startedAt,
    transcribedAt: line.timing.finishedAt,
    partial: line.partial,
    uncertain: line.uncertain,
  });
}

async function transcribeJob(job: TranscribeJob, signal: AbortSignal) {
  const lane = job.lane === "You" ? "mic" : "system";
  if (job.kind !== "partial") (lane === "mic" ? setMicState : setSystemState)("processing");
  try {
    const res = await transcribeAudioBlob(job.wav, job.lane, liveConfig?.apiBase, {
      prompt: job.prompt,
      signal,
    });
    return { text: res?.text || "", uncertain: res?.uncertain };
  } finally {
    const stream = lane === "mic" ? micStream : systemStream;
    if (stream) (lane === "mic" ? setMicState : setSystemState)("listening");
  }
}

export function configureLiveTranscription(config: LiveTranscribeConfig | null) {
  liveConfig = config;
}

/** Forget pending speech/transcripts (new session). Capture keeps running. */
export function resetLivePipeline() {
  pipeline?.reset();
}

export function isLivePipelineBusy() {
  return Boolean(pipeline?.busy());
}

export function getListenActive(): { mic: boolean; systemAudio: boolean } {
  return {
    mic: Boolean(micStream?.getAudioTracks().some((t) => t.readyState === "live")),
    systemAudio: Boolean(systemStream?.getAudioTracks().some((t) => t.readyState === "live")),
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
    return kind === "mic" ? "No microphone device found." : "No system audio / loopback device found.";
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

function describeTracks(stream: MediaStream) {
  return stream
    .getAudioTracks()
    .map((t) => `${t.readyState}${t.enabled ? "" : ":disabled"}${t.muted ? ":muted" : ""}`)
    .join(",");
}

function attachLane(stream: MediaStream, who: LaneName, kind: "mic" | "system"): CaptureLane {
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(2048, 2, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;
  const handle = getPipeline().addLane(who, ctx.sampleRate);
  const now = performance.now();
  const lane: CaptureLane = {
    who,
    kind,
    stream,
    ctx,
    source,
    processor,
    mute,
    handle,
    startedAt: now,
    lastChunkAt: now,
    lastVoiceAt: 0,
    silentNoticeShown: false,
    trackHandlers: [],
  };

  processor.onaudioprocess = (ev) => {
    const input = ev.inputBuffer;
    const channels: Float32Array[] = [];
    for (let c = 0; c < input.numberOfChannels; c++) channels.push(input.getChannelData(c));
    const t = performance.now();
    lane.lastChunkAt = t;
    const level = handle.push(mixToMono(channels), t);
    if (handle.speaking) lane.lastVoiceAt = t;
    if (kind === "mic") setMicLevel(level);
    else setSystemLevel(level);
    emitLevelsThrottled(125);
  };

  source.connect(processor);
  processor.connect(mute);
  mute.connect(ctx.destination);
  void ctx.resume();
  pipelineLog("audio", `${kind === "mic" ? "Microphone" : "System audio"} lane attached`, {
    sample_rate: ctx.sampleRate,
    tracks: describeTracks(stream),
    ctx_state: ctx.state,
  });
  return lane;
}

function detachLane(lane: CaptureLane | null) {
  if (!lane) return;
  for (const h of lane.trackHandlers) h.track.removeEventListener(h.type, h.fn);
  lane.trackHandlers = [];
  lane.processor.onaudioprocess = null;
  try {
    lane.processor.disconnect();
    lane.source.disconnect();
    lane.mute.disconnect();
  } catch {
    /* already disconnected */
  }
  void lane.ctx.close().catch(() => undefined);
  pipeline?.removeLane(lane.who, performance.now());
}

function wireTracks(lane: CaptureLane) {
  for (const track of lane.stream.getAudioTracks()) {
    const onEnded = () => {
      pipelineLog("audio", "Audio track ended", { who: lane.who });
      void recoverLane(lane.kind, "track_ended");
    };
    const onMute = () => {
      pipelineLog("audio", "Audio track muted", { who: lane.who });
      liveConfig?.onCaptureNotice?.(
        lane.kind === "mic" ? "Microphone is muted by the system." : "System audio track is muted.",
      );
    };
    const onUnmute = () => {
      pipelineLog("audio", "Audio track unmuted", { who: lane.who });
      liveConfig?.onCaptureNotice?.(null);
    };
    for (const [type, fn] of [["ended", onEnded], ["mute", onMute], ["unmute", onUnmute]] as const) {
      track.addEventListener(type, fn);
      lane.trackHandlers.push({ track, type, fn });
    }
  }
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Keeps capture alive across the whole session; never touches answer state. */
function ensureWatchdog() {
  if (watchdog != null) return;
  watchdog = window.setInterval(() => {
    const now = performance.now();
    pipeline?.tick(now);
    for (const lane of [micLane, systemLane]) {
      if (!lane) continue;
      if (lane.ctx.state === "suspended") {
        pipelineLog("audio", "AudioContext suspended — resuming", { who: lane.who });
        void lane.ctx.resume();
      }
      if (now - lane.lastChunkAt > STALL_MS) {
        pipelineLog("audio", "Audio callbacks stalled — restarting lane", {
          who: lane.who,
          stalled_ms: Math.round(now - lane.lastChunkAt),
          tracks: describeTracks(lane.stream),
        });
        lane.lastChunkAt = now;
        void recoverLane(lane.kind, "stalled");
      }
      if (
        lane.kind === "system" &&
        !lane.silentNoticeShown &&
        !lane.lastVoiceAt &&
        now - lane.startedAt > SILENT_NOTICE_MS
      ) {
        lane.silentNoticeShown = true;
        pipelineLog("audio", "System audio silent since start", { who: lane.who });
        liveConfig?.onCaptureNotice?.(
          "System audio is silent — check that the meeting plays through this computer's default output.",
        );
      }
      if (lane.kind === "system" && lane.silentNoticeShown && lane.lastVoiceAt) {
        lane.silentNoticeShown = false;
        liveConfig?.onCaptureNotice?.(null);
      }
    }
    if (!micLane && !systemLane && !pipeline?.busy()) {
      window.clearInterval(watchdog!);
      watchdog = null;
    }
  }, WATCHDOG_MS);
}

function bindDeviceChange() {
  if (deviceChangeBound || !navigator.mediaDevices?.addEventListener) return;
  deviceChangeBound = true;
  navigator.mediaDevices.addEventListener("devicechange", () => {
    const micDead = micStream && !micStream.getAudioTracks().some((t) => t.readyState === "live");
    pipelineLog("audio", "Audio devices changed", { mic_live: !micDead });
    if (wanted.mic && micDead) void recoverLane("mic", "device_change");
  });
}

async function recoverLane(kind: "mic" | "system", reason: string) {
  if (!(kind === "mic" ? wanted.mic : wanted.system)) return;
  if (recoveries[kind] >= MAX_RECOVERY) {
    const msg = kind === "mic" ? "Microphone disconnected." : "System audio disconnected.";
    setAudioError(msg);
    (kind === "mic" ? setMicState : setSystemState)("error");
    liveConfig?.onError(msg);
    return;
  }
  recoveries[kind] += 1;
  const attempt = recoveries[kind];
  pipelineLog("audio", "Recovering capture", { kind, reason, attempt });
  if (kind === "mic") {
    detachLane(micLane);
    micLane = null;
    stopStream(micStream);
    micStream = null;
  } else {
    detachLane(systemLane);
    systemLane = null;
    stopStream(systemStream);
    systemStream = null;
  }
  await new Promise((r) => setTimeout(r, 400 * attempt));
  try {
    if (kind === "mic") await startMicListenInternal();
    else if (systemSourceGetter) await startSystemAudioListenInternal(systemSourceGetter);
    pipelineLog("audio", "Capture recovered", { kind, attempt });
  } catch (err) {
    pipelineLog("audio", "Capture recovery failed", {
      kind,
      attempt,
      error: err instanceof Error ? err.message.slice(0, 120) : "unknown",
    });
    if (recoveries[kind] < MAX_RECOVERY) void recoverLane(kind, "retry");
  }
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
      try {
        const perm = await navigator.permissions?.query({ name: "microphone" as PermissionName });
        pipelineLog("audio", "Microphone permission", { state: perm?.state || "unknown" });
      } catch {
        /* permissions API unavailable */
      }
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        video: false,
      });
      const tracks = micStream.getAudioTracks();
      if (!tracks.some((t) => t.readyState === "live")) throw new Error("Microphone track is not live.");
      micLane = attachLane(micStream, "You", "mic");
      wireTracks(micLane);
      setMicState("listening");
      clearAudioError();
      pipelineLog("audio", "Microphone capture started", { tracks: describeTracks(micStream) });
      ensureWatchdog();
      bindDeviceChange();
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
  wanted.mic = true;
  recoveries.mic = 0;
  return startMicListenInternal();
}

export async function stopMicListen(): Promise<Blob | null> {
  wanted.mic = false;
  setMicState("stopping");
  detachLane(micLane);
  micLane = null;
  stopStream(micStream);
  micStream = null;
  setMicLevel(0);
  setMicState("idle");
  pipelineLog("audio", "Microphone capture stopped");
  return null;
}

async function captureSystemStream(getSourceId: () => Promise<string | null>): Promise<MediaStream> {
  if (typeof navigator.mediaDevices.getDisplayMedia === "function") {
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
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
    audio: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: sourceId } },
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

async function startSystemAudioListenInternal(getSourceId: () => Promise<string | null>): Promise<void> {
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
      systemLane = attachLane(systemStream, "System", "system");
      wireTracks(systemLane);
      setSystemState("listening");
      clearAudioError();
      pipelineLog("audio", "System loopback capture started", { tracks: describeTracks(systemStream) });
      ensureWatchdog();
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

export async function startSystemAudioListen(getSourceId: () => Promise<string | null>): Promise<void> {
  wanted.system = true;
  recoveries.system = 0;
  systemSourceGetter = getSourceId;
  return startSystemAudioListenInternal(getSourceId);
}

export async function stopSystemAudioListen(): Promise<Blob | null> {
  wanted.system = false;
  setSystemState("stopping");
  detachLane(systemLane);
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
  if (opts.mic) {
    if (!getListenActive().mic) {
      try {
        await startMicListen();
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "Mic failed");
      }
    }
  } else if (micStream) {
    await stopMicListen();
  }
  if (opts.systemAudio) {
    if (!getListenActive().systemAudio) {
      try {
        await startSystemAudioListen(opts.getDesktopSourceId);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "System audio failed");
      }
    }
  } else if (systemStream) {
    await stopSystemAudioListen();
  }
  const active = getListenActive();
  if (errors.length) {
    const msg = errors.join(" · ");
    setAudioError(msg);
    throw new Error(msg);
  }
  return active;
}

export async function stopAllListen(): Promise<{ micBlob: Blob | null; systemBlob: Blob | null }> {
  const micBlob = micStream ? await stopMicListen() : null;
  const systemBlob = systemStream ? await stopSystemAudioListen() : null;
  pipeline?.reset();
  resetAudioSessionState();
  return { micBlob, systemBlob };
}

export async function transcribeAudioBlob(
  blob: Blob,
  who: string,
  apiBase = "http://127.0.0.1:3000",
  opts: { prompt?: string; signal?: AbortSignal } = {},
): Promise<{ who: string; text: string; uncertain?: boolean } | null> {
  if (!blob || blob.size < MIN_WAV_BYTES) return null;
  const mime = blob.type || "audio/wav";

  if (typeof window !== "undefined" && window.cueai?.transcribe) {
    const buffer = await blob.arrayBuffer();
    const signal = opts.signal;
    const aborted = new Promise<never>((_, reject) => {
      if (!signal) return;
      const fail = () => reject(new DOMException("Transcription aborted", "AbortError"));
      if (signal.aborted) fail();
      else signal.addEventListener("abort", fail, { once: true });
    });
    const data = await Promise.race([
      window.cueai.transcribe({ data: buffer, mime, label: who, prompt: opts.prompt }),
      aborted,
    ]);
    if (data.error) throw new TranscribeError(data.error, data.status || 0, data.retryAfterMs || 0);
    if (!data.text?.trim()) return null;
    return { who: data.who || who, text: data.text.trim(), uncertain: data.uncertain };
  }

  const body = new FormData();
  const ext = mime.includes("wav") ? "wav" : mime.includes("ogg") ? "ogg" : "webm";
  body.append("audio", blob, `listen.${ext}`);
  body.append("label", who);
  if (opts.prompt) body.append("prompt", opts.prompt.slice(0, 400));
  const { deviceAuthHeaders } = await import("./device-auth-headers");
  const res = await fetch(`${apiBase.replace(/\/$/, "")}/api/transcribe`, {
    method: "POST",
    headers: await deviceAuthHeaders(),
    body,
    signal: opts.signal,
  });
  const data = (await res.json().catch(() => ({}))) as {
    text?: string;
    who?: string;
    error?: string;
    uncertain?: boolean;
  };
  if (!res.ok) {
    const retryAfter = Number(res.headers.get("retry-after") || 0) * 1000;
    throw new TranscribeError(data.error || "Unable to transcribe audio.", res.status, retryAfter);
  }
  if (!data.text?.trim()) return null;
  return { who: data.who || who, text: data.text.trim(), uncertain: data.uncertain };
}

