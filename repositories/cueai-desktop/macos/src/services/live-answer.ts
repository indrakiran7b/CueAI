/**
 * Live answers from the CueAI web API (Groq primary, Gemini fallback).
 *
 * The overlay renders on its own origin, so this talks to the embedded Next
 * server over HTTP the same way transcription does.
 */

import { deviceAuthHeaders } from "../../../shared/device-auth-headers";

export type LiveTranscriptLine = { who: string; text: string };

export type LiveAnswer = {
  answer: string;
  confidence: number;
  model: string;
};

let apiBase = "http://127.0.0.1:3002";
let cachedSessionContext = "";
let cachedSessionAt = 0;
const SESSION_CACHE_MS = 30_000;

export function configureAnswerApi(base: string) {
  if (base) apiBase = base.replace(/\/$/, "");
}

export type LiveAnswerHealth = {
  status: string;
  liveAnswer: "ready" | "unavailable" | string;
  mode?: string;
  fastapi?: string;
  error?: string;
};

export async function probeLiveAnswerHealth(): Promise<LiveAnswerHealth> {
  try {
    const res = await fetch(`${apiBase}/api/live/health`, {
      cache: "no-store",
      headers: await deviceAuthHeaders(),
    });
    const data = (await res.json().catch(() => ({}))) as LiveAnswerHealth;
    if (res.ok && data.liveAnswer === "ready") {
      return { ...data, liveAnswer: "ready" };
    }
    return {
      status: "unavailable",
      liveAnswer: "unavailable",
      error: "CueAI live answers are unavailable. Start the web app, then retry.",
    };
  } catch {
    return {
      status: "unavailable",
      liveAnswer: "unavailable",
      error: "CueAI server unreachable. Is the web app running?",
    };
  }
}

export class LiveAnswerUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiveAnswerUnavailable";
  }
}

async function loadSessionContext() {
  const now = Date.now();
  if (now - cachedSessionAt < SESSION_CACHE_MS) return cachedSessionContext;
  try {
    const res = await fetch(`${apiBase}/api/live/briefing`, {
      cache: "no-store",
      headers: await deviceAuthHeaders(),
    });
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
    cachedSessionContext = [
      b.company ? `Interview at: ${b.company}` : "",
      b.jobDescription ? `Job description:\n${String(b.jobDescription).slice(0, 800)}` : "",
      b.resumeName ? `Resume on file: ${b.resumeName}` : "",
      b.resumeText ? `CANDIDATE RESUME:\n${String(b.resumeText).slice(0, 1600)}` : "",
      b.description ? `Context:\n${String(b.description).slice(0, 400)}` : "",
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
      headers: { "Content-Type": "application/json", ...(await deviceAuthHeaders()) },
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
  onConnected?: () => void;
  signal?: AbortSignal;
  /** Earlier question/answer pairs from this session, oldest first. */
  history?: { question: string; answer: string }[];
  /** The transcript was flagged low-confidence by STT. */
  uncertain?: boolean;
};

function needsLiveKnowledge(question: string) {
  const q = question.toLowerCase();
  return /\b((my|our|this|the)\s+)?(project|resume|experience|background|company|knowledge base|codebase|policy|onboarding|handbook|document|wiki)\b|\b(i|we)\s+(used|built|implemented|worked)\b/.test(
    q,
  );
}

export async function requestLiveAnswerStream(
  prompt: string,
  transcript: LiveTranscriptLine[] = [],
  handlers: StreamLiveAnswerHandlers = {},
): Promise<LiveAnswer> {
  const sessionContext = await loadSessionContext();
  let res: Response;
  try {
    res = await fetch(`${apiBase}/api/live/answer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...(await deviceAuthHeaders()),
      },
      signal: handlers.signal,
      body: JSON.stringify({
        prompt,
        transcript: transcript.slice(-6),
        history: handlers.history?.length ? handlers.history : undefined,
        uncertain: handlers.uncertain || undefined,
        sessionContext,
        stream: true,
        mode: "answer",
        skipKnowledge: !needsLiveKnowledge(prompt),
      }),
    });
  } catch (err) {
    if (handlers.signal?.aborted) throw err;
    throw new LiveAnswerUnavailable("CueAI server unreachable. Is the web app running?");
  }

  handlers.onConnected?.();
  const contentType = res.headers.get("content-type") || "";
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new LiveAnswerUnavailable(data.error || "Could not generate an answer.");
  }

  if (!contentType.includes("text/event-stream") || !res.body) {
    const data = (await res.json().catch(() => ({}))) as {
      answer?: string;
      confidence?: number;
      model?: string;
    };
    if (!data.answer) throw new LiveAnswerUnavailable("Could not generate an answer.");
    handlers.onToken?.(data.answer, data.answer);
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
        };
        if (evt.type === "error") throw new LiveAnswerUnavailable(evt.error || "Stream failed.");
        if (evt.type === "token" && evt.text) {
          full += evt.text;
          handlers.onToken?.(evt.text, full);
        }
        if (evt.type === "done") {
          if (evt.answer) full = evt.answer;
          if (typeof evt.confidence === "number") confidence = evt.confidence;
          if (evt.model) model = evt.model;
        }
      } catch (err) {
        if (err instanceof LiveAnswerUnavailable) throw err;
      }
    }
  }

  if (!full.trim()) throw new LiveAnswerUnavailable("Could not generate an answer.");
  return { answer: full, confidence, model };
}
