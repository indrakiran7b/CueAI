"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Activity, BarChart3, Bot, ClipboardList, Cpu, RefreshCw, UserRound } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Range = "today" | "7d" | "30d" | "all";

const RANGES: Array<{ id: Range; label: string }> = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 Days" },
  { id: "30d", label: "Last 30 Days" },
  { id: "all", label: "All Time" },
];

type WorkspaceUser = { id: string; name: string; email: string; status: string };

type Report = {
  user: { id: string; name: string; email: string };
  summary: {
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    requests: number;
    estimatedTokens: number;
    estimatedRequests: number;
    missingCountRequests: number;
  };
  overTime: Array<{ date: string; quantity: number }>;
  byProviderModel: Array<{ provider: string; model: string; inputTokens: number; outputTokens: number; totalTokens: number; requests: number }>;
  recent: {
    page: number;
    totalPages: number;
    total: number;
    items: Array<{
      id: string;
      createdAt: string;
      provider: string | null;
      model: string | null;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      feature: string;
      estimated: boolean;
      countsMissing: boolean;
    }>;
  };
};

type Payload = {
  users: WorkspaceUser[];
  report: Report | null;
  unassigned: { requests: number; totalTokens: number };
};

const selectClass =
  "h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--background-elevated)] px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--primary-muted)]";

const n = (value: number) => value.toLocaleString();

function Empty({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-sm text-muted">{children}</div>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-subtle">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-2 font-display text-2xl font-semibold">{value}</div>
    </Card>
  );
}

export function UserTokenUsagePanel() {
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [userId, setUserId] = useState("");
  const [range, setRange] = useState<Range>("30d");
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<Report | null>(null);
  const [unassigned, setUnassigned] = useState({ requests: 0, totalTokens: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ range, page: String(page) });
      if (userId) params.set("userId", userId);
      const res = await fetch(`/api/admin/usage/users?${params}`, { cache: "no-store", credentials: "include" });
      const body = (await res.json().catch(() => ({}))) as Partial<Payload> & { error?: string };
      if (id !== requestRef.current) return;
      if (!res.ok) {
        setError(body.error || `Request failed (${res.status})`);
        setReport(null);
        return;
      }
      setUsers(body.users || []);
      setReport(body.report || null);
      setUnassigned(body.unassigned || { requests: 0, totalTokens: 0 });
    } catch {
      if (id === requestRef.current) setError("Couldn't reach CueAI. Check your connection and retry.");
    } finally {
      if (id === requestRef.current) setLoading(false);
    }
  }, [range, page, userId]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const selected = users.find((u) => u.id === userId);
  const rangeLabel = RANGES.find((r) => r.id === range)?.label || "";

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            User
            <select
              id="token-user-select"
              className={selectClass}
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Select a user…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email ? `${u.name} (${u.email})` : u.name}
                  {u.status !== "Active" ? ` — ${u.status}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Date range
            <select
              id="token-range-select"
              className={cn(selectClass, "md:w-44")}
              value={range}
              onChange={(e) => {
                setRange(e.target.value as Range);
                setPage(1);
              }}
            >
              {RANGES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <UserRound className="h-4 w-4 text-muted" />
          <h2 className="font-display text-lg font-semibold">
            {selected ? selected.name : "No user selected"}
          </h2>
          {selected?.email && <span className="text-sm text-muted">{selected.email}</span>}
          <Badge>{rangeLabel} · UTC</Badge>
        </div>

        {unassigned.requests > 0 && (
          <p className="text-xs text-subtle">
            {n(unassigned.requests)} older token events ({n(unassigned.totalTokens)} tokens) in this range were recorded
            without a user and are not counted for any user.
          </p>
        )}
      </Card>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : !userId ? (
        <Card>
          <Empty>{loading ? "Loading workspace users…" : "Select a user to see their token utilization."}</Empty>
        </Card>
      ) : loading && !report ? (
        <Card>
          <Empty>Loading token usage…</Empty>
        </Card>
      ) : !report || report.summary.requests === 0 ? (
        <Card>
          <Empty>No token usage recorded for this user in {rangeLabel.toLowerCase()}.</Empty>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={Cpu} label="Total Tokens" value={n(report.summary.totalTokens)} />
            <Metric icon={Activity} label="Input Tokens" value={n(report.summary.inputTokens)} />
            <Metric icon={Bot} label="Output Tokens" value={n(report.summary.outputTokens)} />
            <Metric icon={ClipboardList} label="Total AI Requests" value={n(report.summary.requests)} />
          </div>

          {(report.summary.estimatedRequests > 0 || report.summary.missingCountRequests > 0) && (
            <div className="space-y-1 text-xs text-subtle">
              {report.summary.estimatedRequests > 0 && (
                <p>
                  Includes {n(report.summary.estimatedTokens)} estimated tokens from {n(report.summary.estimatedRequests)}{" "}
                  Resume Tailor / Transcription requests; those features record estimates, not provider counts.
                </p>
              )}
              {report.summary.missingCountRequests > 0 && (
                <p>
                  {n(report.summary.missingCountRequests)} requests had no token counts reported by the provider; only
                  their recorded placeholder total is included, with no input or output tokens.
                </p>
              )}
            </div>
          )}

          <Card className="p-5">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <h3 className="font-semibold">Token Usage Over Time</h3>
            </div>
            <div className="mt-3 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.overTime}>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="quantity" name="Tokens" fill="var(--primary)" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold">Usage by AI Provider and Model</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs text-subtle">
                  <tr className="border-b border-[var(--border)]">
                    <th className="py-2 pr-3">Provider</th>
                    <th className="py-2 pr-3">Model</th>
                    <th className="py-2 pr-3 text-right">Input</th>
                    <th className="py-2 pr-3 text-right">Output</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                    <th className="py-2 text-right">Requests</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byProviderModel.map((row) => (
                    <tr key={`${row.provider}-${row.model}`} className="border-b border-[var(--border)]/60">
                      <td className="py-3 pr-3">{row.provider}</td>
                      <td className="py-3 pr-3 text-muted">{row.model}</td>
                      <td className="py-3 pr-3 text-right">{n(row.inputTokens)}</td>
                      <td className="py-3 pr-3 text-right">{n(row.outputTokens)}</td>
                      <td className="py-3 pr-3 text-right font-medium">{n(row.totalTokens)}</td>
                      <td className="py-3 text-right text-muted">{n(row.requests)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Recent AI Usage</h3>
              <span className="text-xs text-subtle">{n(report.recent.total)} requests</span>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs text-subtle">
                  <tr className="border-b border-[var(--border)]">
                    <th className="py-2 pr-3">Date and time</th>
                    <th className="py-2 pr-3">Provider</th>
                    <th className="py-2 pr-3">Model</th>
                    <th className="py-2 pr-3 text-right">Input</th>
                    <th className="py-2 pr-3 text-right">Output</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                    <th className="py-2">Feature</th>
                  </tr>
                </thead>
                <tbody>
                  {report.recent.items.map((row) => (
                    <tr key={row.id} className="border-b border-[var(--border)]/60">
                      <td className="py-3 pr-3 text-xs text-muted">{new Date(row.createdAt).toLocaleString()}</td>
                      <td className="py-3 pr-3">{row.provider || "—"}</td>
                      <td className="py-3 pr-3 text-muted">{row.model || "—"}</td>
                      <td className="py-3 pr-3 text-right">{row.inputTokens || row.outputTokens ? n(row.inputTokens) : "—"}</td>
                      <td className="py-3 pr-3 text-right">{row.inputTokens || row.outputTokens ? n(row.outputTokens) : "—"}</td>
                      <td className="py-3 pr-3 text-right font-medium">
                        {n(row.totalTokens)}
                        {row.estimated && <span className="ml-1 text-xs font-normal text-subtle">est.</span>}
                      </td>
                      <td className="py-3">
                        {row.feature}
                        {row.countsMissing && <span className="ml-1 text-xs text-subtle">(counts not reported)</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {report.recent.totalPages > 1 && (
              <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted">
                <Button size="sm" variant="ghost" disabled={loading || report.recent.page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                Page {report.recent.page} of {report.recent.totalPages}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={loading || report.recent.page >= report.recent.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
