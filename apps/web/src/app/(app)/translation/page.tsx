"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Languages, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Tabs } from "@/components/ui/misc";
import { fetchMeeting, type StoredMeeting } from "@/lib/meetings-client";
import type { MeetingRecord } from "@/lib/meetings-catalog";
import {
  peekTranslation,
  translateTexts,
  type TranslateLang,
} from "@/lib/translate-client";
import { cn } from "@/lib/utils";

const languages = [
  { id: "en", label: "English" },
  { id: "hi", label: "Hindi" },
  { id: "te", label: "Telugu" },
] as const;

type LangId = (typeof languages)[number]["id"];

type RenderedText = {
  status: "loading" | "ok" | "error";
  text: string;
  error?: string;
};

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function displayTranslated(entry: RenderedText | undefined, original: string, lang: LangId) {
  if (entry?.status === "ok" && entry.text) return entry.text;
  if (entry?.status === "error") {
    return entry.error || "Translation failed.";
  }
  if (!original.trim()) return original;
  const peeked = peekTranslation(original, lang);
  if (peeked !== undefined) return peeked;
  return "Translating...";
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

  const [list, setList] = useState<StoredMeeting[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoaded, setListLoaded] = useState(false);
  const [rendered, setRendered] = useState<Record<string, RenderedText>>({});

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

  useEffect(() => {
    if (!meetingId || meeting?.status !== "live") return;
    const timer = window.setInterval(() => {
      void fetchMeeting(meetingId).then((result) => {
        if (result.ok) setMeeting(result.meeting);
      });
    }, 4000);
    return () => window.clearInterval(timer);
  }, [meetingId, meeting?.status]);

  useEffect(() => {
    if (meetingId) return;
    let active = true;
    void fetch("/api/meetings", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Unable to load meetings.");
        return res.json() as Promise<{ meetings?: StoredMeeting[] }>;
      })
      .then((data) => {
        if (!active) return;
        setList((data.meetings || []).filter((m) => m.status !== "live"));
        setListError(null);
      })
      .catch(() => {
        if (!active) return;
        setList([]);
        setListError("Unable to load meetings.");
      })
      .finally(() => {
        if (active) setListLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [meetingId]);

  const answers = useMemo(() => {
    if (!meeting) return [];
    return uniqueById(meeting.aiAnswers).map((a) => ({
      id: a.id,
      originalQ: a.question,
      originalA: a.answer,
      pinned: a.pinned,
    }));
  }, [meeting]);
  const transcriptLines = useMemo(() => {
    if (!meeting) return [];
    const answerBodies = new Set(answers.map((a) => a.originalA));
    return uniqueById(meeting.transcript)
      .filter((line) => !(line.speaker === "CueAI" && answerBodies.has(line.text)))
      .map((line) => ({
        id: line.id,
        speaker: line.speaker,
        role: line.role,
        time: line.time,
        original: line.text,
      }));
  }, [meeting, answers]);
  const summaryOriginal = meeting?.executiveSummary || "";

  useEffect(() => {
    if (!meeting) {
      setRendered({});
      return;
    }

    const jobs: { key: string; text: string }[] = [];
    for (const line of transcriptLines) {
      jobs.push({ key: `t:${line.id}`, text: line.original });
    }
    for (const answer of answers) {
      jobs.push({ key: `q:${answer.id}`, text: answer.originalQ });
      jobs.push({ key: `a:${answer.id}`, text: answer.originalA });
    }
    jobs.push({ key: "summary", text: meeting.executiveSummary || "" });

    const target = lang as TranslateLang;
    setRendered((prev) => {
      const next: Record<string, RenderedText> = {};
      for (const job of jobs) {
        const peeked = peekTranslation(job.text, target);
        if (peeked !== undefined) {
          next[job.key] = { status: "ok", text: peeked };
        } else if (prev[job.key]?.status === "ok" && prev[job.key]?.text) {
          next[job.key] = { status: "loading", text: prev[job.key].text };
        } else {
          next[job.key] = { status: "loading", text: "" };
        }
      }
      return next;
    });

    const controller = new AbortController();
    let cancelled = false;
    void translateTexts(
      jobs.map((job) => job.text),
      target,
      { signal: controller.signal },
    )
      .then((results) => {
        if (cancelled) return;
        setRendered(() => {
          const next: Record<string, RenderedText> = {};
          results.forEach((result, index) => {
            const key = jobs[index]?.key;
            if (!key) return;
            next[key] =
              result.status === "ok"
                ? { status: "ok", text: result.text }
                : {
                    status: "error",
                    text: "",
                    error: result.error || "Translation failed.",
                  };
          });
          return next;
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : "Translation failed.";
        setRendered((prev) => {
          const next = { ...prev };
          for (const job of jobs) {
            if (next[job.key]?.status !== "ok") {
              next[job.key] = { status: "error", text: "", error: message };
            }
          }
          return next;
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [meeting, lang, transcriptLines, answers]);

  const summaryText = displayTranslated(rendered.summary, summaryOriginal, lang);

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
          {listError && (
            <p className="text-sm text-[var(--cue-danger)]" role="alert">
              {listError}{" "}
              <button type="button" className="underline" onClick={() => window.location.reload()}>
                Try Again
              </button>
            </p>
          )}
          {listLoaded && !listError && list.length === 0 && (
            <p className="text-sm text-muted">No meetings yet.</p>
          )}
          <ul className="space-y-2">
            {list.map((m) => (
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
                    {displayTranslated(rendered[`t:${line.id}`], line.original, lang)}
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
                    {displayTranslated(rendered[`q:${a.id}`], a.originalQ, lang)}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/90">
                    {displayTranslated(rendered[`a:${a.id}`], a.originalA, lang)}
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
