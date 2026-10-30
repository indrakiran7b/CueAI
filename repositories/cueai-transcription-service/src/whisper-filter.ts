export type WhisperSegment = {
  text?: string;
  avg_logprob?: number;
  no_speech_prob?: number;
  compression_ratio?: number;
};

export const INTERVIEW_RETRY_MESSAGE = "Please ask the question in English or repeat it clearly.";

const ENGLISH_LANGUAGE_NAMES = new Set(["en", "eng", "english"]);
const NON_LATIN_LETTER = /[\u0400-\u052f\u0590-\u08ff\u0900-\u0dff\u0e00-\u0fff\u1000-\u109f\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u;
const TECHNICAL_TOKEN = /\b(?:abap|amdp|badi|bapi|cds|c\+\+|fastapi|idoc|java|javascript|mongodb|odata|postgresql|python|react|rest|rfc|sap|sql)\b/i;

export type InterviewEnglishAssessment = {
  accepted: boolean;
  reason?: "non_english" | "uncertain";
};

/**
 * Deterministic safety gate for the interview workflow. Provider language
 * metadata is authoritative when present; script checks prevent non-English
 * audio from being treated as an invented English question when it is absent.
 * This deliberately does not rewrite recognized technical vocabulary.
 */
export function assessInterviewEnglish(
  text: string,
  opts: { detectedLanguage?: string; uncertain?: boolean } = {},
): InterviewEnglishAssessment {
  const value = text.trim();
  if (!value) return { accepted: true };
  const language = String(opts.detectedLanguage || "").trim().toLowerCase();
  if (language && !ENGLISH_LANGUAGE_NAMES.has(language)) {
    return { accepted: false, reason: "non_english" };
  }
  if (NON_LATIN_LETTER.test(value)) {
    return { accepted: false, reason: "non_english" };
  }
  if (opts.uncertain && !TECHNICAL_TOKEN.test(value)) {
    return { accepted: false, reason: "uncertain" };
  }
  return { accepted: true };
}

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
