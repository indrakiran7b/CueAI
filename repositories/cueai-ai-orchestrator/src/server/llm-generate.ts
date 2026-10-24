/**
 * Generate text with a resolved BYOK / workspace / env credential.
 * Reuses Groq + Gemini clients; OpenAI-compatible for other providers.
 */

import type { ResolvedCredential } from "@/lib/server/credential-resolver";
import { markCredentialUsed } from "@/lib/server/credential-resolver";
import { DEFAULT_ENDPOINTS } from "@/lib/server/ai-config";

export const BYOK_AUTH_FAILED_MESSAGE =
  "API key authentication failed.\n\nPlease check your API key in:\nSettings → API Keys";

export const BYOK_MISSING_MESSAGE =
  "No API key is configured for this provider.\nPlease add an API key in Settings → API Keys.";

export class LlmAuthError extends Error {
  status: number;
  constructor(message = BYOK_AUTH_FAILED_MESSAGE, status = 401) {
    super(message);
    this.name = "LlmAuthError";
    this.status = status;
  }
}

/** Non-auth provider failure. `message` is provider text for server logs only. */
export class LlmProviderError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "LlmProviderError";
    this.status = status;
  }
}

export type LlmGenerateResult = {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  provider: string;
  source: ResolvedCredential["source"];
};

export type LlmImage = { mimeType: string; data: string };

export type LlmGenerateRequest = {
  system?: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** Base64 image; only send to vision-capable models (see supportsVision). */
  image?: LlmImage;
  jsonObject?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
};

function isAuthStatus(status: number | undefined): boolean {
  return status === 401 || status === 403;
}

function requestSignal(req: LlmGenerateRequest, fallbackMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(req.timeoutMs ?? fallbackMs);
  if (!req.signal) return timeout;
  return typeof AbortSignal.any === "function" ? AbortSignal.any([req.signal, timeout]) : req.signal;
}

/** Conservative allow-list: only models documented as accepting image input. */
export function supportsVision(provider: string, model: string): boolean {
  const m = model.toLowerCase();
  if (provider === "gemini") return true;
  if (provider === "openai") return /^(gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-5|o1|o3|o4)/.test(m);
  if (provider === "anthropic") return /claude-(3|sonnet-4|opus-4|haiku-4)/.test(m);
  if (provider === "openrouter") {
    return /(gpt-4o|gpt-4\.1|claude-3|claude-sonnet-4|gemini)/.test(m);
  }
  return false;
}

export async function generateWithCredential(
  cred: ResolvedCredential,
  req: LlmGenerateRequest,
): Promise<LlmGenerateResult> {
  const temperature = req.temperature ?? 0.3;
  const maxOutputTokens = req.maxOutputTokens ?? 900;
  if (req.image && !supportsVision(cred.provider, cred.model)) {
    throw new LlmProviderError(`Model ${cred.model} does not accept images.`, 422);
  }

  if (cred.provider === "groq") {
    const { generateGroqText, GroqError } = await import("@/lib/server/groq");
    try {
      const result = await generateGroqText({
        system: req.system,
        prompt: req.prompt,
        temperature,
        maxOutputTokens,
        jsonObject: req.jsonObject,
        apiKey: cred.apiKey,
        model: cred.model || undefined,
        signal: requestSignal(req, 45_000),
      });
      await markCredentialUsed(cred.credentialId);
      return {
        text: result.text,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        provider: "groq",
        source: cred.source,
      };
    } catch (err) {
      if (err instanceof GroqError) {
        if (isAuthStatus(err.status)) throw new LlmAuthError(undefined, err.status);
        throw new LlmProviderError(err.message, err.status);
      }
      throw err;
    }
  }

  if (cred.provider === "gemini") {
    const { generateGeminiText, GeminiError } = await import("@/lib/server/gemini");
    try {
      const result = await generateGeminiText({
        credentials: {
          apiKey: cred.apiKey,
          endpoint: cred.endpoint || DEFAULT_ENDPOINTS.gemini,
          model: cred.model || "gemini-flash-latest",
          backend: "studio",
          source: cred.source === "env" ? "env" : "workspace",
        },
        prompt: req.prompt,
        system: req.system,
        temperature,
        maxOutputTokens,
        inlineImage: req.image,
        thinkingLevel: "MINIMAL",
        signal: requestSignal(req, 45_000),
      });
      await markCredentialUsed(cred.credentialId);
      return {
        text: result.text,
        model: result.model || cred.model,
        inputTokens: result.inputTokens || 0,
        outputTokens: result.outputTokens || 0,
        provider: "gemini",
        source: cred.source,
      };
    } catch (err) {
      if (err instanceof GeminiError) {
        if (isAuthStatus(err.status)) throw new LlmAuthError(undefined, err.status);
        throw new LlmProviderError(err.message, err.status);
      }
      throw err;
    }
  }

  if (cred.provider === "anthropic") {
    const result = await generateAnthropic(cred, req, temperature, maxOutputTokens);
    await markCredentialUsed(cred.credentialId);
    return { ...result, provider: "anthropic", source: cred.source };
  }

  // OpenAI-compatible: openai, openrouter, deepseek, perplexity
  const result = await generateOpenAiCompatible(cred, req, temperature, maxOutputTokens);
  await markCredentialUsed(cred.credentialId);
  return { ...result, provider: cred.provider, source: cred.source };
}

/**
 * Stream text with a resolved credential. Groq and OpenAI-compatible providers stream
 * token by token; Gemini and Anthropic deliver the whole answer as one chunk.
 */
export async function streamWithCredential(
  cred: ResolvedCredential,
  req: Omit<LlmGenerateRequest, "image" | "jsonObject">,
  onToken: (token: string) => void,
): Promise<LlmGenerateResult> {
  const temperature = req.temperature ?? 0.3;
  const maxOutputTokens = req.maxOutputTokens ?? 900;

  if (cred.provider === "groq") {
    const { streamGroqText, GroqError } = await import("@/lib/server/groq");
    try {
      const result = await streamGroqText({
        system: req.system,
        prompt: req.prompt,
        temperature,
        // gpt-oss reasoning tokens count against the completion budget.
        maxOutputTokens: maxOutputTokens + 200,
        apiKey: cred.apiKey,
        model: cred.model || undefined,
        maxRateLimitWaitMs: 3_000,
        signal: req.signal,
        onToken,
      });
      await markCredentialUsed(cred.credentialId);
      return { ...result, provider: "groq", source: cred.source };
    } catch (err) {
      if (err instanceof GroqError) {
        if (isAuthStatus(err.status)) throw new LlmAuthError(undefined, err.status);
        throw new LlmProviderError(err.message, err.status);
      }
      throw err;
    }
  }

  if (cred.provider === "gemini" || cred.provider === "anthropic") {
    const result = await generateWithCredential(cred, req);
    onToken(result.text);
    return result;
  }

  const base = (cred.endpoint || DEFAULT_ENDPOINTS[cred.provider] || "").replace(/\/$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cred.apiKey}`,
      "Content-Type": "application/json",
      ...(cred.provider === "openai" && cred.organizationId ? { "OpenAI-Organization": cred.organizationId } : {}),
      ...(cred.provider === "openrouter"
        ? { "HTTP-Referer": process.env.NEXTAUTH_URL || "https://cueai.local", "X-Title": "CueAI" }
        : {}),
    },
    body: JSON.stringify({
      model: cred.model,
      temperature,
      max_tokens: maxOutputTokens,
      stream: true,
      messages: [
        ...(req.system ? [{ role: "system" as const, content: req.system }] : []),
        { role: "user" as const, content: req.prompt },
      ],
    }),
    signal: requestSignal(req, 60_000),
  });
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    if (isAuthStatus(res.status)) throw new LlmAuthError(undefined, res.status);
    throw new LlmProviderError(body.error?.message || `Provider responded with ${res.status}`, res.status || 502);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let inputTokens = 0;
  let outputTokens = 0;
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
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const token = json.choices?.[0]?.delta?.content || "";
        if (token) {
          full += token;
          onToken(token);
        }
        if (json.usage) {
          inputTokens = json.usage.prompt_tokens || inputTokens;
          outputTokens = json.usage.completion_tokens || outputTokens;
        }
      } catch {
        // ignore malformed SSE lines
      }
    }
  }
  if (!full.trim()) throw new LlmProviderError("Provider returned an empty answer.", 502);
  await markCredentialUsed(cred.credentialId);
  return { text: full.trim(), model: cred.model, inputTokens, outputTokens, provider: cred.provider, source: cred.source };
}

async function generateOpenAiCompatible(
  cred: ResolvedCredential,
  req: LlmGenerateRequest,
  temperature: number,
  maxOutputTokens: number,
): Promise<Omit<LlmGenerateResult, "provider" | "source">> {
  const base = (cred.endpoint || DEFAULT_ENDPOINTS[cred.provider] || "").replace(/\/$/, "");
  const userContent = req.image
    ? [
        { type: "text", text: req.prompt },
        {
          type: "image_url",
          image_url: { url: `data:${req.image.mimeType || "image/png"};base64,${req.image.data}` },
        },
      ]
    : req.prompt;
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cred.apiKey}`,
      "Content-Type": "application/json",
      ...(cred.provider === "openai" && cred.organizationId
        ? { "OpenAI-Organization": cred.organizationId }
        : {}),
      ...(cred.provider === "openrouter"
        ? {
            "HTTP-Referer": process.env.NEXTAUTH_URL || "https://cueai.local",
            "X-Title": "CueAI",
          }
        : {}),
    },
    body: JSON.stringify({
      model: cred.model,
      temperature,
      max_tokens: maxOutputTokens,
      ...(req.jsonObject ? { response_format: { type: "json_object" } } : {}),
      messages: [
        ...(req.system ? [{ role: "system" as const, content: req.system }] : []),
        { role: "user" as const, content: userContent },
      ],
    }),
    signal: requestSignal(req, 45_000),
  });
  const body = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string };
  };
  if (!res.ok) {
    if (isAuthStatus(res.status)) throw new LlmAuthError(undefined, res.status);
    throw new LlmProviderError(body.error?.message || `Provider responded with ${res.status}`, res.status);
  }
  const text = (body.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new LlmProviderError("Provider returned an empty answer.", 502);
  return {
    text,
    model: cred.model,
    inputTokens: body.usage?.prompt_tokens || 0,
    outputTokens: body.usage?.completion_tokens || 0,
  };
}

async function generateAnthropic(
  cred: ResolvedCredential,
  req: LlmGenerateRequest,
  temperature: number,
  maxOutputTokens: number,
): Promise<Omit<LlmGenerateResult, "provider" | "source">> {
  const base = (cred.endpoint || DEFAULT_ENDPOINTS.anthropic || "").replace(/\/$/, "");
  const content = req.image
    ? [
        {
          type: "image",
          source: { type: "base64", media_type: req.image.mimeType || "image/png", data: req.image.data },
        },
        { type: "text", text: req.prompt },
      ]
    : req.prompt;
  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": cred.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cred.model,
      max_tokens: maxOutputTokens,
      temperature,
      system: req.system || undefined,
      messages: [{ role: "user", content }],
    }),
    signal: requestSignal(req, 45_000),
  });
  const body = (await res.json().catch(() => ({}))) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
    error?: { message?: string };
  };
  if (!res.ok) {
    if (isAuthStatus(res.status)) throw new LlmAuthError(undefined, res.status);
    throw new LlmProviderError(body.error?.message || `Provider responded with ${res.status}`, res.status);
  }
  const text = (body.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text || "")
    .join("")
    .trim();
  if (!text) throw new LlmProviderError("Provider returned an empty answer.", 502);
  return {
    text,
    model: cred.model,
    inputTokens: body.usage?.input_tokens || 0,
    outputTokens: body.usage?.output_tokens || 0,
  };
}
