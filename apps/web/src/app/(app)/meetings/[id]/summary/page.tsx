"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/providers/auth-provider";
import { FREE_MEETING_QA_LIMIT } from "@/lib/app-access";
import {
  canViewFullMeetingQa,
  resolveMeetingEntitlement,
} from "@/lib/entitlements";
import { fetchMeeting } from "@/lib/meetings-client";
import type { MeetingRecord } from "@/lib/meetings-catalog";
import { cn } from "@/lib/utils";

export default function MeetingSummaryPage() {
  const params = useParams<{ id: string }>();
  const meetingId = typeof params.id === "string" ? params.id : "";
  const { session } = useAuth();

  const entitlement = useMemo(
    () =>
      resolveMeetingEntitlement({
        role: session?.role,
        plan: session?.plan,
      }),
    [session?.role, session?.plan],
  );
  const sessionFullQa = canViewFullMeetingQa(entitlement);
  const isAdmin = entitlement.source === "admin";

  const [cache, setCache] = useState<{
    id: string;
    meeting: MeetingRecord | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!meetingId) return;
    let cancelled = false;

    void fetchMeeting(meetingId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setCache({ id: meetingId, meeting: null, error: result.error });
        return;
      }
      setCache({ id: meetingId, meeting: result.meeting, error: null });
    });

    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  const loading = Boolean(meetingId) && cache?.id !== meetingId;
  const meeting = cache?.id === meetingId ? cache.meeting : null;
  const error = cache?.id === meetingId ? cache.error : null;

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
        Loading meeting summary…
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

  const openCount = meeting.actionItems.filter((item) => item.status === "open").length;
  const answers = meeting.aiAnswers || [];
  const flagsKnown =
    typeof meeting.hasMore === "boolean" || typeof meeting.fullSummaryAvailable === "boolean";
  const visibleAnswers = flagsKnown
    ? answers
    : sessionFullQa
      ? answers
      : answers.slice(0, FREE_MEETING_QA_LIMIT);
  const showUpgrade =
    meeting.hasMore === true ||
    (!flagsKnown && !sessionFullQa && answers.length > FREE_MEETING_QA_LIMIT);

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant="info" className="mb-2">
            Meeting Summary
          </Badge>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            {meeting.title}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {meeting.time} · {meeting.duration} · {meeting.attendees} attendees
            {meeting.generatedIn ? ` · Generated in ${meeting.generatedIn}` : ""}
          </p>
        </div>
      </div>

      <Card glow className="p-6">
        <CardTitle className="mb-3">Overview</CardTitle>
        <p className="text-sm leading-relaxed text-muted">{meeting.executiveSummary}</p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {meeting.keyDecisions.length > 0 && (
          <Card className="p-5">
            <CardHeader>
              <CardTitle>Key Points</CardTitle>
            </CardHeader>
            <ul className="space-y-3">
              {meeting.keyDecisions.map((decision) => (
                <li key={decision} className="flex gap-2 text-sm text-foreground/90">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-400" />
                  <span>{decision}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {visibleAnswers.length > 0 && (
          <Card className="p-5 md:col-span-2">
            <CardHeader>
              <CardTitle>Questions &amp; Answers</CardTitle>
            </CardHeader>
            <ul className="space-y-4">
              {visibleAnswers.map((answer, index) => (
                <li key={answer.id} className="rounded-xl border border-[var(--border)] p-4 text-sm">
                  <p className="font-medium text-foreground">
                    {index + 1}. {answer.question}
                  </p>
                  <p className="mt-2 text-muted">{answer.answer}</p>
                </li>
              ))}
            </ul>
            {showUpgrade && (
              <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--background)]/50 p-5">
                <p className="font-semibold tracking-tight">Want to view more Q&amp;A?</p>
                <p className="mt-1 text-sm text-muted">
                  Upgrade to unlock the rest of this meeting&apos;s questions and answers.
                </p>
                <ul className="mt-3 space-y-1 text-sm text-foreground/90">
                  <li className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-teal-300" />
                    All questions and answers
                  </li>
                  <li className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-teal-300" />
                    Full meeting insights
                  </li>
                </ul>
                <Link href="/settings#billing" className="mt-4 inline-block">
                  <Button variant="gradient" size="sm">
                    Upgrade for more Q&amp;A
                  </Button>
                </Link>
              </div>
            )}
          </Card>
        )}

        {meeting.risks.length > 0 && (
          <Card className="p-5">
            <CardHeader>
              <CardTitle>Risks and questions</CardTitle>
            </CardHeader>
            <ul className="space-y-3">
              {meeting.risks.map((risk) => (
                <li key={risk.text} className="flex gap-2 text-sm">
                  {risk.type === "risk" ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  ) : (
                    <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                  )}
                  <span>
                    <span
                      className={cn(
                        "font-medium",
                        risk.type === "risk" ? "text-amber-300" : "text-violet-300",
                      )}
                    >
                      {risk.type === "risk" ? "Risk · " : "Question · "}
                    </span>
                    <span className="text-muted">{risk.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {isAdmin && meeting.transcript.length > 0 && (
          <Card className="p-5">
            <CardHeader>
              <CardTitle>Transcript</CardTitle>
            </CardHeader>
            <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
              {meeting.transcript.map((line) => (
                <li key={line.id}>
                  <span className="font-medium text-primary">{line.speaker}:</span>{" "}
                  <span className="text-muted">{line.text}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {meeting.actionItems.length > 0 && (
        <Card className="p-5">
          <CardHeader>
            <CardTitle>Action items</CardTitle>
            <Badge>{openCount} open</Badge>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-subtle">
                  <th className="pb-3 font-medium">Task</th>
                  <th className="pb-3 font-medium">Owner</th>
                  <th className="pb-3 font-medium">Due</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {meeting.actionItems.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--border)]/60">
                    <td className="py-3 pr-4 font-medium">{item.title}</td>
                    <td className="py-3 pr-4 text-muted">{item.owner}</td>
                    <td className="py-3 pr-4 text-muted">{item.due}</td>
                    <td className="py-3">
                      <Badge
                        variant={item.status === "done" ? "success" : "warning"}
                        className={cn(item.status === "done" && "opacity-90")}
                      >
                        {item.status === "done" ? "Done" : "Open"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
