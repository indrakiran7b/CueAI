import type { AiProviderType, DbAiConfig, DbAiModel, DbAiProvider } from "@/lib/server/db";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/server/session";

export const DEFAULT_ENDPOINTS: Record<string, string> = {
  groq: "https://api.groq.com/openai/v1",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  openrouter: "https://openrouter.ai/api/v1",
  deepseek: "https://api.deepseek.com",
  perplexity: "https://api.perplexity.ai",
  custom: "",
};

const PROVIDER_LABELS: Record<string, string> = {
  groq: "Groq",
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
  deepseek: "DeepSeek",
  perplexity: "Perplexity",
  custom: "Custom",
};

function capabilityFor(modelName: string): DbAiModel["capability"] {
  const n = modelName.toLowerCase();
  if (n.includes("whisper") || n.includes("stt")) return "stt";
  if (n.includes("embed")) return "embedding";
  return "chat";
}

type EnvProviderSeed = {
  type: AiProviderType;
  envKey: string;
  defaultModels: string[];
};

/** Providers discovered from server env (only when a key is present). */
const ENV_PROVIDER_SEEDS: EnvProviderSeed[] = [
  {
    type: "groq",
    envKey: "GROQ_API_KEY",
    defaultModels: [
      process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-20b",
      "llama-3.3-70b-versatile",
      "whisper-large-v3",
    ],
  },
  {
    type: "gemini",
    envKey: "GEMINI_API_KEY",
    defaultModels: [process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash"],
  },
  {
    type: "openai",
    envKey: "OPENAI_API_KEY",
    defaultModels: [process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini"],
  },
  {
    type: "anthropic",
    envKey: "ANTHROPIC_API_KEY",
    defaultModels: [process.env.ANTHROPIC_MODEL?.trim() || "claude-3-5-sonnet-latest"],
  },
  {
    type: "openrouter",
    envKey: "OPENROUTER_API_KEY",
    defaultModels: [process.env.OPENROUTER_MODEL?.trim() || "openrouter/auto"],
  },
  {
    type: "deepseek",
    envKey: "DEEPSEEK_API_KEY",
    defaultModels: [process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat"],
  },
  {
    type: "perplexity",
    envKey: "PERPLEXITY_API_KEY",
    defaultModels: [process.env.PERPLEXITY_MODEL?.trim() || "sonar"],
  },
];

function ensureProvider(
  ai: DbAiConfig,
  type: AiProviderType,
  opts?: { apiKey?: string; models?: string[] },
) {
  if (!ai.providers) ai.providers = [];
  if (!ai.models) ai.models = [];
  let prov = ai.providers.find((p) => p.type === type);
  if (!prov) {
    prov = {
      id: `prov_${type}`,
      name: PROVIDER_LABELS[type] || type,
      type,
      enabled: true,
      endpoint: DEFAULT_ENDPOINTS[type] || "",
      apiKeyEnc: "",
      updatedAt: new Date().toISOString(),
    };
    ai.providers.push(prov);
  }
  if (opts?.apiKey && !prov.apiKeyEnc) {
    prov.apiKeyEnc = encryptSecret(opts.apiKey);
  }
  for (const name of opts?.models || []) {
    const exists = ai.models.some((m) => m.name === name && m.providerId === prov!.id);
    if (exists) continue;
    ai.models.push({
      id: `mdl_${type}_${name.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 36)}`,
      name,
      providerId: prov.id,
      capability: capabilityFor(name),
      enabled: true,
      isDefault: false,
      updatedAt: new Date().toISOString(),
    });
  }
}

/** Merge providers/models from env API keys so Admin UI reflects configured backends. */
export function syncProvidersFromEnv(ai: DbAiConfig): DbAiConfig {
  for (const seed of ENV_PROVIDER_SEEDS) {
    const key = process.env[seed.envKey]?.trim();
    if (!key) continue;
    ensureProvider(ai, seed.type, { apiKey: key, models: seed.defaultModels });
  }
  return ai;
}

/** Ensure structured providers/models catalogs exist (migrate legacy flat fields). */
export function ensureAiCatalog(ai: DbAiConfig): DbAiConfig {
  if (!ai.providers || ai.providers.length === 0) {
    const types = ai.enabledProviders?.length
      ? ai.enabledProviders
      : ([ai.provider || "groq"] as DbAiProvider["type"][]);
    ai.providers = types.map((type) => ({
      id: `prov_${type}`,
      name: PROVIDER_LABELS[type] || type.charAt(0).toUpperCase() + type.slice(1),
      type,
      enabled: true,
      endpoint: type === ai.provider ? ai.endpoint || DEFAULT_ENDPOINTS[type] || "" : DEFAULT_ENDPOINTS[type] || "",
      apiKeyEnc: type === ai.provider ? ai.apiKeyEnc || "" : "",
      updatedAt: ai.updatedAt,
      updatedBy: ai.updatedBy,
    }));
  }

  if (!ai.models || ai.models.length === 0) {
    const names = ai.enabledModels?.length
      ? ai.enabledModels
      : [ai.defaultModel || ai.model || "openai/gpt-oss-20b"];
    const primaryProvider =
      ai.providers.find((p) => p.type === ai.provider)?.id || ai.providers[0]?.id || "prov_groq";
    ai.models = names.map((name) => ({
      id: `mdl_${name.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 40)}`,
      name,
      providerId: primaryProvider,
      capability: capabilityFor(name),
      enabled: true,
      isDefault: name === (ai.defaultModel || ai.model),
      updatedAt: ai.updatedAt,
    }));
  }

  syncProvidersFromEnv(ai);

  // Ensure at least one default model
  if (ai.models.length && !ai.models.some((m) => m.isDefault)) {
    const first = ai.models.find((m) => m.enabled) || ai.models[0];
    if (first) first.isDefault = true;
  }

  const def = ai.models.find((m) => m.isDefault && m.enabled) || ai.models.find((m) => m.enabled);
  if (def) {
    ai.defaultModel = def.name;
    ai.model = def.name;
  }
  const enabledProv = ai.providers.filter((p) => p.enabled);
  ai.enabledProviders = enabledProv.map((p) => p.type);
  ai.enabledModels = ai.models.filter((m) => m.enabled).map((m) => m.name);
  const activeProv = ai.providers.find((p) => p.id === def?.providerId) || ai.providers.find((p) => p.enabled);
  if (activeProv) {
    ai.provider = activeProv.type;
    ai.endpoint = activeProv.endpoint;
    if (activeProv.apiKeyEnc) ai.apiKeyEnc = activeProv.apiKeyEnc;
  }

  return ai;
}

export function publicProviders(ai: DbAiConfig) {
  ensureAiCatalog(ai);
  return (ai.providers || []).map((p) => {
    const raw = p.apiKeyEnc ? decryptSecret(p.apiKeyEnc) : "";
    const modelCount = (ai.models || []).filter((m) => m.providerId === p.id && m.enabled).length;
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      enabled: p.enabled,
      endpoint: p.endpoint || "",
      hasApiKey: Boolean(raw),
      apiKeyStatus: raw ? "Configured" : "Not configured",
      apiKeyMasked: raw ? maskSecret(raw) : "",
      enabledModelCount: modelCount,
      updatedAt: p.updatedAt || null,
      updatedBy: p.updatedBy || null,
    };
  });
}

export function publicModels(ai: DbAiConfig) {
  ensureAiCatalog(ai);
  const byId = new Map((ai.providers || []).map((p) => [p.id, p]));
  return (ai.models || []).map((m) => {
    const prov = byId.get(m.providerId);
    return {
      id: m.id,
      name: m.name,
      providerId: m.providerId,
      providerName: prov?.name || "Unknown",
      providerType: prov?.type || null,
      capability: m.capability,
      enabled: m.enabled,
      isDefault: m.isDefault,
      contextWindow: m.contextWindow ?? null,
      updatedAt: m.updatedAt || null,
    };
  });
}

export function publicAiSummary(ai: DbAiConfig) {
  ensureAiCatalog(ai);
  return {
    providers: publicProviders(ai),
    models: publicModels(ai),
    defaultModel: ai.defaultModel,
    activeProvider: ai.provider,
  };
}
