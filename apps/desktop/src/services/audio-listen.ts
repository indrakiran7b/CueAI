/**
 * Renderer-side audio capture — delegates session state to AudioSessionManager.
 * Live mode: ~2s speech slices transcribed without toggling mic off.
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

export type ListenActiveState = AudioSessionSnapshot;

export type LiveTranscribeConfig = {
  apiBase: string;
  onResult: (line: { who: string; text: string }) => void;
  onError: (msg: string) => void;
};

type LevelTap = {
  ctx: AudioContext;
  analyser: AnalyserNode;
  source: MediaStreamAudioSourceNode;
  raf: number;
};

type RecorderBag = {
  recorder: MediaRecorder;
  who: string;
  mimeType: string;
};

const LIVE_SLICE_MS = 2000;
const MIN_TRANSCRIBE_BYTES = 256;
const MIN_VOICE_LEVEL = 0.012;
const MAX_IN_FLIGHT = 2;

let micStream: MediaStream | null = null;
let systemStream: MediaStream | null = null;
let micTap: LevelTap | null = null;
let systemTap: LevelTap | null = null;
let micRec: RecorderBag | null = null;
let systemRec: RecorderBag | null = null;
let liveConfig: LiveTranscribeConfig | null = null;
let transcribeInFlight = 0;
let micStartPromise: Promise<void> | null = null;
let systemStartPromise: Promise<void> | null = null;

export function configureLiveTranscription(config: LiveTranscribeConfig | null) {
  liveConfig = config;
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

function levelForWho(who: string) {
  if (who === "You") return micTap ? readLevel(micTap.analyser) : 0;
  if (who === "System") return systemTap ? readLevel(systemTap.analyser) : 0;
  return 0;
}

function attachTap(stream: MediaStream, kind: "mic" | "system"): LevelTap {
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  const tap: LevelTap = { ctx, analyser, source, raf: 0 };
  const tick = () => {
    if (kind === "mic") setMicLevel(readLevel(analyser));
    else setSystemLevel(readLevel(analyser));
    emitLevelsThrottled(125);
    tap.raf = requestAnimationFrame(tick);
  };
  tap.raf = requestAnimationFrame(tick);
  void ctx.resume();
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
  void tap.ctx.close();
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

function pickMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "";
}

async function maybeTranscribeSlice(blob: Blob, who: string) {
  if (!liveConfig) return;
  const level = levelForWho(who);
  if (blob.size < MIN_TRANSCRIBE_BYTES) return;
  if (level < MIN_VOICE_LEVEL) return;
  if (transcribeInFlight >= MAX_IN_FLIGHT) return;

  transcribeInFlight++;
  if (who === "You") setMicState("processing");
  else setSystemState("processing");

  try {
    const line = await transcribeAudioBlob(blob, who, liveConfig.apiBase);
    if (line?.text) liveConfig.onResult(line);
    clearAudioError();
  } catch (err) {
    const msg = humanizeFetchError(err);
    setAudioError(msg);
    liveConfig.onError(msg);
  } finally {
    transcribeInFlight--;
    if (who === "You" && micStream) setMicState("listening");
    else if (who === "System" && systemStream) setSystemState("listening");
  }
}

function startRecorder(stream: MediaStream, who: string): RecorderBag | null {
  if (typeof MediaRecorder === "undefined") return null;
  const audioOnly = new MediaStream(stream.getAudioTracks());
  if (!audioOnly.getAudioTracks().length) return null;
  try {
    const mimeType = pickMimeType();
    const recorder = mimeType
      ? new MediaRecorder(audioOnly, { mimeType })
      : new MediaRecorder(audioOnly);
    const bag: RecorderBag = {
      recorder,
      who,
      mimeType: recorder.mimeType || mimeType || "audio/webm",
    };
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) void maybeTranscribeSlice(ev.data, who);
    };
    recorder.start(LIVE_SLICE_MS);
    return bag;
  } catch {
    return null;
  }
}

async function stopRecorder(bag: RecorderBag | null): Promise<Blob | null> {
  if (!bag) return null;
  const { recorder } = bag;
  if (recorder.state === "inactive") return null;
  return new Promise((resolve) => {
    recorder.onstop = () => resolve(null);
    try {
      recorder.requestData();
    } catch {
      /* ignore */
    }
    recorder.stop();
  });
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
        },
        video: false,
      });
      micTap = attachTap(micStream, "mic");
      micRec = startRecorder(micStream, "You");
      if (!micRec) throw new Error("Microphone recorder unavailable");
      setMicState("listening");
      clearAudioError();
      ok = true;
    } catch (err) {
      const msg = humanizeFetchError(err);
      setAudioError(msg);
      setMicState("error");
      stopStream(micStream);
      micStream = null;
      throw err;
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
  const blob = await stopRecorder(micRec);
  micRec = null;
  releaseTap(micTap);
  micTap = null;
  stopStream(micStream);
  micStream = null;
  setMicLevel(0);
  setMicState("idle");
  return blob;
}

async function startSystemAudioListenInternal(
  getSourceId: () => Promise<string | null>
): Promise<void> {
  if (systemStream) return;
  if (!tryBeginSystemStart()) {
    if (systemStartPromise) await systemStartPromise;
    return;
  }

  systemStartPromise = (async () => {
    let ok = false;
    try {
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

      systemStream = await navigator.mediaDevices.getUserMedia(constraints);
      systemStream.getVideoTracks().forEach((t) => {
        t.enabled = false;
      });
      if (!systemStream.getAudioTracks().length) {
        stopStream(systemStream);
        systemStream = null;
        throw new Error("System audio capture is unavailable on this device.");
      }
      systemTap = attachTap(systemStream, "system");
      systemRec = startRecorder(systemStream, "System");
      if (!systemRec) throw new Error("System audio recorder unavailable");
      setSystemState("listening");
      clearAudioError();
      ok = true;
    } catch (err) {
      const msg = humanizeFetchError(err);
      setAudioError(msg);
      setSystemState("error");
      stopStream(systemStream);
      systemStream = null;
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
  return startSystemAudioListenInternal(getSourceId);
}

export async function stopSystemAudioListen(): Promise<Blob | null> {
  setSystemState("stopping");
  const blob = await stopRecorder(systemRec);
  systemRec = null;
  releaseTap(systemTap);
  systemTap = null;
  stopStream(systemStream);
  systemStream = null;
  setSystemLevel(0);
  setSystemState("idle");
  return blob;
}

export async function syncListenSources(opts: {
  mic: boolean;
  systemAudio: boolean;
  getDesktopSourceId: () => Promise<string | null>;
}): Promise<{ micBlob: Blob | null; systemBlob: Blob | null }> {
  if (opts.mic) {
    if (!micStream) await startMicListen();
  } else if (micStream) {
    await stopMicListen();
  }

  if (opts.systemAudio) {
    if (!systemStream) await startSystemAudioListen(opts.getDesktopSourceId);
  } else if (systemStream) {
    await stopSystemAudioListen();
  }

  return { micBlob: null, systemBlob: null };
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
  apiBase = "http://127.0.0.1:3000"
): Promise<{ who: string; text: string } | null> {
  if (!blob || blob.size < MIN_TRANSCRIBE_BYTES) return null;

  const buffer = await blob.arrayBuffer();
  const mime = blob.type || "audio/webm";

  if (typeof window !== "undefined" && window.cueai?.transcribe) {
    const data = await window.cueai.transcribe({ data: buffer, mime, label: who });
    if (data.error) throw new Error(data.error);
    if (!data.text?.trim()) return null;
    return { who: data.who || who, text: data.text.trim() };
  }

  const body = new FormData();
  const ext = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "m4a" : "webm";
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
