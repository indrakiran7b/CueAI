import { randomUUID } from "node:crypto";
import { readStore, updateStore, type DbMeeting, type DbMockInterviewData } from "@/lib/server/db";
import type { SessionPayload } from "@/lib/server/session";
import { recordUsageEvent } from "@/lib/server/usage";
import { getProfessionalProfile } from "@/lib/server/user-profile";
import { describeProfessionalProfile } from "@/lib/professional-profile";
import {
  AiRouterError,
  generateAi,
  parseJsonReply,
  type AiRouterResult,
} from "@/lib/server/ai-router";
import {
  EMPTY_PROFILE,
  INTERVIEWER_SYSTEM,
  PROFILE_SYSTEM,
  buildOpeningPrompt,
  buildProfilePrompt,
  buildReportPrompt,
  buildTurnPrompt,
  canAskAnother,
  describeCandidate,
  groundProfile,
  mockMeetingTitle,
  parseReport,
  parseTurnResult,
  questionCategoryPlan,
  questionLimitFor,
} from "@/lib/mock-interview-logic";
import type {
  MockInterviewListSummary,
  MockInterviewPublic,
  MockResumeProfile,
  MockSetup,
  MockTurn,
} from "@/lib/mock-interview-types";

const MAX_RESUME_CHARS = 12_000;
const MAX_ANSWER_CHARS = 6_000;
/** Active sessions untouched this long after their end time count as interrupted. */
const STALE_AFTER_MS = 15 * 60_000;

export class MockInterviewError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Safe JSON error body for route handlers; never includes provider text or secrets. */
export function mockInterviewErrorResponse(err: unknown) {
  if (err instanceof MockInterviewError) {
    return { status: err.status, body: { error: { code: err.code, message: err.message, retryable: err.status >= 500 } } };
  }
  if (err instanceof AiRouterError) {
    return { status: err.status, body: { error: { code: err.code, message: err.message, retryable: err.retryable } } };
  }
  console.error("[MOCK_INTERVIEW] unexpected_error", err instanceof Error ? err.name : "unknown");
  return { status: 500, body: { error: { code: "internal_error", message: "Something went wrong. Please retry.", retryable: true } } };
}

type Caller = Pick<SessionPayload, "userId" | "workspaceId" | "role">;
type MockMeeting = DbMeeting & { mock: DbMockInterviewData };

export function isMockMeeting(m: DbMeeting): m is MockMeeting {
  return m.kind === "mock_interview" && Boolean(m.mock);
}

async function recordAiUsage(session: SessionPayload, result: AiRouterResult, step: string) {
  await recordUsageEvent(session, {
    type: "tokens",
    quantity: result.inputTokens + result.outputTokens,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    provider: result.provider,
    model: result.model,
    metadata: { feature: "mock_interview", step, latencyMs: result.latencyMs },
  }).catch(() => undefined);
}

function isStale(mock: DbMockInterviewData, now = Date.now()) {
  return (
    mock.status === "active" &&
    now > new Date(mock.endsAt).getTime() + STALE_AFTER_MS &&
    now > new Date(mock.updatedAt).getTime() + STALE_AFTER_MS
  );
}

function effectiveStatus(mock: DbMockInterviewData) {
  return isStale(mock) ? "interrupted" : mock.status;
}

function isOwner(m: DbMeeting, session: Caller) {
  return m.workspaceId === session.workspaceId && m.userId === session.userId;
}

/**
 * Mock part of a meeting for the browser. Resume text is never returned; the job description
 * and resume-derived profile are private to the owner (same rule as regular meeting resume/JD).
 */
export function publicMock(m: MockMeeting, viewer: Caller): MockInterviewPublic {
  const owner = isOwner(m, viewer);
  const { jobDescription, ...setup } = m.mock.setup;
  return {
    status: effectiveStatus(m.mock),
    setup: owner ? { ...setup, jobDescription } : setup,
    profile: owner ? m.mock.profile : null,
    welcome: m.mock.welcome,
    turns: m.mock.turns,
    questionLimit: m.mock.questionLimit,
    startedAt: m.startedAt,
    endsAt: m.mock.endsAt,
    endedAt: m.endedAt || null,
    report: m.mock.report || null,
    reportError: m.mock.reportError || null,
    isOwner: owner,
  };
}

export function mockListSummary(m: MockMeeting): MockInterviewListSummary {
  return {
    status: effectiveStatus(m.mock),
    jobTitle: m.mock.setup.jobTitle,
    interviewType: m.mock.setup.interviewType,
    difficulty: m.mock.setup.difficulty,
    durationMin: m.mock.setup.durationMin,
    overallScore: m.mock.report ? m.mock.report.overallScore : null,
    answeredCount: m.mock.turns.filter((t) => t.answer && !t.skipped).length,
    questionCount: m.mock.turns.length,
    improvementAreas: (m.mock.report?.improvements || []).map((i) => i.area).filter(Boolean).slice(0, 3),
  };
}

/** The interview owner's own Settings → Profile details; never another user's. */
async function savedProfileFor(session: SessionPayload): Promise<string> {
  try {
    return describeProfessionalProfile(await getProfessionalProfile(session.userId));
  } catch {
    return "";
  }
}

function cleanResumeText(text: unknown) {
  return typeof text === "string" ? text.replace(/\u0000/g, "").trim().slice(0, MAX_RESUME_CHARS) : "";
}

async function extractProfile(session: SessionPayload, resumeText: string, signal?: AbortSignal): Promise<MockResumeProfile> {
  try {
    const result = await generateAi({
      feature: "mock_interview",
      userId: session.userId,
      workspaceId: session.workspaceId,
      system: PROFILE_SYSTEM,
      prompt: buildProfilePrompt(resumeText),
      jsonObject: true,
      maxOutputTokens: 1200,
      temperature: 0,
      timeoutMs: 30_000,
      signal,
    });
    void recordAiUsage(session, result, "profile");
    const parsed = parseJsonReply<Record<string, unknown>>(result.text);
    return parsed ? groundProfile(parsed, resumeText) : EMPTY_PROFILE;
  } catch {
    // The opening question already uses the resume text; a missing profile only reduces context.
    return EMPTY_PROFILE;
  }
}

/** Start a mock interview as a Meetings session (welcome + first question). Retry-safe via clientRequestId. */
export async function createMockMeeting(
  session: SessionPayload,
  input: { setup: MockSetup; resumeText: unknown; clientRequestId?: unknown; signal?: AbortSignal },
): Promise<{ meeting: MockMeeting; created: boolean }> {
  const requestId =
    typeof input.clientRequestId === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(input.clientRequestId)
      ? input.clientRequestId
      : undefined;
  if (requestId) {
    const store = await readStore();
    const existing = (store.meetings || []).find(
      (m) => m.clientRequestId === requestId && isOwner(m, session) && isMockMeeting(m),
    );
    if (existing && isMockMeeting(existing)) return { meeting: existing, created: false };
  }

  const resumeText = cleanResumeText(input.resumeText);
  if (resumeText.length < 80) {
    throw new MockInterviewError(
      "resume_required",
      "Upload or select a resume with readable text (a text-based PDF or DOCX) to start a mock interview.",
    );
  }

  const savedProfile = await savedProfileFor(session);
  const questionLimit = questionLimitFor(input.setup.durationMin);
  const categoryPlan = questionCategoryPlan(questionLimit);
  const [profile, opening] = await Promise.all([
    extractProfile(session, resumeText, input.signal),
    generateAi({
      feature: "mock_interview",
      userId: session.userId,
      workspaceId: session.workspaceId,
      system: INTERVIEWER_SYSTEM,
      prompt: buildOpeningPrompt(
        describeCandidate(input.setup, EMPTY_PROFILE, resumeText, savedProfile),
        categoryPlan[0],
      ),
      jsonObject: true,
      maxOutputTokens: 400,
      temperature: 0.6,
      timeoutMs: 20_000,
      signal: input.signal,
    }),
  ]);
  void recordAiUsage(session, opening, "opening");
  const parsed = parseJsonReply<{ welcome?: string; question?: string; topic?: string }>(opening.text);
  const question = typeof parsed?.question === "string" ? parsed.question.trim().slice(0, 500) : "";
  if (!question) {
    throw new MockInterviewError("opening_failed", "The AI did not return a first question. Please retry.", 502);
  }

  const now = new Date();
  const meeting: MockMeeting = {
    id: `mtg_${randomUUID().slice(0, 12)}`,
    workspaceId: session.workspaceId,
    userId: session.userId,
    title: mockMeetingTitle(input.setup),
    kind: "mock_interview",
    status: "incomplete",
    startedAt: now.toISOString(),
    durationSec: 0,
    attendees: 1,
    tags: ["Mock Interview"],
    resumeName: input.setup.resumeName,
    transcript: [],
    answers: [],
    clientRequestId: requestId,
    mock: {
      status: "active",
      setup: input.setup,
      profile,
      resumeText,
      welcome:
        (typeof parsed?.welcome === "string" && parsed.welcome.trim().slice(0, 400)) ||
        `Welcome to your ${input.setup.jobTitle} practice interview.`,
      turns: [
        {
          id: randomUUID().slice(0, 8),
          kind: "main",
          question,
          category: categoryPlan[0],
          topic: typeof parsed?.topic === "string" ? parsed.topic.trim().slice(0, 60) : undefined,
          askedAt: now.toISOString(),
        },
      ],
      questionLimit,
      endsAt: new Date(now.getTime() + input.setup.durationMin * 60_000).toISOString(),
      updatedAt: now.toISOString(),
    },
  };

  let saved: MockMeeting = meeting;
  await updateStore((s) => {
    s.meetings = s.meetings || [];
    const dup = requestId
      ? s.meetings.find((m) => m.clientRequestId === requestId && isOwner(m, session) && isMockMeeting(m))
      : null;
    if (dup && isMockMeeting(dup)) {
      saved = dup;
      return;
    }
    s.meetings.unshift(meeting);
  });
  return { meeting: saved, created: saved === meeting };
}

async function loadOwned(session: Caller, id: string): Promise<MockMeeting> {
  const store = await readStore();
  const m = (store.meetings || []).find((x) => x.id === id);
  if (!m || !isOwner(m, session) || !isMockMeeting(m)) {
    throw new MockInterviewError("not_found", "Mock interview not found.", 404);
  }
  return m;
}

export type AnswerOutcome = {
  mock: MockInterviewPublic;
  done: boolean;
  error?: { code: string; message: string; retryable: boolean };
};

/**
 * Save the answer to the current question, evaluate it, and pick the next step.
 * Calling again for a turn that was saved but not evaluated retries the evaluation.
 */
export async function answerMockMeeting(
  session: SessionPayload,
  id: string,
  input: { turnId: string; answer?: unknown; source?: unknown; skip?: boolean; signal?: AbortSignal },
): Promise<AnswerOutcome> {
  const m = await loadOwned(session, id);
  if (m.mock.status !== "active" || isStale(m.mock)) {
    throw new MockInterviewError("not_active", "This mock interview has ended.", 409);
  }
  const current = m.mock.turns[m.mock.turns.length - 1];
  if (!current || current.id !== input.turnId || current.evaluation) {
    throw new MockInterviewError("stale_turn", "That question was already answered. Refresh to continue.", 409);
  }

  const skip = Boolean(input.skip);
  const answer = skip
    ? ""
    : typeof input.answer === "string" && input.answer.trim()
      ? input.answer.trim().slice(0, MAX_ANSWER_CHARS)
      : current.answer || "";
  if (!skip && !answer) throw new MockInterviewError("answer_required", "Type or record an answer first, or skip the question.");

  const answered: MockTurn = {
    ...current,
    answer: skip ? undefined : answer,
    skipped: skip || undefined,
    answeredAt: new Date().toISOString(),
    answerSource: skip ? undefined : input.source === "voice" ? "voice" : "text",
    evaluationError: undefined,
  };
  const turns = [...m.mock.turns.slice(0, -1), answered];
  const moreAllowed = canAskAnother({ turns, questionLimit: m.mock.questionLimit, endsAt: m.mock.endsAt });
  const nextCategory = moreAllowed ? questionCategoryPlan(m.mock.questionLimit)[turns.length] : undefined;

  // Persist the answer before the AI call so it survives provider failures or a closed tab.
  await updateStore((s) => {
    const row = (s.meetings || []).find((x) => x.id === id);
    if (!row?.mock) return;
    const last = row.mock.turns[row.mock.turns.length - 1];
    if (!last || last.id !== input.turnId || last.evaluation) return;
    row.mock.turns = turns.map((t) => ({ ...t }));
    row.mock.updatedAt = answered.answeredAt!;
  });

  let parsed: ReturnType<typeof parseTurnResult> = null;
  let failure: AnswerOutcome["error"];
  const savedProfile = await savedProfileFor(session);
  try {
    const result = await generateAi({
      feature: "mock_interview",
      userId: session.userId,
      workspaceId: session.workspaceId,
      system: INTERVIEWER_SYSTEM,
      prompt: buildTurnPrompt({
        candidate: describeCandidate(m.mock.setup, m.mock.profile, m.mock.resumeText, savedProfile),
        turns,
        allowFollowUp: false,
        isLast: !moreAllowed,
        nextCategory,
      }),
      jsonObject: true,
      maxOutputTokens: 600,
      temperature: 0.4,
      timeoutMs: 25_000,
      signal: input.signal,
    });
    void recordAiUsage(session, result, "turn");
    parsed = parseTurnResult(parseJsonReply(result.text), turns.map((t) => t.question));
    if (!parsed) failure = { code: "evaluation_parse_failed", message: "The AI response couldn't be read. Retry evaluation.", retryable: true };
    else if (moreAllowed && parsed.next.type === "end") {
      // The prompt only allows "end" on the final question; a missing, invalid or repeated next question must not end the interview early.
      parsed = null;
      failure = { code: "next_question_failed", message: "The interviewer couldn't prepare the next question. Retry.", retryable: true };
    }
  } catch (err) {
    const e = err instanceof AiRouterError ? err : new AiRouterError("provider_error", "The AI provider returned an error. Please retry.");
    failure = { code: e.code, message: e.message, retryable: e.retryable };
  }

  const now = new Date().toISOString();
  const evaluated: MockTurn = {
    ...answered,
    evaluation: parsed ? (skip ? { score: 0, feedback: "Question skipped.", missing: [] } : parsed.evaluation) : undefined,
    evaluationError: failure?.message,
  };

  const nextTurn: MockTurn | null =
    parsed && moreAllowed && parsed.next.type !== "end"
      ? {
          id: randomUUID().slice(0, 8),
          kind: "main",
          question: parsed.next.question,
          category: nextCategory,
          topic: parsed.next.topic || undefined,
          askedAt: now,
        }
      : null;
  const done = Boolean(parsed) && !nextTurn;

  let saved = null as MockMeeting | null;
  await updateStore((s) => {
    const row = (s.meetings || []).find((x) => x.id === id);
    if (!row || !isMockMeeting(row) || row.mock.status !== "active") return;
    const last = row.mock.turns[row.mock.turns.length - 1];
    if (!last || last.id !== input.turnId || last.evaluation) return;
    row.mock.turns = [...row.mock.turns.slice(0, -1), evaluated, ...(nextTurn ? [nextTurn] : [])];
    row.mock.updatedAt = now;
    saved = row;
  });
  if (!saved) throw new MockInterviewError("stale_turn", "That question was already answered. Refresh to continue.", 409);
  return { mock: publicMock(saved, session), done, error: failure };
}

/** End the interview and generate the final results once; saved results are never regenerated. */
export async function finishMockMeeting(session: SessionPayload, id: string): Promise<MockInterviewPublic> {
  const m = await loadOwned(session, id);
  if (m.mock.report) return publicMock(m, session);

  const asked = m.mock.turns.filter((t) => t.answeredAt);
  const answeredCount = asked.filter((t) => t.answer && !t.skipped).length;
  const endedAt = m.endedAt || new Date().toISOString();
  let report = null;
  let reportError: string | undefined;

  if (!answeredCount) {
    reportError = "No questions were answered, so no assessment was generated.";
  } else {
    try {
      const result = await generateAi({
        feature: "mock_interview",
        userId: session.userId,
        workspaceId: session.workspaceId,
        system: INTERVIEWER_SYSTEM,
        prompt: buildReportPrompt({
          candidate: describeCandidate(m.mock.setup, m.mock.profile, m.mock.resumeText),
          setup: m.mock.setup,
          turns: asked,
        }),
        jsonObject: true,
        maxOutputTokens: 5000,
        temperature: 0.3,
        timeoutMs: 75_000,
      });
      void recordAiUsage(session, result, "report");
      report = parseReport(parseJsonReply(result.text), m.mock.setup, { provider: result.provider, model: result.model }, asked);
      if (!report) reportError = "The AI response was incomplete, so no score was generated. Retry to create the results.";
    } catch (err) {
      reportError =
        err instanceof AiRouterError
          ? `${err.message} Your answers are saved — retry to create the results.`
          : "The results could not be generated. Your answers are saved — retry to create the results.";
    }
  }

  let saved = null as MockMeeting | null;
  await updateStore((s) => {
    const row = (s.meetings || []).find((x) => x.id === id);
    if (!row || !isOwner(row, session) || !isMockMeeting(row)) return;
    if (row.mock.report) {
      saved = row;
      return;
    }
    if (row.mock.status === "active") row.mock.status = isStale(row.mock) ? "interrupted" : "completed";
    row.endedAt = row.endedAt || endedAt;
    row.durationSec = Math.max(0, Math.round((Date.parse(row.endedAt) - Date.parse(row.startedAt)) / 1000));
    row.status = "completed";
    row.mock.updatedAt = new Date().toISOString();
    if (report) {
      row.mock.report = report;
      row.mock.reportError = undefined;
      row.summary = report.summary;
    } else {
      row.mock.reportError = reportError;
    }
    saved = row;
  });
  if (!saved) throw new MockInterviewError("not_found", "Mock interview not found.", 404);
  return publicMock(saved, session);
}
