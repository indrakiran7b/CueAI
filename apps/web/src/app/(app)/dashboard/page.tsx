"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import {
  ArrowUpRight,
  FileText,
  Library,
  Monitor,
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
import { Progress } from "@/components/ui/misc";
import {
  activity,
  recentMeetings,
  stats,
  usageSeries,
} from "@/lib/mock-data";
import { useAuth } from "@/components/providers/auth-provider";
import { useTheme } from "@/components/providers/theme-provider";
import { openCompanionOverlay, toggleCompanionOverlay } from "@/lib/desktop";
import { greetingFor } from "@/lib/auth";
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

const resources = [
  { label: "AI tokens", value: 68, hint: "340k / 500k" },
  { label: "Storage", value: 42, hint: "8.4 GB / 20 GB" },
  { label: "Desktop Companion", value: 91, hint: "Connected" },
];

const quickActions = [
  { href: "/resume", icon: FileText, label: "Tailor a resume" },
  { href: "/knowledge", icon: Library, label: "Upload to Knowledge" },
  { href: "/screen-context", icon: Monitor, label: "Enable Screen AI" },
  { href: "/translation", icon: Sparkles, label: "Start translation" },
];

export default function DashboardPage() {
  const { session, ready } = useAuth();
  const { theme } = useTheme();
  const name = session?.name || "there";
  const workspace = session?.workspace || "Your Workspace";
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

  async function handleCompanion() {
    await toggleCompanionOverlay();
  }

  return (
    <div data-dashboard>
      {/* Hero strip */}
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
              : "Your AI copilot is ready. Sign up to personalize this workspace."}
          </p>
        </div>
        <div className="db-hero-actions">
          <Link
            href="/meetings/live"
            className="db-btn-primary"
            onClick={() => {
              void openCompanionOverlay();
            }}
          >
            <Video className="h-4 w-4" />
            Start meeting
          </Link>
          <button type="button" className="db-btn-ghost" onClick={() => void handleCompanion()}>
            <Monitor className="h-4 w-4" />
            Companion
          </button>
        </div>
      </motion.header>

      {/* Metrics row */}
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
              <ArrowUpRight className="mr-0.5 inline h-3 w-3" />
              {s.delta}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Main: chart + resources */}
      <div className="db-main">
        <motion.section
          className="db-panel"
          custom={5}
          variants={fade}
          initial="hidden"
          animate="show"
        >
          <div className="db-panel-head">
            <div>
              <h2 className="db-section-title">Weekly AI usage</h2>
              <p className="db-section-sub">Meetings and token volume</p>
            </div>
            <span className="db-chip">This week</span>
          </div>
          <div className="db-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={usageSeries}>
                <defs>
                  <linearGradient id="usageFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0099ff" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="#0099ff" stopOpacity={0} />
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
          className="db-panel db-meters"
          custom={6}
          variants={fade}
          initial="hidden"
          animate="show"
        >
          <div>
            <h2 className="db-section-title">Resource usage</h2>
            <p className="db-section-sub">Plan capacity this cycle</p>
          </div>
          <div className="space-y-5">
            {resources.map((u) => (
              <div key={u.label}>
                <div className="db-meter-row">
                  <span className="db-meter-label">{u.label}</span>
                  <span className="db-meter-hint">{u.hint}</span>
                </div>
                <Progress value={u.value} />
              </div>
            ))}
          </div>
          <p className="db-plan-note">
            Pro plan renews Aug 28 ·{" "}
            <Link href="/settings" className="db-link">
              Manage billing
            </Link>
          </p>
        </motion.section>
      </div>

      {/* Lower: meetings · actions · activity */}
      <div className="db-lower">
        <motion.section
          className="db-panel"
          custom={7}
          variants={fade}
          initial="hidden"
          animate="show"
        >
          <div className="db-panel-head">
            <div>
              <h2 className="db-section-title">Recent meetings</h2>
              <p className="db-section-sub">Jump back into context</p>
            </div>
            <Link href="/meetings" className="db-link">
              View all
            </Link>
          </div>
          <div>
            {recentMeetings.map((m) => (
              <Link
                key={m.id}
                href={
                  m.status === "live"
                    ? "/meetings/live"
                    : `/meetings/${m.id}/summary`
                }
                className="db-meeting"
              >
                <div>
                  <p className="db-meeting-title">{m.title}</p>
                  <p className="db-meeting-meta">
                    {m.time} · {m.attendees} people
                  </p>
                </div>
                <div className="db-meeting-side">
                  {m.status === "live" ? (
                    <span className="db-live">Live</span>
                  ) : (
                    m.duration
                  )}
                </div>
              </Link>
            ))}
          </div>
        </motion.section>

        <motion.section
          className="db-panel"
          custom={8}
          variants={fade}
          initial="hidden"
          animate="show"
        >
          <div className="db-panel-head">
            <h2 className="db-section-title">Quick actions</h2>
          </div>
          <div className="db-actions">
            {quickActions.map((a) => (
              <Link key={a.href} href={a.href} className="db-action">
                <span>{a.label}</span>
                <a.icon className="db-action-icon h-4 w-4" />
              </Link>
            ))}
          </div>
        </motion.section>

        <motion.section
          className="db-panel"
          custom={9}
          variants={fade}
          initial="hidden"
          animate="show"
        >
          <div className="db-panel-head">
            <h2 className="db-section-title">Activity</h2>
          </div>
          <div className="db-activity">
            {activity.map((a) => (
              <div key={a.id} className="db-activity-item">
                <span className="db-activity-dot" />
                <div>
                  <p className="db-activity-text">{a.text}</p>
                  <p className="db-activity-time">{a.time}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="db-pin">
            <p className="db-pin-label">Pinned answer</p>
            <p className="db-pin-body">
              Target p95 &lt; 800ms for suggestion cards during live sessions.
            </p>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
