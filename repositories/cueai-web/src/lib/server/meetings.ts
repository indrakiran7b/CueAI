import { randomUUID } from "node:crypto";
import {
  readStore,
  updateStore,
  type DbMeeting,
  type DbMeetingLine,
} from "@/lib/server/db";
import { hasEntitlement } from "@/lib/server/billing";
import type { SessionPayload } from "@/lib/server/session";
import { normalizeRole } from "@/lib/roles";
import { isMockMeeting, mockListSummary, publicMock } from "@/lib/server/mock-interview";

const MAX_MEETING_ANSWERS = 400;

/** Full transcript stays a premium feature; Q&A summaries are available to everyone. */
export async function canSessionViewTranscript(session: SessionPayload): Promise<boolean> {
  if (canManageWorkspaceMeetings(session)) return true;
  const store = await readStore();
  const user = store.users.find((u) => u.id === session.userId);
  return user ? hasEntitlement(user, "meeting.full_summary") : false;
}

export function canManageWorkspaceMeetings(session: Pick<SessionPayload, "role">): boolean {
  const role = normalizeRole(session.role);
  return role === "Admin" || role === "Manager";
}

/** Meetings that belong in the Meetings history page. */
export function isCompletedMeeting(m: DbMeeting): boolean {
  return m.status === "completed" || m.status === "summary";
}

/** History also lists mock interviews still in progress so they can be resumed or finished. */
function isHistoryMeeting(m: DbMeeting): boolean {
  return isCompletedMeeting(m) || (isMockMeeting(m) && m.status === "incomplete");
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
  owner?: { name: string; email: string } | null,
  /** When set, mock interview detail (turns, evaluations, results) is included for this viewer. */
  viewer?: Pick<SessionPayload, "userId" | "workspaceId" | "role">,
) {
  const mock = isMockMeeting(m) ? m : null;
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
    documentIds: m.documentIds || [],
    transcript: includeTranscript ? m.transcript : [],
    transcriptLocked: !includeTranscript,
    transcriptLineCount: m.transcript.length,
    answers: [...m.answers].sort((a, b) => a.at.localeCompare(b.at)).map((a) => ({
      prompt: a.prompt,
      answer: a.answer,
      at: a.at,
      status: a.status === "failed" || !a.answer?.trim() ? "unavailable" : "answered",
    })),
    hasMore: false,
    fullSummaryAvailable: true,
    owner: owner ? { name: owner.name, email: owner.email } : null,
    summary: m.summary || null,
    questionCount: m.answers.length,
    answerCount: m.answers.filter((a) => Boolean(a.answer?.trim())).length,
    mockSummary: mock ? mockListSummary(mock) : null,
    mock: mock && viewer ? publicMock(mock, viewer) : null,
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
  if (meeting.workspaceId !== session.workspaceId) return false;
  if (meeting.userId && meeting.userId === session.userId) return true;
  return canManageWorkspaceMeetings(session);
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
      isHistoryMeeting(m) &&
      m.workspaceId === session.workspaceId &&
      m.userId === session.userId,
  );
}

export async function meetingOwner(meeting: DbMeeting) {
  if (!meeting.userId) return null;
  const store = await readStore();
  const user = store.users.find(
    (u) => u.id === meeting.userId && u.workspaceId === meeting.workspaceId,
  );
  return user ? { name: user.name, email: user.email } : null;
}

/** Completed history for every member of the caller's workspace. Admin/Manager only. */
export async function listCompletedWorkspaceMeetings(session: SessionPayload) {
  if (!canManageWorkspaceMeetings(session)) return null;
  const store = await readStore();
  const owners = new Map(
    store.users
      .filter((u) => u.workspaceId === session.workspaceId)
      .map((u) => [u.id, { name: u.name, email: u.email }]),
  );
  return (store.meetings || [])
    .filter((m) => isHistoryMeeting(m) && m.workspaceId === session.workspaceId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map((m) => ({ meeting: m, owner: (m.userId && owners.get(m.userId)) || null }));
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
  if (!qa.length && meeting.transcript.length) {
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

/**
 * Short AI overview of a finished session, grounded only in recorded Q&A/transcript.
 * Returns null when there is nothing to summarize or every provider fails,
 * so callers fall back to the factual buildMeetingSummary text.
 */
export async function generateMeetingSummaryText(
  meeting: DbMeeting,
  session: Pick<SessionPayload, "userId" | "workspaceId">,
): Promise<string | null> {
  const qa = [...meeting.answers]
    .filter((a) => a.prompt.trim())
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-30);
  const lines = meeting.transcript.filter((t) => t.text.trim()).slice(-40);
  if (!qa.length && !lines.length) return null;

  const material = [
    qa.length
      ? `QUESTIONS AND ANSWERS:\n${qa
          .map((a, i) => `Q${i + 1}: ${a.prompt.slice(0, 400)}\nA${i + 1}: ${a.answer.trim() ? a.answer.slice(0, 600) : "(no answer recorded)"}`)
          .join("\n")}`
      : "",
    !qa.length && lines.length
      ? `TRANSCRIPT EXCERPT:\n${lines.map((t) => `${t.who}: ${t.text.slice(0, 300)}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const { generateAi } = await import("@/lib/server/ai-router");
    const result = await generateAi({
      feature: "meeting_summary",
      userId: session.userId,
      workspaceId: session.workspaceId,
      system:
        "You write short, factual session summaries. Use only the material provided. Never invent questions, answers, names, decisions, or outcomes. If answers are missing, say so.",
      prompt: `Session: ${meeting.title} (${meeting.kind === "interview" ? "interview" : "meeting"}).\n\n${material}\n\nWrite a 2–4 sentence overview of the main topics covered. Plain text, no lists, no headings.`,
      temperature: 0.2,
      maxOutputTokens: 260,
      timeoutMs: 15_000,
    });
    return result.text.trim().slice(0, 1200) || null;
  } catch {
    return null;
  }
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

/** Live meeting for this identity only. Never falls back to another user's activeMeetingId. */
export async function getActiveMeetingForSession(session: SessionPayload) {
  const store = await readStore();
  const live = (store.meetings || []).filter(
    (m) => m.status === "live" && canAccessMeeting(m, session),
  );
  if (store.activeMeetingId) {
    const found = live.find((m) => m.id === store.activeMeetingId);
    if (found) return found;
  }
  return live.find((m) => m.userId === session.userId) || null;
}

export function briefingStorageKey(workspaceId: string, userId: string) {
  return `${workspaceId}:${userId}`;
}

export type LiveBriefing = {
  kind?: "interview" | "regular";
  company?: string;
  jobDescription?: string;
  jobLink?: string;
  resumeName?: string;
  resumeText?: string;
  description?: string;
  pendingKnowledgeIds?: string[];
  documentIds?: string[];
  updatedAt: string;
};

export async function getLiveBriefing(
  session: SessionPayload,
): Promise<LiveBriefing | null> {
  const store = await readStore();
  const key = briefingStorageKey(session.workspaceId, session.userId);
  return store.liveBriefings?.[key] || null;
}

export async function getLiveBriefingForUser(userId: string): Promise<LiveBriefing | null> {
  const store = await readStore();
  const user = store.users.find((u) => u.id === userId);
  if (!user) return null;
  const workspaceId = user.workspaceId || store.workspace.id;
  return store.liveBriefings?.[briefingStorageKey(workspaceId, userId)] || null;
}

export async function saveLiveBriefing(
  partial: Partial<LiveBriefing>,
  session: SessionPayload,
) {
  const now = new Date().toISOString();
  const key = briefingStorageKey(session.workspaceId, session.userId);
  await updateStore(async (s) => {
    if (!s.liveBriefings) s.liveBriefings = {};
    const prev = s.liveBriefings[key] || { updatedAt: now };
    s.liveBriefings[key] = {
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
  return getLiveBriefing(session);
}

export async function resolveAnswerBriefing(session: SessionPayload) {
  const [meeting, briefing] = await Promise.all([
    getActiveMeetingForSession(session),
    getLiveBriefing(session),
  ]);
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
      documentIds: meeting?.documentIds?.length
        ? meeting.documentIds
        : briefing?.documentIds || [],
      pendingKnowledgeIds: briefing?.pendingKnowledgeIds || [],
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
  /** Workspace knowledge docs to attach (reusable). */
  documentIds?: string[];
  /** Meeting-prep uploads already in store (pending) — will receive this meetingId. */
  pendingKnowledgeIds?: string[];
}): Promise<DbMeeting> {
  const now = new Date().toISOString();
  const existing = input.userId ? await getLiveBriefingForUser(input.userId) : null;
  const documentIds = [
    ...new Set([
      ...(input.documentIds || []),
      ...(existing?.documentIds || []),
    ]),
  ].filter(Boolean);
  const pendingKnowledgeIds = [
    ...new Set([
      ...(input.pendingKnowledgeIds || []),
      ...(existing?.pendingKnowledgeIds || []),
    ]),
  ].filter(Boolean);

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
    documentIds: documentIds.length ? documentIds : undefined,
    transcript: [],
    answers: [],
  };

  const reboundIds: string[] = [];

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

    // Bind pending meeting-prep uploads to this meeting.
    const pendingSet = new Set(pendingKnowledgeIds);
    for (const doc of s.knowledge) {
      if (pendingSet.has(doc.id)) {
        doc.meetingId = meeting.id;
        doc.knowledgeScope = "meeting";
        doc.updatedAt = now;
        reboundIds.push(doc.id);
      }
    }

    s.meetings.unshift(meeting);
    s.meetings = s.meetings.slice(0, 200);
    s.activeMeetingId = meeting.id;
    if (meeting.userId) {
      if (!s.liveBriefings) s.liveBriefings = {};
      const key = briefingStorageKey(meeting.workspaceId, meeting.userId);
      const prev = s.liveBriefings[key] || { updatedAt: now };
      s.liveBriefings[key] = {
        ...prev,
        kind: input.kind,
        company: meeting.company,
        jobDescription: meeting.jobDescription,
        jobLink: meeting.jobLink,
        resumeName: meeting.resumeName,
        resumeText: meeting.resumeText || prev.resumeText,
        description: meeting.description,
        documentIds: meeting.documentIds,
        pendingKnowledgeIds: [],
        updatedAt: now,
      };
    }
  });

  if (reboundIds.length) {
    const { processKnowledgeDocument } = await import(
      "@/lib/server/rag/document-processor"
    );
    for (const id of reboundIds) {
      void processKnowledgeDocument(id);
    }
  }

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
    meeting.answers = meeting.answers.slice(0, MAX_MEETING_ANSWERS);
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
    meeting.answers = meeting.answers.slice(0, MAX_MEETING_ANSWERS);
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
