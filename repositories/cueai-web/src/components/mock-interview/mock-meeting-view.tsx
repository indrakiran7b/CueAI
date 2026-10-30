"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Play, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MockInterviewResults } from "@/components/mock-interview/mock-interview-report";
import type { MockInterviewPublic } from "@/lib/mock-interview-types";
import type { MeetingRecord } from "@/lib/meetings-catalog";
import { withDesktopParam } from "@/lib/desktop-query";
import { mockInterviewHref } from "@/lib/mock-interview-route";

/** Meeting summary for a mock interview. The interview itself runs on the Mock Interview page. */
export function MockMeetingView({
  meeting,
  initial,
  viewerEmail,
}: {
  meeting: MeetingRecord;
  initial: MockInterviewPublic;
  viewerEmail?: string;
}) {
  const [mock, setMock] = useState(initial);
  const inProgress = mock.status === "active" && !mock.report;
  const started = new Date(mock.startedAt);
  const dateLabel = Number.isNaN(started.getTime())
    ? meeting.time
    : started.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  const ownerLabel =
    meeting.owner && meeting.owner.email !== viewerEmail ? meeting.owner.name || meeting.owner.email : null;
  const answered = mock.turns.filter((t) => t.answer && !t.skipped).length;
  const practiceHref = mockInterviewHref({ practice: meeting.id });
  const continueHref = mockInterviewHref({ session: meeting.id });

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant="info" className="mb-2">
            Mock Interview Summary
          </Badge>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{meeting.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {dateLabel}
            {!inProgress && ` · ${meeting.duration}`}
            {` · ${answered} of ${mock.turns.length} question${mock.turns.length === 1 ? "" : "s"} answered`}
            {ownerLabel ? ` · ${ownerLabel}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mock.isOwner && !inProgress && (
            <Link href={withDesktopParam(practiceHref)}>
              <Button variant="gradient" size="sm">
                <RotateCcw className="h-3.5 w-3.5" />
                Practice again
              </Button>
            </Link>
          )}
          <Link href={withDesktopParam("/meetings")}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to meetings
            </Button>
          </Link>
        </div>
      </div>

      {inProgress ? (
        <Card glow className="space-y-3 p-6">
          <p className="text-sm text-muted">
            This mock interview is still in progress. The summary appears here once the interview ends.
          </p>
          {mock.isOwner && (
            <Link href={withDesktopParam(continueHref)}>
              <Button variant="primary" size="sm">
                <Play className="h-3.5 w-3.5" />
                Continue in Mock Interview
              </Button>
            </Link>
          )}
        </Card>
      ) : (
        <MockInterviewResults meetingId={meeting.id} mock={mock} onUpdated={setMock} />
      )}
    </div>
  );
}
