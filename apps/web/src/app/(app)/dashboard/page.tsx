"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, type Variants } from "framer-motion";
import {
  ArrowUpRight,
  Settings,
  Sparkles,
  Video,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "@/components/providers/auth-provider";
import { useTheme } from "@/components/providers/theme-provider";
import { greetingFor } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/roles";
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

type MeetingRow = {
  id: string;
  title: string;
  status?: string;
  startedAt?: string;
  durationSec?: number;
  attendees?: number;
};

const userShortcuts = [
  { href: "/meetings", icon: Video, label: "Meetings", hint: "Completed summaries" },
  { href: "/meetings/live", icon: Sparkles, label: "Live Session", hint: "Start a live session" },
  { href: "/settings", icon: Settings, label: "Settings", hint: "Preferences" },
];

function formatDuration(sec?: number) {
  if (!sec || sec <= 0) return "—";
  const m = Math.round(sec / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function buildWeeklyUsage(meetings: MeetingRow[]) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const buckets = days.map((day) => ({ day, minutes: 0 }));
  const now = new Date();
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  for (const m of meetings) {
    if (!m.startedAt || m.status === "live") continue;
    const t = Date.parse(m.startedAt);
    if (!Number.isFinite(t) || t < weekAgo) continue;
    const d = new Date(t).getDay();
    buckets[d]!.minutes += Math.max(0, Math.round((m.durationSec || 0) / 60));
  }
  // Present Mon→Sun
  return [...buckets.slice(1), buckets[0]!].map((b) => ({
    day: b.day,
    tokens: b.minutes,
  }));
}

export default function DashboardPage() {
  const { session, ready } = useAuth();
  const { theme } = useTheme();
  const name = session?.name || "there";
  const workspace = session?.workspace || "Your Workspace";
  const admin = canAccessAdmin(session?.role);
  const isLight = theme === "light";
  const chartTick = isLight ? "#999999" : "#666666";
  const chartStroke = isLight ? "#090909" : "#ffffff";
  const tooltipStyle = {
    background: isLight ? "#ffffff" : "#1c1c1c",
    border: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid #262626",
    borderRadius: 12,
    fontSize: 12,
    color: isLight ? "#090909" : "#ffffff",
  };

  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/meetings", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as {
          meetings?: MeetingRow[];
        };
        if (!cancelled) setMeetings(Array.isArray(data.meetings) ? data.meetings : []);
      } catch {
        if (!cancelled) setMeetings([]);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const completed = meetings.filter((m) => m.status !== "live");
  const meetingCount = completed.length;
  const hoursTranscribed = completed.reduce(
    (sum, m) => sum + (typeof m.durationSec === "number" ? m.durationSec : 0),
    0,
  );
  const hoursLabel = (hoursTranscribed / 3600).toFixed(1);
  const recent = completed.slice(0, 5);
  const usageData = buildWeeklyUsage(completed);
  const hasUsage = usageData.some((d) => d.tokens > 0);

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
              : "Your AI meeting copilot."}
          </p>
        </div>
      </motion.header>

      <div className="db-metrics">
        {[
          {
            label: "Meeting summaries",
            value: loaded ? String(meetingCount) : "—",
            delta: loaded
              ? meetingCount
                ? "From your workspace"
                : "No summaries yet"
              : "Loading…",
          },
          {
            label: "Hours transcribed",
            value: loaded ? hoursLabel : "—",
            delta: loaded
              ? hoursTranscribed
                ? "From saved sessions"
                : "No activity yet"
              : "Loading…",
          },
        ].map((s, i) => (
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
              {meetingCount > 0 && i === 0 ? (
                <ArrowUpRight className="mr-0.5 inline h-3 w-3" />
              ) : null}
              {s.delta}
            </p>
          </motion.div>
        ))}
      </div>

      <div className="db-main">
        <motion.section
          className="db-panel"
          custom={3}
          variants={fade}
          initial="hidden"
          animate="show"
        >
          <div className="db-panel-head">
            <div>
              <h2 className="db-section-title">Weekly meeting activity</h2>
              <p className="db-section-sub">
                {hasUsage
                  ? "Minutes transcribed from your completed sessions"
                  : "No usage data yet"}
              </p>
            </div>
            <span className="db-chip">This week</span>
          </div>
          <div className="db-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={usageData}>
                <defs>
                  <linearGradient id="usageFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="#14b8a6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: chartTick, fontSize: 12 }}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [`${value ?? 0} min`, "Transcribed"]}
                />
                <Area
                  type="monotone"
                  dataKey="tokens"
                  stroke={chartStroke}
                  fill="url(#usageFill)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.section>

        <motion.section
          className="db-panel"
          custom={4}
          variants={fade}
          initial="hidden"
          animate="show"
        >
          <div className="db-panel-head">
            <h2 className="db-section-title">Go to</h2>
          </div>
          <div className="db-actions">
            {userShortcuts.map((a) => (
              <Link key={a.href} href={a.href} className="db-action">
                <span>
                  <span className="block">{a.label}</span>
                  <span className="mt-0.5 block text-xs text-muted">{a.hint}</span>
                </span>
                <a.icon className="db-action-icon h-4 w-4" />
              </Link>
            ))}
            {admin ? (
              <Link href="/admin" className="db-action">
                <span>
                  <span className="block">Admin Portal</span>
                  <span className="mt-0.5 block text-xs text-muted">Workspace management</span>
                </span>
                <Settings className="db-action-icon h-4 w-4" />
              </Link>
            ) : null}
          </div>
        </motion.section>
      </div>

      <motion.section
        className="db-panel"
        custom={5}
        variants={fade}
        initial="hidden"
        animate="show"
        style={{ marginTop: 16 }}
      >
        <div className="db-panel-head">
          <div>
            <h2 className="db-section-title">Recent meeting summaries</h2>
            <p className="db-section-sub">Completed sessions only</p>
          </div>
          <Link href="/meetings" className="db-link">
            View all
          </Link>
        </div>
        <div>
          {recent.length === 0 ? (
            <div style={{ padding: "12px 0" }}>
              <p className="db-section-sub">No meeting summaries yet.</p>
              <Link
                href="/meetings/live"
                className="db-link"
                style={{ display: "inline-block", marginTop: 8 }}
              >
                Start a Live Session
              </Link>
            </div>
          ) : (
            recent.map((m) => (
              <Link
                key={m.id}
                href={`/meetings/${m.id}/summary`}
                className="db-meeting"
              >
                <div>
                  <p className="db-meeting-title">{m.title}</p>
                  <p className="db-meeting-meta">{m.startedAt || "Saved session"}</p>
                </div>
                <div className="db-meeting-side">{formatDuration(m.durationSec)}</div>
              </Link>
            ))
          )}
        </div>
      </motion.section>
    </div>
  );
}
