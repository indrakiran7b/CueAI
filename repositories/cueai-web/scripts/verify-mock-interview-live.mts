/**
 * Manual end-to-end mock interview (Meetings) against the real app-managed provider chain.
 * Uses a synthetic resume and a temporary data store. Prints questions, codes and timings only.
 * Usage: npx tsx --tsconfig tsconfig.json scripts/verify-mock-interview-live.mts
 */
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import type { StoredMeeting } from "../src/lib/meetings-client";
import type { MockInterviewPublic } from "../src/lib/mock-interview-types";

type ErrorBody = { error?: { code: string; message: string } };
type StartBody = ErrorBody & { meeting: StoredMeeting & { mock: MockInterviewPublic } };
type AnswerBody = ErrorBody & { mock: MockInterviewPublic; done: boolean };
type FinishBody = ErrorBody & { mock?: MockInterviewPublic };
type MeetingBody = ErrorBody & { meeting?: StoredMeeting };

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
process.env.CUEAI_DATA_DIR = mkdtempSync(path.join(tmpdir(), "cueai-mock-live-"));
process.env.CUEAI_ENV = "test";
process.env.NEXT_PUBLIC_SKIP_AUTH = "false";
process.env.NEXT_PUBLIC_AUTH_BYPASS = "false";
process.env.CUEAI_BOOTSTRAP_ADMIN_ENABLED = "false";

const { updateStore } = await import("../src/lib/server/db");
const { signSession, SESSION_COOKIE } = await import("../src/lib/server/session");
const mockRoute = await import("../src/app/api/meetings/mock/route");
const meetingRoute = await import("../src/app/api/meetings/[id]/route");
const answerRoute = await import("../src/app/api/meetings/[id]/mock/answer/route");
const finishRoute = await import("../src/app/api/meetings/[id]/mock/finish/route");

const RESUME = `Sam Example
B.Sc. Computer Science, Sample University, 2025
Skills: Python, Flask, SQL, Git, HTML, CSS
Internship: Backend Intern at Demo Corp (May 2024 - Jul 2024) - built REST endpoints in Flask
Projects: Library Manager - a Flask and SQLite web app for tracking book loans
Certifications: none listed`;

await updateStore((s) => {
  s.workspace.id = "ws_v";
  s.users = [{ id: "usr_v", name: "Verifier", email: "v@cueai.local", passwordHash: "x", role: "User", status: "Active", workspaceId: "ws_v", createdAt: new Date().toISOString(), plan: "free" }];
});
const token = signSession({ userId: "usr_v", email: "v@cueai.local", name: "Verifier", role: "User", workspaceId: "ws_v", workspace: "ws_v" });
const r = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://127.0.0.1:3000${url}`, {
    method,
    headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${token}` },
    ...(method === "GET" ? {} : { body: JSON.stringify(body ?? {}) }),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
async function timed<T>(label: string, fn: () => Promise<Response>) {
  const t = Date.now();
  const res = await fn();
  const body = (await res.json()) as T;
  console.log(`${label}: HTTP ${res.status} in ${Date.now() - t} ms`);
  return { res, body };
}

const created = await timed<StartBody>("start", () =>
  mockRoute.POST(
    r("/api/meetings/mock", {
      clientRequestId: `verify${Date.now()}`,
      setup: { jobTitle: "Junior Backend Developer", difficulty: "beginner", durationMin: 10, interviewType: "project" },
      resumeText: RESUME,
    }),
  ),
);
if (!created.res.ok) throw new Error(JSON.stringify(created.body.error));
const meetingId: string = created.body.meeting.id;
let mock = created.body.meeting.mock;
console.log("  welcome:", mock.welcome);
console.log("  profile:", JSON.stringify(mock.profile));

const { generateAi } = await import("../src/lib/server/ai-router");
async function candidateAnswer(question: string, strong: boolean) {
  if (!strong) return "I'm not sure.";
  const out = await generateAi({
    feature: "translation",
    workspaceId: "ws_v",
    system: "You are a junior backend candidate. Answer concretely in 3-4 sentences using only Python, Flask, SQLite/SQL and the Library Manager project; say what you would do if you haven't done it.",
    prompt: question,
    maxOutputTokens: 400,
  });
  return out.text.trim();
}
const plan = [true, true, false];
for (let i = 0; i < plan.length; i++) {
  const turn = mock.turns[mock.turns.length - 1]!;
  console.log(`  Q${mock.turns.length}/${mock.questionLimit} [${turn.kind}]: ${turn.question}`);
  const answer = await candidateAnswer(turn.question, plan[i]!);
  console.log(`    A (${plan[i] ? "on-topic" : "non-answer"}): ${answer.slice(0, 160)}…`);
  const out = await timed<AnswerBody>(`answer ${i + 1}`, () =>
    answerRoute.POST(r(`/api/meetings/${meetingId}/mock/answer`, { turnId: turn.id, answer }), ctx(meetingId)),
  );
  if (!out.res.ok) throw new Error(JSON.stringify(out.body.error));
  mock = out.body.mock;
  const evaluated = mock.turns.find((t) => t.id === turn.id);
  console.log(`    score=${evaluated?.evaluation?.score ?? "none"} error=${out.body.error?.code ?? "none"} done=${out.body.done}`);
  if (out.body.done) break;
}

const fin = await timed<FinishBody>("finish", () => finishRoute.POST(r(`/api/meetings/${meetingId}/mock/finish`), ctx(meetingId)));
const rep = fin.body.mock?.report;
if (rep) {
  console.log(`  overall=${rep.overallScore} readiness=${rep.readiness} provider=${rep.provider}/${rep.model}`);
  console.log(`  categories=${rep.categories.map((c) => `${c.key}:${c.score}`).join(", ")}`);
  console.log(
    `  strengths=${rep.strengths.length} questionFeedback=${rep.questionFeedback.length} improvements=${rep.improvements.length} plan=${rep.practicePlan.length} practiceQuestions=${rep.practiceQuestions.length}`,
  );
  console.log(`  first improvement: ${JSON.stringify(rep.improvements[0] ?? null)}`);
  console.log(`  feedback Q1: ${JSON.stringify(rep.questionFeedback[0] ?? null)}`);
} else {
  console.log("  no report:", fin.body.mock?.reportError ?? JSON.stringify(fin.body.error));
}

const reread = await timed<MeetingBody>("reload meeting", () => meetingRoute.GET(r(`/api/meetings/${meetingId}`, undefined, "GET"), ctx(meetingId)));
console.log(`  saved: status=${reread.body.meeting?.status} kind=${reread.body.meeting?.kind} score=${reread.body.meeting?.mock?.report?.overallScore ?? "none"}`);
