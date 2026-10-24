"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PREF_KEY = "cueai.interviewPrep.voice";

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
  return voices.find((v) => v.localService && /en-(us|gb|in)/i.test(v.lang)) || voices.find((v) => v.localService) || voices[0] || null;
}

/**
 * Interviewer voice using the browser's built-in speech synthesis (no extra provider or API calls).
 * `speak` resolves when speech ends, is cancelled, or voice is off.
 */
export function useSpeech() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabledState] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const doneRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
      setEnabledState(window.localStorage.getItem(PREF_KEY) !== "off");
    });
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  const finish = useCallback(() => {
    setSpeaking(false);
    const done = doneRef.current;
    doneRef.current = null;
    done?.();
  }, []);

  const cancel = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    finish();
  }, [finish]);

  const speak = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        cancel();
        if (!supported || !enabled || !text.trim()) {
          resolve();
          return;
        }
        const utterance = new SpeechSynthesisUtterance(text);
        const voice = pickVoice();
        if (voice) utterance.voice = voice;
        utterance.rate = 1.02;
        // Some engines never fire `end`; don't let the interview hang on that.
        const words = text.split(/\s+/).length;
        const guard = setTimeout(() => finish(), Math.max(4000, words * 500));
        doneRef.current = () => {
          clearTimeout(guard);
          resolve();
        };
        utterance.onend = finish;
        utterance.onerror = finish;
        setSpeaking(true);
        window.speechSynthesis.speak(utterance);
      }),
    [cancel, enabled, finish, supported],
  );

  const setEnabled = useCallback(
    (on: boolean) => {
      setEnabledState(on);
      window.localStorage.setItem(PREF_KEY, on ? "on" : "off");
      if (!on) cancel();
    },
    [cancel],
  );

  return { supported, enabled, speaking, speak, cancel, setEnabled };
}

export type Speech = ReturnType<typeof useSpeech>;
