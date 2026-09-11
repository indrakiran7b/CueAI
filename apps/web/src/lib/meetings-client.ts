import type { MeetingRecord } from "@/lib/meetings-catalog";

export type StoredMeeting = {
  id: string;
  title: string;
  kind: "interview" | "regular";
  status: "live" | "summary";
  startedAt: string;
  endedAt?: string | null;
  durationSec: number;
  attendees: number;
  tags: string[];
  company?: string | null;
  resumeName?: string | null;
  description?: string | null;
  transcript: { who: string; text: string; at?: string }[];
  answers: { prompt: string; answer: string; at: string }[];
  summary?: string | null;
};

export function formatMeetingWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today · ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · ${time}`;
}

export function formatDuration(sec: number) {
  if (!sec || sec < 60) return `${Math.max(1, Math.round(sec || 0))}s`;
  const m = Math.round(sec / 60);
  return `${m}m`;
}

export function parseDurationToSec(label: string) {
  const minutes = label.match(/(\d+)\s*m/i);
  if (minutes) return Number(minutes[1]) * 60;
  const seconds = label.match(/(\d+)\s*s/i);
  if (seconds) return Number(seconds[1]);
  return 0;
}

export function isMeetingRecord(value: unknown): value is MeetingRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<MeetingRecord>;
  return (
    typeof record.executiveSummary === "string" &&
    Array.isArray(record.aiAnswers) &&
    Array.isArray(record.keyDecisions)
  );
}

export function storedMeetingToRecord(meeting: StoredMeeting): MeetingRecord {
  const briefing =
    meeting.summary ||
    (meeting.kind === "interview"
      ? `Interview session${meeting.company ? ` at ${meeting.company}` : ""}${
          meeting.resumeName ? ` with ${meeting.resumeName}` : ""
        }. CueAI used the uploaded resume to draft speakable answers.`
      : meeting.description || "Live session notes.");

  const emailBody = [
    `Hi — notes from ${meeting.title}.`,
    meeting.company ? `Company: ${meeting.company}` : "",
    meeting.summary || "",
    meeting.answers.length
      ? `Q&A:\n${meeting.answers
          .slice(0, 6)
          .map((a) => `Q: ${a.prompt}\nA: ${a.answer}`)
          .join("\n\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    id: meeting.id,
    title: meeting.title,
    time: formatMeetingWhen(meeting.startedAt),
    duration: formatDuration(meeting.durationSec),
    attendees: meeting.attendees,
    status: meeting.status,
    tags: meeting.tags,
    executiveSummary: briefing,
    executiveSummaryHi: briefing,
    executiveSummaryTe: briefing,
    keyDecisions: [],
    risks: [],
    actionItems: [],
    transcript: meeting.transcript.map((line, index) => ({
      id: `${meeting.id}-t${index}`,
      speaker: line.who,
      role: line.who === "You" || line.who === "CueAI" ? line.who : "Participant",
      text: line.text,
      textHi: line.text,
      textTe: line.text,
      time: line.at ? formatMeetingWhen(line.at) : "",
      confidence: 1,
    })),
    aiAnswers: meeting.answers.map((answer, index) => ({
      id: `${meeting.id}-a${index}`,
      question: answer.prompt,
      questionHi: answer.prompt,
      questionTe: answer.prompt,
      answer: answer.answer,
      answerHi: answer.answer,
      answerTe: answer.answer,
      pinned: index === 0,
    })),
    emailSubject: `Notes from ${meeting.title}`,
    emailBody,
  };
}

export function asMeetingRecord(meeting: StoredMeeting | MeetingRecord): MeetingRecord {
  return isMeetingRecord(meeting) ? meeting : storedMeetingToRecord(meeting);
}

export type FetchMeetingResult =
  | { ok: true; meeting: MeetingRecord }
  | { ok: false; status: number; error: string };

/** Client fetch for a single meeting. Returns 404-shaped errors for unknown IDs. */
export async function fetchMeeting(id: string): Promise<FetchMeetingResult> {
  const trimmed = id.trim();
  if (!trimmed) {
    return { ok: false, status: 400, error: "Meeting ID is required." };
  }

  try {
    const res = await fetch(`/api/meetings/${encodeURIComponent(trimmed)}`, {
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as {
      meeting?: StoredMeeting | MeetingRecord;
      error?: string;
    };

    if (res.status === 404) {
      return { ok: false, status: 404, error: data.error || "Meeting not found" };
    }
    if (!res.ok || !data.meeting) {
      return {
        ok: false,
        status: res.status,
        error: data.error || "Failed to load meeting.",
      };
    }
    return { ok: true, meeting: asMeetingRecord(data.meeting) };
  } catch {
    return { ok: false, status: 0, error: "Unable to reach the meetings service." };
  }
}
