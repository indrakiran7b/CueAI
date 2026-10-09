/**
 * Canonical speech-endpoint settings for Windows + macOS.
 * Tune via Vite env (VITE_SPEECH_END_SILENCE_MS etc). Do not scatter literals.
 */

function readMs(name: string, fallback: number, min: number, max: number): number {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env?.[name];
  const n = Number(env);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Audio kept before VAD fires so the first words are not lost. */
export const PREFIX_MS = readMs("VITE_SPEECH_PREFIX_MS", 350, 200, 400);
/** Extra capture after last voice so final syllables are not cut. */
export const POST_ROLL_MS = readMs("VITE_SPEECH_POST_ROLL_MS", 300, 200, 400);
/** Silence required before considering the speaker finished. */
export const SPEECH_END_SILENCE_MS = readMs("VITE_SPEECH_END_SILENCE_MS", 450, 300, 600);
/** Discard noise blips; still short enough for "What is Python?". */
export const MIN_SPEECH_MS = 480;
export const MAX_SPEECH_MS = 16_000;
export const VOICE_THRESHOLD = 0.018;
/** Once speaking, stay in-speech through quieter syllables. */
export const VOICE_HANGOVER_THRESHOLD = 0.01;
/** Wait for a trailing STT fragment when the transcript looks complete. */
export const STITCH_WINDOW_MS = 420;
/** Wait longer when the transcript is clearly unfinished. */
export const STITCH_INCOMPLETE_MS = 650;

export type CaptureQuality = "ok" | "short_audio" | "truncated_transcript" | "empty";

/** Longer silence for short bursts (likely mid-question pauses). */
export function adaptiveSilenceMs(speechDurationMs: number): number {
  if (speechDurationMs < 900) return Math.min(600, SPEECH_END_SILENCE_MS + 150);
  if (speechDurationMs < 1600) return Math.min(600, SPEECH_END_SILENCE_MS + 70);
  return SPEECH_END_SILENCE_MS;
}

const INCOMPLETE_TAIL =
  /\b(and|or|but|the|a|an|to|of|for|with|in|on|at|my|your|our|from|into|using|via|through|by|is|are|was|were|what|how|why|who|which|can|could|would|should|explain|describe|difference|between|versus|vs)$/i;

const LIKELY_CONTINUES =
  /^(generative|traditional|machine|object|oriented|cloud|rest|neural|artificial|natural|large|language|difference|differences|between|gen|generativ)$/i;

const HANGING_STEM =
  /^(what is|what are|how does|how do|how is|how are|why is|why are|explain|what is the difference between|can you explain|could you explain)$/i;

export function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/** True when STT likely cut the spoken question short. */
export function looksTruncatedTranscript(text: string): boolean {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return true;
  if (/[.!?]$/.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length <= 2) return true;
  if (INCOMPLETE_TAIL.test(t)) return true;
  if (HANGING_STEM.test(t)) return true;
  const last = words[words.length - 1] || "";
  if (words.length <= 4 && LIKELY_CONTINUES.test(last)) return true;
  return false;
}

export function captureQuality(opts: {
  durationMs?: number;
  transcriptChars?: number;
  words?: number;
  truncated?: boolean;
}): CaptureQuality {
  if ((opts.transcriptChars ?? 0) <= 0 && (opts.durationMs ?? 0) <= 0) return "empty";
  if ((opts.durationMs ?? 0) > 0 && (opts.durationMs ?? 0) < MIN_SPEECH_MS) return "short_audio";
  if (opts.truncated || (opts.words ?? 99) <= 2) return "truncated_transcript";
  return "ok";
}

/** Buffer first stream tokens until a speakable fragment exists (not "G" / "Ge"). */
export function isFirstMeaningfulAnswer(text: string): boolean {
  const t = text.trim();
  if (t.length >= 18) return true;
  if (t.length >= 7 && /\s/.test(t)) return true;
  if (t.length >= 12 && /[A-Za-z]{4,}/.test(t)) return true;
  return false;
}

export function logCaptureMetrics(kind: "audio" | "transcription", fields: Record<string, number | string | boolean>) {
  if (typeof console === "undefined") return;
  console.log("[CueAI Capture]", kind, fields);
}
