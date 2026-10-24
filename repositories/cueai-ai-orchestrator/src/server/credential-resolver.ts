/**
 * BYOK credential resolver + provider probe helpers (server-side only).
 * Never return decrypted keys to the browser.
 */

import { randomUUID } from "node:crypto";
import {
  type AiProviderType,
  type ApiCredentialCapability,
  type ApiCredentialStatus,
  type DbUserApiCredential,
  readStore,
  updateStore,
} from "@/lib/server/db";
import {
  DEFAULT_ENDPOINTS,
  ensureAiCatalog,
  PROVIDER_LABELS,
} from "@/lib/server/ai-config";
import {
  decryptSecret,
  encryptSecret,
  keyLast4,
  maskKeyLast4,
  secretEncryptionStatus,
} from "@/lib/server/session";
import { isCueaiProduction } from "@/lib/runtime-env";

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return h.includes(":");
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/**
 * Custom provider base URLs are fetched server-side with the user's key, so in production
 * they must be public HTTPS hosts (prevents requests into the server's private network).
 */
export function validateCustomEndpoint(raw?: string): string | null {
  const value = raw?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "The custom endpoint must be a valid URL.";
  }
  if (url.username || url.password) return "The custom endpoint must not include credentials.";
  if (!isCueaiProduction()) {
    return url.protocol === "https:" || url.protocol === "http:" ? null : "The custom endpoint must use HTTPS.";
  }
  if (url.protocol !== "https:") return "The custom endpoint must use HTTPS.";
  if (isPrivateHost(url.hostname)) return "The custom endpoint must be a public host.";
  return null;
}

export type ResolvedCredential = {
  provider: AiProviderType;
  model: string;
  apiKey: string;
  endpoint: string;
  source: "user" | "workspace" | "env";
  credentialId?: string;
  organizationId?: string;
};

const BYOK_PROVIDERS: AiProviderType[] = [
  "groq",
  "gemini",
  "openai",
  "openrouter",
  "deepseek",
  "anthropic",
  "perplexity",
];

/** Canonical chat models per BYOK provider (single source for Settings UI + resolver). */
export const DEFAULT_CHAT_MODELS: Record<string, string[]> = {
  groq: [
    process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-20b",
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "llama-3.1-70b-versatile",
    "mixtral-8x7b-32768",
    "gemma2-9b-it",
  ],
  gemini: [
    process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
  ],
  openai: [
    process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    "gpt-4o",
    "gpt-4.1-mini",
    "gpt-4.1",
    "gpt-4-turbo",
    "o3-mini",
  ],
  openrouter: [
    process.env.OPENROUTER_MODEL?.trim() || "openrouter/auto",
    "openai/gpt-4o-mini",
    "openai/gpt-4o",
    "anthropic/claude-3.5-sonnet",
    "google/gemini-2.0-flash-001",
    "meta-llama/llama-3.3-70b-instruct",
  ],
  deepseek: [
    process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat",
    "deepseek-reasoner",
  ],
  anthropic: [
    process.env.ANTHROPIC_MODEL?.trim() || "claude-3-5-sonnet-latest",
    "claude-3-5-haiku-latest",
    "claude-3-opus-latest",
    "claude-sonnet-4-20250514",
  ],
  perplexity: [
    process.env.PERPLEXITY_MODEL?.trim() || "sonar",
    "sonar-pro",
    "sonar-reasoning",
  ],
};

const ENV_KEYS: Partial<Record<AiProviderType, string>> = {
  groq: "GROQ_API_KEY",
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
};

export function listByokProviders() {
  return BYOK_PROVIDERS.map((type) => ({
    type,
    name: PROVIDER_LABELS[type] || type,
    endpoint: DEFAULT_ENDPOINTS[type] || "",
    defaultModels: DEFAULT_CHAT_MODELS[type] || [],
  }));
}

export function isByokProvider(value: string): value is AiProviderType {
  return (BYOK_PROVIDERS as string[]).includes(value);
}

export function publicCredential(c: DbUserApiCredential) {
  return {
    id: c.id,
    name: c.name || `${PROVIDER_LABELS[c.provider] || c.provider} Key`,
    provider: c.provider,
    providerLabel: PROVIDER_LABELS[c.provider] || c.provider,
    model: c.model,
    maskedKey: maskProviderKey(c.provider, c.keyLast4),
    status: c.status,
    capabilities: c.capabilities,
    endpoint: c.endpoint || "",
    organizationId: c.organizationId ? "••••" : "",
    isDefault: c.isDefault,
    isActive: c.isDefault,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    lastVerifiedAt: c.lastVerifiedAt || null,
    lastUsedAt: c.lastUsedAt || null,
    lastError: c.lastError || null,
  };
}

function maskProviderKey(provider: string, last4: string): string {
  const tail = last4 || "••••";
  switch (provider) {
    case "openai":
      return `sk-••••••••••••${tail}`;
    case "groq":
      return `gsk_••••••••••••${tail}`;
    case "gemini":
      return `AIza••••••••••••${tail}`;
    case "anthropic":
      return `sk-ant-••••••••${tail}`;
    case "openrouter":
      return `sk-or-••••••••${tail}`;
    case "deepseek":
      return `sk-••••••••••••${tail}`;
    case "perplexity":
      return `pplx-••••••••••${tail}`;
    default:
      return maskKeyLast4(tail);
  }
}

function envKeyFor(provider: AiProviderType): string {
  const name = ENV_KEYS[provider];
  return name ? process.env[name]?.trim() || "" : "";
}

export async function listUserCredentials(input: {
  userId: string;
  workspaceId: string;
}): Promise<DbUserApiCredential[]> {
  const store = await readStore();
  return (store.userApiCredentials || []).filter(
    (c) => c.userId === input.userId && c.workspaceId === input.workspaceId,
  );
}

export async function getUserCredential(input: {
  id: string;
  userId: string;
  workspaceId: string;
}): Promise<DbUserApiCredential | null> {
  const store = await readStore();
  return (
    (store.userApiCredentials || []).find(
      (c) =>
        c.id === input.id &&
        c.userId === input.userId &&
        c.workspaceId === input.workspaceId,
    ) || null
  );
}

/**
 * Resolve LLM credential for a capability.
 * Precedence: user default BYOK → any user BYOK → workspace admin provider → env.
 */
export async function resolveCredential(input: {
  userId?: string | null;
  workspaceId?: string | null;
  capability: ApiCredentialCapability;
  provider?: AiProviderType;
}): Promise<ResolvedCredential | null> {
  const workspaceId = input.workspaceId || "ws_default";
  const store = await readStore();

  if (input.userId) {
    const mine = (store.userApiCredentials || []).filter(
      (c) =>
        c.userId === input.userId &&
        c.workspaceId === workspaceId &&
        c.status !== "invalid" &&
        c.capabilities.includes(input.capability) &&
        (!input.provider || c.provider === input.provider),
    );
    const preferred =
      mine.find((c) => c.isDefault) ||
      [...mine].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
    if (preferred) {
      const apiKey = decryptSecret(preferred.encryptedApiKey);
      if (apiKey) {
        return {
          provider: preferred.provider,
          model: preferred.model,
          apiKey,
          endpoint:
            preferred.endpoint?.trim() ||
            DEFAULT_ENDPOINTS[preferred.provider] ||
            "",
          source: "user",
          credentialId: preferred.id,
          organizationId: preferred.organizationId,
        };
      }
    }
  }

  ensureAiCatalog(store.ai);
  const providers = store.ai.providers || [];
  const models = store.ai.models || [];
  const workspaceProviders = providers.filter(
    (p) =>
      p.enabled &&
      (!input.provider || p.type === input.provider) &&
      Boolean(p.apiKeyEnc || envKeyFor(p.type)),
  );

  for (const prov of workspaceProviders) {
    const apiKey =
      (prov.apiKeyEnc ? decryptSecret(prov.apiKeyEnc) : "") || envKeyFor(prov.type);
    if (!apiKey) continue;
    const model =
      models.find((m) => m.providerId === prov.id && m.enabled && m.isDefault)?.name ||
      models.find((m) => m.providerId === prov.id && m.enabled)?.name ||
      DEFAULT_CHAT_MODELS[prov.type]?.[0] ||
      "";
    return {
      provider: prov.type,
      model,
      apiKey,
      endpoint: prov.endpoint || DEFAULT_ENDPOINTS[prov.type] || "",
      source: prov.apiKeyEnc ? "workspace" : "env",
    };
  }

  // Env-only fallbacks in preferred order.
  const order: AiProviderType[] = input.provider
    ? [input.provider]
    : ["groq", "gemini", "openai", "openrouter", "deepseek", "anthropic", "perplexity"];
  for (const type of order) {
    const apiKey = envKeyFor(type);
    if (!apiKey) continue;
    return {
      provider: type,
      model: DEFAULT_CHAT_MODELS[type]?.[0] || "",
      apiKey,
      endpoint: DEFAULT_ENDPOINTS[type] || "",
      source: "env",
    };
  }

  return null;
}

export type CredentialChain = {
  /** Ordered credentials to try. */
  candidates: ResolvedCredential[];
  /**
   * True when the chain is the user's own key. Those failures are reported instead of
   * silently switching to workspace or app-managed billing.
   */
  userOwned: boolean;
};

/**
 * Ordered credential chain for the AI router.
 * 1. Explicit user credential (credentialId) → only that key.
 * 2. User default (or newest) valid key for the capability → only that key.
 * 3. Workspace admin providers, then app-managed env keys (authorized fallbacks).
 * Never reads another user's credentials.
 */
export async function resolveCredentialChain(input: {
  userId?: string | null;
  workspaceId?: string | null;
  capability: ApiCredentialCapability;
  credentialId?: string | null;
}): Promise<CredentialChain> {
  const workspaceId = input.workspaceId || "ws_default";
  const store = await readStore();

  if (input.userId) {
    const mine = (store.userApiCredentials || []).filter(
      (c) => c.userId === input.userId && c.workspaceId === workspaceId,
    );
    const explicit = input.credentialId ? mine.find((c) => c.id === input.credentialId) : null;
    const usable = mine.filter((c) => c.status !== "invalid" && c.capabilities.includes(input.capability));
    const preferred =
      explicit ||
      usable.find((c) => c.isDefault) ||
      [...usable].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
    if (preferred) {
      const apiKey = decryptSecret(preferred.encryptedApiKey);
      return {
        userOwned: true,
        candidates: apiKey
          ? [
              {
                provider: preferred.provider,
                model: preferred.model,
                apiKey,
                endpoint: preferred.endpoint?.trim() || DEFAULT_ENDPOINTS[preferred.provider] || "",
                source: "user",
                credentialId: preferred.id,
                organizationId: preferred.organizationId,
              },
            ]
          : [],
      };
    }
  }

  ensureAiCatalog(store.ai);
  const candidates: ResolvedCredential[] = [];
  const seen = new Set<string>();
  const models = store.ai.models || [];
  for (const prov of (store.ai.providers || []).filter((p) => p.enabled && isByokProvider(p.type))) {
    const workspaceKey = prov.apiKeyEnc ? decryptSecret(prov.apiKeyEnc) : "";
    const apiKey = workspaceKey || envKeyFor(prov.type);
    if (!apiKey || seen.has(prov.type)) continue;
    seen.add(prov.type);
    candidates.push({
      provider: prov.type,
      model:
        models.find((m) => m.providerId === prov.id && m.enabled && m.isDefault && m.capability === "chat")?.name ||
        models.find((m) => m.providerId === prov.id && m.enabled && m.capability === "chat")?.name ||
        DEFAULT_CHAT_MODELS[prov.type]?.[0] ||
        "",
      apiKey,
      endpoint: prov.endpoint || DEFAULT_ENDPOINTS[prov.type] || "",
      source: workspaceKey ? "workspace" : "env",
    });
  }
  for (const type of BYOK_PROVIDERS) {
    const apiKey = envKeyFor(type);
    if (!apiKey || seen.has(type)) continue;
    seen.add(type);
    candidates.push({
      provider: type,
      model: DEFAULT_CHAT_MODELS[type]?.[0] || "",
      apiKey,
      endpoint: DEFAULT_ENDPOINTS[type] || "",
      source: "env",
    });
  }
  return { candidates, userOwned: false };
}

export async function markCredentialUsed(credentialId?: string): Promise<void> {
  if (!credentialId) return;
  await updateStore(async (s) => {
    const item = (s.userApiCredentials || []).find((c) => c.id === credentialId);
    if (!item) return;
    item.lastUsedAt = new Date().toISOString();
  });
}

export type ProbeCode =
  | "ok"
  | "ok_model_unverified"
  | "invalid_credentials"
  | "missing_permissions"
  | "rate_limited"
  | "network_error"
  | "timeout"
  | "unsupported_model"
  | "inconclusive";

export type ProbeResult = { ok: boolean; code: ProbeCode; message: string };

const PROBE_TIMEOUT_MS = 8000;

function probeFailure(code: ProbeCode, provider: AiProviderType, model?: string): ProbeResult {
  const label = PROVIDER_LABELS[provider] || provider;
  const messages: Record<ProbeCode, string> = {
    ok: "Connection successful.",
    ok_model_unverified: `${label} accepted the key, but the model list could not confirm "${model}".`,
    invalid_credentials: `${label} rejected this API key. Check that it was copied correctly and has not been revoked.`,
    missing_permissions: `${label} accepted the key but it lacks permission to list or use models.`,
    rate_limited: `${label} is rate limiting this key right now. The key may be valid; try again shortly.`,
    network_error: `Could not reach ${label}. The key was not verified.`,
    timeout: `${label} did not respond in time. The key was not verified.`,
    unsupported_model: `${label} accepted the key, but the model "${model}" is not available to it.`,
    inconclusive: `${label} returned an unexpected response. The key was not verified.`,
  };
  const ok = code === "ok" || code === "ok_model_unverified";
  return { ok, code, message: messages[code] };
}

function probeCodeForStatus(status: number): ProbeCode {
  if (status === 401) return "invalid_credentials";
  if (status === 403) return "missing_permissions";
  if (status === 429) return "rate_limited";
  if (status === 408 || status === 504) return "timeout";
  return "inconclusive";
}

function modelIdsFrom(body: unknown): string[] {
  const data = body as { data?: Array<{ id?: string }>; models?: Array<{ name?: string }> };
  if (Array.isArray(data?.data)) return data.data.map((m) => m.id || "").filter(Boolean);
  if (Array.isArray(data?.models)) {
    return data.models.map((m) => (m.name || "").replace(/^models\//, "")).filter(Boolean);
  }
  return [];
}

/**
 * Minimal provider probe: a model-list (or key-info) request, never a paid generation,
 * except Perplexity which has no listing endpoint and gets a 1-token completion.
 * Never includes the key or raw provider error text in the result.
 */
export async function probeProviderApiKey(input: {
  provider: AiProviderType;
  apiKey: string;
  endpoint?: string;
  model?: string;
}): Promise<ProbeResult> {
  const key = input.apiKey.trim();
  if (!key) return probeFailure("invalid_credentials", input.provider);
  const provider = input.provider;
  const model = input.model?.trim() || "";
  const endpoint = (input.endpoint || DEFAULT_ENDPOINTS[provider] || "").replace(/\/$/, "");

  let url: string;
  let init: RequestInit;
  if (provider === "anthropic") {
    url = `${endpoint}/v1/models?limit=1000`;
    init = { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } };
  } else if (provider === "gemini") {
    url = `${endpoint}/models?pageSize=1000`;
    init = { headers: { "x-goog-api-key": key } };
  } else if (provider === "openrouter") {
    // /models is public on OpenRouter; /auth/key actually checks the key.
    url = `${endpoint}/auth/key`;
    init = { headers: { Authorization: `Bearer ${key}` } };
  } else if (provider === "perplexity") {
    url = `${endpoint}/chat/completions`;
    init = {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model || DEFAULT_CHAT_MODELS.perplexity[0],
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
    };
  } else {
    url = `${endpoint}/models`;
    init = { headers: { Authorization: `Bearer ${key}` } };
  }

  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    return probeFailure(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network_error", provider);
  }

  if (!res.ok) {
    if (provider === "perplexity" && res.status === 400 && model) {
      return probeFailure("unsupported_model", provider, model);
    }
    // Gemini reports a bad key as 400 API_KEY_INVALID.
    if (provider === "gemini" && res.status === 400) {
      const body = (await res.json().catch(() => ({}))) as { error?: { status?: string; message?: string } };
      if (/api[_ ]key/i.test(`${body.error?.status} ${body.error?.message}`)) {
        return probeFailure("invalid_credentials", provider);
      }
    }
    return probeFailure(probeCodeForStatus(res.status), provider);
  }

  if (!model || provider === "perplexity" || provider === "openrouter") {
    return probeFailure("ok", provider);
  }

  const ids = modelIdsFrom(await res.json().catch(() => null));
  if (!ids.length) return probeFailure("ok_model_unverified", provider, model);
  if (ids.includes(model)) return probeFailure("ok", provider);
  // Anthropic lists dated ids; "-latest" aliases resolve server-side.
  if (provider === "anthropic" && model.endsWith("-latest")) {
    return probeFailure("ok_model_unverified", provider, model);
  }
  return probeFailure("unsupported_model", provider, model);
}

function statusForProbe(code: ProbeCode): ApiCredentialStatus {
  if (code === "ok" || code === "ok_model_unverified") return "connected";
  if (code === "invalid_credentials" || code === "missing_permissions" || code === "unsupported_model") {
    return "invalid";
  }
  return "error";
}

export async function createUserCredential(input: {
  userId: string;
  workspaceId: string;
  provider: AiProviderType;
  model: string;
  name: string;
  apiKey: string;
  capabilities: ApiCredentialCapability[];
  isDefault?: boolean;
  endpoint?: string;
  organizationId?: string;
}): Promise<{ credential: DbUserApiCredential } | { error: string; code: string }> {
  const name = input.name.trim();
  if (!name) {
    return { error: "A key name is required.", code: "VALIDATION" };
  }
  const model = input.model.trim();
  if (!model) {
    return { error: "A model is required.", code: "VALIDATION" };
  }

  const endpointError = validateCustomEndpoint(input.endpoint);
  if (endpointError) return { error: endpointError, code: "VALIDATION" };

  const encryption = secretEncryptionStatus();
  if (!encryption.ready) {
    return { error: encryption.message || "Server encryption is not configured.", code: "ENCRYPTION_NOT_CONFIGURED" };
  }

  const probe = await probeProviderApiKey({
    provider: input.provider,
    apiKey: input.apiKey,
    endpoint: input.endpoint,
    model,
  });
  if (!probe.ok) {
    return { error: probe.message, code: probe.code.toUpperCase() };
  }

  const now = new Date().toISOString();
  const caps =
    input.capabilities.length > 0
      ? input.capabilities
      : (["rag", "live_session", "general_ai"] as ApiCredentialCapability[]);
  const makeDefault = input.isDefault !== false;

  const credential: DbUserApiCredential = {
    id: `uak_${randomUUID().slice(0, 12)}`,
    workspaceId: input.workspaceId,
    userId: input.userId,
    name,
    provider: input.provider,
    model: model || DEFAULT_CHAT_MODELS[input.provider]?.[0] || "",
    encryptedApiKey: encryptSecret(input.apiKey.trim()),
    keyLast4: keyLast4(input.apiKey),
    status: "connected",
    capabilities: caps,
    endpoint: input.endpoint?.trim() || undefined,
    organizationId: input.organizationId?.trim() || undefined,
    isDefault: makeDefault,
    createdAt: now,
    updatedAt: now,
    lastVerifiedAt: now,
    lastError: probe.code === "ok_model_unverified" ? probe.message : undefined,
  };

  await updateStore(async (s) => {
    if (!s.userApiCredentials) s.userApiCredentials = [];
    if (makeDefault) {
      for (const c of s.userApiCredentials) {
        if (
          c.userId === input.userId &&
          c.workspaceId === input.workspaceId &&
          c.capabilities.some((cap) => caps.includes(cap))
        ) {
          c.isDefault = false;
        }
      }
    }
    s.userApiCredentials.unshift(credential);
  });

  return { credential };
}

export async function updateUserCredential(input: {
  id: string;
  userId: string;
  workspaceId: string;
  name?: string;
  model?: string;
  apiKey?: string;
  capabilities?: ApiCredentialCapability[];
  isDefault?: boolean;
  endpoint?: string;
  organizationId?: string;
}): Promise<
  { credential: DbUserApiCredential } | { error: string; code: string; status?: number }
> {
  const existing = await getUserCredential({
    id: input.id,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  if (!existing) {
    return { error: "Not found", code: "NOT_FOUND", status: 404 };
  }

  if (input.name !== undefined && !input.name.trim()) {
    return { error: "A key name is required.", code: "VALIDATION" };
  }
  if (input.model !== undefined && !input.model.trim()) {
    return { error: "A model is required.", code: "VALIDATION" };
  }

  let status: ApiCredentialStatus = existing.status;
  let encryptedApiKey = existing.encryptedApiKey;
  let last4 = existing.keyLast4;
  let lastVerifiedAt = existing.lastVerifiedAt;
  let lastError: string | undefined = existing.lastError;

  const nextEndpoint =
    input.endpoint !== undefined ? input.endpoint.trim() : existing.endpoint;
  const endpointError = validateCustomEndpoint(nextEndpoint);
  if (endpointError) return { error: endpointError, code: "VALIDATION" };
  const endpointChanged = (nextEndpoint || "") !== (existing.endpoint || "");

  const nextModel = input.model?.trim() || existing.model;
  const modelChanged = nextModel !== existing.model;
  if (input.apiKey?.trim() || modelChanged || endpointChanged) {
    const encryption = secretEncryptionStatus();
    if (input.apiKey?.trim() && !encryption.ready) {
      return { error: encryption.message || "Server encryption is not configured.", code: "ENCRYPTION_NOT_CONFIGURED" };
    }
    const apiKey = input.apiKey?.trim() || decryptSecret(existing.encryptedApiKey);
    if (!apiKey) {
      return { error: "The stored key could not be decrypted. Enter the key again.", code: "DECRYPT_FAILED" };
    }
    const probe = await probeProviderApiKey({
      provider: existing.provider,
      apiKey,
      endpoint: nextEndpoint,
      model: nextModel,
    });
    if (!probe.ok) {
      return { error: probe.message, code: probe.code.toUpperCase() };
    }
    if (input.apiKey?.trim()) {
      encryptedApiKey = encryptSecret(apiKey);
      last4 = keyLast4(apiKey);
    }
    status = "connected";
    lastVerifiedAt = new Date().toISOString();
    lastError = probe.code === "ok_model_unverified" ? probe.message : undefined;
  }

  const caps = input.capabilities || existing.capabilities;
  const now = new Date().toISOString();

  await updateStore(async (s) => {
    const item = (s.userApiCredentials || []).find((c) => c.id === input.id);
    if (!item) return;
    if (input.name?.trim()) item.name = input.name.trim();
    if (!item.name) {
      item.name = `${PROVIDER_LABELS[item.provider] || item.provider} Key`;
    }
    if (input.model?.trim()) item.model = input.model.trim();
    if (input.endpoint !== undefined) {
      item.endpoint = input.endpoint.trim() || undefined;
    }
    if (input.organizationId !== undefined) {
      item.organizationId = input.organizationId.trim() || undefined;
    }
    item.encryptedApiKey = encryptedApiKey;
    item.keyLast4 = last4;
    item.status = status;
    item.capabilities = caps;
    item.lastVerifiedAt = lastVerifiedAt;
    item.lastError = lastError;
    item.updatedAt = now;
    if (input.isDefault === true) {
      for (const c of s.userApiCredentials || []) {
        if (
          c.userId === input.userId &&
          c.workspaceId === input.workspaceId &&
          c.id !== input.id
        ) {
          c.isDefault = false;
        }
      }
      item.isDefault = true;
    } else if (input.isDefault === false) {
      item.isDefault = false;
    }
  });

  const credential = await getUserCredential({
    id: input.id,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  if (!credential) {
    return { error: "Not found", code: "NOT_FOUND", status: 404 };
  }
  return { credential };
}

export async function deleteUserCredential(input: {
  id: string;
  userId: string;
  workspaceId: string;
}): Promise<boolean> {
  let found = false;
  await updateStore(async (s) => {
    const before = s.userApiCredentials?.length || 0;
    const remaining = (s.userApiCredentials || []).filter(
      (c) =>
        !(
          c.id === input.id &&
          c.userId === input.userId &&
          c.workspaceId === input.workspaceId
        ),
    );
    found = remaining.length < before;
    // If the deleted credential was active, promote the most recently updated sibling.
    const mine = remaining.filter(
      (c) => c.userId === input.userId && c.workspaceId === input.workspaceId,
    );
    if (mine.length && !mine.some((c) => c.isDefault)) {
      const next = [...mine].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
      if (next) next.isDefault = true;
    }
    s.userApiCredentials = remaining;
  });
  return found;
}

export async function testStoredCredential(input: {
  id: string;
  userId: string;
  workspaceId: string;
}): Promise<ProbeResult | null> {
  const cred = await getUserCredential(input);
  if (!cred) return null;
  const apiKey = decryptSecret(cred.encryptedApiKey);
  if (!apiKey) {
    return {
      ok: false,
      code: "inconclusive",
      message: "The stored key could not be decrypted. Enter the key again.",
    };
  }

  const probe = await probeProviderApiKey({
    provider: cred.provider,
    apiKey,
    endpoint: cred.endpoint,
    model: cred.model,
  });

  await updateStore(async (s) => {
    const item = (s.userApiCredentials || []).find((c) => c.id === input.id);
    if (!item) return;
    item.status = statusForProbe(probe.code);
    item.lastVerifiedAt = new Date().toISOString();
    item.lastError = probe.code === "ok" ? undefined : probe.message;
  });

  return probe;
}

export async function setDefaultCredential(input: {
  id: string;
  userId: string;
  workspaceId: string;
}): Promise<boolean> {
  let found = false;
  await updateStore(async (s) => {
    const item = (s.userApiCredentials || []).find(
      (c) =>
        c.id === input.id &&
        c.userId === input.userId &&
        c.workspaceId === input.workspaceId,
    );
    if (!item) return;
    found = true;
    for (const c of s.userApiCredentials || []) {
      if (c.userId === input.userId && c.workspaceId === input.workspaceId) {
        c.isDefault = c.id === input.id;
      }
    }
    item.updatedAt = new Date().toISOString();
  });
  return found;
}
