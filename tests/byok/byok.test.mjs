#!/usr/bin/env node
/**
 * BYOK security + crypto + resolution unit tests.
 * Run: node --test tests/byok/byok.test.mjs
 */
import assert from "node:assert/strict";
import { createHmac, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

function b64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromB64url(input) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(normalized, "base64");
}

function vaultKey(secret) {
  return createHmac("sha256", secret).update("cueai-secret-key-v2-aes").digest();
}

function encryptSecret(value, secret = "test-secret") {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `aesgcm.${b64url(iv)}.${b64url(encrypted)}.${b64url(tag)}`;
}

function decryptSecret(value, secret = "test-secret") {
  if (!value.startsWith("aesgcm.")) return "";
  const parts = value.split(".");
  const [, ivPart, dataPart, tagPart] = parts;
  const decipher = createDecipheriv("aes-256-gcm", vaultKey(secret), fromB64url(ivPart));
  decipher.setAuthTag(fromB64url(tagPart));
  return Buffer.concat([
    decipher.update(fromB64url(dataPart)),
    decipher.final(),
  ]).toString("utf8");
}

function maskProviderKey(provider, last4) {
  const tail = last4 || "••••";
  switch (provider) {
    case "openai":
      return `sk-••••••••••••${tail}`;
    case "groq":
      return `gsk_••••••••••••${tail}`;
    case "gemini":
      return `AIza••••••••••••${tail}`;
    default:
      return `••••••••${tail}`;
  }
}

function publicCredential(c) {
  return {
    id: c.id,
    name: c.name || "Key",
    provider: c.provider,
    model: c.model,
    maskedKey: maskProviderKey(c.provider, c.keyLast4),
    status: c.status,
    capabilities: c.capabilities,
    isDefault: c.isDefault,
    isActive: c.isDefault,
  };
}

/** Mirrors CredentialResolver precedence for active user key. */
function resolveActiveCredential(store, input) {
  const mine = (store.userApiCredentials || []).filter(
    (c) =>
      c.userId === input.userId &&
      c.workspaceId === input.workspaceId &&
      c.status !== "invalid" &&
      c.capabilities.includes(input.capability),
  );
  const preferred =
    mine.find((c) => c.isDefault) ||
    [...mine].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
  if (preferred) {
    return {
      source: "user",
      provider: preferred.provider,
      model: preferred.model,
      apiKey: decryptSecret(preferred.encryptedApiKey),
      credentialId: preferred.id,
    };
  }
  if (input.envKey) {
    return { source: "env", provider: input.envProvider, model: input.envModel, apiKey: input.envKey };
  }
  return null;
}

test("AES-GCM round-trip encrypts and decrypts", () => {
  const raw = "gsk_test_secret_value_123456";
  const enc = encryptSecret(raw);
  assert.match(enc, /^aesgcm\./);
  assert.equal(decryptSecret(enc), raw);
  assert.ok(!enc.includes(raw));
});

test("tampered ciphertext fails closed", () => {
  const enc = encryptSecret("hello-world-key");
  const bad = enc.slice(0, -4) + "xxxx";
  assert.throws(() => decryptSecret(bad));
});

test("public credential never includes raw or encrypted key", () => {
  const pub = publicCredential({
    id: "uak_1",
    name: "My Groq Key",
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    encryptedApiKey: encryptSecret("gsk_super_secret"),
    keyLast4: "cret",
    status: "connected",
    capabilities: ["rag", "general_ai"],
    isDefault: true,
  });
  const json = JSON.stringify(pub);
  assert.ok(!json.includes("gsk_super"));
  assert.ok(!json.includes("encrypted"));
  assert.ok(!json.includes("apiKey"));
  assert.match(pub.maskedKey, /gsk_••••••••••••cret/);
  assert.equal(pub.name, "My Groq Key");
  assert.equal(pub.model, "llama-3.3-70b-versatile");
  assert.equal(pub.isActive, true);
});

test("capability filter keeps purpose isolation", () => {
  const creds = [
    { id: "1", capabilities: ["rag"], isDefault: true },
    { id: "2", capabilities: ["general_ai"], isDefault: true },
  ];
  const forRag = creds.filter((c) => c.capabilities.includes("rag"));
  assert.deepEqual(
    forRag.map((c) => c.id),
    ["1"],
  );
});

test("workspace isolation filter", () => {
  const creds = [
    { id: "a", userId: "u1", workspaceId: "ws1" },
    { id: "b", userId: "u1", workspaceId: "ws2" },
    { id: "c", userId: "u2", workspaceId: "ws1" },
  ];
  const mine = creds.filter((c) => c.userId === "u1" && c.workspaceId === "ws1");
  assert.deepEqual(
    mine.map((c) => c.id),
    ["a"],
  );
});

test("active user credential beats env fallback", () => {
  const raw = "sk-user-openai-key-abcdef1234";
  const store = {
    userApiCredentials: [
      {
        id: "uak_active",
        userId: "u1",
        workspaceId: "ws1",
        name: "Production OpenAI",
        provider: "openai",
        model: "gpt-4o-mini",
        encryptedApiKey: encryptSecret(raw),
        keyLast4: "1234",
        status: "connected",
        capabilities: ["live_session", "rag", "general_ai"],
        isDefault: true,
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ],
  };
  const resolved = resolveActiveCredential(store, {
    userId: "u1",
    workspaceId: "ws1",
    capability: "live_session",
    envKey: "env-should-not-win",
    envProvider: "groq",
    envModel: "llama-3.1-8b-instant",
  });
  assert.equal(resolved.source, "user");
  assert.equal(resolved.provider, "openai");
  assert.equal(resolved.model, "gpt-4o-mini");
  assert.equal(resolved.apiKey, raw);
});

test("set active flips previous default", () => {
  const creds = [
    { id: "a", isDefault: true },
    { id: "b", isDefault: false },
  ];
  const nextId = "b";
  for (const c of creds) c.isDefault = c.id === nextId;
  assert.equal(creds.find((c) => c.id === "a").isDefault, false);
  assert.equal(creds.find((c) => c.id === "b").isDefault, true);
});

test("create validation rejects empty provider/model/name/key", () => {
  function validate(input) {
    if (!input.provider) return "Select a provider.";
    if (!input.model) return "Select an LLM model.";
    if (!input.name) return "A key name is required.";
    if (!input.apiKey || input.apiKey.length < 8) return "A valid API key is required.";
    return null;
  }
  assert.equal(validate({}), "Select a provider.");
  assert.equal(validate({ provider: "openai" }), "Select an LLM model.");
  assert.equal(validate({ provider: "openai", model: "gpt-4o" }), "A key name is required.");
  assert.equal(
    validate({ provider: "openai", model: "gpt-4o", name: "My Key" }),
    "A valid API key is required.",
  );
  assert.equal(
    validate({
      provider: "openai",
      model: "gpt-4o",
      name: "My Key",
      apiKey: "sk-12345678",
    }),
    null,
  );
});

test("ApiKeysPanel exposes Create a Key controls", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const panelPath = join(
    here,
    "..",
    "..",
    "apps",
    "web",
    "src",
    "components",
    "settings",
    "api-keys-panel.tsx",
  );
  const src = readFileSync(panelPath, "utf8");
  assert.match(src, /Create New Key/);
  assert.match(src, /Use Existing Key/);
  assert.match(src, /No API keys yet/);
  assert.match(src, /LLM Model/);
  assert.match(src, /Key Name/);
  assert.match(src, /Save Key/);
  assert.match(src, /Use Key/);
  assert.ok(!src.includes("stays on this device only"));
  assert.ok(!src.includes("not a real server credential"));
});

test("settings page renders ApiKeysPanel only", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const pagePath = join(
    here,
    "..",
    "..",
    "apps",
    "web",
    "src",
    "app",
    "(app)",
    "settings",
    "page.tsx",
  );
  const src = readFileSync(pagePath, "utf8");
  assert.match(src, /ApiKeysPanel/);
  assert.ok(!src.includes("Public developer API keys"));
  assert.ok(!src.includes("cueai-api-key"));
});

test("live answer routes user BYOK through generateWithCredential", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const livePath = join(
    here,
    "..",
    "..",
    "apps",
    "web",
    "src",
    "app",
    "api",
    "live",
    "answer",
    "route.ts",
  );
  const src = readFileSync(livePath, "utf8");
  assert.match(src, /const userByok = byok\?\.source === "user" \? byok : null/);
  assert.match(src, /generateWithCredential\(userByok/);
});

test("Resume Tailor allows any authenticated role", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const accessPath = join(
    here,
    "..",
    "..",
    "apps",
    "web",
    "src",
    "lib",
    "app-access.ts",
  );
  const guardPath = join(
    here,
    "..",
    "..",
    "apps",
    "web",
    "src",
    "components",
    "auth",
    "require-resume-access.tsx",
  );
  const access = readFileSync(accessPath, "utf8");
  const guard = readFileSync(guardPath, "utf8");
  assert.match(access, /canAccessResumeTailor/);
  assert.match(access, /return true/);
  assert.ok(!guard.includes("Admin and Manager accounts only"));
});
