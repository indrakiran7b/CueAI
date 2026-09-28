import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/api-auth";
import { readStore } from "@/lib/server/db";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/knowledge/[id]/status
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { error, session } = await requirePermission("knowledge.read", req);
  if (error || !session) return error;
  const { id } = await ctx.params;
  const store = await readStore();
  const item = store.knowledge.find(
    (k) => k.id === id && (!k.workspaceId || k.workspaceId === session.workspaceId),
  );
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    id: item.id,
    status: item.status,
    chunkCount: item.chunkCount ?? item.chunks?.length ?? 0,
    processingError: item.processingError ?? null,
    processedAt: item.processedAt ?? null,
    updatedAt: item.updatedAt,
  });
}
