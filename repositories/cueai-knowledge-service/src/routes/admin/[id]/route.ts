import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/api-auth";
import { appendAudit, readStore, updateStore } from "@/lib/server/db";
import { safeContentPreview } from "@/lib/server/extract-document";
import { deleteKnowledgeDocumentFully } from "@/lib/server/rag/document-processor";
import { isQdrantConfigured, ragConfig } from "@/lib/server/rag/config";
import { embeddingAvailable } from "@/lib/server/rag/embeddings";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { error, session } = await requirePermission("knowledge.read", req);
  if (error || !session) return error;
  const { id } = await ctx.params;
  const store = await readStore();
  const item = store.knowledge.find(
    (k) => k.id === id && (!k.workspaceId || k.workspaceId === session.workspaceId),
  );
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const chunkCount = item.chunkCount ?? item.chunks?.length ?? 0;
  const embeddingStatus = item.embeddingStatus || (item.vectorIndexed ? "ready" : "skipped");
  const vectorIndexed = Boolean(item.vectorIndexed);

  return NextResponse.json({
    item: {
      id: item.id,
      workspaceId: item.workspaceId,
      title: item.title,
      type: item.type,
      status: item.status,
      category: item.category || null,
      sizeLabel: item.sizeLabel,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      createdBy: item.createdBy,
      originalFilename: item.originalFilename,
      mimeType: item.mimeType,
      fileSize: item.fileSize,
      checksum: item.checksum,
      documentVersion: item.documentVersion,
      processedAt: item.processedAt,
      preview: safeContentPreview(item.content, 240),
      chunkCount,
      pageCount: item.pageCount ?? 0,
      processingError: item.processingError,
      hasFile: Boolean(item.storagePath),
      embeddingStatus,
      vectorIndexed,
      rag: {
        embedding: embeddingStatus,
        vectorIndex: vectorIndexed
          ? "ready"
          : item.status === "indexed"
            ? isQdrantConfigured()
              ? "pending"
              : "keyword"
            : "pending",
        chunks: chunkCount,
        vectorConfigured: Boolean(ragConfig().qdrantUrl),
        semanticAvailable: embeddingAvailable() && isQdrantConfigured(),
      },
    },
  });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { error, session } = await requirePermission("knowledge.write", req);
  if (error || !session) return error;
  const { id } = await ctx.params;

  try {
    const ok = await deleteKnowledgeDocumentFully({
      documentId: id,
      workspaceId: session.workspaceId,
    });
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await updateStore(async (s) => {
      await appendAudit(s, {
        actorId: session.userId,
        actorName: session.name,
        action: "knowledge.deleted",
        resourceType: "knowledge",
        resourceId: id,
        metadata: {},
      });
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "KNOWLEDGE_DELETE_FAILED",
          message: "The document could not be deleted.",
        },
      },
      { status: 503 },
    );
  }
}
