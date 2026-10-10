/**
 * Groq chat client (OpenAI-compatible). Primary live-answer and resume model.
 * Docs: https://console.groq.com/docs/api-reference
 */

export const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

export const GROQ_DEFAULT_MODEL = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-20b";

const MODEL_FALLBACKS = [
  GROQ_DEFAULT_MODEL,
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
].filter((v, i, arr) => arr.indexOf(v) === i);

/** Live overlay streaming uses the same configured Groq family (retired Llama IDs 404). */
const STREAM_MODEL_FALLBACKS = [
  process.env.GROQ_STREAM_MODEL?.trim() || GROQ_DEFAULT_MODEL,
  "openai/gpt-oss-20b",
  GROQ_DEFAULT_MODEL,
].filter((v, i, arr) => v && arr.indexOf(v) === i);

export class GroqError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GroqError";
    this.status = status;
  }
}

export const GROQ_REQUEST_TIMEOUT_MS = Math.min(
  30_000,
  Math.max(3_000, Number(process.env.GROQ_TIMEOUT_MS || 12_000) || 12_000),
);

export function isRetryableGroqStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function groqAbortSignal(existing?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(GROQ_REQUEST_TIMEOUT_MS);
  if (!existing) return timeout;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([existing, timeout]);
  }
  return existing.aborted ? existing : timeout;
}

function classifyFetchError(err: unknown): GroqError {
  const name = err instanceof Error ? err.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return new GroqError("Groq request timed out.", 504);
  }
  return new GroqError("Groq is unavailable.", 502);
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
    let res: Response;
    try {
      res = await fetch(GROQ_CHAT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: groqAbortSignal(),
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
    } catch (err) {
      throw classifyFetchError(err);
    }

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
      if (res.status === 404) {
        continue;
      }
      throw new GroqError(lastMessage, res.status);
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

/**
 * Stream plain-text tokens from Groq (OpenAI-compatible SSE).
 * Prefer this for live overlay latency; caller accumulates the full answer.
 */
export async function streamGroqText(req: {
  system?: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  onToken: (token: string) => void;
}): Promise<GroqResult> {
  const apiKey = resolveGroqApiKey();
  if (!apiKey) {
    throw new GroqError("GROQ_API_KEY is not configured on the server.", 503);
  }

  let lastStatus = 502;
  let lastMessage = "Groq did not return an answer.";

  for (const model of STREAM_MODEL_FALLBACKS) {
    let res: Response;
    try {
      res = await fetch(GROQ_CHAT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: groqAbortSignal(req.signal),
        body: JSON.stringify({
          model,
          temperature: req.temperature ?? 0.3,
          max_completion_tokens: req.maxOutputTokens ?? 160,
          stream: true,
          messages: [
            ...(req.system ? [{ role: "system" as const, content: req.system }] : []),
            { role: "user" as const, content: req.prompt },
          ],
        }),
      });
    } catch (err) {
      throw classifyFetchError(err);
    }

    if (!res.ok || !res.body) {
      const payload = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      lastStatus = res.status;
      lastMessage = payload.error?.message || `Groq responded with ${res.status}.`;
      console.error("groq_stream_failed", model, res.status, lastMessage.slice(0, 300));
      if (res.status === 404) {
        continue;
      }
      throw new GroqError(lastMessage, res.status);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let usedModel = model;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n");
      buffer = parts.pop() || "";
      for (const rawLine of parts) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const json = JSON.parse(data) as {
            choices?: { delta?: { content?: string | null } }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number };
            model?: string;
          };
          const token = json.choices?.[0]?.delta?.content || "";
          if (token) {
            full += token;
            req.onToken(token);
          }
          if (json.model) usedModel = json.model;
          if (json.usage) {
            inputTokens = json.usage.prompt_tokens || inputTokens;
            outputTokens = json.usage.completion_tokens || outputTokens;
          }
        } catch {
          // ignore malformed SSE lines
        }
      }
    }

    if (!full.trim()) {
      lastMessage = "Groq returned an empty streamed answer.";
      continue;
    }

    return {
      text: full.trim(),
      model: usedModel,
      inputTokens,
      outputTokens,
    };
  }

  throw new GroqError(lastMessage, lastStatus);
}
