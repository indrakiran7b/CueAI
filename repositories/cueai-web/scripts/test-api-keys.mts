import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { NextRequest } from "next/server";

const dataDir = mkdtempSync(path.join(tmpdir(), "cueai-keys-"));
process.env.CUEAI_DATA_DIR = dataDir;
process.env.AUTH_SECRET = "test-api-keys-auth-secret-0123456789";
process.env.CUEAI_SECRET_ENCRYPTION_KEY = "test-api-keys-encryption-key-0123456789";
process.env.CUEAI_ENV = "test";
process.env.NEXT_PUBLIC_SKIP_AUTH = "false";
process.env.NEXT_PUBLIC_AUTH_BYPASS = "false";
process.env.CUEAI_BOOTSTRAP_ADMIN_ENABLED = "false";
for (const name of ["GROQ_API_KEY", "GEMINI_API_KEY", "VERTEX_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY", "PERPLEXITY_API_KEY"]) {
  delete process.env[name];
}

const GOOD_KEY = "sk-test-good-key-1234567890abcd";
const ROTATED_KEY = "sk-test-rotated-key-0987654321wxyz";
const BAD_KEY = "sk-test-bad-key-revoked-000000";
const NO_PERMS_KEY = "sk-test-noperms-key-111111111";
const LIMITED_KEY = "sk-test-limited-key-22222222";

/* Test-only OpenAI-compatible provider: key decides the outcome. */
const calls: { url: string; auth: string; body: string }[] = [];
const fake = createServer((req: IncomingMessage, res: ServerResponse) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const auth = String(req.headers.authorization || "");
    calls.push({ url: req.url || "", auth, body });
    const send = (status: number, payload: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    };
    if (auth.includes(BAD_KEY)) return send(401, { error: { message: `Incorrect API key ${BAD_KEY}` } });
    if (auth.includes(NO_PERMS_KEY)) return send(403, { error: { message: "forbidden" } });
    if (auth.includes(LIMITED_KEY)) return send(429, { error: { message: "slow down" } });
    if (req.url?.endsWith("/models")) return send(200, { data: [{ id: "gpt-4o-mini" }, { id: "gpt-4o" }] });
    if (body.includes("json_object") && body.includes("JSON_MODE_FLAKY")) {
      return send(400, { error: { message: "Failed to generate JSON. Please adjust your prompt." } });
    }
    if (req.url?.endsWith("/chat/completions")) {
      return send(200, { choices: [{ message: { content: "hello from fake" } }], usage: { prompt_tokens: 3, completion_tokens: 4 } });
    }
    return send(404, {});
  });
});
await new Promise<void>((resolve) => fake.listen(0, "127.0.0.1", resolve));
const fakeUrl = `http://127.0.0.1:${(fake.address() as AddressInfo).port}/v1`;
after(() => fake.close());

const resolver = await import("../src/lib/server/credential-resolver");
const router = await import("../src/lib/server/ai-router");
const { LlmAuthError, LlmProviderError } = await import("../src/lib/server/llm-generate");
const { updateStore, readStore } = await import("../src/lib/server/db");
const { signSession, SESSION_COOKIE } = await import("../src/lib/server/session");
const keysRoute = await import("../src/app/api/settings/api-keys/route");
const keyRoute = await import("../src/app/api/settings/api-keys/[id]/route");
const keyTestRoute = await import("../src/app/api/settings/api-keys/[id]/test/route");

const now = new Date().toISOString();
await updateStore((s) => {
  s.workspace.id = "ws_a";
  s.users = (["usr_a", "usr_b"] as const).map((id) => ({
    id,
    name: id,
    email: `${id}@cueai.local`,
    passwordHash: "x",
    role: "User",
    status: "Active" as const,
    workspaceId: "ws_a",
    createdAt: now,
    plan: "free" as const,
  }));
  s.userApiCredentials = [];
});

function req(uid: "usr_a" | "usr_b", url: string, method = "GET", body?: unknown) {
  const token = signSession({ userId: uid, email: `${uid}@cueai.local`, name: uid, role: "User", workspaceId: "ws_a", workspace: "ws_a" });
  return new NextRequest(`http://127.0.0.1:3000${url}`, {
    method,
    headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const ALL_KEYS = [GOOD_KEY, ROTATED_KEY, BAD_KEY, NO_PERMS_KEY, LIMITED_KEY];
async function json(res: Response) {
  const text = await res.text();
  for (const k of ALL_KEYS) assert.ok(!text.includes(k), "responses never contain a raw key");
  return { status: res.status, body: JSON.parse(text) as KeyApiBody };
}
/** Union of the response fields the API-key routes return. */
type KeyApiBody = {
  ok: boolean;
  error: { code: string; message: string };
  item: { id: string; status: string; lastVerifiedAt?: string | null };
  items: unknown[];
  encryption: { ready: boolean; source: string };
};

/* ---------- Probe classification ---------- */

test("probe distinguishes valid, invalid, permissions, rate limit, model, and network failures", async () => {
  const probe = (apiKey: string, model = "gpt-4o-mini", endpoint = fakeUrl) =>
    resolver.probeProviderApiKey({ provider: "openai", apiKey, endpoint, model });
  assert.equal((await probe(GOOD_KEY)).code, "ok");
  assert.equal((await probe(GOOD_KEY, "gpt-9-imaginary")).code, "unsupported_model");
  assert.equal((await probe(BAD_KEY)).code, "invalid_credentials");
  assert.equal((await probe(NO_PERMS_KEY)).code, "missing_permissions");
  const limited = await probe(LIMITED_KEY);
  assert.equal(limited.code, "rate_limited");
  assert.equal(limited.ok, false, "rate limit is not reported as valid");
  const offline = await probe(GOOD_KEY, "gpt-4o-mini", "http://127.0.0.1:1/v1");
  assert.equal(offline.code, "network_error");
  assert.equal(offline.ok, false);
  const bad = await probe(BAD_KEY);
  assert.ok(!bad.message.includes(BAD_KEY), "probe message never echoes the key");
});

test("custom endpoints must be public HTTPS in production", () => {
  assert.equal(resolver.validateCustomEndpoint(""), null);
  assert.equal(resolver.validateCustomEndpoint("http://127.0.0.1:8080/v1"), null);
  process.env.CUEAI_ENV = "production";
  try {
    assert.ok(resolver.validateCustomEndpoint("http://api.example.com/v1"));
    assert.ok(resolver.validateCustomEndpoint("https://127.0.0.1/v1"));
    assert.ok(resolver.validateCustomEndpoint("https://10.1.2.3/v1"));
    assert.ok(resolver.validateCustomEndpoint("https://169.254.169.254/latest"));
    assert.ok(resolver.validateCustomEndpoint("https://localhost/v1"));
    assert.ok(resolver.validateCustomEndpoint("https://user:pw@api.example.com/v1"));
    assert.equal(resolver.validateCustomEndpoint("https://api.example.com/v1"), null);
  } finally {
    process.env.CUEAI_ENV = "test";
  }
});

/* ---------- Error classification ---------- */

test("router classifies provider errors without exposing provider text", () => {
  const cred = { provider: "openai" as const, model: "gpt-4o-mini", source: "user" as const };
  const cases: [unknown, string][] = [
    [new LlmAuthError("Incorrect API key sk-live-secret", 401), "invalid_credentials"],
    [new LlmAuthError("nope", 403), "missing_permissions"],
    [new LlmProviderError("Too many", 429), "rate_limited"],
    [new LlmProviderError("model not found", 404), "unsupported_model"],
    [Object.assign(new Error("t"), { name: "TimeoutError" }), "timeout"],
    [Object.assign(new Error("a"), { name: "AbortError" }), "cancelled"],
    [new TypeError("fetch failed"), "network_error"],
    [new LlmProviderError("boom", 500), "provider_error"],
  ];
  for (const [err, code] of cases) {
    const out = router.classifyAiError(err, cred);
    assert.equal(out.code, code);
    assert.ok(!out.message.includes("sk-live-secret"));
  }
  assert.equal(router.classifyAiError(new LlmProviderError("x", 429), cred).retryable, true);
  assert.equal(router.classifyAiError(new LlmAuthError("x", 401), cred).retryable, false);
});

/* ---------- Key management routes ---------- */

let keyId = "";

test("create validates the key, stores it encrypted, and returns only a masked view", async () => {
  const invalid = await json(
    await keysRoute.POST(req("usr_a", "/api/settings/api-keys", "POST", { provider: "openai", model: "gpt-4o-mini", name: "Bad", apiKey: BAD_KEY, endpoint: fakeUrl })),
  );
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, "INVALID_CREDENTIALS");

  const created = await json(
    await keysRoute.POST(req("usr_a", "/api/settings/api-keys", "POST", { provider: "openai", model: "gpt-4o-mini", name: "Mine", apiKey: GOOD_KEY, endpoint: fakeUrl })),
  );
  assert.equal(created.status, 201);
  keyId = created.body.item.id;
  assert.equal(created.body.item.status, "connected");
  assert.ok(created.body.item.lastVerifiedAt);

  const store = await readStore();
  const row = store.userApiCredentials!.find((c) => c.id === keyId)!;
  assert.ok(!row.encryptedApiKey.includes(GOOD_KEY));
  assert.ok(!readFileSync(path.join(dataDir, "workspace-store.json"), "utf8").includes(GOOD_KEY), "key is not stored in plaintext on disk");

  const list = await json(await keysRoute.GET(req("usr_a", "/api/settings/api-keys")));
  assert.equal(list.body.items.length, 1);
  assert.equal(list.body.encryption.ready, true);
  assert.equal(list.body.encryption.source, "dedicated");
});

test("re-validate reports the current state and updates status", async () => {
  const ok = await json(await keyTestRoute.POST(req("usr_a", `/api/settings/api-keys/${keyId}/test`, "POST"), ctx(keyId)));
  assert.equal(ok.body.ok, true);
  assert.equal(ok.body.item.status, "connected");
  assert.equal((await keyTestRoute.POST(req("usr_b", `/api/settings/api-keys/${keyId}/test`, "POST"), ctx(keyId))).status, 404);
});

test("update rejects an invalid replacement key and keeps the old one; valid rotation works", async () => {
  const rejected = await json(await keyRoute.PATCH(req("usr_a", `/api/settings/api-keys/${keyId}`, "PATCH", { apiKey: BAD_KEY }), ctx(keyId)));
  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.error.code, "INVALID_CREDENTIALS");
  assert.equal((await readStore()).userApiCredentials!.find((c) => c.id === keyId)!.keyLast4, GOOD_KEY.slice(-4));

  const rotated = await json(await keyRoute.PATCH(req("usr_a", `/api/settings/api-keys/${keyId}`, "PATCH", { apiKey: ROTATED_KEY }), ctx(keyId)));
  assert.equal(rotated.status, 200);
  assert.equal((await keyRoute.PATCH(req("usr_b", `/api/settings/api-keys/${keyId}`, "PATCH", { name: "steal" }), ctx(keyId))).status, 404);
  const ssrf = await keyRoute.PATCH(req("usr_a", `/api/settings/api-keys/${keyId}`, "PATCH", { endpoint: "ftp://example.com" }), ctx(keyId));
  assert.equal(ssrf.status, 400);
});

/* ---------- Services use the selected key ---------- */

test("features route through the user's key; other users never borrow it", async () => {
  for (const feature of ["translation", "knowledge", "meeting_summary", "resume", "mock_interview", "live_answer"] as const) {
    const before = calls.length;
    const out = await router.generateAi({ feature, userId: "usr_a", workspaceId: "ws_a", prompt: "hi", maxOutputTokens: 5 });
    assert.equal(out.text, "hello from fake");
    assert.equal(out.source, "user");
    assert.equal(calls.length, before + 1);
    assert.equal(calls.at(-1)!.auth, `Bearer ${ROTATED_KEY}`, `${feature} used the user's current key`);
  }
  await assert.rejects(
    router.generateAi({ feature: "translation", userId: "usr_b", workspaceId: "ws_a", prompt: "hi" }),
    (err: unknown) => err instanceof router.AiRouterError && err.code === "not_configured",
  );
  await assert.rejects(
    router.generateAi({ feature: "translation", userId: "usr_a", workspaceId: "ws_other", prompt: "hi" }),
    (err: unknown) => err instanceof router.AiRouterError && err.code === "not_configured",
    "keys are scoped to the workspace",
  );
});

test("a provider rejecting strict JSON mode is retried once on the same key without it", async () => {
  const before = calls.length;
  const out = await router.generateAi({ feature: "mock_interview", userId: "usr_a", workspaceId: "ws_a", prompt: "JSON_MODE_FLAKY", jsonObject: true });
  assert.equal(out.text, "hello from fake");
  assert.equal(calls.length, before + 2);
  assert.ok(calls.at(-2)!.body.includes("json_object"));
  assert.ok(!calls.at(-1)!.body.includes("json_object"));
  assert.equal(calls.at(-1)!.auth, `Bearer ${ROTATED_KEY}`);
});

test("a failing user key is not silently replaced by an app-managed key", async () => {
  process.env.GROQ_API_KEY = "gsk-test-app-key-should-not-be-used";
  const { encryptSecret } = await import("../src/lib/server/session");
  await updateStore((s) => {
    s.userApiCredentials!.find((c) => c.id === keyId)!.encryptedApiKey = encryptSecret(BAD_KEY);
  });
  const before = calls.length;
  try {
    await assert.rejects(
      router.generateAi({ feature: "translation", userId: "usr_a", workspaceId: "ws_a", prompt: "hi" }),
      (err: unknown) => err instanceof router.AiRouterError && err.code === "invalid_credentials" && !err.message.includes(BAD_KEY),
    );
    assert.equal(calls.length, before + 1, "exactly one attempt, with the user's key");
  } finally {
    delete process.env.GROQ_API_KEY;
  }
});

test("vision requests fail clearly when no vision-capable model exists", async () => {
  await updateStore((s) => {
    const row = s.userApiCredentials!.find((c) => c.id === keyId)!;
    row.provider = "groq";
    row.model = "llama-3.3-70b-versatile";
  });
  await assert.rejects(
    router.generateAi({ feature: "screen_context", userId: "usr_a", workspaceId: "ws_a", prompt: "describe", image: { mimeType: "image/png", data: "iVBORw0KGgo=" } }),
    (err: unknown) => err instanceof router.AiRouterError && err.code === "vision_unsupported",
  );
});

test("delete removes the key and only for its owner", async () => {
  assert.equal((await keyRoute.DELETE(req("usr_b", `/api/settings/api-keys/${keyId}`, "DELETE"), ctx(keyId))).status, 404);
  assert.equal((await keyRoute.DELETE(req("usr_a", `/api/settings/api-keys/${keyId}`, "DELETE"), ctx(keyId))).status, 200);
  const list = await json(await keysRoute.GET(req("usr_a", "/api/settings/api-keys")));
  assert.equal(list.body.items.length, 0);
});
