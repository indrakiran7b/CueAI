export type WhisperSegment = {
  text?: string;
  avg_logprob?: number;
  no_speech_prob?: number;
  compression_ratio?: number;
};

/**
 * Drop segments Whisper most likely invented over silence or noise, and flag
 * low-confidence speech. Never rewrites the recognized words.
 */
export function filterWhisperSegments(segments: WhisperSegment[]): { text: string; uncertain: boolean } {
  let uncertain = false;
  const kept: string[] = [];
  for (const s of segments) {
    const text = String(s.text || "").trim();
    if (!text) continue;
    const logprob = typeof s.avg_logprob === "number" ? s.avg_logprob : 0;
    const noSpeech = typeof s.no_speech_prob === "number" ? s.no_speech_prob : 0;
    const compression = typeof s.compression_ratio === "number" ? s.compression_ratio : 1;
    if (noSpeech > 0.6 && logprob < -0.7) continue;
    if (compression > 2.6) continue;
    if (logprob < -0.8 || noSpeech > 0.4) uncertain = true;
    kept.push(text);
  }
  return { text: kept.join(" ").replace(/\s+/g, " ").trim(), uncertain };
}

/** Client-supplied recognition context: plain text only, bounded. */
export function cleanPrompt(raw: unknown): string {
  return String(raw || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(-400);
}

/** Whisper can return its own prompt on near-silent audio. */
export function isPromptEcho(text: string, prompt: string) {
  const a = text.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const b = prompt.toLowerCase().replace(/[^a-z0-9 ]/g, "");
  return a.length > 0 && a.length < 80 && b.includes(a);
}
