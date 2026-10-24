/**
 * OpenAI chat streaming client. Primary live-answer provider when OPENAI_API_KEY is set.
 * Server-only: the key is read from the environment and never returned to clients.
 */

export const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

export const OPENAI_LIVE_MODEL = process.env.OPENAI_LIVE_MODEL?.trim() || "gpt-4.1-mini";

/** Used for coding / multi-part / scenario questions that benefit from a stronger model. */
export const OPENAI_LIVE_MODEL_COMPLEX =
  process.env.OPENAI_LIVE_MODEL_COMPLEX?.trim() || OPENAI_LIVE_MODEL;

/** Abort the primary if no token arrives in time so the fallback still feels live. */
export const OPENAI_FIRST_TOKEN_TIMEOUT_MS = Math.min(
  15_000,
  Math.max(1_500, Number(process.env.OPENAI_FIRST_TOKEN_TIMEOUT_MS || 4_000) || 4_000),
);

export const OPENAI_REQUEST_TIMEOUT_MS = Math.min(
  60_000,
  Math.max(5_000, Number(process.env.OPENAI_TIMEOUT_MS || 25_000) || 25_000),
);

/** Quota / auth failures are not transient — skip OpenAI for this long before retrying. */
const UNAVAILABLE_COOLDOWN_MS = Math.max(
  10_000,
  Number(process.env.OPENAI_UNAVAILABLE_COOLDOWN_MS || 300_000) || 300_000,
);

export class OpenAiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code = "") {
    super(message);
    this.name = "OpenAiError";
    this.status = status;
    this.code = code;
  }
}

let unavailableUntil = 0;
let unavailableReason = "";

export function resolveOpenAiApiKey(): string {
  return process.env.OPENAI_API_KEY?.trim() || "";
}

/** False while a recent quota/auth failure has the provider in cooldown. */
export function openAiAvailable(now = Date.now()): boolean {
  return now >= unavailableUntil;
}

export function openAiCooldownReason(): string {
  return openAiAvailable() ? "" : unavailableReason;
}

export function resetOpenAiCooldown() {
  unavailableUntil = 0;
  unavailableReason = "";
}

function markUnavailable(reason: string) {
  unavailableUntil = Date.now() + UNAVAILABLE_COOLDOWN_MS;
  unavailableReason = reason;
}

/** Non-transient errors: wrong key, no billing credit, model not enabled. */
export function isOpenAiHardFailure(status: number, code: string): boolean {
  return (
    status === 401 ||
    status === 403 ||
    code === "insufficient_quota" ||
    code === "credit_balance_exhausted" ||
    code === "billing_hard_limit_reached"
  );
}

export type OpenAiStreamResult = {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export async function streamOpenAiText(req: {
  system?: string;
  prompt: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  firstTokenTimeoutMs?: number;
  onToken: (token: string) => void;
  apiKey?: string;
}): Promise<OpenAiStreamResult> {
  const apiKey = req.apiKey?.trim() || resolveOpenAiApiKey();
  if (!apiKey) throw new OpenAiError("OpenAI is not configured.", 503, "not_configured");

  const model = req.model?.trim() || OPENAI_LIVE_MODEL;
  const local = new AbortController();
  const firstTokenMs = req.firstTokenTimeoutMs ?? OPENAI_FIRST_TOKEN_TIMEOUT_MS;
  let gotFirst = false;
  let timedOut = false;
  const firstTimer = setTimeout(() => {
    if (!gotFirst) {
      timedOut = true;
      local.abort();
    }
  }, firstTokenMs);
  const signals = [local.signal, AbortSignal.timeout(OPENAI_REQUEST_TIMEOUT_MS)];
  if (req.signal) signals.push(req.signal);
  const signal = AbortSignal.any(signals);

  try {
    let res: Response;
    try {
      res = await fetch(OPENAI_CHAT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          model,
          stream: true,
          stream_options: { include_usage: true },
          temperature: req.temperature ?? 0.3,
          max_completion_tokens: req.maxOutputTokens ?? 500,
          messages: [
            ...(req.system ? [{ role: "system" as const, content: req.system }] : []),
            { role: "user" as const, content: req.prompt },
          ],
        }),
      });
    } catch (err) {
      if (timedOut) throw new OpenAiError("OpenAI first token timed out.", 504, "first_token_timeout");
      if (req.signal?.aborted) throw err;
      const name = err instanceof Error ? err.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new OpenAiError("OpenAI request timed out.", 504, "timeout");
      }
      throw new OpenAiError("OpenAI is unavailable.", 502, "network");
    }

    if (!res.ok || !res.body) {
      const payload = (await res.json().catch(() => ({}))) as {
        error?: { message?: string; code?: string; type?: string };
      };
      const code = payload.error?.code || payload.error?.type || "";
      if (isOpenAiHardFailure(res.status, code)) markUnavailable(code || `http_${res.status}`);
      // Provider messages can echo request details; keep only the status/code.
      throw new OpenAiError(`OpenAI responded with ${res.status}${code ? ` (${code})` : ""}.`, res.status, code);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    let usedModel = model;
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const json = JSON.parse(data) as {
              choices?: { delta?: { content?: string | null } }[];
              usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
              model?: string;
            };
            const token = json.choices?.[0]?.delta?.content || "";
            if (token) {
              if (!gotFirst) {
                gotFirst = true;
                clearTimeout(firstTimer);
              }
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
    } catch (err) {
      if (timedOut) throw new OpenAiError("OpenAI first token timed out.", 504, "first_token_timeout");
      if (req.signal?.aborted) throw err;
      throw new OpenAiError("OpenAI stream interrupted.", 502, "stream_interrupted");
    }

    if (!full.trim()) throw new OpenAiError("OpenAI returned an empty answer.", 502, "empty");
    return { text: full.trim(), model: usedModel, inputTokens, outputTokens };
  } finally {
    clearTimeout(firstTimer);
  }
}
