import { NextRequest, NextResponse } from "next/server";
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
import { requireAuthOrDevice, upstreamSessionCookieHeader } from "@/lib/server/api-auth";
import {
  GeminiError,
  generateGeminiText,
  resolveGeminiCredentials,
  type GeminiJsonSchema,
} from "@/lib/server/gemini";
import {
  GroqError,
  generateGroqText,
  isRetryableGroqStatus,
  resolveGroqApiKey,
  streamGroqText,
} from "@/lib/server/groq";
import { liveCorsHeaders, withLiveCors } from "@/lib/server/live-cors";
import {
  forceLiveAnswerLocal,
  liveAnswerUnavailableMessage,
  localProvidersConfigured,
  proxyLiveAnswerToFastApi,
} from "@/lib/server/live-answer-backend";

export const runtime = "nodejs";
export const maxDuration = 120;

// Overlay uses header auth from a different origin. CORS * is paired with
// device headers, not credentialed cookies.
const CORS_HEADERS = liveCorsHeaders("POST, OPTIONS");

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

export async function POST(request: NextRequest) {
  const { error, session } = await requireAuthOrDevice(request);
  if (error || !session) {
    return withLiveCors(
      error || NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      "POST, OPTIONS",
    );
  }

  const requestId = crypto.randomUUID().slice(0, 12);
  const rawBody = await request.arrayBuffer();
  const forceLocal = forceLiveAnswerLocal();

  if (!forceLocal) {
    const proxied = await proxyLiveAnswerToFastApi({
      body: rawBody,
      contentType: request.headers.get("content-type") || "application/json",
      accept: request.headers.get("accept") || "*/*",
      cookie: upstreamSessionCookieHeader(session, request.headers.get("cookie")),
      signal: request.signal,
    });
    if ("response" in proxied) {
      const headers = new Headers(CORS_HEADERS);
      const type = proxied.response.headers.get("content-type");
      if (type) headers.set("content-type", type);
      if (proxied.response.status === 401) {
        console.log("[AUTH] Unauthorized", {
          method: "POST",
          path: "/v1/live/answer",
          source: "fastapi-upstream",
          requestId,
        });
      }
      return new Response(proxied.response.body, { status: proxied.response.status, headers });
    }
    const local = localProvidersConfigured();
    if (!local.groq && !local.gemini) {
      console.error("live_answer_upstream_unavailable", {
        requestId,
        reason: proxied.error,
      });
      return json({ error: liveAnswerUnavailableMessage(proxied.error), requestId }, 503);
    }
    console.warn("live_answer_local_fallback", {
      requestId,
      reason: proxied.error,
      groqConfigured: local.groq,
      geminiConfigured: local.gemini,
    });
  }

  const groqKey = resolveGroqApiKey();
  const credentials = await resolveGeminiCredentials();

  // Resolve optional user BYOK for live session (never returned to client).
  let byok: Awaited<
    ReturnType<(typeof import("@/lib/server/credential-resolver"))["resolveCredential"]>
  > = null;
  try {
    const { resolveCredential } = await import("@/lib/server/credential-resolver");
    byok = await resolveCredential({
      userId: session.userId,
      workspaceId: session.workspaceId,
      capability: "live_session",
    });
  } catch {
    // optional
  }

  /** Active user BYOK takes precedence over env keys for text answers. */
  const userByok = byok?.source === "user" ? byok : null;
  const effectiveGroqKey =
    userByok?.provider === "groq"
      ? userByok.apiKey
      : userByok
        ? ""
        : groqKey;
  const byokGroqModel =
    userByok?.provider === "groq" ? userByok.model : undefined;

  if (!userByok && !effectiveGroqKey && !credentials) {
    return json(
      {
        error: "AI provider is not configured.",
      },
      503,
    );
  }

  try {
    const body = (() => {
      try {
        return JSON.parse(new TextDecoder().decode(rawBody)) as {
          prompt?: unknown;
          transcript?: unknown;
          mode?: unknown;
          sessionContext?: unknown;
          image?: unknown;
          stream?: unknown;
          skipKnowledge?: unknown;
        };
      } catch {
        return null;
      }
    })();

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

    if (wantStream && effectiveGroqKey && !inlineImage) {
      let knowledgeContext = "";
      let knowledgeMeta: {
        knowledgeUsed: boolean;
        sourceType: string;
        sources: unknown[];
      } = { knowledgeUsed: false, sourceType: "general_ai", sources: [] };
      try {
        const { needsLiveKnowledge, retrieveKnowledgeForMeeting } = await import(
          "@/lib/server/knowledge-retrieve"
        );
        if (body?.skipKnowledge !== true && needsLiveKnowledge(prompt)) {
          const { resolveAnswerBriefing } = await import("@/lib/server/meetings");
          const resolved = await resolveAnswerBriefing(session);
          const kb = await retrieveKnowledgeForMeeting(prompt, {
            workspaceId: session.workspaceId,
            meetingId: resolved.meeting?.id,
            documentIds: resolved.briefing.documentIds,
            includeWorkspace: true,
            maxChars: 700,
          });
          knowledgeContext = kb.context;
          knowledgeMeta = {
            knowledgeUsed: kb.knowledgeUsed,
            sourceType: kb.sourceType,
            sources: kb.sources.slice(0, 3),
          };
        }
      } catch {
        // KB is optional for latency.
      }

      const system = buildSystemInstruction("", Boolean(sessionContext));
      const userPrompt = buildUserPrompt({
        prompt,
        transcript,
        mode: mode === "screen" ? "answer" : mode,
        sessionContext: sessionContext.slice(0, 4500),
        knowledgeContext,
      });
      const encoder = new TextEncoder();
      const streamStarted = Date.now();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (payload: unknown) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          };
          let tokensEmitted = false;
          let firstTokenAt = 0;
          try {
            const result = await streamGroqText({
              system,
              prompt: `${userPrompt}\n\nReply with the speakable interview answer only. No JSON. No preamble. Medium depth — not a one-liner.`,
              temperature: 0.35,
              maxOutputTokens: LIVE_ANSWER_MAX_TOKENS,
              signal: request.signal,
              onToken: (token) => {
                if (!tokensEmitted) firstTokenAt = Date.now();
                tokensEmitted = true;
                send({ type: "token", text: token });
              },
              apiKey: effectiveGroqKey,
              model: byokGroqModel,
            });
            console.info("live_answer_stream", {
              requestId,
              provider: "groq",
              ttftMs: firstTokenAt ? firstTokenAt - streamStarted : -1,
              totalMs: Date.now() - streamStarted,
            });
            send({
              type: "done",
              answer: result.text,
              confidence: 0.78,
              model: result.model,
              provider: "groq",
              requestId,
              knowledgeUsed: knowledgeMeta.knowledgeUsed,
              sourceType: knowledgeMeta.sourceType,
              sources: knowledgeMeta.sources,
            });
            // Usage / history are best-effort and must not delay tokens.
            void (async () => {
              try {
                const { randomUUID } = await import("node:crypto");
                const { recordUsageEvent } = await import("@/lib/server/usage");
                const { getActiveMeetingForSession, appendMeetingExchange } = await import(
                  "@/lib/server/meetings"
                );
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
                const active = await getActiveMeetingForSession(session);
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
            if (tokensEmitted) {
              send({
                type: "error",
                error: "Answer stream interrupted. Ask again if the reply looks incomplete.",
                requestId,
              });
              return;
            }
            const groqStatus = err instanceof GroqError ? err.status : 502;
            const canFallback =
              Boolean(credentials) &&
              groqStatus !== 400 &&
              (isRetryableGroqStatus(groqStatus) || groqStatus === 401 || groqStatus === 403);
            if (canFallback && credentials) {
              try {
                console.error("live_answer_stream_groq_fallback", {
                  requestId,
                  errorCategory:
                    groqStatus === 429
                      ? "rate_limit"
                      : groqStatus === 401 || groqStatus === 403
                        ? "auth"
                        : groqStatus === 504
                          ? "timeout"
                          : "unavailable",
                });
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
                  requestId,
                  knowledgeUsed: knowledgeMeta.knowledgeUsed,
                  sourceType: knowledgeMeta.sourceType,
                  sources: knowledgeMeta.sources,
                });
                void (async () => {
                  try {
                    const { getActiveMeetingForSession, appendMeetingExchange } = await import(
                      "@/lib/server/meetings"
                    );
                    const active = await getActiveMeetingForSession(session);
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
      const { getProfileContext } = await import("@/lib/server/user-profile");
      profileContext = await getProfileContext(session.userId);
    } catch {
      // Personalization is best-effort; never block a live answer.
    }

    try {
      const { describeLiveSessionContext } = await import("@/lib/live-session-config");
      const { resolveAnswerBriefing } = await import("@/lib/server/meetings");
      const resolved = await resolveAnswerBriefing(session);
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
    let knowledgeMeta: {
      knowledgeUsed: boolean;
      sourceType: string;
      sources: unknown[];
    } = { knowledgeUsed: false, sourceType: "general_ai", sources: [] };
    try {
      const { needsLiveKnowledge, retrieveKnowledgeForMeeting } = await import(
        "@/lib/server/knowledge-retrieve"
      );
      if (body?.skipKnowledge !== true && needsLiveKnowledge(prompt)) {
        const { resolveAnswerBriefing } = await import("@/lib/server/meetings");
        const resolved = await resolveAnswerBriefing(session);
        meetingId = meetingId || resolved.meeting?.id || null;
        const kb = await retrieveKnowledgeForMeeting(prompt, {
          workspaceId: session.workspaceId,
          meetingId,
          documentIds: resolved.briefing.documentIds,
          includeWorkspace: true,
        });
        knowledgeContext = kb.context;
        knowledgeMeta = {
          knowledgeUsed: kb.knowledgeUsed,
          sourceType: kb.sourceType,
          sources: kb.sources.slice(0, 5),
        };
      }
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
    let provider = "groq";
    const generateStarted = Date.now();

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

    // Screen analysis needs vision — chat providers cannot take the screenshot.
    const preferGemini = Boolean(inlineImage);

    // Prefer active user BYOK (any provider + saved model) for non-vision answers.
    if (userByok && !preferGemini) {
      const { generateWithCredential } = await import("@/lib/server/llm-generate");
      const byokResult = await generateWithCredential(userByok, {
        system,
        prompt: `${userPrompt}\n\nReturn JSON only: {"answer":"speakable reply","confidence":0.0}`,
        temperature: 0.4,
        maxOutputTokens: LIVE_ANSWER_MAX_TOKENS,
      });
      result = {
        text: byokResult.text,
        model: byokResult.model,
        inputTokens: byokResult.inputTokens,
        outputTokens: byokResult.outputTokens,
      };
      provider = byokResult.provider;
    } else if (effectiveGroqKey && !preferGemini) {
      try {
        console.log("[GROQ] Request started");
        result = await generateGroqText({
          system,
          prompt: `${userPrompt}\n\nReturn JSON only: {"answer":"speakable reply","confidence":0.0}`,
          temperature: 0.4,
          maxOutputTokens: LIVE_ANSWER_MAX_TOKENS,
          jsonObject: true,
          apiKey: effectiveGroqKey,
          model: byokGroqModel,
        });
        provider = "groq";
      } catch (err) {
        const groqStatus = err instanceof GroqError ? err.status : 502;
        const canFallback =
          Boolean(credentials) &&
          groqStatus !== 400 &&
          (isRetryableGroqStatus(groqStatus) || groqStatus === 401 || groqStatus === 403);
        if (!canFallback) throw err;
        console.error("live_answer_groq_fallback", {
          requestId,
          errorCategory:
            groqStatus === 429
              ? "rate_limit"
              : groqStatus === 401 || groqStatus === 403
                ? "auth"
                : groqStatus === 504
                  ? "timeout"
                  : "unavailable",
        });
        console.log("[GEMINI] Fallback started");
        result = await generateGeminiText({
          credentials: credentials!,
          system,
          prompt: userPrompt,
          temperature: 0.4,
          maxOutputTokens: LIVE_ANSWER_MAX_TOKENS,
          thinkingLevel: "MINIMAL",
          jsonSchema: ANSWER_SCHEMA,
        });
        provider = "gemini";
      }
    } else if (credentials && !preferGemini) {
      console.log("[GEMINI] Request started");
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
    } else {
      if (!credentials) {
        return json(
          {
            error:
              "No API key is configured for this provider.\nPlease add an API key in Settings → API Keys.",
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
      const { recordUsageEvent } = await import("@/lib/server/usage");
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

    console.info("live_answer", {
      requestId,
      provider,
      totalMs: Date.now() - generateStarted,
    });

    return json({
      ok: true,
      answer,
      confidence,
      model: result.model,
      provider,
      requestId,
      knowledgeUsed: knowledgeMeta.knowledgeUsed,
      sourceType: knowledgeMeta.sourceType,
      sources: knowledgeMeta.sources,
    });
  } catch (err) {
    const { LlmAuthError, BYOK_AUTH_FAILED_MESSAGE } = await import(
      "@/lib/server/llm-generate"
    );
    if (err instanceof LlmAuthError) {
      return json({ error: err.message }, 401);
    }
    if (err instanceof GroqError || err instanceof GeminiError) {
      if (err.status === 401 || err.status === 403) {
        return json({ error: BYOK_AUTH_FAILED_MESSAGE }, 401);
      }
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
