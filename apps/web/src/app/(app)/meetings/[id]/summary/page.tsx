"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Languages,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMeeting } from "@/lib/meetings-client";
import type { MeetingRecord } from "@/lib/meetings-catalog";
import { cn } from "@/lib/utils";

export default function MeetingSummaryPage() {
  const params = useParams<{ id: string }>();
  const meetingId = typeof params.id === "string" ? params.id : "";

  const [meeting, setMeeting] = useState<MeetingRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailBody, setEmailBody] = useState("");
  const [regenCount, setRegenCount] = useState(0);
  const [copied, setCopied] = useState(false);

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
      setEmailBody(result.meeting.emailBody);
      setRegenCount(0);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  async function copyEmail() {
    if (!meeting) return;
    try {
      await navigator.clipboard.writeText(`Subject: ${meeting.emailSubject}\n\n${emailBody}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  function regenerateEmail() {
    if (!meeting) return;
    const next = regenCount + 1;
    setRegenCount(next);
    setEmailBody(
      `${meeting.emailBody}\n\n(Updated draft v${next + 1}) Please also review the open risks section before sending.`,
    );
  }

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

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant={meeting.status === "live" ? "success" : "info"} className="mb-2">
            {meeting.status === "live" ? "Live" : "Summary ready"}
          </Badge>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            {meeting.title}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {meeting.time} · {meeting.duration} · {meeting.attendees} attendees
            {meeting.generatedIn ? ` · Generated in ${meeting.generatedIn}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/translation?meetingId=${encodeURIComponent(meeting.id)}`}>
            <Button variant="outline" size="sm">
              <Languages className="h-3.5 w-3.5" />
              Translation
            </Button>
          </Link>
          <Link href={`/meetings/${encodeURIComponent(meeting.id)}/feed`}>
            <Button variant="gradient" size="sm">
              <MessageSquare className="h-3.5 w-3.5" />
              Conversation feed
            </Button>
          </Link>
        </div>
      </div>

      <Card glow className="p-6">
        <CardTitle className="mb-3">
          {meeting.keyDecisions.length ? "Executive summary" : "Session briefing"}
        </CardTitle>
        <p className="text-sm leading-relaxed text-muted">{meeting.executiveSummary}</p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {meeting.keyDecisions.length > 0 && (
          <Card className="p-5">
            <CardHeader>
              <CardTitle>Key decisions</CardTitle>
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

        {meeting.aiAnswers.length > 0 && (
          <Card className="p-5">
            <CardHeader>
              <CardTitle>Asked in this session</CardTitle>
            </CardHeader>
            <ul className="space-y-3">
              {meeting.aiAnswers.slice(0, 8).map((answer) => (
                <li key={answer.id} className="flex gap-2 text-sm text-foreground/90">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-400" />
                  <span>
                    <span className="font-medium">{answer.question}</span>
                    <span className="mt-1 block text-muted">{answer.answer}</span>
                  </span>
                </li>
              ))}
            </ul>
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

        {meeting.transcript.length > 0 && (
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

      <Card className="p-5">
        <CardTitle className="mb-3">Follow-up email draft</CardTitle>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)]/50 p-4 text-sm leading-relaxed text-muted">
          <p className="text-foreground">Subject: {meeting.emailSubject}</p>
          <p className="mt-3 whitespace-pre-wrap">{emailBody}</p>
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="primary" onClick={() => void copyEmail()}>
            {copied ? "Copied" : "Copy email"}
          </Button>
          <Button size="sm" variant="outline" onClick={regenerateEmail}>
            Regenerate
          </Button>
        </div>
      </Card>
    </div>
  );
}
