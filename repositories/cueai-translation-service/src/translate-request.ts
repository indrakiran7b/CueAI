import {
  TranslateError,
  isTranslateLang,
  translateTexts,
} from "@/lib/server/translate";

export type TranslateHttpResult =
  | { status: number; body: Record<string, unknown> };

export async function runTranslateRequest(body: unknown): Promise<TranslateHttpResult> {
  const parsed = (body || {}) as {
    text?: unknown;
    texts?: unknown;
    targetLanguage?: unknown;
    sourceLanguage?: unknown;
  };

  const targetRaw = String(parsed.targetLanguage || "").trim().toLowerCase();
  if (!isTranslateLang(targetRaw)) {
    return { status: 400, body: { error: "targetLanguage must be en, hi, or te." } };
  }

  const texts = Array.isArray(parsed.texts)
    ? parsed.texts.map((item) => String(item ?? ""))
    : typeof parsed.text === "string"
      ? [parsed.text]
      : [];

  if (!texts.length) {
    return { status: 400, body: { error: "text or texts is required." } };
  }
  if (texts.length > 40) {
    return { status: 400, body: { error: "Too many texts in one translation request." } };
  }

  const sourceLanguage =
    typeof parsed.sourceLanguage === "string" ? parsed.sourceLanguage.trim() : "auto";

  try {
    const result = await translateTexts({
      texts: texts.map((text) => text.slice(0, 4000)),
      targetLanguage: targetRaw,
      sourceLanguage,
    });
    return {
      status: 200,
      body: {
        ok: true,
        targetLanguage: targetRaw,
        sourceLanguage: result.sourceLanguage,
        translations: result.translated,
        translated: result.translated[0] ?? "",
      },
    };
  } catch (err) {
    if (err instanceof TranslateError) {
      return { status: err.status, body: { error: err.message } };
    }
    console.error("translate_error", err);
    return {
      status: 502,
      body: { error: err instanceof Error ? err.message : "Translation failed." },
    };
  }
}
