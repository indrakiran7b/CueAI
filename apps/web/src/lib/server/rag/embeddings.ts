/**
 * Provider-independent embedding service (server-side only).
 *
 * Providers: openai (incl. OpenAI-compatible via OPENAI_BASE_URL), gemini, local.
 */

import { ragConfig } from "@/lib/server/rag/config";

export class EmbeddingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingError";
  }
}

function openaiKey(): string {
  return process.env.OPENAI_API_KEY?.trim() || "";
}

/** OpenAI-compatible base URL (OpenAI, OpenRouter, Azure-compatible proxies, etc.). */
function openaiBaseUrl(): string {
  return (
    process.env.OPENAI_BASE_URL?.trim().replace(/\/$/, "") ||
    "https://api.openai.com/v1"
  );
}

function geminiKey(): string {
  return process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || "";
}

export function embeddingAvailable(): boolean {
  const cfg = ragConfig();
  if (cfg.embeddingProvider === "none") return false;
  if (cfg.embeddingProvider === "local") return true;
  if (cfg.embeddingProvider === "gemini") return Boolean(geminiKey());
  return Boolean(openaiKey());
}

export function getEmbeddingDimension(): number {
  const cfg = ragConfig();
  const model = cfg.embeddingModel;
  if (cfg.embeddingProvider === "local") {
    if (model.includes("mpnet") || model.includes("MiniLM-L12")) return 384;
    if (model.includes("MiniLM")) return 384;
    return 384;
  }
  if (model.includes("3-large")) return 3072;
  if (model.includes("embedding-004") || model.includes("gecko")) return 768;
  if (model.includes("3-small") || model.includes("ada-002")) return 1536;
  return 1536;
}

async function embedOpenAI(texts: string[]): Promise<number[][]> {
  const key = openaiKey();
  if (!key) throw new EmbeddingError("OPENAI_API_KEY is not configured.");
  const model = ragConfig().embeddingModel;
  const res = await fetch(`${openaiBaseUrl()}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input: texts }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    data?: Array<{ embedding: number[]; index: number }>;
    error?: { message?: string };
  };
  if (!res.ok || !body.data) {
    throw new EmbeddingError(body.error?.message || "OpenAI embedding request failed.");
  }
  return body.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

async function embedGemini(texts: string[]): Promise<number[][]> {
  const key = geminiKey();
  if (!key) throw new EmbeddingError("GEMINI_API_KEY is not configured.");
  const model = ragConfig().embeddingModel || "text-embedding-004";
  const out: number[][] = [];
  for (const text of texts) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${model}`,
        content: { parts: [{ text }] },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      embedding?: { values?: number[] };
      error?: { message?: string };
    };
    if (!res.ok || !body.embedding?.values) {
      throw new EmbeddingError(body.error?.message || "Gemini embedding request failed.");
    }
    out.push(body.embedding.values);
  }
  return out;
}

type LocalPipeline = {
  (
    texts: string[],
    opts: { pooling: "mean"; normalize: boolean },
  ): Promise<{ tolist: () => number[][] } | { data: Float32Array; dims: number[] }>;
};

let localPipeline: LocalPipeline | null = null;

async function getLocalPipeline(): Promise<LocalPipeline> {
  if (localPipeline) return localPipeline;
  const model = ragConfig().embeddingModel || "Xenova/all-MiniLM-L6-v2";
  // Dynamic import keeps cloud-only installs light when local is unused.
  const { pipeline, env } = await import("@xenova/transformers");
  // Cache models under apps/web/.data (gitignored via **/.data/).
  env.cacheDir = `${process.cwd()}/.data/transformers-cache`;
  env.allowLocalModels = true;
  localPipeline = (await pipeline("feature-extraction", model)) as unknown as LocalPipeline;
  return localPipeline;
}

function l2Normalize(vec: number[]): number[] {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum) || 1;
  return vec.map((v) => v / norm);
}

async function embedLocal(texts: string[]): Promise<number[][]> {
  const extractor = await getLocalPipeline();
  const out: number[][] = [];
  // Batch one-by-one for stable memory on Windows.
  for (const text of texts) {
    const result = await extractor([text], { pooling: "mean", normalize: true });
    if (result && typeof (result as { tolist?: unknown }).tolist === "function") {
      const listed = (result as { tolist: () => number[][] | number[] }).tolist();
      const row = Array.isArray(listed[0]) ? (listed as number[][])[0]! : (listed as number[]);
      out.push(l2Normalize(row));
      continue;
    }
    const tensor = result as { data: Float32Array; dims: number[] };
    const dims = tensor.dims || [];
    const width = dims.length >= 2 ? dims[dims.length - 1]! : tensor.data.length;
    const row = Array.from(tensor.data.slice(0, width));
    out.push(l2Normalize(row));
  }
  return out;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const cleaned = texts.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!cleaned.length) return [];
  const cfg = ragConfig();
  if (cfg.embeddingProvider === "local") return embedLocal(cleaned);
  if (cfg.embeddingProvider === "gemini") return embedGemini(cleaned);
  if (cfg.embeddingProvider === "none") {
    throw new EmbeddingError("Embedding provider is disabled.");
  }
  return embedOpenAI(cleaned);
}

export async function embedText(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text]);
  if (!vec) throw new EmbeddingError("Empty embedding.");
  return vec;
}
