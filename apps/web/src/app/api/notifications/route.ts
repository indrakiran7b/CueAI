import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/api-auth";
import { readStore } from "@/lib/server/db";
import { canAccessAdmin } from "@/lib/roles";

function hrefFor(action: string, resourceId?: string, sessionRole?: string) {
  if (action.startsWith("meeting") || action.includes("meeting")) {
    return resourceId ? `/meetings/${resourceId}/summary` : "/meetings";
  }
  if (action.includes("device")) return "/settings";
  if (action.includes("knowledge")) return canAccessAdmin(sessionRole) ? "/knowledge" : "/dashboard";
  if (action.includes("workspace")) return "/settings";
  if (action.includes("user") || action.includes("invite")) return "/settings";
  return "/dashboard";
}

function titleFor(action: string, resourceType: string) {
  const map: Record<string, string> = {
    "meeting.ended": "Meeting summary ready",
    "meeting.created": "Meeting started",
    "meeting.updated": "Meeting updated",
    "workspace.updated": "Workspace updated",
    "user.signed_up": "Account created",
    "user.activated_from_invite": "Invitation accepted",
    "device.registered": "This Mac was registered",
    "device.activated": "A device was activated",
    "device.blocked": "A device was blocked",
    "device.revoked": "A device was revoked",
  };
  if (map[action]) return map[action];
  const readable = action.replace(/[._]/g, " ").trim();
  return readable ? readable[0]!.toUpperCase() + readable.slice(1) : resourceType;
}

export async function GET(req: NextRequest) {
  const { error, session } = await requireAuth(req);
  if (error || !session) return error;

  const store = await readStore();
  const { scopeAudit } = await import("@/lib/server/workspace-scope");
  const events = scopeAudit(store, session.workspaceId)
    .filter((event) => event.actorId === session.userId || session.role === "Admin")
    .slice(0, 40)
    .map((event) => ({
      id: event.id,
      title: titleFor(event.action, event.resourceType),
      body: event.actorName ? `${event.actorName}` : "",
      href: hrefFor(event.action, event.resourceId, session.role),
      createdAt: event.createdAt,
    }));

  return NextResponse.json({ notifications: events });
}
