import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/api-auth";
import { invalidateStoreCache, readStore, updateStore } from "@/lib/server/db";
import { isSyntheticEmail, isSyntheticUser, isSyntheticActor } from "@/lib/server/synthetic";

/**
 * Admin-only: permanently remove E2E/smoke synthetic accounts from the live store
 * and reload the in-memory cache. Does not invent replacement metrics.
 */
export async function POST(req: NextRequest) {
  const { error, session } = await requirePermission("workspace.write", req);
  if (error || !session) return error;

  const body = (await req.json().catch(() => ({}))) as { confirm?: boolean };
  if (!body.confirm) {
    return NextResponse.json(
      { error: "Pass { confirm: true } to purge synthetic E2E data." },
      { status: 400 },
    );
  }

  let removed = { users: 0, invites: 0, usage: 0, audit: 0 };

  await updateStore(async (s) => {
    const beforeUsers = s.users.length;
    const beforeInvites = s.invites.length;
    const beforeUsage = s.usage.length;
    const beforeAudit = s.audit.length;

    s.users = s.users.filter((u) => !isSyntheticUser(u));
    const keepIds = new Set(s.users.map((u) => u.id));
    s.invites = s.invites.filter((i) => !isSyntheticEmail(i.email));
    s.usage = s.usage.filter(
      (u) => !isSyntheticActor(u.userName) && (!u.userId || keepIds.has(u.userId)),
    );
    s.audit = s.audit.filter((a) => !isSyntheticActor(a.actorName));

    removed = {
      users: beforeUsers - s.users.length,
      invites: beforeInvites - s.invites.length,
      usage: beforeUsage - s.usage.length,
      audit: beforeAudit - s.audit.length,
    };
  });

  invalidateStoreCache();
  const store = await readStore();

  return NextResponse.json({
    ok: true,
    removed,
    remaining: {
      users: store.users.length,
      invites: store.invites.length,
      usage: store.usage.length,
      audit: store.audit.length,
      meetings: store.meetings?.length || 0,
      knowledge: store.knowledge.length,
    },
  });
}
