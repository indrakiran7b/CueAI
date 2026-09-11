"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Calendar,
  Languages,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";

const decisions = [
  "Ship onboarding redesign if QA finishes by Wednesday EOD.",
  "Board deck freeze locked for Thursday 5pm.",
  "Defer analytics polish to next sprint.",
];

const actions = [
  { task: "Finish QA regression", owner: "Jordan Lee", due: "Aug 6", status: "open" },
  { task: "Update sprint board estimates", owner: "Alex Chen", due: "Aug 5", status: "done" },
  { task: "Draft board risk section", owner: "Sarah Kim", due: "Aug 7", status: "open" },
  { task: "Notify design of freeze date", owner: "Alex Chen", due: "Aug 5", status: "open" },
  { task: "Schedule follow-up with Northwind", owner: "Sarah Kim", due: "Aug 8", status: "open" },
];

export default function SummaryPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant="info" className="mb-2">
            Summary ready
          </Badge>
          <h1 className="text-2xl font-semibold tracking-tight">Q3 Product Sync</h1>
          <p className="mt-1 text-sm text-muted">Aug 5, 2026 · 42 minutes · 6 attendees</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/translation?meetingId=m1">
            <Button size="sm" variant="outline">
              <Languages className="h-3.5 w-3.5" />
              Translation
            </Button>
          </Link>
          <Link href="/meetings/m1/feed">
            <Button size="sm" variant="gradient">
              <MessageSquare className="h-3.5 w-3.5" />
              Conversation feed
            </Button>
          </Link>
        </div>
      </div>

      <Card glow>
        <CardHeader>
          <CardTitle>Executive summary</CardTitle>
        </CardHeader>
        <p className="text-sm leading-relaxed text-muted">
          The team aligned on shipping the onboarding redesign contingent on QA completing
          regression by Wednesday. Board materials freeze Thursday at 5pm. Analytics polish was
          explicitly deferred. Five action items were assigned with clear owners and dates.
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-teal-400" />
              <CardTitle>Key decisions</CardTitle>
            </div>
          </CardHeader>
          <ul className="space-y-2.5">
            {decisions.map((d) => (
              <li
                key={d}
                className="rounded-xl border border-[var(--border)] bg-[var(--background)]/40 px-3 py-2.5 text-sm"
              >
                {d}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <CardTitle>Risks</CardTitle>
            </div>
          </CardHeader>
          <ul className="space-y-2.5 text-sm text-muted">
            <li className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
              Design polish tickets remain unestimated — may compress QA buffer.
            </li>
            <li className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
              Northwind feedback not yet reflected in onboarding copy.
            </li>
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <CardTitle>Action items</CardTitle>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-subtle">
                <th className="pb-3 font-medium">Task</th>
                <th className="pb-3 font-medium">Owner</th>
                <th className="pb-3 font-medium">Due</th>
                <th className="pb-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.task} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-3 pr-4 font-medium">{a.task}</td>
                  <td className="py-3 pr-4 text-muted">{a.owner}</td>
                  <td className="py-3 pr-4 text-muted">{a.due}</td>
                  <td className="py-3">
                    <Badge variant={a.status === "done" ? "success" : "warning"}>
                      {a.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-violet-400" />
            <CardTitle>Open questions</CardTitle>
          </div>
        </CardHeader>
        <ul className="list-inside list-disc space-y-2 text-sm text-muted">
          <li>Should analytics polish include funnel instrumentation?</li>
          <li>Who owns the Northwind follow-up agenda?</li>
        </ul>
      </Card>

      <div className="flex justify-end">
        <Link href="/meetings">
          <Button variant="ghost">Back to meetings</Button>
        </Link>
      </div>
    </div>
  );
}
