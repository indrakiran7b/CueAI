import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { NextRequest } from "next/server";

const DATA_DIR = mkdtempSync(path.join(tmpdir(), "cueai-profile-"));
process.env.CUEAI_DATA_DIR = DATA_DIR;
process.env.AUTH_SECRET = "test-profile-secret-0123456789abcdef";
process.env.CUEAI_SECRET_ENCRYPTION_KEY = "test-profile-encryption-key-0123456789";
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

const USER_KEY = "sk-test-profile-user-key-1a2b3c4d";

/* ---------- Test-only OpenAI-compatible provider (JSON + SSE) ---------- */

type Seen = { auth: string; prompt: string; system: string };
const seen: Seen[] = [];

const fake = createServer((req: IncomingMessage, res: ServerResponse) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = JSON.parse(raw) as { stream?: boolean; messages: { role: string; content: string }[] };
    seen.push({
      auth: String(req.headers.authorization || ""),
      prompt: body.messages.map((m) => m.content).join("\n"),
      system: body.messages.find((m) => m.role === "system")?.content || "",
    });
    if (body.stream) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "I work on APIs." } }] })}\n\n`);
      return res.end("data: [DONE]\n\n");
    }
    const content = seen.at(-1)!.prompt.includes("Start the interview")
      ? { welcome: "Welcome.", question: "Walk me through an API you designed.", topic: "Projects" }
      : {};
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 5, completion_tokens: 5 } }));
  });
});
await new Promise<void>((resolve) => fake.listen(0, "127.0.0.1", resolve));
const fakeUrl = `http://127.0.0.1:${(fake.address() as AddressInfo).port}/v1`;
after(() => fake.close());

/* ---------- App modules ---------- */

const pp = await import("../src/lib/professional-profile");
const logic = await import("../src/lib/mock-interview-logic");
const { updateStore, readStore, publicUser } = await import("../src/lib/server/db");
const { getProfileContext } = await import("../src/lib/server/user-profile");
const { signSession, SESSION_COOKIE, encryptSecret } = await import("../src/lib/server/session");
const profileRoute = await import("../src/app/api/profile/route");
const answerRoute = await import("../src/app/api/live/answer/route");
const mockRoute = await import("../src/app/api/meetings/mock/route");
const adminUsersRoute = await import("../src/app/api/admin/users/route");

const now = new Date().toISOString();
const USERS = {
  usr_a: { name: "User A", role: "User", workspaceId: "ws_a" },
  usr_b: { name: "User B", role: "User", workspaceId: "ws_a" },
  usr_admin: { name: "Admin A", role: "Admin", workspaceId: "ws_a" },
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
  s.userApiCredentials = (Object.keys(USERS) as Uid[]).map((uid) => ({
    id: `cred_${uid}`,
    workspaceId: "ws_a",
    userId: uid,
    name: "Settings key",
    provider: "openai" as const,
    model: "gpt-4o-mini",
    encryptedApiKey: encryptSecret(USER_KEY),
    keyLast4: USER_KEY.slice(-4),
    status: "connected" as const,
    capabilities: ["live_session", "general_ai", "rag"] as ("live_session" | "general_ai" | "rag")[],
    endpoint: fakeUrl,
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  }));
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

type Body = {
  name?: string;
  email?: string;
  accessRole?: string;
  profile?: Record<string, unknown>;
  error?: string;
  fieldErrors?: Record<string, string>;
};

async function json(res: Response) {
  const text = await res.text();
  assert.ok(!text.includes(USER_KEY), "responses must never contain the API key");
  return { status: res.status, body: JSON.parse(text) as Body };
}

const getProfile = async (uid: Uid | null) => json(await profileRoute.GET(req(uid, "/api/profile")));
const putProfile = async (uid: Uid | null, body: unknown) => json(await profileRoute.PUT(req(uid, "/api/profile", "PUT", body)));

const EXPERIENCED = {
  role: "Backend Engineer",
  company: "Northwind Logistics",
  jobTitle: "Software Engineer II",
  employmentType: "full_time",
  experience: "3_5",
  workStatus: "working",
  summary: "Backend engineer focused on reliable APIs.",
  previousCompany: "Contoso",
  previousJobTitle: "Junior Developer",
  workStart: "2022-03",
  currentlyWorking: true,
  workEnd: "2023-01",
  experienceDescription: "Own the shipment tracking service.",
  responsibilities: "Design REST APIs\nOn-call for tracking service\n\n\n\nMentor interns",
  achievements: "Cut p95 latency of tracking API by 40%",
  technicalSkills: "Python, FastAPI, python, PostgreSQL",
  tools: ["Docker", " Kafka ", ""],
  domain: "software",
  injected: "dropped",
};

/* ---------- Validation (shared by form and API) ---------- */

test("validation requires name, experience and work status, and employer details only for working professionals", () => {
  const empty = pp.validateProfileUpdate({ name: " ", profile: {} });
  assert.ok("errors" in empty);
  assert.deepEqual(Object.keys(empty.errors).sort(), ["experience", "name", "workStatus"]);

  const working = pp.validateProfileUpdate({ name: "A", profile: { experience: "1_3", workStatus: "working" } });
  assert.ok("errors" in working);
  assert.deepEqual(Object.keys(working.errors).sort(), ["company", "jobTitle"]);

  for (const profile of [
    { experience: "fresher", workStatus: "student" },
    { experience: "fresher", workStatus: "job_seeking" },
    { experience: "fresher", workStatus: "working" },
  ]) {
    const ok = pp.validateProfileUpdate({ name: "Fresh Grad", profile });
    assert.ok("profile" in ok, `fresher can save without employment details: ${JSON.stringify(profile)}`);
  }

  const badIds = pp.validateProfileUpdate({ name: "A", profile: { experience: "10_years", workStatus: "ceo" } });
  assert.ok("errors" in badIds && badIds.errors.experience && badIds.errors.workStatus, "unknown option ids are rejected");
});

test("validation checks dates and treats Present as no end date", () => {
  const base = { experience: "1_3", workStatus: "freelancer" };
  const nowDate = new Date("2026-10-22T00:00:00Z");
  const order = pp.validateProfileUpdate({ name: "A", profile: { ...base, workStart: "2024-05", workEnd: "2023-01" } }, nowDate);
  assert.ok("errors" in order && order.errors.workEnd === "End date must be after the start date.");
  const future = pp.validateProfileUpdate({ name: "A", profile: { ...base, workStart: "2027-01" } }, nowDate);
  assert.ok("errors" in future && future.errors.workStart);
  const noStart = pp.validateProfileUpdate({ name: "A", profile: { ...base, currentlyWorking: true } }, nowDate);
  assert.ok("errors" in noStart && noStart.errors.workStart);
  const present = pp.validateProfileUpdate({ name: "A", profile: { ...base, workStart: "2024-05", workEnd: "2025-01", currentlyWorking: true } }, nowDate);
  assert.ok("profile" in present);
  assert.equal(present.profile.workEnd, undefined);
  assert.equal(present.profile.currentlyWorking, true);
  assert.ok(pp.isValidEmail("a@b.co") && !pp.isValidEmail("a@b") && !pp.isValidEmail("not an email"));
});

/* ---------- API ---------- */

test("the profile API requires sign-in", async () => {
  assert.equal((await getProfile(null)).status, 401);
  assert.equal((await putProfile(null, { name: "X", profile: EXPERIENCED })).status, 401);
});

test("loads, saves, reloads and edits the signed-in user's profile", async () => {
  const first = await getProfile("usr_a");
  assert.equal(first.status, 200);
  assert.equal(first.body.name, "User A");
  assert.equal(first.body.email, "usr_a@cueai.local");
  assert.deepEqual(first.body.profile, {});

  const saved = await putProfile("usr_a", { name: "  Alice Example ", email: "attacker@evil.test", profile: EXPERIENCED });
  assert.equal(saved.status, 200, saved.body.error);
  assert.equal(saved.body.name, "Alice Example");
  assert.equal(saved.body.email, "usr_a@cueai.local", "email is the sign-in identity and cannot be changed here");
  const p = saved.body.profile!;
  assert.equal(p.company, "Northwind Logistics");
  assert.equal(p.workEnd, undefined, "Present clears the end date");
  assert.deepEqual(p.technicalSkills, ["Python", "FastAPI", "PostgreSQL"]);
  assert.deepEqual(p.tools, ["Docker", "Kafka"]);
  assert.equal(p.responsibilities, "Design REST APIs\nOn-call for tracking service\n\nMentor interns", "multiline text is kept");
  assert.equal(p.injected, undefined, "unknown fields are dropped");
  assert.ok(typeof p.updatedAt === "string");

  // A fresh session (log out, log back in) reads the same data from the store.
  const reloaded = await getProfile("usr_a");
  assert.equal(reloaded.body.name, "Alice Example");
  assert.equal(reloaded.body.profile!.jobTitle, "Software Engineer II");
  const stored = (await readStore()).users.find((u) => u.id === "usr_a")!;
  assert.equal(stored.email, "usr_a@cueai.local");
  assert.equal(stored.professionalProfile?.domain, "software");

  const edited = await putProfile("usr_a", { name: "Alice Example", profile: { ...EXPERIENCED, jobTitle: "Senior Engineer", achievements: "" } });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.profile!.jobTitle, "Senior Engineer");
  assert.equal(edited.body.profile!.achievements, undefined, "cleared optional fields are removed");

  const audit = (await readStore()).audit.filter((a) => a.resourceId === "usr_a" && a.action.startsWith("user.profile_"));
  assert.deepEqual(audit.map((a) => a.action), ["user.profile_updated", "user.profile_created"]);
  assert.ok(!JSON.stringify(audit).includes("Northwind"), "audit metadata holds field names, not profile content");
});

test("invalid updates are rejected with field errors and change nothing", async () => {
  const before = (await readStore()).users.find((u) => u.id === "usr_a")!.professionalProfile;
  const bad = await putProfile("usr_a", { name: "", profile: { ...EXPERIENCED, company: "", workStatus: "working", experience: "1_3" } });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.fieldErrors?.name && bad.body.fieldErrors?.company);
  assert.equal((await putProfile("usr_a", "not json")).status, 400);
  assert.deepEqual((await readStore()).users.find((u) => u.id === "usr_a")!.professionalProfile, before);
});

test("a fresher saves without company or previous employment", async () => {
  const res = await putProfile("usr_b", {
    name: "Bob Fresher",
    profile: { experience: "fresher", workStatus: "job_seeking", technicalSkills: "Java, SQL", domain: "testing" },
  });
  assert.equal(res.status, 200, res.body.error);
  assert.equal(res.body.profile!.company, undefined);
  assert.deepEqual(res.body.profile!.technicalSkills, ["Java", "SQL"]);
});

test("each user only ever reads and writes their own profile, including admins", async () => {
  const b = await getProfile("usr_b");
  assert.equal(b.body.name, "Bob Fresher");
  assert.ok(!JSON.stringify(b.body).includes("Northwind"), "user B never sees user A's profile");

  const sneaky = await putProfile("usr_b", { userId: "usr_a", name: "Hijacked", profile: { experience: "fresher", workStatus: "student" } });
  assert.equal(sneaky.status, 200);
  const store = await readStore();
  assert.equal(store.users.find((u) => u.id === "usr_a")!.name, "Alice Example", "a userId in the body is ignored");
  assert.equal(store.users.find((u) => u.id === "usr_b")!.name, "Hijacked");

  const admin = await getProfile("usr_admin");
  assert.equal(admin.status, 200);
  assert.equal(admin.body.accessRole, "Admin");
  assert.deepEqual(admin.body.profile, {}, "admins get their own profile, not other users'");

  const adminList = await adminUsersRoute.GET(req("usr_admin", "/api/admin/users"));
  assert.equal(adminList.status, 200);
  assert.ok(!(await adminList.text()).includes("Northwind"), "the admin user list does not expose private profile details");
  assert.equal("professionalProfile" in publicUser(store.users.find((u) => u.id === "usr_a")!), false);
});

/* ---------- Integration with AI features ---------- */

test("profile context: full for Live Session, brief (no work history) for Resume Tailor", async () => {
  const full = await getProfileContext("usr_a", "full");
  assert.match(full, /Current position: Senior Engineer at Northwind Logistics \(Full-time\)/);
  assert.match(full, /Role dates: Mar 2022 – Present/);
  assert.match(full, /Responsibilities: Design REST APIs; On-call/);
  const brief = await getProfileContext("usr_a");
  assert.match(brief, /Technical skills: Python, FastAPI, PostgreSQL/);
  assert.doesNotMatch(brief, /Responsibilities|Previous position|About:/);
  assert.equal(await getProfileContext("usr_missing"), "");
});

test("a personal Live Session question uses only the asking user's saved profile", async () => {
  const ask = async (uid: Uid) => {
    const before = seen.length;
    const res = await answerRoute.POST(
      new NextRequest("http://127.0.0.1:3000/api/live/answer", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream", cookie: cookie(uid) },
        body: JSON.stringify({ stream: true, mode: "answer", prompt: "Tell me about yourself and your current role." }),
      }),
    );
    assert.equal(res.status, 200);
    await res.text();
    return seen[before]!.system;
  };
  const systemA = await ask("usr_a");
  assert.match(systemA, /Current position: Senior Engineer at Northwind Logistics/);
  const systemB = await ask("usr_b");
  assert.doesNotMatch(systemB, /Northwind/, "another user's profile never reaches B's prompt");
});

test("Mock Interview questions use the owner's saved profile alongside the resume", async () => {
  const resumeText = `Alice Example\nSoftware Engineer at Northwind Logistics. Built the shipment tracking API with FastAPI and PostgreSQL.\nSkills: Python, SQL`;
  const setup = { jobTitle: "Backend Developer", difficulty: "intermediate", durationMin: 10, interviewType: "technical" };
  const create = async (uid: Uid) => {
    const before = seen.length;
    const res = await mockRoute.POST(req(uid, "/api/meetings/mock", "POST", { setup, resumeText }));
    assert.equal(res.status, 201, await res.clone().text());
    return seen.slice(before).find((s) => s.prompt.includes("Start the interview"))!.prompt;
  };
  const promptA = await create("usr_a");
  assert.match(promptA, /self-reported profile from Settings/);
  assert.match(promptA, /Work status: Working, experience 3–5 years/);
  const promptB = await create("usr_admin");
  assert.doesNotMatch(promptB, /self-reported profile/, "no section when the user has not saved a profile");

  const normalized = logic.normalizeSetup(setup);
  assert.ok("setup" in normalized);
  assert.doesNotMatch(logic.describeCandidate(normalized.setup, logic.EMPTY_PROFILE, resumeText), /self-reported/);
});
