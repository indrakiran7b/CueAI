/**
 * Read-only, sanitized view of which AI providers and models CueAI actually uses (server-side only).
 * Built from the same resolver and constants the AI code paths use. Never returns keys, key
 * fragments, endpoints with credentials, or provider error text.
 */

import type { AiProviderType, ApiCredentialCapability, DbUsageEvent, DbUserApiCredential } from "@/lib/server/db";
import { PROVIDER_LABELS } from "@/lib/server/ai-config";
import type { ResolvedCredential } from "@/lib/server/credential-resolver";
import type { ProviderHealth } from "@/lib/server/provider-health";

export type ProviderStatus = "active" | "configured_unverified" | "configured_unused" | "unavailable" | "not_configured";

export type FeatureId =
  | "transcription"
  | "answers"
  | "screenshots"
  | "resume"
  | "summaries"
  | "knowledge"
  | "knowledge_index"
  | "translation"
  | "mock_interview"
  | "search";

export type RouteStep = {
  provider: string;
  providerName: string;
  model: string;
  creator: string;
  role: "primary" | "fallback";
  keySource: "your key" | "workspace key" | "server key" | "service" | "local";
  note?: string;
};

export type FeatureRoute = {
  id: FeatureId;
  label: string;
  steps: RouteStep[];
  note?: string;
  lastServed?: { provider: string; model: string; at: string; record: "usage log" | "since server start" };
};

export type ProviderSummary = {
  id: string;
  name: string;
  role: string;
  status: ProviderStatus;
  statusDetail: string;
  isDefault: boolean;
  keySources: RouteStep["keySource"][];
  models: { id: string; creator: string; features: FeatureId[] }[];
  features: FeatureId[];
  lastSuccessAt: string | null;
  lastSuccessRecord: "usage log" | "since server start" | "key test" | null;
  lastFailure: { at: string; code: string } | null;
};

export type ProviderStatusReport = {
  generatedAt: string;
  informationalOnly: true;
  defaultProvider: string | null;
  providers: ProviderSummary[];
  features: FeatureRoute[];
};

const FEATURE_LABELS: Record<FeatureId, string> = {
  transcription: "Transcription",
  answers: "Live answers",
  screenshots: "Screenshots / Screen Context",
  resume: "Resume Tailor",
  summaries: "Meeting summaries",
  knowledge: "Knowledge Base answers",
  knowledge_index: "Knowledge Base indexing (embeddings)",
  translation: "Translation",
  mock_interview: "Mock Interview",
  search: "Web search",
};

const PROVIDER_ROLES: Record<string, string> = {
  groq: "Inference host — runs models created by others (e.g. OpenAI gpt-oss, Meta Llama, Qwen, Whisper)",
  openrouter: "Router — forwards each request to another model provider",
  openai: "Model developer and API",
  gemini: "Model developer and API (Google)",
  anthropic: "Model developer and API",
  deepseek: "Model developer and API",
  perplexity: "Model developer and API (search-tuned models)",
  "cueai-api": "CueAI API service — calls Groq, then Gemini, with keys configured on that service",
  "qwen-local": "Local vision server running Qwen2.5-VL",
  "local-embeddings": "Runs inside the CueAI server",
};

const SERVICE_NAMES: Record<string, string> = {
  "cueai-api": "CueAI API service",
  "qwen-local": "Local vision server",
  "local-embeddings": "Local embeddings",
};

/** Who created a model, from its id. Hosts (Groq) and routers (OpenRouter) are never the creator. */
export function modelCreator(model: string): string {
  const m = model.toLowerCase();
  if (m === "openrouter/auto") return "Chosen by OpenRouter per request";
  if (m.startsWith("anthropic/") || m.startsWith("claude")) return "Anthropic";
  if (m.startsWith("google/") || m.startsWith("gemini") || m.startsWith("gemma") || m === "text-embedding-004") return "Google";
  if (m.startsWith("meta-llama/") || m.startsWith("llama")) return "Meta";
  if (m.includes("qwen")) return "Alibaba (Qwen)";
  if (m.startsWith("mixtral") || m.startsWith("mistral")) return "Mistral AI";
  if (m.startsWith("deepseek")) return "DeepSeek";
  if (m.startsWith("sonar")) return "Perplexity";
  if (m.includes("minilm")) return "Microsoft (MiniLM, via Sentence-Transformers)";
  if (m.startsWith("openai/") || /^(gpt|o\d|text-embedding|whisper|chatgpt)/.test(m)) return "OpenAI";
  return "Unknown";
}

function providerName(id: string): string {
  return SERVICE_NAMES[id] || PROVIDER_LABELS[id] || id;
}

const KEY_SOURCE: Record<ResolvedCredential["source"], RouteStep["keySource"]> = {
  user: "your key",
  workspace: "workspace key",
  env: "server key",
};

function step(provider: string, model: string, role: RouteStep["role"], keySource: RouteStep["keySource"], note?: string): RouteStep {
  return {
    provider,
    providerName: providerName(provider),
    model,
    creator: modelCreator(model),
    role,
    keySource,
    ...(note ? { note } : {}),
  };
}

function chainSteps(candidates: Pick<ResolvedCredential, "provider" | "model" | "source">[], first: RouteStep["role"] = "primary"): RouteStep[] {
  const seen = new Set<string>();
  const out: RouteStep[] = [];
  for (const c of candidates) {
    const key = `${c.provider}|${c.model}|${c.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(step(c.provider, c.model, out.length === 0 ? first : "fallback", KEY_SOURCE[c.source]));
  }
  return out;
}

/** Facts gathered from env, the store and in-process records. Pure input for `buildProviderStatus`. */
export type ProviderStatusInput = {
  now: Date;
  env: {
    groqKey: boolean;
    geminiKey: boolean;
    openAiKey: boolean;
    groqModel: string;
    groqStreamModel: string;
    groqVisionModel: string;
    groqSttModel: string;
    geminiModel: string;
    openAiLiveModel: string;
    resumeGroqModels: string[];
    liveAnswerLocal: boolean;
    qwenConfigured: boolean;
    imageOrder: string[];
    rag: { semantic: boolean; embeddingProvider: string; embeddingModel: string };
  };
  /** App/workspace chains (no user key) and the caller's own chains, per capability. */
  chains: Record<ApiCredentialCapability, { candidates: Pick<ResolvedCredential, "provider" | "model" | "source">[]; userOwned: boolean }>;
  /** Providers with a key from any source, and providers disabled in the workspace catalog. */
  configured: Partial<Record<string, RouteStep["keySource"][]>>;
  userCredentials: Pick<DbUserApiCredential, "provider" | "status" | "lastVerifiedAt" | "lastError" | "isDefault">[];
  usage: Pick<DbUsageEvent, "provider" | "model" | "createdAt" | "metadata">[];
  health: Record<string, ProviderHealth>;
  apiService: { reachable: boolean } | null;
  supportsVision: (provider: string, model: string) => boolean;
};

const USAGE_FEATURE: Record<string, FeatureId> = {
  live_answer: "answers",
  live_answer_stream: "answers",
  transcribe: "transcription",
  mock_interview: "mock_interview",
  resume_analyze: "resume",
  resume_tailor: "resume",
};

const ROUTER_FEATURE: Record<string, FeatureId> = {
  meeting_summary: "summaries",
  knowledge: "knowledge",
  translation: "translation",
  screen_context: "screenshots",
  resume: "resume",
  mock_interview: "mock_interview",
  live_answer: "answers",
};

const UNAVAILABLE_CODES = new Set(["invalid_credentials", "missing_permissions", "not_configured"]);

export function buildProviderStatus(input: ProviderStatusInput): ProviderStatusReport {
  const { env, chains } = input;
  const general = chains.general_ai;
  const live = chains.live_session;
  const rag = chains.rag;

  const features: FeatureRoute[] = [];
  const add = (id: FeatureId, steps: RouteStep[], note?: string) =>
    features.push({ id, label: FEATURE_LABELS[id], steps, ...(note ? { note } : {}) });

  // Transcription: env keys only (transcription-service). Groq-hosted Whisper, then Gemini.
  add(
    "transcription",
    [
      ...(env.groqKey ? [step("groq", env.groqSttModel, "primary", "server key")] : []),
      ...(env.geminiKey ? [step("gemini", env.geminiModel, env.groqKey ? "fallback" : "primary", "server key")] : []),
    ],
    "Uses the server's keys; personal API keys are not used for transcription.",
  );

  // Live answers: proxied to the CueAI API service first unless CUEAI_LIVE_ANSWER_LOCAL=1.
  const answerFallback: RouteStep[] = live.userOwned
    ? chainSteps(live.candidates, "fallback")
    : [
        ...(env.openAiKey ? [step("openai", env.openAiLiveModel, "fallback", "server key")] : []),
        ...(env.groqKey ? [step("groq", env.groqStreamModel, "fallback", "server key")] : []),
        ...(env.geminiKey ? [step("gemini", env.geminiModel, "fallback", "server key")] : []),
      ];
  if (env.liveAnswerLocal) {
    const steps = answerFallback.map((s, i) => ({ ...s, role: i === 0 ? ("primary" as const) : ("fallback" as const) }));
    add("answers", steps, live.userOwned ? "Your own API key is used alone, with no fallback." : undefined);
  } else {
    add(
      "answers",
      [
        step("cueai-api", env.groqModel, "primary", "service", `Groq-hosted ${env.groqModel}, then Gemini ${env.geminiModel}, on the CueAI API service`),
        ...answerFallback,
      ],
      live.userOwned
        ? "Requests go to the CueAI API service first; when it is unreachable this server answers with your key alone."
        : "Requests go to the CueAI API service first; this server's keys answer only when it is unreachable.",
    );
  }

  // Screenshots: own key in-process; otherwise CueAI API service (Gemini), in-process image chain if unreachable.
  const visionFor = (c: Pick<ResolvedCredential, "provider" | "model" | "source">) =>
    c.provider === "groq" && c.source !== "user" && !input.supportsVision(c.provider, c.model) ? { ...c, model: env.groqVisionModel } : c;
  const rank = (p: string) => {
    const i = env.imageOrder.indexOf(p);
    return i < 0 ? env.imageOrder.length : i;
  };
  const visionChain = general.candidates
    .map(visionFor)
    .filter((c) => input.supportsVision(c.provider, c.model))
    .sort((a, b) => (general.userOwned ? 0 : rank(a.provider) - rank(b.provider)));
  if (general.userOwned) {
    add("screenshots", chainSteps(visionChain), visionChain.length ? "Your own API key is used for screenshots." : "Your selected model cannot read images.");
  } else {
    add(
      "screenshots",
      [
        step("cueai-api", env.geminiModel, "primary", "service", `Gemini ${env.geminiModel} on the CueAI API service`),
        ...chainSteps(visionChain, "fallback"),
        ...(env.qwenConfigured ? [step("qwen-local", "Qwen/Qwen2.5-VL-3B-Instruct", "fallback", "local", "Overlay image questions only")] : []),
      ],
    );
  }

  // Resume Tailor: own key alone; otherwise direct Groq model chain, then Gemini.
  if (general.userOwned) {
    add("resume", chainSteps(general.candidates), "Your own API key is used alone, with no fallback.");
  } else {
    add("resume", [
      ...(env.groqKey ? env.resumeGroqModels.map((m, i) => step("groq", m, i === 0 ? "primary" : "fallback", "server key")) : []),
      ...(env.geminiKey ? [step("gemini", env.geminiModel, env.groqKey ? "fallback" : "primary", "server key")] : []),
    ]);
  }

  const chainNote = (c: { userOwned: boolean }) => (c.userOwned ? "Your own API key is used alone, with no fallback." : undefined);
  add("summaries", chainSteps(general.candidates), chainNote(general));
  add("knowledge", chainSteps(rag.candidates), chainNote(rag));
  add(
    "knowledge_index",
    env.rag.semantic
      ? [
          step(
            env.rag.embeddingProvider === "local" ? "local-embeddings" : env.rag.embeddingProvider,
            env.rag.embeddingModel,
            "primary",
            env.rag.embeddingProvider === "local" ? "local" : "server key",
          ),
        ]
      : [],
    env.rag.semantic ? undefined : "Semantic search is off (no vector database or embedding key), so documents are matched by keywords.",
  );
  add("translation", chainSteps(general.candidates), chainNote(general));
  add("mock_interview", chainSteps(live.candidates), chainNote(live));
  add("search", [], "CueAI has no web search feature, so no provider is used for search.");

  // Last served, per feature, from persisted usage events and in-process router records.
  for (const f of features) {
    let best: FeatureRoute["lastServed"];
    for (const e of input.usage) {
      const feat = USAGE_FEATURE[String(e.metadata?.feature || "")];
      if (feat !== f.id || !e.provider || e.metadata?.test === true) continue;
      if (!best || e.createdAt > best.at) best = { provider: e.provider, model: e.model || "", at: e.createdAt, record: "usage log" };
    }
    for (const h of Object.values(input.health)) {
      const s = h.lastSuccess;
      if (!s || ROUTER_FEATURE[s.feature] !== f.id) continue;
      if (!best || s.at > best.at) best = { provider: s.provider, model: s.model, at: s.at, record: "since server start" };
    }
    if (best) f.lastServed = { ...best, provider: providerName(best.provider) };
  }

  // Providers: every BYOK provider plus any service actually referenced.
  const ids = new Set<string>(["openai", "groq", "gemini", "anthropic", "openrouter", "deepseek", "perplexity"]);
  for (const f of features) for (const s of f.steps) ids.add(s.provider);

  const defaultProvider = general.candidates[0]?.provider ?? null;
  const providers: ProviderSummary[] = [...ids].map((id) => {
    const steps = features.flatMap((f) => f.steps.filter((s) => s.provider === id).map((s) => ({ f: f.id, s })));
    const featureIds = [...new Set(steps.map((x) => x.f))];
    const modelMap = new Map<string, Set<FeatureId>>();
    for (const { f, s } of steps) {
      if (!modelMap.has(s.model)) modelMap.set(s.model, new Set());
      modelMap.get(s.model)!.add(f);
    }
    const keySources = [...new Set([...(input.configured[id] || []), ...steps.map((x) => x.s.keySource)])];
    const isService = id === "cueai-api" || id === "qwen-local" || id === "local-embeddings";
    const configured = keySources.length > 0;

    let lastSuccessAt: string | null = null;
    let lastSuccessRecord: ProviderSummary["lastSuccessRecord"] = null;
    for (const e of input.usage) {
      if (e.provider !== id || e.metadata?.test === true) continue;
      if (!lastSuccessAt || e.createdAt > lastSuccessAt) {
        lastSuccessAt = e.createdAt;
        lastSuccessRecord = "usage log";
      }
    }
    const h = input.health[id];
    if (h?.lastSuccess && (!lastSuccessAt || h.lastSuccess.at > lastSuccessAt)) {
      lastSuccessAt = h.lastSuccess.at;
      lastSuccessRecord = "since server start";
    }
    const ownKeys = input.userCredentials.filter((c) => c.provider === id);
    for (const c of ownKeys) {
      if (c.status === "connected" && c.lastVerifiedAt && (!lastSuccessAt || c.lastVerifiedAt > lastSuccessAt)) {
        lastSuccessAt = c.lastVerifiedAt;
        lastSuccessRecord = "key test";
      }
    }
    const lastFailure = h?.lastFailure ? { at: h.lastFailure.at, code: h.lastFailure.code } : null;
    const failingNow = Boolean(lastFailure && UNAVAILABLE_CODES.has(lastFailure.code) && lastFailure.at > (lastSuccessAt || ""));
    const ownKeyBroken =
      ownKeys.length > 0 &&
      ownKeys.every((c) => c.status === "invalid" || c.status === "error") &&
      keySources.every((s) => s === "your key");

    let status: ProviderStatus;
    let statusDetail: string;
    if (id === "cueai-api") {
      if (!input.apiService) {
        status = "configured_unverified";
        statusDetail = "Not checked.";
      } else if (input.apiService.reachable) {
        status = "configured_unverified";
        statusDetail = "Service is reachable. Its Groq and Gemini keys live on that service and are not verified from here.";
      } else {
        status = "unavailable";
        statusDetail = "Service is not reachable. Live answers and screenshots fall back to this server's keys.";
      }
    } else if (!configured) {
      status = "not_configured";
      statusDetail = "No API key is configured for this provider.";
    } else if (ownKeyBroken) {
      status = "unavailable";
      statusDetail = "Your saved key failed its last test. Update it in API Keys.";
    } else if (failingNow) {
      status = "unavailable";
      statusDetail = "The last request was rejected (invalid key or missing permission).";
    } else if (featureIds.length === 0) {
      status = "configured_unused";
      statusDetail = isService
        ? "Configured, but no feature currently routes to it."
        : "A key exists, but no feature currently routes to this provider (for example, your own key takes priority, or it is disabled in the workspace).";
    } else if (lastSuccessAt) {
      status = "active";
      statusDetail = `Last successful use recorded ${lastSuccessRecord === "since server start" ? "since the server started" : `in the ${lastSuccessRecord}`}.`;
    } else {
      status = "configured_unverified";
      statusDetail = "Configured — not verified. No successful request has been recorded yet.";
    }

    return {
      id,
      name: providerName(id),
      role: PROVIDER_ROLES[id] || "AI provider",
      status,
      statusDetail,
      isDefault: id === defaultProvider,
      keySources,
      models: [...modelMap.entries()].map(([m, fs]) => ({ id: m, creator: modelCreator(m), features: [...fs] })),
      features: featureIds,
      lastSuccessAt,
      lastSuccessRecord,
      lastFailure,
    };
  });

  const order: ProviderStatus[] = ["active", "configured_unverified", "unavailable", "configured_unused", "not_configured"];
  providers.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || order.indexOf(a.status) - order.indexOf(b.status));

  return {
    generatedAt: input.now.toISOString(),
    informationalOnly: true,
    defaultProvider: defaultProvider ? providerName(defaultProvider) : null,
    providers,
    features,
  };
}

const ENV_KEY_NAMES: Partial<Record<AiProviderType, string[]>> = {
  groq: ["GROQ_API_KEY"],
  gemini: ["GEMINI_API_KEY", "VERTEX_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  perplexity: ["PERPLEXITY_API_KEY"],
};

function hasEnv(names: string[] | undefined) {
  return Boolean(names?.some((n) => process.env[n]?.trim()));
}

/** The catalog copies env keys into workspace providers; such a copy is still the server key. */
function isEnvCopy(type: string, key: string) {
  return Boolean(key) && Boolean(ENV_KEY_NAMES[type as AiProviderType]?.some((n) => process.env[n]?.trim() === key));
}

/** Collect real facts for the signed-in user and build the sanitized report. */
export async function getProviderStatus(session: { userId: string; workspaceId: string }, opts: { probeService?: boolean } = {}): Promise<ProviderStatusReport> {
  const [{ readStore }, { decryptSecret }, { ensureAiCatalog }, { resolveCredentialChain }, health, backend, ragCfg, llm] = await Promise.all([
    import("@/lib/server/db"),
    import("@/lib/server/session"),
    import("@/lib/server/ai-config"),
    import("@/lib/server/credential-resolver"),
    import("@/lib/server/provider-health"),
    import("@/lib/server/live-answer-backend"),
    import("@/lib/server/rag/config"),
    import("@/lib/server/llm-generate"),
  ]);
  const scope = { userId: session.userId, workspaceId: session.workspaceId };
  const strip = (c: { candidates: ResolvedCredential[]; userOwned: boolean }) => ({
    userOwned: c.userOwned,
    candidates: c.candidates.map(({ provider, model, source, apiKey }) => ({
      provider,
      model,
      source: source === "workspace" && isEnvCopy(provider, apiKey) ? ("env" as const) : source,
    })),
  });
  const [general, live, rag] = await Promise.all([
    resolveCredentialChain({ ...scope, capability: "general_ai" }).then(strip),
    resolveCredentialChain({ ...scope, capability: "live_session" }).then(strip),
    resolveCredentialChain({ ...scope, capability: "rag" }).then(strip),
  ]);

  const store = await readStore();
  ensureAiCatalog(store.ai);
  const configured: ProviderStatusInput["configured"] = {};
  const mark = (id: string, source: RouteStep["keySource"]) => {
    const list = (configured[id] ||= []);
    if (!list.includes(source)) list.push(source);
  };
  for (const [type, names] of Object.entries(ENV_KEY_NAMES)) if (hasEnv(names)) mark(type, "server key");
  for (const p of store.ai.providers || []) {
    if (p.enabled && p.apiKeyEnc && !isEnvCopy(p.type, decryptSecret(p.apiKeyEnc))) mark(p.type, "workspace key");
  }
  const ownKeys = (store.userApiCredentials || []).filter((c) => c.userId === session.userId && c.workspaceId === session.workspaceId);
  for (const c of ownKeys) mark(c.provider, "your key");

  const cfg = ragCfg.ragConfig();
  const groqModel = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-20b";
  const liveAnswerLocal = backend.forceLiveAnswerLocal();
  const apiService =
    liveAnswerLocal || opts.probeService === false
      ? null
      : await backend.probeFastApi(1500).then((p) => ({ reachable: p.reachable && (p.status ?? 500) < 500 }));

  return buildProviderStatus({
    now: new Date(),
    env: {
      groqKey: hasEnv(ENV_KEY_NAMES.groq),
      geminiKey: hasEnv(ENV_KEY_NAMES.gemini),
      openAiKey: hasEnv(ENV_KEY_NAMES.openai),
      groqModel,
      groqStreamModel: process.env.GROQ_STREAM_MODEL?.trim() || groqModel,
      groqVisionModel: process.env.GROQ_VISION_MODEL?.trim() || "qwen/qwen3.8-27b",
      groqSttModel: process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo",
      geminiModel: process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest",
      openAiLiveModel: process.env.OPENAI_LIVE_MODEL?.trim() || "gpt-4.1-mini",
      resumeGroqModels: [
        ...new Set([
          process.env.RESUME_GROQ_MODEL || "openai/gpt-oss-120b",
          process.env.GROQ_MODEL || "openai/gpt-oss-20b",
          "openai/gpt-oss-20b",
          "openai/gpt-oss-120b",
          "qwen/qwen3.6-27b",
        ]),
      ],
      liveAnswerLocal,
      qwenConfigured: Boolean(process.env.CUEAI_QWEN_VL_URL?.trim()),
      imageOrder: (process.env.AI_IMAGE_PROVIDER_ORDER || "gemini,openai,groq").split(",").map((s) => s.trim()).filter(Boolean),
      rag: { semantic: ragCfg.isSemanticRagAvailable(), embeddingProvider: cfg.embeddingProvider, embeddingModel: cfg.embeddingModel },
    },
    chains: { general_ai: general, live_session: live, rag },
    configured,
    userCredentials: ownKeys.map(({ provider, status, lastVerifiedAt, lastError, isDefault }) => ({ provider, status, lastVerifiedAt, lastError, isDefault })),
    usage: (store.usage || [])
      .filter((e) => e.workspaceId === session.workspaceId && e.provider)
      .map(({ provider, model, createdAt, metadata }) => ({ provider, model, createdAt, metadata })),
    health: health.providerHealthSnapshot(),
    apiService,
    supportsVision: llm.supportsVision,
  });
}
