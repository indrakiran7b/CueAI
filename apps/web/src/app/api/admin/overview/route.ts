import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/api-auth";
import { readStore } from "@/lib/server/db";
import { permissionsFor } from "@/lib/roles";

export async function GET(req: NextRequest) {
  const { error, session } = await requirePermission("admin.access", req);
  if (error || !session) return error;
  const store = await readStore();
  const {
    scopeUsage,
    scopeUsers,
    scopeInvites,
    scopeKnowledge,
    scopeAudit,
    scopeMeetings,
  } = await import("@/lib/server/workspace-scope");
  const period = new Date().toISOString().slice(0, 7);
  const users = scopeUsers(store, session.workspaceId);
  const invites = scopeInvites(store, session.workspaceId);
  const usage = scopeUsage(store, session.workspaceId);
  const periodUsage = usage.filter((u) => u.createdAt.startsWith(period));
  const tokens = periodUsage.filter((u) => u.type === "tokens");
  const resumes = periodUsage.filter((u) => u.type === "resume_rewrite");
  const audit = scopeAudit(store, session.workspaceId);
  const meetings = scopeMeetings(store, session.workspaceId);
  const periodMeetings = meetings.filter((m) => {
    const start = m.startedAt || "";
    const end = m.endedAt || "";
    return start.startsWith(period) || end.startsWith(period);
  });
  const processedMeetings = periodMeetings.filter(
    (m) => m.status === "summary" || m.status === "completed" || Boolean(m.endedAt),
  );
  const periodMeetingMinutes = Math.round(
    processedMeetings.reduce((s, m) => s + Math.max(0, m.durationSec || 0), 0) / 60,
  );

  return NextResponse.json({
    role: session.role,
    permissions: permissionsFor(session.role),
    workspace: {
      id: store.workspace.id,
      name: store.workspace.name,
      seats: store.workspace.seats,
      createdAt: store.workspace.createdAt || null,
    },
    metrics: {
      totalUsers: users.length,
      activeUsers: users.filter((u) => u.status === "Active").length,
      invitedUsers: users.filter((u) => u.status === "Invited").length,
      deactivatedUsers: users.filter((u) => u.status === "Deactivated").length,
      pendingInvites: invites.filter((i) => i.status === "sent" || i.status === "pending").length,
      knowledgeItems: scopeKnowledge(store, session.workspaceId).length,
      periodTokenUsage: tokens.reduce((s, e) => s + e.quantity, 0),
      periodMeetingMinutes,
      periodMeetingSessions: processedMeetings.length,
      periodResumeRewrites: resumes.reduce((s, e) => s + e.quantity, 0),
      periodLabel: period,
      auditEvents: audit.length,
    },
    recentActivity: audit.slice(0, 8).map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      actorName: e.actorName,
      action: e.action,
      resourceType: e.resourceType,
    })),
  });
}
