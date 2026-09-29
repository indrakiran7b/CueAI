import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { normalizeRole, type WorkspaceRole } from "@/lib/roles";
import { requirePermission } from "@/lib/server/api-auth";
import {
  appendAudit,
  publicUser,
  readStore,
  updateStore,
  type UserStatus,
} from "@/lib/server/db";
import { hashPassword } from "@/lib/server/session";
import { scopeUsers } from "@/lib/server/workspace-scope";

export async function GET(req: NextRequest) {
  const { error, session } = await requirePermission("users.read", req);
  if (error || !session) return error;

  const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
  const store = await readStore();
  let users = scopeUsers(store, session.workspaceId).map(publicUser);
  if (q) {
    users = users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        u.status.toLowerCase().includes(q),
    );
  }
  return NextResponse.json({ users, seats: store.workspace.seats });
}

export async function PATCH(req: NextRequest) {
  const { error, session } = await requirePermission("users.role", req);
  if (error || !session) return error;

  const body = (await req.json().catch(() => null)) as
    | { userId?: string; role?: WorkspaceRole; status?: UserStatus }
    | null;
  if (!body?.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const store = await updateStore(async (s) => {
    const user = s.users.find((u) => u.id === body.userId && u.workspaceId === session.workspaceId);
    if (!user) throw new Error("NOT_FOUND");
    if (user.id === session.userId && body.status === "Deactivated") {
      throw new Error("SELF_DEACTIVATE");
    }
    if (body.role) {
      const nextRole = normalizeRole(body.role);
      if (user.id === session.userId && nextRole !== "Admin") {
        const otherAdmins = s.users.filter(
          (u) => u.id !== user.id && u.role === "Admin" && u.status === "Active",
        );
        if (otherAdmins.length === 0) throw new Error("LAST_ADMIN");
      }
      const prev = user.role;
      user.role = nextRole;
      await appendAudit(s, {
        actorId: session.userId,
        actorName: session.name,
        action: "user.role_changed",
        resourceType: "user",
        resourceId: user.id,
        metadata: { from: prev, to: nextRole, email: user.email },
      });
    }
    if (body.status) {
      user.status = body.status;
      await appendAudit(s, {
        actorId: session.userId,
        actorName: session.name,
        action: body.status === "Deactivated" ? "user.deactivated" : "user.status_changed",
        resourceType: "user",
        resourceId: user.id,
        metadata: { status: body.status, email: user.email },
      });
    }
  }).catch((e: Error) => e);

  if (store instanceof Error) {
    if (store.message === "NOT_FOUND") return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (store.message === "SELF_DEACTIVATE") {
      return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });
    }
    if (store.message === "LAST_ADMIN") {
      return NextResponse.json({ error: "Cannot demote the last Admin." }, { status: 400 });
    }
    return NextResponse.json({ error: store.message }, { status: 400 });
  }

  const user = store.users.find((u) => u.id === body.userId)!;
  return NextResponse.json({ user: publicUser(user) });
}

export async function DELETE(req: NextRequest) {
  const { error, session } = await requirePermission("users.remove", req);
  if (error || !session) return error;

  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  if (userId === session.userId) {
    return NextResponse.json({ error: "You cannot remove your own account." }, { status: 400 });
  }

  const result = await updateStore(async (s) => {
    const user = s.users.find((u) => u.id === userId && u.workspaceId === session.workspaceId);
    if (!user) throw new Error("NOT_FOUND");
    if (user.role === "Admin") {
      const otherAdmins = s.users.filter(
        (u) => u.id !== user.id && u.role === "Admin" && u.status === "Active",
      );
      if (otherAdmins.length === 0) throw new Error("LAST_ADMIN");
    }
    user.status = "Deactivated";
    await appendAudit(s, {
      actorId: session.userId,
      actorName: session.name,
      action: "user.removed",
      resourceType: "user",
      resourceId: user.id,
      metadata: { email: user.email, previousRole: user.role },
    });
  }).catch((e: Error) => e);

  if (result instanceof Error) {
    if (result.message === "NOT_FOUND") return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (result.message === "LAST_ADMIN") {
      return NextResponse.json({ error: "Cannot remove the last Admin." }, { status: 400 });
    }
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

/** Internal helper for invite acceptance creating users — not exported route */
export async function createInvitedUser(opts: {
  email: string;
  name: string;
  password: string;
  role: WorkspaceRole;
  workspaceId: string;
}) {
  return {
    id: `usr_${randomUUID().slice(0, 10)}`,
    name: opts.name,
    email: opts.email,
    passwordHash: hashPassword(opts.password),
    role: normalizeRole(opts.role),
    status: "Active" as const,
    workspaceId: opts.workspaceId,
    createdAt: new Date().toISOString(),
  };
}
