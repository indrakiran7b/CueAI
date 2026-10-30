/**
 * Settings → AI Providers & Models: truthful, sanitized provider/model status.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { NextRequest } from "next/server";

process.env.CUEAI_DATA_DIR = mkdtempSync(path.join(tmpdir(), "cueai-provider-status-"));
process.env.AUTH_SECRET = "test-provider-status-secret-0123456789abcdef";
process.env.CUEAI_SECRET_ENCRYPTION_KEY = "test-provider-status-encryption-key-012345";
process.env.CUEAI_ENV = "test";
process.env.CUEAI_LIVE_ANSWER_LOCAL = "1";
process.env.NEXT_PUBLIC_SKIP_AUTH = "false";
process.env.NEXT_PUBLIC_AUTH_BYPASS = "false";
process.env.CUEAI_BOOTSTRAP_ADMIN_ENABLED = "false";
process.env.RAG_EMBEDDING_PROVIDER = "none";
for (const name of [
  "QDRANT_URL",
  "GEMINI_API_KEY",
  "VERTEX_API_KEY",
  "GOOGLE_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "DEEPSEEK_API_KEY",
  "ANTHROPIC_API_KEY",
  "PERPLEXITY_API_KEY",
  "GROQ_MODEL",
  "GROQ_STREAM_MODEL",
  "RESUME_GROQ_MODEL",
  "CUEAI_QWEN_VL_URL",
]) {
  delete process.env[name];
}
const SERVER_KEY = "gsk_test_server_secret_value_9f8e7d6c";
process.env.GROQ_API_KEY = SERVER_KEY;

const { buildProviderStatus, modelCreator } = await import("../src/lib/server/ai-provider-status");
const { modelsInUse } = await import("../src/lib/ai-models-in-use");
type Input = import("../src/lib/server/ai-provider-status").ProviderStatusInput;
const { recordProviderSuccess, recordProviderFailure, resetProviderHealth } = await import("../src/lib/server/provider-health");
const { updateStore } = await import("../src/lib/server/db");
const { signSession, SESSION_COOKIE } = await import("../src/lib/server/session");
const route = await import("../src/app/api/settings/ai-providers/route");

function baseInput(over: Partial<Input> = {}): Input {
  const envChain = {
    userOwned: false,
    candidates: [{ provider: "groq" as const, model: "openai/gpt-oss-20b", source: "env" as const }],
  };
  return {
    now: new Date("2026-10-28T10:00:00Z"),
    env: {
      groqKey: true,
      geminiKey: false,
      openAiKey: false,
      groqModel: "openai/gpt-oss-20b",
      groqStreamModel: "openai/gpt-oss-20b",
      groqVisionModel: "qwen/qwen3.8-27b",
      groqSttModel: "whisper-large-v3-turbo",
      geminiModel: "gemini-flash-latest",
      openAiLiveModel: "gpt-4.1-mini",
      resumeGroqModels: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"],
      liveAnswerLocal: true,
      qwenConfigured: false,
      imageOrder: ["gemini", "openai", "groq"],
      rag: { semantic: false, embeddingProvider: "none", embeddingModel: "" },
    },
    chains: { general_ai: envChain, live_session: envChain, rag: envChain },
    configured: { groq: ["server key"] },
    userCredentials: [],
    usage: [],
    health: {},
    apiService: null,
    supportsVision: (_p, m) => m.includes("qwen3.8") || m.startsWith("gemini") || m.startsWith("gpt-4"),
    ...over,
  };
}

test("model creator comes from the model id; hosts and routers are never the creator", () => {
  assert.equal(modelCreator("openai/gpt-oss-20b"), "OpenAI");
  assert.equal(modelCreator("whisper-large-v3-turbo"), "OpenAI");
  assert.equal(modelCreator("llama-3.3-70b-versatile"), "Meta");
  assert.equal(modelCreator("qwen/qwen3.6-27b"), "Alibaba (Qwen)");
  assert.equal(modelCreator("gemini-flash-latest"), "Google");
  assert.equal(modelCreator("anthropic/claude-3.5-sonnet"), "Anthropic");
  assert.equal(modelCreator("openrouter/auto"), "Chosen by OpenRouter per request");
  for (const m of ["openai/gpt-oss-20b", "llama-3.3-70b-versatile", "qwen/qwen3.6-27b"]) {
    assert.notEqual(modelCreator(m), "Groq");
  }
  assert.notEqual(modelCreator("some-unknown-model"), "OpenRouter");
});

test("Groq is described as an inference host and OpenRouter as a router", () => {
  const r = buildProviderStatus(baseInput({ configured: { groq: ["server key"], openrouter: ["your key"] } }));
  const groq = r.providers.find((p) => p.id === "groq")!;
  const openrouter = r.providers.find((p) => p.id === "openrouter")!;
  assert.match(groq.role, /host/i);
  assert.match(openrouter.role, /router/i);
  for (const m of groq.models) assert.notEqual(m.creator, "Groq");
});

test("a configured key without a recorded success is 'Configured — not verified', not connected", () => {
  const r = buildProviderStatus(baseInput());
  const groq = r.providers.find((p) => p.id === "groq")!;
  assert.equal(groq.status, "configured_unverified");
  assert.match(groq.statusDetail, /Configured — not verified/);
  assert.equal(groq.isDefault, true);
  assert.equal(groq.lastSuccessAt, null);
});

test("providers without a key are 'not configured'; keys with no routed feature are 'configured but unused'", () => {
  const r = buildProviderStatus(baseInput({ configured: { groq: ["server key"], anthropic: ["workspace key"] } }));
  assert.equal(r.providers.find((p) => p.id === "openai")!.status, "not_configured");
  const anthropic = r.providers.find((p) => p.id === "anthropic")!;
  assert.equal(anthropic.status, "configured_unused");
  assert.deepEqual(anthropic.features, []);
});

test("a recorded success makes a provider active; a later auth failure makes it unavailable", () => {
  const ok = buildProviderStatus(
    baseInput({
      health: { groq: { lastSuccess: { at: "2026-10-28T09:00:00Z", provider: "groq", model: "openai/gpt-oss-20b", feature: "meeting_summary" } } },
    }),
  );
  const groq = ok.providers.find((p) => p.id === "groq")!;
  assert.equal(groq.status, "active");
  assert.equal(groq.lastSuccessAt, "2026-10-28T09:00:00Z");
  assert.equal(ok.features.find((f) => f.id === "summaries")?.lastServed?.model, "openai/gpt-oss-20b");

  const bad = buildProviderStatus(
    baseInput({
      health: {
        groq: {
          lastSuccess: { at: "2026-10-28T09:00:00Z", provider: "groq", model: "openai/gpt-oss-20b", feature: "meeting_summary" },
          lastFailure: { at: "2026-10-28T09:30:00Z", provider: "groq", model: "openai/gpt-oss-20b", feature: "meeting_summary", code: "invalid_credentials" },
        },
      },
    }),
  );
  assert.equal(bad.providers.find((p) => p.id === "groq")!.status, "unavailable");
});

test("every requested feature is traced, including search with no provider", () => {
  const r = buildProviderStatus(baseInput());
  const ids = r.features.map((f) => f.id);
  for (const id of ["transcription", "answers", "screenshots", "resume", "summaries", "knowledge", "translation", "mock_interview", "search"]) {
    assert.ok(ids.includes(id as never), `${id} traced`);
  }
  assert.equal(r.features.find((f) => f.id === "transcription")!.steps[0]?.model, "whisper-large-v3-turbo");
  assert.deepEqual(r.features.find((f) => f.id === "search")!.steps, []);
  assert.match(r.features.find((f) => f.id === "knowledge_index")!.note || "", /keywords/);
  assert.equal(r.informationalOnly, true);
});

test("an unreachable CueAI API service is reported unavailable", () => {
  const r = buildProviderStatus(baseInput({ apiService: { reachable: false }, env: { ...baseInput().env, liveAnswerLocal: false } }));
  assert.equal(r.providers.find((p) => p.id === "cueai-api")!.status, "unavailable");
  assert.equal(r.features.find((f) => f.id === "answers")!.steps[0]?.provider, "cueai-api");
});

test("AI Models in Use lists only providers with routed models, using the configured model ids", () => {
  const r = buildProviderStatus(baseInput());
  const groups = modelsInUse(r);
  const names = groups.map((g) => g.provider);
  const groqName = r.providers.find((p) => p.id === "groq")!.name;
  assert.ok(names.includes(groqName));
  for (const id of ["openai", "anthropic", "openrouter", "deepseek", "perplexity", "gemini"]) {
    const p = r.providers.find((x) => x.id === id)!;
    assert.equal(p.models.length, 0);
    assert.ok(!names.includes(p.name), `${p.name} has no routed model and is not listed`);
  }
  const groq = groups.find((g) => g.provider === groqName)!;
  const ids = groq.models.map((m) => m.id);
  for (const id of ["whisper-large-v3-turbo", "openai/gpt-oss-20b", "openai/gpt-oss-120b"]) assert.ok(ids.includes(id), id);
  assert.equal(new Set(ids).size, ids.length, "each model id is listed once");
  assert.ok(groq.models.every((m) => !m.served), "nothing is marked served without a recorded request");
  assert.ok(!JSON.stringify(groups).match(/key|source|status|feature/i), "no key sources, statuses or feature text");
});

test("AI Models in Use marks only models with a recorded real request as served", () => {
  const r = buildProviderStatus(
    baseInput({
      health: { groq: { lastSuccess: { at: "2026-10-28T09:00:00Z", provider: "groq", model: "openai/gpt-oss-20b", feature: "meeting_summary" } } },
    }),
  );
  const groqName = r.providers.find((p) => p.id === "groq")!.name;
  const groq = modelsInUse(r).find((g) => g.provider === groqName)!;
  assert.equal(groq.models.find((m) => m.id === "openai/gpt-oss-20b")?.served, true);
  assert.equal(groq.models.find((m) => m.id === "whisper-large-v3-turbo")?.served, false);
});

/* ---------- Endpoint ---------- */

const now = new Date().toISOString();
await updateStore((s) => {
  s.users = [
    { id: "usr_p", name: "P", email: "p@cueai.local", passwordHash: "x", role: "User", status: "Active", workspaceId: "ws_p", createdAt: now, plan: "free" },
  ];
});
const cookie = `${SESSION_COOKIE}=${signSession({ userId: "usr_p", email: "p@cueai.local", name: "P", role: "User", workspaceId: "ws_p", workspace: "ws_p" })}`;

async function get(withCookie: boolean) {
  return route.GET(
    new NextRequest("http://127.0.0.1:3000/api/settings/ai-providers", { headers: withCookie ? { cookie } : {} }),
  );
}

test("endpoint requires sign-in", async () => {
  assert.equal((await get(false)).status, 401);
});

test("endpoint returns real routing without exposing keys", async () => {
  resetProviderHealth();
  const res = await get(true);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const raw = await res.text();
  assert.ok(!raw.includes(SERVER_KEY), "server key is never returned");
  assert.ok(!raw.includes(SERVER_KEY.slice(-4)), "no key fragment is returned");
  assert.ok(!/apiKey|encrypted|authorization/i.test(raw), "no secret-bearing fields");
  const body = JSON.parse(raw) as import("../src/lib/server/ai-provider-status").ProviderStatusReport;
  const groq = body.providers.find((p) => p.id === "groq")!;
  assert.equal(groq.status, "configured_unverified");
  assert.deepEqual(groq.keySources, ["server key"], "an env key copied into the catalog is still the server key");
  assert.equal(body.features.find((f) => f.id === "summaries")?.steps[0]?.keySource, "server key");
  assert.equal(body.providers.find((p) => p.id === "gemini")!.status, "not_configured");

  recordProviderSuccess("groq", "openai/gpt-oss-20b", "translation");
  recordProviderFailure("groq", "openai/gpt-oss-20b", "translation", "cancelled");
  const after = (await (await get(true)).json()) as typeof body;
  const g = after.providers.find((p) => p.id === "groq")!;
  assert.equal(g.status, "active");
  assert.equal(g.lastFailure, null, "cancelled requests are not failures");
  assert.equal(after.features.find((f) => f.id === "translation")?.lastServed?.record, "since server start");
});
