"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Languages, MessageSquare } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatDuration,
  formatMeetingWhen,
  type StoredMeeting,
} from "@/lib/meetings-client";

export default function MeetingSummaryPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [meeting, setMeeting] = useState<StoredMeeting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    void fetch(`/api/meetings/${id}`, { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          meeting?: StoredMeeting;
          error?: string;
        };
        if (!res.ok || !data.meeting) throw new Error(data.error || "Meeting not found.");
        if (active) setMeeting(data.meeting);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Could not load meeting.");
      });
    return () => {
      active = false;
    };
  }, [id]);

  const emailBody = meeting
    ? [
        `Hi — notes from ${meeting.title}.`,
        meeting.company ? `Company: ${meeting.company}` : "",
        meeting.summary || "",
        meeting.answers.length
          ? `Q&A:\n${meeting.answers
              .slice(0, 6)
              .map((a) => `Q: ${a.prompt}\nA: ${a.answer}`)
              .join("\n\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n")
    : "";

  async function copyEmail() {
    if (!meeting) return;
    try {
      await navigator.clipboard.writeText(`Subject: Notes from ${meeting.title}\n\n${emailBody}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl py-12 text-center text-sm text-muted">
        {error}{" "}
        <Link href="/meetings" className="text-primary hover:underline">
          Back to meetings
        </Link>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="mx-auto max-w-5xl py-12 text-center text-sm text-muted">
        Loading session…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant="info" className="mb-2">
            {meeting.status === "live" ? "Live" : "Summary ready"}
          </Badge>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            {meeting.title}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {formatMeetingWhen(meeting.startedAt)} · {formatDuration(meeting.durationSec)}
            {meeting.resumeName ? ` · ${meeting.resumeName}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/translation">
            <Button variant="outline" size="sm">
              <Languages className="h-3.5 w-3.5" />
              Translation
            </Button>
          </Link>
          <Link href="/meetings/live">
            <Button variant="gradient" size="sm">
              <MessageSquare className="h-3.5 w-3.5" />
              New session
            </Button>
          </Link>
        </div>
      </div>

      <Card glow className="p-6">
        <CardTitle className="mb-3">Session briefing</CardTitle>
        <p className="text-sm leading-relaxed text-muted">
          {meeting.summary ||
            (meeting.kind === "interview"
              ? `Interview session${meeting.company ? ` at ${meeting.company}` : ""}${
                  meeting.resumeName ? ` with ${meeting.resumeName}` : ""
                }. CueAI used the uploaded resume to draft speakable answers.`
              : meeting.description || "Regular live session.")}
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <CardHeader>
            <CardTitle>Asked in this session</CardTitle>
          </CardHeader>
          <ul className="space-y-3">
            {meeting.answers.length === 0 && (
              <li className="text-sm text-muted">No questions were asked.</li>
            )}
            {meeting.answers.slice(0, 8).map((a) => (
              <li key={a.at} className="flex gap-2 text-sm text-foreground/90">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-400" />
                <span>
                  <span className="font-medium">{a.prompt}</span>
                  <span className="mt-1 block text-muted">{a.answer}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <CardHeader>
            <CardTitle>Transcript</CardTitle>
          </CardHeader>
          <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
            {meeting.transcript.length === 0 && (
              <li className="text-muted">No transcript lines were saved.</li>
            )}
            {meeting.transcript.map((line, i) => (
              <li key={`${line.at || i}-${line.text.slice(0, 12)}`}>
                <span className="font-medium text-primary">{line.who}:</span>{" "}
                <span className="text-muted">{line.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="p-5">
        <CardTitle className="mb-3">Follow-up email draft</CardTitle>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)]/50 p-4 text-sm leading-relaxed text-muted">
          <p className="text-foreground">Subject: Notes from {meeting.title}</p>
          <p className="mt-3 whitespace-pre-wrap">{emailBody}</p>
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="primary" onClick={() => void copyEmail()}>
            {copied ? "Copied" : "Copy email"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
