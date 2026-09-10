import type { DbAiConfig, DbAiModel, DbAiProvider } from "@/lib/server/db";
import { decryptSecret, maskSecret } from "@/lib/server/session";

const DEFAULT_ENDPOINTS: Record<string, string> = {
  groq: "https://api.groq.com/openai/v1",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  custom: "",
};

function capabilityFor(modelName: string): DbAiModel["capability"] {
  const n = modelName.toLowerCase();
  if (n.includes("whisper") || n.includes("stt")) return "stt";
  if (n.includes("embed")) return "embedding";
  return "chat";
}

/** Ensure structured providers/models catalogs exist (migrate legacy flat fields). */
export function ensureAiCatalog(ai: DbAiConfig): DbAiConfig {
  if (!ai.providers || ai.providers.length === 0) {
    const types = ai.enabledProviders?.length
      ? ai.enabledProviders
      : ([ai.provider || "groq"] as DbAiProvider["type"][]);
    ai.providers = types.map((type) => ({
      id: `prov_${type}`,
      name: type.charAt(0).toUpperCase() + type.slice(1),
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

  // Keep legacy fields in sync for resume/transcribe consumers
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

export { DEFAULT_ENDPOINTS };
