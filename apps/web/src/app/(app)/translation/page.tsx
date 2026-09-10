"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Languages, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Tabs } from "@/components/ui/misc";
import { fetchMeeting } from "@/lib/meetings-client";
import type { MeetingRecord } from "@/lib/meetings-catalog";
import { listMeetings } from "@/lib/meetings-catalog";
import { cn } from "@/lib/utils";

const languages = [
  { id: "en", label: "English" },
  { id: "hi", label: "Hindi" },
  { id: "te", label: "Telugu" },
] as const;

type LangId = (typeof languages)[number]["id"];

function localizedLine(meeting: MeetingRecord, lang: LangId) {
  return meeting.transcript.map((line) => ({
    id: line.id,
    speaker: line.speaker,
    role: line.role,
    time: line.time,
    original: line.text,
    translated:
      lang === "hi" ? line.textHi : lang === "te" ? line.textTe : line.text,
  }));
}

function localizedAnswers(meeting: MeetingRecord, lang: LangId) {
  return meeting.aiAnswers.map((a) => ({
    id: a.id,
    originalQ: a.question,
    originalA: a.answer,
    question:
      lang === "hi" ? a.questionHi : lang === "te" ? a.questionTe : a.question,
    answer: lang === "hi" ? a.answerHi : lang === "te" ? a.answerTe : a.answer,
    pinned: a.pinned,
  }));
}

function localizedSummary(meeting: MeetingRecord, lang: LangId) {
  if (lang === "hi") return meeting.executiveSummaryHi;
  if (lang === "te") return meeting.executiveSummaryTe;
  return meeting.executiveSummary;
}

function TranslationContent() {
  const searchParams = useSearchParams();
  const meetingId = (searchParams.get("meetingId") || "").trim();

  const [lang, setLang] = useState<LangId>("hi");
  const [bilingual, setBilingual] = useState(true);
  const [mode, setMode] = useState("live");
  const [copied, setCopied] = useState(false);
  const [meeting, setMeeting] = useState<MeetingRecord | null>(null);
  const [loading, setLoading] = useState(Boolean(meetingId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!meetingId) {
      setMeeting(null);
      setLoading(false);
      setError(null);
      return;
    }

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

  const transcriptLines = useMemo(
    () => (meeting ? localizedLine(meeting, lang) : []),
    [meeting, lang]
  );
  const answers = useMemo(
    () => (meeting ? localizedAnswers(meeting, lang) : []),
    [meeting, lang]
  );
  const summaryText = meeting ? localizedSummary(meeting, lang) : "";

  async function copyTranslation() {
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  if (!meetingId) {
    const meetings = listMeetings();
    return (
      <div className="mx-auto max-w-5xl space-y-6 animate-fade-up">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Translation
          </h1>
          <p className="mt-1 text-sm text-muted">
            Choose a meeting to view its transcript and AI responses in English, Hindi, or Telugu.
          </p>
        </div>
        <Card className="p-6">
          <p className="mb-4 text-sm text-muted">
            No meeting is selected. Open Translation from a meeting summary, or pick a meeting below.
          </p>
          <ul className="space-y-2">
            {meetings.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/translation?meetingId=${encodeURIComponent(m.id)}`}
                  className="flex items-center justify-between rounded-xl border border-[var(--border)] px-4 py-3 text-sm transition hover:border-teal-500/30 hover:bg-teal-500/5"
                >
                  <span className="font-medium">{m.title}</span>
                  <span className="text-xs text-subtle">{m.id}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
        Loading meeting translation…
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
          {error || "No meeting exists for this ID."} Requested ID:{" "}
          <code className="text-primary">{meetingId}</code>
        </p>
        <div className="flex justify-center gap-2">
          <Link href="/meetings">
            <Button variant="outline">Back to meetings</Button>
          </Link>
          <Link href="/translation">
            <Button variant="ghost">Pick another meeting</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Translation
          </h1>
          <p className="mt-1 text-sm text-muted">
            {meeting.title} · bilingual transcripts and AI responses in English, Hindi, and Telugu.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/meetings/${encodeURIComponent(meeting.id)}/summary`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-3.5 w-3.5" />
              Summary
            </Button>
          </Link>
          <Link href={`/meetings/${encodeURIComponent(meeting.id)}/feed`}>
            <Button variant="outline" size="sm">
              <MessageSquare className="h-3.5 w-3.5" />
              Conversation feed
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          tabs={[
            { id: "live", label: "Live transcript" },
            { id: "ai", label: "AI responses" },
            { id: "summary", label: "Summary" },
          ]}
          active={mode}
          onChange={setMode}
        />
        <label className="ml-auto flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={bilingual}
            onChange={(e) => setBilingual(e.target.checked)}
            className="rounded"
          />
          Bilingual mode
        </label>
      </div>

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Languages className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Target language</span>
          <div className="flex gap-1.5">
            {languages.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLang(l.id)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm transition",
                  lang === l.id
                    ? "border-teal-500/30 bg-[var(--primary-muted)] text-primary"
                    : "border-[var(--border)] text-muted hover:text-foreground"
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
          <Badge variant="purple" className="ml-auto">
            Meeting {meeting.id}
          </Badge>
        </div>

        {mode === "live" && (
          <div className="space-y-3">
            {transcriptLines.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                This meeting has no transcript lines to translate.
              </p>
            ) : (
              transcriptLines.map((line) => (
                <div
                  key={line.id}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--background)]/40 p-4"
                >
                  {bilingual && lang !== "en" && (
                    <p className="text-sm text-muted">{line.original}</p>
                  )}
                  <p
                    className={cn(
                      "text-sm font-medium text-foreground",
                      bilingual && lang !== "en" && "mt-2"
                    )}
                  >
                    {line.translated}
                  </p>
                  <p className="mt-2 text-[11px] text-subtle">
                    {line.speaker} · {line.role} · {line.time} · Transcript
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {mode === "ai" && (
          <div className="space-y-3">
            {answers.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                No AI responses were recorded for this meeting.
              </p>
            ) : (
              answers.map((a) => (
                <div
                  key={a.id}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--background)]/40 p-4"
                >
                  {bilingual && lang !== "en" && (
                    <>
                      <p className="text-xs uppercase tracking-wider text-subtle">
                        Question
                      </p>
                      <p className="mt-1 text-sm text-muted">{a.originalQ}</p>
                      <p className="mt-3 text-xs uppercase tracking-wider text-subtle">
                        Answer
                      </p>
                      <p className="mt-1 text-sm text-muted">{a.originalA}</p>
                    </>
                  )}
                  <p
                    className={cn(
                      "text-sm font-semibold text-foreground",
                      bilingual && lang !== "en" && "mt-3"
                    )}
                  >
                    {a.question}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/90">
                    {a.answer}
                  </p>
                  <p className="mt-2 text-[11px] text-subtle">
                    AI answer{a.pinned ? " · Pinned" : ""}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {mode === "summary" && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)]/40 p-4">
            {bilingual && lang !== "en" && (
              <p className="mb-3 text-sm text-muted">{meeting.executiveSummary}</p>
            )}
            <p className="text-sm leading-relaxed text-foreground/90">{summaryText}</p>
          </div>
        )}
      </Card>

      {mode === "summary" && (
        <Card className="p-5">
          <CardTitle className="mb-3">Translated summary</CardTitle>
          <p className="text-sm leading-relaxed text-muted">{summaryText}</p>
          <Button
            className="mt-4"
            size="sm"
            variant="outline"
            onClick={() => void copyTranslation()}
          >
            {copied ? "Copied" : "Copy translation"}
          </Button>
        </Card>
      )}
    </div>
  );
}

export default function TranslationPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
          Loading translation…
        </div>
      }
    >
      <TranslationContent />
    </Suspense>
  );
}
