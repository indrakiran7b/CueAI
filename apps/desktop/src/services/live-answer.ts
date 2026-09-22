/**
 * Live answers from the CueAI web API (Groq primary, Gemini fallback).
 * Supports streaming SSE for ~2–3s overlay latency targets.
 */

import { createLatencyTracker, pipelineLog } from "./pipeline-log";

export type LiveTranscriptLine = { who: string; text: string };

export type LiveAnswer = {
  answer: string;
  confidence: number;
  model: string;
};

let apiBase = "http://127.0.0.1:3000";
let cachedSessionContext = "";
let cachedSessionAt = 0;
const SESSION_CACHE_MS = 30_000;

export function configureAnswerApi(base: string) {
  if (base) apiBase = base.replace(/\/$/, "");
}

export class LiveAnswerUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiveAnswerUnavailable";
  }
}

async function loadSessionContext() {
  const now = Date.now();
  if (cachedSessionContext && now - cachedSessionAt < SESSION_CACHE_MS) {
    return cachedSessionContext;
  }
  try {
    const res = await fetch(`${apiBase}/api/live/briefing`, { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as {
      hasResume?: boolean;
      resumeName?: string;
      briefing?: {
        company?: string;
        jobDescription?: string;
        resumeName?: string;
        resumeText?: string;
        description?: string;
      } | null;
    };
    if (!data.briefing?.resumeText && !data.briefing?.jobDescription && !data.briefing?.company) {
      cachedSessionContext = "";
      cachedSessionAt = now;
      return "";
    }
    const b = data.briefing;
    // Cap resume text so prompt stays small for first-token latency.
    const resume = (b.resumeText || "").slice(0, 3500);
    cachedSessionContext = [
      b.company ? `Interview at: ${b.company}` : "",
      b.jobDescription ? `Job description:\n${String(b.jobDescription).slice(0, 1200)}` : "",
      b.resumeName ? `Resume on file: ${b.resumeName}` : "",
      resume ? `CANDIDATE RESUME:\n${resume}` : "",
      b.description ? `Context:\n${String(b.description).slice(0, 600)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    cachedSessionAt = now;
    return cachedSessionContext;
  } catch {
    return cachedSessionContext;
  }
}

/** Throws LiveAnswerUnavailable when the server has no Gemini key or is unreachable. */
export async function requestLiveAnswer(
  prompt: string,
  transcript: LiveTranscriptLine[] = [],
  image?: string,
): Promise<LiveAnswer> {
  const sessionContext = await loadSessionContext();
  let res: Response;
  try {
    res = await fetch(`${apiBase}/api/live/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        transcript,
        sessionContext,
        image,
        mode: image ? "screen" : undefined,
      }),
    });
  } catch {
    throw new LiveAnswerUnavailable("CueAI server unreachable. Is the web app running?");
  }

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    answer?: string;
    confidence?: number;
    model?: string;
    error?: string;
  };

  if (res.status === 503) {
    throw new LiveAnswerUnavailable(
      data.error || "Vision model is not ready yet. Wait a moment and press Screen again.",
    );
  }
  if (!res.ok || !data.answer) {
    throw new LiveAnswerUnavailable(data.error || "Could not analyze that. Try again.");
  }

  return {
    answer: data.answer,
    confidence: typeof data.confidence === "number" ? data.confidence : 0.7,
    model: data.model || "gemini",
  };
}

export type StreamLiveAnswerHandlers = {
  onToken?: (token: string, full: string) => void;
  signal?: AbortSignal;
};

/**
 * Stream a live answer over SSE. Falls back to non-stream JSON if the server
 * rejects streaming or returns a non-SSE body.
 */
export async function requestLiveAnswerStream(
  prompt: string,
  transcript: LiveTranscriptLine[] = [],
  handlers: StreamLiveAnswerHandlers = {},
): Promise<LiveAnswer> {
  const latency = createLatencyTracker(prompt);
  latency.mark("aiRequest");
  pipelineLog("ai", "Sending question", { chars: prompt.length });

  const sessionContext = await loadSessionContext();
  let res: Response;
  try {
    res = await fetch(`${apiBase}/api/live/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      signal: handlers.signal,
      body: JSON.stringify({
        prompt,
        transcript,
        sessionContext,
        stream: true,
        mode: "answer",
      }),
    });
  } catch (err) {
    if (handlers.signal?.aborted) throw err;
    throw new LiveAnswerUnavailable("CueAI server unreachable. Is the web app running?");
  }

  const contentType = res.headers.get("content-type") || "";
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.status === 503) {
      throw new LiveAnswerUnavailable(data.error || "AI provider is not configured.");
    }
    throw new LiveAnswerUnavailable(data.error || "Could not generate an answer.");
  }

  // Non-SSE fallback (older server / Gemini-only path).
  if (!contentType.includes("text/event-stream") || !res.body) {
    const data = (await res.json().catch(() => ({}))) as {
      answer?: string;
      confidence?: number;
      model?: string;
      error?: string;
    };
    if (!data.answer) {
      throw new LiveAnswerUnavailable(data.error || "Could not generate an answer.");
    }
    handlers.onToken?.(data.answer, data.answer);
    latency.mark("firstToken");
    latency.mark("answerVisible");
    latency.report("non_stream_answer");
    return {
      answer: data.answer,
      confidence: typeof data.confidence === "number" ? data.confidence : 0.7,
      model: data.model || "unknown",
    };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let confidence = 0.7;
  let model = "groq";
  let sawFirst = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n");
    buffer = chunks.pop() || "";
    for (const raw of chunks) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload) as {
          type?: string;
          text?: string;
          answer?: string;
          confidence?: number;
          model?: string;
          error?: string;
          provider?: string;
        };
        if (evt.type === "error") {
          throw new LiveAnswerUnavailable(evt.error || "Stream failed.");
        }
        if (evt.type === "token" && evt.text) {
          full += evt.text;
          if (!sawFirst) {
            sawFirst = true;
            latency.mark("firstToken");
            pipelineLog("response", "First token received", {
              ms: Math.round((latency.marks.firstToken || 0) - (latency.marks.aiRequest || 0)),
            });
          }
          handlers.onToken?.(evt.text, full);
        }
        if (evt.type === "done") {
          if (evt.answer) full = evt.answer;
          if (typeof evt.confidence === "number") confidence = evt.confidence;
          if (evt.model) model = evt.model;
          if (evt.provider === "gemini") {
            pipelineLog("fallback", "Answer served via Gemini fallback");
          }
        }
      } catch (err) {
        if (err instanceof LiveAnswerUnavailable) throw err;
      }
    }
  }

  if (!full.trim()) {
    throw new LiveAnswerUnavailable("Empty streamed answer.");
  }

  latency.mark("answerVisible");
  latency.report("stream_answer");
  return { answer: full.trim(), confidence, model };
}
