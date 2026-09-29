import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/api-auth";
import { appendAudit, readStore, updateStore } from "@/lib/server/db";

export async function GET(req: NextRequest) {
  const { error, session } = await requirePermission("workspace.read", req);
  if (error || !session) return error;
  const store = await readStore();
  const { scopeUsers, scopeInvites } = await import("@/lib/server/workspace-scope");
  const users = scopeUsers(store, session.workspaceId);
  return NextResponse.json({
    workspace: {
      id: store.workspace.id,
      name: store.workspace.name,
      seats: store.workspace.seats,
      createdAt: store.workspace.createdAt || null,
      memberCount: users.filter((u) => u.status === "Active").length,
      invitedCount: users.filter((u) => u.status === "Invited").length,
      pendingInvites: scopeInvites(store, session.workspaceId).filter(
        (i) => i.status === "sent" || i.status === "pending",
      ).length,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const { error, session } = await requirePermission("workspace.write", req);
  if (error || !session) return error;
  const body = (await req.json().catch(() => null)) as
    | { name?: string; seats?: number }
    | null;

  const store = await updateStore(async (s) => {
    if (typeof body?.name === "string" && body.name.trim()) {
      s.workspace.name = body.name.trim();
    }
    if (typeof body?.seats === "number" && body.seats >= 1 && body.seats <= 1000) {
      s.workspace.seats = Math.floor(body.seats);
    }
    if (!s.workspace.createdAt) {
      s.workspace.createdAt = new Date().toISOString();
    }
    await appendAudit(s, {
      actorId: session.userId,
      actorName: session.name,
      action: "workspace.updated",
      resourceType: "workspace",
      resourceId: s.workspace.id,
      metadata: { name: s.workspace.name, seats: s.workspace.seats },
    });
  });

  return NextResponse.json({
    workspace: {
      id: store.workspace.id,
      name: store.workspace.name,
      seats: store.workspace.seats,
      createdAt: store.workspace.createdAt || null,
    },
  });
}
