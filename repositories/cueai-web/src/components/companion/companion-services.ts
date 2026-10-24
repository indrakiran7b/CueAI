/**
 * AI helpers for the web Companion overlay.
 * Uses Gemini (primary) / Groq (fallback) via /api/live/answer — no offline sample answers.
 */

import type { LiveTranscriptLine } from "@/lib/live-answer";
import { loadLiveSessionContext as loadSessionContext } from "@/lib/live-answer-client";

export type CompanionAnswer = {
  answer: string;
  confidence: number;
  notice?: string;
  model?: string;
};

export const CompanionAI = {
  async ask(
    prompt: string,
    transcript: LiveTranscriptLine[] = [],
    image?: string,
  ): Promise<CompanionAnswer> {
    const sessionContext = await loadSessionContext();
    const res = await fetch("/api/live/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        transcript,
        sessionContext,
        image,
        mode: image ? "screen" : undefined,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      answer?: string;
      confidence?: number;
      model?: string;
      error?: string;
    };
    if (!res.ok || !data.answer) {
      throw new Error(
        data.error || "Unable to generate an answer. Check AI configuration and try again.",
      );
    }
    return {
      answer: data.answer,
      confidence: typeof data.confidence === "number" ? data.confidence : 0.7,
      model: data.model,
    };
  },
};

export const CompanionTranslation = {
  async translate(text: string, targetLang: string) {
    const { detectSourceLanguage, translateTexts } = await import("@/lib/translate-client");
    const target = targetLang === "hi" || targetLang === "te" || targetLang === "en" ? targetLang : "en";
    const sourceLang = detectSourceLanguage(text);
    const [result] = await translateTexts([text], target, { sourceLanguage: sourceLang });
    if (!result || result.status !== "ok") {
      throw new Error(result?.error || "Translation failed.");
    }
    return {
      sourceLang,
      targetLang: target,
      text: result.text,
    };
  },
};
