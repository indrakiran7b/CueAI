import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { NextRequest } from "next/server";

const DATA_DIR = mkdtempSync(path.join(tmpdir(), "cueai-live-modes-"));
process.env.CUEAI_DATA_DIR = DATA_DIR;
process.env.AUTH_SECRET = "test-live-modes-secret-0123456789abc";
process.env.CUEAI_SECRET_ENCRYPTION_KEY = "test-live-modes-encryption-key-0123456789";
process.env.CUEAI_ENV = "test";
process.env.CUEAI_LIVE_ANSWER_LOCAL = "1";
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

const USER_KEY = "sk-test-live-modes-user-key-7f6e5d4c";
const USER_MODEL = "user-selected-model-1";
const ANSWER_TOKENS = ["A Python decorator ", "wraps a function ", "to add behavior."];

/* ---------- Test-only OpenAI-compatible provider (SSE) ---------- */

type Mode = "ok" | "unauthorized";
let mode: Mode = "ok";
type Seen = { auth: string; body: { model?: string; stream?: boolean; messages: { role: string; content: string }[] } };
const seen: Seen[] = [];

const fake = createServer((req: IncomingMessage, res: ServerResponse) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    seen.push({ auth: String(req.headers.authorization || ""), body: JSON.parse(raw) });
    if (mode === "unauthorized") {
      res.writeHead(401, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: { message: "Incorrect API key provided" } }));
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    for (const t of ANSWER_TOKENS) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 40, completion_tokens: 9 } })}\n\n`);
    res.end("data: [DONE]\n\n");
  });
});
await new Promise<void>((resolve) => fake.listen(0, "127.0.0.1", resolve));
const fakeUrl = `http://127.0.0.1:${(fake.address() as AddressInfo).port}/v1`;
after(() => fake.close());

/* ---------- App modules ---------- */

const logic = await import("../src/lib/mock-interview-logic");
const { updateStore, readStore } = await import("../src/lib/server/db");
const { signSession, SESSION_COOKIE, encryptSecret } = await import("../src/lib/server/session");
const answerRoute = await import("../src/app/api/live/answer/route");

const now = new Date().toISOString();
const USERS = {
  usr_a: { name: "User A", role: "User", workspaceId: "ws_a" },
  usr_b: { name: "User B", role: "User", workspaceId: "ws_a" },
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
      name: "Settings key",
      provider: "openai",
      model: USER_MODEL,
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
  s.meetings = [
    {
      id: "mtg_live_a",
      workspaceId: "ws_a",
      userId: "usr_a",
      title: "Real interview",
      kind: "interview",
      status: "live",
      startedAt: now,
      durationSec: 0,
      attendees: 1,
      tags: ["Interview"],
      transcript: [],
      answers: [{ prompt: "EARLIER_MEETING_QUESTION about Kafka", answer: "Earlier answer.", at: now }],
    },
  ];
});

function cookie(uid: Uid) {
  const u = USERS[uid];
  const token = signSession({ userId: uid, email: `${uid}@cueai.local`, name: u.name, role: u.role, workspaceId: u.workspaceId, workspace: u.workspaceId });
  return `${SESSION_COOKIE}=${token}`;
}

function ask(uid: Uid | null, body: Record<string, unknown>) {
  return answerRoute.POST(
    new NextRequest("http://127.0.0.1:3000/api/live/answer", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream", ...(uid ? { cookie: cookie(uid) } : {}) },
      body: JSON.stringify({ stream: true, mode: "answer", ...body }),
    }),
  );
}

type Event = { type: string; text?: string; answer?: string; error?: string; model?: string; provider?: string };

async function events(res: Response): Promise<{ status: number; events: Event[]; raw: string }> {
  const raw = await res.text();
  assert.ok(!raw.includes(USER_KEY), "responses must never contain the API key");
  const list = raw
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => JSON.parse(l.slice(5).trim()) as Event);
  return { status: res.status, events: list, raw };
}

const promptOf = (s: Seen) => s.body.messages.map((m) => m.content).join("\n");
const systemOf = (s: Seen) => s.body.messages.find((m) => m.role === "system")?.content || "";

async function meetingAnswers() {
  const store = await readStore();
  return (store.meetings || []).find((m) => m.id === "mtg_live_a")!.answers.map((a) => a.prompt);
}

/* ---------- Tests ---------- */

test("live answers require sign-in", async () => {
  const res = await ask(null, { prompt: "What is a Python decorator?" });
  assert.equal(res.status, 401);
});

test("Regular Interview streams with the key, provider and model saved in Settings", async () => {
  mode = "ok";
  const before = seen.length;
  const { status, events: list } = await events(await ask("usr_a", { prompt: "What is a Python decorator?" }));
  assert.equal(status, 200);
  const call = seen[before];
  assert.ok(call, "the provider was called");
  assert.equal(call.auth, `Bearer ${USER_KEY}`, "the user's saved key reaches the provider");
  assert.equal(call.body.model, USER_MODEL, "the model chosen in Settings is used");
  assert.equal(call.body.stream, true);
  const tokens = list.filter((e) => e.type === "token").map((e) => e.text).join("");
  assert.equal(tokens, ANSWER_TOKENS.join(""));
  const done = list.find((e) => e.type === "done");
  assert.equal(done?.answer, ANSWER_TOKENS.join("").trim());
  assert.equal(done?.model, USER_MODEL);
  assert.match(promptOf(call), /EARLIER_MEETING_QUESTION/, "a regular session keeps the live meeting's earlier questions");
});

test("Regular Interview answers are saved to the active live meeting", async () => {
  for (let i = 0; i < 40 && !(await meetingAnswers()).includes("What is a Python decorator?"); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.ok((await meetingAnswers()).includes("What is a Python decorator?"));
});

test("Test CueAI uses the same system instructions and model, without touching the live meeting", async () => {
  mode = "ok";
  const before = seen.length;
  const { status, events: list } = await events(
    await ask("usr_a", { prompt: "What is a Python decorator?", test: true }),
  );
  assert.equal(status, 200);
  const regular = seen[before - 1]!;
  const testCall = seen[before]!;
  assert.equal(systemOf(testCall), systemOf(regular), "identical answer instructions");
  assert.equal(testCall.body.model, regular.body.model, "identical model");
  assert.equal(testCall.auth, regular.auth, "identical credentials");
  assert.ok(!/EARLIER_MEETING_QUESTION/.test(promptOf(testCall)), "test questions don't borrow a live meeting's history");
  assert.equal(list.find((e) => e.type === "done")?.answer, ANSWER_TOKENS.join("").trim());

  await new Promise((r) => setTimeout(r, 300));
  const saved = await meetingAnswers();
  assert.equal(saved.filter((p) => p === "What is a Python decorator?").length, 1, "test answers are not added to the meeting");
});

test("follow-up questions carry the earlier test answers as context", async () => {
  const before = seen.length;
  await events(
    await ask("usr_a", {
      prompt: "Can you give an example of that?",
      test: true,
      history: [{ question: "What is a Python decorator?", answer: "A Python decorator wraps a function." }],
    }),
  );
  assert.match(promptOf(seen[before]!), /What is a Python decorator\?/);
});

test("an invalid saved key reports a clear error and streams no answer", async () => {
  mode = "unauthorized";
  const { status, events: list } = await events(await ask("usr_a", { prompt: "What is REST?", test: true }));
  mode = "ok";
  assert.equal(status, 200);
  assert.equal(list.some((e) => e.type === "token"), false);
  const err = list.find((e) => e.type === "error");
  assert.ok(err?.error, "an error event is sent");
  assert.doesNotMatch(err!.error!, /busy/i, "the key problem is not disguised as a busy provider");
});

test("a user without a key and no server keys gets 'not configured', never another user's key", async () => {
  const before = seen.length;
  const res = await ask("usr_b", { prompt: "What is REST?", test: true });
  assert.equal(res.status, 503);
  assert.equal(seen.length, before, "no provider call was made");
});

test("mock interviews started from Live Session are titled and tagged as mock interviews", () => {
  const normalized = logic.normalizeSetup({ jobTitle: "Data Analyst", origin: "interview_prep" });
  assert.ok("setup" in normalized);
  assert.equal(normalized.setup.origin, "live_session");
  assert.equal(logic.mockMeetingTitle(normalized.setup), "Mock Interview · Data Analyst");
});
