import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_BYPASS } from "@/lib/auth-mode";
import { can, type AdminPermission, normalizeRole } from "@/lib/roles";
import {
  SESSION_COOKIE,
  verifySession,
  type SessionPayload,
} from "@/lib/server/session";
import { readStore } from "@/lib/server/db";

function bypassSession(): SessionPayload {
  return {
    userId: "dev-guest",
    email: "user@cueai.local",
    name: "User",
    role: "Admin",
    workspaceId: "ws_default",
    workspace: "Your Workspace",
    exp: Math.floor(Date.now() / 1000) + 86400,
  };
}

export async function getSessionFromRequest(req?: NextRequest): Promise<SessionPayload | null> {
  if (AUTH_BYPASS) return bypassSession();

  const token =
    req?.cookies.get(SESSION_COOKIE)?.value ||
    (await cookies()).get(SESSION_COOKIE)?.value;
  const session = verifySession(token);
  if (!session) return null;

  const store = await readStore();
  const user = store.users.find((u) => u.id === session.userId);
  if (!user || user.status === "Deactivated") return null;

  return {
    ...session,
    role: normalizeRole(user.role),
    name: user.name,
    email: user.email,
    workspace: store.workspace.name,
    workspaceId: user.workspaceId || store.workspace.id,
  };
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireAuth(req?: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return { error: jsonError("Unauthorized", 401) as NextResponse, session: null };
  return { error: null, session };
}

export async function requirePermission(permission: AdminPermission, req?: NextRequest) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return { error: error || jsonError("Unauthorized", 401), session: null };
  if (!can(normalizeRole(session.role), permission)) {
    return { error: jsonError("Forbidden", 403), session: null };
  }
  return { error: null, session };
}
