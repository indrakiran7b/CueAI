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
} from "@/lib/server/session";

export type ResolvedCredential = {
  provider: AiProviderType;
  model: string;
  apiKey: string;
  endpoint: string;
  source: "user" | "workspace" | "env";
  credentialId?: string;
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
    process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
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

export async function markCredentialUsed(credentialId?: string): Promise<void> {
  if (!credentialId) return;
  await updateStore(async (s) => {
    const item = (s.userApiCredentials || []).find((c) => c.id === credentialId);
    if (!item) return;
    item.lastUsedAt = new Date().toISOString();
  });
}

/** Minimal provider connectivity probe (no secrets in response). */
export async function probeProviderApiKey(input: {
  provider: AiProviderType;
  apiKey: string;
  endpoint?: string;
}): Promise<{ ok: boolean; message: string }> {
  const key = input.apiKey.trim();
  if (!key) return { ok: false, message: "The API key could not be verified." };

  const endpoint = (input.endpoint || DEFAULT_ENDPOINTS[input.provider] || "").replace(
    /\/$/,
    "",
  );

  try {
    if (input.provider === "anthropic") {
      const res = await fetch(`${endpoint}/v1/models`, {
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return { ok: false, message: "The API key could not be verified." };
      return { ok: true, message: "Connection successful." };
    }

    if (input.provider === "gemini") {
      const res = await fetch(`${endpoint}/models`, {
        headers: { "x-goog-api-key": key },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return { ok: false, message: "The API key could not be verified." };
      return { ok: true, message: "Connection successful." };
    }

    // OpenAI-compatible: groq, openai, openrouter, deepseek, perplexity
    const res = await fetch(`${endpoint}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, message: "The API key could not be verified." };
    return { ok: true, message: "Connection successful." };
  } catch {
    return { ok: false, message: "Unable to verify the API key." };
  }
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

  const probe = await probeProviderApiKey({
    provider: input.provider,
    apiKey: input.apiKey,
    endpoint: input.endpoint,
  });
  if (!probe.ok) {
    return { error: probe.message, code: "API_KEY_INVALID" };
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

  if (input.apiKey?.trim()) {
    const probe = await probeProviderApiKey({
      provider: existing.provider,
      apiKey: input.apiKey,
      endpoint: nextEndpoint,
    });
    if (!probe.ok) {
      return { error: probe.message, code: "API_KEY_INVALID" };
    }
    encryptedApiKey = encryptSecret(input.apiKey.trim());
    last4 = keyLast4(input.apiKey);
    status = "connected";
    lastVerifiedAt = new Date().toISOString();
    lastError = undefined;
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
}): Promise<{ ok: boolean; message: string }> {
  const cred = await getUserCredential(input);
  if (!cred) return { ok: false, message: "Credential not found." };
  const apiKey = decryptSecret(cred.encryptedApiKey);
  if (!apiKey) return { ok: false, message: "Unable to verify the API key." };

  const probe = await probeProviderApiKey({
    provider: cred.provider,
    apiKey,
  });

  await updateStore(async (s) => {
    const item = (s.userApiCredentials || []).find((c) => c.id === input.id);
    if (!item) return;
    item.status = probe.ok ? "connected" : "invalid";
    item.lastVerifiedAt = new Date().toISOString();
    item.lastError = probe.ok ? undefined : probe.message;
    item.updatedAt = new Date().toISOString();
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
