"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { Activity, ArrowUpRight, ChevronDown } from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "@/components/providers/auth-provider";
import { greetingFor } from "@/lib/auth";
import { type StoredMeeting } from "@/lib/meetings-client";
import { getDesktop } from "@/lib/desktop";
import { DesktopFeatureCards } from "./desktop-feature-cards";
import "./dashboard.css";

const fade: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: 0.04 * i,
      duration: 0.35,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  }),
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function DashboardPage() {
  const { session, ready } = useAuth();
  const name = session?.name || "there";
  const workspace = session?.workspace || "Your Workspace";
  const chartTick = "var(--chart-tick)";
  const chartStroke = "var(--chart-line)";
  const tooltipStyle = {
    background: "var(--surface-solid)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    fontSize: 12,
    color: "var(--foreground)",
  };

  const [meetings, setMeetings] = useState<StoredMeeting[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [companionOn, setCompanionOn] = useState<boolean | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/meetings", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as {
          meetings?: StoredMeeting[];
        };
        if (cancelled) return;
        if (!res.ok) {
          setMeetings([]);
          setLoadError("Unable to load meetings.");
          return;
        }
        setMeetings(Array.isArray(data.meetings) ? data.meetings : []);
        setLoadError(null);
      } catch {
        if (!cancelled) {
          setMeetings([]);
          setLoadError("Unable to load meetings.");
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const desktop = getDesktop();
    if (!desktop?.getStatus) return;
    void desktop.getStatus().then((status) => setCompanionOn(Boolean(status.companionVisible)));
  }, []);

  const completed = useMemo(
    () => meetings.filter((m) => m.status !== "live"),
    [meetings],
  );

  const weekStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 6);
    return d;
  }, []);

  const thisWeek = completed.filter((m) => new Date(m.startedAt).getTime() >= weekStart.getTime());
  const answerCount = completed.reduce((sum, m) => sum + (m.answers?.length || 0), 0);
  const hours = completed.reduce((sum, m) => sum + (m.durationSec || 0), 0) / 3600;

  const stats = [
    {
      label: "Meetings this week",
      value: loaded ? String(thisWeek.length) : "—",
      delta: loaded
        ? thisWeek.length
          ? "From your workspace"
          : "No meetings yet"
        : "Loading…",
    },
    {
      label: "AI answers",
      value: loaded ? String(answerCount) : "—",
      delta: loaded ? (answerCount ? "From saved sessions" : "None yet") : "Loading…",
    },
    {
      label: "Hours transcribed",
      value: loaded ? (hours ? hours.toFixed(1) : "0") : "—",
      delta: loaded ? (hours ? "From saved sessions" : "No activity data yet") : "Loading…",
    },
    {
      label: "Desktop overlay",
      value: companionOn == null ? "—" : companionOn ? "Open" : "Idle",
      delta:
        companionOn == null ? "CueAI Desktop not connected" : companionOn ? "Overlay visible" : "Not open",
    },
  ];

  const usageSeries = useMemo(() => {
    const buckets = new Map<string, { day: string; meetings: number; tokens: number }>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const key = d.toDateString();
      buckets.set(key, { day: WEEKDAYS[d.getDay()], meetings: 0, tokens: 0 });
    }
    for (const meeting of thisWeek) {
      const key = new Date(meeting.startedAt).toDateString();
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.meetings += 1;
      bucket.tokens += (meeting.answers?.length || 0) + (meeting.transcript?.length || 0);
    }
    return [...buckets.values()];
  }, [thisWeek, weekStart]);

  const hasUsage = usageSeries.some((d) => d.meetings > 0 || d.tokens > 0);

  return (
    <div data-dashboard>
      <motion.header
        className="db-hero"
        custom={0}
        variants={fade}
        initial="hidden"
        animate="show"
      >
        <div className="db-hero-copy">
          <h1 className="db-hero-title">
            {ready ? greetingFor(name) : "Welcome"}
          </h1>
          <p className="db-hero-sub">
            {session
              ? `${workspace} · signed in as ${session.email}`
              : "Sign in to see your workspace."}
          </p>
        </div>
      </motion.header>

      <div className="db-metrics">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            className="db-metric"
            custom={i + 1}
            variants={fade}
            initial="hidden"
            animate="show"
          >
            <p className="db-metric-label">{s.label}</p>
            <p className="db-metric-value">{s.value}</p>
            <p className="db-metric-delta">
              {thisWeek.length > 0 && i === 0 ? (
                <ArrowUpRight className="mr-0.5 inline h-3 w-3" />
              ) : null}
              {s.delta}
            </p>
          </motion.div>
        ))}
      </div>

      <motion.div className="db-toolbar" custom={5} variants={fade} initial="hidden" animate="show">
        <div className="min-w-0">
          <p className="db-toolbar-title">Weekly activity</p>
          {loadError ? (
            <p className="db-section-sub text-[var(--cue-danger)]" role="alert">
              {loadError}{" "}
              <button type="button" className="db-link" onClick={() => window.location.reload()}>
                Try Again
              </button>
            </p>
          ) : (
            <p className="db-section-sub">
              {!loaded
                ? "Loading…"
                : hasUsage
                  ? `${thisWeek.length} completed meeting${thisWeek.length === 1 ? "" : "s"} in the last 7 days`
                  : "No activity data available yet"}
            </p>
          )}
        </div>
        <button
          type="button"
          className="db-toolbar-btn"
          aria-expanded={activityOpen}
          aria-controls="db-activity-panel"
          onClick={() => setActivityOpen((o) => !o)}
        >
          <Activity className="h-4 w-4" />
          Activities
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${activityOpen ? "rotate-180" : ""}`} />
        </button>
      </motion.div>

      {activityOpen && (
      <div className="db-main" id="db-activity-panel">
        <motion.section
          className="db-panel"
          custom={5}
          variants={fade}
          initial="hidden"
          animate="show"
        >
          <div className="db-panel-head">
            <div>
              <h2 className="db-section-title">Weekly activity</h2>
              <p className="db-section-sub">
                {hasUsage
                  ? "Completed meetings from this account"
                  : "No activity data available yet"}
              </p>
            </div>
            <span className="db-chip">This week</span>
          </div>
          <div className="db-chart">
            {hasUsage ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={usageSeries}>
                  <defs>
                    <linearGradient id="usageFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" style={{ stopColor: "var(--chart-area)", stopOpacity: 0.32 }} />
                      <stop offset="100%" style={{ stopColor: "var(--chart-area)", stopOpacity: 0 }} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: chartTick, fontSize: 12 }}
                  />
                  <YAxis hide />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="meetings"
                    stroke={chartStroke}
                    fill="url(#usageFill)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center text-sm text-muted">
                No activity data available yet.
              </p>
            )}
          </div>
        </motion.section>

        <motion.section
          className="db-panel db-meters"
          custom={6}
          variants={fade}
          initial="hidden"
          animate="show"
        >
          <div>
            <h2 className="db-section-title">Workspace</h2>
            <p className="db-section-sub">Live values for this account</p>
          </div>
          <div className="space-y-4 text-sm text-muted">
            <p>
              Completed meetings: <strong className="text-foreground">{completed.length}</strong>
            </p>
            <p>
              Live sessions in progress:{" "}
              <strong className="text-foreground">
                {meetings.filter((m) => m.status === "live").length}
              </strong>
            </p>
            <p>
              Desktop overlay:{" "}
              <strong className="text-foreground">
                {companionOn == null ? "Not connected" : companionOn ? "Open" : "Idle"}
              </strong>
            </p>
          </div>
          <p className="db-plan-note">
            Manage your plan in{" "}
            <Link href="/settings" className="db-link">
              Settings
            </Link>
          </p>
        </motion.section>
      </div>
      )}

      <motion.div custom={6} variants={fade} initial="hidden" animate="show">
        <DesktopFeatureCards />
      </motion.div>
    </div>
  );
}
