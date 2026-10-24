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

/**
 * Live overlay streaming chain. Groq rate limits (TPM) are per model, so a 429 on
 * one model falls through to the next instead of a slower provider.
 */
export const STREAM_MODEL_FALLBACKS = [
  process.env.GROQ_STREAM_MODEL?.trim() || GROQ_DEFAULT_MODEL,
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  GROQ_DEFAULT_MODEL,
].filter((v, i, arr) => v && arr.indexOf(v) === i);

/** gpt-oss models reason before answering; low effort keeps live TTFT and TPM down. */
function reasoningParams(model: string): { reasoning_effort?: string } {
  if (!/^openai\/gpt-oss/.test(model)) return {};
  const effort = process.env.GROQ_REASONING_EFFORT?.trim() || "low";
  return { reasoning_effort: effort };
}

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
  /** Override env key (BYOK / resolver). */
  apiKey?: string;
  /** Prefer this model first when provided. */
  model?: string;
  signal?: AbortSignal;
}): Promise<GroqResult> {
  const apiKey = req.apiKey?.trim() || resolveGroqApiKey();
  if (!apiKey) {
    throw new GroqError("AI provider is not configured.", 503);
  }

  let lastStatus = 502;
  let lastMessage = "Groq did not return an answer.";
  const preferredModel = req.model?.trim() || "";
  const models = preferredModel
    ? [preferredModel, ...MODEL_FALLBACKS.filter((m) => m !== preferredModel)]
    : MODEL_FALLBACKS;

  for (const model of models) {
    console.log("[GROQ] Request started");
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

    console.log("[GROQ] First token received");
    console.log("[GROQ] Stream completed");
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
  apiKey?: string;
  model?: string;
  /** Explicit model chain; defaults to the preferred model + STREAM_MODEL_FALLBACKS. */
  models?: string[];
  /**
   * When every model is rate limited and Groq asks to wait at most this long,
   * wait once and retry the soonest-available model instead of failing.
   */
  maxRateLimitWaitMs?: number;
}): Promise<GroqResult> {
  const apiKey = req.apiKey?.trim() || resolveGroqApiKey();
  if (!apiKey) {
    throw new GroqError("AI provider is not configured.", 503);
  }

  let lastStatus = 502;
  let lastMessage = "Groq did not return an answer.";
  const preferredStreamModel = req.model?.trim() || "";
  const models = req.models?.length
    ? req.models.filter((v, i, arr) => v && arr.indexOf(v) === i)
    : preferredStreamModel
      ? [
          preferredStreamModel,
          ...STREAM_MODEL_FALLBACKS.filter((m) => m !== preferredStreamModel),
        ]
      : STREAM_MODEL_FALLBACKS;
  const rateLimited: { model: string; waitMs: number }[] = [];

  for (const model of models) {
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
          ...reasoningParams(model),
          messages: [
            ...(req.system ? [{ role: "system" as const, content: req.system }] : []),
            { role: "user" as const, content: req.prompt },
          ],
        }),
      });
    } catch (err) {
      if (req.signal?.aborted) throw classifyFetchError(err);
      const classified = classifyFetchError(err);
      lastStatus = classified.status;
      lastMessage = classified.message;
      console.error("groq_stream_failed", model, classified.status, classified.message);
      continue;
    }

    if (!res.ok || !res.body) {
      const payload = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      lastStatus = res.status;
      lastMessage = payload.error?.message || `Groq responded with ${res.status}.`;
      console.error("groq_stream_failed", model, res.status, lastMessage.slice(0, 300));
      if (res.status === 429) {
        rateLimited.push({ model, waitMs: rateLimitWaitMs(res.headers, lastMessage) });
      }
      // Nothing has streamed yet, so the next model cannot duplicate output.
      if (res.status === 404 || isRetryableGroqStatus(res.status)) {
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

  const maxWait = req.maxRateLimitWaitMs ?? 0;
  if (lastStatus === 429 && maxWait > 0 && rateLimited.length && !req.signal?.aborted) {
    const soonest = rateLimited.reduce((a, b) => (b.waitMs < a.waitMs ? b : a));
    if (soonest.waitMs <= maxWait) {
      await new Promise((resolve) => setTimeout(resolve, soonest.waitMs + 100));
      if (!req.signal?.aborted) {
        return streamGroqText({ ...req, models: [soonest.model], maxRateLimitWaitMs: 0 });
      }
    }
  }

  throw new GroqError(lastMessage, lastStatus);
}

/** Groq sends retry-after (seconds) and "try again in 1.65s" / "in 899.99ms" in the message. */
export function rateLimitWaitMs(headers: Headers, message: string): number {
  const header = Number(headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return Math.ceil(header * 1000);
  const m = message.match(/try again in ([\d.]+)\s*(ms|s)\b/i);
  if (m?.[1]) return Math.ceil(Number(m[1]) * (m[2]?.toLowerCase() === "ms" ? 1 : 1000));
  return Number.POSITIVE_INFINITY;
}
