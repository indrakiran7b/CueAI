#!/usr/bin/env node
/**
 * Live E2E: extract → index → queryKnowledge (RAG + general AI fallback).
 * Uses apps/web/.env.local for GROQ_API_KEY. Does not print secrets.
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, "apps/web/.env.local") });
process.chdir(path.join(root, "apps/web"));

const { extractDocument } = await import("../apps/web/src/lib/server/extract-document.ts");
const { updateStore, readStore } = await import("../apps/web/src/lib/server/db.ts");
const { processKnowledgeDocument } = await import(
  "../apps/web/src/lib/server/rag/document-processor.ts"
);
const { queryKnowledge } = await import("../apps/web/src/lib/server/rag/rag-service.ts");
const { storeKnowledgeFile } = await import("../apps/web/src/lib/server/rag/storage.ts");

const pdfPath = path.join(root, "test_knowledge/security/Security_Architecture.pdf");
const buf = readFileSync(pdfPath);
const extracted = await extractDocument(buf, "Security_Architecture.pdf", "application/pdf");
if (extracted.text.includes("%PDF-")) throw new Error("binary leak");
console.log("extracted_pages", extracted.pageCount, "chars", extracted.text.length);

const stored = await storeKnowledgeFile({
  workspaceId: "ws_e2e_rag",
  originalFilename: "Security_Architecture.pdf",
  buffer: buf,
});
const id = "kb_e2e_tls";
await updateStore(async (s) => {
  s.knowledge = s.knowledge.filter((k) => k.id !== id);
  s.knowledge.unshift({
    id,
    workspaceId: "ws_e2e_rag",
    knowledgeScope: "workspace",
    meetingId: null,
    category: "security",
    title: "Security_Architecture.pdf",
    type: "pdf",
    status: "processing",
    sizeLabel: "1 KB",
    content: extracted.text.slice(0, 200_000),
    pageCount: extracted.pageCount,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: "e2e",
    originalFilename: "Security_Architecture.pdf",
    mimeType: "application/pdf",
    fileSize: buf.length,
    storagePath: stored.storagePath,
    checksum: stored.checksum,
    documentVersion: 1,
    chunkCount: 0,
  });
});

await processKnowledgeDocument(id);
const after = (await readStore()).knowledge.find((k) => k.id === id);
console.log("status", after?.status, "chunks", after?.chunkCount, "err", after?.processingError || "");

const rag = await queryKnowledge({
  workspaceId: "ws_e2e_rag",
  query: "What TLS version does the system use?",
});
console.log("RAG knowledgeUsed", rag.knowledgeUsed, "sourceType", rag.sourceType);
console.log("RAG answer", (rag.answer || "").slice(0, 300));
console.log(
  "RAG sources",
  JSON.stringify(rag.sources?.map((s) => ({ f: s.filename, page: s.page, score: s.score }))),
);
console.log("RAG latency", rag.diagnostics);

const gen = await queryKnowledge({
  workspaceId: "ws_e2e_rag",
  query: "What is the capital of Japan?",
});
console.log("GEN knowledgeUsed", gen.knowledgeUsed, "sourceType", gen.sourceType);
console.log("GEN answer", (gen.answer || "").slice(0, 200));
console.log("GEN sources_len", gen.sources?.length || 0);
console.log("GEN latency", gen.diagnostics);

await updateStore(async (s) => {
  s.knowledge = s.knowledge.filter((k) => k.id !== id);
});

if (!rag.knowledgeUsed || rag.sourceType !== "knowledge_base") {
  console.error("FAIL: expected knowledge_base for TLS question");
  process.exit(1);
}
if (!/TLS\s*1\.3/i.test(rag.answer || "")) {
  console.error("FAIL: expected TLS 1.3 in RAG answer");
  process.exit(1);
}
if (gen.knowledgeUsed || (gen.sources?.length || 0) > 0) {
  console.error("FAIL: expected general_ai fallback for Japan");
  process.exit(1);
}
if (!/tokyo/i.test(gen.answer || "")) {
  console.error("FAIL: expected Tokyo in general AI answer");
  process.exit(1);
}
console.log("E2E_OK");
