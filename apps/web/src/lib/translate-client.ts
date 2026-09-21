export type TranslateLang = "en" | "hi" | "te";

export type TranslateResult = {
  text: string;
  status: "ok" | "error";
  error?: string;
};

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

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
  if (target === "en") return !/[\u0900-\u097F\u0C00-\u0C7F]/.test(text);
  if (target === "hi") return /[\u0900-\u097F]/.test(text);
  return /[\u0C00-\u0C7F]/.test(text);
}

export function peekTranslation(
  text: string,
  targetLanguage: TranslateLang,
  sourceLanguage?: string,
): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const source = sourceLanguage && sourceLanguage !== "auto"
    ? sourceLanguage
    : detectSourceLanguage(text);
  if (source === targetLanguage || alreadyInTarget(text, targetLanguage)) return text;
  return cache.get(translationCacheKey(text, source, targetLanguage));
}

async function requestTranslations(
  texts: string[],
  targetLanguage: TranslateLang,
  sourceLanguage: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts, targetLanguage, sourceLanguage }),
    signal,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    translations?: unknown;
    translated?: unknown;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `Translation failed (${res.status}).`);
  }
  if (Array.isArray(data.translations) && data.translations.length === texts.length) {
    return data.translations.map((item) => String(item ?? ""));
  }
  if (texts.length === 1 && typeof data.translated === "string") {
    return [data.translated];
  }
  throw new Error("Translation service returned an unexpected response.");
}

export async function translateTexts(
  texts: string[],
  targetLanguage: TranslateLang,
  opts?: { sourceLanguage?: string; signal?: AbortSignal },
): Promise<TranslateResult[]> {
  const sourceOpt = opts?.sourceLanguage || "auto";
  const results: TranslateResult[] = texts.map(() => ({ text: "", status: "ok" }));
  const pending: { index: number; text: string; key: string }[] = [];

  texts.forEach((text, index) => {
    if (!text.trim()) {
      results[index] = { text: "", status: "ok" };
      return;
    }
    const source = sourceOpt === "auto" ? detectSourceLanguage(text) : sourceOpt;
    if (source === targetLanguage || alreadyInTarget(text, targetLanguage)) {
      results[index] = { text, status: "ok" };
      return;
    }
    const key = translationCacheKey(text, source, targetLanguage);
    const hit = cache.get(key);
    if (hit !== undefined) {
      results[index] = { text: hit, status: "ok" };
      return;
    }
    pending.push({ index, text, key });
  });

  if (!pending.length) return results;

  const uniqueKeys: string[] = [];
  const uniqueTexts: string[] = [];
  const keyToUnique = new Map<string, number>();
  for (const item of pending) {
    if (!keyToUnique.has(item.key)) {
      keyToUnique.set(item.key, uniqueKeys.length);
      uniqueKeys.push(item.key);
      uniqueTexts.push(item.text);
    }
  }

  const needFetchKeys: string[] = [];
  const needFetchTexts: string[] = [];

  uniqueKeys.forEach((key, i) => {
    if (inflight.has(key)) return;
    needFetchKeys.push(key);
    needFetchTexts.push(uniqueTexts[i] || "");
  });

  if (needFetchTexts.length) {
    const batchPromise = requestTranslations(
      needFetchTexts,
      targetLanguage,
      sourceOpt,
      opts?.signal,
    );
    needFetchKeys.forEach((key, i) => {
      const promise = batchPromise
        .then((rows) => {
          const value = (rows[i] || "").trim();
          if (!value) throw new Error("Translation service returned empty text.");
          cache.set(key, value);
          return value;
        })
        .finally(() => {
          inflight.delete(key);
        });
      inflight.set(key, promise);
    });
  }

  const settled = await Promise.allSettled(
    uniqueKeys.map((key) => inflight.get(key) || Promise.reject(new Error("Translation failed."))),
  );
  pending.forEach((item) => {
    const uniqueI = keyToUnique.get(item.key) ?? 0;
    const outcome = settled[uniqueI];
    if (outcome?.status === "fulfilled") {
      results[item.index] = { text: outcome.value, status: "ok" };
    } else {
      const message =
        outcome?.status === "rejected" && outcome.reason instanceof Error
          ? outcome.reason.message
          : "Translation failed.";
      results[item.index] = { text: "", status: "error", error: message };
    }
  });

  return results;
}
