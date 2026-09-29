import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireAuth } from "@/lib/server/api-auth";
import { readStore, updateStore, type DbKnowledge } from "@/lib/server/db";
import { extractDocumentText, safeContentPreview } from "@/lib/server/extract-document";
import { ragConfig } from "@/lib/server/rag/config";
import {
  deleteKnowledgeDocumentFully,
  guessKnowledgeType,
  processKnowledgeDocument,
} from "@/lib/server/rag/document-processor";
import { storeKnowledgeFile } from "@/lib/server/rag/storage";
import { getMeeting, canAccessMeeting } from "@/lib/server/meetings";

/**
 * User meeting-prep Knowledge API (authenticated users — not Admin-only).
 * GET  /api/meetings/knowledge — list pending + active meeting docs
 * POST /api/meetings/knowledge — upload meeting-scoped document
 * DELETE /api/meetings/knowledge?id= — remove own meeting prep doc
 */

function publicItem(item: DbKnowledge) {
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    status: item.status,
    sizeLabel: item.sizeLabel,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    originalFilename: item.originalFilename,
    chunkCount: item.chunkCount ?? item.chunks?.length ?? 0,
    processingError: item.processingError,
    meetingId: item.meetingId ?? null,
    knowledgeScope: item.knowledgeScope || (item.meetingId ? "meeting" : "workspace"),
    preview: safeContentPreview(item.content, 200),
  };
}

export async function GET(req: NextRequest) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return error;

  const meetingId = req.nextUrl.searchParams.get("meetingId");
  const store = await readStore();
  const pending = new Set(store.liveBriefing?.pendingKnowledgeIds || []);

  let items = store.knowledge.filter((k) => {
    if (k.workspaceId && k.workspaceId !== session.workspaceId) return false;
    if (meetingId) return k.meetingId === meetingId;
    // Prep list: pending uploads by this user, or docs for active meeting.
    if (pending.has(k.id) && k.createdBy === session.userId) return true;
    if (k.meetingId && store.activeMeetingId === k.meetingId) return true;
    return false;
  });

  // Also surface workspace docs eligible for attach (indexed only).
  const workspaceDocs = store.knowledge.filter(
    (k) =>
      (!k.workspaceId || k.workspaceId === session.workspaceId) &&
      !k.meetingId &&
      k.status === "indexed" &&
      (k.knowledgeScope === "workspace" || !k.knowledgeScope),
  );

  return NextResponse.json({
    items: items.map(publicItem),
    workspaceDocuments: workspaceDocs.map(publicItem),
    pendingIds: [...pending],
    attachedDocumentIds: store.liveBriefing?.documentIds || [],
  });
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return error;

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    // Attach existing workspace document ids to the upcoming/live meeting.
    const body = (await req.json().catch(() => null)) as {
      documentIds?: string[];
      meetingId?: string;
    } | null;
    const ids = (body?.documentIds || []).filter(Boolean);
    if (body?.meetingId) {
      const meeting = await getMeeting(body.meetingId);
      if (!meeting || !canAccessMeeting(meeting, session)) {
        return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
      }
      await updateStore(async (s) => {
        const m = (s.meetings || []).find((x) => x.id === body.meetingId);
        if (!m) return;
        m.documentIds = [...new Set([...(m.documentIds || []), ...ids])];
      });
    } else {
      await updateStore(async (s) => {
        const prev = s.liveBriefing || { updatedAt: new Date().toISOString() };
        s.liveBriefing = {
          ...prev,
          documentIds: [...new Set([...(prev.documentIds || []), ...ids])],
          updatedAt: new Date().toISOString(),
        };
      });
    }
    return NextResponse.json({ ok: true, documentIds: ids });
  }

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

  const meetingIdRaw = form.get("meetingId")?.toString()?.trim() || "";
  let meetingId: string | null = meetingIdRaw || null;
  if (meetingId) {
    const meeting = await getMeeting(meetingId);
    if (!meeting || !canAccessMeeting(meeting, session)) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { createHash } = await import("node:crypto");
  const checksum = createHash("sha256").update(buffer).digest("hex");

  const store = await readStore();
  const dup = store.knowledge.find(
    (k) =>
      k.checksum === checksum &&
      (!k.workspaceId || k.workspaceId === session.workspaceId) &&
      (meetingId ? k.meetingId === meetingId : !k.meetingId || store.liveBriefing?.pendingKnowledgeIds?.includes(k.id)) &&
      k.status !== "failed",
  );
  if (dup) {
    return NextResponse.json(
      {
        error: {
          code: "DUPLICATE_DOCUMENT",
          message: "This document already exists for this meeting.",
        },
        item: publicItem(dup),
      },
      { status: 409 },
    );
  }

  let extracted = "";
  try {
    extracted = (await extractDocumentText(buffer, file.name, file.type || "")).trim();
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

  const item: DbKnowledge = {
    id: `kb_${randomUUID().slice(0, 8)}`,
    workspaceId: session.workspaceId,
    meetingId,
    knowledgeScope: "meeting",
    title: (form.get("title")?.toString() || file.name).trim(),
    type: guessKnowledgeType(file.name, file.type || ""),
    status: "processing",
    sizeLabel: `${Math.max(1, Math.round(file.size / 1024))} KB`,
    content: extracted.slice(0, 200_000),
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

  await updateStore(async (s) => {
    s.knowledge.unshift(item);
    if (!meetingId) {
      const prev = s.liveBriefing || { updatedAt: new Date().toISOString() };
      const pending = [...new Set([...(prev.pendingKnowledgeIds || []), item.id])];
      s.liveBriefing = { ...prev, pendingKnowledgeIds: pending, updatedAt: new Date().toISOString() };
    }
  });

  void processKnowledgeDocument(item.id);
  return NextResponse.json({ item: publicItem(item) }, { status: 202 });
}

export async function DELETE(req: NextRequest) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return error;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const store = await readStore();
  const doc = store.knowledge.find((k) => k.id === id);
  if (!doc || (doc.workspaceId && doc.workspaceId !== session.workspaceId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Users may delete their own meeting-scoped docs; Admin/Manager can delete any in workspace.
  const isOwner = doc.createdBy === session.userId;
  const isMeetingScoped = Boolean(doc.meetingId) || store.liveBriefing?.pendingKnowledgeIds?.includes(id);
  if (!isOwner && !isMeetingScoped) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Detach from pending / meeting attachments without deleting shared workspace docs wrongly.
  if (!doc.meetingId && doc.knowledgeScope !== "meeting") {
    await updateStore(async (s) => {
      if (s.liveBriefing?.documentIds) {
        s.liveBriefing.documentIds = s.liveBriefing.documentIds.filter((x) => x !== id);
      }
      for (const m of s.meetings || []) {
        if (m.documentIds?.includes(id)) {
          m.documentIds = m.documentIds.filter((x) => x !== id);
        }
      }
    });
    return NextResponse.json({ ok: true, detached: true });
  }

  try {
    const ok = await deleteKnowledgeDocumentFully({
      documentId: id,
      workspaceId: session.workspaceId,
    });
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await updateStore(async (s) => {
      if (s.liveBriefing?.pendingKnowledgeIds) {
        s.liveBriefing.pendingKnowledgeIds = s.liveBriefing.pendingKnowledgeIds.filter(
          (x) => x !== id,
        );
      }
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
