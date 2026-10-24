import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrDevice } from "@/lib/server/api-auth";
import { liveCorsHeaders, withLiveCors } from "@/lib/server/live-cors";
import { cleanPrompt, filterWhisperSegments, isPromptEcho, type WhisperSegment } from "../whisper-filter";

export const runtime = "nodejs";
export const maxDuration = 60;

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_STT_MODEL = process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo";
const MAX_BYTES = 25 * 1024 * 1024;
/** Live segments are short; a slow request must not stall the overlay's queue. */
const GROQ_TIMEOUT_MS = Math.max(2000, Number(process.env.GROQ_STT_TIMEOUT_MS || 8000) || 8000);
const GEMINI_TIMEOUT_MS = Math.max(2000, Number(process.env.GEMINI_STT_TIMEOUT_MS || 8000) || 8000);
const GEMINI_COOLDOWN_MS = 120_000;
/** Whisper's prompt window is ~224 tokens; keep vocabulary + context well inside it. */
const MAX_PROMPT_CHARS = 600;

let geminiSttDisabledUntil = 0;

const CORS_HEADERS = liveCorsHeaders("POST, OPTIONS");

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function json(data: unknown, status = 200, extra?: Record<string, string>) {
  return NextResponse.json(data, { status, headers: { ...CORS_HEADERS, ...(extra || {}) } });
}

async function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireAuthOrDevice(request);
  if (error || !session) {
    return withLiveCors(
      error || NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      "POST, OPTIONS",
    );
  }

  const started = Date.now();
  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch (err) {
      if (err instanceof Error && err.message.includes("Content-Type was not one of")) {
        return json({ error: "Audio file is required." }, 400);
      }
      throw err;
    }
    const file = form.get("audio");
    const label = String(form.get("label") || "You").slice(0, 40);
    const context = cleanPrompt(form.get("prompt"));

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
    const { resolveGeminiCredentials } = await import("@/lib/server/gemini");
    const geminiReady = async () =>
      Date.now() >= geminiSttDisabledUntil && Boolean(await resolveGeminiCredentials());

    if (!groqKey && !(await geminiReady())) {
      return json(
        { error: "Speech-to-text is not configured. Add GROQ_API_KEY (or GEMINI_API_KEY) on the server." },
        503,
      );
    }

    let text = "";
    let uncertain = false;
    let provider = "groq";
    let model = GROQ_STT_MODEL;
    let tryGemini = !groqKey;
    let groqStatus = 0;
    let retryAfterSec = 0;

    if (groqKey) {
      const upstream = new FormData();
      upstream.append("file", file, file.name || "listen.wav");
      upstream.append("model", GROQ_STT_MODEL);
      upstream.append("response_format", "verbose_json");
      upstream.append("temperature", "0");
      if (process.env.GROQ_STT_LANGUAGE?.trim()) {
        upstream.append("language", process.env.GROQ_STT_LANGUAGE.trim());
      }
      // Vocabulary (env) + the speaker's previous words keep terms and spelling consistent.
      const vocabulary = process.env.GROQ_STT_PROMPT?.trim() || "";
      const prompt = [vocabulary, context].filter(Boolean).join(" ").slice(-MAX_PROMPT_CHARS);
      if (prompt) upstream.append("prompt", prompt);

      try {
        const groqRes = await fetch(GROQ_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${groqKey}` },
          body: upstream,
          signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
        });
        groqStatus = groqRes.status;
        if (groqRes.ok) {
          const payload = (await groqRes.json()) as { text?: string; segments?: WhisperSegment[] };
          const filtered = Array.isArray(payload.segments)
            ? filterWhisperSegments(payload.segments)
            : { text: String(payload.text || "").trim(), uncertain: false };
          text = filtered.text;
          uncertain = filtered.uncertain;
          // Whisper can echo its prompt on near-silent audio.
          if (prompt && text && isPromptEcho(text, prompt)) text = "";
        } else {
          retryAfterSec = Number(groqRes.headers.get("retry-after") || 0) || 0;
          const detail = await groqRes.text();
          console.error("groq_transcribe_failed", groqRes.status, detail.slice(0, 200));
          tryGemini = await geminiReady();
        }
      } catch (err) {
        const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        groqStatus = timedOut ? 504 : 502;
        console.error("groq_transcribe_failed", timedOut ? "timeout" : "network");
        tryGemini = await geminiReady();
      }
    }

    if (!text && tryGemini) {
      try {
        const { transcribeAudioWithGemini } = await import("@/lib/server/gemini");
        const buffer = Buffer.from(await file.arrayBuffer());
        text = await withTimeout(
          transcribeAudioWithGemini(buffer, file.type || "audio/webm"),
          GEMINI_TIMEOUT_MS,
          "gemini_stt",
        );
        provider = "gemini";
        model = process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest";
        groqStatus = 0;
      } catch (err) {
        geminiSttDisabledUntil = Date.now() + GEMINI_COOLDOWN_MS;
        console.error("gemini_transcribe_failed", err instanceof Error ? err.message.slice(0, 120) : "unknown");
      }
    }

    if (!text && groqStatus && groqStatus !== 200) {
      // Tell the client whether retrying makes sense; never leak provider detail.
      if (groqStatus === 429) {
        return json(
          { error: "Transcription is rate limited. Retrying shortly." },
          429,
          { "Retry-After": String(Math.max(1, Math.min(10, Math.ceil(retryAfterSec || 1)))) },
        );
      }
      const status = groqStatus === 413 ? 413 : groqStatus === 504 ? 504 : groqStatus >= 500 ? 502 : 400;
      return json({ error: "Transcription failed. Check the audio and try again." }, status);
    }

    const providerMs = Date.now() - started;
    if (!text) {
      return json({ ok: true, text: "", who: label, empty: true, providerMs });
    }

    // Usage accounting must not delay the transcript.
    void (async () => {
      try {
        const { randomUUID } = await import("node:crypto");
        const { recordUsageEvent } = await import("@/lib/server/usage");
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
        // usage is best-effort
      }
    })();

    return json({ ok: true, text, who: label, empty: false, uncertain, providerMs });
  } catch (err) {
    console.error("transcribe_error", err instanceof Error ? err.message.slice(0, 200) : "unknown");
    const { GeminiError } = await import("@/lib/server/gemini");
    if (err instanceof GeminiError) {
      return json({ error: "Transcription failed. Try again." }, err.status === 503 ? 503 : 502);
    }
    return json({ error: "Unexpected transcription error" }, 500);
  }
}
