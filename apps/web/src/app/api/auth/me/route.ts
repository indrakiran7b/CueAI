import { NextRequest, NextResponse } from "next/server";
import { proxyToFastApi } from "@/lib/server/fastapi-proxy";
import { getSessionFromRequest } from "@/lib/server/api-auth";
import { publicUser, readStore } from "@/lib/server/db";
import { normalizeRole, permissionsFor } from "@/lib/roles";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
} from "@/lib/server/session";

/**
 * Returns live membership from the store (source of truth) and refreshes
 * the signed session cookie so JWT role cannot stay stale after role changes.
 */
export async function GET(req: NextRequest) {
  const proxied = await proxyToFastApi(req, "/v1/auth/me");
  if (proxied) return proxied;

  const session = await getSessionFromRequest();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const store = await readStore();
  const user = store.users.find((u) => u.id === session.userId);
  if (!user || user.status === "Deactivated") {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const role = normalizeRole(user.role);
  const workspaceId = user.workspaceId || store.workspace.id;

  const token = signSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    role,
    workspaceId,
    workspace: store.workspace.name,
  });

  const res = NextResponse.json({
    authenticated: true,
    user: {
      ...publicUser(user),
      role,
      workspace: store.workspace.name,
      workspaceId,
    },
    membership: {
      workspaceId,
      role,
    },
    permissions: permissionsFor(role),
  });
  // Refresh cookie so middleware/clients never keep a stale role claim.
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
