"use client";

import { useCallback, useEffect, useState } from "react";
import { MockInterviewMode } from "@/components/mock-interview/mock-interview-mode";
import { persistDesktopQuery } from "@/lib/desktop-query";
import "../meetings/live/live-session.css";

function setQuery(params: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  window.history.replaceState(null, "", url.toString());
}

/**
 * Structured interview practice. Opening this page never starts a live meeting or the desktop
 * overlay: a mock interview record is created only when the user presses Start.
 */
export default function MockInterviewPage() {
  const [ready, setReady] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [practiceId, setPracticeId] = useState<string | null>(null);

  useEffect(() => {
    persistDesktopQuery();
    const params = new URLSearchParams(window.location.search);
    queueMicrotask(() => {
      setSessionId(params.get("session") || params.get("mock"));
      setPracticeId(params.get("practice"));
      if (params.get("mock")) setQuery({ mock: null, session: params.get("mock") });
      if (params.get("practice")) setQuery({ practice: null });
      setReady(true);
    });
  }, []);

  const onSessionChange = useCallback((id: string | null) => setQuery({ session: id }), []);

  return (
    <div data-live className="mx-auto max-w-6xl space-y-6 py-6 text-center animate-fade-up">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Mock Interview</h1>
        <p className="mt-2 text-sm text-muted">
          Practice with an AI interviewer. Questions come from your resume and target role; results are saved to Meetings Summary.
        </p>
      </div>
      {ready ? (
        <MockInterviewMode active sessionId={sessionId} practiceId={practiceId} onSessionChange={onSessionChange} />
      ) : (
        <div className="mx-auto h-40 max-w-xl animate-pulse rounded-2xl bg-[var(--surface-active)]" />
      )}
    </div>
  );
}
