import { GroqError, generateGroqText, resolveGroqApiKey } from "@/lib/server/groq";
import {
  GeminiError,
  generateGeminiText,
  resolveGeminiCredentials,
} from "@/lib/server/gemini";

export const TRANSLATE_LANGS = ["en", "hi", "te"] as const;
export type TranslateLang = (typeof TRANSLATE_LANGS)[number];

const LANG_NAME: Record<TranslateLang, string> = {
  en: "English",
  hi: "Hindi",
  te: "Telugu",
};

const SCRIPT: Record<TranslateLang, RegExp> = {
  en: /[\u0900-\u097F\u0C00-\u0C7F]/,
  hi: /[\u0900-\u097F]/,
  te: /[\u0C00-\u0C7F]/,
};

const cache = new Map<string, string>();
const CACHE_LIMIT = 500;

export class TranslateError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "TranslateError";
    this.status = status;
  }
}

export function isTranslateLang(value: string): value is TranslateLang {
  return (TRANSLATE_LANGS as readonly string[]).includes(value);
}

export function detectSourceLanguage(text: string): TranslateLang {
  const hi = (text.match(/[\u0900-\u097F]/g) || []).length;
  const te = (text.match(/[\u0C00-\u0C7F]/g) || []).length;
  if (hi === 0 && te === 0) return "en";
  return hi >= te ? "hi" : "te";
}

export function translationCacheKey(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
) {
  return `${text}|${sourceLanguage}|${targetLanguage}`;
}

function alreadyInTarget(text: string, target: TranslateLang) {
  if (!text.trim()) return true;
  if (target === "en") return !SCRIPT.en.test(text);
  return SCRIPT[target].test(text);
}

function remember(key: string, value: string) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_LIMIT) {
    const first = cache.keys().next().value;
    if (first === undefined) break;
    cache.delete(first);
  }
}

function unwrapJson(raw: string) {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseBatch(raw: string, count: number): string[] | null {
  try {
    const parsed = JSON.parse(unwrapJson(raw)) as unknown;
    if (Array.isArray(parsed) && parsed.length === count) {
      return parsed.map((item) => String(item ?? "").trim());
    }
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const list = Array.isArray(obj.translations) ? obj.translations : null;
      if (list && list.length === count) {
        return list.map((item) => String(item ?? "").trim());
      }
      const keyed = Array.from({ length: count }, (_, i) => {
        const value = obj[String(i)] ?? obj[`t${i}`];
        return typeof value === "string" ? value.trim() : "";
      });
      if (keyed.every(Boolean) || keyed.some(Boolean)) return keyed;
    }
  } catch {
    /* fall through */
  }
  return null;
}

async function generateTranslationRaw(
  system: string,
  prompt: string,
  maxOutputTokens: number,
): Promise<string> {
  const groqKey = resolveGroqApiKey();
  const credentials = await resolveGeminiCredentials();
  if (!groqKey && !credentials) {
    throw new TranslateError(
      "No AI key is configured. Add GROQ_API_KEY (primary) and/or GEMINI_API_KEY to the server environment.",
      503,
    );
  }

  const geminiModels = credentials
    ? [credentials.model, "gemini-2.0-flash", "gemini-flash-latest", "gemini-2.5-flash"].filter(
        (v, i, arr) => arr.indexOf(v) === i,
      )
    : [];

  let lastError: TranslateError | null = null;

  if (groqKey) {
    try {
      const result = await generateGroqText({
        system,
        prompt,
        temperature: 0.1,
        maxOutputTokens,
        jsonObject: true,
      });
      return result.text;
    } catch (err) {
      lastError =
        err instanceof GroqError
          ? new TranslateError(err.message, err.status === 429 ? 429 : err.status >= 500 ? 502 : err.status)
          : new TranslateError(err instanceof Error ? err.message : "Translation failed.", 502);
      if (!credentials) throw lastError;
    }
  }

  for (const model of geminiModels) {
    try {
      const result = await generateGeminiText({
        credentials: { ...credentials!, model },
        system,
        prompt,
        temperature: 0.1,
        maxOutputTokens: 2500,
        thinkingLevel: "MINIMAL",
      });
      return result.text;
    } catch (err) {
      lastError =
        err instanceof GeminiError
          ? new TranslateError(err.message, err.status === 429 ? 429 : err.status >= 500 ? 502 : err.status)
          : new TranslateError(err instanceof Error ? err.message : "Translation failed.", 502);
      if (err instanceof GeminiError && (err.status === 401 || err.status === 403)) {
        throw lastError;
      }
    }
  }

  throw lastError || new TranslateError("Translation failed.", 502);
}

async function translateBatchWithLlm(
  texts: string[],
  sourceLanguage: TranslateLang | "auto",
  targetLanguage: TranslateLang,
): Promise<string[]> {
  const targetName = LANG_NAME[targetLanguage];
  const sourceName =
    sourceLanguage === "auto" ? "the original language (auto-detect)" : LANG_NAME[sourceLanguage];
  const numbered = texts.map((text, i) => `${i}. ${JSON.stringify(text)}`).join("\n");
  const system =
    "You are a professional translator for live meeting transcripts and AI answers. Return JSON only.";
  const prompt = [
    `Translate each numbered item from ${sourceName} into ${targetName}.`,
    "Keep names, product terms, numbers, and punctuation. Do not add commentary, quotes, or transliteration notes.",
    "If an item is already in the target language, copy it unchanged.",
    "Return JSON of the form {\"translations\":[\"...\", \"...\"]} with the same count and order.",
    "",
    numbered,
  ].join("\n");

  const raw = await generateTranslationRaw(
    system,
    prompt,
    Math.min(4000, 200 + texts.reduce((n, t) => n + t.length, 0)),
  );

  const parsed = parseBatch(raw, texts.length);
  if (!parsed || parsed.length !== texts.length) {
    throw new TranslateError("Translation service returned an unexpected response.", 502);
  }
  return parsed;
}

export async function translateTexts(input: {
  texts: string[];
  targetLanguage: TranslateLang;
  sourceLanguage?: string;
}): Promise<{ sourceLanguage: TranslateLang | "auto"; translated: string[] }> {
  const target = input.targetLanguage;
  const requestedSource = input.sourceLanguage?.trim() || "auto";
  const source: TranslateLang | "auto" =
    requestedSource === "auto" || isTranslateLang(requestedSource) ? requestedSource : "auto";

  const translated = new Array<string>(input.texts.length).fill("");
  const pendingIdx: number[] = [];
  const pendingTexts: string[] = [];

  input.texts.forEach((raw, index) => {
    const text = String(raw || "");
    if (!text.trim()) {
      translated[index] = "";
      return;
    }
    const detected = source === "auto" ? detectSourceLanguage(text) : source;
    if (detected === target || alreadyInTarget(text, target)) {
      translated[index] = text;
      return;
    }
    const key = translationCacheKey(text, detected, target);
    const hit = cache.get(key);
    if (hit !== undefined) {
      translated[index] = hit;
      return;
    }
    pendingIdx.push(index);
    pendingTexts.push(text);
  });

  if (!pendingTexts.length) {
    return { sourceLanguage: source, translated };
  }

  const unique: string[] = [];
  const uniqueIndex = new Map<string, number>();
  for (const text of pendingTexts) {
    const detected = source === "auto" ? detectSourceLanguage(text) : source;
    const key = translationCacheKey(text, detected, target);
    if (!uniqueIndex.has(key)) {
      uniqueIndex.set(key, unique.length);
      unique.push(text);
    }
  }

  const CHUNK = 12;
  const uniqueOut: string[] = [];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const chunkSource =
      source === "auto" ? detectSourceLanguage(chunk[0] || "") : source;
    uniqueOut.push(...(await translateBatchWithLlm(chunk, chunkSource, target)));
  }

  pendingIdx.forEach((origIndex, pendingI) => {
    const text = pendingTexts[pendingI] || "";
    const detected = source === "auto" ? detectSourceLanguage(text) : source;
    const key = translationCacheKey(text, detected, target);
    const uniqueI = uniqueIndex.get(key) ?? 0;
    const value = (uniqueOut[uniqueI] || "").trim();
    if (!value) {
      throw new TranslateError("Translation service returned empty text.", 502);
    }
    remember(key, value);
    translated[origIndex] = value;
  });

  return { sourceLanguage: source, translated };
}
