"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Video, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  formatDuration,
  formatMeetingWhen,
  type StoredMeeting,
} from "@/lib/meetings-client";
import { cn } from "@/lib/utils";
import { MacGlassButton, MacSegmentedControl } from "@/components/mac";
import { isMacDesktopApp } from "@/lib/desktop";

type StatusFilter = "all" | "live" | "summary";

export default function MeetingsPage() {
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [meetings, setMeetings] = useState<StoredMeeting[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mac, setMac] = useState(false);

  useEffect(() => {
    setMac(isMacDesktopApp());
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/meetings", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("Unable to load meetings.");
        return r.json() as Promise<{ meetings?: StoredMeeting[] }>;
      })
      .then((data) => {
        if (!active) return;
        setMeetings(data.meetings || []);
        setLoadError(null);
      })
      .catch(() => {
        if (active) {
          setMeetings([]);
          setLoadError("Unable to load meetings.");
        }
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
      if (m.status === "live") return false;
      const matchesQuery =
        !q ||
        m.title.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q)) ||
        (m.company || "").toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || statusFilter === "summary";
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
            Completed sessions only. A live meeting appears here after you end it and the summary is saved.
          </p>
        </div>
        <Link href="/meetings/live">
          {mac ? (
            <MacGlassButton accent icon={<Video className="h-4 w-4" />}>
              New live session
            </MacGlassButton>
          ) : (
            <Button variant="gradient">
              <Video className="h-4 w-4" />
              New live session
            </Button>
          )}
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
        {mac ? (
          <MacSegmentedControl<"all" | "summary">
            value={statusFilter === "summary" ? "summary" : "all"}
            onChange={setStatusFilter}
            segments={[
              { id: "all", label: "All" },
              { id: "summary", label: "History" },
            ]}
          />
        ) : (
          <Button
            variant={filtersOpen || statusFilter !== "all" ? "primary" : "outline"}
            onClick={() => setFiltersOpen((o) => !o)}
          >
            <Filter className="h-4 w-4" />
            Filters
          </Button>
        )}
      </div>

      {filtersOpen && (
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", "All completed"],
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
            href={`/meetings/${m.id}/summary`}
          >
            <Card hover className="h-full p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--primary-muted)] text-primary">
                  <Video className="h-5 w-5" />
                </div>
                <Badge>Summary ready</Badge>
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

      {loadError && (
        <p className="py-8 text-center text-sm text-[var(--cue-danger)]" role="alert">
          Unable to load meetings.{" "}
          <button type="button" className="underline" onClick={() => window.location.reload()}>
            Try Again
          </button>
        </p>
      )}

      {loaded && !loadError && filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-muted">
          {meetings.length === 0
            ? "No meeting summaries yet."
            : `No meetings match your search${statusFilter !== "all" ? " or filters" : ""}.`}
        </p>
      )}
    </div>
  );
}
