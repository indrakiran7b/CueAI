/**
 * Continuous mic + system loopback → PCM ring buffer → VAD segment with
 * prefix/tail → 16 kHz mono WAV → Groq Whisper (Gemini STT fallback server-side).
 *
 * Streams stay open while Mic/System are ON. MediaRecorder is not used.
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
import { pipelineLog } from "./pipeline-log";

export type ListenActiveState = AudioSessionSnapshot;

export type LiveTranscribeConfig = {
  apiBase: string;
  onResult: (line: {
    who: string;
    text: string;
    audioEndAt?: number;
    transcribedAt?: number;
    partial?: boolean;
  }) => void;
  onError: (msg: string) => void;
};

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
  speechStartAbs: number;
  lastVoiceAt: number;
  speechStartedPerf: number | null;
  flushTimer: number | null;
  maxTimer: number | null;
  onEnded: (() => void) | null;
};

/** Voice activity threshold (post-gain RMS-ish). */
const VOICE_THRESHOLD = 0.018;
/** Keep audio before VAD fires so first words aren't lost. */
const PREFIX_MS = 850;
/** Wait after last voice before finalizing (includes natural silence tail). */
const SILENCE_END_MS = 750;
const MIN_SPEECH_MS = 400;
const MAX_SPEECH_MS = 16_000;
const MIN_WAV_BYTES = 1600;
const MAX_IN_FLIGHT = 2;

let micStream: MediaStream | null = null;
let systemStream: MediaStream | null = null;
let micLane: CaptureLane | null = null;
let systemLane: CaptureLane | null = null;
let liveConfig: LiveTranscribeConfig | null = null;
let transcribeInFlight = 0;
let micStartPromise: Promise<void> | null = null;
let systemStartPromise: Promise<void> | null = null;

export function configureLiveTranscription(config: LiveTranscribeConfig | null) {
  liveConfig = config;
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

async function maybeTranscribeWav(blob: Blob, who: string, audioEndAt: number) {
  if (!liveConfig) return;
  if (blob.size < MIN_WAV_BYTES) return;
  if (transcribeInFlight >= MAX_IN_FLIGHT) {
    pipelineLog("transcription", "Dropped segment — too many in flight", {
      who,
      bytes: blob.size,
    });
    return;
  }

  transcribeInFlight++;
  if (who === "You") setMicState("processing");
  else setSystemState("processing");
  pipelineLog("transcription", "Finalizing speech segment (WAV→Groq)", {
    who,
    bytes: blob.size,
  });

  try {
    const line = await transcribeAudioBlob(blob, who, liveConfig.apiBase);
    const transcribedAt = performance.now();
    if (line?.text) {
      // Always use the capture-lane speaker label — never trust STT "who".
      const speaker = who;
      console.log(
        speaker === "System"
          ? `[SYSTEM-AUDIO] FINAL TRANSCRIPT:\n"${line.text.trim()}"`
          : `[MIC] FINAL TRANSCRIPT:\n"${line.text.trim()}"`,
      );
      pipelineLog("transcription", "Final transcript received", {
        who: speaker,
        chars: line.text.length,
      });
      liveConfig.onResult({
        who: speaker,
        text: line.text.trim(),
        audioEndAt,
        transcribedAt,
        partial: false,
      });
    }
    clearAudioError();
  } catch (err) {
    const msg = humanizeFetchError(err);
    setAudioError(msg);
    liveConfig.onError(msg);
    pipelineLog("transcription", "Transcription failed", {
      who,
      error: msg.slice(0, 120),
    });
  } finally {
    transcribeInFlight--;
    if (who === "You" && micStream) setMicState("listening");
    else if (who === "System" && systemStream) setSystemState("listening");
  }
}

function finalizeSpeech(lane: CaptureLane, reason: string) {
  if (lane.flushTimer != null) {
    window.clearTimeout(lane.flushTimer);
    lane.flushTimer = null;
  }
  if (lane.maxTimer != null) {
    window.clearTimeout(lane.maxTimer);
    lane.maxTimer = null;
  }
  if (!lane.speechActive || lane.speechStartedPerf == null) {
    lane.speechActive = false;
    lane.speechStartedPerf = null;
    return;
  }

  const durationMs = performance.now() - lane.speechStartedPerf;
  const endAbs = lane.ring.endIndex;
  const prefixSamples = Math.floor((PREFIX_MS / 1000) * lane.ring.sampleRate);
  const startAbs = Math.max(0, lane.speechStartAbs - prefixSamples);

  lane.speechActive = false;
  lane.speechStartedPerf = null;

  if (durationMs < MIN_SPEECH_MS) {
    pipelineLog("audio", "Speech too short — discarded", { who: lane.who, reason, durationMs });
    return;
  }

  const samples = lane.ring.slice(startAbs, endAbs);
  if (samples.length < lane.ring.sampleRate * 0.25) {
    pipelineLog("audio", "Speech buffer too small — discarded", { who: lane.who, reason });
    return;
  }

  const audioEndAt = performance.now();
  const wav = prepareGroqWav(samples, lane.ring.sampleRate);
  pipelineLog("audio", "Speech segment ended", {
    who: lane.who,
    reason,
    durationMs: Math.round(durationMs),
    samples: samples.length,
    wavBytes: wav.size,
  });
  void maybeTranscribeWav(wav, lane.who, audioEndAt);
}

function onPcmChunk(lane: CaptureLane, mono: Float32Array) {
  lane.ring.push(mono);
  const level = rmsLevel(mono);
  if (lane.kind === "mic") setMicLevel(level);
  else setSystemLevel(level);
  emitLevelsThrottled(125);

  const now = performance.now();
  const voiced = level >= VOICE_THRESHOLD;

  if (voiced) {
    lane.lastVoiceAt = now;
    if (!lane.speechActive) {
      lane.speechActive = true;
      lane.speechStartedPerf = now;
      lane.speechStartAbs = lane.ring.endIndex;
      pipelineLog("audio", "Speech segment started", { who: lane.who });
      if (lane.who === "System") {
        console.log("[SYSTEM-AUDIO] Speech started");
      }
      if (lane.maxTimer != null) window.clearTimeout(lane.maxTimer);
      lane.maxTimer = window.setTimeout(() => {
        finalizeSpeech(lane, "max_duration");
      }, MAX_SPEECH_MS);
    }
    if (lane.flushTimer != null) {
      window.clearTimeout(lane.flushTimer);
      lane.flushTimer = null;
    }
  } else if (lane.speechActive) {
    const silentFor = now - lane.lastVoiceAt;
    if (silentFor >= SILENCE_END_MS && lane.flushTimer == null) {
      lane.flushTimer = window.setTimeout(() => {
        lane.flushTimer = null;
        finalizeSpeech(lane, "silence");
      }, 16);
    }
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
  const processor = ctx.createScriptProcessor(4096, 2, 1);
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
    lastVoiceAt: 0,
    speechStartedPerf: null,
    flushTimer: null,
    maxTimer: null,
    onEnded: null,
  };

  processor.onaudioprocess = (ev) => {
    const input = ev.inputBuffer;
    const channels: Float32Array[] = [];
    for (let c = 0; c < input.numberOfChannels; c++) {
      channels.push(input.getChannelData(c));
    }
    const mono = mixToMono(channels);
    onPcmChunk(lane, mono);
  };

  source.connect(processor);
  processor.connect(mute);
  mute.connect(ctx.destination);
  void ctx.resume();
  return lane;
}

function tearDownLane(lane: CaptureLane | null) {
  if (!lane) return;
  if (lane.flushTimer != null) window.clearTimeout(lane.flushTimer);
  if (lane.maxTimer != null) window.clearTimeout(lane.maxTimer);
  if (lane.onEnded) {
    lane.stream.getTracks().forEach((t) => t.removeEventListener("ended", lane.onEnded!));
  }
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
      setMicState("listening");
      clearAudioError();
      pipelineLog("audio", "Microphone capture started (continuous PCM)");
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
  if (micLane?.speechActive) finalizeSpeech(micLane, "stop");
  tearDownLane(micLane);
  micLane = null;
  stopStream(micStream);
  micStream = null;
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
      pipelineLog("audio", "System loopback capture started (continuous PCM)");
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
  if (systemLane?.speechActive) finalizeSpeech(systemLane, "stop");
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

export async function stopAllListen(): Promise<{
  micBlob: Blob | null;
  systemBlob: Blob | null;
}> {
  const micBlob = micStream ? await stopMicListen() : null;
  const systemBlob = systemStream ? await stopSystemAudioListen() : null;
  resetAudioSessionState();
  return { micBlob, systemBlob };
}

export async function transcribeAudioBlob(
  blob: Blob,
  who: string,
  apiBase = "http://127.0.0.1:3000",
): Promise<{ who: string; text: string } | null> {
  if (!blob || blob.size < MIN_WAV_BYTES) return null;

  const buffer = await blob.arrayBuffer();
  const mime = blob.type || "audio/wav";

  if (typeof window !== "undefined" && window.cueai?.transcribe) {
    const data = await window.cueai.transcribe({ data: buffer, mime, label: who });
    if (data.error) throw new Error(data.error);
    if (!data.text?.trim()) return null;
    return { who: data.who || who, text: data.text.trim() };
  }

  const body = new FormData();
  const ext = mime.includes("wav") ? "wav" : mime.includes("ogg") ? "ogg" : "webm";
  body.append("audio", blob, `listen.${ext}`);
  body.append("label", who);
  const res = await fetch(`${apiBase.replace(/\/$/, "")}/api/transcribe`, {
    method: "POST",
    body,
  });
  const data = (await res.json()) as {
    text?: string;
    who?: string;
    error?: string;
    empty?: boolean;
  };
  if (!res.ok) throw new Error(data.error || "Unable to transcribe audio.");
  if (!data.text?.trim()) return null;
  return { who: data.who || who, text: data.text.trim() };
}
