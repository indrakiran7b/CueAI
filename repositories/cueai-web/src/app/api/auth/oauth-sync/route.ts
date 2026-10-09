import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { normalizeRole, permissionsFor } from "@/lib/roles";
import { appendAudit, publicUser, readStore, updateStore } from "@/lib/server/db";
import { decideOAuthUserLink } from "@/lib/server/oauth-link";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
  verifySession,
} from "@/lib/server/session";

/**
 * Bridge a verified NextAuth OAuth identity onto the CueAI HMAC session cookie.
 * Does not replace email/password login, roles, or workspace isolation.
 */
export async function POST(req: NextRequest) {
  const oauth = await auth();
  const email = oauth?.user?.email?.trim().toLowerCase() || "";
  if (!email) {
    return NextResponse.json({ error: "OAuth session required." }, { status: 401 });
  }
  // Identity comes from the verified NextAuth session only — never from the request body.

  const name = oauth?.user?.name?.trim() || email.split("@")[0] || "User";
  const cueaiSession = verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  const store = await readStore();
  const existing = store.users.find((u) => u.email === email && u.status !== "Deactivated")
    || store.users.find((u) => u.email === email);
  const decision = decideOAuthUserLink({
    existing: existing
      ? {
          id: existing.id,
          email: existing.email,
          status: existing.status,
          passwordHash: existing.passwordHash,
        }
      : null,
    cueaiSession: cueaiSession
      ? { userId: cueaiSession.userId, email: cueaiSession.email }
      : null,
  });

  if (decision.action === "reject") {
    if (decision.reason === "deactivated") {
      return NextResponse.json({ error: "Account unavailable." }, { status: 403 });
    }
    return NextResponse.json(
      {
        error:
          "An account already exists with this email. Sign in with email, then continue with Google using the same verified address.",
        code: "OAuthAccountNotLinked",
      },
      { status: 409 },
    );
  }

  let userId = existing?.id || "";

  await updateStore(async (s) => {
    let user = s.users.find((u) => u.id === userId) || s.users.find((u) => u.email === email);

    if (decision.action === "create" || !user) {
      userId = `usr_${randomUUID().slice(0, 10)}`;
      user = {
        id: userId,
        name,
        email,
        passwordHash: "",
        role: "User", // never grant Admin from Google profile data
        status: "Active",
        workspaceId: s.workspace.id,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };
      s.users.push(user);
      await appendAudit(s, {
        actorId: userId,
        actorName: name,
        action: "user.oauth_signed_up",
        resourceType: "user",
        resourceId: userId,
        metadata: { email },
      });
      return;
    }

    userId = user.id;
    if (decision.action === "activate_invite" && user.status === "Invited") {
      user.status = "Active";
      if (!user.name || user.name === email.split("@")[0]) {
        user.name = name;
      }
      const inv = s.invites.find(
        (i) =>
          i.email === email &&
          i.status !== "revoked" &&
          (i.workspaceId || s.workspace.id) === (user!.workspaceId || s.workspace.id),
      );
      if (inv) {
        inv.status = "active";
        inv.acceptedAt = new Date().toISOString();
      }
      await appendAudit(s, {
        actorId: user.id,
        actorName: user.name,
        action: "user.activated_from_invite_oauth",
        resourceType: "user",
        resourceId: user.id,
        metadata: { email, role: user.role },
      });
    }
    user.lastActiveAt = new Date().toISOString();
  });

  const next = await readStore();
  const user = next.users.find((u) => u.id === userId);
  if (!user || user.status === "Deactivated") {
    return NextResponse.json({ error: "Account unavailable." }, { status: 403 });
  }

  const token = signSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: normalizeRole(user.role),
    workspaceId: user.workspaceId || next.workspace.id,
    workspace: next.workspace.name,
  });

  const res = NextResponse.json({
    authenticated: true,
    user: {
      ...publicUser(user),
      role: normalizeRole(user.role),
      workspace: next.workspace.name,
      workspaceId: user.workspaceId || next.workspace.id,
    },
    membership: {
      workspaceId: user.workspaceId || next.workspace.id,
      role: normalizeRole(user.role),
    },
    permissions: permissionsFor(normalizeRole(user.role)),
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
