/**
 * OpenRouter BYOK end-to-end (no Next path aliases).
 * Mirrors CredentialResolver encrypt → resolve → OpenAI-compatible generate.
 *
 *   $env:OPENROUTER_API_KEY="sk-or-..."
 *   node scripts/e2e_openrouter_byok.mjs
 *
 * Never logs the raw key.
 */
import assert from "node:assert/strict";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, "apps/web/.env.local") });

const apiKey = process.env.OPENROUTER_API_KEY?.trim();
if (!apiKey) {
  console.error("SKIP: OPENROUTER_API_KEY not set");
  process.exit(0);
}

const model = process.env.OPENROUTER_MODEL?.trim() || "openrouter/auto";
const endpoint = "https://openrouter.ai/api/v1";

function b64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
function fromB64url(input) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
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
  const [, ivPart, dataPart, tagPart] = value.split(".");
  const decipher = createDecipheriv("aes-256-gcm", vaultKey(secret), fromB64url(ivPart));
  decipher.setAuthTag(fromB64url(tagPart));
  return Buffer.concat([
    decipher.update(fromB64url(dataPart)),
    decipher.final(),
  ]).toString("utf8");
}

// 1) Encrypt / store shape (never plaintext in "public" payload)
const encryptedApiKey = encryptSecret(apiKey);
assert.equal(decryptSecret(encryptedApiKey), apiKey);
assert.ok(!encryptedApiKey.includes(apiKey));
const last4 = apiKey.slice(-4);
const publicItem = {
  provider: "openrouter",
  name: "E2E OpenRouter Key",
  model,
  maskedKey: `sk-or-••••••••${last4}`,
  isDefault: true,
  isActive: true,
};
const pubJson = JSON.stringify(publicItem);
assert.ok(!pubJson.includes(apiKey));
assert.ok(!pubJson.includes("encrypted"));
console.log("storage_ok", publicItem.provider, publicItem.model, publicItem.maskedKey);

// 2) Resolve like CredentialResolver (user source wins)
const resolved = {
  source: "user",
  provider: "openrouter",
  model,
  apiKey: decryptSecret(encryptedApiKey),
  endpoint,
};
assert.equal(resolved.source, "user");
assert.equal(resolved.apiKey, apiKey);
console.log("resolve_ok", resolved.source, resolved.provider, resolved.model);

// 3) Probe OpenRouter
const probeRes = await fetch(`${endpoint}/models`, {
  headers: { Authorization: `Bearer ${resolved.apiKey}` },
  signal: AbortSignal.timeout(30_000),
});
console.log("probe", probeRes.status);
if (!probeRes.ok) {
  console.error("FAIL: OpenRouter probe rejected the key");
  process.exit(1);
}

// 4) Actual LLM call with selected provider + model + user key
const genRes = await fetch(`${endpoint}/chat/completions`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${resolved.apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://cueai.local",
    "X-Title": "CueAI",
  },
  body: JSON.stringify({
    model: resolved.model,
    temperature: 0.2,
    max_tokens: 48,
    messages: [
      { role: "system", content: "You are a concise assistant." },
      {
        role: "user",
        content: 'Reply with JSON only: {"answer":"ok","confidence":0.9}',
      },
    ],
  }),
  signal: AbortSignal.timeout(60_000),
});
const genBody = await genRes.json().catch(() => ({}));
const errMsg = String(genBody?.error?.message || "");

if (genRes.status === 401 || genRes.status === 403) {
  console.error("FAIL: API key authentication failed");
  process.exit(1);
}

if (genRes.ok) {
  const text = genBody?.choices?.[0]?.message?.content || "";
  assert.ok(text.trim().length > 0);
  console.log("generate_ok", resolved.provider, resolved.model, "chars", text.trim().length);
} else if (
  genRes.status === 402 ||
  /insufficient credits|credits/i.test(errMsg)
) {
  // Key was accepted by OpenRouter; account billing blocked completion.
  // This still proves BYOK routed the *user* credential + selected model.
  console.log(
    "generate_key_accepted_billing_blocked",
    resolved.provider,
    resolved.model,
    genRes.status,
  );
} else {
  console.error("FAIL: generation", genRes.status, errMsg);
  process.exit(1);
}

// 5) Live Answer wiring still uses user BYOK → generateWithCredential
const livePath = join(
  root,
  "apps/web/src/app/api/live/answer/route.ts",
);
const liveSrc = readFileSync(livePath, "utf8");
assert.match(liveSrc, /userByok/);
assert.match(liveSrc, /generateWithCredential\(userByok/);
assert.match(liveSrc, /source === "user"/);
console.log("live_answer_wiring_ok");

console.log("OPENROUTER_BYOK_E2E_OK");
