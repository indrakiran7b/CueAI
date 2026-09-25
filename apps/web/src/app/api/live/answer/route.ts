import { NextResponse } from "next/server";
import {
  buildSystemInstruction,
  buildUserPrompt,
  clampConfidence,
  inferMode,
  LIVE_ANSWER_MAX_TOKENS,
  LIVE_TRANSCRIPT_WINDOW,
  type LiveAnswerMode,
  type LiveTranscriptLine,
} from "@/lib/live-answer";
import {
  GeminiError,
  generateGeminiText,
  resolveGeminiCredentials,
  type GeminiJsonSchema,
} from "@/lib/server/gemini";
import { GroqError, generateGroqText, resolveGroqApiKey, streamGroqText } from "@/lib/server/groq";

export const runtime = "nodejs";
export const maxDuration = 120;

// The desktop overlay runs on its own origin (Vite dev server or file://),
// so it needs the same permissive CORS as /api/transcribe.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

function sseHeaders() {
  return {
    ...CORS_HEADERS,
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  };
}

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
          stream?: unknown;
        }
      | null;

    const prompt = String(body?.prompt || "").trim();
    if (!prompt) {
      return json({ error: "prompt is required." }, 400);
    }

    const wantStream = body?.stream === true;
    const transcript = parseTranscript(body?.transcript).slice(-LIVE_TRANSCRIPT_WINDOW);
    const mode: LiveAnswerMode =
      typeof body?.mode === "string" &&
      ["answer", "summarize", "actions", "risks", "explain", "screen"].includes(body.mode)
        ? (body.mode as LiveAnswerMode)
        : inferMode(prompt);

    const inlineImage = parseInlineImage(body?.image);
    const rawImage = typeof body?.image === "string" ? body.image : "";
    let sessionContext = String(body?.sessionContext || "").trim();
    let meetingId: string | null = null;
    let hasResume = sessionContext.includes("CANDIDATE RESUME");
    let profileContext = "";

    // Stream path: enrich with light KB retrieval (keyword) without blocking on full profile merge.
    if (wantStream && groqKey && !inlineImage) {
      let knowledgeContext = "";
      try {
        const { retrieveKnowledgeForQuestion } = await import(
          "@/lib/server/knowledge-retrieve"
        );
        const { getSessionFromRequest } = await import("@/lib/server/api-auth");
        const session = await getSessionFromRequest();
        knowledgeContext = await retrieveKnowledgeForQuestion(prompt, {
          workspaceId: session?.workspaceId,
          limit: 2,
          maxChars: 700,
        });
      } catch {
        // KB is optional for latency.
      }

      const system = buildSystemInstruction("", hasResume || Boolean(sessionContext));
      const userPrompt = buildUserPrompt({
        prompt,
        transcript,
        mode: mode === "screen" ? "answer" : mode,
        sessionContext: sessionContext.slice(0, 4500),
        knowledgeContext,
      });
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (payload: unknown) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          };
          try {
            const result = await streamGroqText({
              system,
              prompt: `${userPrompt}\n\nReply with the speakable interview answer only. No JSON. No preamble. Medium depth — not a one-liner.`,
              temperature: 0.35,
              maxOutputTokens: LIVE_ANSWER_MAX_TOKENS,
              signal: request.signal,
              onToken: (token) => send({ type: "token", text: token }),
            });
            send({
              type: "done",
              answer: result.text,
              confidence: 0.78,
              model: result.model,
              provider: "groq",
            });
            // Usage / history are best-effort and must not delay tokens.
            void (async () => {
              try {
                const { randomUUID } = await import("node:crypto");
                const { getSessionFromRequest } = await import("@/lib/server/api-auth");
                const { recordUsageEvent } = await import("@/lib/server/usage");
                const { getActiveMeeting, appendMeetingExchange } = await import(
                  "@/lib/server/meetings"
                );
                const session = await getSessionFromRequest();
                const total = Math.max(1, result.inputTokens + result.outputTokens);
                await recordUsageEvent(session, {
                  type: "tokens",
                  quantity: total,
                  inputTokens: result.inputTokens,
                  outputTokens: result.outputTokens,
                  provider: "groq",
                  model: result.model,
                  idempotencyKey: `tokens:live_answer_stream:${randomUUID()}`,
                  metadata: { feature: "live_answer_stream", mode },
                });
                const active = await getActiveMeeting();
                if (active?.id && result.text.trim()) {
                  await appendMeetingExchange(active.id, prompt, result.text, {
                    provider: "groq",
                    model: result.model,
                    source: "auto",
                    questionWho: "Interviewer",
                  });
                }
              } catch {
                // ignore
              }
            })();
          } catch (err) {
            if (credentials) {
              try {
                console.error(
                  "live_answer_stream_groq_fallback",
                  err instanceof Error ? err.message : err,
                );
                const gemini = await generateGeminiText({
                  credentials,
                  system,
                  prompt: userPrompt,
                  temperature: 0.35,
                  maxOutputTokens: LIVE_ANSWER_MAX_TOKENS,
                  thinkingLevel: "MINIMAL",
                  jsonSchema: ANSWER_SCHEMA,
                });
                let answer = gemini.text;
                let confidence = 0.7;
                try {
                  const parsed = JSON.parse(gemini.text) as {
                    answer?: unknown;
                    confidence?: unknown;
                  };
                  if (typeof parsed.answer === "string" && parsed.answer.trim()) {
                    answer = parsed.answer.trim();
                    confidence = clampConfidence(parsed.confidence);
                  }
                } catch {
                  // raw text
                }
                send({ type: "token", text: answer });
                send({
                  type: "done",
                  answer,
                  confidence,
                  model: gemini.model,
                  provider: "gemini",
                });
                void (async () => {
                  try {
                    const { getActiveMeeting, appendMeetingExchange } = await import(
                      "@/lib/server/meetings"
                    );
                    const active = await getActiveMeeting();
                    if (active?.id && answer.trim()) {
                      await appendMeetingExchange(active.id, prompt, answer, {
                        provider: "gemini",
                        model: gemini.model,
                        source: "auto",
                        questionWho: "Interviewer",
                      });
                    }
                  } catch {
                    // ignore
                  }
                })();
              } catch (fallbackErr) {
                send({
                  type: "error",
                  error:
                    fallbackErr instanceof Error
                      ? fallbackErr.message
                      : "Streaming answer failed.",
                });
              }
            } else {
              send({
                type: "error",
                error: err instanceof Error ? err.message : "Streaming answer failed.",
              });
            }
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, { status: 200, headers: sseHeaders() });
    }

    try {
      const { getSessionFromRequest } = await import("@/lib/server/api-auth");
      const { getProfileContext } = await import("@/lib/server/user-profile");
      profileContext = await getProfileContext((await getSessionFromRequest())?.userId);
    } catch {
      // Personalization is best-effort; never block a live answer.
    }

    try {
      const { describeLiveSessionContext } = await import("@/lib/live-session-config");
      const { resolveAnswerBriefing } = await import("@/lib/server/meetings");
      const resolved = await resolveAnswerBriefing();
      meetingId = resolved.meeting?.id || null;
      hasResume = Boolean(resolved.briefing.resumeText?.trim()) || hasResume;
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

    const system = buildSystemInstruction(profileContext, hasResume || Boolean(sessionContext));

    let knowledgeContext = "";
    try {
      const { retrieveKnowledgeForQuestion } = await import(
        "@/lib/server/knowledge-retrieve"
      );
      const { getSessionFromRequest } = await import("@/lib/server/api-auth");
      const session = await getSessionFromRequest();
      knowledgeContext = await retrieveKnowledgeForQuestion(prompt, {
        workspaceId: session?.workspaceId,
      });
    } catch {
      // optional
    }

    const userPrompt = buildUserPrompt({
      prompt,
      transcript,
      mode,
      sessionContext,
      knowledgeContext,
    });

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
        // Never hard-fail when Gemini (Resume Analyzer fallback) is available.
        console.error("live_answer_qwen_fallback", message);
      }
    }

    // Screen analysis needs vision — Groq chat cannot take the screenshot.
    // Use the same Gemini credentials as Resume Analyzer.
    const preferGemini = Boolean(inlineImage);

    if (groqKey && !preferGemini) {
      try {
        console.log("[GROQ] Request started");
        result = await generateGroqText({
          system,
          prompt: `${userPrompt}\n\nReturn JSON only: {"answer":"speakable reply","confidence":0.0}`,
          temperature: 0.4,
          maxOutputTokens: LIVE_ANSWER_MAX_TOKENS,
          jsonObject: true,
        });
      } catch (err) {
        if (!credentials) throw err;
        console.error("live_answer_groq_fallback", err instanceof Error ? err.message : err);
        console.log("[GEMINI] Fallback started");
        result = await generateGeminiText({
          credentials,
          system,
          prompt: userPrompt,
          temperature: 0.4,
          maxOutputTokens: LIVE_ANSWER_MAX_TOKENS,
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
              "No AI key is configured. Add GROQ_API_KEY and/or GEMINI_API_KEY (same keys as Resume Analyzer).",
          },
          503,
        );
      }
      result = await generateGeminiText({
        credentials,
        system,
        prompt: userPrompt,
        inlineImage,
        temperature: 0.25,
        maxOutputTokens: LIVE_ANSWER_MAX_TOKENS,
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
        await appendMeetingExchange(meetingId, prompt, answer, {
          provider,
          model: result.model,
          source: "auto",
          questionWho: "Interviewer",
        });
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
