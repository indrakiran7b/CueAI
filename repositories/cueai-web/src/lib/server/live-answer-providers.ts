/**
 * Live-answer provider routing: OpenAI (primary) → Groq model chain → Gemini (bounded).
 * A fallback only runs when the previous provider produced no tokens, so the overlay
 * never receives two partial answers spliced together.
 */

import { generateGeminiText, type GeminiCredentials } from "@/lib/server/gemini";
import { GroqError, streamGroqText } from "@/lib/server/groq";
import {
  OPENAI_LIVE_MODEL,
  OPENAI_LIVE_MODEL_COMPLEX,
  OpenAiError,
  openAiAvailable,
  streamOpenAiText,
} from "@/lib/server/openai";

export type LiveProvider = "openai" | "groq" | "gemini";

export type ProviderAttempt = {
  provider: LiveProvider;
  ok: boolean;
  ms: number;
  /** Status / error category only — never provider message bodies. */
  reason?: string;
};

export type LiveStreamResult = {
  text: string;
  provider: LiveProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  attempts: ProviderAttempt[];
};

export class LiveAnswerStreamError extends Error {
  attempts: ProviderAttempt[];
  /** True when some tokens already reached the client before the failure. */
  partial: boolean;
  constructor(message: string, attempts: ProviderAttempt[], partial: boolean) {
    super(message);
    this.name = "LiveAnswerStreamError";
    this.attempts = attempts;
    this.partial = partial;
  }
}

export const GEMINI_LIVE_TIMEOUT_MS = Math.min(
  30_000,
  Math.max(2_000, Number(process.env.GEMINI_LIVE_TIMEOUT_MS || 8_000) || 8_000),
);

/**
 * gpt-oss reasons before answering and those tokens count against the completion limit.
 * Groq also charges max_completion_tokens against the per-minute budget, so keep it tight.
 */
const GROQ_REASONING_HEADROOM = 150;

/** Short Groq rate-limit waits are cheaper than a slower provider. */
const GROQ_MAX_RATE_LIMIT_WAIT_MS = Math.min(
  6_000,
  Math.max(0, Number(process.env.LIVE_GROQ_MAX_WAIT_MS ?? 3_000) || 0),
);

/** After a Gemini failure, skip it for a while instead of burning the full timeout each time. */
const GEMINI_COOLDOWN_MS = Math.max(
  10_000,
  Number(process.env.GEMINI_LIVE_COOLDOWN_MS || 120_000) || 120_000,
);
let geminiUnavailableUntil = 0;

export function resetGeminiCooldown() {
  geminiUnavailableUntil = 0;
}

function reasonOf(err: unknown): string {
  if (err instanceof OpenAiError) return err.code || `http_${err.status}`;
  if (err instanceof GroqError) return `http_${err.status}`;
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) return "timeout";
  return "error";
}

export async function streamLiveAnswer(opts: {
  system: string;
  prompt: string;
  maxTokens: number;
  complexity: "simple" | "complex";
  temperature?: number;
  signal?: AbortSignal;
  onToken: (token: string) => void;
  openAiKey?: string;
  groqKey?: string;
  groqModel?: string;
  gemini?: GeminiCredentials | null;
}): Promise<LiveStreamResult> {
  const attempts: ProviderAttempt[] = [];
  let emitted = false;
  const onToken = (token: string) => {
    emitted = true;
    opts.onToken(token);
  };
  const temperature = opts.temperature ?? 0.3;

  if (opts.openAiKey && openAiAvailable()) {
    const started = Date.now();
    try {
      const r = await streamOpenAiText({
        apiKey: opts.openAiKey,
        model: opts.complexity === "complex" ? OPENAI_LIVE_MODEL_COMPLEX : OPENAI_LIVE_MODEL,
        system: opts.system,
        prompt: opts.prompt,
        temperature,
        maxOutputTokens: opts.maxTokens,
        signal: opts.signal,
        onToken,
      });
      attempts.push({ provider: "openai", ok: true, ms: Date.now() - started });
      return { ...r, provider: "openai", attempts };
    } catch (err) {
      attempts.push({ provider: "openai", ok: false, ms: Date.now() - started, reason: reasonOf(err) });
      if (opts.signal?.aborted) throw err;
      if (emitted) throw new LiveAnswerStreamError("Answer stream interrupted.", attempts, true);
    }
  } else if (opts.openAiKey) {
    attempts.push({ provider: "openai", ok: false, ms: 0, reason: "cooldown" });
  }

  if (opts.groqKey) {
    const started = Date.now();
    try {
      const r = await streamGroqText({
        apiKey: opts.groqKey,
        model: opts.groqModel,
        system: opts.system,
        prompt: opts.prompt,
        temperature,
        maxOutputTokens: opts.maxTokens + GROQ_REASONING_HEADROOM,
        maxRateLimitWaitMs: GROQ_MAX_RATE_LIMIT_WAIT_MS,
        signal: opts.signal,
        onToken,
      });
      attempts.push({ provider: "groq", ok: true, ms: Date.now() - started });
      return { ...r, provider: "groq", attempts };
    } catch (err) {
      attempts.push({ provider: "groq", ok: false, ms: Date.now() - started, reason: reasonOf(err) });
      if (opts.signal?.aborted) throw err;
      if (emitted) throw new LiveAnswerStreamError("Answer stream interrupted.", attempts, true);
    }
  }

  if (opts.gemini && Date.now() < geminiUnavailableUntil) {
    attempts.push({ provider: "gemini", ok: false, ms: 0, reason: "cooldown" });
  } else if (opts.gemini) {
    const started = Date.now();
    try {
      const signals = [AbortSignal.timeout(GEMINI_LIVE_TIMEOUT_MS)];
      if (opts.signal) signals.push(opts.signal);
      const r = await generateGeminiText({
        credentials: opts.gemini,
        system: opts.system,
        prompt: opts.prompt,
        temperature,
        maxOutputTokens: opts.maxTokens,
        thinkingLevel: "MINIMAL",
        signal: AbortSignal.any(signals),
      });
      attempts.push({ provider: "gemini", ok: true, ms: Date.now() - started });
      onToken(r.text);
      return { ...r, provider: "gemini", attempts };
    } catch (err) {
      attempts.push({ provider: "gemini", ok: false, ms: Date.now() - started, reason: reasonOf(err) });
      if (opts.signal?.aborted) throw err;
      geminiUnavailableUntil = Date.now() + GEMINI_COOLDOWN_MS;
    }
  }

  throw new LiveAnswerStreamError(
    attempts.length ? "All AI providers are unavailable right now. Retry in a moment." : "AI provider is not configured.",
    attempts,
    false,
  );
}
