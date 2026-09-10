/**
 * Groq chat client (OpenAI-compatible). Primary live-answer and resume model.
 * Docs: https://console.groq.com/docs/api-reference
 */

export const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

export const GROQ_DEFAULT_MODEL = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-20b";

const MODEL_FALLBACKS = [
  GROQ_DEFAULT_MODEL,
  "openai/gpt-oss-20b",
  "llama-3.3-70b-versatile",
].filter((v, i, arr) => arr.indexOf(v) === i);

export class GroqError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GroqError";
    this.status = status;
  }
}

export function resolveGroqApiKey(): string {
  return process.env.GROQ_API_KEY?.trim() || "";
}

export type GroqResult = {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export async function generateGroqText(req: {
  system?: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  jsonObject?: boolean;
}): Promise<GroqResult> {
  const apiKey = resolveGroqApiKey();
  if (!apiKey) {
    throw new GroqError("GROQ_API_KEY is not configured on the server.", 503);
  }

  let lastStatus = 502;
  let lastMessage = "Groq did not return an answer.";

  for (const model of MODEL_FALLBACKS) {
    const res = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: req.temperature ?? 0.4,
        max_completion_tokens: req.maxOutputTokens ?? 700,
        ...(req.jsonObject ? { response_format: { type: "json_object" } } : {}),
        messages: [
          ...(req.system ? [{ role: "system" as const, content: req.system }] : []),
          { role: "user" as const, content: req.prompt },
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
      lastStatus = res.status;
      lastMessage = payload.error?.message || `Groq responded with ${res.status}.`;
      console.error("groq_generate_failed", model, res.status, lastMessage.slice(0, 300));
      if (res.status === 401 || res.status === 403 || res.status === 429) {
        throw new GroqError(lastMessage, res.status);
      }
      continue;
    }

    const text = payload.choices?.[0]?.message?.content?.trim() || "";
    if (!text) {
      lastMessage = "Groq returned an empty answer.";
      continue;
    }

    return {
      text,
      model: payload.model || model,
      inputTokens: payload.usage?.prompt_tokens || 0,
      outputTokens: payload.usage?.completion_tokens || 0,
    };
  }

  throw new GroqError(lastMessage, lastStatus);
}
