import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requirePermission } from "@/lib/server/api-auth";
import { appendAudit, readStore, updateStore, type DbKnowledge } from "@/lib/server/db";
import {
  extractDocument,
  safeContentPreview,
} from "@/lib/server/extract-document";
import {
  isKnowledgeCategory,
  normalizeKnowledgeCategory,
  type KnowledgeCategory,
} from "@/lib/knowledge-categories";
import { ragConfig } from "@/lib/server/rag/config";
import {
  deleteKnowledgeDocumentFully,
  guessKnowledgeType,
  processKnowledgeDocument,
} from "@/lib/server/rag/document-processor";
import { storeKnowledgeFile } from "@/lib/server/rag/storage";

function publicItem(item: DbKnowledge) {
  return {
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
    processingError: item.processingError,
    preview: safeContentPreview(item.content, 240),
    chunkCount: item.chunkCount ?? item.chunks?.length ?? 0,
    pageCount: item.pageCount ?? 0,
  };
}

export async function GET(req: NextRequest) {
  const { error, session } = await requirePermission("knowledge.read", req);
  if (error || !session) return error;
  const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
  const categoryParam = (req.nextUrl.searchParams.get("category") || "").trim().toLowerCase();
  const store = await readStore();
  const { scopeKnowledge } = await import("@/lib/server/workspace-scope");
  let items = scopeKnowledge(store, session.workspaceId).filter(
    (k) => !k.meetingId && (k.knowledgeScope || "workspace") !== "meeting",
  );

  if (categoryParam && categoryParam !== "all") {
    if (!isKnowledgeCategory(categoryParam)) {
      return NextResponse.json(
        { error: { code: "VALIDATION", message: "Invalid category filter." } },
        { status: 400 },
      );
    }
    items = items.filter((k) => (k.category || "engineering") === categoryParam);
  }

  if (q) {
    items = items.filter(
      (k) =>
        k.title.toLowerCase().includes(q) ||
        k.type.toLowerCase().includes(q) ||
        k.status.toLowerCase().includes(q) ||
        (k.originalFilename || "").toLowerCase().includes(q) ||
        (k.category || "").toLowerCase().includes(q) ||
        safeContentPreview(k.content, 8000).toLowerCase().includes(q),
    );
  }
  return NextResponse.json({
    items: items.map(publicItem),
    rag: {
      enabled: ragConfig().enabled,
      vectorConfigured: Boolean(ragConfig().qdrantUrl),
    },
  });
}

export async function POST(req: NextRequest) {
  const { error, session } = await requirePermission("knowledge.write", req);
  if (error || !session) return error;

  const contentType = req.headers.get("content-type") || "";
  let item: DbKnowledge | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: { code: "INVALID_FILE", message: "A document file is required." } },
        { status: 400 },
      );
    }
    const cfg = ragConfig();
    if (file.size <= 0 || file.size > cfg.maxUploadBytes) {
      return NextResponse.json(
        {
          error: {
            code: "FILE_TOO_LARGE",
            message: `File must be between 1 byte and ${Math.round(cfg.maxUploadBytes / (1024 * 1024))} MB.`,
          },
        },
        { status: 400 },
      );
    }

    const category = normalizeKnowledgeCategory(form.get("category")?.toString());
    const buffer = Buffer.from(await file.arrayBuffer());
    const { createHash } = await import("node:crypto");
    const checksum = createHash("sha256").update(buffer).digest("hex");
    const store = await readStore();
    const dup = store.knowledge.find(
      (k) =>
        k.checksum === checksum &&
        (!k.workspaceId || k.workspaceId === session.workspaceId) &&
        k.status !== "failed",
    );
    if (dup) {
      return NextResponse.json(
        {
          error: {
            code: "DUPLICATE_DOCUMENT",
            message: "This document already exists in the workspace.",
          },
          item: publicItem(dup),
        },
        { status: 409 },
      );
    }

    let extractedText = "";
    let pageCount = 0;
    try {
      const extracted = await extractDocument(buffer, file.name, file.type || "");
      extractedText = extracted.text;
      pageCount = extracted.pageCount;
    } catch (err) {
      return NextResponse.json(
        {
          error: {
            code: "UNSUPPORTED_FILE",
            message: err instanceof Error ? err.message : "Unsupported file type.",
          },
        },
        { status: 400 },
      );
    }

    const stored = await storeKnowledgeFile({
      workspaceId: session.workspaceId,
      originalFilename: file.name,
      buffer,
    });

    item = {
      id: `kb_${randomUUID().slice(0, 8)}`,
      workspaceId: session.workspaceId,
      knowledgeScope: "workspace",
      meetingId: null,
      category,
      title: (form.get("title")?.toString() || file.name).trim(),
      type: guessKnowledgeType(file.name, file.type || ""),
      status: "processing",
      sizeLabel: formatSizeLabel(file.size),
      content: extractedText.slice(0, 200_000),
      pageCount,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: session.userId,
      originalFilename: file.name,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
      storagePath: stored.storagePath,
      checksum: stored.checksum,
      documentVersion: 1,
      chunkCount: 0,
    };
  } else {
    const body = (await req.json().catch(() => null)) as
      | {
          title?: string;
          type?: DbKnowledge["type"];
          content?: string;
          category?: string;
        }
      | null;
    const title = body?.title?.trim() || "";
    const content = body?.content?.trim() || "";
    const type = body?.type || "note";
    const category: KnowledgeCategory = normalizeKnowledgeCategory(body?.category);
    if (!title || !content) {
      return NextResponse.json(
        { error: { code: "VALIDATION", message: "Title and content are required." } },
        { status: 400 },
      );
    }
    item = {
      id: `kb_${randomUUID().slice(0, 8)}`,
      workspaceId: session.workspaceId,
      knowledgeScope: "workspace",
      meetingId: null,
      category,
      title,
      type,
      status: "processing",
      sizeLabel: `${Math.max(1, Math.round(content.length / 1024))} KB`,
      content,
      pageCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: session.userId,
      originalFilename: title,
      documentVersion: 1,
      chunkCount: 0,
    };
  }

  const created = item;
  await updateStore(async (s) => {
    s.knowledge.unshift(created);
    await appendAudit(s, {
      actorId: session.userId,
      actorName: session.name,
      action: "knowledge.created",
      resourceType: "knowledge",
      resourceId: created.id,
      metadata: { title: created.title, type: created.type, category: created.category || "" },
    });
  });

  // Background process (non-blocking).
  void processKnowledgeDocument(created.id);

  return NextResponse.json({ item: publicItem(created) }, { status: 202 });
}

function formatSizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export async function PATCH(req: NextRequest) {
  const { error, session } = await requirePermission("knowledge.write", req);
  if (error || !session) return error;
  const body = (await req.json().catch(() => null)) as
    | {
        id?: string;
        title?: string;
        content?: string;
        status?: DbKnowledge["status"];
        category?: string;
      }
    | null;
  if (!body?.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const store = await updateStore(async (s) => {
    const item = s.knowledge.find(
      (k) => k.id === body.id && (!k.workspaceId || k.workspaceId === session.workspaceId),
    );
    if (!item) throw new Error("NOT_FOUND");
    if (body.title?.trim()) item.title = body.title.trim();
    if (typeof body.content === "string") {
      item.content = body.content;
      item.sizeLabel = `${Math.max(1, Math.round(body.content.length / 1024))} KB`;
      item.status = "processing";
    }
    if (body.category && isKnowledgeCategory(body.category)) {
      item.category = body.category;
    }
    if (body.status) item.status = body.status;
    item.updatedAt = new Date().toISOString();
    await appendAudit(s, {
      actorId: session.userId,
      actorName: session.name,
      action: "knowledge.updated",
      resourceType: "knowledge",
      resourceId: item.id,
      metadata: { title: item.title },
    });
  }).catch((e: Error) => e);

  if (store instanceof Error) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const item = store.knowledge.find((k) => k.id === body.id)!;
  if (typeof body.content === "string") {
    void processKnowledgeDocument(item.id);
  }
  return NextResponse.json({ item: publicItem(item) });
}

export async function DELETE(req: NextRequest) {
  const { error, session } = await requirePermission("knowledge.write", req);
  if (error || !session) return error;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

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
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "KNOWLEDGE_DELETE_FAILED",
          message: err instanceof Error ? err.message : "Delete failed.",
        },
      },
      { status: 503 },
    );
  }
}
