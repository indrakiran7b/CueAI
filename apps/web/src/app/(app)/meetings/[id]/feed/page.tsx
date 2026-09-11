"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Languages, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchMeeting } from "@/lib/meetings-client";
import type { MeetingRecord } from "@/lib/meetings-catalog";
import { cn } from "@/lib/utils";

export default function ConversationFeedPage() {
  const params = useParams<{ id: string }>();
  const meetingId = typeof params.id === "string" ? params.id : "";

  const [meeting, setMeeting] = useState<MeetingRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMeeting(null);

    void fetchMeeting(meetingId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }
      setMeeting(result.meeting);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
        Loading conversation feed…
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-16 text-center animate-fade-up">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Meeting not found
        </h1>
        <p className="text-sm text-muted">
          {error || "No meeting exists for this ID."}{" "}
          {meetingId ? (
            <>
              Requested ID: <code className="text-primary">{meetingId}</code>
            </>
          ) : null}
        </p>
        <Link href="/meetings">
          <Button variant="outline">Back to meetings</Button>
        </Link>
      </div>
    );
  }

  const lines = meeting.transcript;

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="purple">
              <MessageSquare className="mr-1 h-3 w-3" />
              Conversation feed
            </Badge>
            <Badge variant={meeting.status === "live" ? "success" : "info"}>
              {meeting.status === "live" ? "Live" : "Recorded"}
            </Badge>
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {meeting.title}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {meeting.time} · {meeting.duration} · {meeting.attendees} attendees ·{" "}
            {lines.length} messages
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/meetings/${encodeURIComponent(meeting.id)}/summary`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-3.5 w-3.5" />
              Summary
            </Button>
          </Link>
          <Link href={`/translation?meetingId=${encodeURIComponent(meeting.id)}`}>
            <Button variant="outline" size="sm">
              <Languages className="h-3.5 w-3.5" />
              Translation
            </Button>
          </Link>
        </div>
      </div>

      {lines.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted">
            No conversation transcript is available for this meeting yet.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {lines.map((line, index) => {
            const isYou = line.role === "You";
            return (
              <Card
                key={line.id}
                className={cn(
                  "p-4",
                  isYou && "border-teal-500/20 bg-teal-500/5"
                )}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold tracking-tight">
                    {line.speaker}
                  </span>
                  <Badge variant={isYou ? "success" : "info"}>{line.role}</Badge>
                  <span className="ml-auto font-mono text-[11px] text-subtle">
                    {line.time}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-foreground/90">{line.text}</p>
                <p className="mt-2 text-[11px] text-subtle">
                  Message {index + 1} of {lines.length}
                  {typeof line.confidence === "number"
                    ? ` · confidence ${(line.confidence * 100).toFixed(0)}%`
                    : ""}
                </p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
