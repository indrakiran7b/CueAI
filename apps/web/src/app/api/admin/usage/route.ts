import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/api-auth";
import { readStore, type DbUsageEvent } from "@/lib/server/db";

function inCurrentPeriod(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
}

function byUserAgg(events: DbUsageEvent[]) {
  const map = new Map<string, { userId: string; userName: string; quantity: number; events: number }>();
  for (const e of events) {
    const u = map.get(e.userId) || { userId: e.userId, userName: e.userName, quantity: 0, events: 0 };
    u.quantity += e.quantity;
    u.events += 1;
    map.set(e.userId, u);
  }
  return [...map.values()].sort((a, b) => b.quantity - a.quantity);
}

function overTimeAgg(events: DbUsageEvent[]) {
  const byDay = new Map<string, number>();
  for (const e of events) {
    const day = e.createdAt.slice(0, 10);
    byDay.set(day, (byDay.get(day) || 0) + e.quantity);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, quantity]) => ({ date, quantity }));
}

function tokenAgg(events: DbUsageEvent[]) {
  let total = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const byProvider = new Map<string, number>();
  const byModel = new Map<string, number>();
  for (const e of events) {
    total += e.quantity;
    inputTokens += e.inputTokens || 0;
    outputTokens += e.outputTokens || 0;
    if (e.provider) byProvider.set(e.provider, (byProvider.get(e.provider) || 0) + e.quantity);
    if (e.model) byModel.set(e.model, (byModel.get(e.model) || 0) + e.quantity);
  }
  return {
    total,
    inputTokens,
    outputTokens,
    byUser: byUserAgg(events),
    byProvider: [...byProvider.entries()].map(([provider, quantity]) => ({ provider, quantity })),
    byModel: [...byModel.entries()].map(([model, quantity]) => ({ model, quantity })),
    overTime: overTimeAgg(events),
    eventCount: events.length,
  };
}

export async function GET(req: NextRequest) {
  const { error, session } = await requirePermission("usage.read", req);
  if (error || !session) return error;

  const type = (req.nextUrl.searchParams.get("type") || "tokens") as
    | DbUsageEvent["type"]
    | "all";
  const store = await readStore();
  const { scopeUsage, scopeMeetings } = await import("@/lib/server/workspace-scope");
  const all = scopeUsage(store, session.workspaceId);
  const periodLabel = new Date().toISOString().slice(0, 7);

  if (type === "meeting_minutes") {
    // Prefer real meeting records over synthetic usage-event counters.
    const meetings = scopeMeetings(store, session.workspaceId);
    const periodMeetings = meetings.filter((m) => {
      const start = m.startedAt || "";
      const end = m.endedAt || "";
      return start.startsWith(periodLabel) || end.startsWith(periodLabel);
    });
    const processed = periodMeetings.filter(
      (m) => m.status === "summary" || m.status === "completed" || Boolean(m.endedAt),
    );
    const totalMinutes = Math.round(
      processed.reduce((s, m) => s + Math.max(0, m.durationSec || 0), 0) / 60,
    );
    const overTimeMap = new Map<string, number>();
    for (const m of processed) {
      const day = (m.endedAt || m.startedAt).slice(0, 10);
      const mins = Math.round(Math.max(0, m.durationSec || 0) / 60);
      overTimeMap.set(day, (overTimeMap.get(day) || 0) + mins);
    }
    const byUserMap = new Map<
      string,
      { userId: string; userName: string; quantity: number; events: number }
    >();
    for (const m of processed) {
      const uid = m.userId || "unknown";
      const uname =
        store.users.find((u) => u.id === uid)?.name ||
        store.users.find((u) => u.id === uid)?.email ||
        "Unknown";
      const row = byUserMap.get(uid) || {
        userId: uid,
        userName: uname,
        quantity: 0,
        events: 0,
      };
      row.quantity += Math.round(Math.max(0, m.durationSec || 0) / 60);
      row.events += 1;
      byUserMap.set(uid, row);
    }

    return NextResponse.json({
      kind: "meeting_minutes",
      workspaceId: session.workspaceId,
      workspaceName: store.workspace.name,
      period: {
        label: periodLabel,
        meetingsProcessed: processed.length,
        totalMinutes,
        averageMinutes: processed.length
          ? Math.round((totalMinutes / processed.length) * 10) / 10
          : 0,
        transcriptionsGenerated: processed.length,
        byUser: [...byUserMap.values()].sort((a, b) => b.quantity - a.quantity),
        overTime: [...overTimeMap.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, quantity]) => ({ date, quantity })),
        eventCount: processed.length,
      },
      allTime: {
        meetingsProcessed: meetings.filter(
          (m) => m.status === "summary" || m.status === "completed" || Boolean(m.endedAt),
        ).length,
        totalMinutes: Math.round(
          meetings.reduce((s, m) => s + Math.max(0, m.durationSec || 0), 0) / 60,
        ),
        eventCount: meetings.length,
      },
      recent: [...meetings]
        .sort((a, b) =>
          (b.endedAt || b.startedAt).localeCompare(a.endedAt || a.startedAt),
        )
        .slice(0, 50)
        .map((m) => ({
          id: m.id,
          minutes: Math.round(Math.max(0, m.durationSec || 0) / 60),
          userName:
            store.users.find((u) => u.id === m.userId)?.name ||
            store.users.find((u) => u.id === m.userId)?.email ||
            "Unknown",
          provider: null,
          model: null,
          createdAt: m.endedAt || m.startedAt,
          label: m.title || null,
        })),
    });
  }

  if (type === "resume_rewrite") {
    const events = all.filter((e) => e.type === "resume_rewrite");
    const period = events.filter((e) => inCurrentPeriod(e.createdAt));
    const totalRewrites = period.reduce((s, e) => s + e.quantity, 0);
    const failedRewrites = period.filter(
      (e) => String(e.metadata?.status || "").toLowerCase() === "failed",
    ).length;
    return NextResponse.json({
      kind: "resume_rewrite",
      workspaceId: session.workspaceId,
      workspaceName: store.workspace.name,
      period: {
        label: periodLabel,
        totalRewrites,
        successfulRewrites: Math.max(0, totalRewrites - failedRewrites),
        failedRewrites,
        operations: period.length,
        byUser: byUserAgg(period),
        overTime: overTimeAgg(period),
        eventCount: period.length,
      },
      allTime: {
        totalRewrites: events.reduce((s, e) => s + e.quantity, 0),
        operations: events.length,
      },
      recent: events.slice(0, 50).map((e) => ({
        id: e.id,
        rewrites: e.quantity,
        userName: e.userName,
        provider: e.provider || null,
        model: e.model || null,
        createdAt: e.createdAt,
        status: String(e.metadata?.status || "recorded"),
      })),
    });
  }

  // tokens (default)
  const events = type === "all" ? all : all.filter((e) => e.type === "tokens");
  const periodEvents = events.filter((e) => inCurrentPeriod(e.createdAt));
  return NextResponse.json({
    kind: "tokens",
    workspaceId: session.workspaceId,
    workspaceName: store.workspace.name,
    period: {
      label: periodLabel,
      ...tokenAgg(periodEvents),
    },
    allTime: tokenAgg(events),
    recent: events.slice(0, 50).map((e) => ({
      id: e.id,
      type: e.type,
      quantity: e.quantity,
      inputTokens: e.inputTokens || 0,
      outputTokens: e.outputTokens || 0,
      userName: e.userName,
      provider: e.provider || null,
      model: e.model || null,
      createdAt: e.createdAt,
      feature: e.metadata?.feature || null,
    })),
  });
}
