import { NextResponse } from "next/server";
import { appendAudit, publicUser, readStore, updateStore } from "@/lib/server/db";
import { normalizeRole } from "@/lib/roles";
import { CREDENTIALS_BYPASS } from "@/lib/auth-mode";
import { resolveBypassUser } from "@/lib/server/bypass-auth";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
  verifyPassword,
} from "@/lib/server/session";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { email?: string; password?: string }
    | null;
  const email = body?.email?.trim().toLowerCase() || "";
  const password = body?.password || "";

  if (CREDENTIALS_BYPASS) {
    // Test builds: sign in as the typed email (or the default tester) and skip
    // onboarding, since the questionnaire belongs to the signup path.
    const { user, workspace, workspaceId } = await resolveBypassUser({
      email,
      completeOnboarding: true,
    });
    const role = normalizeRole(user.role);
    const token = signSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role,
      workspaceId,
      workspace,
    });
    const res = NextResponse.json({
      user: { ...publicUser(user), role, workspace, workspaceId },
      membership: { workspaceId, role },
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  }

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const store = await readStore();
  const user = store.users.find((u) => u.email === email);
  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }
  if (user.status === "Deactivated") {
    return NextResponse.json({ error: "This account has been deactivated." }, { status: 403 });
  }
  if (user.status === "Invited") {
    return NextResponse.json(
      {
        error:
          "Your account was invited but not activated yet. Please sign up with this email to set your password.",
      },
      { status: 403 },
    );
  }

  const updated = await updateStore(async (s) => {
    const u = s.users.find((x) => x.id === user.id);
    if (!u) return;
    u.lastActiveAt = new Date().toISOString();
    // Mark matching invite as active if still "sent"
    const inv = s.invites.find(
      (i) =>
        i.email === u.email &&
        (i.workspaceId || s.workspace.id) === u.workspaceId &&
        (i.status === "sent" || i.status === "pending"),
    );
    if (inv) {
      inv.status = "active";
      if (!inv.acceptedAt) inv.acceptedAt = new Date().toISOString();
    }
    await appendAudit(s, {
      actorId: u.id,
      actorName: u.name,
      action: "user.login",
      resourceType: "user",
      resourceId: u.id,
      metadata: { role: u.role },
    });
  });

  const fresh = updated.users.find((u) => u.id === user.id)!;
  const role = normalizeRole(fresh.role);
  const workspaceId = fresh.workspaceId || updated.workspace.id;

  const token = signSession({
    userId: fresh.id,
    email: fresh.email,
    name: fresh.name,
    role,
    workspaceId,
    workspace: updated.workspace.name,
  });

  const res = NextResponse.json({
    user: {
      ...publicUser(fresh),
      role,
      workspace: updated.workspace.name,
      workspaceId,
    },
    membership: {
      workspaceId,
      role,
    },
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
