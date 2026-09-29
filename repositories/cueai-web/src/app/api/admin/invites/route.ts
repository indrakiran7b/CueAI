import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { normalizeRole, type WorkspaceRole } from "@/lib/roles";
import { requirePermission } from "@/lib/server/api-auth";
import { appendAudit, readStore, updateStore, type DbInvite, type DbUser } from "@/lib/server/db";
import { buildWorkspaceAddedEmail, isEmailDeliveryConfigured, sendEmail } from "@/lib/server/email";
import { scopeInvites } from "@/lib/server/workspace-scope";

const ALLOWED_ROLES: WorkspaceRole[] = ["Admin", "Manager", "User"];

function publicInviteStatus(invite: DbInvite, user?: DbUser | null) {
  if (invite.status === "revoked") return "revoked";
  if (invite.status === "expired") return "expired";
  if (user?.status === "Active") return "active";
  if (user?.status === "Invited") return "sent";
  if (invite.status === "accepted" || invite.status === "active") return "active";
  if (invite.status === "pending" || invite.status === "sent") return "sent";
  return String(invite.status);
}

function accountStatus(user?: DbUser | null) {
  if (!user) return "none";
  if (user.status === "Active") return "active";
  if (user.status === "Invited") return "invited";
  if (user.status === "Deactivated") return "deactivated";
  return user.status;
}

export async function GET(req: NextRequest) {
  const { error, session } = await requirePermission("users.read", req);
  if (error || !session) return error;
  const store = await readStore();
  const invites = scopeInvites(store, session.workspaceId).map((i) => {
    const user = store.users.find(
      (u) => u.email === i.email && u.workspaceId === session.workspaceId,
    );
    const inviter = store.users.find((u) => u.id === i.invitedBy);
    return {
      id: i.id,
      email: i.email,
      role: normalizeRole(i.role),
      status: publicInviteStatus(i, user),
      invitedBy: inviter?.name || inviter?.email || i.invitedBy,
      createdAt: i.createdAt,
      sentAt: i.sentAt || i.createdAt,
      accountStatus: accountStatus(user),
    };
  });
  return NextResponse.json({ invites });
}

/**
 * Immediate invite — membership + role applied now. No accept token.
 */
export async function POST(req: NextRequest) {
  const { error, session } = await requirePermission("users.invite", req);
  if (error || !session) return error;

  const body = (await req.json().catch(() => null)) as
    | { email?: string; role?: string; name?: string }
    | null;
  const email = body?.email?.trim().toLowerCase() || "";
  const roleRaw = body?.role;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  if (
    !roleRaw ||
    !ALLOWED_ROLES.map((r) => r.toLowerCase()).includes(String(roleRaw).toLowerCase())
  ) {
    return NextResponse.json({ error: "Role must be Admin, Manager, or User." }, { status: 400 });
  }
  const role = normalizeRole(roleRaw);
  const workspaceId = session.workspaceId;

  let inviteId = "";
  let inviteStatus: "sent" | "active" = "sent";
  let existingUser = false;
  let roleChanged = false;
  let resultUserId = "";

  try {
    await updateStore(async (s) => {
      const existing = s.users.find(
        (u) => u.email === email && u.workspaceId === workspaceId && u.status !== "Deactivated",
      );
      const activeCount = s.users.filter(
        (u) => u.status === "Active" && u.workspaceId === workspaceId,
      ).length;

      if (!existing && activeCount >= s.workspace.seats) {
        throw new Error("SEAT_LIMIT");
      }

      const now = new Date().toISOString();

      if (existing) {
        existingUser = true;
        const prevRole = existing.role;
        existing.role = role;
        existing.workspaceId = workspaceId;
        resultUserId = existing.id;
        roleChanged = prevRole !== role;
        inviteStatus = existing.status === "Active" ? "active" : "sent";
      } else {
        resultUserId = `usr_${randomUUID().slice(0, 10)}`;
        s.users.push({
          id: resultUserId,
          name: body?.name?.trim() || email.split("@")[0] || "Invited User",
          email,
          passwordHash: "",
          role,
          status: "Invited",
          workspaceId,
          createdAt: now,
        });
        inviteStatus = "sent";
      }

      const openInvite = s.invites.find(
        (i) =>
          i.email === email &&
          (i.workspaceId || s.workspace.id) === workspaceId &&
          i.status !== "revoked",
      );
      if (openInvite) {
        inviteId = openInvite.id;
        openInvite.role = role;
        openInvite.status = inviteStatus;
        openInvite.sentAt = now;
        openInvite.invitedBy = session.userId;
        openInvite.workspaceId = workspaceId;
        delete openInvite.token;
      } else {
        inviteId = `inv_${randomUUID().slice(0, 8)}`;
        s.invites.unshift({
          id: inviteId,
          email,
          role,
          invitedBy: session.userId,
          status: inviteStatus,
          createdAt: now,
          sentAt: now,
          workspaceId,
        });
      }

      await appendAudit(s, {
        actorId: session.userId,
        actorName: session.name,
        action: existingUser
          ? roleChanged
            ? "user.role_assigned_via_invite"
            : "invite.updated"
          : "user.invited",
        resourceType: "invite",
        resourceId: inviteId,
        metadata: { email, role, workspaceId, existingUser, immediate: true },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "SEAT_LIMIT") {
      return NextResponse.json({ error: "Seat limit reached." }, { status: 400 });
    }
    throw e;
  }

  const mail = buildWorkspaceAddedEmail({
    to: email,
    workspaceName: (await readStore()).workspace.name,
    role,
  });
  const sendResult = await sendEmail(mail);

  if (sendResult.ok) {
    await updateStore(async (s) => {
      const inv = s.invites.find((i) => i.id === inviteId);
      if (inv) inv.sentAt = new Date().toISOString();
      await appendAudit(s, {
        actorId: session.userId,
        actorName: session.name,
        action: "invite.email_sent",
        resourceType: "invite",
        resourceId: inviteId,
        metadata: {
          email,
          provider: sendResult.provider,
          messageId: "messageId" in sendResult ? sendResult.messageId || null : null,
        },
      });
    });
  }

  const fresh = await readStore();
  const user = fresh.users.find((u) => u.id === resultUserId);

  return NextResponse.json({
    ok: true,
    invite: {
      id: inviteId,
      email,
      role,
      status: inviteStatus,
      accountStatus: accountStatus(user),
      workspaceId,
      sentAt: new Date().toISOString(),
    },
    membership: user
      ? {
          userId: user.id,
          email: user.email,
          role: normalizeRole(user.role),
          workspaceId: user.workspaceId,
          accountStatus: accountStatus(user),
        }
      : null,
    emailDelivery: {
      configured: isEmailDeliveryConfigured(),
      attempted: true,
      ok: sendResult.ok,
      provider: sendResult.provider,
      error: sendResult.ok ? null : sendResult.error,
    },
    note: sendResult.ok
      ? "User was added to the workspace and a notification email was sent."
      : `User was added to the workspace, but email was not sent: ${sendResult.ok ? "" : sendResult.error}`,
  });
}

export async function PATCH(req: NextRequest) {
  const { error, session } = await requirePermission("users.invite", req);
  if (error || !session) return error;
  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const store = await readStore();
  const invite = store.invites.find((i) => i.id === body.id);
  if (!invite || (invite.workspaceId && invite.workspaceId !== session.workspaceId)) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }
  if (invite.status === "revoked") {
    return NextResponse.json({ error: "Cannot resend a revoked invitation." }, { status: 400 });
  }

  const mail = buildWorkspaceAddedEmail({
    to: invite.email,
    workspaceName: store.workspace.name,
    role: normalizeRole(invite.role),
  });
  const sendResult = await sendEmail(mail);

  await updateStore(async (s) => {
    const inv = s.invites.find((i) => i.id === body.id);
    if (inv) inv.sentAt = new Date().toISOString();
    await appendAudit(s, {
      actorId: session.userId,
      actorName: session.name,
      action: "invite.resent",
      resourceType: "invite",
      resourceId: body.id,
      metadata: {
        email: invite.email,
        emailOk: sendResult.ok,
        provider: sendResult.provider,
      },
    });
  });

  return NextResponse.json({
    ok: true,
    emailDelivery: {
      configured: isEmailDeliveryConfigured(),
      attempted: true,
      ok: sendResult.ok,
      provider: sendResult.provider,
      error: sendResult.ok ? null : sendResult.error,
    },
  });
}

export async function DELETE(req: NextRequest) {
  const { error, session } = await requirePermission("users.invite", req);
  if (error || !session) return error;
  const inviteId = req.nextUrl.searchParams.get("id");
  if (!inviteId) return NextResponse.json({ error: "id required" }, { status: 400 });

  const result = await updateStore(async (s) => {
    const invite = s.invites.find((i) => i.id === inviteId);
    if (!invite) throw new Error("NOT_FOUND");
    invite.status = "revoked";
    const user = s.users.find(
      (u) =>
        u.email === invite.email &&
        u.status === "Invited" &&
        u.workspaceId === session.workspaceId,
    );
    if (user) user.status = "Deactivated";
    await appendAudit(s, {
      actorId: session.userId,
      actorName: session.name,
      action: "invite.revoked",
      resourceType: "invite",
      resourceId: inviteId,
      metadata: { email: invite.email },
    });
  }).catch((e: Error) => e);

  if (result instanceof Error && result.message === "NOT_FOUND") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
