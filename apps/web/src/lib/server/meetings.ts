import { randomUUID } from "node:crypto";
import { readStore, updateStore, type DbMeeting, type DbMeetingLine } from "@/lib/server/db";

export function publicMeeting(m: DbMeeting, includePrivate = false) {
  return {
    id: m.id,
    title: m.title,
    kind: m.kind,
    status: m.status,
    startedAt: m.startedAt,
    endedAt: m.endedAt || null,
    durationSec: m.durationSec,
    attendees: m.attendees,
    tags: m.tags,
    company: m.company || null,
    jobLink: m.jobLink || null,
    resumeName: m.resumeName || null,
    description: m.description || null,
    transcript: m.transcript,
    answers: m.answers,
    summary: m.summary || null,
    ...(includePrivate
      ? { jobDescription: m.jobDescription || null, resumeText: m.resumeText || null }
      : {}),
  };
}

export async function listMeetings() {
  const store = await readStore();
  return (store.meetings || []).slice().sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function listMeetingsForUser(userId: string) {
  const all = await listMeetings();
  return all.filter((m) => m.userId === userId);
}

export async function getMeeting(id: string) {
  const store = await readStore();
  return (store.meetings || []).find((m) => m.id === id) || null;
}

export async function getMeetingForUser(id: string, userId: string) {
  const meeting = await getMeeting(id);
  if (!meeting || meeting.userId !== userId) return null;
  return meeting;
}

export async function getActiveMeeting() {
  const store = await readStore();
  if (store.activeMeetingId) {
    const found = (store.meetings || []).find((m) => m.id === store.activeMeetingId);
    if (found) return found;
  }
  return (store.meetings || []).find((m) => m.status === "live") || null;
}

export type LiveBriefing = {
  kind?: "interview" | "regular";
  company?: string;
  jobDescription?: string;
  jobLink?: string;
  resumeName?: string;
  resumeText?: string;
  description?: string;
  updatedAt: string;
};

export async function getLiveBriefing(): Promise<LiveBriefing | null> {
  const store = await readStore();
  return store.liveBriefing || null;
}

export async function saveLiveBriefing(partial: Partial<LiveBriefing>) {
  const now = new Date().toISOString();
  await updateStore(async (s) => {
    const prev = s.liveBriefing || { updatedAt: now };
    s.liveBriefing = {
      ...prev,
      ...Object.fromEntries(
        Object.entries(partial).filter(([, v]) => v !== undefined && v !== ""),
      ),
      resumeText: partial.resumeText?.trim()
        ? partial.resumeText.trim().slice(0, 20000)
        : prev.resumeText,
      updatedAt: now,
    };
  });
  return getLiveBriefing();
}

export async function resolveAnswerBriefing() {
  const [meeting, briefing] = await Promise.all([getActiveMeeting(), getLiveBriefing()]);
  return {
    meeting,
    briefing: {
      kind: meeting?.kind || briefing?.kind || "interview",
      company: meeting?.company || briefing?.company,
      jobDescription: meeting?.jobDescription || briefing?.jobDescription,
      jobLink: meeting?.jobLink || briefing?.jobLink,
      resumeName: meeting?.resumeName || briefing?.resumeName,
      resumeText: meeting?.resumeText || briefing?.resumeText,
      description: meeting?.description || briefing?.description,
      callTitle: meeting?.title,
    },
  };
}

export async function createMeeting(input: {
  title: string;
  kind: "interview" | "regular";
  userId?: string;
  company?: string;
  jobDescription?: string;
  jobLink?: string;
  resumeName?: string;
  resumeText?: string;
  description?: string;
  tags?: string[];
}): Promise<DbMeeting> {
  const now = new Date().toISOString();
  const existing = await getLiveBriefing();
  const meeting: DbMeeting = {
    id: `mtg_${randomUUID().slice(0, 10)}`,
    workspaceId: "",
    userId: input.userId,
    title: input.title.slice(0, 160),
    kind: input.kind,
    status: "live",
    startedAt: now,
    durationSec: 0,
    attendees: 1,
    tags: input.tags?.length ? input.tags : input.kind === "interview" ? ["Interview"] : ["Call"],
    company: input.company?.trim() || undefined,
    jobDescription: input.jobDescription?.trim() || undefined,
    jobLink: input.jobLink?.trim() || undefined,
    resumeName: input.resumeName?.trim() || existing?.resumeName,
    resumeText: input.resumeText?.trim()?.slice(0, 20000) || existing?.resumeText,
    description: input.description?.trim() || undefined,
    transcript: [],
    answers: [],
  };

  await updateStore(async (s) => {
    if (!s.meetings) s.meetings = [];
    meeting.workspaceId = s.workspace.id;
    s.meetings.unshift(meeting);
    s.meetings = s.meetings.slice(0, 200);
    s.activeMeetingId = meeting.id;
    s.liveBriefing = {
      ...(s.liveBriefing || { updatedAt: now }),
      kind: meeting.kind,
      company: meeting.company,
      jobDescription: meeting.jobDescription,
      jobLink: meeting.jobLink,
      resumeName: meeting.resumeName,
      resumeText: meeting.resumeText || s.liveBriefing?.resumeText,
      description: meeting.description,
      updatedAt: now,
    };
  });

  return meeting;
}

function transcriptEventKey(line: { who: string; text: string; at?: string }) {
  return `${line.who}\0${line.text}\0${line.at || ""}`;
}

export async function appendMeetingExchange(
  meetingId: string,
  prompt: string,
  answer: string,
) {
  const now = new Date().toISOString();
  const clippedPrompt = prompt.slice(0, 2000);
  const clippedAnswer = answer.slice(0, 4000);
  await updateStore(async (s) => {
    const meeting = (s.meetings || []).find((m) => m.id === meetingId);
    if (!meeting) return;
    const duplicate = meeting.answers.some(
      (row) =>
        row.prompt === clippedPrompt &&
        row.answer === clippedAnswer &&
        Math.abs(Date.parse(row.at) - Date.parse(now)) < 8000,
    );
    if (duplicate) return;
    meeting.answers.unshift({
      prompt: clippedPrompt,
      answer: clippedAnswer,
      at: now,
    });
    meeting.answers = meeting.answers.slice(0, 80);
  });
}

export async function finalizeMeeting(
  meetingId: string,
  patch: {
    durationSec?: number;
    transcript?: DbMeetingLine[];
    summary?: string;
  },
) {
  await updateStore(async (s) => {
    const meeting = (s.meetings || []).find((m) => m.id === meetingId);
    if (!meeting) return;
    meeting.status = "summary";
    meeting.endedAt = new Date().toISOString();
    if (typeof patch.durationSec === "number") meeting.durationSec = Math.max(0, patch.durationSec);
    if (patch.transcript?.length) {
      const seen = new Set(meeting.transcript.map(transcriptEventKey));
      for (const line of patch.transcript) {
        const key = transcriptEventKey(line);
        if (seen.has(key)) continue;
        seen.add(key);
        meeting.transcript.push(line);
      }
      meeting.transcript = meeting.transcript.slice(-200);
    }
    if (patch.summary) meeting.summary = patch.summary.slice(0, 4000);
    if (s.activeMeetingId === meetingId) s.activeMeetingId = null;
  });
}
