/**
 * OpenAI → Groq fallback for the shared AI router (screen context, summaries, mock interviews).
 * Uses an isolated data dir and a deliberately invalid OpenAI key; live checks call Groq only
 * when GROQ_API_KEY is available in .env.local. Keys are never printed.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { deflateSync } from "node:zlib";

const envFile = path.join(import.meta.dirname, "..", ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

process.env.CUEAI_DATA_DIR = mkdtempSync(path.join(tmpdir(), "cueai-fallback-"));
process.env.CUEAI_ENV = "test";
process.env.CUEAI_BOOTSTRAP_ADMIN_ENABLED = "false";
process.env.OPENAI_API_KEY = "sk-invalid-fallback-test";
const geminiKey = process.env.GEMINI_API_KEY?.trim() || "";
delete process.env.GEMINI_API_KEY;
delete process.env.AI_IMAGE_PROVIDER_ORDER;
delete process.env.AI_PROVIDER_ORDER;

const { resolveCredentialChain } = await import("../src/lib/server/credential-resolver");
const { generateAi } = await import("../src/lib/server/ai-router");

const hasGroq = Boolean(process.env.GROQ_API_KEY?.trim());
function solidPng(size: number, rgb: [number, number, number]): string {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(size).fill(rgb).flat())]);
  const raw = Buffer.concat(Array(size).fill(row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
}
const RED_PNG = solidPng(64, [220, 20, 20]);

test("app-managed chain tries OpenAI first and Groq second", async () => {
  const chain = await resolveCredentialChain({ capability: "general_ai" });
  assert.equal(chain.userOwned, false);
  const providers = chain.candidates.map((c) => c.provider);
  assert.equal(providers[0], "openai");
  if (hasGroq) assert.equal(providers[1], "groq");
});

test("text request falls back to Groq when OpenAI rejects the key", { skip: !hasGroq }, async () => {
  const result = await generateAi({
    feature: "meeting_summary",
    prompt: "Reply with exactly the word: ready",
    maxOutputTokens: 300,
  });
  assert.equal(result.provider, "groq");
  assert.ok(result.text.trim().length > 0);
});

// Runs before the Gemini test: once a key is used, the catalog persists it in the test store.
test("screenshot request falls back to Groq's vision model without Gemini", { skip: !hasGroq }, async () => {
  const result = await generateAi({
    feature: "screen_context",
    prompt: "What single colour fills this image? Answer in one word.",
    image: { mimeType: "image/png", data: RED_PNG },
    maxOutputTokens: 50,
    timeoutMs: 45_000,
  });
  assert.equal(result.provider, "groq");
  assert.match(result.text, /red/i);
});

test("screenshot request is answered by Gemini first", { skip: !geminiKey }, async () => {
  process.env.GEMINI_API_KEY = geminiKey;
  const result = await generateAi({
    feature: "screen_context",
    prompt: "What single colour fills this image? Answer in one word.",
    image: { mimeType: "image/png", data: RED_PNG },
    maxOutputTokens: 50,
    timeoutMs: 45_000,
  });
  assert.equal(result.provider, "gemini");
  assert.match(result.text, /red/i);
});
