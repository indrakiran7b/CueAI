import type { DbUsageEvent, DbUser } from "@/lib/server/db";

export type UsageRange = "today" | "7d" | "30d" | "all";
export const USAGE_RANGES: UsageRange[] = ["today", "7d", "30d", "all"];
export const RECENT_PAGE_SIZE = 25;

/** Features whose recorders store an estimate (text length based) instead of provider-reported counts. */
const ESTIMATING_FEATURES = new Set(["resume_analyze", "transcribe"]);

const FEATURE_LABELS: Record<string, string> = {
  live_answer: "Live Session",
  live_answer_stream: "Live Session",
  mock_interview: "Mock Interview",
  resume_analyze: "Resume Tailor",
  transcribe: "Transcription",
};

export function parseRange(value: string | null): UsageRange {
  return USAGE_RANGES.includes(value as UsageRange) ? (value as UsageRange) : "30d";
}

/** First UTC day (YYYY-MM-DD) included in the range; null for all time. Days match the Token Usage page (UTC). */
export function rangeStartDay(range: UsageRange, now: Date = new Date()): string | null {
  if (range === "all") return null;
  const days = range === "today" ? 1 : range === "7d" ? 7 : 30;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));
  return start.toISOString().slice(0, 10);
}

export function featureLabel(e: DbUsageEvent): string {
  const feature = typeof e.metadata?.feature === "string" ? e.metadata.feature : "";
  if (feature.startsWith("live_answer") && e.metadata?.test === true) return "Test CueAI";
  if (FEATURE_LABELS[feature]) return FEATURE_LABELS[feature];
  return feature ? feature.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "Other";
}

export function isEstimated(e: DbUsageEvent): boolean {
  return e.metadata?.estimated === true || ESTIMATING_FEATURES.has(String(e.metadata?.feature || ""));
}

/** No input/output split was recorded and the total is not a known estimate (live recorders store a 1-token placeholder). */
export function countsMissing(e: DbUsageEvent): boolean {
  return !isEstimated(e) && !(e.inputTokens || 0) && !(e.outputTokens || 0);
}

function sumTokens(events: DbUsageEvent[]) {
  let totalTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  for (const e of events) {
    totalTokens += e.quantity;
    inputTokens += e.inputTokens || 0;
    outputTokens += e.outputTokens || 0;
  }
  return { totalTokens, inputTokens, outputTokens };
}

function overTime(events: DbUsageEvent[], startDay: string | null, now: Date) {
  const byDay = new Map<string, number>();
  if (startDay) {
    const today = now.toISOString().slice(0, 10);
    for (let d = new Date(`${startDay}T00:00:00Z`); d.toISOString().slice(0, 10) <= today; d.setUTCDate(d.getUTCDate() + 1)) {
      byDay.set(d.toISOString().slice(0, 10), 0);
    }
  }
  for (const e of events) {
    const day = e.createdAt.slice(0, 10);
    byDay.set(day, (byDay.get(day) || 0) + e.quantity);
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, quantity]) => ({ date, quantity }));
}

function byProviderModel(events: DbUsageEvent[]) {
  const map = new Map<string, { provider: string; model: string; inputTokens: number; outputTokens: number; totalTokens: number; requests: number }>();
  for (const e of events) {
    const provider = e.provider || "Not recorded";
    const model = e.model || "Not recorded";
    const key = `${provider}\u0000${model}`;
    const row = map.get(key) || { provider, model, inputTokens: 0, outputTokens: 0, totalTokens: 0, requests: 0 };
    row.inputTokens += e.inputTokens || 0;
    row.outputTokens += e.outputTokens || 0;
    row.totalTokens += e.quantity;
    row.requests += 1;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.totalTokens - a.totalTokens);
}

/**
 * Per-user token report from the existing workspace usage events.
 * `events` must already be workspace-scoped token events (same set the Token Usage page uses).
 */
export function buildUserTokenReport(input: {
  events: DbUsageEvent[];
  user: Pick<DbUser, "id" | "name" | "email">;
  range: UsageRange;
  page?: number;
  now?: Date;
}) {
  const now = input.now || new Date();
  const startDay = rangeStartDay(input.range, now);
  const inRange = input.events.filter((e) => !startDay || e.createdAt.slice(0, 10) >= startDay);
  const mine = inRange
    .filter((e) => e.userId === input.user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const estimated = mine.filter(isEstimated);
  const missing = mine.filter(countsMissing);
  const totalPages = Math.max(1, Math.ceil(mine.length / RECENT_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(input.page || 1)), totalPages);

  return {
    user: { id: input.user.id, name: input.user.name, email: input.user.email },
    range: input.range,
    startDay,
    summary: {
      ...sumTokens(mine),
      requests: mine.length,
      estimatedTokens: sumTokens(estimated).totalTokens,
      estimatedRequests: estimated.length,
      missingCountRequests: missing.length,
    },
    overTime: overTime(mine, startDay, now),
    byProviderModel: byProviderModel(mine),
    recent: {
      page,
      pageSize: RECENT_PAGE_SIZE,
      total: mine.length,
      totalPages,
      items: mine.slice((page - 1) * RECENT_PAGE_SIZE, page * RECENT_PAGE_SIZE).map((e) => ({
        id: e.id,
        createdAt: e.createdAt,
        provider: e.provider || null,
        model: e.model || null,
        inputTokens: e.inputTokens || 0,
        outputTokens: e.outputTokens || 0,
        totalTokens: e.quantity,
        feature: featureLabel(e),
        estimated: isEstimated(e),
        countsMissing: countsMissing(e),
      })),
    },
    unassigned: summarizeUnassigned(inRange),
  };
}

/** Historical events recorded without a user ID; reported separately, never attributed to anyone. */
export function summarizeUnassigned(events: DbUsageEvent[]) {
  const rows = events.filter((e) => !e.userId);
  return { requests: rows.length, totalTokens: sumTokens(rows).totalTokens };
}
