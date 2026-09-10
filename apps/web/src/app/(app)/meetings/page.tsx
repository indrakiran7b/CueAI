"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Video, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { openCompanionOverlay } from "@/lib/desktop";
import {
  formatDuration,
  formatMeetingWhen,
  type StoredMeeting,
} from "@/lib/meetings-client";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "live" | "summary";

export default function MeetingsPage() {
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [meetings, setMeetings] = useState<StoredMeeting[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/meetings", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { meetings?: StoredMeeting[] }) => {
        if (active) setMeetings(data.meetings || []);
      })
      .catch(() => {
        if (active) setMeetings([]);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return meetings.filter((m) => {
      const matchesQuery =
        !q ||
        m.title.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q)) ||
        (m.company || "").toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "live" && m.status === "live") ||
        (statusFilter === "summary" && m.status !== "live");
      return matchesQuery && matchesStatus;
    });
  }, [meetings, query, statusFilter]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Meetings
          </h1>
          <p className="mt-1 text-sm text-muted">
            Live sessions, recordings, and AI summaries in one place.
          </p>
        </div>
        <Link href="/meetings/live">
          <Button variant="gradient">
            <Video className="h-4 w-4" />
            New live session
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="min-w-[240px] flex-1">
          <Input
            placeholder="Search meetings…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
          />
        </div>
        <Button
          variant={filtersOpen || statusFilter !== "all" ? "primary" : "outline"}
          onClick={() => setFiltersOpen((o) => !o)}
        >
          <Filter className="h-4 w-4" />
          Filters
        </Button>
      </div>

      {filtersOpen && (
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", "All"],
              ["live", "Live"],
              ["summary", "Summary ready"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setStatusFilter(id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition",
                statusFilter === id
                  ? "border-teal-500/40 bg-teal-500/15 text-teal-300"
                  : "border-[var(--border)] text-muted hover:border-[var(--border-strong)] hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((m) => (
          <Link
            key={m.id}
            href={m.status === "live" ? "/meetings/live" : `/meetings/${m.id}/summary`}
            onClick={() => {
              if (m.status === "live") void openCompanionOverlay();
            }}
          >
            <Card hover className="h-full p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--primary-muted)] text-primary">
                  <Video className="h-5 w-5" />
                </div>
                {m.status === "live" ? (
                  <Badge variant="success">Live</Badge>
                ) : (
                  <Badge>Summary ready</Badge>
                )}
              </div>
              <h3 className="mt-4 font-semibold tracking-tight">{m.title}</h3>
              <p className="mt-1 text-sm text-muted">
                {formatMeetingWhen(m.startedAt)} · {formatDuration(m.durationSec)}
                {m.resumeName ? ` · ${m.resumeName}` : ""}
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {m.tags.map((t) => (
                  <Badge key={t} variant="info">
                    {t}
                  </Badge>
                ))}
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {loaded && filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-muted">
          {meetings.length === 0
            ? "No sessions yet. Start a live session to save it here."
            : `No meetings match your search${statusFilter !== "all" ? " or filters" : ""}.`}
        </p>
      )}
    </div>
  );
}
