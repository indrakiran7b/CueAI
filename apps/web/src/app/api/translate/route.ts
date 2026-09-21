import { NextResponse } from "next/server";
import {
  TranslateError,
  isTranslateLang,
  translateTexts,
} from "@/lib/server/translate";

export const runtime = "nodejs";
export const maxDuration = 120;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | {
          text?: unknown;
          texts?: unknown;
          targetLanguage?: unknown;
          sourceLanguage?: unknown;
        }
      | null;

    const targetRaw = String(body?.targetLanguage || "").trim().toLowerCase();
    if (!isTranslateLang(targetRaw)) {
      return json({ error: "targetLanguage must be en, hi, or te." }, 400);
    }

    const texts = Array.isArray(body?.texts)
      ? body.texts.map((item) => String(item ?? ""))
      : typeof body?.text === "string"
        ? [body.text]
        : [];

    if (!texts.length) {
      return json({ error: "text or texts is required." }, 400);
    }
    if (texts.length > 40) {
      return json({ error: "Too many texts in one translation request." }, 400);
    }

    const sourceLanguage =
      typeof body?.sourceLanguage === "string" ? body.sourceLanguage.trim() : "auto";

    const result = await translateTexts({
      texts: texts.map((text) => text.slice(0, 4000)),
      targetLanguage: targetRaw,
      sourceLanguage,
    });

    return json({
      ok: true,
      targetLanguage: targetRaw,
      sourceLanguage: result.sourceLanguage,
      translations: result.translated,
      translated: result.translated[0] ?? "",
    });
  } catch (err) {
    if (err instanceof TranslateError) {
      return json({ error: err.message }, err.status);
    }
    console.error("translate_error", err);
    return json(
      { error: err instanceof Error ? err.message : "Translation failed." },
      502,
    );
  }
}
