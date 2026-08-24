"use client";

import { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Languages,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { actionItems } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const BASE_EMAIL = `Hi team — thanks for a focused sync. We locked Phase 1/2 scope for Companion, confirmed the 800ms latency budget, and kept Screen Context opt-in. Action items and owners are listed below. Reply if anything looks off.`;

export default function MeetingSummaryPage() {
  const [emailBody, setEmailBody] = useState(BASE_EMAIL);
  const [copied, setCopied] = useState(false);
  const [regenCount, setRegenCount] = useState(0);

  async function copyEmail() {
    const full = `Subject: Notes from Q3 Product Sync\n\n${emailBody}`;
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  function regenerateEmail() {
    const next = regenCount + 1;
    setRegenCount(next);
    setEmailBody(
      `${BASE_EMAIL}\n\n(Updated draft v${next + 1}) Please also review the open risks section before sending.`
    );
    setCopied(false);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant="info" className="mb-2">
            Summary ready
          </Badge>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Q3 Product Sync
          </h1>
          <p className="mt-1 text-sm text-muted">
            Today · 42 min · 8 attendees · Generated in 18s
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
              Conversation feed
            </Button>
          </Link>
        </div>
      </div>

      <Card glow className="p-6">
        <CardTitle className="mb-3">Executive summary</CardTitle>
        <p className="text-sm leading-relaxed text-muted">
          The team aligned on a three-phase enterprise rollout for CueAI Companion.
          Latency SLOs were set at p95 under 800ms for live suggestions. Screen Context
          will remain opt-in with explicit privacy controls. SSO / SCIM is deferred to
          Phase 3 pending Security review.
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <CardHeader>
            <CardTitle>Key decisions</CardTitle>
          </CardHeader>
          <ul className="space-y-3">
            {[
              "Ship Companion glass panel in two sprints",
              "Keep Screen Context opt-in for enterprise",
              "Defer deep RAG when confidence < 0.7",
            ].map((d) => (
              <li key={d} className="flex gap-2 text-sm text-foreground/90">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-400" />
                {d}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <CardHeader>
            <div>
              <CardTitle>Risks & open questions</CardTitle>
              <CardDescription>Needs follow-up</CardDescription>
            </div>
          </CardHeader>
          <ul className="space-y-3">
            <li className="flex gap-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <span>
                <span className="font-medium text-amber-300">Risk · </span>
                <span className="text-muted">
                  Latency may spike on low-bandwidth enterprise VPNs.
                </span>
              </span>
            </li>
            <li className="flex gap-2 text-sm">
              <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
              <span>
                <span className="font-medium text-violet-300">Question · </span>
                <span className="text-muted">
                  Which region locks are required for EU workspaces?
                </span>
              </span>
            </li>
          </ul>
        </Card>
      </div>

      <Card className="p-5">
        <CardHeader>
          <CardTitle>Action items</CardTitle>
          <Badge>{actionItems.filter((a) => a.status === "open").length} open</Badge>
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
              {actionItems.map((item) => (
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

      <Card className="p-5">
        <CardTitle className="mb-3">Follow-up email draft</CardTitle>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)]/50 p-4 text-sm leading-relaxed text-muted">
          <p className="text-foreground">Subject: Notes from Q3 Product Sync</p>
          <p className="mt-3 whitespace-pre-wrap">{emailBody}</p>
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="primary" onClick={() => void copyEmail()}>
            {copied ? "Copied" : "Copy email"}
          </Button>
          <Button size="sm" variant="ghost" onClick={regenerateEmail}>
            Regenerate
          </Button>
        </div>
      </Card>
    </div>
  );
}
