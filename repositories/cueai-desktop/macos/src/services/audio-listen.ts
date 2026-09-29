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

type PcmBag = {
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  mute: GainNode;
  who: string;
};

function isMacClient() {
  return window.cueai?.isMac === true;
}

function usesPcmCapture() {
  return isMacClient();
}

const LIVE_SLICE_MS = 2000;
const MIN_TRANSCRIBE_BYTES = 256;
const SILENT_PEAK = 0.004;
const MAX_IN_FLIGHT = 2;

let micStream: MediaStream | null = null;
let systemStream: MediaStream | null = null;
let micTap: LevelTap | null = null;
let systemTap: LevelTap | null = null;
let micRec: RecorderBag | null = null;
let systemRec: RecorderBag | null = null;
let micPcm: PcmBag | null = null;
let systemPcm: PcmBag | null = null;
let liveConfig: LiveTranscribeConfig | null = null;
let transcribeInFlight = 0;
let micStartPromise: Promise<void> | null = null;
let systemStartPromise: Promise<void> | null = null;
let micPeak = 0;
let systemPeak = 0;
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

function liveAudioTrack(stream: MediaStream | null) {
  return stream?.getAudioTracks().find((track) => track.readyState === "live") ?? null;
}

function streamAlive(stream: MediaStream | null) {
  return Boolean(stream?.active && liveAudioTrack(stream));
}

function captureRunning(kind: "mic" | "system") {
  if (usesPcmCapture()) {
    return kind === "mic" ? Boolean(micPcm) : Boolean(systemPcm);
  }
  const rec = kind === "mic" ? micRec : systemRec;
  return rec?.recorder.state === "recording";
}

function writeWavString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeWavString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeWavString(view, 8, "WAVE");
  writeWavString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeWavString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function startPcmSlicer(stream: MediaStream, who: string): PcmBag | null {
  const ctx = getSharedAudioContext();
  const audioTracks = stream.getAudioTracks();
  if (!audioTracks.length) return null;
  const audioOnly = new MediaStream(audioTracks);
  const source = ctx.createMediaStreamSource(audioOnly);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;
  const pending: Float32Array[] = [];
  let count = 0;
  const target = Math.floor(ctx.sampleRate * (LIVE_SLICE_MS / 1000));
  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    pending.push(new Float32Array(input));
    count += input.length;
    if (count < target) return;
    const merged = new Float32Array(count);
    let offset = 0;
    for (const chunk of pending) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    pending.length = 0;
    count = 0;
    const wav = encodeWav(merged, ctx.sampleRate);
    void maybeTranscribeSlice(wav, who);
  };
  source.connect(processor);
  processor.connect(mute);
  mute.connect(ctx.createMediaStreamDestination());
  return { source, processor, mute, who };
}

function releasePcm(bag: PcmBag | null) {
  if (!bag) return;
  try {
    bag.source.disconnect();
    bag.processor.disconnect();
    bag.mute.disconnect();
  } catch {
    /* ignore */
  }
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
  await stopRecorder(micRec);
  micRec = null;
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
  await stopRecorder(systemRec);
  systemRec = null;
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
      micPeak = Math.max(micPeak, level);
      if (level > 0.02 && Date.now() - lastMicLevelLog > 1500) {
        lastMicLevelLog = Date.now();
        console.log("[Audio] Microphone capture active");
      }
    } else {
      setSystemLevel(level);
      systemPeak = Math.max(systemPeak, level);
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
  const peak = who === "You" ? micPeak : systemPeak;
  if (who === "You") micPeak = 0;
  else systemPeak = 0;
  if (blob.size < MIN_TRANSCRIBE_BYTES) return;
  if (peak < SILENT_PEAK) {
    console.log("[Transcription] Silent chunk skipped");
    return;
  }
  if (transcribeInFlight >= MAX_IN_FLIGHT) return;

  transcribeInFlight++;
  console.log("[Transcription] Audio chunk received");

  try {
    console.log("[Transcription] Request sent");
    const line = await transcribeAudioBlob(blob, who, liveConfig.apiBase);
    if (line?.text) {
      console.log("[Transcription] Response received");
      liveConfig.onResult(line);
    }
    clearAudioError();
  } catch (err) {
    const msg = humanizeFetchError(err);
    if (who === "You") setMicError(msg);
    else setSystemError(msg);
    liveConfig.onError(msg);
  } finally {
    transcribeInFlight--;
    if (who === "You" && streamAlive(micStream) && captureRunning("mic")) {
      setMicState("listening");
    } else if (who === "System" && streamAlive(systemStream) && captureRunning("system")) {
      setSystemState("listening");
    } else if (who === "You" && micWanted && !streamAlive(micStream)) {
      setMicState("error");
    } else if (who === "System" && systemWanted && !streamAlive(systemStream)) {
      setSystemState("error");
    }
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
      if (usesPcmCapture()) {
        micPcm = startPcmSlicer(micStream, "You");
        if (!micPcm) throw new Error("Microphone recorder unavailable");
      } else {
        micRec = startRecorder(micStream, "You");
        if (!micRec || micRec.recorder.state !== "recording") {
          throw new Error("Microphone recorder unavailable");
        }
      }
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
  const blob = await stopRecorder(micRec);
  micRec = null;
  await releaseMicCapture();
  setMicState("idle");
  return blob;
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
      if (usesPcmCapture()) {
        systemPcm = startPcmSlicer(systemStream, "System");
        if (!systemPcm) throw new Error("System audio recorder unavailable");
      } else {
        systemRec = startRecorder(systemStream, "System");
        if (!systemRec || systemRec.recorder.state !== "recording") {
          throw new Error("System audio recorder unavailable");
        }
      }
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
  const blob = await stopRecorder(systemRec);
  systemRec = null;
  await releaseSystemCapture();
  setSystemState("idle");
  return blob;
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
  apiBase = "http://127.0.0.1:3002"
): Promise<{ who: string; text: string } | null> {
  if (blob.size < MIN_TRANSCRIBE_BYTES) return null;

  const buffer = await blob.arrayBuffer();
  const mime = blob.type || "audio/webm";

  if (typeof window !== "undefined" && window.cueai?.transcribe) {
    const data = await window.cueai.transcribe({ data: buffer, mime, label: who });
    if (data.error) throw new Error(data.error);
    if (!data.text?.trim()) return null;
    return { who: data.who || who, text: data.text.trim() };
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
