import type { SessionPayload } from "@/lib/server/session";
import type { WorkspaceStore } from "@/lib/server/db";
import { isSyntheticActor, isSyntheticEmail, isSyntheticUser } from "@/lib/server/synthetic";

/** Defensive workspace scoping — all admin reads should go through this. */
export function assertWorkspaceAccess(session: SessionPayload, workspaceId: string) {
  return session.workspaceId === workspaceId;
}

export function scopeUsers(store: WorkspaceStore, workspaceId: string) {
  return store.users.filter(
    (u) => u.workspaceId === workspaceId && !isSyntheticUser(u),
  );
}

export function scopeInvites(store: WorkspaceStore, workspaceId: string) {
  return store.invites.filter((inv) => {
    if (isSyntheticEmail(inv.email)) return false;
    const wid = inv.workspaceId || store.workspace.id;
    if (wid !== workspaceId) return false;
    return true;
  });
}

export function scopeKnowledge(store: WorkspaceStore, workspaceId: string) {
  return store.knowledge.filter((k) => {
    const wid = (k as { workspaceId?: string }).workspaceId;
    return !wid || wid === workspaceId;
  });
}

export function scopeUsage(store: WorkspaceStore, workspaceId: string) {
  const keepIds = new Set(
    store.users.filter((u) => !isSyntheticUser(u)).map((u) => u.id),
  );
  return store.usage.filter((u) => {
    if (u.workspaceId !== workspaceId) return false;
    if (isSyntheticActor(u.userName) || isSyntheticEmail(String(u.metadata?.email || ""))) {
      return false;
    }
    // Drop orphaned E2E usage tied to removed synthetic accounts.
    if (u.userId && !keepIds.has(u.userId) && isSyntheticActor(u.userName)) {
      return false;
    }
    if (u.userId && !keepIds.has(u.userId)) {
      // Keep usage only for remaining real users.
      return false;
    }
    return true;
  });
}

export function scopeAudit(store: WorkspaceStore, workspaceId: string) {
  const keepIds = new Set(
    store.users.filter((u) => !isSyntheticUser(u)).map((u) => u.id),
  );
  return store.audit.filter((a) => {
    if (a.workspaceId !== workspaceId) return false;
    if (isSyntheticActor(a.actorName)) return false;
    if (a.actorId && a.actorId !== "system" && !keepIds.has(a.actorId)) {
      // Allow bootstrap / unknown non-synthetic actors with real names.
      if (isSyntheticUser({ name: a.actorName })) return false;
    }
    return true;
  });
}

export function scopeMeetings(store: WorkspaceStore, workspaceId: string) {
  return (store.meetings || []).filter((m) => m.workspaceId === workspaceId);
}
