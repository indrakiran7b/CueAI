/**
 * Live answers from the CueAI web API (Gemini-backed).
 *
 * The overlay renders on its own origin, so this talks to the embedded Next
 * server over HTTP the same way transcription does.
 */

export type LiveTranscriptLine = { who: string; text: string };

export type LiveAnswer = {
  answer: string;
  confidence: number;
  model: string;
};

let apiBase = "http://127.0.0.1:3000";

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
      return "";
    }
    const b = data.briefing;
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
      body: JSON.stringify({ prompt, transcript, sessionContext, image }),
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
      data.error || "Gemini is not configured. Add GEMINI_API_KEY on the server.",
    );
  }
  if (!res.ok || !data.answer) {
    throw new LiveAnswerUnavailable(data.error || "Gemini could not answer that. Try again.");
  }

  return {
    answer: data.answer,
    confidence: typeof data.confidence === "number" ? data.confidence : 0.7,
    model: data.model || "gemini",
  };
}
