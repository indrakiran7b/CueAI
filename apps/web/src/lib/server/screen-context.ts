/**
 * Screen Context AI — same keys as Resume Analyzer.
 * PRIMARY: Groq vision (when GROQ_API_KEY present)
 * FALLBACK: Gemini (GEMINI_API_KEY / VERTEX / admin catalog)
 */

import {
  GeminiError,
  generateGeminiText,
  resolveGeminiCredentials,
  type GeminiJsonSchema,
} from "@/lib/server/gemini";
import { resolveGroqApiKey, GROQ_CHAT_URL } from "@/lib/server/groq";

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

const ANSWER_SCHEMA: GeminiJsonSchema = {
  type: "OBJECT",
  properties: {
    answer: { type: "STRING" },
    confidence: { type: "NUMBER" },
  },
  required: ["answer", "confidence"],
};

const GROQ_VISION_MODELS = [
  process.env.GROQ_VISION_MODEL?.trim() || "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta-llama/llama-4-scout-17b-16e-instruct",
].filter((v, i, arr) => v && arr.indexOf(v) === i);

export type ScreenContextResult = {
  answer: string;
  confidence: number;
  model: string;
  provider: "groq" | "gemini";
  inputTokens: number;
  outputTokens: number;
};

function parseAnswer(text: string): { answer: string; confidence: number } {
  try {
    const parsed = JSON.parse(text) as { answer?: unknown; confidence?: unknown };
    if (typeof parsed.answer === "string" && parsed.answer.trim()) {
      const n = typeof parsed.confidence === "number" ? parsed.confidence : Number(parsed.confidence);
      return {
        answer: parsed.answer.trim(),
        confidence: Number.isFinite(n) ? Math.max(0.05, Math.min(1, n > 1 ? n / 100 : n)) : 0.75,
      };
    }
  } catch {
    // raw text
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

async function analyzeWithGroqVision(input: {
  imageDataUrl: string;
  prompt: string;
  signal?: AbortSignal;
}): Promise<ScreenContextResult | null> {
  const apiKey = resolveGroqApiKey();
  if (!apiKey) return null;

  let lastError = "";
  for (const model of GROQ_VISION_MODELS) {
    try {
      const res = await fetch(GROQ_CHAT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: input.signal,
        body: JSON.stringify({
          model,
          temperature: 0.25,
          max_completion_tokens: 500,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SCREEN_CONTEXT_SYSTEM },
            {
              role: "user",
              content: [
                { type: "text", text: input.prompt },
                { type: "image_url", image_url: { url: input.imageDataUrl } },
              ],
            },
          ],
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        choices?: { message?: { content?: string | null } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        error?: { message?: string };
        model?: string;
      };

      if (!res.ok) {
        lastError = payload.error?.message || `Groq vision ${res.status}`;
        console.error("screen_context_groq_failed", model, res.status, lastError.slice(0, 240));
        if (res.status === 401 || res.status === 403 || res.status === 429) break;
        continue;
      }

      const text = payload.choices?.[0]?.message?.content?.trim() || "";
      if (!text) {
        lastError = "Groq returned empty vision answer.";
        continue;
      }

      const parsed = parseAnswer(text);
      if (!parsed.answer) continue;

      return {
        answer: parsed.answer,
        confidence: parsed.confidence,
        model: payload.model || model,
        provider: "groq",
        inputTokens: payload.usage?.prompt_tokens || 0,
        outputTokens: payload.usage?.completion_tokens || 0,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Groq vision error";
      console.error("screen_context_groq_error", lastError.slice(0, 200));
    }
  }

  if (lastError) console.error("screen_context_groq_exhausted", lastError.slice(0, 240));
  return null;
}

/**
 * Legacy in-process screen analysis (Next.js route proxies to FastAPI; kept for tests/tools).
 * Order: Groq vision (primary) → Gemini (fallback).
 */
export async function analyzeScreenContext(input: {
  imageDataUrl: string;
  prompt?: string;
  recentContext?: string;
  signal?: AbortSignal;
}): Promise<ScreenContextResult> {
  const match = input.imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match?.[1] || !match[2]) {
    throw new GeminiError("Invalid screenshot image payload.", 400);
  }
  const mimeType = match[1];
  const data = match[2];
  if (!mimeType.startsWith("image/")) {
    throw new GeminiError("Screenshot must be an image.", 400);
  }

  const userPrompt = buildUserPrompt(input.prompt || "", input.recentContext || "");

  // 1) Groq primary (same GROQ_API_KEY as Resume Analyzer)
  const groq = await analyzeWithGroqVision({
    imageDataUrl: input.imageDataUrl,
    prompt: userPrompt,
    signal: input.signal,
  });
  if (groq) return groq;

  // 2) Gemini fallback (same resolveGeminiCredentials as Resume Analyzer)
  const credentials = await resolveGeminiCredentials();
  if (credentials) {
    const result = await generateGeminiText({
      credentials,
      system: SCREEN_CONTEXT_SYSTEM,
      prompt: userPrompt,
      inlineImage: { mimeType, data },
      temperature: 0.25,
      maxOutputTokens: 500,
      thinkingLevel: "MINIMAL",
      jsonSchema: ANSWER_SCHEMA,
      signal: input.signal,
    });

    const parsed = parseAnswer(result.text);
    if (parsed.answer) {
      return {
        answer: parsed.answer,
        confidence: parsed.confidence,
        model: result.model,
        provider: "gemini",
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
    }
  }

  throw new GeminiError(
    "Unable to analyze the screen. Add GROQ_API_KEY and/or GEMINI_API_KEY (same as Resume Analyzer).",
    503,
  );
}
