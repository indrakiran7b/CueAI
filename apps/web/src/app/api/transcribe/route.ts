import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_STT_MODEL = process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo";
const MAX_BYTES = 25 * 1024 * 1024;

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
    const form = await request.formData();
    const file = form.get("audio");
    const label = String(form.get("label") || "You").slice(0, 40);

    if (!(file instanceof File)) {
      return json({ error: "Audio file is required." }, 400);
    }
    if (file.size <= 0) {
      return json({ error: "Audio file is empty." }, 400);
    }
    if (file.size > MAX_BYTES) {
      return json({ error: "Audio exceeds 25 MB limit." }, 400);
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      const { resolveGeminiCredentials } = await import("@/lib/server/gemini");
      if (!(await resolveGeminiCredentials())) {
        return json(
          {
            error:
              "Speech-to-text is not configured. Add GEMINI_API_KEY (or GROQ_API_KEY) on the server.",
          },
          503,
        );
      }
    }

    let text = "";
    let provider = "groq";
    let model = GROQ_STT_MODEL;
    let tryGemini = !groqKey;

    if (groqKey) {
      const upstream = new FormData();
      upstream.append("file", file, file.name || "listen.webm");
      upstream.append("model", GROQ_STT_MODEL);
      upstream.append("response_format", "json");
      upstream.append("temperature", "0");

      const groqRes = await fetch(GROQ_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${groqKey}` },
        body: upstream,
      });

      if (groqRes.ok) {
        const payload = (await groqRes.json()) as { text?: string };
        text = String(payload.text || "").trim();
      } else {
        const detail = await groqRes.text();
        console.error("groq_transcribe_failed", groqRes.status, detail.slice(0, 400));
        tryGemini = true;
      }
    }

    if (!text && tryGemini) {
      const { transcribeAudioWithGemini } = await import("@/lib/server/gemini");
      const buffer = Buffer.from(await file.arrayBuffer());
      text = await transcribeAudioWithGemini(buffer, file.type || "audio/webm");
      provider = "gemini";
      model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
    }
    if (!text) {
      return json({
        ok: true,
        text: "",
        who: label,
        empty: true,
      });
    }

    try {
      const { randomUUID } = await import("node:crypto");
      const { getSessionFromRequest } = await import("@/lib/server/api-auth");
      const { recordUsageEvent } = await import("@/lib/server/usage");
      const session = await getSessionFromRequest();
      const minutes = Math.max(1, Math.round(file.size / (32_000 * 60)) || 1);
      const requestId = randomUUID();
      await recordUsageEvent(session, {
        type: "meeting_minutes",
        quantity: minutes,
        provider,
        model,
        idempotencyKey: `meeting_minutes:${requestId}`,
        metadata: { feature: "transcribe", label, requestId },
      });
      await recordUsageEvent(session, {
        type: "tokens",
        quantity: Math.max(50, Math.round(text.length / 4)),
        provider,
        model,
        idempotencyKey: `tokens:transcribe:${requestId}`,
        metadata: { feature: "transcribe", requestId },
      });
    } catch {
      // ignore usage errors
    }

    return json({
      ok: true,
      text,
      who: label,
      empty: false,
    });
  } catch (err) {
    console.error("transcribe_error", err);
    const { GeminiError } = await import("@/lib/server/gemini");
    if (err instanceof GeminiError) {
      return json({ error: err.message }, err.status === 503 ? 503 : 502);
    }
    return json(
      { error: err instanceof Error ? err.message : "Unexpected transcription error" },
      500
    );
  }
}
