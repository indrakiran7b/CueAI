import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { NextRequest } from "next/server";

const DATA_DIR = mkdtempSync(path.join(tmpdir(), "cueai-user-tokens-"));
process.env.CUEAI_DATA_DIR = DATA_DIR;
process.env.AUTH_SECRET = "test-user-tokens-secret-0123456789abc";
process.env.CUEAI_ENV = "test";
process.env.NEXT_PUBLIC_SKIP_AUTH = "false";
process.env.NEXT_PUBLIC_AUTH_BYPASS = "false";
process.env.CUEAI_BOOTSTRAP_ADMIN_ENABLED = "false";

const { updateStore, readStore } = await import("../src/lib/server/db");
const { signSession, SESSION_COOKIE } = await import("../src/lib/server/session");
const lib = await import("../src/lib/server/user-token-usage");
const route = await import("../src/app/api/admin/usage/users/route");
const workspaceUsageRoute = await import("../src/app/api/admin/usage/route");

const USERS = {
  usr_admin: { name: "Ada Admin", role: "Admin", workspaceId: "ws_a" },
  usr_mgr: { name: "Max Manager", role: "Manager", workspaceId: "ws_a" },
  usr_a: { name: "Alice", role: "User", workspaceId: "ws_a" },
  usr_b: { name: "Bob", role: "User", workspaceId: "ws_a" },
  usr_other: { name: "Olga Other", role: "Admin", workspaceId: "ws_b" },
} as const;
type Uid = keyof typeof USERS;

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const SECRET_PROMPT = "PRIVATE_PROMPT_CONTENT should never be returned";

let seq = 0;
function ev(e: {
  userId: string;
  at: string;
  quantity: number;
  input?: number;
  output?: number;
  provider?: string;
  model?: string;
  feature?: string;
  test?: boolean;
  type?: "tokens" | "meeting_minutes" | "resume_rewrite";
  workspaceId?: string;
}) {
  return {
    id: `use_${++seq}`,
    workspaceId: e.workspaceId || "ws_a",
    userId: e.userId,
    userName: e.userId ? USERS[e.userId as Uid]?.name || e.userId : "Legacy",
    type: e.type || ("tokens" as const),
    quantity: e.quantity,
    inputTokens: e.input,
    outputTokens: e.output,
    provider: e.provider,
    model: e.model,
    metadata: { ...(e.feature ? { feature: e.feature } : {}), ...(e.test ? { test: true } : {}), prompt: SECRET_PROMPT },
    createdAt: e.at,
  };
}

const EVENTS = [
  ev({ userId: "usr_a", at: ago(0), quantity: 300, input: 200, output: 100, provider: "groq", model: "gpt-oss-20b", feature: "live_answer_stream" }),
  ev({ userId: "usr_a", at: ago(0), quantity: 50, input: 30, output: 20, provider: "groq", model: "gpt-oss-20b", feature: "live_answer_stream", test: true }),
  ev({ userId: "usr_a", at: ago(3), quantity: 1000, input: 700, output: 300, provider: "gemini", model: "gemini-2.5-flash", feature: "mock_interview" }),
  ev({ userId: "usr_a", at: ago(5), quantity: 1, input: 0, output: 0, provider: "openai", model: "gpt-4o-mini", feature: "live_answer" }),
  ev({ userId: "usr_a", at: ago(20), quantity: 4000, input: 2400, output: 1600, provider: "gemini", model: "gemini-2.5-flash", feature: "resume_analyze" }),
  ev({ userId: "usr_a", at: ago(60), quantity: 600, provider: "groq", model: "whisper-large-v3", feature: "transcribe" }),
  ev({ userId: "usr_a", at: ago(1), quantity: 9, type: "meeting_minutes", feature: "transcribe" }),
  ev({ userId: "usr_a", at: ago(1), quantity: 77777, input: 1, output: 1, provider: "groq", model: "x", workspaceId: "ws_b" }),
  ev({ userId: "", at: ago(2), quantity: 450, input: 300, output: 150, provider: "groq", model: "legacy" }),
  ...Array.from({ length: 30 }, (_, i) =>
    ev({ userId: "usr_b", at: new Date(Date.now() - i * 1000).toISOString(), quantity: 10, input: 6, output: 4, provider: "openai", model: "gpt-4o-mini", feature: "live_answer" }),
  ),
];

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
    createdAt: ago(90),
    plan: "free" as const,
  }));
  s.usage = [...EVENTS].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
});
const usageBefore = JSON.stringify((await readStore()).usage);

function get(uid: Uid | null, query: Record<string, string> = {}, url = "/api/admin/usage/users") {
  const u = uid ? USERS[uid] : null;
  const cookie = u
    ? `${SESSION_COOKIE}=${signSession({ userId: uid!, email: `${uid}@cueai.local`, name: u.name, role: u.role, workspaceId: u.workspaceId, workspace: u.workspaceId })}`
    : "";
  return new NextRequest(`http://127.0.0.1:3000${url}?${new URLSearchParams(query)}`, { headers: cookie ? { cookie } : {} });
}

type Report = NonNullable<ReturnType<typeof lib.buildUserTokenReport>>;
async function call(uid: Uid | null, query: Record<string, string> = {}) {
  const res = await route.GET(get(uid, query));
  const text = await res!.text();
  return {
    status: res!.status,
    text,
    body: JSON.parse(text) as { users?: { id: string; name: string; email: string }[]; report?: Report | null; unassigned?: { requests: number; totalTokens: number }; error?: string },
  };
}

test("only workspace admins and managers can use the API", async () => {
  assert.equal((await call(null)).status, 401);
  assert.equal((await call("usr_a")).status, 403, "a regular user is forbidden");
  assert.equal((await call("usr_a", { userId: "usr_a" })).status, 403, "even for their own ID");
  assert.equal((await call("usr_admin")).status, 200);
  assert.equal((await call("usr_mgr")).status, 200);
});

test("the API is read-only", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal((route as Record<string, unknown>)[method], undefined, `${method} is not exported`);
  }
});

test("the user list contains only real users of the caller's workspace", async () => {
  const { body } = await call("usr_admin");
  assert.deepEqual(body.users!.map((u) => u.id).sort(), ["usr_a", "usr_admin", "usr_b", "usr_mgr"]);
  assert.equal(body.users!.find((u) => u.id === "usr_a")!.email, "usr_a@cueai.local");
  assert.equal(body.report, null, "nothing is selected until a user is chosen");
});

test("users from other workspaces or unknown IDs cannot be queried", async () => {
  assert.equal((await call("usr_admin", { userId: "usr_other" })).status, 404);
  assert.equal((await call("usr_admin", { userId: "usr_nope" })).status, 404);
  const other = await call("usr_other", { userId: "usr_a", range: "all" });
  assert.equal(other.status, 404, "a ws_b admin cannot read a ws_a user");
});

test("totals use only the selected user's token events, per date range", async () => {
  const expect = {
    today: { total: 350, input: 230, output: 120, requests: 2 },
    "7d": { total: 1351, input: 930, output: 420, requests: 4 },
    "30d": { total: 5351, input: 3330, output: 2020, requests: 5 },
    all: { total: 5951, input: 3330, output: 2020, requests: 6 },
  } as const;
  for (const [range, want] of Object.entries(expect)) {
    const { body } = await call("usr_admin", { userId: "usr_a", range });
    const s = body.report!.summary;
    assert.deepEqual(
      { total: s.totalTokens, input: s.inputTokens, output: s.outputTokens, requests: s.requests },
      want,
      `range ${range}`,
    );
    assert.equal(body.report!.overTime.reduce((sum, d) => sum + d.quantity, 0), want.total, `chart matches cards for ${range}`);
    assert.equal(body.report!.recent.total, want.requests, `table matches cards for ${range}`);
    assert.equal(
      body.report!.byProviderModel.reduce((sum, r) => sum + r.totalTokens, 0),
      want.total,
      `breakdown matches cards for ${range}`,
    );
  }
  const { body: week } = await call("usr_admin", { userId: "usr_a", range: "7d" });
  assert.equal(week.report!.overTime.length, 7, "7-day chart has one bar per day, zeros included");
});

test("all-time totals match the existing workspace Token Usage page", async () => {
  const res = await workspaceUsageRoute.GET(get("usr_admin", { type: "tokens" }, "/api/admin/usage"));
  const workspace = (await res!.json()) as { allTime: { total: number; byUser: { userId: string; quantity: number; events: number }[] } };
  for (const uid of ["usr_a", "usr_b"] as const) {
    const { body } = await call("usr_admin", { userId: uid, range: "all" });
    const row = workspace.allTime.byUser.find((r) => r.userId === uid)!;
    assert.equal(body.report!.summary.totalTokens, row.quantity, `${uid} total matches`);
    assert.equal(body.report!.summary.requests, row.events, `${uid} request count matches`);
  }
});

test("provider/model breakdown and feature labels come from recorded metadata", async () => {
  const { body } = await call("usr_admin", { userId: "usr_a", range: "30d" });
  const r = body.report!;
  const gemini = r.byProviderModel.find((x) => x.provider === "gemini")!;
  assert.deepEqual(
    { model: gemini.model, input: gemini.inputTokens, output: gemini.outputTokens, total: gemini.totalTokens, requests: gemini.requests },
    { model: "gemini-2.5-flash", input: 3100, output: 1900, total: 5000, requests: 2 },
  );
  const features = r.recent.items.map((i) => i.feature).sort();
  assert.deepEqual(features, ["Live Session", "Live Session", "Mock Interview", "Resume Tailor", "Test CueAI"]);
});

test("estimates and missing provider counts are flagged, not hidden or invented", async () => {
  const { body } = await call("usr_admin", { userId: "usr_a", range: "all" });
  const s = body.report!.summary;
  assert.equal(s.estimatedRequests, 2, "Resume Tailor and Transcription record estimates");
  assert.equal(s.estimatedTokens, 4600);
  assert.equal(s.missingCountRequests, 1, "the live answer without provider counts");
  const missing = body.report!.recent.items.find((i) => i.countsMissing)!;
  assert.deepEqual([missing.inputTokens, missing.outputTokens, missing.totalTokens], [0, 0, 1]);
  const transcribe = body.report!.recent.items.find((i) => i.feature === "Transcription")!;
  assert.equal(transcribe.estimated, true);
  assert.equal(transcribe.countsMissing, false);
});

test("unassigned historical usage is reported separately and never attributed to a user", async () => {
  const { body } = await call("usr_admin", { userId: "usr_b", range: "7d" });
  assert.deepEqual(body.unassigned, { requests: 1, totalTokens: 450 });
  assert.ok(!body.report!.byProviderModel.some((r) => r.model === "legacy"));
  const none = await call("usr_admin", { range: "today" });
  assert.deepEqual(none.body.unassigned, { requests: 0, totalTokens: 0 });
});

test("an empty user shows zero usage without fake values", async () => {
  const { body } = await call("usr_admin", { userId: "usr_mgr", range: "all" });
  assert.deepEqual(body.report!.summary, {
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    requests: 0,
    estimatedTokens: 0,
    estimatedRequests: 0,
    missingCountRequests: 0,
  });
  assert.deepEqual(body.report!.byProviderModel, []);
  assert.deepEqual(body.report!.recent.items, []);
});

test("recent usage is paginated newest first", async () => {
  const p1 = (await call("usr_admin", { userId: "usr_b", range: "today", page: "1" })).body.report!.recent;
  const p2 = (await call("usr_admin", { userId: "usr_b", range: "today", page: "2" })).body.report!.recent;
  assert.equal(p1.total, 30);
  assert.equal(p1.totalPages, 2);
  assert.equal(p1.items.length, lib.RECENT_PAGE_SIZE);
  assert.equal(p2.items.length, 30 - lib.RECENT_PAGE_SIZE);
  assert.ok(p1.items[0]!.createdAt >= p1.items.at(-1)!.createdAt);
  const clamped = (await call("usr_admin", { userId: "usr_b", range: "today", page: "99" })).body.report!.recent;
  assert.equal(clamped.page, 2);
});

test("responses never include request contents and nothing is modified", async () => {
  const { text } = await call("usr_admin", { userId: "usr_a", range: "all" });
  assert.ok(!text.includes("PRIVATE_PROMPT_CONTENT"));
  assert.ok(!text.includes("passwordHash"));
  assert.equal(JSON.stringify((await readStore()).usage), usageBefore);
});

test("date ranges use UTC days", () => {
  const now = new Date("2026-10-22T01:30:00Z");
  assert.equal(lib.rangeStartDay("today", now), "2026-10-22");
  assert.equal(lib.rangeStartDay("7d", now), "2026-10-16");
  assert.equal(lib.rangeStartDay("30d", now), "2026-09-23");
  assert.equal(lib.rangeStartDay("all", now), null);
  assert.equal(lib.parseRange("bogus"), "30d");
});
