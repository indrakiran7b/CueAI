/**
 * Resume Tailor requires a job description (client helper + POST /api/resume/analyze).
 * Outbound fetch is stubbed: invalid requests must make no AI calls, and the valid
 * request gets a canned model reply, so no real provider is contacted.
 *   npm run test:resume-jd
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";

process.env.CUEAI_DATA_DIR = mkdtempSync(path.join(tmpdir(), "cueai-resume-jd-"));
process.env.AUTH_SECRET = "test-resume-jd-secret-0123456789abcdef";
process.env.CUEAI_SECRET_ENCRYPTION_KEY = "test-resume-jd-encryption-key-0123456789";
process.env.CUEAI_ENV = "test";
process.env.NEXT_PUBLIC_SKIP_AUTH = "false";
process.env.NEXT_PUBLIC_AUTH_BYPASS = "false";
process.env.CUEAI_BOOTSTRAP_ADMIN_ENABLED = "false";
process.env.GROQ_API_KEY = "gsk_test_not_a_real_key";
for (const k of ["GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY"]) delete process.env[k];

const { JOB_DESCRIPTION_REQUIRED_MESSAGE, normalizeJobDescription } = await import("../src/lib/resume/job-description");
const { updateStore } = await import("../src/lib/server/db");
const { signSession, SESSION_COOKIE } = await import("../src/lib/server/session");
const { POST } = await import("../src/app/api/resume/analyze/route");

const RESUME = `Asha Verma
Backend Software Engineer
asha.verma@example.test | Hyderabad, India

SUMMARY
Backend engineer with 4 years of experience building Python services and REST APIs.

SKILLS
Languages: Python, SQL

EXPERIENCE
Software Engineer, Northwind Logistics, Hyderabad    Jan 2022 - Present
- Built shipment tracking APIs in Django used by 40 warehouse partners
`;

const MODEL_REPLY = {
  resume: {
    name: "Asha Verma",
    headline: "Backend Software Engineer",
    contact: { email: "asha.verma@example.test", phone: "", location: "Hyderabad, India", links: [] },
    summary: "Backend engineer with 4 years of experience building Python services and REST APIs.",
    skills: [{ label: "Languages", items: ["Python", "SQL"] }],
    experience: [
      {
        title: "Software Engineer",
        organization: "Northwind Logistics",
        location: "Hyderabad",
        dates: "Jan 2022 - Present",
        bullets: ["Built shipment tracking APIs in Django used by 40 warehouse partners"],
      },
    ],
    internships: [],
    projects: [],
    education: [],
    certifications: [],
    achievements: [],
    coursework: [],
    extra: [],
  },
  jdKeywords: ["Python", "Django"],
  rewrites: [],
  missingSkills: [],
  suggestedSkills: [],
  summary: "Solid backend fit.",
};

const aiCalls: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (/groq\.com|openai\.com|googleapis\.com|openrouter\.ai|anthropic\.com/.test(url)) {
    aiCalls.push(url);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(MODEL_REPLY) } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return realFetch(input, init);
}) as typeof fetch;

const now = new Date().toISOString();
await updateStore((s) => {
  s.workspace.id = "ws_r";
  s.users = [
    {
      id: "usr_r",
      name: "Resume User",
      email: "usr_r@cueai.local",
      passwordHash: "x",
      role: "User",
      status: "Active" as const,
      workspaceId: "ws_r",
      createdAt: now,
      plan: "free" as const,
    },
  ];
});

const cookie = `${SESSION_COOKIE}=${signSession({
  userId: "usr_r",
  email: "usr_r@cueai.local",
  name: "Resume User",
  role: "User",
  workspaceId: "ws_r",
  workspace: "ws_r",
})}`;

function analyzeRequest(fields: { resume?: string | null; jobDescription?: string | null }) {
  const form = new FormData();
  if (fields.resume !== null) form.append("resume", new File([fields.resume ?? RESUME], "resume.txt", { type: "text/plain" }));
  if (fields.jobDescription !== null && fields.jobDescription !== undefined) form.append("jobDescription", fields.jobDescription);
  return new NextRequest("http://127.0.0.1:3000/api/resume/analyze", { method: "POST", headers: { cookie }, body: form });
}

async function call(fields: Parameters<typeof analyzeRequest>[0]) {
  const res = await POST(analyzeRequest(fields));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  aiCalls.length = 0;
});

describe("job description helper (drives the Tailor button)", () => {
  it("rejects empty, whitespace-only and non-string values", () => {
    for (const value of ["", "   ", "\n\t  \n", null, undefined, 42]) {
      assert.equal(normalizeJobDescription(value), null, `rejects ${JSON.stringify(value)}`);
    }
  });

  it("trims a valid job description", () => {
    assert.equal(normalizeJobDescription("  Backend Engineer (Python)  \n"), "Backend Engineer (Python)");
  });

  it("uses the exact helper text from the spec", () => {
    assert.equal(JOB_DESCRIPTION_REQUIRED_MESSAGE, "Job description is required to tailor your resume.");
  });
});

describe("POST /api/resume/analyze", () => {
  it("returns 400 when the job description is missing, without calling the AI", async () => {
    const r = await call({ jobDescription: null });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, JOB_DESCRIPTION_REQUIRED_MESSAGE);
    assert.deepEqual(aiCalls, []);
  });

  it("returns 400 for an empty job description, without calling the AI", async () => {
    const r = await call({ jobDescription: "" });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, JOB_DESCRIPTION_REQUIRED_MESSAGE);
    assert.deepEqual(aiCalls, []);
  });

  it("returns 400 for a whitespace-only job description, without calling the AI", async () => {
    const r = await call({ jobDescription: "   \n\t  " });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, JOB_DESCRIPTION_REQUIRED_MESSAGE);
    assert.deepEqual(aiCalls, []);
  });

  it("still requires a resume file first", async () => {
    const r = await call({ resume: null, jobDescription: "Backend Engineer, Python and Django" });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "Resume file is required.");
    assert.deepEqual(aiCalls, []);
  });

  it("still requires authentication", async () => {
    const form = new FormData();
    form.append("resume", new File([RESUME], "resume.txt", { type: "text/plain" }));
    form.append("jobDescription", "Backend Engineer");
    const res = await POST(new NextRequest("http://127.0.0.1:3000/api/resume/analyze", { method: "POST", body: form }));
    assert.equal(res.status, 401);
    assert.deepEqual(aiCalls, []);
  });

  it("tailors the resume when a valid job description is provided", async () => {
    const r = await call({ jobDescription: "  Backend Engineer. Requirements: Python, Django, PostgreSQL.  " });
    assert.equal(r.status, 200, String(r.body.error ?? ""));
    assert.ok(aiCalls.length >= 1, "the AI provider is called for a valid request");
    assert.equal(r.body.usedJobDescription, true);
    const resume = r.body.resume as { name: string; experience: unknown[] };
    assert.equal(resume.name, "Asha Verma");
    assert.equal(resume.experience.length, 1);
  });
});
