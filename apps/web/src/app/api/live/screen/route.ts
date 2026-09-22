import { NextResponse } from "next/server";
import { GeminiError } from "@/lib/server/gemini";
import { analyzeScreenContext } from "@/lib/server/screen-context";

export const runtime = "nodejs";
export const maxDuration = 120;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

/**
 * Screen Context AI — same API keys as Resume Analyzer.
 * PRIMARY: Groq vision · FALLBACK: Gemini.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | {
          image?: unknown;
          prompt?: unknown;
          recentContext?: unknown;
        }
      | null;

    const image = typeof body?.image === "string" ? body.image : "";
    if (!image.startsWith("data:image/")) {
      return json({ error: "Screenshot image is required." }, 400);
    }
    if (image.length > 6_000_000) {
      return json({ error: "Screenshot is too large. Try again." }, 413);
    }

    const prompt = String(body?.prompt || "").trim();
    const recentContext = String(body?.recentContext || "").trim();

    console.log("[SCREEN-AI] Request started", {
      imageChars: image.length,
      hasPrompt: Boolean(prompt),
    });

    const result = await analyzeScreenContext({
      imageDataUrl: image,
      prompt,
      recentContext,
      signal: request.signal,
    });

    console.log("[SCREEN-AI] Answer rendered", {
      provider: result.provider,
      model: result.model,
      chars: result.answer.length,
    });

    try {
      const { randomUUID } = await import("node:crypto");
      const { getSessionFromRequest } = await import("@/lib/server/api-auth");
      const { recordUsageEvent } = await import("@/lib/server/usage");
      const session = await getSessionFromRequest();
      const total = Math.max(1, result.inputTokens + result.outputTokens);
      await recordUsageEvent(session, {
        type: "tokens",
        quantity: total,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        provider: result.provider,
        model: result.model,
        idempotencyKey: `tokens:screen_context:${randomUUID()}`,
        metadata: { feature: "screen_context" },
      });
    } catch {
      // ignore usage errors
    }

    return json({
      ok: true,
      answer: result.answer,
      confidence: result.confidence,
      model: result.model,
      provider: result.provider,
    });
  } catch (err) {
    if (err instanceof GeminiError) {
      const status = err.status === 429 ? 429 : err.status >= 500 ? 502 : err.status;
      return json({ error: err.message }, status);
    }
    console.error("screen_context_error", err);
    return json(
      { error: err instanceof Error ? err.message : "Unable to analyze the screen. Please try again." },
      500,
    );
  }
}
