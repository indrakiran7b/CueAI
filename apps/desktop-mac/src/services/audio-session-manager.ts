/**
 * Single source of truth for mic / system audio capture sessions.
 * React components must not own MediaStream lifetimes directly.
 */

export type AudioSessionKind = "mic" | "system";

export type AudioSessionState =
  | "idle"
  | "requesting_permission"
  | "connecting"
  | "listening"
  | "processing"
  | "stopping"
  | "error";

export type AudioSessionSnapshot = {
  mic: AudioSessionState;
  system: AudioSessionState;
  micLevel: number;
  systemLevel: number;
  error: string | null;
};

type Listener = (snap: AudioSessionSnapshot) => void;

let micState: AudioSessionState = "idle";
let systemState: AudioSessionState = "idle";
let micLevel = 0;
let systemLevel = 0;
let lastError: string | null = null;
const listeners = new Set<Listener>();

let micStarting = false;
let systemStarting = false;

function snap(): AudioSessionSnapshot {
  return {
    mic: micState,
    system: systemState,
    micLevel,
    systemLevel,
    error: lastError,
  };
}

function emit() {
  const s = snap();
  listeners.forEach((cb) => cb(s));
}

export function subscribeAudioSession(cb: Listener) {
  listeners.add(cb);
  cb(snap());
  return () => {
    listeners.delete(cb);
  };
}

export function setMicState(next: AudioSessionState) {
  micState = next;
  emit();
}

export function setSystemState(next: AudioSessionState) {
  systemState = next;
  emit();
}

export function setMicLevel(level: number) {
  micLevel = Math.min(1, Math.max(0, level));
}

export function setSystemLevel(level: number) {
  systemLevel = Math.min(1, Math.max(0, level));
}

export function setAudioError(msg: string | null) {
  lastError = msg;
  emit();
}

export function clearAudioError() {
  lastError = null;
  emit();
}

export function tryBeginMicStart(): boolean {
  if (micStarting || micState === "connecting" || micState === "requesting_permission") return false;
  micStarting = true;
  setMicState("requesting_permission");
  return true;
}

export function endMicStart(_success: boolean) {
  micStarting = false;
}

export function tryBeginSystemStart(): boolean {
  if (systemStarting || systemState === "connecting" || systemState === "requesting_permission") return false;
  systemStarting = true;
  setSystemState("requesting_permission");
  return true;
}

export function endSystemStart(_success: boolean) {
  systemStarting = false;
}

export function humanizeFetchError(err: unknown): string {
  if (!(err instanceof Error)) return "Audio service unavailable.";
  const m = err.message.toLowerCase();
  if (m.includes("failed to fetch") || m.includes("networkerror")) {
    return "Cannot reach CueAI web API. Keep the CueAI web server running and restart CueAI Desktop.";
  }
  if (m.includes("permission") || m.includes("notallowed") || m.includes("not allowed")) {
    return "macOS blocked this audio source. Enable CueAI in System Settings → Privacy & Security.";
  }
  if (m.includes("not found") || m.includes("device")) {
    return "No microphone is available.";
  }
  if (m.includes("system audio") || m.includes("screen recording")) {
    return err.message;
  }
  return err.message;
}

/** Throttled level emit — call from RAF loop at most every `intervalMs`. */
let lastLevelEmit = 0;
export function emitLevelsThrottled(intervalMs = 125) {
  const now = Date.now();
  if (now - lastLevelEmit < intervalMs) return;
  lastLevelEmit = now;
  emit();
}

export function resetAudioSessionState() {
  micState = "idle";
  systemState = "idle";
  micLevel = 0;
  systemLevel = 0;
  lastError = null;
  micStarting = false;
  systemStarting = false;
  emit();
}
