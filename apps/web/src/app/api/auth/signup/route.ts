import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { normalizeRole } from "@/lib/roles";
import { CREDENTIALS_BYPASS } from "@/lib/auth-mode";
import { generateBypassSignupEmail, resolveBypassUser } from "@/lib/server/bypass-auth";
import { appendAudit, publicUser, readStore, updateStore } from "@/lib/server/db";
import {
  hashPassword,
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
} from "@/lib/server/session";

/**
 * Signup. If email was pre-invited (status Invited), activate that membership
 * and keep the invited role + workspace — no accept step.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { email?: string; password?: string; name?: string; workspace?: string }
    | null;
  const email = body?.email?.trim().toLowerCase() || "";
  const password = body?.password || "";
  const name = body?.name?.trim() || "";
  const workspaceName = body?.workspace?.trim() || `${name.split(" ")[0] || "My"}'s Workspace`;

  if (CREDENTIALS_BYPASS) {
    // Test builds: accept an empty form. Onboarding stays unanswered so the
    // caller lands on the questionnaire.
    const { user, workspace, workspaceId } = await resolveBypassUser({
      email: email || generateBypassSignupEmail(),
      name,
      completeOnboarding: false,
    });
    const bypassRole = normalizeRole(user.role);
    const token = signSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: bypassRole,
      workspaceId,
      workspace,
    });
    const res = NextResponse.json({
      user: { ...publicUser(user), role: bypassRole, workspace, workspaceId },
      membership: { workspaceId, role: bypassRole },
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  }

  if (!email || !password || !name) {
    return NextResponse.json({ error: "Name, email, and password are required." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  const store = await readStore();
  const invited = store.users.find((u) => u.email === email && u.status === "Invited");
  const activeExisting = store.users.find(
    (u) => u.email === email && u.status === "Active" && Boolean(u.passwordHash),
  );
  if (activeExisting) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  let userId = "";
  let role = "User" as ReturnType<typeof normalizeRole>;
  let workspaceId = store.workspace.id;
  let workspaceLabel = store.workspace.name;

  await updateStore(async (s) => {
    if (invited) {
      // Activate pre-created membership from immediate invite
      invited.name = name;
      invited.passwordHash = hashPassword(password);
      invited.status = "Active";
      invited.lastActiveAt = new Date().toISOString();
      role = normalizeRole(invited.role);
      workspaceId = invited.workspaceId || s.workspace.id;
      userId = invited.id;

      const inv = s.invites.find(
        (i) =>
          i.email === email &&
          i.status !== "revoked" &&
          (i.workspaceId || s.workspace.id) === workspaceId,
      );
      if (inv) {
        inv.status = "active";
        inv.acceptedAt = new Date().toISOString();
      }

      await appendAudit(s, {
        actorId: userId,
        actorName: name,
        action: "user.activated_from_invite",
        resourceType: "user",
        resourceId: userId,
        metadata: { role, workspaceId, email },
      });
      return;
    }

    const activeUsers = s.users.filter(
      (u) => u.status === "Active" && u.email !== "admin@cueai.local",
    );
    const onlyBootstrap =
      s.users.filter((u) => u.status === "Active").length === 1 &&
      s.users.some((u) => u.email === "admin@cueai.local" && u.status === "Active");
    role = activeUsers.length === 0 || onlyBootstrap ? "Admin" : "User";
    userId = `usr_${randomUUID().slice(0, 10)}`;

    if (role === "Admin") {
      s.workspace.name = workspaceName;
      workspaceLabel = workspaceName;
      const bootstrap = s.users.find((u) => u.email === "admin@cueai.local");
      if (bootstrap && bootstrap.name === "Workspace Admin") {
        bootstrap.status = "Deactivated";
      }
    }

    s.users.push({
      id: userId,
      name,
      email,
      passwordHash: hashPassword(password),
      role: normalizeRole(role),
      status: "Active",
      workspaceId: s.workspace.id,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    });
    workspaceId = s.workspace.id;
    await appendAudit(s, {
      actorId: userId,
      actorName: name,
      action: "user.signed_up",
      resourceType: "user",
      resourceId: userId,
      metadata: { role },
    });
  });

  const fresh = await readStore();
  workspaceLabel = fresh.workspace.name;

  const token = signSession({
    userId,
    email,
    name,
    role: normalizeRole(role),
    workspaceId,
    workspace: workspaceLabel,
  });

  const res = NextResponse.json({
    user: {
      id: userId,
      name,
      email,
      role: normalizeRole(role),
      workspace: workspaceLabel,
      workspaceId,
      onboardingCompleted: Boolean(
        fresh.users.find((u) => u.id === userId)?.onboarding?.completedAt,
      ),
    },
    membership: {
      workspaceId,
      role: normalizeRole(role),
    },
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
