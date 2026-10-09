import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_BYPASS } from "@/lib/auth-mode";
import { can, type AdminPermission, normalizeRole } from "@/lib/roles";
import {
  SESSION_COOKIE,
  signSession,
  verifySession,
  type SessionPayload,
} from "@/lib/server/session";
import { readStore } from "@/lib/server/db";
import {
  DEVICE_CREDENTIAL_HEADER,
  DEVICE_ID_HEADER,
  resolveDeviceSession,
} from "@/lib/server/devices";

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

  let token = req?.cookies.get(SESSION_COOKIE)?.value;
  if (!token && req) {
    const header = req.headers.get("cookie") || "";
    const match = header.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    token = match?.[1];
  }
  if (!token && !req) {
    try {
      token = (await cookies()).get(SESSION_COOKIE)?.value;
    } catch {
      token = undefined;
    }
  }
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

/**
 * Browser session cookie OR existing account-device headers.
 * Device credentials do not require a cookie. Does not weaken requireAuth().
 */
export async function requireAuthOrDevice(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (session) return { error: null as NextResponse | null, session, deviceId: null as string | null };

  const deviceId = req.headers.get(DEVICE_ID_HEADER)?.trim() || "";
  const credential = req.headers.get(DEVICE_CREDENTIAL_HEADER)?.trim() || "";
  const deviceSession = await resolveDeviceSession(deviceId, credential);
  if (!deviceSession) {
    console.log("[AUTH] Unauthorized", {
      method: req.method,
      path: req.nextUrl.pathname,
      hasCookie: Boolean(req.headers.get("cookie")),
      deviceIdHeader: Boolean(deviceId),
      deviceCredentialHeader: Boolean(credential),
    });
    return { error: jsonError("Unauthorized", 401) as NextResponse, session: null, deviceId: null };
  }
  const { deviceId: resolvedDeviceId, ...identity } = deviceSession;
  return { error: null, session: identity, deviceId: resolvedDeviceId };
}

/** Trusted HMAC session cookie for internal FastAPI (Option A). Never a new token type. */
export function upstreamSessionCookieHeader(
  session: SessionPayload,
  existingCookie?: string | null,
): string {
  const token = signSession({
    userId: session.userId,
    email: session.email,
    name: session.name,
    role: session.role,
    workspaceId: session.workspaceId,
    workspace: session.workspace,
  });
  const signed = `${SESSION_COOKIE}=${token}`;
  const parts = (existingCookie || "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith(`${SESSION_COOKIE}=`));
  parts.push(signed);
  return parts.join("; ");
}

export async function requirePermission(permission: AdminPermission, req?: NextRequest) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return { error: error || jsonError("Unauthorized", 401), session: null };
  if (!can(normalizeRole(session.role), permission)) {
    return { error: jsonError("Forbidden", 403), session: null };
  }
  return { error: null, session };
}
