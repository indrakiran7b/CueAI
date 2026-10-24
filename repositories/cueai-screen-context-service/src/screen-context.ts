/**
 * Screen Context AI (in-process path). Uses the shared AI router so a user's own
 * vision-capable key is honored, and only vision models ever receive the screenshot.
 */

import { AiRouterError, generateAi, parseJsonReply } from "@/lib/server/ai-router";

export const SCREEN_CONTEXT_SYSTEM = `You are CueAI Screen Context Assistant.

Analyze the provided screenshot carefully.

Identify the main question, task, problem, or information the user needs help with.

Ignore unrelated UI elements, browser chrome, advertisements, navigation, decorative content, and any CueAI overlay remnants.

If the screenshot contains an interview question, answer it directly and professionally.

If it contains a coding problem:
- understand the complete problem
- explain the approach briefly
- provide correct code when appropriate

If it contains a multiple-choice question:
- identify the question
- identify the available options
- provide the selected answer
- briefly explain why

If it contains a technical question:
- provide an accurate technical answer
- do not invent information

If the screenshot is ambiguous or the text is unreadable:
- say exactly what is unclear
- do not fabricate the missing information

Answer the user's visible question rather than merely describing the screenshot.

Keep answers medium-depth and interview-ready (roughly 80–180 words for typical questions). Prefer under 250 words unless code is required.`;

export type ScreenContextResult = {
  answer: string;
  confidence: number;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  notice?: string;
};

export class ScreenContextError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code = "invalid_request") {
    super(message);
    this.name = "ScreenContextError";
    this.status = status;
    this.code = code;
  }
}

function parseAnswer(text: string): { answer: string; confidence: number } {
  const parsed = parseJsonReply<{ answer?: unknown; confidence?: unknown }>(text);
  if (parsed && typeof parsed.answer === "string" && parsed.answer.trim()) {
    const n = typeof parsed.confidence === "number" ? parsed.confidence : Number(parsed.confidence);
    return {
      answer: parsed.answer.trim(),
      confidence: Number.isFinite(n) ? Math.max(0.05, Math.min(1, n > 1 ? n / 100 : n)) : 0.75,
    };
  }
  return { answer: text.trim(), confidence: 0.7 };
}

function buildUserPrompt(extraPrompt: string, recentContext: string) {
  return [
    "SCREENSHOT ANALYSIS TASK:",
    extraPrompt.trim() ||
      "Analyze the screenshot and identify the question or task. Answer it directly and accurately.",
    recentContext
      ? `\nRecent CueAI context (secondary only; screenshot is primary):\n${recentContext.slice(0, 1200)}`
      : "",
    "",
    'Return JSON only: {"answer":"...","confidence":0.0}',
  ]
    .filter(Boolean)
    .join("\n");
}

export async function analyzeScreenContext(input: {
  imageDataUrl: string;
  prompt?: string;
  recentContext?: string;
  signal?: AbortSignal;
  userId?: string | null;
  workspaceId?: string | null;
}): Promise<ScreenContextResult> {
  const match = input.imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match?.[1] || !match[2]) {
    throw new ScreenContextError("Invalid screenshot image payload.", 400);
  }
  const mimeType = match[1];
  if (!mimeType.startsWith("image/")) {
    throw new ScreenContextError("Screenshot must be an image.", 400);
  }

  try {
    const result = await generateAi({
      feature: "screen_context",
      userId: input.userId,
      workspaceId: input.workspaceId,
      system: SCREEN_CONTEXT_SYSTEM,
      prompt: buildUserPrompt(input.prompt || "", input.recentContext || ""),
      image: { mimeType, data: match[2] },
      temperature: 0.25,
      maxOutputTokens: 600,
      signal: input.signal,
      timeoutMs: 45_000,
    });
    const parsed = parseAnswer(result.text);
    if (!parsed.answer) {
      throw new ScreenContextError("The vision model returned an empty answer. Please retry.", 502, "provider_error");
    }
    return {
      answer: parsed.answer,
      confidence: parsed.confidence,
      model: result.model,
      provider: result.provider,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: result.latencyMs,
      notice: result.notice,
    };
  } catch (err) {
    if (err instanceof AiRouterError) throw new ScreenContextError(err.message, err.status, err.code);
    throw err;
  }
}
