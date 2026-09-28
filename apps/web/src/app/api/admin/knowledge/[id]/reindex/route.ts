import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/api-auth";
import { updateStore } from "@/lib/server/db";
import { processKnowledgeDocument } from "@/lib/server/rag/document-processor";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/knowledge/[id]/reindex
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { error, session } = await requirePermission("knowledge.write", req);
  if (error || !session) return error;
  const { id } = await ctx.params;

  let found = false;
  await updateStore(async (s) => {
    const doc = s.knowledge.find(
      (k) => k.id === id && (!k.workspaceId || k.workspaceId === session.workspaceId),
    );
    if (!doc) return;
    found = true;
    doc.status = "processing";
    doc.processingError = undefined;
    doc.documentVersion = (doc.documentVersion || 1) + 1;
    doc.updatedAt = new Date().toISOString();
  });

  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });

  void processKnowledgeDocument(id);
  return NextResponse.json({ ok: true, status: "processing" });
}
