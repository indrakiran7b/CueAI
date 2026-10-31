import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { NextRequest } from "next/server";
import type { StoredMeeting } from "../src/lib/meetings-client";
import type {
  MockAnswerEvaluation,
  MockInterviewListSummary,
  MockInterviewPublic,
  MockReport,
  MockResumeProfile,
  MockSetup,
  MockTurn,
} from "../src/lib/mock-interview-types";

/** Response views for assertions; tests that expect nulls compare against null directly. */
type TestMock = Omit<MockInterviewPublic, "report" | "profile" | "reportError" | "turns"> & {
  report: MockReport;
  profile: MockResumeProfile;
  reportError: string;
  turns: (MockTurn & { evaluation: MockAnswerEvaluation })[];
};
type ApiMeeting = StoredMeeting & { mock: TestMock; mockSummary: MockInterviewListSummary };
/** Union of the response fields these routes return; each test reads the ones its route sends. */
type ApiBody = {
  error: { code: string; message: string };
  created: boolean;
  done: boolean;
  text: string;
  meeting: ApiMeeting;
  meetings: ApiMeeting[];
  mock: TestMock;
};

const last = <T,>(list: T[], fromEnd = 1): T => list[list.length - fromEnd]!;

const DATA_DIR = mkdtempSync(path.join(tmpdir(), "cueai-mock-"));
process.env.CUEAI_DATA_DIR = DATA_DIR;
process.env.AUTH_SECRET = "test-mock-interview-secret-0123456789";
process.env.CUEAI_SECRET_ENCRYPTION_KEY = "test-mock-interview-encryption-key-0123456789";
process.env.CUEAI_ENV = "test";
process.env.NEXT_PUBLIC_SKIP_AUTH = "false";
process.env.NEXT_PUBLIC_AUTH_BYPASS = "false";
process.env.CUEAI_BOOTSTRAP_ADMIN_ENABLED = "false";
for (const name of [
  "GROQ_API_KEY",
  "GEMINI_API_KEY",
  "VERTEX_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "DEEPSEEK_API_KEY",
  "ANTHROPIC_API_KEY",
  "PERPLEXITY_API_KEY",
]) {
  delete process.env[name];
}

const USER_KEY = "sk-test-user-a-key-9f8e7d6c5b4a";

const RESUME = `Jane Candidate
Education: B.Tech Computer Science, Example Institute of Technology, 2024
Skills: JavaScript, React, Node.js, SQL, Git
Internship: Frontend Intern at Acme Labs (Jun 2023 - Aug 2023)
Projects: Expense Tracker - a React and Node.js app to track spending with charts
Certifications: AWS Cloud Practitioner`;

/* ---------- Test-only OpenAI-compatible provider ---------- */

type Mode = "ok" | "unauthorized" | "server_error" | "bad_report" | "no_next";
let mode: Mode = "ok";
let nextQuestion = 0;
const seenAuth: string[] = [];
const seenBodies: string[] = [];

function reply(res: ServerResponse, status: number, content: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(
    JSON.stringify(
      status === 200
        ? {
            choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }],
            usage: { prompt_tokens: 10, completion_tokens: 20 },
          }
        : { error: { message: String(content) } },
    ),
  );
}

const fake = createServer((req: IncomingMessage, res: ServerResponse) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    seenAuth.push(String(req.headers.authorization || ""));
    seenBodies.push(raw);
    if (mode === "unauthorized") return reply(res, 401, "Incorrect API key provided");
    if (mode === "server_error") return reply(res, 500, "upstream exploded");
    const prompt = (JSON.parse(raw) as { messages: { content: string }[] }).messages.map((m) => m.content).join("\n");
    if (prompt.includes("Extract these lists")) {
      return reply(res, 200, {
        education: ["B.Tech Computer Science, Example Institute of Technology, 2024"],
        skills: ["JavaScript", "React", "Kubernetes", "SQL"],
        experience: ["Frontend Intern at Acme Labs (Jun 2023 - Aug 2023)", "Senior Engineer at Google"],
        projects: ["Expense Tracker - a React and Node.js app to track spending"],
        certifications: ["AWS Cloud Practitioner", "Certified Kubernetes Administrator"],
      });
    }
    if (prompt.includes("Start the interview")) {
      return reply(res, 200, { welcome: "Welcome to your practice interview.", question: "Tell me about your Expense Tracker project.", topic: "Projects" });
    }
    if (prompt.includes("Evaluate the candidate's answer")) {
      const last = prompt.includes("This was the final question");
      if (mode === "no_next") {
        return reply(res, 200, { evaluation: { score: 6, feedback: "Fine.", missing: [] }, next: { type: "main", question: "" } });
      }
      return reply(res, 200, {
        evaluation: { score: 6, feedback: "Good overview; add measurable outcomes.", correct: ["Named the React and Express stack"], missing: ["Impact metrics"] },
        next: last ? { type: "end" } : { type: "follow_up", question: `How did you structure part ${++nextQuestion} of the database?`, topic: "Data modeling" },
      });
    }
    if (prompt.includes("final practice assessment")) {
      if (mode === "bad_report") return reply(res, 200, { summary: "Partial", categories: [{ key: "communication", score: 70 }] });
      const keys = ["technical", "accuracy", "problem_solving", "communication", "structure"];
      return reply(res, 200, {
        summary: "Solid fundamentals with room to quantify impact.",
        readinessNote: "Close to ready; practice quantifying results.",
        categories: keys.map((key, i) => ({ key, score: 60 + i * 5, comment: `${key} comment` })),
        strengths: [{ point: "Explains projects clearly", evidence: "Q1: described the Expense Tracker architecture" }],
        questionFeedback: [
          {
            q: 1,
            expected: "Goal, architecture, your role, and the outcome.",
            improvedAnswer: "I built the Expense Tracker with React and Node.js; it helped users [your metric].",
            recommendations: ["State your role first", "Close with the result", "Extra item dropped"],
          },
          { q: 9, expected: "Out of range", improvedAnswer: "ignored" },
        ],
        improvements: [
          {
            area: "Quantify impact",
            whyItMatters: "Interviewers look for outcomes",
            whatToPractice: "Add numbers to project stories",
            exercise: "Rewrite your Expense Tracker answer with one measurable result.",
            nextSteps: "Prepare two quantified stories.",
          },
          { area: "No practice item" },
        ],
        practicePlan: [
          { priority: 2, action: "Review SQL indexing", focus: "Databases" },
          { priority: 1, action: "Prepare two STAR stories", focus: "Behavioral" },
        ],
        practiceQuestions: ["How would you scale the Expense Tracker?"],
      });
    }
    return reply(res, 200, "{}");
  });
});
await new Promise<void>((resolve) => fake.listen(0, "127.0.0.1", resolve));
const fakeUrl = `http://127.0.0.1:${(fake.address() as AddressInfo).port}/v1`;
after(() => fake.close());

/* ---------- App modules ---------- */

const logic = await import("../src/lib/mock-interview-logic");
const { updateStore, readStore } = await import("../src/lib/server/db");
const { signSession, SESSION_COOKIE, encryptSecret } = await import("../src/lib/server/session");
const meetingsRoute = await import("../src/app/api/meetings/route");
const meetingRoute = await import("../src/app/api/meetings/[id]/route");
const mockRoute = await import("../src/app/api/meetings/mock/route");
const answerRoute = await import("../src/app/api/meetings/[id]/mock/answer/route");
const finishRoute = await import("../src/app/api/meetings/[id]/mock/finish/route");
const extractRoute = await import("../src/app/api/resume/extract/route");

const now = new Date().toISOString();
const USERS = {
  usr_a: { name: "User A", role: "User", workspaceId: "ws_a" },
  usr_b: { name: "User B", role: "User", workspaceId: "ws_a" },
  usr_admin: { name: "Admin A", role: "Admin", workspaceId: "ws_a" },
  usr_c: { name: "User C", role: "Admin", workspaceId: "ws_b" },
} as const;
type Uid = keyof typeof USERS;

await updateStore((s) => {
  s.workspace.id = "ws_a";
  s.users = (Object.keys(USERS) as Uid[]).map((id) => ({
    id,
    name: USERS[id].name,
    email: `${id}@cueai.local`,
    passwordHash: "x",
    role: USERS[id].role,
    status: "Active" as const,
    workspaceId: USERS[id].workspaceId,
    createdAt: now,
    plan: "free" as const,
  }));
  s.userApiCredentials = [
    {
      id: "cred_a",
      workspaceId: "ws_a",
      userId: "usr_a",
      name: "Test key",
      provider: "openai",
      model: "gpt-4o-mini",
      encryptedApiKey: encryptSecret(USER_KEY),
      keyLast4: USER_KEY.slice(-4),
      status: "connected",
      capabilities: ["live_session", "general_ai", "rag"],
      endpoint: fakeUrl,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
});

function cookie(uid: Uid) {
  const u = USERS[uid];
  const token = signSession({ userId: uid, email: `${uid}@cueai.local`, name: u.name, role: u.role, workspaceId: u.workspaceId, workspace: u.workspaceId });
  return `${SESSION_COOKIE}=${token}`;
}

function req(uid: Uid | null, url: string, method = "GET", body?: unknown) {
  return new NextRequest(`http://127.0.0.1:3000${url}`, {
    method,
    headers: { "content-type": "application/json", ...(uid ? { cookie: cookie(uid) } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function json(res: Response) {
  const text = await res.text();
  assert.ok(!text.includes(USER_KEY), "API response must never contain the API key");
  return { status: res.status, text, body: JSON.parse(text) as ApiBody };
}

const SETUP = {
  jobTitle: "Frontend Developer",
  jobDescription: "Build React UIs; strong SQL is a plus.",
  difficulty: "beginner",
  durationMin: 10,
  interviewType: "technical",
  resumeName: "jane.pdf",
};

const create = (uid: Uid, extra: Record<string, unknown> = {}) =>
  mockRoute.POST(req(uid, "/api/meetings/mock", "POST", { setup: SETUP, resumeText: RESUME, ...extra }));
const getMeeting = async (uid: Uid, id: string) => json(await meetingRoute.GET(req(uid, `/api/meetings/${id}`), ctx(id)));
const answer = (uid: Uid, id: string, body: unknown) =>
  answerRoute.POST(req(uid, `/api/meetings/${id}/mock/answer`, "POST", body), ctx(id));
const finish = (uid: Uid, id: string) => finishRoute.POST(req(uid, `/api/meetings/${id}/mock/finish`, "POST"), ctx(id));

/* ---------- Pure logic ---------- */

test("setup validation requires a job role and applies defaults", () => {
  assert.deepEqual(logic.normalizeSetup({}), { error: "Enter the job role you are preparing for." });
  const ok = logic.normalizeSetup({ jobTitle: "  Data Analyst ", durationMin: 99, interviewType: "nope", difficulty: "expert" });
  assert.ok("setup" in ok);
  assert.equal(ok.setup.jobTitle, "Data Analyst");
  assert.equal(ok.setup.durationMin, 20);
  assert.equal(ok.setup.interviewType, "mixed");
  assert.equal(ok.setup.difficulty, "intermediate");
  assert.equal(ok.setup.jobDescription, undefined);
  assert.deepEqual([10, 20, 30].map((d) => logic.questionLimitFor(d as 10 | 20 | 30)), [10, 20, 30]);
});

test("10 and 20 question interviews follow the exact 70/20/10 distribution", () => {
  for (const [total, expected] of [
    [10, { project: 7, technical: 2, hr_scenario: 1 }],
    [20, { project: 14, technical: 4, hr_scenario: 2 }],
  ] as const) {
    assert.deepEqual(logic.questionDistribution(total), expected);
    const plan = logic.questionCategoryPlan(total);
    assert.equal(plan.length, total);
    assert.deepEqual(
      plan.reduce(
        (counts, category) => ({ ...counts, [category]: counts[category] + 1 }),
        { project: 0, technical: 0, hr_scenario: 0 },
      ),
      expected,
    );
  }
});

test("profile grounding drops skills, roles and certifications not in the resume", () => {
  const profile = logic.groundProfile(
    {
      skills: ["React", "Kubernetes", "SQL", "react"],
      experience: ["Frontend Intern at Acme Labs", "Senior Engineer at Google"],
      certifications: ["AWS Cloud Practitioner", "Certified Kubernetes Administrator"],
      education: "not a list",
    },
    RESUME,
  );
  assert.deepEqual(profile.skills, ["React", "SQL"]);
  assert.deepEqual(profile.experience, ["Frontend Intern at Acme Labs"]);
  assert.deepEqual(profile.certifications, ["AWS Cloud Practitioner"]);
  assert.deepEqual(profile.education, []);
});

test("turn parsing rejects missing scores, ends without a next question, and never repeats a question", () => {
  assert.equal(logic.parseTurnResult({ evaluation: { feedback: "x" } }), null);
  assert.equal(logic.parseTurnResult({ evaluation: { score: 7 } }), null);
  const parsed = logic.parseTurnResult({ evaluation: { score: 14, feedback: "Good" }, next: { type: "main", question: "" } });
  assert.equal(parsed?.evaluation.score, 10);
  assert.equal(parsed?.next.type, "end");
  const repeat = logic.parseTurnResult(
    { evaluation: { score: 5, feedback: "ok" }, next: { type: "main", question: "Tell me about your project!" } },
    ["Tell me about your project?"],
  );
  assert.equal(repeat?.next.type, "end");
});

test("report needs every category for the type, maps per-question feedback, and sets readiness", () => {
  const meta = { provider: "openai", model: "m" };
  const hr = logic.normalizeSetup({ jobTitle: "HR", interviewType: "hr_behavioral" }) as { setup: MockSetup };
  const turns = [
    { id: "t1", kind: "main" as const, question: "q1", askedAt: now, answer: "a", answeredAt: now, evaluation: { score: 7, feedback: "f", missing: [] } },
    { id: "t2", kind: "main" as const, question: "q2", askedAt: now },
  ];
  const base = { summary: "s", strengths: [], improvements: [], practicePlan: [] };
  assert.equal(logic.parseReport({ ...base, categories: [{ key: "communication", score: 80 }] }, hr.setup, meta, turns), null);
  const report = logic.parseReport(
    {
      ...base,
      categories: [
        { key: "communication", score: 80 },
        { key: "structure", score: 60 },
        { key: "role fit", score: 70 },
        { key: "problem-solving", score: 70 },
        { key: "technical", score: 10 },
      ],
      questionFeedback: [{ q: 1, expected: "e", improvedAnswer: "i", recommendations: ["r1", "r2", "r3"] }, { q: 2, expected: "x" }],
    },
    hr.setup,
    meta,
    turns,
  );
  assert.ok(report);
  assert.deepEqual(report.categories.map((c) => c.key), ["communication", "structure", "role_fit", "problem_solving"]);
  assert.equal(report.overallScore, 70, "category mean 70 blended with answer mean 70");
  assert.equal(report.readiness, "nearly_ready");
  assert.deepEqual(report.questionFeedback, [{ turnId: "t1", expected: "e", improvedAnswer: "i", recommendations: ["r1", "r2"] }]);
  assert.match(report.assessmentLabel, /AI practice assessment/);
  assert.equal(logic.parseReport({ ...base, summary: "", categories: report.categories }, hr.setup, meta), null);
});

test("overall score blends categories with per-answer scores; skips count as zero", () => {
  const cats = [{ key: "communication", label: "", score: 80, comment: "" }];
  const ev = (score: number) => ({ score, feedback: "f", missing: [] });
  const t = (extra: object) => ({ id: "x", kind: "main" as const, question: "q", askedAt: now, ...extra });
  assert.equal(logic.overallScoreFor(cats, []), 80);
  assert.equal(logic.overallScoreFor(cats, [t({ evaluation: ev(8) }), t({ skipped: true })]), 60);
  assert.equal(logic.overallScoreFor(cats, [t({ answer: "unevaluated" })]), 80);
  assert.deepEqual([85, 65, 45, 20].map(logic.readinessFor), ["ready", "nearly_ready", "needs_practice", "not_ready"]);
});

test("question and time limits stop the interview", () => {
  const turn = { id: "t", kind: "main" as const, question: "q", askedAt: now };
  const future = new Date(Date.now() + 60_000).toISOString();
  assert.equal(logic.canAskAnother({ turns: [turn], questionLimit: 5, endsAt: future }), true);
  assert.equal(logic.canAskAnother({ turns: Array(5).fill(turn), questionLimit: 5, endsAt: future }), false);
  assert.equal(logic.canAskAnother({ turns: [turn], questionLimit: 5, endsAt: new Date(Date.now() - 1).toISOString() }), false);
  assert.equal(logic.followUpAllowed([{ ...turn, answer: "a" }]), true);
  assert.equal(logic.followUpAllowed([{ ...turn, kind: "follow_up", answer: "a" }]), false);
});

/* ---------- API flow (Meetings) ---------- */

let meetingId = "";

test("unauthenticated requests are rejected", async () => {
  assert.equal((await mockRoute.POST(req(null, "/api/meetings/mock", "POST", { setup: SETUP, resumeText: RESUME }))).status, 401);
  assert.equal((await answer(null as unknown as Uid, "x", { turnId: "t" })).status, 401);
});

test("setup and resume are validated before any AI call", async () => {
  const calls = seenAuth.length;
  const noRole = await json(await mockRoute.POST(req("usr_a", "/api/meetings/mock", "POST", { setup: { ...SETUP, jobTitle: " " }, resumeText: RESUME })));
  assert.equal(noRole.status, 400);
  assert.match(noRole.body.error.message, /job role/);
  const noResume = await json(await create("usr_a", { resumeText: "hi" }));
  assert.equal(noResume.status, 400);
  assert.equal(noResume.body.error.code, "resume_required");
  assert.equal(seenAuth.length, calls);
});

test("start creates a mock interview meeting with one question, retry-safe and without resume text", async () => {
  const before = seenAuth.length;
  const { status, body, text } = await json(await create("usr_a", { clientRequestId: "req_start_0001" }));
  assert.equal(status, 201);
  assert.equal(body.created, true);
  const m = body.meeting;
  meetingId = m.id;
  assert.equal(m.kind, "mock_interview");
  assert.equal(m.status, "incomplete");
  assert.equal(m.title, "Mock Interview · Frontend Developer");
  assert.equal(m.mock.status, "active");
  assert.equal(m.mock.turns.length, 1);
  assert.equal(m.mock.questionLimit, 10);
  assert.equal(m.mock.turns[0].category, "project");
  assert.equal(m.mock.setup.difficulty, "beginner");
  assert.equal(m.mock.setup.interviewType, "technical");
  assert.ok(m.mock.welcome);
  assert.deepEqual(m.mock.profile.skills, ["JavaScript", "React", "SQL"]);
  assert.ok(!m.mock.profile.certifications.includes("Certified Kubernetes Administrator"));
  assert.ok(!text.includes("Jane Candidate"), "resume text must not be returned");
  assert.equal(seenAuth.at(-1), `Bearer ${USER_KEY}`, "uses the user's own API key");
  const opening = seenBodies.find((b) => b.includes("Start the interview")) || "";
  assert.ok(opening.includes("Expense Tracker"), "resume content feeds the questions");
  assert.ok(opening.includes("Build React UIs"), "job description feeds the questions");
  assert.match(opening, /PROJECT question/);

  const calls = seenAuth.length;
  assert.equal(calls - before, 2, "profile + opening question");
  const retry = await json(await create("usr_a", { clientRequestId: "req_start_0001" }));
  assert.equal(retry.status, 200);
  assert.equal(retry.body.created, false);
  assert.equal(retry.body.meeting.id, meetingId);
  assert.equal(seenAuth.length, calls, "retry makes no AI calls");
  const store = await readStore();
  assert.equal((store.meetings || []).filter((x) => x.clientRequestId === "req_start_0001").length, 1);
});

test("in-progress mock interviews appear in the user's Meetings history", async () => {
  const list = await json(await meetingsRoute.GET(req("usr_a", "/api/meetings")));
  const row = list.body.meetings.find((x) => x.id === meetingId);
  assert.ok(row);
  assert.equal(row.mockSummary.status, "active");
  assert.equal(row.mockSummary.questionCount, 1);
  assert.deepEqual(row.mockSummary.improvementAreas, []);
  assert.equal(row.mock, null, "list rows don't carry full interview detail");
});

test("the next question appears only after an answer; answers and evaluations are saved", async () => {
  const first = (await getMeeting("usr_a", meetingId)).body.meeting.mock;
  const { status, body } = await json(
    await answer("usr_a", meetingId, { turnId: first.turns[0].id, answer: "I built it with React and Express.", source: "voice" }),
  );
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.done, false);
  assert.equal(body.mock.turns.length, 2);
  assert.equal(body.mock.turns[0].evaluation.score, 6);
  assert.deepEqual(body.mock.turns[0].evaluation.missing, ["Impact metrics"]);
  assert.deepEqual(body.mock.turns[0].evaluation.correct, ["Named the React and Express stack"]);
  assert.equal(body.mock.turns[0].answerSource, "voice");
  assert.equal(body.mock.turns[1].kind, "main");
  assert.equal(body.mock.turns[1].category, logic.questionCategoryPlan(10)[1]);
  const lastPrompt = seenBodies.at(-1) || "";
  assert.ok(lastPrompt.includes("I built it with React and Express."), "previous answer feeds the next question");
  assert.ok(lastPrompt.includes("never repeat these"), "asked questions are listed to avoid repeats");
  assert.match(lastPrompt, /required category/);

  const saved = (await readStore()).meetings!.find((x) => x.id === meetingId)!;
  assert.equal(saved.mock!.turns[0].answer, "I built it with React and Express.");
});

test("answering an old question is rejected", async () => {
  const { status, body } = await json(await answer("usr_a", meetingId, { turnId: "nope", answer: "x" }));
  assert.equal(status, 409);
  assert.equal(body.error.code, "stale_turn");
});

test("evaluation failure keeps the answer, reports an error, and can be retried", async () => {
  const before = (await getMeeting("usr_a", meetingId)).body.meeting.mock;
  const turnId = last(before.turns).id;
  mode = "server_error";
  const failed = await json(await answer("usr_a", meetingId, { turnId, answer: "Normalized tables." }));
  mode = "ok";
  assert.equal(failed.status, 200);
  assert.equal(failed.body.error.code, "provider_error");
  assert.ok(!failed.text.includes("upstream exploded"), "provider error text is not exposed");
  const savedTurn = last(failed.body.mock.turns);
  assert.equal(savedTurn.answer, "Normalized tables.");
  assert.equal(savedTurn.evaluation, undefined);
  assert.ok(savedTurn.evaluationError);
  assert.equal(failed.body.mock.turns.length, before.turns.length);

  mode = "no_next";
  const noNext = await json(await answer("usr_a", meetingId, { turnId }));
  mode = "ok";
  assert.equal(noNext.status, 200);
  assert.equal(noNext.body.done, false, "a missing next question does not end the interview early");
  assert.equal(noNext.body.error.code, "next_question_failed");
  assert.equal(noNext.body.mock.status, "active");
  assert.equal(last(noNext.body.mock.turns).evaluation, undefined, "the answer stays ready to retry");

  const retried = await json(await answer("usr_a", meetingId, { turnId }));
  assert.equal(retried.status, 200);
  assert.equal(last(retried.body.mock.turns, 2).evaluation.score, 6);
  assert.equal(last(retried.body.mock.turns, 2).answer, "Normalized tables.");
});

test("only the owner runs the interview; admins see workspace records without private resume/JD", async () => {
  assert.equal((await meetingRoute.GET(req("usr_b", `/api/meetings/${meetingId}`), ctx(meetingId))).status, 404);
  assert.equal((await meetingRoute.GET(req("usr_c", `/api/meetings/${meetingId}`), ctx(meetingId))).status, 404);
  const adminView = await getMeeting("usr_admin", meetingId);
  assert.equal(adminView.status, 200);
  assert.equal(adminView.body.meeting.mock.isOwner, false);
  assert.equal(adminView.body.meeting.mock.profile, null);
  assert.equal(adminView.body.meeting.mock.setup.jobDescription, undefined);
  assert.ok(!adminView.text.includes("Build React UIs"));
  assert.ok(!adminView.text.includes("Example Institute of Technology"));
  const turnId = last(adminView.body.meeting.mock.turns).id;
  assert.equal((await answer("usr_admin", meetingId, { turnId, answer: "x" })).status, 404);
  assert.equal((await finish("usr_b", meetingId)).status, 404);
  assert.equal((await meetingRoute.PATCH(req("usr_a", `/api/meetings/${meetingId}`, "PATCH", { end: true }), ctx(meetingId))).status, 409);

  const mine = await json(await meetingsRoute.GET(req("usr_b", "/api/meetings")));
  assert.ok(!mine.body.meetings.some((x) => x.id === meetingId));
  assert.equal((await meetingsRoute.GET(req("usr_b", "/api/meetings?scope=workspace"))).status, 403);
  const ws = await json(await meetingsRoute.GET(req("usr_admin", "/api/meetings?scope=workspace")));
  assert.ok(ws.body.meetings.some((x) => x.id === meetingId && x.owner?.email === "usr_a@cueai.local"));
  const other = await json(await meetingsRoute.GET(req("usr_c", "/api/meetings?scope=workspace")));
  assert.ok(!other.body.meetings.some((x) => x.id === meetingId));
});

test("a user without a key never borrows another user's key", async () => {
  const before = seenAuth.length;
  const { status, body } = await json(await create("usr_b"));
  assert.equal(status, 503);
  assert.equal(body.error.code, "not_configured");
  assert.equal(seenAuth.length, before, "no provider call was made");
});

test("an invalid user key surfaces invalid_credentials and creates nothing", async () => {
  const count = (await readStore()).meetings!.length;
  mode = "unauthorized";
  const { status, body, text } = await json(await create("usr_a"));
  mode = "ok";
  assert.equal(status, 502);
  assert.equal(body.error.code, "invalid_credentials");
  assert.ok(!text.includes("Incorrect API key provided"));
  assert.equal((await readStore()).meetings!.length, count);
});

test("results are generated once, saved on the meeting, and survive a reload", async () => {
  mode = "bad_report";
  const bad = await json(await finish("usr_a", meetingId));
  mode = "ok";
  assert.equal(bad.status, 200);
  assert.equal(bad.body.mock.report, null);
  assert.equal(bad.body.mock.status, "completed");
  assert.match(bad.body.mock.reportError, /no score/i);

  const good = await json(await finish("usr_a", meetingId));
  const report = good.body.mock.report;
  assert.deepEqual(report.categories.map((c) => c.key), ["technical", "accuracy", "problem_solving", "communication", "structure"]);
  assert.equal(report.overallScore, 65, "category mean 70 blended with answer mean 60");
  assert.equal(report.readiness, "nearly_ready");
  assert.equal(report.readinessNote, "Close to ready; practice quantifying results.");
  assert.equal(report.strengths[0].evidence.startsWith("Q1"), true);
  assert.equal(report.questionFeedback.length, 1);
  assert.equal(report.questionFeedback[0].turnId, good.body.mock.turns[0].id);
  assert.deepEqual(report.questionFeedback[0].recommendations, ["State your role first", "Close with the result"]);
  assert.equal(report.improvements.length, 1, "areas without practice guidance are dropped");
  assert.equal(report.improvements[0].exercise.includes("Expense Tracker"), true);
  assert.deepEqual(report.practicePlan.map((p) => p.priority), [1, 2]);
  assert.deepEqual(report.practiceQuestions, ["How would you scale the Expense Tracker?"]);
  assert.equal(good.body.mock.reportError, null);

  const calls = seenAuth.length;
  const again = await json(await finish("usr_a", meetingId));
  assert.equal(seenAuth.length, calls, "saved results are never regenerated");
  assert.equal(again.body.mock.report.generatedAt, report.generatedAt);

  const reloaded = await getMeeting("usr_a", meetingId);
  assert.equal(reloaded.body.meeting.status, "completed");
  assert.equal(reloaded.body.meeting.summary, "Solid fundamentals with room to quantify impact.");
  assert.equal(reloaded.body.meeting.mock.report.overallScore, 65);
  assert.ok(reloaded.body.meeting.endedAt);

  const late = await answer("usr_a", meetingId, { turnId: last(good.body.mock.turns).id, answer: "late" });
  assert.equal(late.status, 409);

  const list = await json(await meetingsRoute.GET(req("usr_a", "/api/meetings")));
  const row = list.body.meetings.find((x) => x.id === meetingId);
  assert.ok(row);
  assert.equal(row.mockSummary.overallScore, 65);
  assert.equal(row.mockSummary.answeredCount, 2);
  assert.equal(row.mockSummary.questionCount, 3);
  assert.deepEqual(row.mockSummary.improvementAreas, [report.improvements[0].area]);
  assert.equal(row.summary, "Solid fundamentals with room to quantify impact.");
});

test("finishing with no answers generates no assessment", async () => {
  const created = await json(await create("usr_a"));
  const id = created.body.meeting.id;
  const calls = seenAuth.length;
  const done = await json(await finish("usr_a", id));
  assert.equal(done.body.mock.report, null);
  assert.match(done.body.mock.reportError, /No questions were answered/);
  assert.equal(seenAuth.length, calls, "no AI call for an empty interview");
});

test("stale active sessions show as interrupted; owner and admin can delete", async () => {
  const created = await json(await create("usr_a"));
  const id = created.body.meeting.id;
  const old = new Date(Date.now() - 3 * 3600_000).toISOString();
  await updateStore((s) => {
    const m = s.meetings!.find((x) => x.id === id)!;
    m.mock!.endsAt = old;
    m.mock!.updatedAt = old;
  });
  const view = await getMeeting("usr_a", id);
  assert.equal(view.body.meeting.mock.status, "interrupted");
  assert.equal((await answer("usr_a", id, { turnId: view.body.meeting.mock.turns[0].id, answer: "x" })).status, 409);

  assert.equal((await meetingRoute.DELETE(req("usr_b", `/api/meetings/${id}`, "DELETE"), ctx(id))).status, 404);
  assert.equal((await meetingRoute.DELETE(req("usr_admin", `/api/meetings/${id}`, "DELETE"), ctx(id))).status, 200);
  assert.equal((await meetingRoute.GET(req("usr_a", `/api/meetings/${id}`), ctx(id))).status, 404);
});

test("regular meetings keep their existing behavior", async () => {
  const created = await json(await meetingsRoute.POST(req("usr_a", "/api/meetings", "POST", { kind: "interview", company: "Acme" })));
  const id = created.body.meeting.id;
  assert.equal(created.body.meeting.kind, "interview");
  assert.equal(created.body.meeting.status, "live");
  assert.equal(created.body.meeting.mock, null);
  const ended = await json(
    await meetingRoute.PATCH(req("usr_a", `/api/meetings/${id}`, "PATCH", { summary: "Discussed React work." }), ctx(id)),
  );
  assert.equal(ended.body.meeting.status, "completed");
  const list = await json(await meetingsRoute.GET(req("usr_a", "/api/meetings")));
  const row = list.body.meetings.find((x) => x.id === id);
  assert.ok(row);
  assert.equal(row.mockSummary, null);
  assert.equal(row.summary, "Discussed React work.");
});

test("job description uploads are extracted without replacing the live-session resume", async () => {
  const upload = (name: string, purpose?: string) => {
    const form = new FormData();
    form.append("resume", new File(["Senior React role. Must know SQL, testing, and accessibility best practices."], name, { type: "text/plain" }));
    if (purpose) form.append("purpose", purpose);
    return new NextRequest("http://127.0.0.1:3000/api/resume/extract", { method: "POST", body: form, headers: { cookie: cookie("usr_b") } });
  };
  const jd = await json(await extractRoute.POST(upload("jd.txt", "job_description")));
  assert.equal(jd.status, 200);
  assert.match(jd.body.text, /Senior React role/);
  const store = await readStore();
  assert.equal(store.liveBriefings?.["ws_a:usr_b"]?.resumeText, undefined);
  assert.equal((await extractRoute.POST(upload("payload.exe"))).status, 415);
});

test("legacy standalone mock interviews migrate into Meetings once", async () => {
  const file = path.join(DATA_DIR, "workspace-store.json");
  const raw = JSON.parse(readFileSync(file, "utf8"));
  raw.mockInterviews = [
    {
      id: "mock_legacy01",
      workspaceId: "ws_a",
      userId: "usr_a",
      status: "completed",
      setup: { jobTitle: "Data Analyst", experienceLevel: "fresher", durationMin: 10, interviewType: "hr" },
      profile: { education: [], skills: [], experience: [], projects: [], certifications: [] },
      resumeText: RESUME,
      welcome: "Welcome",
      turns: [{ id: "t1", kind: "main", question: "Why data?", askedAt: now, answer: "I like SQL.", answeredAt: now, evaluation: { score: 5, feedback: "ok", missing: [] } }],
      questionLimit: 5,
      startedAt: now,
      endsAt: now,
      endedAt: now,
      updatedAt: now,
      report: { overallScore: 55, summary: "Legacy summary", categories: [], strengths: [], improvements: [{ area: "SQL", howToImprove: "Practice joins" }], practicePlan: [], generatedAt: now, provider: "groq", model: "m" },
    },
  ];
  writeFileSync(file, JSON.stringify(raw));
  const future = new Date(Date.now() + 5000);
  utimesSync(file, future, future);

  const view = await getMeeting("usr_a", "mock_legacy01");
  assert.equal(view.status, 200);
  const m = view.body.meeting;
  assert.equal(m.kind, "mock_interview");
  assert.equal(m.status, "completed");
  assert.equal(m.mock.setup.interviewType, "hr_behavioral");
  assert.equal(m.mock.setup.difficulty, "beginner");
  assert.equal(m.mock.report.overallScore, 55);
  assert.equal(m.mock.report.readiness, "needs_practice");
  assert.equal(m.mock.report.improvements[0].whatToPractice, "Practice joins");
  assert.equal(m.summary, "Legacy summary");
  const store = await readStore();
  assert.equal(store.mockInterviews, undefined);
  assert.equal(store.meetings!.filter((x) => x.id === "mock_legacy01").length, 1);
});
