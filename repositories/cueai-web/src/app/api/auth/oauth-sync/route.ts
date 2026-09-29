import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { normalizeRole, permissionsFor } from "@/lib/roles";
import { appendAudit, publicUser, readStore, updateStore } from "@/lib/server/db";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
} from "@/lib/server/session";

/**
 * Link a verified OAuth identity to workspace membership.
 * Activates Invited accounts and preserves the assigned role.
 * No invitation-accept token is required.
 */
export async function POST() {
  const oauth = await auth();
  const email = oauth?.user?.email?.trim().toLowerCase() || "";
  if (!email) {
    return NextResponse.json({ error: "OAuth session required." }, { status: 401 });
  }

  const name =
    oauth?.user?.name?.trim() || email.split("@")[0] || "User";

  let userId = "";

  await updateStore(async (s) => {
    let user = s.users.find(
      (u) => u.email === email && u.status !== "Deactivated",
    );

    if (!user) {
      // No prior invite — create a User membership in current workspace
      userId = `usr_${randomUUID().slice(0, 10)}`;
      user = {
        id: userId,
        name,
        email,
        passwordHash: "",
        role: "User",
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
    } else {
      userId = user.id;
      if (user.status === "Invited") {
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
    }
  });

  const store = await readStore();
  const user = store.users.find((u) => u.id === userId);
  if (!user || user.status === "Deactivated") {
    return NextResponse.json({ error: "Account unavailable." }, { status: 403 });
  }

  const token = signSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: normalizeRole(user.role),
    workspaceId: user.workspaceId || store.workspace.id,
    workspace: store.workspace.name,
  });

  const res = NextResponse.json({
    authenticated: true,
    user: {
      ...publicUser(user),
      role: normalizeRole(user.role),
      workspace: store.workspace.name,
      workspaceId: user.workspaceId || store.workspace.id,
    },
    membership: {
      workspaceId: user.workspaceId || store.workspace.id,
      role: normalizeRole(user.role),
    },
    permissions: permissionsFor(normalizeRole(user.role)),
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
