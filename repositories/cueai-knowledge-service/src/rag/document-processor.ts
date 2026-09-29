/**
 * Knowledge document processing: extract → chunk → embed → index.
 */

import { randomUUID } from "node:crypto";
import {
  extractDocument,
  sanitizeExtractedText,
} from "@cueai/shared-libraries/extract-document";
import { readStore, updateStore, type DbKnowledge, type DbKnowledgeChunk } from "@/lib/server/db";
import { chunkDocument } from "@/lib/server/rag/chunker";
import { embedTexts, embeddingAvailable } from "@/lib/server/rag/embeddings";
import {
  deleteDocumentVectors,
  upsertVectors,
} from "@/lib/server/rag/vector-store";
import { isQdrantConfigured, isSemanticRagAvailable } from "@/lib/server/rag/config";
import { deleteKnowledgeFile, readKnowledgeFile } from "@/lib/server/rag/storage";
import { logRag } from "@/lib/server/rag/log";

function toVectorId(chunkId: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(chunkId)) {
    return chunkId;
  }
  return randomUUID();
}

export async function processKnowledgeDocument(documentId: string): Promise<void> {
  const store = await readStore();
  const doc = store.knowledge.find((k) => k.id === documentId);
  if (!doc) return;

  const workspaceId = doc.workspaceId || "ws_default";
  const t0 = Date.now();
  const semanticRequired = isSemanticRagAvailable();

  await updateStore(async (s) => {
    const item = s.knowledge.find((k) => k.id === documentId);
    if (!item) return;
    item.status = "processing";
    item.embeddingStatus = semanticRequired ? "pending" : "skipped";
    item.vectorIndexed = false;
    item.processingError = undefined;
    item.updatedAt = new Date().toISOString();
  });

  try {
    let text = sanitizeExtractedText(doc.content || "");
    let pageCount = doc.pageCount || 0;

    if (doc.storagePath) {
      const buf = await readKnowledgeFile(doc.storagePath);
      const extracted = await extractDocument(
        buf,
        doc.originalFilename || doc.title,
        doc.mimeType || "",
      );
      text = extracted.text;
      pageCount = extracted.pageCount;
    } else if (text.length < 40) {
      throw new Error("Could not extract enough text from the document.");
    }

    if (text.length < 40) {
      throw new Error(
        "PDF contains no extractable text. It may be scanned or image-based.",
      );
    }

    const textChunks = chunkDocument(text);
    if (!textChunks.length) throw new Error("Document produced no chunks.");

    const chunks: DbKnowledgeChunk[] = textChunks.map((c) => ({
      id: `chk_${randomUUID()}`,
      index: c.index,
      text: c.text,
      tokenCount: c.tokenCount,
      pageNumber: c.pageNumber,
      sectionTitle: c.sectionTitle,
      vectorId: toVectorId(randomUUID()),
    }));

    if (isQdrantConfigured()) {
      await deleteDocumentVectors(workspaceId, documentId);
    }

    let vectorIndexed = false;
    let embeddingStatus: DbKnowledge["embeddingStatus"] = "skipped";

    if (semanticRequired) {
      if (!embeddingAvailable() || !isQdrantConfigured()) {
        throw new Error(
          "Semantic RAG is configured but embeddings or Qdrant are unavailable.",
        );
      }
      const vectors = await embedTexts(chunks.map((c) => c.text));
      if (vectors.length !== chunks.length) {
        throw new Error("Embedding provider returned an incomplete vector batch.");
      }
      await upsertVectors(
        chunks.map((c, i) => ({
          id: c.vectorId || toVectorId(randomUUID()),
          vector: vectors[i]!,
          payload: {
            workspace_id: workspaceId,
            meeting_id: doc.meetingId || null,
            document_id: documentId,
            chunk_id: c.id,
            filename: doc.originalFilename || doc.title,
            page_number: c.pageNumber ?? null,
            section_title: c.sectionTitle ?? null,
            chunk_index: c.index,
            knowledge_scope:
              doc.knowledgeScope ||
              (doc.meetingId ? "meeting" : "workspace"),
            category: doc.category || null,
            text: c.text.slice(0, 4000),
          },
        })),
      );
      vectorIndexed = true;
      embeddingStatus = "ready";
    } else if (embeddingAvailable() && isQdrantConfigured()) {
      // Partial config edge case: both available but isSemanticRagAvailable false
      // (shouldn't happen); still attempt best-effort index.
      const vectors = await embedTexts(chunks.map((c) => c.text));
      await upsertVectors(
        chunks.map((c, i) => ({
          id: c.vectorId || toVectorId(randomUUID()),
          vector: vectors[i]!,
          payload: {
            workspace_id: workspaceId,
            meeting_id: doc.meetingId || null,
            document_id: documentId,
            chunk_id: c.id,
            filename: doc.originalFilename || doc.title,
            page_number: c.pageNumber ?? null,
            section_title: c.sectionTitle ?? null,
            chunk_index: c.index,
            knowledge_scope:
              doc.knowledgeScope ||
              (doc.meetingId ? "meeting" : "workspace"),
            category: doc.category || null,
            text: c.text.slice(0, 4000),
          },
        })),
      );
      vectorIndexed = true;
      embeddingStatus = "ready";
    }

    await updateStore(async (s) => {
      const item = s.knowledge.find((k) => k.id === documentId);
      if (!item) return;
      item.content = text.slice(0, 200_000);
      item.pageCount = pageCount;
      item.chunks = chunks.map((c) => ({
        id: c.id,
        index: c.index,
        text: c.text.slice(0, 8000),
        tokenCount: c.tokenCount,
        pageNumber: c.pageNumber,
        sectionTitle: c.sectionTitle,
        vectorId: c.vectorId,
      }));
      item.chunkCount = chunks.length;
      item.embeddingStatus = embeddingStatus;
      item.vectorIndexed = vectorIndexed;
      item.status = "indexed";
      item.processedAt = new Date().toISOString();
      item.updatedAt = new Date().toISOString();
      item.processingError = undefined;
    });

    logRag("document.processed", {
      documentId,
      workspaceId,
      chunkCount: chunks.length,
      pageCount,
      ms: Date.now() - t0,
      vector: vectorIndexed,
      embeddingStatus,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed.";
    logRag("document.failed", { documentId, workspaceId, error: message });
    await updateStore(async (s) => {
      const item = s.knowledge.find((k) => k.id === documentId);
      if (!item) return;
      item.status = "failed";
      item.embeddingStatus = semanticRequired ? "failed" : item.embeddingStatus;
      item.vectorIndexed = false;
      item.processingError = message.slice(0, 300);
      item.updatedAt = new Date().toISOString();
    });
  }
}

export async function deleteKnowledgeDocumentFully(input: {
  documentId: string;
  workspaceId: string;
}): Promise<boolean> {
  const store = await readStore();
  const doc = store.knowledge.find(
    (k) =>
      k.id === input.documentId &&
      (!k.workspaceId || k.workspaceId === input.workspaceId),
  );
  if (!doc) return false;

  if (isQdrantConfigured()) {
    await deleteDocumentVectors(input.workspaceId, input.documentId);
  }
  await deleteKnowledgeFile(doc.storagePath);

  await updateStore(async (s) => {
    const idx = s.knowledge.findIndex(
      (k) =>
        k.id === input.documentId &&
        (!k.workspaceId || k.workspaceId === input.workspaceId),
    );
    if (idx >= 0) s.knowledge.splice(idx, 1);
  });
  return true;
}

export function guessKnowledgeType(
  filename: string,
  mime: string,
): DbKnowledge["type"] {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf") || mime === "application/pdf") return "pdf";
  if (lower.endsWith(".docx") || mime.includes("wordprocessingml")) return "docx";
  if (lower.endsWith(".md") || mime === "text/markdown") return "md";
  if (lower.endsWith(".csv") || mime === "text/csv") return "txt";
  if (lower.endsWith(".txt") || mime.startsWith("text/")) return "txt";
  return "note";
}
