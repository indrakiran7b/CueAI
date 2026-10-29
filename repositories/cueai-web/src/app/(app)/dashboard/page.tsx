"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import {
  CalendarDays,
  Clock,
  Layers,
  MoreHorizontal,
  Shield,
  Sparkles,
  Video,
  ChevronDown,
} from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/providers/auth-provider";
import { greetingFor } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { formatDuration, type StoredMeeting } from "@/lib/meetings-client";
import { getDesktop } from "@/lib/desktop";
import { withDesktopParam } from "@/lib/desktop-query";
import { DesktopCapabilitiesPanel } from "./desktop-feature-cards";
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

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function startOfWeekMonday(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function formatLongDate(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function meetingWhenLong(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today, ${time}`;
  return `${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}, ${time}`;
}

function kindBadgeLabel(kind: StoredMeeting["kind"]) {
  if (kind === "mock_interview") return "Mock interview";
  if (kind === "interview") return "Interview";
  if (kind === "regular") return "Regular";
  return kind;
}

function pctChange(current: number, previous: number): string | null {
  if (previous <= 0 && current <= 0) return null;
  if (previous <= 0) return `+${current} this week`;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "Same as last week";
  return `${pct > 0 ? "+" : ""}${pct}% from last week`;
}

export default function DashboardPage() {
  const { session, ready } = useAuth();
  const name = session?.name || "there";
  const [activitiesOn, setActivitiesOn] = useState(true);
  const chartTick = "var(--chart-tick)";
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

  const now = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => startOfWeekMonday(new Date()), []);
  const weekEnd = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    return d;
  }, [weekStart]);
  const prevWeekStart = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    return d;
  }, [weekStart]);

  const thisWeek = completed.filter((m) => {
    const t = new Date(m.startedAt).getTime();
    return t >= weekStart.getTime() && t < weekEnd.getTime();
  });
  const prevWeek = completed.filter((m) => {
    const t = new Date(m.startedAt).getTime();
    return t >= prevWeekStart.getTime() && t < weekStart.getTime();
  });

  const answerCount = thisWeek.reduce((sum, m) => sum + (m.answers?.length || 0), 0);
  const prevAnswers = prevWeek.reduce((sum, m) => sum + (m.answers?.length || 0), 0);
  const hours = thisWeek.reduce((sum, m) => sum + (m.durationSec || 0), 0) / 3600;
  const prevHours = prevWeek.reduce((sum, m) => sum + (m.durationSec || 0), 0) / 3600;

  const stats = [
    {
      label: "Meetings this week",
      value: loaded ? String(thisWeek.length) : "—",
      delta: loaded ? pctChange(thisWeek.length, prevWeek.length) : "Loading…",
      positive: thisWeek.length >= prevWeek.length,
      icon: CalendarDays,
    },
    {
      label: "AI answers",
      value: loaded ? String(answerCount) : "—",
      delta: loaded ? pctChange(answerCount, prevAnswers) : "Loading…",
      positive: answerCount >= prevAnswers,
      icon: Sparkles,
    },
    {
      label: "Hours transcribed",
      value: loaded ? (hours ? hours.toFixed(1) : "0") : "—",
      delta: loaded ? pctChange(Math.round(hours * 10), Math.round(prevHours * 10)) : "Loading…",
      positive: hours >= prevHours,
      icon: Clock,
    },
    {
      label: "Desktop overlay",
      value: companionOn == null ? "—" : companionOn ? "Connected" : "Idle",
      delta:
        companionOn == null
          ? "CueAI Desktop not connected"
          : companionOn
            ? "Ready to assist"
            : "Not open",
      positive: companionOn === true,
      icon: Layers,
    },
  ];

  const usageSeries = useMemo(() => {
    const buckets: { day: string; meetings: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      buckets.push({ day: WEEKDAY_LABELS[i], meetings: 0 });
    }
    for (const meeting of thisWeek) {
      const started = new Date(meeting.startedAt);
      started.setHours(0, 0, 0, 0);
      const diffDays = Math.round((started.getTime() - weekStart.getTime()) / 86400000);
      if (diffDays < 0 || diffDays > 6) continue;
      buckets[diffDays]!.meetings += 1;
    }
    return buckets;
  }, [thisWeek, weekStart]);

  const hasUsage = usageSeries.some((d) => d.meetings > 0);

  const recent = useMemo(
    () =>
      [...completed]
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
        .slice(0, 3),
    [completed],
  );

  return (
    <div className="@container/dashboard w-full min-w-0">
    <div data-dashboard>
      <motion.header
        className="db-hero"
        custom={0}
        variants={fade}
        initial="hidden"
        animate="show"
      >
        <div className="db-hero-copy">
          <p className="db-hero-date">{formatLongDate(now)}</p>
          <h1 className="db-hero-title">{ready ? greetingFor(name) : "Welcome"}</h1>
          <p className="db-hero-sub">
            Your workspace at a glance. Stay focused on the conversation.
          </p>
        </div>
        <Link href={withDesktopParam("/meetings/live")} className="db-hero-cta-wrap">
          <Button variant="gradient" size="lg" className="db-hero-cta">
            <Video className="h-4 w-4" />
            New live session
          </Button>
        </Link>
      </motion.header>

      <div className="db-metrics">
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
          <motion.div
            key={s.label}
            className="db-metric"
            custom={i + 1}
            variants={fade}
            initial="hidden"
            animate="show"
          >
            <div className="db-metric-top">
              <p className="db-metric-label">{s.label}</p>
              <span className="db-metric-icon" aria-hidden>
                <Icon className="h-4 w-4" />
              </span>
            </div>
            <p className="db-metric-value">{s.value}</p>
            {s.delta && (
              <p
                className={`db-metric-delta ${s.positive ? "is-up" : "is-down"}`}
              >
                {s.delta}
              </p>
            )}
          </motion.div>
        );
        })}
      </div>

      <div className="db-main">
        <motion.section
          className="db-panel db-activity-panel"
          custom={5}
          variants={fade}
          initial="hidden"
          animate="show"
        >
          <div className="db-panel-head">
            <div className="db-activity-head">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="db-section-title">Activities</h2>
                <button
                  type="button"
                  role="switch"
                  aria-checked={activitiesOn}
                  className={cn("db-toggle", activitiesOn && "is-on")}
                  onClick={() => setActivitiesOn((v) => !v)}
                  aria-label="Show activity chart"
                />
              </div>
              <p className="db-section-sub">
                {loadError ? (
                  <>
                    <span className="text-[var(--cue-danger)]">{loadError}</span>{" "}
                    <button type="button" className="db-link" onClick={() => window.location.reload()}>
                      Try Again
                    </button>
                  </>
                ) : !loaded ? (
                  "Loading…"
                ) : hasUsage ? (
                  `${thisWeek.length} completed meeting${thisWeek.length === 1 ? "" : "s"} this week`
                ) : (
                  "No activity data available yet"
                )}
              </p>
            </div>
            <button type="button" className="db-chip db-chip-btn">
              This week
              <ChevronDown className="h-3 w-3 opacity-70" />
            </button>
          </div>
          <div className="db-chart">
            {activitiesOn && hasUsage ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={usageSeries} barSize={28}>
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: chartTick, fontSize: 12 }}
                  />
                  <YAxis hide allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Bar dataKey="meetings" fill="var(--accent)" radius={[6, 6, 0, 0]} name="Meetings" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center text-sm text-muted">
                {!activitiesOn ? "Activities hidden." : "No activity data available yet."}
              </p>
            )}
          </div>
        </motion.section>

        <motion.div custom={6} variants={fade} initial="hidden" animate="show">
          <DesktopCapabilitiesPanel />
        </motion.div>
      </div>

      <motion.section
        className="db-panel db-recent"
        custom={7}
        variants={fade}
        initial="hidden"
        animate="show"
        aria-labelledby="db-recent-title"
      >
        <div className="db-recent-head">
          <div>
            <h2 id="db-recent-title" className="db-section-title">
              Recent meetings
            </h2>
          </div>
          <Link href={withDesktopParam("/meetings")} className="db-link db-recent-all">
            View all meetings →
          </Link>
        </div>

        {loaded && recent.length === 0 ? (
          <p className="db-recent-empty">No meeting summaries yet.</p>
        ) : (
          <ul className="db-recent-list">
            {recent.map((m) => {
              const answers = m.answers?.length ?? m.answerCount ?? 0;
              return (
                <li key={m.id} className="db-recent-row">
                  <Link href={withDesktopParam(`/meetings/${m.id}/summary`)} className="db-recent-link">
                    <span className="db-recent-icon" aria-hidden>
                      <Video className="h-4 w-4" />
                    </span>
                    <span className="db-recent-body">
                      <span className="db-recent-title">{m.title}</span>
                      <span className="db-recent-meta">
                        {meetingWhenLong(m.startedAt)}
                        {m.durationSec ? ` · ${formatDuration(m.durationSec)}` : ""}
                      </span>
                    </span>
                    <Badge variant="info" className="db-recent-badge">
                      {kindBadgeLabel(m.kind)}
                    </Badge>
                    <span className="db-recent-answers">
                      <Sparkles className="h-3.5 w-3.5" />
                      {answers} answer{answers === 1 ? "" : "s"}
                    </span>
                  </Link>
                  <Link
                    href={withDesktopParam(`/meetings/${m.id}/summary`)}
                    className="db-recent-menu"
                    aria-label={`Open ${m.title}`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <footer className="db-recent-footer">
          <p className="db-privacy-note">
            <Shield className="h-4 w-4 shrink-0 text-emerald-400/90" aria-hidden />
            Your conversations are private and secure. CueAI only captures audio when you start a live
            session.
          </p>
          <Link href="/settings#privacy" className="db-link">
            Privacy settings
          </Link>
        </footer>
      </motion.section>
    </div>
    </div>
  );
}
