import { NextResponse } from "next/server";
import {
  buildSystemInstruction,
  buildUserPrompt,
  clampConfidence,
  inferMode,
  type LiveAnswerMode,
  type LiveTranscriptLine,
} from "@/lib/live-answer";
import {
  GeminiError,
  generateGeminiText,
  resolveGeminiCredentials,
  type GeminiJsonSchema,
} from "@/lib/server/gemini";
import { GroqError, generateGroqText, resolveGroqApiKey } from "@/lib/server/groq";

export const runtime = "nodejs";
export const maxDuration = 120;

// The desktop overlay runs on its own origin (Vite dev server or file://),
// so it needs the same permissive CORS as /api/transcribe.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const ANSWER_SCHEMA: GeminiJsonSchema = {
  type: "OBJECT",
  properties: {
    answer: { type: "STRING" },
    confidence: { type: "NUMBER" },
  },
  required: ["answer", "confidence"],
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

const MAX_IMAGE_CHARS = 2_000_000;

function parseInlineImage(input: unknown): { mimeType: string; data: string } | undefined {
  if (typeof input !== "string" || !input.startsWith("data:")) return undefined;
  const match = input.match(/^data:([^;]+);base64,(.+)$/);
  if (!match?.[1] || !match[2] || match[2].length > MAX_IMAGE_CHARS) return undefined;
  if (!match[1].startsWith("image/")) return undefined;
  return { mimeType: match[1], data: match[2] };
}

function parseTranscript(input: unknown): LiveTranscriptLine[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((row) => {
      // Accept both {who,text} objects and pre-joined "Who: text" strings.
      if (typeof row === "string") {
        const [who, ...rest] = row.split(":");
        return rest.length
          ? { who: who!.trim().slice(0, 40), text: rest.join(":").trim().slice(0, 1000) }
          : { who: "Speaker", text: row.trim().slice(0, 1000) };
      }
      const obj = row as { who?: unknown; text?: unknown };
      return {
        who: String(obj.who || "Speaker").slice(0, 40),
        text: String(obj.text || "").slice(0, 1000),
      };
    })
    .filter((line) => line.text.length > 0);
}

export async function POST(request: Request) {
  const groqKey = resolveGroqApiKey();
  const credentials = await resolveGeminiCredentials();
  if (!groqKey && !credentials) {
    return json(
      {
        error:
          "No AI key is configured. Add GROQ_API_KEY (primary) and/or GEMINI_API_KEY to the server environment.",
      },
      503,
    );
  }

  try {
    const body = (await request.json().catch(() => null)) as
      | {
          prompt?: unknown;
          transcript?: unknown;
          mode?: unknown;
          sessionContext?: unknown;
          image?: unknown;
        }
      | null;

    const prompt = String(body?.prompt || "").trim();
    if (!prompt) {
      return json({ error: "prompt is required." }, 400);
    }

    const transcript = parseTranscript(body?.transcript);
    const mode: LiveAnswerMode =
      typeof body?.mode === "string" &&
      ["answer", "summarize", "actions", "risks", "explain", "screen"].includes(body.mode)
        ? (body.mode as LiveAnswerMode)
        : inferMode(prompt);

    let profileContext = "";
    try {
      const { getSessionFromRequest } = await import("@/lib/server/api-auth");
      const { getProfileContext } = await import("@/lib/server/user-profile");
      profileContext = await getProfileContext((await getSessionFromRequest())?.userId);
    } catch {
      // Personalization is best-effort; never block a live answer.
    }

    let sessionContext = String(body?.sessionContext || "").trim();
    let meetingId: string | null = null;
    let hasResume = false;
    try {
      const { describeLiveSessionContext } = await import("@/lib/live-session-config");
      const { resolveAnswerBriefing } = await import("@/lib/server/meetings");
      const resolved = await resolveAnswerBriefing();
      meetingId = resolved.meeting?.id || null;
      hasResume = Boolean(resolved.briefing.resumeText?.trim());
      const fromStore = describeLiveSessionContext({
        kind: resolved.briefing.kind === "regular" ? "regular" : "interview",
        company: resolved.briefing.company,
        jobDescription: resolved.briefing.jobDescription,
        jobLink: resolved.briefing.jobLink,
        resumeName: resolved.briefing.resumeName,
        resumeText: resolved.briefing.resumeText,
        callTitle: resolved.briefing.callTitle,
        description: resolved.briefing.description,
        documentScope: "all",
        guidance: "balanced",
        startMode: "private",
        autoAnswer: true,
      });
      if (!sessionContext.includes("CANDIDATE RESUME") && fromStore.includes("CANDIDATE RESUME")) {
        sessionContext = fromStore;
      } else if (!sessionContext) {
        sessionContext = fromStore;
      }
    } catch {
      // Meeting briefing is optional.
    }

    const inlineImage = parseInlineImage(body?.image);
    const rawImage = typeof body?.image === "string" ? body.image : "";
    const system = buildSystemInstruction(profileContext, hasResume || Boolean(sessionContext));
    const userPrompt = buildUserPrompt({ prompt, transcript, mode, sessionContext });

    let result: {
      text: string;
      model: string;
      inputTokens: number;
      outputTokens: number;
    };
    let provider: "groq" | "gemini" | "qwen" = "groq";

    if (inlineImage && rawImage) {
      try {
        const { analyzeScreenWithQwen } = await import("@/lib/server/qwen-vl");
        const local = await analyzeScreenWithQwen({
          image: rawImage,
          prompt: userPrompt,
          sessionContext,
        });
        if (local?.answer) {
          return json({
            ok: true,
            answer: local.answer,
            confidence: local.confidence,
            model: local.model,
            provider: "qwen",
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Qwen2.5-VL is unavailable.";
        if (/still loading|still downloading|could not read/i.test(message)) {
          return json({ error: message }, 503);
        }
        console.error("live_answer_qwen_fallback", message);
      }
    }

    // Screen analysis needs vision — Groq chat cannot take the screenshot.
    const preferGemini = Boolean(inlineImage);

    if (groqKey && !preferGemini) {
      try {
        result = await generateGroqText({
          system,
          prompt: `${userPrompt}\n\nReturn JSON only: {"answer":"speakable reply","confidence":0.0}`,
          temperature: 0.4,
          maxOutputTokens: 700,
          jsonObject: true,
        });
      } catch (err) {
        if (!credentials) throw err;
        console.error("live_answer_groq_fallback", err instanceof Error ? err.message : err);
        result = await generateGeminiText({
          credentials,
          system,
          prompt: userPrompt,
          temperature: 0.4,
          maxOutputTokens: 700,
          thinkingLevel: "MINIMAL",
          jsonSchema: ANSWER_SCHEMA,
        });
        provider = "gemini";
      }
    } else {
      if (!credentials) {
        return json(
          {
            error:
              "Qwen2.5-VL is not running yet. Keep npm run dev:vision open, or add GEMINI_API_KEY as a fallback.",
          },
          503,
        );
      }
      result = await generateGeminiText({
        credentials,
        system,
        prompt: userPrompt,
        inlineImage,
        temperature: 0.4,
        maxOutputTokens: 700,
        thinkingLevel: "MINIMAL",
        jsonSchema: ANSWER_SCHEMA,
      });
      provider = "gemini";
    }

    let answer = result.text;
    let confidence = 0.7;
    try {
      const parsed = JSON.parse(result.text) as { answer?: unknown; confidence?: unknown };
      if (typeof parsed.answer === "string" && parsed.answer.trim()) {
        answer = parsed.answer.trim();
        confidence = clampConfidence(parsed.confidence);
      }
    } catch {
      // Schema mode should always return JSON; fall back to the raw text.
    }

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
        provider,
        model: result.model,
        idempotencyKey: `tokens:live_answer:${randomUUID()}`,
        metadata: { feature: "live_answer", mode },
      });
    } catch {
      // ignore usage errors
    }

    if (meetingId) {
      try {
        const { appendMeetingExchange } = await import("@/lib/server/meetings");
        await appendMeetingExchange(meetingId, prompt, answer);
      } catch {
        // never block the overlay on history writes
      }
    }

    return json({
      ok: true,
      answer,
      confidence,
      model: result.model,
      provider,
    });
  } catch (err) {
    if (err instanceof GroqError || err instanceof GeminiError) {
      const status = err.status === 429 ? 429 : err.status >= 500 ? 502 : err.status;
      return json({ error: err.message }, status);
    }
    console.error("live_answer_error", err);
    return json(
      { error: err instanceof Error ? err.message : "Unexpected live answer error" },
      500,
    );
  }
}
