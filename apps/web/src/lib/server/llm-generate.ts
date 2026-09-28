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
  status = 401;
  constructor(message = BYOK_AUTH_FAILED_MESSAGE) {
    super(message);
    this.name = "LlmAuthError";
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

function isAuthStatus(status: number | undefined): boolean {
  return status === 401 || status === 403;
}

export async function generateWithCredential(
  cred: ResolvedCredential,
  req: {
    system?: string;
    prompt: string;
    temperature?: number;
    maxOutputTokens?: number;
  },
): Promise<LlmGenerateResult> {
  const temperature = req.temperature ?? 0.3;
  const maxOutputTokens = req.maxOutputTokens ?? 900;

  try {
    if (cred.provider === "groq") {
      const { generateGroqText, GroqError } = await import("@/lib/server/groq");
      try {
        const result = await generateGroqText({
          system: req.system,
          prompt: req.prompt,
          temperature,
          maxOutputTokens,
          apiKey: cred.apiKey,
          model: cred.model || undefined,
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
        if (err instanceof GroqError && isAuthStatus(err.status)) {
          throw new LlmAuthError();
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
            model: cred.model || "gemini-2.5-flash",
            backend: "studio",
            source: cred.source === "env" ? "env" : "workspace",
          },
          prompt: req.prompt,
          system: req.system,
          temperature,
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
        if (err instanceof GeminiError && isAuthStatus(err.status)) {
          throw new LlmAuthError();
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
  } finally {
    // Caller holds the only reference; encourage GC of secret material.
  }
}

async function generateOpenAiCompatible(
  cred: ResolvedCredential,
  req: { system?: string; prompt: string },
  temperature: number,
  maxOutputTokens: number,
): Promise<Omit<LlmGenerateResult, "provider" | "source">> {
  const base = (cred.endpoint || DEFAULT_ENDPOINTS[cred.provider] || "").replace(/\/$/, "");
  const url = `${base}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cred.apiKey}`,
      "Content-Type": "application/json",
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
      messages: [
        ...(req.system ? [{ role: "system" as const, content: req.system }] : []),
        { role: "user" as const, content: req.prompt },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string };
  };
  if (!res.ok) {
    if (isAuthStatus(res.status)) throw new LlmAuthError();
    throw new Error(body.error?.message || `Provider responded with ${res.status}`);
  }
  return {
    text: (body.choices?.[0]?.message?.content || "").trim(),
    model: cred.model,
    inputTokens: body.usage?.prompt_tokens || 0,
    outputTokens: body.usage?.completion_tokens || 0,
  };
}

async function generateAnthropic(
  cred: ResolvedCredential,
  req: { system?: string; prompt: string },
  temperature: number,
  maxOutputTokens: number,
): Promise<Omit<LlmGenerateResult, "provider" | "source">> {
  const base = (cred.endpoint || DEFAULT_ENDPOINTS.anthropic || "").replace(/\/$/, "");
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
      messages: [{ role: "user", content: req.prompt }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await res.json().catch(() => ({}))) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
    error?: { message?: string };
  };
  if (!res.ok) {
    if (isAuthStatus(res.status)) throw new LlmAuthError();
    throw new Error(body.error?.message || `Provider responded with ${res.status}`);
  }
  const text = (body.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text || "")
    .join("")
    .trim();
  return {
    text,
    model: cred.model,
    inputTokens: body.usage?.input_tokens || 0,
    outputTokens: body.usage?.output_tokens || 0,
  };
}
