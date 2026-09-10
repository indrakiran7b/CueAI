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
