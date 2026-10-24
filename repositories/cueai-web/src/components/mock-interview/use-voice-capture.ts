"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiErrorMessage } from "@/lib/api-error";

const NO_SPEECH_TIMEOUT_MS = 15_000;
const MAX_RECORDING_MS = 4 * 60_000;
/** Speech shorter than this counts as noise, not the start of an answer. */
const MIN_SPEECH_MS = 300;

export type VoiceState = "idle" | "listening" | "speaking" | "transcribing";
type StopReason = "manual" | "endpoint" | "max" | "silence" | "cancel";

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

/**
 * Voice activity endpointing: calibrates the noise floor, then calls onStop when the speaker
 * has been quiet for endOfSpeechMs after talking (or never spoke / talked too long).
 * Returns a cleanup function.
 */
function watchSpeech(
  stream: MediaStream,
  endOfSpeechMs: number,
  onSpeaking: () => void,
  onStop: (reason: "endpoint" | "max" | "silence") => void,
): () => void {
  const AudioCtx =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return () => undefined;
  const ctx = new AudioCtx();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const startedAt = Date.now();
  let noiseFloor = 0;
  let calibrationFrames = 0;
  let speechMs = 0;
  let lastSpeechAt = 0;
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    const rms = Math.sqrt(sum / buf.length);
    const now = Date.now();
    if (now - startedAt < 400) {
      noiseFloor = (noiseFloor * calibrationFrames + rms) / (calibrationFrames + 1);
      calibrationFrames += 1;
      return;
    }
    if (rms > Math.max(0.012, noiseFloor * 2.5)) {
      speechMs += 100;
      lastSpeechAt = now;
      if (speechMs >= MIN_SPEECH_MS) onSpeaking();
    }
    if (speechMs >= MIN_SPEECH_MS && now - lastSpeechAt > endOfSpeechMs) onStop("endpoint");
    else if (speechMs < MIN_SPEECH_MS && now - startedAt > NO_SPEECH_TIMEOUT_MS) onStop("silence");
    else if (now - startedAt > MAX_RECORDING_MS) onStop("max");
  }, 100);
  return () => {
    clearInterval(timer);
    void ctx.close().catch(() => undefined);
  };
}

/**
 * Records one spoken answer, detects when the speaker has finished (voice activity endpointing),
 * and transcribes it once with the existing /api/transcribe service (Groq Whisper).
 * `finished` is true when recording ended because the speaker stopped talking.
 */
export function useVoiceCapture({
  onText,
  endOfSpeechMs = 2500,
}: {
  onText: (text: string, finished: boolean) => void;
  /** Silence after speech that marks the end of a spoken answer. */
  endOfSpeechMs?: number;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const reasonRef = useRef<StopReason>("manual");
  const busyRef = useRef(false);
  /** Bumped on cancel so a late transcription result is ignored. */
  const generationRef = useRef(0);
  const onTextRef = useRef(onText);

  useEffect(() => {
    onTextRef.current = onText;
  });

  useEffect(
    () => () => {
      generationRef.current += 1;
      cleanupRef.current?.();
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        rec.onstop = null;
        rec.stop();
      }
    },
    [],
  );

  const stopWith = useCallback((reason: StopReason) => {
    reasonRef.current = reason;
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const transcribe = useCallback(async (blob: Blob, finished: boolean, generation: number) => {
    if (!blob.size) {
      setState("idle");
      busyRef.current = false;
      setError("No audio was captured. Try again.");
      return;
    }
    setState("transcribing");
    try {
      const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      const form = new FormData();
      form.append("audio", new File([blob], `answer.${ext}`, { type: blob.type }));
      form.append("label", "Candidate");
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { text?: string };
      if (generation !== generationRef.current) return;
      if (!res.ok) throw new Error(apiErrorMessage(body, "Transcription failed. Type your answer instead."));
      if (!body.text?.trim()) throw new Error("We couldn't hear any speech. Try again or type your answer.");
      onTextRef.current(body.text.trim(), finished);
    } catch (err) {
      if (generation !== generationRef.current) return;
      setError(
        err instanceof TypeError
          ? "Network error while transcribing. Check your connection and try again."
          : err instanceof Error
            ? err.message
            : "Transcription failed.",
      );
    } finally {
      if (generation === generationRef.current) {
        setState("idle");
        busyRef.current = false;
      }
    }
  }, []);

  const start = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError(null);
    const mimeType = pickMimeType();
    if (mimeType === null || !navigator.mediaDevices?.getUserMedia) {
      busyRef.current = false;
      setError("Voice input isn't supported in this browser. Type instead.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      busyRef.current = false;
      setError("Microphone access was blocked. Allow it in your browser settings, or type instead.");
      return;
    }

    const generation = generationRef.current;
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const stopWatching = watchSpeech(stream, endOfSpeechMs, () => setState("speaking"), stopWith);
    const cleanup = () => {
      stopWatching();
      stream.getTracks().forEach((t) => t.stop());
      cleanupRef.current = null;
    };
    cleanupRef.current = cleanup;

    rec.onstop = () => {
      cleanup();
      recorderRef.current = null;
      const reason = reasonRef.current;
      if (reason === "cancel" || generation !== generationRef.current) {
        setState("idle");
        busyRef.current = false;
        return;
      }
      if (reason === "silence") {
        setState("idle");
        busyRef.current = false;
        setError("We didn't hear any speech. Check your microphone, or type instead.");
        return;
      }
      void transcribe(new Blob(chunks, { type: rec.mimeType || "audio/webm" }), reason !== "manual", generation);
    };
    reasonRef.current = "manual";
    recorderRef.current = rec;
    rec.start(1000);
    setState("listening");
  }, [endOfSpeechMs, stopWith, transcribe]);

  /** Stop recording and transcribe what was said. */
  const stop = useCallback(() => stopWith("manual"), [stopWith]);

  /** Discard the current recording or pending transcription. */
  const cancel = useCallback(() => {
    generationRef.current += 1;
    stopWith("cancel");
    setState("idle");
    busyRef.current = false;
  }, [stopWith]);

  return { state, error, start, stop, cancel, clearError: () => setError(null) };
}
