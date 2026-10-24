/**
 * Shared server-side AI router for every CueAI feature.
 * Selects credentials (user → workspace → app-managed), applies vision checks,
 * classifies provider failures, and never reports success when all providers fail.
 */

import type { ApiCredentialCapability } from "@/lib/server/db";
import { PROVIDER_LABELS } from "@/lib/server/ai-config";
import {
  resolveCredentialChain,
  type ResolvedCredential,
} from "@/lib/server/credential-resolver";
import {
  generateWithCredential,
  LlmAuthError,
  LlmProviderError,
  supportsVision,
  type LlmGenerateRequest,
  type LlmGenerateResult,
} from "@/lib/server/llm-generate";

export type AiFeature =
  | "live_answer"
  | "mock_interview"
  | "meeting_summary"
  | "screen_context"
  | "knowledge"
  | "translation"
  | "resume";

export type AiErrorCode =
  | "not_configured"
  | "invalid_credentials"
  | "missing_permissions"
  | "rate_limited"
  | "timeout"
  | "network_error"
  | "unsupported_model"
  | "vision_unsupported"
  | "cancelled"
  | "provider_error";

const FEATURE_CAPABILITY: Record<AiFeature, ApiCredentialCapability> = {
  live_answer: "live_session",
  mock_interview: "live_session",
  meeting_summary: "general_ai",
  screen_context: "general_ai",
  knowledge: "rag",
  translation: "general_ai",
  resume: "general_ai",
};

const HTTP_STATUS: Record<AiErrorCode, number> = {
  not_configured: 503,
  invalid_credentials: 502,
  missing_permissions: 502,
  rate_limited: 429,
  timeout: 504,
  network_error: 502,
  unsupported_model: 422,
  vision_unsupported: 422,
  cancelled: 499,
  provider_error: 502,
};

export class AiRouterError extends Error {
  code: AiErrorCode;
  status: number;
  provider?: string;
  retryable: boolean;
  constructor(code: AiErrorCode, message: string, provider?: string) {
    super(message);
    this.name = "AiRouterError";
    this.code = code;
    this.status = HTTP_STATUS[code];
    this.provider = provider;
    this.retryable = code === "rate_limited" || code === "timeout" || code === "network_error" || code === "provider_error";
  }
}

export type AiRouterResult = LlmGenerateResult & {
  latencyMs: number;
  /** Set when the user's own key could not serve the request (e.g. no vision) and an authorized fallback did. */
  notice?: string;
};

function label(provider?: string) {
  return (provider && PROVIDER_LABELS[provider]) || provider || "The AI provider";
}

/** Map any provider failure to a safe, user-facing error. Provider text is never surfaced. */
export function classifyAiError(err: unknown, cred?: Pick<ResolvedCredential, "provider" | "model" | "source">): AiRouterError {
  if (err instanceof AiRouterError) return err;
  const provider = cred?.provider;
  const name = label(provider);
  const keyHint =
    cred?.source === "user" ? " Update it in Settings → API Keys." : " Ask your workspace admin to check the AI configuration.";
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return err.name === "AbortError"
      ? new AiRouterError("cancelled", "The request was cancelled.", provider)
      : new AiRouterError("timeout", `${name} took too long to respond. Please retry.`, provider);
  }
  const status =
    err instanceof LlmAuthError || err instanceof LlmProviderError
      ? err.status
      : typeof (err as { status?: unknown })?.status === "number"
        ? ((err as { status: number }).status)
        : 0;
  const raw = err instanceof Error ? err.message : "";
  if (status === 401) return new AiRouterError("invalid_credentials", `${name} rejected the API key.${keyHint}`, provider);
  if (status === 403) {
    return new AiRouterError("missing_permissions", `The ${name} API key lacks permission for this model or feature.${keyHint}`, provider);
  }
  if (status === 429) return new AiRouterError("rate_limited", `${name} rate limit reached. Wait a moment and retry.`, provider);
  if (status === 408 || status === 504) return new AiRouterError("timeout", `${name} took too long to respond. Please retry.`, provider);
  if (status === 404 || (status === 400 && /model/i.test(raw)) || (status === 422 && /image|vision/i.test(raw))) {
    return status === 422
      ? new AiRouterError("vision_unsupported", `${cred?.model || "This model"} cannot analyze images.`, provider)
      : new AiRouterError("unsupported_model", `The model ${cred?.model || ""} is not available for this ${name} key.`.replace("  ", " "), provider);
  }
  if (status === 502 && /unavailable|fetch failed|ECONN|ENOTFOUND/i.test(raw)) {
    return new AiRouterError("network_error", `Couldn't reach ${name}. Check the connection and retry.`, provider);
  }
  if (err instanceof TypeError && /fetch/i.test(raw)) {
    return new AiRouterError("network_error", `Couldn't reach ${name}. Check the connection and retry.`, provider);
  }
  return new AiRouterError("provider_error", `${name} returned an error. Please retry.`, provider);
}

function isJsonModeRejection(err: unknown) {
  return err instanceof LlmProviderError && err.status === 400 && /json/i.test(err.message);
}

/** Errors on one app-managed provider that justify trying the next one. */
function shouldTryNext(err: AiRouterError) {
  return err.code !== "cancelled";
}

export type AiGenerateInput = Omit<LlmGenerateRequest, "image"> & {
  feature: AiFeature;
  userId?: string | null;
  workspaceId?: string | null;
  /** Explicit user credential selection (Settings → API Keys id). */
  credentialId?: string | null;
  image?: LlmGenerateRequest["image"];
};

/**
 * Generate text for a CueAI feature.
 * Throws AiRouterError when no provider is configured or every candidate fails.
 */
export async function generateAi(input: AiGenerateInput): Promise<AiRouterResult> {
  const capability = FEATURE_CAPABILITY[input.feature];
  let chain = await resolveCredentialChain({
    userId: input.userId,
    workspaceId: input.workspaceId,
    capability,
    credentialId: input.credentialId,
  });
  let notice: string | undefined;

  if (input.image) {
    const visionCapable = chain.candidates.filter((c) => supportsVision(c.provider, c.model));
    if (chain.userOwned && !visionCapable.length && chain.candidates.length) {
      const own = chain.candidates[0]!;
      const appChain = await resolveCredentialChain({ workspaceId: input.workspaceId, capability });
      const appVision = appChain.candidates.filter((c) => supportsVision(c.provider, c.model));
      if (!appVision.length) {
        throw new AiRouterError(
          "vision_unsupported",
          `Your selected model (${label(own.provider)} ${own.model}) cannot analyze images, and no workspace vision model is configured. Choose a vision-capable model such as Gemini or GPT-4o in Settings → API Keys.`,
          own.provider,
        );
      }
      notice = `${label(own.provider)} ${own.model} cannot analyze images, so the workspace vision model was used for this screenshot.`;
      chain = { userOwned: false, candidates: appVision };
    } else {
      chain = { ...chain, candidates: visionCapable };
      if (!chain.candidates.length) {
        throw new AiRouterError("vision_unsupported", "No vision-capable AI model is configured for screen analysis.");
      }
    }
  }

  if (!chain.candidates.length) {
    throw new AiRouterError(
      "not_configured",
      chain.userOwned
        ? "Your saved API key could not be read. Re-enter it in Settings → API Keys."
        : "No AI provider is configured. Add an API key in Settings → API Keys or ask your workspace admin to configure one.",
    );
  }

  let last: AiRouterError | null = null;
  for (const cred of chain.candidates) {
    const started = Date.now();
    try {
      let result;
      try {
        result = await generateWithCredential(cred, input);
      } catch (err) {
        if (!(input.jsonObject && isJsonModeRejection(err))) throw err;
        // Some providers (e.g. Groq) reject strict JSON mode intermittently; callers parse JSON from plain text.
        result = await generateWithCredential(cred, { ...input, jsonObject: false });
      }
      if (!result.text.trim()) throw new LlmProviderError("Empty answer.", 502);
      return { ...result, latencyMs: Date.now() - started, notice };
    } catch (err) {
      last = classifyAiError(err, cred);
      console.warn("[AI_ROUTER] provider_failed", {
        feature: input.feature,
        provider: cred.provider,
        source: cred.source,
        code: last.code,
      });
      if (chain.userOwned || !shouldTryNext(last)) break;
    }
  }
  throw last ?? new AiRouterError("provider_error", "The AI provider returned an error. Please retry.");
}

/** JSON body for API routes: `{ error: { code, message, retryable } }`. */
export function aiErrorBody(err: AiRouterError) {
  return { error: { code: err.code, message: err.message, retryable: err.retryable, provider: err.provider || null } };
}

/** Parse a JSON object out of a model reply (tolerates ```json fences and prose). */
export function parseJsonReply<T>(text: string): T | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}
