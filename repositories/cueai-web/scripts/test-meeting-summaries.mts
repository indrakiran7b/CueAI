import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { NextRequest } from "next/server";
import type { StoredMeeting } from "../src/lib/meetings-client";

process.env.CUEAI_DATA_DIR = mkdtempSync(path.join(tmpdir(), "cueai-meetings-"));
process.env.AUTH_SECRET = "test-meeting-summaries-secret-0123456789";
process.env.CUEAI_ENV = "test";
process.env.NEXT_PUBLIC_SKIP_AUTH = "false";
process.env.NEXT_PUBLIC_AUTH_BYPASS = "false";
process.env.CUEAI_BOOTSTRAP_ADMIN_ENABLED = "false";

const { updateStore } = await import("../src/lib/server/db");
const { signSession, SESSION_COOKIE } = await import("../src/lib/server/session");
const listRoute = await import("../src/app/api/meetings/route");
const itemRoute = await import("../src/app/api/meetings/[id]/route");

const USERS = {
  usr_a: { role: "User", workspaceId: "ws_a" },
  usr_b: { role: "User", workspaceId: "ws_a" },
  usr_admin: { role: "Admin", workspaceId: "ws_a" },
  usr_other_admin: { role: "Admin", workspaceId: "ws_b" },
} as const;
type Uid = keyof typeof USERS;

const base = Date.parse("2026-01-01T10:00:00Z");
const QUESTION_COUNT = 120;
const answers = Array.from({ length: QUESTION_COUNT }, (_, i) => ({
  prompt: `Question number ${i + 1}?`,
  answer: i === 3 ? "" : `Answer number ${i + 1}.`,
  status: i === 7 ? ("failed" as const) : ("ok" as const),
  at: new Date(base + (QUESTION_COUNT - i) * 1000).toISOString(),
}));

function meeting(id: string, userId: string, workspaceId: string) {
  return {
    id,
    workspaceId,
    userId,
    title: `Meeting ${id}`,
    kind: "interview" as const,
    status: "completed" as const,
    startedAt: new Date(base).toISOString(),
    endedAt: new Date(base + 1800_000).toISOString(),
    durationSec: 1800,
    attendees: 2,
    tags: [],
    resumeText: "PRIVATE RESUME TEXT",
    jobDescription: "PRIVATE JD",
    transcript: [],
    answers: id === "m_a" ? answers : [],
    summary: "Short summary.",
  };
}

await updateStore((s) => {
  s.workspace.id = "ws_a";
  s.users = (Object.keys(USERS) as Uid[]).map((id) => ({
    id,
    name: id,
    email: `${id}@cueai.local`,
    passwordHash: "x",
    role: USERS[id].role,
    status: "Active" as const,
    workspaceId: USERS[id].workspaceId,
    createdAt: new Date(base).toISOString(),
    plan: "free" as const,
  }));
  s.meetings = [meeting("m_a", "usr_a", "ws_a"), meeting("m_b", "usr_b", "ws_a"), meeting("m_x", "usr_other_admin", "ws_b")];
});

function req(uid: Uid, url: string) {
  const u = USERS[uid];
  const token = signSession({ userId: uid, email: `${uid}@cueai.local`, name: uid, role: u.role, workspaceId: u.workspaceId, workspace: u.workspaceId });
  return new NextRequest(`http://127.0.0.1:3000${url}`, { headers: { cookie: `${SESSION_COOKIE}=${token}` } });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

type ApiMeeting = StoredMeeting & { resumeText?: string | null; jobDescription?: string | null };

test("owner sees every question and answer in order, with unavailable answers marked", async () => {
  const res = await itemRoute.GET(req("usr_a", "/api/meetings/m_a"), ctx("m_a"));
  assert.equal(res.status, 200);
  const { meeting: m } = (await res.json()) as { meeting: ApiMeeting };
  assert.equal(m.answers.length, QUESTION_COUNT, "no truncation");
  assert.equal(m.hasMore, false);
  assert.equal(m.answers[0].prompt, `Question number ${QUESTION_COUNT}?`, "sorted by time ascending");
  const q4 = m.answers.find((a) => a.prompt === "Question number 4?");
  const q8 = m.answers.find((a) => a.prompt === "Question number 8?");
  assert.equal(q4?.status, "unavailable");
  assert.equal(q8?.status, "unavailable");
  assert.equal(m.answers.filter((a) => a.status === "answered").length, QUESTION_COUNT - 2);
  assert.equal(m.resumeText, "PRIVATE RESUME TEXT");
  assert.equal(m.summary, "Short summary.");
});

test("members cannot read each other's meetings", async () => {
  assert.equal((await itemRoute.GET(req("usr_b", "/api/meetings/m_a"), ctx("m_a"))).status, 404);
  const list = (await (await listRoute.GET(req("usr_b", "/api/meetings"))).json()) as { meetings: ApiMeeting[] };
  assert.deepEqual(list.meetings.map((m) => m.id), ["m_b"]);
  assert.equal((await listRoute.GET(req("usr_b", "/api/meetings?scope=workspace"))).status, 403);
});

test("admins see workspace meetings with owners, but not private resume or JD text", async () => {
  const res = await itemRoute.GET(req("usr_admin", "/api/meetings/m_a"), ctx("m_a"));
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(!text.includes("PRIVATE RESUME TEXT"));
  assert.ok(!text.includes("PRIVATE JD"));
  const m = (JSON.parse(text) as { meeting: ApiMeeting }).meeting;
  assert.equal(m.answers.length, QUESTION_COUNT);
  assert.equal(m.owner?.email, "usr_a@cueai.local");

  const ws = (await (await listRoute.GET(req("usr_admin", "/api/meetings?scope=workspace"))).json()) as { meetings: ApiMeeting[] };
  assert.deepEqual(ws.meetings.map((x) => x.id).sort(), ["m_a", "m_b"]);
  const own = (await (await listRoute.GET(req("usr_admin", "/api/meetings"))).json()) as { meetings: ApiMeeting[] };
  assert.equal(own.meetings.length, 0, "default list is the admin's own meetings");
});

test("admins of another workspace cannot read these meetings", async () => {
  assert.equal((await itemRoute.GET(req("usr_other_admin", "/api/meetings/m_a"), ctx("m_a"))).status, 404);
  const ws = (await (await listRoute.GET(req("usr_other_admin", "/api/meetings?scope=workspace"))).json()) as { meetings: ApiMeeting[] };
  assert.deepEqual(ws.meetings.map((x) => x.id), ["m_x"]);
});
