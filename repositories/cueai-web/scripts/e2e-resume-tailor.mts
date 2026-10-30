/**
 * End-to-end check of Resume Tailor against a running dev server (real model calls).
 *   RESUME_E2E_BASE=http://127.0.0.1:3000 RESUME_E2E_EMAIL=... RESUME_E2E_PASSWORD=... \
 *   npx tsx --tsconfig tsconfig.json scripts/e2e-resume-tailor.mts
 * The resume below is fictional test data. Output lists counts and checks, not resume content.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { buildResumePdf } from "../src/lib/resume/pdf";
import { coerceResume } from "../src/lib/resume/normalize";
import { TEMPLATES } from "../src/lib/resume/templates";
import type {
  AtsReport,
  JobProfile,
  MatchReport,
  ResumeRewrite,
  SkillGap,
  SkillSuggestion,
  StructuredResume,
} from "../src/lib/resume/types";

const BASE = process.env.RESUME_E2E_BASE || "http://127.0.0.1:3000";
const EMAIL = process.env.RESUME_E2E_EMAIL || "";
const PASSWORD = process.env.RESUME_E2E_PASSWORD || "";
const OUT = process.env.RESUME_E2E_OUT || path.join(os.tmpdir(), "cueai-resume-e2e");

const RESUME_TXT = `Asha Verma
Backend Software Engineer
asha.verma@example.test | +91 90000 12345 | Hyderabad, India | github.com/asha-verma-test

SUMMARY
Backend engineer with 4 years of experience building Python services and REST APIs for payments and logistics products.

SKILLS
Languages: Python, JavaScript, SQL
Frameworks: Django, Flask, React
Tools: PostgreSQL, Redis, Docker, Git, AWS

EXPERIENCE
Software Engineer, Northwind Logistics, Hyderabad    Jan 2022 - Present
- Built shipment tracking APIs in Django used by 40 warehouse partners
- Reduced report generation time from 9 minutes to 2 minutes by adding Redis caching
- Worked with the data team on PostgreSQL schema changes and query tuning

Associate Engineer, Contoso Payments, Bengaluru    Jul 2020 - Dec 2021
- Maintained Flask services for merchant onboarding
- Wrote unit tests and fixed production bugs reported by support

PROJECTS
Invoice Parser | Python, Flask, Docker
- Extracted line items from PDF invoices and exposed them through a REST API

EDUCATION
B.Tech in Computer Science, JNTU Hyderabad    2016 - 2020

CERTIFICATIONS
AWS Certified Cloud Practitioner (2023)
`;

const JD = `We are hiring a Backend Engineer (Python).
Responsibilities: design and build REST APIs and microservices, own PostgreSQL data models, deploy services with Docker and Kubernetes on AWS, write automated tests, and improve observability.
Requirements: 3+ years with Python and Django or FastAPI, strong SQL and PostgreSQL, Docker, CI/CD pipelines, Kubernetes, Redis, and experience with message queues such as Kafka or RabbitMQ.`;

type Analysis = {
  resume: StructuredResume;
  jobKeywords: string[];
  ats: AtsReport;
  job: JobProfile;
  match: MatchReport;
  tailored: { resume: StructuredResume; match: MatchReport; validation: { factualIntegrity: string; scoreRegression: string } };
  rewriteSet: ResumeRewrite[];
  missingSkills: SkillGap[];
  skillSuggestions: SkillSuggestion[];
  summary: string;
  usedJobDescription: boolean;
  timings: Record<string, number>;
};

const norm = (t: string) =>
  t.normalize("NFKC").replace(/[–—]/g, "-").toLowerCase().replace(/[^a-z0-9%.+@/]+/g, " ").replace(/\s+/g, " ").trim();

let cookie = "";
async function call(p: string, init: RequestInit = {}, auth = true) {
  const headers = new Headers(init.headers);
  if (auth && cookie) headers.set("cookie", cookie);
  return fetch(BASE + p, { ...init, headers });
}

async function analyze(file: Blob, name: string, jd: string) {
  const form = new FormData();
  form.append("resume", file, name);
  if (jd) form.append("jobDescription", jd);
  const t0 = performance.now();
  const res = await call("/api/resume/analyze", { method: "POST", body: form });
  const data = (await res.json()) as Analysis & { error?: string };
  assert.equal(res.status, 200, `analyze failed: ${res.status} ${data.error ?? ""}`);
  return { data, ms: Math.round(performance.now() - t0) };
}

function facts(r: StructuredResume) {
  return [
    r.name,
    r.contact.email,
    ...r.experience.flatMap((e) => [e.title, e.organization, e.dates, ...e.bullets]),
    ...r.internships.flatMap((e) => [e.title, e.organization, e.dates, ...e.bullets]),
    ...r.projects.flatMap((p) => [p.name, ...p.bullets]),
    ...r.education.flatMap((e) => [e.title, e.organization, e.dates]),
    ...r.certifications,
    ...r.skills.flatMap((g) => g.items),
  ].filter(Boolean);
}

async function pdfText(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  return { totalPages, text: norm(String(text)) };
}

const results: string[] = [];
const ok = (msg: string) => {
  results.push(`PASS ${msg}`);
  console.log(`PASS ${msg}`);
};

async function main() {
  assert.ok(EMAIL && PASSWORD, "Set RESUME_E2E_EMAIL and RESUME_E2E_PASSWORD.");
  await mkdir(OUT, { recursive: true });

  // Auth is enforced on the new routes.
  for (const [p, method] of [
    ["/api/resume/pdf", "POST"],
    ["/api/resume/score", "POST"],
    ["/api/resume/templates", "GET"],
  ] as const) {
    const res = await call(p, { method, body: method === "POST" ? "{}" : undefined }, false);
    assert.equal(res.status, 401, `${p} without a session returned ${res.status}`);
  }
  ok("pdf/score/templates reject requests without a session (401)");

  const login = await call("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  assert.equal(login.status, 200, `login failed: ${login.status}`);
  cookie = (login.headers.getSetCookie?.() ?? [login.headers.get("set-cookie") || ""]).map((c) => c.split(";")[0]).join("; ");
  ok("signed in");

  const templates = (await (await call("/api/resume/templates")).json()) as { templates: { id: string; name: string }[] };
  assert.equal(templates.templates.length, 5);
  ok(`templates endpoint lists ${templates.templates.map((t) => t.name).join(", ")}`);

  // 1. Real analysis of a TXT upload with a job description.
  const txt = new Blob([RESUME_TXT], { type: "text/plain" });
  const first = await analyze(txt, "asha-verma.txt", JD);
  const a = first.data;
  console.log(
    `     analyze: ${first.ms} ms (server ${JSON.stringify(a.timings)}), rewrites ${a.rewriteSet.length} (valid ${a.rewriteSet.filter((r) => r.valid).length}), missing ${a.missingSkills.length}, suggestions ${a.skillSuggestions.length}, keywords ${a.jobKeywords.length}`,
  );
  if (process.env.RESUME_E2E_VERBOSE) {
    for (const r of a.rewriteSet) console.log(`     [${r.valid ? "ok" : `rejected: ${r.rejectReason}`}] ${r.target}: ${r.after}`);
    console.log(`     suggestions: ${a.skillSuggestions.map((s) => `${s.skill}${s.supported ? "" : "*"}`).join(", ")}`);
  }
  assert.equal(a.resume.name, "Asha Verma");
  assert.ok(a.resume.experience.length >= 2, "both jobs parsed");
  assert.ok(a.usedJobDescription);
  for (const k of a.jobKeywords) assert.ok(norm(JD).includes(norm(k)), `keyword "${k}" is not in the JD`);
  assert.ok(a.ats.missingKeywords.some((k) => /kubernetes/i.test(k)), "Kubernetes reported missing");
  assert.ok(!a.ats.matchedKeywords.some((k) => /kubernetes|kafka|rabbitmq/i.test(k)), "absent skills never matched");
  for (const g of a.missingSkills) {
    if (g.supported) assert.ok(norm(RESUME_TXT).includes(norm(g.evidence)), `evidence for ${g.skill} is quoted from the resume`);
  }
  ok("analysis parsed the resume, keywords come from the JD, missing skills are not claimed");

  const sourceFacts = facts(a.resume);
  for (const f of sourceFacts) assert.ok(norm(RESUME_TXT).includes(norm(f)) || f === a.resume.name, `parsed fact not in source: ${f}`);
  ok(`all ${sourceFacts.length} parsed facts appear in the uploaded resume`);

  // 2. Identical request is served from cache, not a second model call.
  const second = await analyze(txt, "asha-verma.txt", JD);
  assert.equal(second.data.timings.cached, 1, "second identical analysis is cached");
  ok(`repeat analysis served from cache in ${second.ms} ms`);

  // 3. Accept all rewrites: dates, employers, education and certifications are untouched.
  const accepted = a.tailored.resume;
  for (const [i, e] of a.resume.experience.entries()) {
    assert.equal(accepted.experience[i]?.organization, e.organization);
    assert.equal(accepted.experience[i]?.dates, e.dates);
    assert.equal(accepted.experience[i]?.title, e.title);
  }
  assert.deepEqual(accepted.education, a.resume.education);
  assert.deepEqual(accepted.certifications, a.resume.certifications);
  for (const rw of a.rewriteSet.filter((r) => r.valid)) {
    for (const n of rw.after.match(/\d+(?:\.\d+)?/g) ?? []) assert.ok(RESUME_TXT.includes(n), `rewrite introduced number ${n}`);
  }
  const before = a.match.score;
  const after = a.tailored.match.score;
  const server = (await (
    await call("/api/resume/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resume: accepted, jobDescription: JD, jobKeywords: a.jobKeywords, job: a.job }),
    })
  ).json()) as { match: MatchReport };
  assert.equal(server.match.score, after, "server rescore uses the same match algorithm");
  assert.ok(after != null && before != null && after >= before, `validated match must not regress: ${before} -> ${after}`);
  assert.deepEqual(a.tailored.validation, { factualIntegrity: "passed", scoreRegression: "passed" });
  ok(`validated tailoring keeps source facts; CueAI match ${before} -> ${after} (same scoring version)`);

  // 4. Every template renders the accepted resume as a real PDF with all facts.
  const want = facts(accepted);
  for (const t of TEMPLATES) {
    const res = await call("/api/resume/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resume: accepted, template: t.id }),
    });
    assert.equal(res.status, 200, `${t.id}: pdf ${res.status}`);
    assert.equal(res.headers.get("content-type"), "application/pdf");
    assert.match(res.headers.get("content-disposition") || "", /filename="Asha_Verma_ATS_Resume\.pdf"/);
    const bytes = new Uint8Array(await res.arrayBuffer());
    await writeFile(path.join(OUT, `${t.id}-Asha_Verma_ATS_Resume.pdf`), bytes);
    const { totalPages, text } = await pdfText(bytes);
    for (const f of want) assert.ok(text.includes(norm(f)), `${t.id}: PDF missing "${f}"`);
    assert.ok(!/lorem|john doe|placeholder|your name/.test(text), `${t.id}: placeholder text`);
    ok(`${t.name}: ${bytes.length} bytes, ${totalPages} page(s), all ${want.length} facts extracted as text`);
  }

  // 5. Multi-page output and server-side input validation.
  const long = { ...accepted, projects: Array.from({ length: 12 }, (_, i) => ({ ...accepted.projects[0]!, name: `Invoice Parser ${i + 1}` })) };
  const longRes = await call("/api/resume/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume: long, template: "software" }),
  });
  const longText = await pdfText(new Uint8Array(await longRes.arrayBuffer()));
  assert.ok(longText.totalPages >= 2, "long resume spans pages");
  assert.ok(longText.text.includes("invoice parser 12"), "last project present");
  ok(`long resume: ${longText.totalPages} pages, last section present`);

  const bad = await call("/api/resume/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume: accepted, template: "fancy" }),
  });
  assert.equal(bad.status, 400);
  ok("unknown template rejected (400)");

  // 6. PDF upload is parsed too (uses a PDF generated from the same test resume).
  const sourcePdf = await buildResumePdf(coerceResume(a.resume), "classic");
  const fromPdf = await analyze(new Blob([new Uint8Array(sourcePdf.bytes)], { type: "application/pdf" }), "asha-verma.pdf", JD);
  assert.equal(fromPdf.data.resume.name, "Asha Verma");
  assert.ok(fromPdf.data.resume.experience.length >= 2);
  ok(`PDF upload parsed (${fromPdf.ms} ms)`);

  console.log(`\n${results.length} checks passed. PDFs written to ${OUT}`);
}

main().catch((err) => {
  console.error(`FAIL ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
