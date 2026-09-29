/**
 * Fire-and-forget persistence of live meeting events to the web store.
 * Never blocks the AI answer path.
 */

let apiBase = "http://127.0.0.1:3000";

export function configureMeetingPersist(base: string) {
  if (base) apiBase = base.replace(/\/$/, "");
}

function postEvent(body: Record<string, unknown>) {
  void fetch(`${apiBase}/api/live/meeting-event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch((err) => {
    console.error("[MEETING] Persist failed", err instanceof Error ? err.message : err);
  });
}

export function persistTranscriptLine(input: {
  who: string;
  text: string;
  source?: "system" | "microphone" | "screen" | "user" | "cueai";
  meetingId?: string | null;
}) {
  const text = input.text.trim();
  if (!text) return;
  console.log("[MEETING] Transcript event saved (queued)", {
    who: input.who,
    chars: text.length,
  });
  postEvent({
    type: "transcript",
    who: input.who,
    text,
    source: input.source,
    meetingId: input.meetingId || undefined,
  });
}

export function persistMeetingExchange(input: {
  prompt: string;
  answer: string;
  provider?: string;
  model?: string;
  latencyMs?: number;
  source?: "auto" | "manual" | "screen";
  questionWho?: string;
  status?: "ok" | "failed";
  meetingId?: string | null;
}) {
  const prompt = input.prompt.trim();
  if (!prompt) return;
  console.log("[MEETING] Question/Answer saved (queued)", {
    provider: input.provider,
    source: input.source,
  });
  postEvent({
    type: "exchange",
    prompt,
    answer: input.answer,
    provider: input.provider,
    model: input.model,
    latencyMs: input.latencyMs,
    source: input.source || "auto",
    questionWho: input.questionWho || "Interviewer",
    status: input.status || "ok",
    meetingId: input.meetingId || undefined,
  });
}

export function persistFailedQuestion(input: {
  prompt: string;
  questionWho?: string;
  meetingId?: string | null;
}) {
  const prompt = input.prompt.trim();
  if (!prompt) return;
  postEvent({
    type: "question",
    prompt,
    questionWho: input.questionWho || "Interviewer",
    meetingId: input.meetingId || undefined,
  });
}
