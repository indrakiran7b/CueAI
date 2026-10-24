/**
 * Manual check against real provider APIs. Reads keys from .env.local; prints only
 * provider names, result codes, and latency — never keys or provider messages.
 * Usage: npx tsx --tsconfig tsconfig.json scripts/verify-providers-live.mts
 */
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
process.env.CUEAI_DATA_DIR = mkdtempSync(path.join(tmpdir(), "cueai-verify-"));
process.env.CUEAI_ENV = "test";

const { probeProviderApiKey, DEFAULT_CHAT_MODELS } = await import("../src/lib/server/credential-resolver");
const { generateAi } = await import("../src/lib/server/ai-router");

const ENV: Record<string, string> = {
  groq: "GROQ_API_KEY",
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
};

console.log("== Invalid keys against real endpoints ==");
for (const provider of Object.keys(ENV)) {
  const r = await probeProviderApiKey({ provider: provider as never, apiKey: "invalid-key-for-cueai-verification-000000" });
  console.log(`${provider.padEnd(11)} ${r.code}`);
}

console.log("== Configured keys (from .env.local) ==");
for (const [provider, name] of Object.entries(ENV)) {
  const key = process.env[name]?.trim();
  if (!key) {
    console.log(`${provider.padEnd(11)} not configured`);
    continue;
  }
  const model = DEFAULT_CHAT_MODELS[provider]?.[0];
  const r = await probeProviderApiKey({ provider: provider as never, apiKey: key, model });
  console.log(`${provider.padEnd(11)} ${r.code} (model ${model})`);
}

console.log("== Router first-response latency (app-managed chain) ==");
for (const feature of ["live_answer", "mock_interview", "translation"] as const) {
  const samples: number[] = [];
  let label = "";
  for (let i = 0; i < 3; i++) {
    const started = Date.now();
    try {
      const out = await generateAi({
        feature,
        workspaceId: "ws_default",
        system: "Reply briefly.",
        prompt: "In one sentence, what is a REST API?",
        maxOutputTokens: 80,
        timeoutMs: 15_000,
      });
      samples.push(Date.now() - started);
      label = `${out.provider}/${out.model}`;
    } catch (err) {
      console.log(`${feature} failed: ${(err as { code?: string }).code || "error"}`);
      break;
    }
  }
  if (samples.length) {
    const sorted = [...samples].sort((a, b) => a - b);
    console.log(`${feature.padEnd(15)} ${label} ms=${samples.join(",")} median=${sorted[Math.floor(sorted.length / 2)]}`);
  }
}
