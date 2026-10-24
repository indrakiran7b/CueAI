/**
 * Browser client for /api/live/answer — the one answer pipeline behind Live Session
 * (Regular Interview, the overlay, and Test CueAI). Streams tokens over SSE and falls
 * back to the JSON reply when the server answers without streaming.
 */

import { LIVE_HISTORY_MAX, type LiveExchange, type LiveTranscriptLine } from "@/lib/live-answer";

export type LiveAnswerReply = { answer: string; model?: string; provider?: string };

export class LiveAnswerRequestError extends Error {
  retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.name = "LiveAnswerRequestError";
    this.retryable = retryable;
  }
}

/** Briefing saved by the last Create Session (company, job description, resume) as answer context. */
export async function loadLiveSessionContext(): Promise<string> {
  try {
    const res = await fetch("/api/live/briefing", { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as {
      briefing?: {
        company?: string;
        jobDescription?: string;
        resumeName?: string;
        resumeText?: string;
        description?: string;
      } | null;
    };
    const b = data.briefing;
    if (!b?.resumeText && !b?.jobDescription && !b?.company) return "";
    return [
      b.company ? `Interview at: ${b.company}` : "",
      b.jobDescription ? `Job description:\n${b.jobDescription}` : "",
      b.resumeName ? `Resume on file: ${b.resumeName}` : "",
      b.resumeText ? `CANDIDATE RESUME:\n${b.resumeText}` : "",
      b.description ? `Context:\n${b.description}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  } catch {
    return "";
  }
}

function errorText(data: unknown, fallback: string): string {
  const err = (data as { error?: unknown } | null)?.error;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return fallback;
}

export async function requestLiveAnswer(input: {
  prompt: string;
  transcript?: LiveTranscriptLine[];
  /** Earlier questions and answers in this session, so follow-ups keep their context. */
  history?: LiveExchange[];
  /** Test CueAI: same answer pipeline, but nothing is read from or written to a live meeting. */
  test?: boolean;
  signal?: AbortSignal;
  /** Called with the full answer so far on every streamed token. */
  onText?: (full: string) => void;
}): Promise<LiveAnswerReply> {
  const sessionContext = await loadLiveSessionContext();
  const res = await fetch("/api/live/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    signal: input.signal,
    body: JSON.stringify({
      prompt: input.prompt,
      transcript: input.transcript ?? [],
      history: (input.history ?? []).slice(-LIVE_HISTORY_MAX),
      sessionContext,
      stream: true,
      mode: "answer",
      ...(input.test ? { test: true } : {}),
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new LiveAnswerRequestError(
      errorText(data, "Unable to generate an answer. Check AI configuration and try again."),
      res.status !== 400 && res.status !== 401,
    );
  }

  const type = res.headers.get("content-type") || "";
  if (!type.includes("text/event-stream") || !res.body) {
    const data = (await res.json().catch(() => null)) as { answer?: string; model?: string; provider?: string } | null;
    if (!data?.answer) throw new LiveAnswerRequestError(errorText(data, "Could not generate an answer."));
    input.onText?.(data.answer);
    return { answer: data.answer, model: data.model, provider: data.provider };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let model: string | undefined;
  let provider: string | undefined;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      let evt: { type?: string; text?: string; answer?: string; model?: string; provider?: string; error?: string; retryable?: boolean };
      try {
        evt = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      if (evt.type === "error") throw new LiveAnswerRequestError(evt.error || "The answer stream failed.", evt.retryable !== false);
      if (evt.type === "token" && evt.text) {
        full += evt.text;
        input.onText?.(full);
      }
      if (evt.type === "done") {
        if (evt.answer) full = evt.answer;
        model = evt.model;
        provider = evt.provider;
      }
    }
  }
  if (!full.trim()) throw new LiveAnswerRequestError("The AI returned an empty answer.");
  input.onText?.(full.trim());
  return { answer: full.trim(), model, provider };
}
