import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/api-auth";
import { readStore } from "@/lib/server/db";

export async function GET(req: NextRequest) {
  const { error, session } = await requirePermission("audit.read", req);
  if (error || !session) return error;
  const store = await readStore();
  const { scopeAudit } = await import("@/lib/server/workspace-scope");
  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("limit") || 100)));
  const events = scopeAudit(store, session.workspaceId).slice(0, limit);
  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      actorName: e.actorName,
      actorId: e.actorId,
      action: e.action,
      resourceType: e.resourceType,
      resourceId: e.resourceId || null,
      metadata: e.metadata
        ? Object.fromEntries(
            Object.entries(e.metadata).filter(
              ([k]) => !/key|secret|password|token/i.test(k),
            ),
          )
        : null,
    })),
  });
}
