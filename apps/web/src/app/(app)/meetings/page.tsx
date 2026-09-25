"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Trash2, Video, Filter } from "lucide-react";
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
import { persistDesktopQuery, withDesktopParam } from "@/lib/desktop-query";

type StatusFilter = "all" | "interview" | "regular";

export default function MeetingsPage() {
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [meetings, setMeetings] = useState<StoredMeeting[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [mac, setMac] = useState(false);

  useEffect(() => {
    setMac(isMacDesktopApp());
    persistDesktopQuery();
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/meetings", { cache: "no-store" })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as {
          meetings?: StoredMeeting[];
          error?: string;
        };
        if (!r.ok) throw new Error(data.error || "Unable to load meetings.");
        if (active) {
          setMeetings(data.meetings || []);
          setError(null);
        }
      })
      .catch((cause) => {
        if (active) {
          setMeetings([]);
          setError(cause instanceof Error ? cause.message : "Unable to load meetings.");
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
      // Backend already excludes live; keep a hard client guard.
      if (m.status === "live") return false;
      const matchesQuery =
        !q ||
        m.title.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q)) ||
        (m.company || "").toLowerCase().includes(q);
      const matchesKind =
        statusFilter === "all" ||
        (statusFilter === "interview" && m.kind === "interview") ||
        (statusFilter === "regular" && m.kind === "regular");
      return matchesQuery && matchesKind;
    });
  }, [meetings, query, statusFilter]);

  async function handleDelete(meetingId: string) {
    if (deletingId) return;
    const ok = window.confirm("Delete this meeting permanently?");
    if (!ok) return;
    setDeletingId(meetingId);
    try {
      const res = await fetch(`/api/meetings/${encodeURIComponent(meetingId)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMeetings((prev) => prev.filter((m) => m.id !== meetingId));
      }
    } finally {
      setDeletingId(null);
    }
  }

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
        <Link href={withDesktopParam("/meetings/live")}>
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
          <MacSegmentedControl<StatusFilter>
            value={statusFilter}
            onChange={setStatusFilter}
            segments={[
              { id: "all", label: "All" },
              { id: "interview", label: "Interview" },
              { id: "regular", label: "Regular" },
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
              ["interview", "Interview"],
              ["regular", "Regular"],
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

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}{" "}
          <button type="button" className="underline" onClick={() => window.location.reload()}>
            Try Again
          </button>
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((m) => (
          <div key={m.id} className="relative">
            <Link href={withDesktopParam(`/meetings/${m.id}/summary`)}>
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
                  {Array.isArray(m.answers) && m.answers.length > 0
                    ? ` · ${m.answers.length} Q&A`
                    : ""}
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
            <button
              type="button"
              aria-label="Delete meeting"
              disabled={deletingId === m.id}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleDelete(m.id);
              }}
              className="absolute bottom-4 right-4 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-muted transition hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {loaded && !error && filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-muted">
          {meetings.length === 0
            ? "No meeting summaries yet."
            : `No meetings match your search${statusFilter !== "all" ? " or filters" : ""}.`}
        </p>
      )}
    </div>
  );
}
