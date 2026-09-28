#!/usr/bin/env node
/**
 * Semantic RAG E2E: Qdrant + embeddings + Groq answers.
 * Run from repo root:
 *   cd apps/web && npx tsx --tsconfig tsconfig.json ../../scripts/e2e_semantic_rag.mjs
 *
 * Does not print API keys.
 */
import { config } from "dotenv";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, "apps/web/.env.local") });
process.chdir(path.join(root, "apps/web"));

const { extractDocument } = await import("../apps/web/src/lib/server/extract-document.ts");
const { updateStore, readStore } = await import("../apps/web/src/lib/server/db.ts");
const { processKnowledgeDocument } = await import(
  "../apps/web/src/lib/server/rag/document-processor.ts"
);
const { queryKnowledge, retrieveForMeeting } = await import(
  "../apps/web/src/lib/server/rag/rag-service.ts"
);
const { storeKnowledgeFile } = await import("../apps/web/src/lib/server/rag/storage.ts");
const {
  isSemanticRagAvailable,
  ragConfig,
} = await import("../apps/web/src/lib/server/rag/config.ts");
const {
  qdrantHealth,
  countCollectionPoints,
  getEmbeddingDimension,
  embeddingAvailable,
} = await import("../apps/web/src/lib/server/rag/index.ts");
const { embedText } = await import("../apps/web/src/lib/server/rag/embeddings.ts");
const { searchVectors } = await import("../apps/web/src/lib/server/rag/vector-store.ts");

const WS = "ws_semantic_e2e";
const cfg = ragConfig();

console.log("semantic_available", isSemanticRagAvailable());
console.log("embedding_available", embeddingAvailable());
console.log("qdrant_url_set", Boolean(cfg.qdrantUrl));
console.log("collection", cfg.qdrantCollection);
console.log("embedding_model", cfg.embeddingModel);
console.log("score_threshold", cfg.scoreThreshold);
console.log("top_k", cfg.topK);

if (!isSemanticRagAvailable()) {
  console.error("FAIL: semantic RAG not configured (need QDRANT_URL + embedding key)");
  process.exit(1);
}

const healthy = await qdrantHealth();
console.log("qdrant_health", healthy);
if (!healthy) {
  console.error("FAIL: Qdrant not reachable");
  process.exit(1);
}

const dim = getEmbeddingDimension();
console.log("embedding_dimension", dim);

// Probe embedding
const probe = await embedText("TLS 1.3 encrypted network communication");
console.log("probe_embedding_len", probe.length);
if (probe.length !== dim) {
  console.error("FAIL: embedding dimension mismatch", probe.length, "vs", dim);
  process.exit(1);
}

const CATEGORY_MAP = {
  security: "security",
  gtm: "gtm",
  engineering: "engineering",
  sales: "sales",
  data: "engineering",
};

const docs = [];
for (const [folder, category] of Object.entries(CATEGORY_MAP)) {
  const dir = path.join(root, "test_knowledge", folder);
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".pdf"))) {
    docs.push({ folder, category, filename: f, path: path.join(dir, f) });
  }
}

// Clear prior e2e docs for this workspace
await updateStore(async (s) => {
  s.knowledge = s.knowledge.filter((k) => k.workspaceId !== WS);
});

let totalChunks = 0;
const idByFile = new Map();

for (const doc of docs) {
  const buf = readFileSync(doc.path);
  const extracted = await extractDocument(buf, doc.filename, "application/pdf");
  if (extracted.text.includes("%PDF-")) throw new Error("binary leak " + doc.filename);
  const stored = await storeKnowledgeFile({
    workspaceId: WS,
    originalFilename: doc.filename,
    buffer: buf,
  });
  const id =
    "kb_sem_" + createHash("sha1").update(doc.filename).digest("hex").slice(0, 8);
  idByFile.set(doc.filename, id);
  await updateStore(async (s) => {
    s.knowledge = s.knowledge.filter((k) => k.id !== id);
    s.knowledge.unshift({
      id,
      workspaceId: WS,
      knowledgeScope: "workspace",
      meetingId: null,
      category: doc.category,
      title: doc.filename,
      type: "pdf",
      status: "processing",
      sizeLabel: `${Math.max(1, Math.round(buf.length / 1024))} KB`,
      content: extracted.text.slice(0, 200_000),
      pageCount: extracted.pageCount,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: "semantic_e2e",
      originalFilename: doc.filename,
      mimeType: "application/pdf",
      fileSize: buf.length,
      storagePath: stored.storagePath,
      checksum: stored.checksum,
      documentVersion: 1,
      chunkCount: 0,
      embeddingStatus: "pending",
      vectorIndexed: false,
    });
  });
  await processKnowledgeDocument(id);
  const after = (await readStore()).knowledge.find((k) => k.id === id);
  console.log(
    "indexed",
    doc.filename,
    "status",
    after?.status,
    "chunks",
    after?.chunkCount,
    "vector",
    after?.vectorIndexed,
    "embed",
    after?.embeddingStatus,
    after?.processingError || "",
  );
  if (after?.status !== "indexed" || !after.vectorIndexed) {
    console.error("FAIL: document not vector-indexed", doc.filename);
    process.exit(1);
  }
  totalChunks += after.chunkCount || 0;
}

const points = await countCollectionPoints();
console.log("documents_indexed", docs.length);
console.log("chunks_indexed", totalChunks);
console.log("qdrant_points", points);
if (points < totalChunks) {
  console.warn("WARN: qdrant points < chunk count (other collections may share store)");
}

async function assertCase(label, query, expect) {
  const t0 = Date.now();
  const result = await queryKnowledge({ workspaceId: WS, query });
  const ms = Date.now() - t0;
  const top = result.sources?.[0]?.filename || "";
  const okMethod = result.retrievalMethod === expect.retrievalMethod;
  const okUsed = result.knowledgeUsed === expect.knowledgeUsed;
  const okSource =
    !expect.sourceRegex || expect.sourceRegex.test(top) ||
    result.sources.some((s) => expect.sourceRegex.test(s.filename));
  const okAnswer = !expect.answerRegex || expect.answerRegex.test(result.answer || "");
  const pass = okMethod && okUsed && okSource && okAnswer && (expect.sourcesEmpty ? (result.sources?.length || 0) === 0 : true);
  console.log(
    pass ? "PASS" : "FAIL",
    label,
    "| method=",
    result.retrievalMethod,
    "| used=",
    result.knowledgeUsed,
    "| source=",
    top || "-",
    "| score=",
    result.sources?.[0]?.score ?? "-",
    "| embedMs=",
    result.diagnostics?.embeddingMs,
    "| retrieveMs=",
    result.diagnostics?.retrievalMs,
    "| llmMs=",
    result.diagnostics?.llmMs,
    "| totalMs=",
    result.diagnostics?.totalMs ?? ms,
  );
  if (!pass) {
    console.log("  answer:", (result.answer || "").slice(0, 180));
    process.exitCode = 1;
  }
  return result;
}

await assertCase("TLS version", "What TLS version is used for encrypted communication?", {
  retrievalMethod: "semantic",
  knowledgeUsed: true,
  sourceRegex: /Security_Architecture/,
  answerRegex: /TLS\s*1\.3/i,
});

await assertCase("Backend framework", "What backend framework does the project use?", {
  retrievalMethod: "semantic",
  knowledgeUsed: true,
  sourceRegex: /Backend_Architecture/,
  answerRegex: /FastAPI/i,
});

await assertCase("GTM strategy", "What is the company's GTM strategy?", {
  retrievalMethod: "semantic",
  knowledgeUsed: true,
  sourceRegex: /Go_To_Market/,
});

await assertCase("Sales stages", "What are the sales stages?", {
  retrievalMethod: "semantic",
  knowledgeUsed: true,
  sourceRegex: /Sales_Playbook|Enterprise_Sales_Process/,
});

await assertCase("Sales qualification", "What is the sales qualification process?", {
  retrievalMethod: "semantic",
  knowledgeUsed: true,
  sourceRegex: /Sales_Playbook|Enterprise_Sales_Process/,
});

await assertCase("Japan capital fallback", "What is the capital of Japan?", {
  retrievalMethod: "none",
  knowledgeUsed: false,
  sourcesEmpty: true,
  answerRegex: /tokyo/i,
});

// Paraphrase: keyword weak, semantic should still hit
{
  const paraphrase = "How is communication between services encrypted?";
  // Raw vector scores for diagnostics
  const vector = await embedText(paraphrase);
  const hits = await searchVectors({
    workspaceId: WS,
    vector,
    topK: 5,
    scoreThreshold: 0.05, // inspect raw; relevance still gated by cfg threshold in query
  });
  console.log(
    "paraphrase_raw_hits",
    hits.slice(0, 3).map((h) => ({
      f: h.payload?.filename,
      score: Number(h.score.toFixed(4)),
    })),
  );
  await assertCase("Paraphrase encryption", paraphrase, {
    retrievalMethod: "semantic",
    knowledgeUsed: true,
    sourceRegex: /Security_Architecture/,
  });
}

// Meeting isolation
{
  const mtgA = "mtg_sem_a";
  const mtgB = "mtg_sem_b";
  const aId = "kb_sem_mtg_a";
  const bId = "kb_sem_mtg_b";
  await updateStore(async (s) => {
    for (const [id, meetingId, text, filename] of [
      [aId, mtgA, "Meeting A notes: Client prefers GraphQL federation.", "Meeting_A_Notes.pdf"],
      [bId, mtgB, "Meeting B notes: Client prefers SOAP legacy adapters.", "Meeting_B_Notes.pdf"],
    ]) {
      s.knowledge = s.knowledge.filter((k) => k.id !== id);
      s.knowledge.unshift({
        id,
        workspaceId: WS,
        knowledgeScope: "meeting",
        meetingId,
        category: "engineering",
        title: filename,
        type: "txt",
        status: "processing",
        sizeLabel: "1 KB",
        content: text,
        pageCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: "semantic_e2e",
        originalFilename: filename,
        documentVersion: 1,
        chunkCount: 0,
      });
    }
  });
  await processKnowledgeDocument(aId);
  await processKnowledgeDocument(bId);

  const meet = await retrieveForMeeting({
    workspaceId: WS,
    meetingId: mtgA,
    query: "Does the client prefer GraphQL federation?",
    includeWorkspace: false,
  });
  const fromB = meet.chunks.some((c) => c.documentId === bId || /SOAP/i.test(c.text));
  const fromA = meet.chunks.some((c) => c.documentId === aId || /GraphQL/i.test(c.text));
  console.log(
    fromA && !fromB
      ? "PASS"
      : "FAIL",
    "meeting isolation",
    "| method=",
    meet.retrievalMethod,
    "| used=",
    meet.knowledgeUsed,
    "| chunks=",
    meet.chunks.map((c) => c.filename),
  );
  if (!fromA || fromB) process.exitCode = 1;
}

// Cross-workspace isolation
{
  const vector = await embedText("What TLS version is used?");
  const foreign = await searchVectors({
    workspaceId: "ws_other_workspace",
    vector,
    topK: 5,
    scoreThreshold: 0.1,
  });
  console.log(
    foreign.length === 0 ? "PASS" : "FAIL",
    "cross-workspace isolation",
    "| foreign_hits=",
    foreign.length,
  );
  if (foreign.length) process.exitCode = 1;
}

if (process.exitCode && process.exitCode !== 0) {
  console.error("SEMANTIC_E2E_FAILED");
  process.exit(process.exitCode);
}
console.log("SEMANTIC_E2E_OK");
