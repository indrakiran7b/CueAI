import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/api-auth";
import { readStore } from "@/lib/server/db";
import { scopeUsage, scopeUsers } from "@/lib/server/workspace-scope";
import {
  buildUserTokenReport,
  parseRange,
  rangeStartDay,
  summarizeUnassigned,
} from "@/lib/server/user-token-usage";

/**
 * GET /api/admin/usage/users?userId=&range=today|7d|30d|all&page=
 * Read-only per-user token utilization for workspace admins. Uses the same
 * workspace-scoped token events as /api/admin/usage, so totals match it.
 */
export async function GET(req: NextRequest) {
  const usage = await requirePermission("usage.read", req);
  if (usage.error || !usage.session) return usage.error;
  const people = await requirePermission("users.read", req);
  if (people.error || !people.session) return people.error;
  const session = usage.session;

  const params = req.nextUrl.searchParams;
  const range = parseRange(params.get("range"));
  const userId = (params.get("userId") || "").trim();

  const store = await readStore();
  const users = scopeUsers(store, session.workspaceId)
    .map((u) => ({ id: u.id, name: u.name, email: u.email, status: u.status }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const events = scopeUsage(store, session.workspaceId).filter((e) => e.type === "tokens");

  if (!userId) {
    const startDay = rangeStartDay(range);
    const inRange = events.filter((e) => !startDay || e.createdAt.slice(0, 10) >= startDay);
    return NextResponse.json(
      { users, range, report: null, unassigned: summarizeUnassigned(inRange) },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const user = scopeUsers(store, session.workspaceId).find((u) => u.id === userId);
  if (!user) {
    return NextResponse.json({ error: "User not found in this workspace." }, { status: 404 });
  }

  const report = buildUserTokenReport({
    events,
    user,
    range,
    page: Number(params.get("page")) || 1,
  });
  return NextResponse.json(
    { users, range, report, unassigned: report.unassigned },
    { headers: { "Cache-Control": "no-store" } },
  );
}
