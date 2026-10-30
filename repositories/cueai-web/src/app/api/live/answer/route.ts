import { NextRequest, NextResponse } from "next/server";
import {
  buildSystemInstruction,
  buildUserPrompt,
  clampConfidence,
  inferMode,
  LIVE_ANSWER_MAX_TOKENS,
  LIVE_HISTORY_MAX,
  LIVE_TRANSCRIPT_WINDOW,
  perQuestionAccuracyNotes,
  validateQuestionSpecificAnswer,
  type LiveAnswerMode,
  type LiveExchange,
  type LiveTranscriptLine,
} from "@/lib/live-answer";
import { analyzeQuestion, describeAnalysis, type QuestionAnalysis } from "@/lib/live-question";
import { groundingNotes, splitBriefing } from "@/lib/live-grounding";
import { guardLiveAnswer } from "@/lib/live-answer-guard";
import {
  LiveAnswerStreamError,
  streamLiveAnswer,
  type LiveStreamResult,
} from "@/lib/server/live-answer-providers";
import { resolveOpenAiApiKey } from "@/lib/server/openai";
import { requireAuthOrDevice, upstreamSessionCookieHeader } from "@/lib/server/api-auth";
import {
  GeminiError,
  generateGeminiText,
  resolveGeminiCredentials,
  type GeminiJsonSchema,
} from "@/lib/server/gemini";
import { GroqError, resolveGroqApiKey } from "@/lib/server/groq";
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

function parseHistory(input: unknown): LiveExchange[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(-LIVE_HISTORY_MAX)
    .map((row) => {
      const obj = (row || {}) as { question?: unknown; answer?: unknown };
      return {
        question: String(obj.question || "").trim().slice(0, 600),
        answer: String(obj.answer || "").trim().slice(0, 1200),
      };
    })
    .filter((h) => h.question.length > 0);
}

/** Optional context must never hold the first token hostage. */
const CONTEXT_BUDGET_MS = Math.max(
  200,
  Number(process.env.LIVE_CONTEXT_BUDGET_MS || 900) || 900,
);

function withBudget<T>(work: Promise<T>, fallback: T, ms = CONTEXT_BUDGET_MS): Promise<T> {
  return Promise.race([
    work.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

type LiveContext = {
  sessionContext: string;
  profileContext: string;
  knowledgeContext: string;
  history: LiveExchange[];
  meetingId: string | null;
  knowledgeMeta: { knowledgeUsed: boolean; sourceType: string; sources: unknown[] };
};

/**
 * Gather briefing, profile, meeting history and KB in parallel for this session only.
 * Personal context is fetched only when the question needs it.
 */
async function gatherLiveContext(
  session: NonNullable<Awaited<ReturnType<typeof requireAuthOrDevice>>["session"]>,
  input: {
    prompt: string;
    analysis: QuestionAnalysis;
    sessionContext: string;
    history: LiveExchange[];
    skipKnowledge: boolean;
    kbMaxChars: number;
    /** Test CueAI: never borrow questions from (or attach to) a live meeting. */
    isTest: boolean;
  },
): Promise<LiveContext> {
  const out: LiveContext = {
    sessionContext: input.sessionContext,
    profileContext: "",
    knowledgeContext: "",
    history: input.history,
    meetingId: null,
    knowledgeMeta: { knowledgeUsed: false, sourceType: "general_ai", sources: [] },
  };
  const { needsLiveKnowledge, retrieveKnowledgeForMeeting } = await import(
    "@/lib/server/knowledge-retrieve"
  );
  const wantKb = !input.skipKnowledge && needsLiveKnowledge(input.prompt);
  const wantPersonal = input.analysis.needsPersonalContext;
  const wantBriefing =
    wantKb || !input.history.length || (wantPersonal && !input.sessionContext.includes("CANDIDATE RESUME"));

  const profileTask = wantPersonal
    ? import("@/lib/server/user-profile").then((m) => m.getProfileContext(session.userId, "full"))
    : Promise.resolve("");

  const briefingTask = wantBriefing
    ? (async () => {
        const { resolveAnswerBriefing } = await import("@/lib/server/meetings");
        const resolved = await resolveAnswerBriefing(session);
        out.meetingId = input.isTest ? null : resolved.meeting?.id || null;
        if (!input.isTest && !input.history.length && resolved.meeting?.answers?.length) {
          out.history = resolved.meeting.answers
            .filter((a) => a.prompt?.trim())
            .slice(-LIVE_HISTORY_MAX)
            .map((a) => ({ question: a.prompt, answer: a.answer || "" }));
        }
        if (wantPersonal && !input.sessionContext.includes("CANDIDATE RESUME")) {
          const { describeLiveSessionContext } = await import("@/lib/live-session-config");
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
          if (fromStore.includes("CANDIDATE RESUME") || !out.sessionContext) {
            out.sessionContext = fromStore;
          }
        }
        if (wantKb) {
          const kb = await retrieveKnowledgeForMeeting(input.prompt, {
            workspaceId: session.workspaceId,
            meetingId: out.meetingId || undefined,
            documentIds: resolved.briefing.documentIds,
            includeWorkspace: true,
            maxChars: input.kbMaxChars,
          });
          out.knowledgeContext = kb.context;
          out.knowledgeMeta = {
            knowledgeUsed: kb.knowledgeUsed,
            sourceType: kb.sourceType,
            sources: kb.sources.slice(0, 3),
          };
        }
      })()
    : Promise.resolve();

  const [profile] = await Promise.all([
    withBudget(profileTask, ""),
    withBudget(briefingTask, undefined),
  ]);
  out.profileContext = profile;
  return out;
}

/** Everything an answer may legitimately draw facts from; used to check personal claims. */
function evidenceText(parts: { sessionContext: string; profileContext: string; knowledgeContext: string; history: LiveExchange[]; transcript: LiveTranscriptLine[] }) {
  return [
    parts.sessionContext,
    parts.profileContext,
    parts.knowledgeContext,
    ...parts.history.map((h) => h.answer),
    ...parts.transcript.map((l) => l.text),
  ].join("\n");
}

function errorCategory(result: LiveStreamResult | null, attempts: { provider: string; reason?: string }[]) {
  return (result?.attempts || attempts)
    .filter((a) => a.reason)
    .map((a) => `${a.provider}:${a.reason}`)
    .join(",");
}

type KnowledgeBaseRequest = { prompt: string; stream: boolean };

function parseKnowledgeBaseRequest(raw: ArrayBuffer): KnowledgeBaseRequest | null {
  try {
    const body = JSON.parse(new TextDecoder().decode(raw)) as { source?: unknown; prompt?: unknown; stream?: unknown };
    if (body?.source !== "knowledge_base") return null;
    return { prompt: String(body.prompt || "").trim().slice(0, 2000), stream: body.stream === true };
  } catch {
    return null;
  }
}

async function answerKnowledgeBase(
  request: NextRequest,
  session: NonNullable<Awaited<ReturnType<typeof requireAuthOrDevice>>["session"]>,
  body: KnowledgeBaseRequest,
  requestId: string,
) {
  if (!body.prompt) return json({ error: "prompt is required." }, 400);
  const { answerFromKnowledgeBase } = await import("@/lib/server/rag/kb-answer");
  const { getActiveMeetingForSession } = await import("@/lib/server/meetings");
  const active = await getActiveMeetingForSession(session).catch(() => null);
  // Workspace comes from the signed session, never from the request body.
  const result = await answerFromKnowledgeBase({
    workspaceId: session.workspaceId,
    userId: session.userId,
    question: body.prompt,
    ownMeetingId: active && active.userId === session.userId ? active.id : null,
    signal: request.signal,
  });
  console.info("live_answer_kb", { requestId, status: result.status });

  if (result.status === "service_error") {
    const payload = { error: result.message, code: result.code, retryable: result.retryable, requestId };
    if (!body.stream) return json(payload, 503);
    return new Response(`data: ${JSON.stringify({ type: "error", ...payload })}\n\n`, { headers: sseHeaders() });
  }

  const done = {
    answer: "answer" in result ? result.answer : result.message,
    kbStatus: result.status,
    sourceType: "knowledge_base",
    knowledgeUsed: result.status === "answered" || result.status === "partial",
    sources: "sources" in result ? result.sources : [],
    provider: "provider" in result ? result.provider : null,
    model: "model" in result ? result.model : null,
    notice: "notice" in result ? result.notice || null : null,
    requestId,
  };
  if (!body.stream) return json(done);
  const events = [
    { type: "meta", requestId, sourceType: "knowledge_base" },
    { type: "token", text: done.answer },
    { type: "done", ...done },
  ];
  return new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), { headers: sseHeaders() });
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

  // Knowledge Base mode is answered here only, never by the general pipeline or the API service.
  const kbBody = parseKnowledgeBaseRequest(rawBody);
  if (kbBody) return answerKnowledgeBase(request, session, kbBody, requestId);

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
    if (!local.openai && !local.groq && !local.gemini) {
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
  // A user's own key is used alone; server keys are the default chain.
  const effectiveOpenAiKey =
    userByok?.provider === "openai" ? userByok.apiKey : userByok ? "" : resolveOpenAiApiKey();
  const chainGemini = userByok ? null : credentials;

  if (!userByok && !effectiveOpenAiKey && !effectiveGroqKey && !credentials) {
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
          history?: unknown;
          uncertain?: unknown;
          test?: unknown;
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
    const isTest = body?.test === true;
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

    const history = parseHistory(body?.history);
    let analysis = analyzeQuestion(prompt, {
      history,
      transcript,
      uncertain: body?.uncertain === true,
    });

    if (wantStream && !inlineImage && (userByok || effectiveOpenAiKey || effectiveGroqKey)) {
      const contextStarted = Date.now();
      const ctx = await gatherLiveContext(session, {
        prompt,
        analysis,
        sessionContext,
        history,
        skipKnowledge: body?.skipKnowledge === true,
        kbMaxChars: 700,
        isTest,
      });
      const contextMs = Date.now() - contextStarted;
      const briefing = splitBriefing(ctx.sessionContext, ctx.profileContext);
      analysis = analyzeQuestion(prompt, {
        history: ctx.history,
        transcript,
        uncertain: body?.uncertain === true,
        verifiedContext: briefing.candidate,
        targetRole: briefing.job,
      });

      const system = buildSystemInstruction(
        ctx.profileContext,
        Boolean(ctx.sessionContext) || Boolean(ctx.profileContext),
      );
      const userPrompt = buildUserPrompt({
        prompt,
        transcript,
        mode: mode === "screen" ? "answer" : mode,
        sessionContext: ctx.sessionContext.slice(0, 4500),
        knowledgeContext: ctx.knowledgeContext,
        history: ctx.history,
        analysis: describeAnalysis(analysis, ctx.history),
        grounding: groundingNotes(prompt, analysis, splitBriefing(ctx.sessionContext, ctx.profileContext)),
      });
      const evidence = evidenceText({ ...ctx, transcript });
      const encoder = new TextEncoder();
      const streamStarted = Date.now();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (payload: unknown) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          };
          send({
            type: "meta",
            requestId,
            responseType: analysis.responseType,
            category: analysis.category,
            selectedLanguage: analysis.language,
            languageSource: analysis.languageSource,
            isFollowUp: analysis.isFollowUp,
            contextMs,
          });
          let firstTokenAt = 0;
          let result: Omit<LiveStreamResult, "provider"> & { provider: string };
          const answerPrompt = `${userPrompt}\n\nReply with the speakable answer only. No JSON. No preamble.`;
          const onToken = (token: string) => {
            if (!firstTokenAt) firstTokenAt = Date.now();
            send({ type: "token", text: token });
          };
          try {
            const runAnswer = async (requestPrompt: string, tokenHandler: (token: string) => void) => {
              if (userByok) {
                // The user's saved key is used alone, with the provider, model and endpoint chosen in Settings.
                const { streamWithCredential } = await import("@/lib/server/llm-generate");
                const r = await streamWithCredential(
                  userByok,
                  {
                    system,
                    prompt: requestPrompt,
                    temperature: 0.3,
                    maxOutputTokens: analysis.maxTokens,
                    signal: request.signal,
                  },
                  tokenHandler,
                );
                return { ...r, attempts: [] };
              }
              return streamLiveAnswer({
                system,
                prompt: requestPrompt,
                maxTokens: analysis.maxTokens,
                complexity: analysis.complexity,
                temperature: 0.3,
                signal: request.signal,
                openAiKey: effectiveOpenAiKey,
                groqKey: effectiveGroqKey,
                groqModel: byokGroqModel,
                gemini: chainGemini,
                onToken: tokenHandler,
              });
            };
            const accuracyNotes = perQuestionAccuracyNotes(prompt);
            result = await runAnswer(answerPrompt, accuracyNotes ? () => {} : onToken);
            let accuracyFailures = validateQuestionSpecificAnswer(prompt, result.text);
            if (accuracyFailures.length) {
              result = await runAnswer(
                `${answerPrompt}\n\nYour previous draft failed these deterministic accuracy checks:\n- ${accuracyFailures.join(
                  "\n- ",
                )}\nWrite a fresh, internally consistent answer that satisfies every check. Do not mention the correction.`,
                onToken,
              );
              accuracyFailures = validateQuestionSpecificAnswer(prompt, result.text);
            } else if (accuracyNotes) {
              onToken(result.text);
            }
            if (accuracyFailures.length) {
              console.warn("live_answer_accuracy_guard_failed", { requestId, failures: accuracyFailures });
            }
            const guarded = guardLiveAnswer(result.text, { analysis, context: evidence });
            console.info("live_answer_stream", {
              requestId,
              provider: result.provider,
              model: result.model,
              source: userByok ? "user" : "server",
              responseType: analysis.responseType,
              category: analysis.category,
              followUp: analysis.isFollowUp,
              contextMs,
              ttftMs: firstTokenAt ? firstTokenAt - streamStarted : -1,
              totalMs: Date.now() - streamStarted,
              fallbacks: errorCategory(result as LiveStreamResult, []),
              guard: guarded.changes.join(",") || undefined,
              validation: guarded.validationStatus,
            });
            send({
              type: "done",
              answer: guarded.answer,
              validationStatus: guarded.validationStatus,
              confidence: 0.78,
              model: result.model,
              provider: result.provider,
              requestId,
              responseType: analysis.responseType,
              knowledgeUsed: ctx.knowledgeMeta.knowledgeUsed,
              sourceType: ctx.knowledgeMeta.sourceType,
              sources: ctx.knowledgeMeta.sources,
            });
            const done = { ...result, text: guarded.answer };
            // Usage / history are best-effort and must not delay tokens.
            void (async () => {
              try {
                const { randomUUID } = await import("node:crypto");
                const { recordUsageEvent } = await import("@/lib/server/usage");
                const { getActiveMeetingForSession, appendMeetingExchange } = await import(
                  "@/lib/server/meetings"
                );
                const total = Math.max(1, done.inputTokens + done.outputTokens);
                await recordUsageEvent(session, {
                  type: "tokens",
                  quantity: total,
                  inputTokens: done.inputTokens,
                  outputTokens: done.outputTokens,
                  provider: done.provider,
                  model: done.model,
                  idempotencyKey: `tokens:live_answer_stream:${randomUUID()}`,
                  metadata: { feature: "live_answer_stream", mode, ...(isTest ? { test: true } : {}) },
                });
                const active = isTest ? null : await getActiveMeetingForSession(session);
                if (active?.id && done.text.trim()) {
                  await appendMeetingExchange(active.id, prompt, done.text, {
                    provider: done.provider,
                    model: done.model,
                    source: "auto",
                    questionWho: "Interviewer",
                  });
                }
              } catch {
                // ignore
              }
            })();
          } catch (err) {
            if (request.signal.aborted) return;
            if (userByok) {
              const { classifyAiError } = await import("@/lib/server/ai-router");
              const classified = classifyAiError(err, userByok);
              console.error("live_answer_stream_failed", { requestId, source: "user", code: classified.code, partial: Boolean(firstTokenAt) });
              send({
                type: "error",
                error: firstTokenAt ? "Answer stream interrupted. Ask again if the reply looks incomplete." : classified.message,
                code: classified.code,
                retryable: classified.retryable,
                requestId,
              });
              return;
            }
            const attempts = err instanceof LiveAnswerStreamError ? err.attempts : [];
            console.error("live_answer_stream_failed", {
              requestId,
              partial: err instanceof LiveAnswerStreamError ? err.partial : false,
              attempts: errorCategory(null, attempts),
            });
            send({
              type: "error",
              error:
                err instanceof LiveAnswerStreamError && err.partial
                  ? "Answer stream interrupted. Ask again if the reply looks incomplete."
                  : "AI providers are busy right now. Retry in a moment.",
              retryable: true,
              requestId,
            });
          } finally {
            try {
              controller.close();
            } catch {
              // client already disconnected
            }
          }
        },
      });
      return new Response(stream, { status: 200, headers: sseHeaders() });
    }

    try {
      const { getProfileContext } = await import("@/lib/server/user-profile");
      profileContext = await getProfileContext(session.userId, "full");
    } catch {
      // Personalization is best-effort; never block a live answer.
    }

    try {
      const { describeLiveSessionContext } = await import("@/lib/live-session-config");
      const { resolveAnswerBriefing } = await import("@/lib/server/meetings");
      const resolved = await resolveAnswerBriefing(session);
      meetingId = isTest ? null : resolved.meeting?.id || null;
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

    const briefing = splitBriefing(sessionContext, profileContext);
    analysis = analyzeQuestion(prompt, {
      history,
      transcript,
      uncertain: body?.uncertain === true,
      verifiedContext: briefing.candidate,
      targetRole: briefing.job,
    });

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
        meetingId = isTest ? null : meetingId || resolved.meeting?.id || null;
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
      history,
      analysis: inlineImage || mode !== "answer" ? undefined : describeAnalysis(analysis, history),
      grounding:
        inlineImage || mode !== "answer"
          ? undefined
          : groundingNotes(prompt, analysis, splitBriefing(sessionContext, profileContext)),
    });
    const answerTokens = mode === "answer" && !inlineImage ? analysis.maxTokens : LIVE_ANSWER_MAX_TOKENS;

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
            answer: guardLiveAnswer(local.answer).answer,
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

    const { generateWithCredential, supportsVision } = await import("@/lib/server/llm-generate");
    // Prefer the user's own key; screenshots only go to it when its model accepts images.
    if (userByok && (!preferGemini || supportsVision(userByok.provider, userByok.model))) {
      const byokResult = await generateWithCredential(userByok, {
        system,
        prompt: `${userPrompt}\n\nReturn JSON only: {"answer":"speakable reply","confidence":0.0}`,
        temperature: 0.4,
        maxOutputTokens: answerTokens,
        image: inlineImage || undefined,
        signal: request.signal,
      });
      result = {
        text: byokResult.text,
        model: byokResult.model,
        inputTokens: byokResult.inputTokens,
        outputTokens: byokResult.outputTokens,
      };
      provider = byokResult.provider;
    } else if (!preferGemini && (effectiveOpenAiKey || effectiveGroqKey || chainGemini)) {
      try {
        const chained = await streamLiveAnswer({
          system,
          prompt: `${userPrompt}\n\nReply with the speakable answer only. No JSON. No preamble.`,
          maxTokens: answerTokens,
          complexity: analysis.complexity,
          temperature: 0.3,
          signal: request.signal,
          openAiKey: effectiveOpenAiKey,
          groqKey: effectiveGroqKey,
          groqModel: byokGroqModel,
          gemini: chainGemini,
          onToken: () => undefined,
        });
        result = chained;
        provider = chained.provider;
      } catch (err) {
        if (err instanceof LiveAnswerStreamError) {
          console.error("live_answer_failed", { requestId, attempts: errorCategory(null, err.attempts) });
          return json({ error: "AI providers are busy right now. Retry in a moment.", requestId }, 503);
        }
        throw err;
      }
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
        maxOutputTokens: answerTokens,
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
    const guarded = guardLiveAnswer(answer, {
      analysis: mode === "answer" && !inlineImage ? analysis : undefined,
      context: evidenceText({ sessionContext, profileContext, knowledgeContext, history, transcript }),
    });
    answer = guarded.answer;
    if (guarded.changes.length) console.info("live_answer_guard", { requestId, changes: guarded.changes.join(",") });

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
      model: result.model,
      category: analysis.category,
      selectedLanguage: analysis.language,
      languageSource: analysis.languageSource,
      totalMs: Date.now() - generateStarted,
    });

    return json({
      ok: true,
      answer,
      confidence,
      model: result.model,
      provider,
      requestId,
      category: analysis.category,
      selectedLanguage: analysis.language,
      languageSource: analysis.languageSource,
      validationStatus: guarded.validationStatus,
      knowledgeUsed: knowledgeMeta.knowledgeUsed,
      sourceType: knowledgeMeta.sourceType,
      sources: knowledgeMeta.sources,
      ...(userByok && inlineImage && provider !== userByok.provider
        ? { notice: "Your selected model cannot analyze images, so the workspace vision model was used for this screenshot." }
        : {}),
    });
  } catch (err) {
    const { LlmAuthError, LlmProviderError, BYOK_AUTH_FAILED_MESSAGE } = await import(
      "@/lib/server/llm-generate"
    );
    if (err instanceof LlmAuthError) {
      return json({ error: err.message }, 401);
    }
    if (err instanceof LlmProviderError && userByok) {
      const { classifyAiError } = await import("@/lib/server/ai-router");
      const classified = classifyAiError(err, userByok);
      console.error("live_answer_byok_error", { requestId, code: classified.code });
      return json(
        { error: classified.message, code: classified.code, retryable: classified.retryable, requestId },
        classified.status,
      );
    }
    if (err instanceof GroqError || err instanceof GeminiError) {
      if (err.status === 401 || err.status === 403) {
        return json({ error: BYOK_AUTH_FAILED_MESSAGE }, 401);
      }
      const status = err.status === 429 ? 429 : err.status >= 500 ? 502 : err.status;
      console.error("live_answer_provider_error", { requestId, status: err.status });
      // Provider messages can include org/project identifiers; keep them server-side.
      return json(
        { error: status === 429 ? "AI provider is rate limited. Retry in a moment." : "AI provider error. Retry in a moment.", requestId },
        status,
      );
    }
    console.error("live_answer_error", err);
    return json({ error: "Unexpected live answer error.", requestId }, 500);
  }
}
