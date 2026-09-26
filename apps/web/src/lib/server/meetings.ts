import { randomUUID } from "node:crypto";
import {
  readStore,
  updateStore,
  type DbMeeting,
  type DbMeetingLine,
} from "@/lib/server/db";
import type { SessionPayload } from "@/lib/server/session";
import { normalizeRole } from "@/lib/roles";

/** Meetings that belong in the Meetings history page. */
export function isCompletedMeeting(m: DbMeeting): boolean {
  return m.status === "completed" || m.status === "summary";
}

export function isLiveMeeting(m: DbMeeting): boolean {
  return m.status === "live";
}

export function publicMeetingStatus(m: DbMeeting): "live" | "completed" | "incomplete" {
  if (m.status === "live") return "live";
  if (m.status === "incomplete") return "incomplete";
  return "completed";
}

export function publicMeeting(
  m: DbMeeting,
  includePrivate = false,
  includeTranscript = false,
) {
  return {
    id: m.id,
    title: m.title,
    kind: m.kind,
    status: publicMeetingStatus(m),
    startedAt: m.startedAt,
    endedAt: m.endedAt || null,
    durationSec: m.durationSec,
    attendees: m.attendees,
    tags: m.tags,
    company: m.company || null,
    jobLink: m.jobLink || null,
    resumeName: m.resumeName || null,
    description: m.description || null,
    transcript: includeTranscript ? m.transcript : [],
    transcriptLocked: !includeTranscript,
    transcriptLineCount: m.transcript.length,
    answers: m.answers,
    summary: m.summary || null,
    questionCount: m.answers.length,
    answerCount: m.answers.filter((a) => Boolean(a.answer?.trim())).length,
    ...(includePrivate
      ? { jobDescription: m.jobDescription || null, resumeText: m.resumeText || null }
      : {}),
  };
}

/** User-owned history; Admins/Managers can see workspace meetings without an owner. */
export function canAccessMeeting(
  meeting: DbMeeting,
  session: SessionPayload,
): boolean {
  if (meeting.workspaceId && meeting.workspaceId !== session.workspaceId) {
    return false;
  }
  if (meeting.userId) {
    if (meeting.userId === session.userId) return true;
    const role = normalizeRole(session.role);
    return role === "Admin" || role === "Manager";
  }
  const role = normalizeRole(session.role);
  return role === "Admin" || role === "Manager";
}

export async function listMeetings() {
  const store = await readStore();
  return (store.meetings || []).slice().sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function listMeetingsForUser(userId: string) {
  const all = await listMeetings();
  return all.filter((m) => m.userId === userId);
}

/** Completed history for the authenticated user (never includes live sessions). */
export async function listCompletedMeetingsForUser(session: SessionPayload) {
  const all = await listMeetings();
  return all.filter(
    (m) =>
      isCompletedMeeting(m) &&
      m.workspaceId === session.workspaceId &&
      m.userId === session.userId,
  );
}

export function buildMeetingSummary(meeting: DbMeeting): string {
  if (meeting.summary?.trim()) return meeting.summary.trim().slice(0, 4000);
  const qa = meeting.answers.filter((a) => a.prompt.trim());
  const answered = qa.filter((a) => a.answer.trim());
  const lines: string[] = [];
  lines.push(
    `${meeting.kind === "interview" ? "Interview" : "Meeting"}: ${meeting.title}.`,
  );
  if (meeting.company) lines.push(`Company: ${meeting.company}.`);
  if (meeting.resumeName) lines.push(`Resume: ${meeting.resumeName}.`);
  lines.push(
    `Recorded ${qa.length} question${qa.length === 1 ? "" : "s"} with ${answered.length} CueAI answer${answered.length === 1 ? "" : "s"}.`,
  );
  if (answered.length) {
    lines.push("Key Q&A:");
    for (const row of answered.slice(0, 8)) {
      lines.push(`Q: ${row.prompt.slice(0, 200)}`);
      lines.push(`A: ${row.answer.slice(0, 320)}`);
    }
  } else if (meeting.transcript.length) {
    const speakers = meeting.transcript
      .filter((t) => t.who !== "CueAI")
      .slice(0, 6)
      .map((t) => `${t.who}: ${t.text.slice(0, 160)}`);
    if (speakers.length) {
      lines.push("Transcript highlights:");
      lines.push(...speakers);
    }
  }
  return lines.join("\n").slice(0, 4000);
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
    if (found && found.status === "live") return found;
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
    // Only one live session — mark prior live as incomplete (not shown in history).
    for (const prev of s.meetings) {
      if (prev.status === "live" && prev.id !== meeting.id) {
        prev.status = "incomplete";
        prev.endedAt = prev.endedAt || now;
        if (s.activeMeetingId === prev.id) s.activeMeetingId = null;
      }
    }
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
  meta?: {
    provider?: string;
    model?: string;
    latencyMs?: number;
    source?: "auto" | "manual" | "screen";
    questionWho?: string;
    status?: "ok" | "failed";
  },
) {
  const now = new Date().toISOString();
  const who = meta?.questionWho || "Interviewer";
  await updateStore(async (s) => {
    const meeting = (s.meetings || []).find((m) => m.id === meetingId);
    if (!meeting || meeting.status !== "live") return;
    meeting.answers.unshift({
      prompt: prompt.slice(0, 2000),
      answer: answer.slice(0, 4000),
      at: now,
      provider: meta?.provider,
      model: meta?.model,
      latencyMs: meta?.latencyMs,
      source: meta?.source || "auto",
      status: meta?.status || "ok",
      questionWho: who,
    });
    meeting.answers = meeting.answers.slice(0, 80);
    meeting.transcript.push({
      who,
      text: prompt.slice(0, 1000),
      at: now,
      source: who === "You" ? "microphone" : "system",
    });
    if (answer.trim()) {
      meeting.transcript.push({
        who: "CueAI",
        text: answer.slice(0, 2000),
        at: now,
        source: "cueai",
      });
    }
    meeting.transcript = meeting.transcript.slice(-200);
  });
  console.log("[MEETING] Answer saved", { meetingId, provider: meta?.provider });
}

export async function appendMeetingTranscript(
  meetingId: string,
  lines: { who: string; text: string; source?: DbMeetingLine["source"] }[],
) {
  if (!lines.length) return;
  const now = new Date().toISOString();
  await updateStore(async (s) => {
    const meeting = (s.meetings || []).find((m) => m.id === meetingId);
    if (!meeting || meeting.status !== "live") return;
    for (const line of lines) {
      const text = line.text.trim().slice(0, 1000);
      if (!text) continue;
      meeting.transcript.push({
        who: line.who.slice(0, 40) || "Speaker",
        text,
        at: now,
        source: line.source,
      });
    }
    meeting.transcript = meeting.transcript.slice(-200);
  });
  console.log("[MEETING] Transcript event saved", { meetingId, n: lines.length });
}

export async function appendMeetingQuestionOnly(
  meetingId: string,
  question: string,
  questionWho = "Interviewer",
) {
  const now = new Date().toISOString();
  await updateStore(async (s) => {
    const meeting = (s.meetings || []).find((m) => m.id === meetingId);
    if (!meeting || meeting.status !== "live") return;
    meeting.answers.unshift({
      prompt: question.slice(0, 2000),
      answer: "",
      at: now,
      status: "failed",
      source: "auto",
      questionWho,
    });
    meeting.answers = meeting.answers.slice(0, 80);
    meeting.transcript.push({
      who: questionWho,
      text: question.slice(0, 1000),
      at: now,
      source: "system",
    });
    meeting.transcript = meeting.transcript.slice(-200);
  });
  console.log("[MEETING] Question saved", { meetingId });
}

export async function deleteMeeting(meetingId: string): Promise<boolean> {
  let deleted = false;
  await updateStore(async (s) => {
    const before = (s.meetings || []).length;
    s.meetings = (s.meetings || []).filter((m) => m.id !== meetingId);
    deleted = s.meetings.length < before;
    if (s.activeMeetingId === meetingId) s.activeMeetingId = null;
  });
  return deleted;
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
    if (typeof patch.durationSec === "number") {
      meeting.durationSec = Math.max(0, patch.durationSec);
    } else if (!meeting.durationSec && meeting.startedAt) {
      meeting.durationSec = Math.max(
        0,
        Math.round((Date.now() - new Date(meeting.startedAt).getTime()) / 1000),
      );
    }
    meeting.endedAt = new Date().toISOString();
    meeting.summary = (patch.summary?.trim() || buildMeetingSummary(meeting)).slice(0, 4000);
    meeting.status = "completed";
    if (s.activeMeetingId === meetingId) s.activeMeetingId = null;
  });
}
