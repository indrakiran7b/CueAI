/**
 * Resume Tailor: ATS match estimate, tailoring, adaptive pagination and the analyze/tailor API.
 * Outbound AI calls are stubbed with canned replies; no real provider is contacted.
 *   npm run test:resume-tailor
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";

process.env.CUEAI_DATA_DIR = mkdtempSync(path.join(tmpdir(), "cueai-resume-tailor-"));
process.env.AUTH_SECRET = "test-resume-tailor-secret-0123456789abcdef";
process.env.CUEAI_SECRET_ENCRYPTION_KEY = "test-resume-tailor-encryption-key-01234567";
process.env.CUEAI_ENV = "test";
process.env.NEXT_PUBLIC_SKIP_AUTH = "false";
process.env.NEXT_PUBLIC_AUTH_BYPASS = "false";
process.env.CUEAI_BOOTSTRAP_ADMIN_ENABLED = "false";
process.env.GROQ_API_KEY = "gsk_test_not_a_real_key";
for (const k of ["GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY"]) delete process.env[k];

const { coerceResume, resumeToText } = await import("../src/lib/resume/normalize");
const { analyzeJobDescription, matchResume, experienceYears, MATCH_WEIGHTS, SCORING_VERSION } = await import("../src/lib/resume/match");
const { buildRecommendations } = await import("../src/lib/resume/recommendations");
const {
  applyTailoring,
  matchRegressionIssues,
  sourceIntegrityIssues,
  tailorItems,
  verifyTailoring,
} = await import("../src/lib/resume/tailor");
const { compareText, countChanges, diffResume, normalizeForCompare } = await import("../src/lib/resume/diff");
const { mergeDuplicates } = await import("../src/lib/resume/duplicates");
const { validateRewrites } = await import("../src/lib/resume/rewrites");
const { fitResume, validateLayout } = await import("../src/lib/resume/fit");
const { getMeasurer, buildResumePdf } = await import("../src/lib/resume/pdf");
const { layoutResume } = await import("../src/lib/resume/layout");
const { resumeDocumentXml, docxMatchesLayout } = await import("../src/lib/resume/docx");
const { docxBlob } = await import("@cueai/export-service/exportDocument");
const mammoth = await import("mammoth");
const { previewContent } = await import("../src/components/resume/tailor-progress");
const { TEMPLATES } = await import("../src/lib/resume/templates");
const { readStore, updateStore } = await import("../src/lib/server/db");
const { signSession, SESSION_COOKIE } = await import("../src/lib/server/session");
const { POST: analyzePost } = await import("../src/app/api/resume/analyze/route");
const { POST: pdfPost } = await import("../src/app/api/resume/pdf/route");
const { POST: scorePost } = await import("../src/app/api/resume/score/route");
const measurer = await getMeasurer();

type StructuredResume = import("../src/lib/resume/types").StructuredResume;
type TailorBody = Partial<import("../src/app/api/resume/analyze/route").ResumeTailorResult> & { error?: string };
type ScoreBody = { match: import("../src/lib/resume/types").MatchReport; error?: string };

const NOW = new Date("2026-10-01T00:00:00Z");

const JD = `Backend Software Engineer
About the role
You will build the services behind our logistics platform.

Responsibilities:
- Design and build REST APIs and microservices in Python
- Own PostgreSQL data models and query performance
- Deploy services with Docker and Kubernetes on AWS
- Write automated tests and review code

Requirements:
- 3+ years of professional backend experience
- Strong Python and Django
- PostgreSQL and SQL
- Docker
- Bachelor's degree in Computer Science or related field

Nice to have:
- Kafka
- Terraform`;

/** Test fixtures only — never used by the application. */
function experienced(): StructuredResume {
  return coerceResume({
    name: "Asha Verma",
    headline: "Backend Engineer",
    contact: { email: "asha.verma@example.test", phone: "+91 98765 43210", location: "Pune, India", links: ["github.com/ashaverma"] },
    summary: "Engineer who likes clean code.",
    skills: [
      { label: "Languages", items: ["JavaScript", "Python"] },
      { label: "Tools", items: ["Git", "Jira", "Docker"] },
    ],
    experience: [
      {
        title: "Software Engineer",
        organization: "Finlytics Pvt Ltd",
        location: "Pune",
        dates: "Jan 2022 - Present",
        bullets: [
          "Responsible for the internal admin dashboard",
          "Built REST APIs in Django and Python for loan processing used by 40 partner banks",
          "Designed PostgreSQL schemas and tuned slow queries for reporting",
          "Built REST APIs in Django and Python for loan processing used by 40 partner banks.",
        ],
      },
      {
        title: "Associate Engineer",
        organization: "Craftworks",
        location: "Pune",
        dates: "Jul 2020 - Dec 2021",
        bullets: ["Worked on customer support tooling", "Containerised two services with Docker for staging"],
      },
    ],
    projects: [
      { name: "Recipe Blog", tech: "WordPress", bullets: ["Wrote a personal food blog"] },
      { name: "Queue Monitor", tech: "Python, Redis", bullets: ["Built a Python service to monitor Redis queues and alert on backlog"] },
    ],
    education: [{ title: "B.Tech in Computer Science", organization: "Pune University", dates: "2016 - 2020", bullets: [] }],
  });
}

function fresher(): StructuredResume {
  return coerceResume({
    name: "Rohan Iyer",
    contact: { email: "rohan@example.test", phone: "+91 90000 00000", location: "Chennai", links: [] },
    summary: "Computer science graduate interested in backend development.",
    skills: [{ label: "Skills", items: ["Python", "SQL", "Git"] }],
    internships: [
      { title: "Backend Intern", organization: "ShopLite", dates: "May 2025 - Jul 2025", bullets: ["Built Flask endpoints for order lookups", "Wrote unit tests with pytest"] },
    ],
    projects: [
      { name: "Campus Events API", tech: "Python, Django, PostgreSQL", bullets: ["Built a Django REST API for campus event sign-ups", "Modelled events and users in PostgreSQL"] },
      { name: "Portfolio Site", tech: "HTML, CSS", bullets: ["Designed a personal portfolio website"] },
    ],
    education: [{ title: "B.E. Computer Science", organization: "Anna University", dates: "2021 - 2025", bullets: ["CGPA 8.4"] }],
  });
}

function longExperienced(): StructuredResume {
  const roles = Array.from({ length: 5 }, (_, i) => ({
    title: i === 0 ? "Senior Backend Engineer" : "Backend Engineer",
    organization: `Company ${String.fromCharCode(65 + i)}`,
    location: "Bengaluru",
    dates: `Jan ${2025 - i * 3} - ${i === 0 ? "Present" : `Dec ${2027 - i * 3}`}`,
    bullets: Array.from(
      { length: 6 },
      (_, j) => `Delivered backend capability ${j + 1} for team ${i + 1} using Python, PostgreSQL and Docker, coordinating releases with product and QA partners across regions`,
    ),
  }));
  return coerceResume({ ...experienced(), experience: roles, summary: "Backend engineer with 15 years of experience in Python services." });
}

/* ------------------------------------------------------------------ */

describe("ATS match estimate", () => {
  const job = analyzeJobDescription(JD, {});

  it("reads the job: title, required vs preferred skills, responsibilities and minimum years", () => {
    assert.equal(job.title, "Backend Software Engineer");
    assert.equal(job.minYears, 3);
    const byName = (n: string) => job.requirements.find((r) => r.name.toLowerCase() === n.toLowerCase());
    assert.equal(byName("Python")?.priority, "high");
    assert.equal(byName("Django")?.required, true);
    assert.equal(byName("Kafka")?.required, false, "nice-to-have is preferred");
    assert.equal(byName("Kafka")?.priority, "low");
    assert.equal(byName("Docker")?.category, "tools");
    assert.ok(job.requirements.some((r) => r.category === "responsibility" && /REST APIs/.test(r.name)));
    assert.ok(job.requirements.some((r) => r.id === "qual:degree"));
  });

  it("classifies demonstrated, partial and missing requirements using resume evidence", () => {
    const report = matchResume(experienced(), job, NOW);
    const m = (n: string) => report.matches.find((x) => x.name.toLowerCase() === n.toLowerCase())!;
    assert.equal(m("Django").status, "demonstrated");
    assert.match(m("Django").evidence, /Django/);
    assert.equal(m("PostgreSQL").status, "demonstrated");
    assert.equal(m("Kubernetes").status, "partial", "Docker is related evidence, not a claim of Kubernetes");
    assert.match(m("Kubernetes").note, /Related experience with Docker/);
    assert.equal(m("Kafka").status, "missing");
    assert.equal(m("Kafka").evidence, "");
    assert.equal(report.matches.find((x) => x.requirementId === "qual:degree")!.status, "demonstrated");
  });

  it("never reports a skill as missing when the resume shows it", () => {
    const report = matchResume(experienced(), job, NOW);
    const text = resumeToText(experienced()).toLowerCase();
    for (const mm of report.matches.filter((x) => x.status === "missing" && x.category !== "responsibility" && x.category !== "qualification")) {
      assert.ok(!text.includes(mm.name.toLowerCase()), `${mm.name} is in the resume but marked missing`);
    }
  });

  it("uses model evidence only when it is really in the resume", () => {
    const withModel = analyzeJobDescription(
      JD,
      { requirements: [{ name: "Terraform", evidence: "Containerised two services with Docker for staging" }, { name: "Kafka", evidence: "Ran Kafka clusters at scale" }] },
      resumeToText(experienced()),
    );
    const report = matchResume(experienced(), withModel, NOW);
    assert.equal(report.matches.find((x) => x.name === "Terraform")!.status, "partial");
    assert.equal(report.matches.find((x) => x.name === "Kafka")!.status, "missing", "fabricated evidence is ignored");
  });

  it("calculates the documented weighted score and is deterministic", () => {
    const report = matchResume(experienced(), job, NOW);
    assert.equal(report.scoringVersion, SCORING_VERSION);
    const applicable = report.categories.filter((c) => c.score != null);
    assert.deepEqual(report.categories.map((c) => c.weight), Object.values(MATCH_WEIGHTS));
    const expected = Math.round(applicable.reduce((n, c) => n + c.weight * c.score!, 0) / applicable.reduce((n, c) => n + c.weight, 0));
    assert.equal(report.score, expected);
    assert.deepEqual(matchResume(experienced(), job, NOW), report);
    assert.ok(report.score > 0 && report.score < 100);
  });

  it("counts overlapping years once and internships at half weight", () => {
    assert.equal(experienceYears(experienced(), NOW), 6.3);
    assert.equal(experienceYears(fresher(), NOW), 0.1);
  });

  it("drops non-applicable categories and renormalizes", () => {
    const small = analyzeJobDescription("Python developer\nRequirements: Python, SQL and Git", {});
    const report = matchResume(experienced(), small, NOW);
    assert.equal(report.status, "scored");
    assert.equal(report.categories.find((c) => c.key === "responsibilities")!.score, null);
    assert.ok(report.score! > 0 && report.score! <= 100);
  });

  it("a JD too thin to compare against is reported as not scorable, never as 0", () => {
    const tiny = analyzeJobDescription("Python developer", {});
    const report = matchResume(experienced(), tiny, NOW);
    assert.equal(report.status, "insufficient_job_description");
    assert.equal(report.score, null);
    assert.equal(report.keywordAlignment, null);
    assert.equal(report.skillsMatch, null);
    assert.match(report.explanation, /too few for a reliable match estimate/);
  });

  it("reads requirements and responsibilities from a prose JD with inline headings (zero-score regression)", () => {
    const prose = `We are hiring a Backend Engineer (Python).
Responsibilities: design and build REST APIs and microservices, own PostgreSQL data models, deploy services with Docker and Kubernetes on AWS, write automated tests, and improve observability.
Requirements: 3+ years with Python and Django or FastAPI, strong SQL and PostgreSQL, Docker, CI/CD pipelines, Kubernetes, Redis.`;
    const job = analyzeJobDescription(prose, {});
    const resp = job.requirements.filter((r) => r.category === "responsibility").map((r) => r.name);
    assert.ok(resp.length >= 4, `responsibilities: ${resp.join(" | ")}`);
    assert.ok(resp.some((r) => /^Design and build REST APIs/.test(r)));
    assert.ok(resp.some((r) => /^Improve observability/.test(r)), "leading 'and' is dropped");
    assert.equal(job.minYears, 3);
    const report = matchResume(experienced(), job, NOW);
    assert.equal(report.status, "scored");
    assert.ok(report.score! > 0 && report.keywordAlignment! > 0 && report.skillsMatch! > 0);
  });

  it("finds duties in a JD with no headings at all", () => {
    const job = analyzeJobDescription(
      "Junior analyst needed. You will analyze weekly sales data, prepare reports for store managers and maintain our pricing spreadsheet. SQL and Excel are required.",
      {},
    );
    assert.ok(job.requirements.filter((r) => r.category === "responsibility").length >= 2);
    assert.ok(job.requirements.some((r) => r.name === "SQL") && job.requirements.some((r) => r.name === "Excel"));
  });

  it("keeps model-proposed requirements only when the JD contains them", () => {
    const jd = "Accounts Executive\nRequirements:\n- Experience with vendor reconciliation and GST filing\n- Tally ERP\n- Excel";
    const job = analyzeJobDescription(jd, {
      requirements: [
        { name: "vendor reconciliation", category: "domain", importance: "required" },
        { name: "GST filing", category: "domain", importance: "required" },
        { name: "Tally ERP", category: "tools", importance: "required" },
        { name: "Blockchain auditing", category: "domain", importance: "required" },
      ],
    });
    const names = job.requirements.map((r) => r.name);
    for (const n of ["vendor reconciliation", "GST filing", "Tally ERP", "Excel"]) assert.ok(names.some((x) => x.toLowerCase() === n.toLowerCase()), n);
    assert.ok(!names.includes("Blockchain auditing"), "requirements absent from the JD are ignored");
    const resume = coerceResume({
      name: "K. Menon",
      skills: [{ label: "", items: ["Excel"] }],
      experience: [{ title: "Accounts Assistant", organization: "A1 Traders", dates: "2023 - Present", bullets: ["Handled vendor reconciliation every month in Excel"] }],
    });
    const report = matchResume(resume, job, NOW);
    assert.equal(report.matches.find((m) => m.name.toLowerCase() === "vendor reconciliation")!.status, "demonstrated");
    assert.equal(report.matches.find((m) => m.name === "GST filing")!.status, "missing");
  });

  it("formatting never feeds the match score", () => {
    const plain = experienced();
    const noContact = { ...experienced(), contact: { email: "", phone: "", location: "", links: [] } };
    assert.equal(matchResume(plain, job, NOW).score, matchResume(noContact, job, NOW).score);
  });

  it("recommendations are backed by the resume and the analysis", () => {
    const resume = experienced();
    const report = matchResume(resume, job, NOW);
    const recs = buildRecommendations(resume, job, report);
    const kinds = recs.map((r) => r.kind);
    assert.ok(kinds.includes("summary"), "short summary is flagged");
    assert.ok(kinds.includes("vague_bullets"), "‘Responsible for…’ bullets are flagged");
    assert.ok(kinds.includes("supported_skills"), "Django/PostgreSQL are shown but not listed");
    const vague = recs.find((r) => r.kind === "vague_bullets")!;
    assert.ok(vague.evidence.every((e) => resumeToText(resume).includes(e)));
    for (const r of recs) assert.ok(r.issue && r.suggestion && r.benefit, `${r.kind} has issue, suggestion and benefit`);
  });
});

describe("tailoring", () => {
  const job = analyzeJobDescription(JD, {});

  function tailor(resume: StructuredResume, raw: unknown[]) {
    const report = matchResume(resume, job, NOW);
    const vocab = job.requirements.filter((r) => r.category !== "responsibility" && r.category !== "qualification").map((r) => r.name);
    const rewrites = validateRewrites(resume, resumeToText(resume), raw, vocab);
    return { report, rewrites, ...applyTailoring(resume, rewrites, job, report) };
  }

  it("rewrites the summary for the job and applies fact-checked bullet rewrites", () => {
    const original = experienced();
    const { resume, changes } = tailor(original, [
      { target: "summary", text: "Backend engineer building Python and Django REST APIs and PostgreSQL data models for fintech platforms." },
      { target: "experience.0.bullets.0", text: "Owned the internal admin dashboard end to end" },
    ]);
    assert.notEqual(resume.summary, original.summary);
    assert.match(resume.summary, /Django REST APIs/);
    assert.ok(changes.some((c) => c.kind === "rewritten" && c.section === "Professional Summary"));
    assert.ok(resume.experience[0]!.bullets.includes("Owned the internal admin dashboard end to end"));
  });

  it("never adds unsupported skills or invented metrics", () => {
    const original = experienced();
    const { resume, rewrites } = tailor(original, [
      { target: "summary", text: "Backend engineer with Kafka and Kubernetes expertise." },
      { target: "experience.0.bullets.2", text: "Designed PostgreSQL schemas, cutting query time by 60%" },
    ]);
    assert.ok(rewrites.every((r) => !r.valid));
    assert.equal(resume.summary, original.summary);
    const text = resumeToText(resume);
    assert.ok(!/kafka|kubernetes|60%/i.test(text));
  });

  it("lists skills the work already proves, puts job-relevant content first and removes duplicates", () => {
    const original = experienced();
    const { resume, changes } = tailor(original, []);
    const skills = resume.skills.flatMap((g) => g.items);
    assert.ok(skills.includes("Django") && skills.includes("PostgreSQL"), "proven skills added");
    assert.ok(!skills.includes("Kafka") && !skills.includes("Kubernetes"), "gaps are never added");
    assert.equal(resume.skills[0]!.items[0], "Python", "job-relevant skill first");
    assert.match(resume.experience[0]!.bullets[0]!, /REST APIs in Django/, "most relevant bullet first");
    assert.equal(resume.experience[0]!.bullets.length, 3, "near-duplicate bullet removed");
    assert.equal(resume.projects[0]!.name, "Queue Monitor", "relevant project first");
    assert.ok(changes.some((c) => c.kind === "added" && c.section === "Skills"));
    assert.ok(changes.some((c) => c.kind === "removed"));
  });

  it("leaves the original resume untouched and keeps every employer, title and date", () => {
    const original = experienced();
    const snapshot = JSON.stringify(original);
    const { resume } = tailor(original, [{ target: "summary", text: "Backend engineer building Python and Django services." }]);
    assert.equal(JSON.stringify(original), snapshot);
    assert.deepEqual(
      resume.experience.map((e) => [e.title, e.organization, e.dates]),
      original.experience.map((e) => [e.title, e.organization, e.dates]),
    );
  });

  it("leads with projects for early-career candidates when projects carry the evidence", () => {
    const { resume } = tailor(fresher(), []);
    assert.equal(resume.projectsFirst, true);
    assert.equal(resume.projects[0]!.name, "Campus Events API");
  });

  it("covers the summary and every bullet in the tailoring request", () => {
    const report = matchResume(experienced(), job, NOW);
    const items = tailorItems(experienced(), report);
    assert.equal(items[0]!.target, "summary");
    assert.equal(items.length, 1 + 4 + 2 + 2);
    assert.ok(items.find((i) => i.target === "experience.0.bullets.1")!.jdTerms.includes("Django"));
  });

  it("re-scoring the tailored resume never counts a gap as filled", () => {
    const { report, resume } = tailor(experienced(), []);
    const after = matchResume(resume, job, NOW);
    for (const name of ["Kafka", "Terraform"]) {
      assert.equal(after.matches.find((m) => m.name === name)!.status, report.matches.find((m) => m.name === name)!.status);
    }
    assert.ok(after.score! >= report.score!);
  });

  it("drops only job-irrelevant bullets beyond the cap, before any font shrinking", () => {
    const original = experienced();
    original.experience[0]!.bullets.push("Organised the office book club", "Planned the annual team offsite");
    const report = matchResume(original, job, NOW);
    const { resume, changes } = applyTailoring(original, [], job, report, { maxBullets: 3 });
    const bullets = resume.experience[0]!.bullets;
    assert.ok(!bullets.includes("Organised the office book club") && !bullets.includes("Planned the annual team offsite"));
    assert.ok(bullets.some((b) => /REST APIs in Django/.test(b)), "relevant bullets stay");
    assert.ok(changes.some((c) => c.kind === "removed" && /book club/.test(c.before)));
  });
});

describe("adaptive pagination and document quality", async () => {
  const m = await getMeasurer();

  it("a short fresher resume fits on one page in every template", () => {
    for (const t of TEMPLATES) {
      const fit = fitResume(fresher(), t.id, m);
      assert.equal(fit.pageCount, 1, t.id);
      assert.equal(fit.validation.ok, true, `${t.id}: ${fit.validation.issues.join("; ")}`);
      assert.ok(fit.layout.style.body.size >= 9.4);
    }
  });

  it("tightens spacing before shrinking text to reach one page", () => {
    const base = experienced();
    const padded = { ...base, projects: [...base.projects, ...base.projects.map((p) => ({ ...p, name: `${p.name} II` }))] };
    for (const t of TEMPLATES) {
      const loose = layoutResume(padded, t.id, m, 0);
      const fit = fitResume(padded, t.id, m);
      if (loose.pages.length > 1 && fit.pageCount === 1) {
        assert.ok(fit.layout.density >= 1, `${t.id} fitted by density`);
        assert.ok(fit.layout.style.body.size >= 9.4);
      }
    }
  });

  it("an experience-heavy resume uses two readable pages with no clipping or overlap", () => {
    for (const t of TEMPLATES) {
      const fit = fitResume(longExperienced(), t.id, m);
      assert.ok(fit.pageCount >= 2, `${t.id}: ${fit.pageCount}`);
      assert.equal(fit.validation.ok, true, `${t.id}: ${fit.validation.issues.join("; ")}`);
      assert.ok(fit.validation.lastPageFill >= 0.12, `${t.id}: last page is not nearly empty`);
      assert.ok(fit.layout.style.body.size >= t.style.body.size - 0.01, "two-page layouts keep standard text size");
    }
  });

  it("detects overlapping and clipped text", () => {
    const layout = layoutResume(fresher(), "classic", m);
    const page = layout.pages[0]!;
    const first = page.ops.find((o) => o.kind === "text")!;
    page.ops.push({ ...first });
    page.ops.push({ ...first, y: layout.height - 2 });
    const v = validateLayout(layout);
    assert.equal(v.ok, false);
    assert.ok(v.issues.some((i) => /overlapping/.test(i)));
    assert.ok(v.issues.some((i) => /clipped/.test(i)));
  });

  it("two-page resumes keep section order across pages", () => {
    const fit = fitResume(longExperienced(), "classic", m);
    const headings = fit.layout.blocks.filter((b) => b.kind === "heading").map((b) => b.runs[0]!.text);
    assert.deepEqual(headings.slice(0, 2), ["PROFESSIONAL SUMMARY", "EXPERIENCE"]);
    const pages = fit.layout.blocks.map((b) => b.page);
    assert.deepEqual(pages, [...pages].sort((a, b) => a - b), "blocks flow forward across pages");
  });

  it("the PDF and DOCX contain the tailored content and the PDF page count matches the preview", async () => {
    const job = analyzeJobDescription(JD, {});
    const original = experienced();
    const report = matchResume(original, job, NOW);
    const rewrites = validateRewrites(original, resumeToText(original), [{ target: "summary", text: "Backend engineer building Python and Django REST APIs and PostgreSQL data models." }], ["Python", "Django"]);
    const { resume } = applyTailoring(original, rewrites, job, report);
    for (const t of TEMPLATES) {
      const preview = fitResume(resume, t.id, m);
      const built = await buildResumePdf(resume, t.id);
      assert.equal(built.pageCount, preview.pageCount, `${t.id}: PDF pages = preview pages`);
      const { text } = await extractText(await getDocumentProxy(built.bytes), { mergePages: true });
      assert.match(text.replace(/\s+/g, " "), /Backend engineer building Python and Django REST APIs/);
      const xml = resumeDocumentXml(preview.layout);
      assert.match(xml, /Backend engineer building Python and Django REST APIs/);
      assert.ok(!xml.includes("Engineer who likes clean code"), `${t.id}: DOCX is not the original`);
    }
  });

  it("switching templates changes presentation only", () => {
    const job = analyzeJobDescription(JD, {});
    const original = experienced();
    const { resume } = applyTailoring(original, [], job, matchResume(original, job, NOW));
    const snapshot = JSON.stringify(resume);
    for (const t of TEMPLATES) fitResume(resume, t.id, m);
    assert.equal(JSON.stringify(resume), snapshot);
  });
});

describe("compact match summary and full analysis", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { MatchSummary, FullAnalysis, summarizeMatch } = await import("../src/components/resume/ats-analysis-panel");
  const job = analyzeJobDescription(JD, {});
  const report = matchResume(experienced(), job, NOW);
  const recs = buildRecommendations(experienced(), job, report);
  const noop = () => undefined;
  const summary = (props: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      createElement(MatchSummary, {
        report,
        originalReport: report,
        recommendations: recs,
        scoreSource: "original",
        outdated: null,
        ...props,
      }),
    );
  const full = (props: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      createElement(FullAnalysis, {
        open: true,
        onToggle: noop,
        report,
        originalReport: report,
        scoreSource: "original",
        recommendations: recs,
        requirementWhy: new Map(job.requirements.map((r) => [r.id, r.why])),
        changes: null,
        formatting: { score: 80, checks: [] },
        ...props,
      }),
    );

  it("summarizes from the calculated report: score, only genuine skill gaps (at most 5), at most 3 recommendations", () => {
    const s = summarizeMatch(report, recs);
    const skills = report.matches.filter((m) => ["technical", "tools", "domain"].includes(m.category));
    assert.equal(s.score, report.score);
    assert.equal(s.total, skills.length);
    assert.equal(s.matched, skills.filter((m) => m.status === "demonstrated").length);
    assert.ok(s.toReview.length > 0 && s.toReview.length <= 5);
    for (const chip of s.toReview) {
      const m = report.matches.find((x) => x.name === chip.name)!;
      assert.ok(m && (m.status === "missing" || m.status === "partial"), `${chip.name} is a real gap from the JD analysis`);
    }
    const firstPartial = s.toReview.findIndex((m) => m.status === "partial");
    if (firstPartial >= 0) assert.ok(s.toReview.slice(firstPartial).every((m) => m.status === "partial"), "missing skills come first");
    assert.ok(s.topRecommendations.length > 0 && s.topRecommendations.length <= 3);
    const rank = { high: 3, medium: 2, low: 1 };
    assert.equal(s.topRecommendations[0]!.priority, [...recs].sort((a, b) => rank[b.priority] - rank[a.priority])[0]!.priority);
  });

  it("shows only the score, a status, skill chips and short recommendations by default", () => {
    const html = summary();
    const s = summarizeMatch(report, recs);
    assert.match(html, new RegExp(`>${report.score}</span><span[^>]*>/100</span>`));
    assert.match(html, /Good match|Fair match|Needs improvement/);
    assert.match(html, /Skills to improve/);
    for (const m of s.toReview) assert.match(html, new RegExp(`>${m.name}</li>`));
    assert.match(html, /Recommended improvements/);
    for (const r of s.topRecommendations) assert.ok(html.includes(`${r.title}.</li>`), r.title);
    for (const r of recs.filter((x) => !s.topRecommendations.includes(x))) assert.ok(!html.includes(r.title), `${r.title} is hidden`);
    for (const r of s.topRecommendations) assert.ok(!html.includes(r.suggestion), "no long explanations by default");
    for (const hidden of ["Keyword alignment", "How the score works", "Demonstrated", "Why:", "evidence", "Updated from"]) assert.ok(!html.includes(hidden), hidden);
  });

  it("shows 'Not scored' instead of 0 for a job description that is too short", () => {
    const thin = matchResume(experienced(), analyzeJobDescription("Python developer", {}), NOW);
    const html = summary({ report: thin, originalReport: thin });
    assert.match(html, /Not scored — the job description is too short/);
    assert.doesNotMatch(html, /\/100/);
    assert.doesNotMatch(html, />0</);
  });

  it("flags an outdated score after the inputs or the content change", () => {
    assert.match(summary({ outdated: "inputs" }), /Analyze again to update this match/);
    assert.match(summary({ outdated: "edited" }), /Re-check the score/);
  });

  it("keeps the full analysis collapsed until opened", () => {
    const html = full({ open: false });
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /View details/);
    assert.doesNotMatch(html, /Keyword alignment|How the score works/);
  });

  it("the open analysis has skills, recommendations, keyword alignment, experience relevance and the scoring explanation", () => {
    const html = full();
    for (const text of ["Keyword alignment", "Skills match", "Experience relevance", "Skills and requirements", "Recommendations", "How the score works", "Kafka"])
      assert.match(html, new RegExp(text));
    assert.match(html, /id="full-analysis-skills"/);
    assert.match(html, /id="full-analysis-recommendations"/);
    assert.match(html, /Missing skills are never added for you/);
    assert.match(html, /not\s+an employer&#x27;s ATS score/);
  });

  it("compares original and tailored scores once tailored content exists", () => {
    const tailoredResume = experienced();
    tailoredResume.experience[0]!.bullets.push("Deployed services with Docker and Kubernetes on AWS");
    const after = matchResume(tailoredResume, job, NOW);
    const updated = summary({ report: after, scoreSource: "tailored", validatedChanges: 2 });
    assert.match(updated, new RegExp(`>${after.score}</span>`));
    assert.match(updated, new RegExp(`Updated from ${report.score} · 2 validated content changes`));
    assert.doesNotMatch(updated, /<table/, "no comparison table by default");
    const html = full({ report: after, scoreSource: "tailored" });
    for (const row of ["ATS match", "Keyword alignment", "Skills match", "Requirements demonstrated", "Experience relevance"]) assert.match(html, new RegExp(row));
    assert.match(html, new RegExp(`<td[^>]*>${report.score}</td><td[^>]*>${after.score}</td>`));
    assert.match(html, /Kubernetes \(partly shown → demonstrated\)/);
  });
});

describe("workflow steps, tailoring progress and preview source", async () => {
  const { workflowSteps, tailorSteps } = await import("../src/components/resume/tailor-progress");
  const { composeJobDescription } = await import("../src/lib/resume/job-description");
  const states = (s: { state: string }[]) => s.map((x) => x.state);

  it("has three page steps with checkmarks only for finished ones", () => {
    assert.deepEqual(
      workflowSteps({ hasFile: false, analyzed: false, downloadReady: false }).map((s) => s.label),
      ["Upload Resume", "Add Job Description", "Tailor & Download"],
    );
    assert.deepEqual(states(workflowSteps({ hasFile: false, analyzed: false, downloadReady: false })), ["current", "todo", "todo"]);
    assert.deepEqual(states(workflowSteps({ hasFile: true, analyzed: false, downloadReady: false })), ["done", "current", "todo"]);
    assert.deepEqual(states(workflowSteps({ hasFile: true, analyzed: true, downloadReady: false })), ["done", "done", "current"]);
    assert.deepEqual(states(workflowSteps({ hasFile: true, analyzed: true, downloadReady: true })), ["done", "done", "done"]);
  });

  const base = { phase: null, failedAt: null, analyzed: true, tailored: false, rescored: false, documentValid: null } as const;

  it("never marks a tailoring step done before it succeeded", () => {
    assert.deepEqual(states(tailorSteps({ ...base, analyzed: false, phase: "analyze" })), ["active", "todo", "todo", "todo"]);
    assert.deepEqual(states(tailorSteps({ ...base, phase: "rewrite" })), ["done", "active", "todo", "todo"]);
    assert.deepEqual(states(tailorSteps({ ...base, tailored: true, rescored: true })), ["done", "done", "done", "active"]);
    assert.deepEqual(states(tailorSteps({ ...base, tailored: true, rescored: true, documentValid: true })), ["done", "done", "done", "done"]);
  });

  it("shows where tailoring failed", () => {
    assert.deepEqual(states(tailorSteps({ ...base, failedAt: "rewrite" })), ["done", "error", "todo", "todo"]);
    assert.deepEqual(states(tailorSteps({ ...base, analyzed: false, failedAt: "analyze" })), ["error", "todo", "todo", "todo"]);
    assert.deepEqual(states(tailorSteps({ ...base, tailored: true, rescored: true, documentValid: false })), ["done", "done", "done", "error"]);
  });

  it("the preview uses the tailored content once it exists, and edits over that", () => {
    assert.deepEqual(previewContent({ edited: null, tailored: null, original: "o" }), { resume: "o", kind: "original" });
    assert.deepEqual(previewContent({ edited: null, tailored: "t", original: "o" }), { resume: "t", kind: "tailored" });
    assert.deepEqual(previewContent({ edited: "e", tailored: "t", original: "o" }), { resume: "e", kind: "edited" });
  });

  it("adds the optional job title and company to the analyzed job description", () => {
    assert.equal(composeJobDescription("   ", "Engineer", "Acme"), null);
    assert.equal(composeJobDescription("Build APIs", "", ""), "Build APIs");
    assert.equal(composeJobDescription(" Build APIs ", " Backend Engineer ", "Acme"), "Job title: Backend Engineer\nCompany: Acme\nBuild APIs");
  });
});

describe("change detection, duplicate records and final validation", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ChangeLog } = await import("../src/components/resume/ats-analysis-panel");
  const job = analyzeJobDescription(JD, {});
  const vocab = job.requirements.filter((r) => r.category !== "responsibility" && r.category !== "qualification").map((r) => r.name);
  const tailorWith = (resume: StructuredResume, raw: unknown[]) => {
    const report = matchResume(resume, job, NOW);
    const rewrites = validateRewrites(resume, resumeToText(resume), raw, vocab);
    return { report, rewrites, ...applyTailoring(resume, rewrites, job, report) };
  };
  const SUMMARY = "Backend engineer building Python and Django REST APIs and PostgreSQL data models for loan processing.";
  const everyRewriteIsReal = (changes: import("../src/lib/resume/types").TailorChange[]) =>
    changes.filter((c) => c.kind === "rewritten").every((c) => compareText(c.before, c.after).kind === "rewritten");

  it("1. identical original and generated text is unchanged, never rewritten", () => {
    const original = experienced();
    const line = original.experience[0]!.bullets[1]!;
    assert.equal(compareText(line, line).kind, "unchanged");
    const { rewrites, changes } = tailorWith(original, [{ target: "experience.0.bullets.1", text: line, reason: "Improved." }]);
    assert.equal(rewrites.length, 0, "an identical 'rewrite' is not accepted");
    assert.ok(!changes.some((c) => c.kind === "rewritten"));
    assert.deepEqual(diffResume(original, coerceResume(JSON.parse(JSON.stringify(original)))).filter((c) => c.kind !== "unchanged"), []);
  });

  it("2. whitespace, case, quote and punctuation differences are not rewrites; changed numbers and terms are", () => {
    const a = "Designed PostgreSQL schemas and tuned slow queries for reporting";
    for (const b of [
      "  Designed  PostgreSQL schemas and tuned slow queries for reporting.  ",
      "designed postgresql schemas and tuned slow queries for reporting",
      "Designed PostgreSQL schemas & tuned slow queries for reporting;",
      "Designed PostgreSQL schemas and tuned slow queries\r\nfor reporting",
    ]) {
      assert.equal(compareText(a, b).kind, "unchanged", JSON.stringify(b));
    }
    const tokens = normalizeForCompare("Built it with Node.js, C++ and C# — 40% faster, $2M budget.").split(" ");
    for (const t of ["node.js", "c++", "c#", "40%", "$2m"]) assert.ok(tokens.includes(t), `keeps ${t}`);
    assert.equal(compareText("Built APIs used by 40 partner banks", "Built APIs used by 45 partner banks").kind, "rewritten");
    assert.equal(compareText("Created a Python tool for stock analysis", "Developed a Python tool for stock analysis").kind, "cosmetic", "one synonym is not a rewrite");
    const { rewrites } = tailorWith(experienced(), [
      { target: "experience.0.bullets.2", text: "Designed PostgreSQL schemas, and tuned slow queries for reporting." },
      { target: "experience.0.bullets.0", text: "Responsible for internal admin dashboard" },
    ]);
    assert.equal(rewrites.length, 0, "cosmetic edits are dropped before they reach the resume");
  });

  it("3. a genuinely improved bullet is rewritten, with the real before/after text and reason", () => {
    const quant = coerceResume({
      name: "Kiran Rao",
      skills: [{ label: "", items: ["Python", "Pandas", "NumPy"] }],
      projects: [{ name: "Pair Trading Screener", tech: "Python", bullets: ["Created Python analytical tool that identified highly correlated stock pairs for pair-trading strategies."] }],
    });
    const before = quant.projects[0]!.bullets[0]!;
    const after = "Developed a Python analytics tool using Pandas and NumPy to identify highly correlated stock pairs for pair-trading analysis.";
    assert.equal(compareText(before, after).kind, "rewritten");
    const rws = validateRewrites(quant, resumeToText(quant), [{ target: "projects.0.bullets.0", text: after, reason: "Names the libraries the project used." }], ["Pandas", "NumPy"]);
    assert.equal(rws[0]!.valid, true);
    const { resume, changes } = applyTailoring(quant, rws, job, matchResume(quant, job, NOW));
    const c = changes.find((x) => x.kind === "rewritten")!;
    assert.deepEqual([c.section, c.before, c.after, c.reason], ["Projects · Pair Trading Screener", before, after, "Names the libraries the project used."]);
    assert.ok(resume.projects[0]!.bullets.includes(after));
    const html = renderToStaticMarkup(createElement(ChangeLog, { changes }));
    assert.match(html, /Pair Trading Screener<\/span><span[^>]*> — Rewritten/);
    assert.ok(html.includes(`Original: </dt><dd class="inline text-muted">${before}`));
    assert.ok(html.includes("Why: Names the libraries the project used."));
    assert.doesNotMatch(html, /line-through/);
  });

  it("4. moved content is reordered, never shown as rewritten", () => {
    const { changes, resume } = tailorWith(fresher(), []);
    assert.equal(resume.projectsFirst, true);
    assert.equal(changes.find((c) => c.section === "Section order")?.kind, "reordered");
    assert.equal(countChanges(changes).rewritten, 0);
    const exp = tailorWith(experienced(), []);
    const moved = exp.changes.find((c) => c.kind === "reordered" && c.section.startsWith("Experience · Software Engineer"))!;
    assert.ok(moved, "bullet reorder is reported");
    assert.equal(moved.before, "", "a reorder carries no struck-through 'before' text");
    assert.ok(exp.changes.some((c) => c.kind === "reordered" && c.section === "Projects" && c.after.startsWith("Queue Monitor")));
    const html = renderToStaticMarkup(createElement(ChangeLog, { changes: exp.changes }));
    assert.doesNotMatch(html, /line-through/);
    assert.match(html, /Unchanged \(\d+\)/, "unchanged items are listed honestly");
    assert.ok(everyRewriteIsReal(exp.changes));
  });

  const INTERN = {
    title: "Data Analyst Intern",
    organization: "Zeta Analytics Pvt Ltd",
    location: "Bengaluru",
    dates: "May 2025 - Jul 2025",
    bullets: ["Built SQL reports in Python for the sales team", "Cleaned survey data with Pandas"],
  };

  it("5. an internship listed twice is merged (exact and near-duplicate), and the merge is reported", () => {
    const exact = mergeDuplicates(coerceResume({ name: "Meera", experience: [INTERN], internships: [INTERN] }));
    assert.equal(exact.merged.length, 1);
    assert.equal(exact.resume.experience.length + exact.resume.internships.length, 1);
    assert.equal(exact.resume.internships.length, 1, "kept under internships");

    const near = coerceResume({
      name: "Meera",
      experience: [{ ...INTERN, title: "Data Analyst Internship", organization: "Zeta Analytics", dates: "05/2025 – 07/2025", bullets: ["Built SQL reports in Python for the sales team.", "Cleaned survey data with Pandas"] }],
      internships: [INTERN],
    });
    const merged = mergeDuplicates(near);
    assert.equal(merged.merged.length, 1);
    assert.deepEqual(merged.resume.internships[0]!.bullets, INTERN.bullets, "no bullet is doubled");

    const { resume, changes } = tailorWith(near, []);
    assert.equal(resume.experience.length + resume.internships.length, 1);
    const removed = changes.find((c) => c.kind === "removed" && c.section.startsWith("Experience · Data Analyst Internship"));
    assert.match(removed?.reason ?? "", /^Duplicate of Internship · Data Analyst Intern, Zeta Analytics Pvt Ltd/);
    assert.deepEqual(verifyTailoring(resume, changes, resumeToText(near), vocab), []);
  });

  it("6. distinct roles at one company are kept; ambiguous ones with missing dates are flagged, not merged", () => {
    const roles = coerceResume({
      name: "Dev",
      experience: [
        { title: "Software Engineer", organization: "Acme", dates: "Jan 2020 - Dec 2021", bullets: ["Built billing APIs in Python"] },
        { title: "Senior Software Engineer", organization: "Acme Inc.", dates: "Jan 2022 - Present", bullets: ["Led the payments platform team"] },
        { title: "Software Engineer", organization: "Acme", dates: "Jan 2018 - Dec 2019", bullets: ["Maintained the mobile app backend"] },
      ],
    });
    const r = mergeDuplicates(roles);
    assert.equal(r.merged.length, 0);
    assert.equal(r.review.length, 0);
    assert.equal(r.resume.experience.length, 3);

    const undated = coerceResume({
      name: "Dev",
      experience: [
        { title: "Software Engineer", organization: "Acme", dates: "Jan 2020 - Dec 2021", bullets: ["Built billing APIs in Python"] },
        { title: "Software Engineer", organization: "Acme", dates: "", bullets: ["Wrote internal tooling scripts for QA"] },
      ],
    });
    const u = mergeDuplicates(undated);
    assert.equal(u.merged.length, 0, "unclear pairs are never merged");
    assert.equal(u.review.length, 1);
    assert.match(u.review[0]!.reason, /missing dates/);
    assert.equal(u.resume.experience.length, 2);

    const undatedCopy = mergeDuplicates(coerceResume({ name: "Dev", experience: [undated.experience[0]!, { ...undated.experience[0]!, dates: "" }] }));
    assert.equal(undatedCopy.merged.length, 1, "same role and description without dates is a duplicate");
    assert.equal(undatedCopy.resume.experience[0]!.dates, "Jan 2020 - Dec 2021", "the dated copy is kept");

    const projects = mergeDuplicates(coerceResume({ name: "Dev", projects: [{ name: "Queue Monitor", bullets: ["Built a Redis queue monitor"] }, { name: "Queue Monitor", bullets: ["Built a Redis queue monitor."] }] }));
    assert.equal(projects.resume.projects.length, 1);
  });

  it("7. original and tailored resumes are scored by the same algorithm against the same JD; rewording alone does not raise it", () => {
    const original = experienced();
    const { report, resume } = tailorWith(original, [{ target: "summary", text: SUMMARY }]);
    const after = matchResume(resume, job, NOW);
    assert.equal(after.scoringVersion, report.scoringVersion);
    assert.equal(report.score, matchResume(original, job, NOW).score);
    const plain = tailorWith(experienced(), []).resume;
    const cosmetic = tailorWith(experienced(), [{ target: "experience.0.bullets.2", text: "Designed PostgreSQL schemas & tuned slow queries for reporting." }]).resume;
    assert.equal(matchResume(cosmetic, job, NOW).score, matchResume(plain, job, NOW).score);
  });

  it("8. final validation rejects fake rewrite labels, unsupported skills, invented metrics and leftover duplicates", () => {
    const original = experienced();
    const src = resumeToText(original);
    const { resume, changes, rewrites } = tailorWith(original, [
      { target: "summary", text: SUMMARY },
      { target: "experience.0.bullets.2", text: "Designed PostgreSQL schemas with Kafka, cutting query time by 60%" },
    ]);
    assert.equal(rewrites.find((r) => r.target === "experience.0.bullets.2")?.valid, false);
    assert.deepEqual(verifyTailoring(resume, changes, src, vocab), []);
    const fake = [...changes, { kind: "rewritten" as const, section: "Professional Summary", before: resume.summary, after: `${resume.summary} `, reason: "" }];
    assert.match(verifyTailoring(resume, fake, src, vocab).join(";"), /labelled rewritten but its content did not change/);
    const forged = JSON.parse(JSON.stringify(resume)) as StructuredResume;
    const label = changes.find((c) => c.section.startsWith("Experience · Software Engineer"))!.section;
    forged.experience[0]!.bullets[0] = "Ran Kubernetes clusters for 500 partner banks";
    const forgedChange = { kind: "rewritten" as const, section: label, before: original.experience[0]!.bullets[1]!, after: forged.experience[0]!.bullets[0]!, reason: "" };
    const issues = verifyTailoring(forged, [forgedChange], src, vocab).join(";");
    assert.match(issues, /Kubernetes/);
    assert.match(issues, /500/);
    const dup = JSON.parse(JSON.stringify(resume)) as StructuredResume;
    dup.experience.push(JSON.parse(JSON.stringify(dup.experience[0])));
    assert.match(verifyTailoring(dup, changes, src, vocab).join(";"), /duplicates/);
  });

  it("8b. immutable source facts and demonstrated evidence cannot regress", () => {
    const original = experienced();
    const changed = JSON.parse(JSON.stringify(original)) as StructuredResume;
    changed.experience[0]!.organization = "Invented Client";
    changed.education = [];
    changed.skills[0]!.items = changed.skills[0]!.items.slice(1);
    const issues = sourceIntegrityIssues(original, changed).join(";");
    assert.match(issues, /work or internship identity/);
    assert.match(issues, /education/);
    assert.match(issues, /listed skill/);

    const before = matchResume(original, job, NOW);
    const weakened = JSON.parse(JSON.stringify(original)) as StructuredResume;
    weakened.experience[0]!.bullets = [];
    const after = matchResume(weakened, job, NOW);
    assert.ok(matchRegressionIssues(before, after).length > 0);
  });

  it("9-10. the preview is the tailored object, and the PDF and DOCX carry every reported change", async () => {
    const original = experienced();
    const { resume, changes } = tailorWith(original, [
      { target: "summary", text: SUMMARY },
      { target: "experience.0.bullets.0", text: "Owned the internal admin dashboard end to end" },
    ]);
    const preview = previewContent({ edited: null, tailored: resume, original });
    assert.equal(preview.resume, resume, "the preview shows the exact validated object");
    const fit = fitResume(resume, "classic", measurer);
    assert.equal(fit.validation.ok, true, fit.validation.issues.join("; "));
    const layoutText = normalizeForCompare(fit.layout.blocks.flatMap((b) => b.runs.map((r) => r.text)).join(" "));
    const xml = resumeDocumentXml(fit.layout);
    assert.ok(docxMatchesLayout(xml, fit.layout), "DOCX matches the preview layout");
    const docx = docxBlob(xml);
    const reopenedDocx = normalizeForCompare(
      (await mammoth.extractRawText({ buffer: Buffer.from(await docx.arrayBuffer()) })).value,
    );
    const pdf = await buildResumePdf(resume, "classic");
    assert.equal(pdf.pageCount, fit.pageCount, "PDF pages = preview pages");
    const { text } = await extractText(await getDocumentProxy(pdf.bytes), { mergePages: true });
    const pdfText = normalizeForCompare(text);
    const rewritten = changes.filter((c) => c.kind === "rewritten");
    assert.equal(rewritten.length, 2);
    for (const c of rewritten) {
      const head = normalizeForCompare(c.after).split(" ").slice(0, 5).join(" ");
      assert.ok(layoutText.includes(head), `preview has ${c.section}`);
      assert.ok(pdfText.includes(head), `PDF has ${c.section}`);
      assert.ok(normalizeForCompare(xml.replace(/<[^>]+>/g, " ")).includes(head), `DOCX has ${c.section}`);
      assert.ok(reopenedDocx.includes(head), `reopened DOCX has ${c.section}`);
    }
    assert.ok(!pdfText.includes(normalizeForCompare("Engineer who likes clean code")), "PDF is not the original");
  });

  it("12. with no meaningful content change, tailoring is not reported as successful", () => {
    const once = tailorWith(experienced(), [{ target: "summary", text: SUMMARY }]).resume;
    const again = tailorWith(once, [
      { target: "summary", text: `${once.summary}  ` },
      { target: "experience.0.bullets.0", text: once.experience[0]!.bullets[0]!.toLowerCase() },
    ]);
    assert.equal(again.rewrites.length, 0);
    const counts = countChanges(again.changes);
    assert.equal(counts.hasMeaningfulChanges, false);
    assert.equal(counts.rewritten + counts.added, 0);
    assert.ok(again.changes.every((c) => c.kind === "unchanged"), again.changes.map((c) => `${c.kind} ${c.section}`).join("; "));
  });
});

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

const RESUME_TEXT = `Asha Verma
Backend Engineer
asha.verma@example.test | +91 98765 43210 | Pune, India

SUMMARY
Engineer who likes clean code.

SKILLS
Languages: JavaScript, Python
Tools: Git, Jira, Docker

EXPERIENCE
Software Engineer, Finlytics Pvt Ltd, Pune    Jan 2022 - Present
- Responsible for the internal admin dashboard
- Built REST APIs in Django and Python for loan processing used by 40 partner banks
- Designed PostgreSQL schemas and tuned slow queries for reporting

EDUCATION
B.Tech in Computer Science, Pune University, 2016 - 2020
`;

const PARSE_REPLY = {
  resume: {
    name: "Asha Verma",
    headline: "Backend Engineer",
    contact: { email: "asha.verma@example.test", phone: "+91 98765 43210", location: "Pune, India", links: [] },
    summary: "Engineer who likes clean code.",
    skills: [
      { label: "Languages", items: ["JavaScript", "Python"] },
      { label: "Tools", items: ["Git", "Jira", "Docker"] },
    ],
    experience: [
      {
        title: "Software Engineer",
        organization: "Finlytics Pvt Ltd",
        location: "Pune",
        dates: "Jan 2022 - Present",
        bullets: [
          "Responsible for the internal admin dashboard",
          "Built REST APIs in Django and Python for loan processing used by 40 partner banks",
          "Designed PostgreSQL schemas and tuned slow queries for reporting",
        ],
      },
    ],
    education: [{ title: "B.Tech in Computer Science", organization: "Pune University", dates: "2016 - 2020", bullets: [] }],
  },
  job: { title: "Backend Software Engineer", minYears: 3, requirements: [{ name: "Kafka", category: "tools", importance: "preferred", why: "Event streaming between services.", evidence: "" }] },
  summary: "Strong Python/Django fit; Kubernetes and Kafka are gaps.",
};

const TAILOR_REPLY = {
  rewrites: [
    { target: "summary", text: "Backend engineer building Python and Django REST APIs and PostgreSQL data models for loan processing.", reason: "Targets the backend role.", needsMetric: false },
    { target: "experience.0.bullets.0", text: "Owned the internal admin dashboard end to end", reason: "Ownership verb.", needsMetric: true },
    { target: "experience.0.bullets.2", text: "Designed PostgreSQL schemas with Kafka, cutting query time by 60%", reason: "Adds impact." },
  ],
};

let replies: unknown[] = [];
const aiCalls: string[] = [];
const aiPrompts: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (/groq\.com|openai\.com|googleapis\.com|openrouter\.ai|anthropic\.com/.test(url)) {
    aiCalls.push(url);
    let prompt = "";
    try {
      const sent = JSON.parse(String(init?.body ?? "{}")) as { messages?: { content: string }[] };
      prompt = sent.messages?.at(-1)?.content ?? "";
    } catch {
      // not a chat request
    }
    aiPrompts.push(prompt);
    const queued = replies.shift();
    const next = typeof queued === "function" ? (queued as (p: string) => unknown)(prompt) : queued;
    if (next === "fail") return new Response("upstream down", { status: 503 });
    const content = typeof next === "string" ? next : JSON.stringify(next ?? {});
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return realFetch(input, init);
}) as typeof fetch;

const now = new Date().toISOString();
await updateStore((s) => {
  s.workspace.id = "ws_t";
  s.users = [
    { id: "usr_t", name: "Tailor User", email: "usr_t@cueai.local", passwordHash: "x", role: "User", status: "Active" as const, workspaceId: "ws_t", createdAt: now, plan: "free" as const },
  ];
});
const cookie = `${SESSION_COOKIE}=${signSession({ userId: "usr_t", email: "usr_t@cueai.local", name: "Tailor User", role: "User", workspaceId: "ws_t", workspace: "ws_t" })}`;

let seq = 0;
function form(mode: "analyze" | "tailor", jd = JD, text = RESUME_TEXT) {
  const f = new FormData();
  // A unique trailing line gives each test its own cache entry.
  f.append("resume", new File([`${text}\nRef ${++seq}`], "resume.txt", { type: "text/plain" }));
  f.append("jobDescription", jd);
  f.append("mode", mode);
  return f;
}

async function post(handler: (r: NextRequest) => Promise<Response>, url: string, body: FormData | string, withCookie = true) {
  const headers: Record<string, string> = withCookie ? { cookie } : {};
  if (typeof body === "string") headers["content-type"] = "application/json";
  const res = await handler(new NextRequest(`http://127.0.0.1:3000${url}`, { method: "POST", headers, body }));
  return res;
}

beforeEach(() => {
  replies = [];
  aiCalls.length = 0;
  aiPrompts.length = 0;
});

describe("POST /api/resume/analyze (analyze and tailor)", () => {
  it("analyze returns a real match report from the uploaded resume and JD, with one AI call", async () => {
    replies = [PARSE_REPLY];
    const res = await post(analyzePost, "/api/resume/analyze", form("analyze"));
    const body = (await res.json()) as TailorBody & Required<Pick<TailorBody, "match" | "resume" | "job" | "recommendations" | "formatting">>;
    assert.equal(res.status, 200, body.error);
    assert.equal(aiCalls.length, 1);
    assert.equal(body.mode, "analyze");
    assert.equal(body.scoringVersion, SCORING_VERSION);
    assert.ok(body.analysisId && body.resumeHash && body.jdHash);
    assert.equal(body.resume.summary, "Engineer who likes clean code.");
    assert.equal(body.tailored, undefined, "analysis does not tailor");
    assert.equal(body.match.score, matchResume(coerceResume(PARSE_REPLY.resume), body.job).score, "score comes from the documented algorithm");
    assert.ok(body.match.matches.some((m) => m.name === "Kafka" && m.status === "missing"));
    assert.ok(body.recommendations.length > 0);
    assert.ok(typeof body.formatting.score === "number");
    const saved = (await readStore()).resumeAnalyses?.find((r) => r.id === body.analysisId);
    assert.ok(saved, "analysis is persisted");
    assert.equal(saved!.score, body.match.score);
    assert.equal(saved!.jdHash, body.jdHash);
    assert.ok(!JSON.stringify(saved).includes("loan processing"), "no resume text is persisted");
  });

  it("tailor returns changed content, keeps the original, and rejects fabricated rewrites", async () => {
    replies = [PARSE_REPLY, TAILOR_REPLY, { rewrites: [] }];
    const res = await post(analyzePost, "/api/resume/analyze", form("tailor"));
    const body = (await res.json()) as TailorBody & Required<Pick<TailorBody, "match" | "resume" | "tailored">>;
    assert.equal(res.status, 200, body.error);
    assert.equal(body.resume.summary, "Engineer who likes clean code.", "original is preserved");
    const t = body.tailored;
    assert.match(t.resume.summary, /Django REST APIs/);
    assert.ok(t.resume.experience[0].bullets.includes("Owned the internal admin dashboard end to end"));
    assert.ok(!JSON.stringify(t.resume).match(/Kafka|60%/), "fabrications are never applied");
    assert.ok(t.changes.some((c) => c.kind === "rewritten"));
    assert.ok(t.resume.skills.flatMap((g) => g.items).includes("Django"));
    assert.deepEqual(t.metricPrompts.map((p) => p.target), ["experience.0.bullets.0"]);
    assert.ok(t.match.score! >= body.match.score!);
    const saved = (await readStore()).resumeAnalyses?.find((r) => r.id === body.analysisId);
    assert.equal(saved?.status, "tailored");
    assert.equal(saved?.tailoredScore, t.match.score);
  });

  it("tailoring after analysis reuses the cached parse (one extra AI call)", async () => {
    const f1 = form("analyze");
    const file = f1.get("resume") as File;
    replies = [PARSE_REPLY];
    assert.equal((await post(analyzePost, "/api/resume/analyze", f1)).status, 200);
    aiCalls.length = 0;
    replies = [TAILOR_REPLY, { rewrites: [] }];
    const f2 = new FormData();
    f2.append("resume", file);
    f2.append("jobDescription", JD);
    f2.append("mode", "tailor");
    const res = await post(analyzePost, "/api/resume/analyze", f2);
    assert.equal(res.status, 200);
    assert.ok(aiCalls.length >= 1 && aiCalls.length <= 2, `tailor + optional fact-check retry, got ${aiCalls.length}`);
  });

  it("rejects an empty or whitespace JD with 400 before any AI call", async () => {
    for (const jd of ["", "   \n  "]) {
      const res = await post(analyzePost, "/api/resume/analyze", form("analyze", jd));
      assert.equal(res.status, 400);
      assert.equal(((await res.json()) as { error: string }).error, "Job description is required to tailor your resume.");
    }
    assert.equal(aiCalls.length, 0);
  });

  it("reports an unreadable model response instead of a fake score", async () => {
    replies = ["this is not json"];
    const res = await post(analyzePost, "/api/resume/analyze", form("analyze"));
    assert.equal(res.status, 502);
    const body = (await res.json()) as Record<string, unknown>;
    assert.match(String(body.error), /unreadable/);
    assert.equal(body.match, undefined);
  });

  it("reports provider failure during tailoring without pretending it succeeded", async () => {
    replies = [PARSE_REPLY, "fail", "fail", "fail", "fail", "fail"];
    const res = await post(analyzePost, "/api/resume/analyze", form("tailor"));
    assert.equal(res.status, 502);
    assert.match(String(((await res.json()) as { error: string }).error), /tailoring is unavailable/);
  });

  it("requires authentication", async () => {
    const res = await post(analyzePost, "/api/resume/analyze", form("analyze"), false);
    assert.equal(res.status, 401);
    assert.equal(aiCalls.length, 0);
  });
});

describe("re-analysis and PDF API", () => {
  it("re-scores edited content against the same job profile without an AI call", async () => {
    const job = analyzeJobDescription(JD, {});
    const edited = experienced();
    edited.experience[0]!.bullets.push("Deployed services to Kubernetes on AWS");
    const res = await post(scorePost, "/api/resume/score", JSON.stringify({ resume: edited, jobDescription: JD, job }));
    const body = (await res.json()) as ScoreBody;
    assert.equal(res.status, 200);
    assert.equal(aiCalls.length, 0);
    assert.equal(body.match.matches.find((m) => m.name === "Kubernetes")?.status, "demonstrated");
    const before = matchResume(experienced(), job);
    assert.ok(body.match.score! > before.score!);
  });

  it("re-analysis still requires a job description", async () => {
    const res = await post(scorePost, "/api/resume/score", JSON.stringify({ resume: experienced(), jobDescription: "  ", job: {} }));
    assert.equal(res.status, 400);
  });

  it("the PDF route returns the validated document with its real page count", async () => {
    const res = await post(pdfPost, "/api/resume/pdf", JSON.stringify({ resume: longExperienced(), template: "modern" }));
    assert.equal(res.status, 200);
    const pages = Number(res.headers.get("X-Resume-Pages"));
    const bytes = new Uint8Array(await res.arrayBuffer());
    const doc = await getDocumentProxy(bytes);
    assert.equal(doc.numPages, pages);
    assert.ok(pages >= 2);
  });
});

/* ------------------------------------------------------------------ */
/* One unchanged source resume, two different job descriptions          */
/* ------------------------------------------------------------------ */

const SOURCE_TEXT = `Priya Nair
priya.nair@example.test | +91 90000 11111 | Kochi, India

SUMMARY
Recent computer science graduate.

SKILLS
Python, SQL, PostgreSQL, Flask, Pandas, Matplotlib, Excel, Git

INTERNSHIP
Software Engineering Intern, Kerala Freight Systems, Kochi    Jan 2025 - Jun 2025
- Worked on Flask endpoints in Python for shipment status lookups
- Wrote SQL queries against PostgreSQL to fix slow order reports
- Helped the operations team with weekly Excel reports

PROJECTS
Sales Insights | Python, Pandas, Matplotlib, SQL
- Cleaned 2 years of store sales data with Pandas and SQL
- Made charts in Matplotlib showing monthly revenue trends
Library API | Python, Flask, PostgreSQL
- Made a REST API in Flask for book loans stored in PostgreSQL

EDUCATION
B.Tech in Computer Science, CUSAT, 2021 - 2025
`;

const SOURCE_PARSED = {
  name: "Priya Nair",
  headline: "",
  contact: { email: "priya.nair@example.test", phone: "+91 90000 11111", location: "Kochi, India", links: [] },
  summary: "Recent computer science graduate.",
  skills: [{ label: "", items: ["Python", "SQL", "PostgreSQL", "Flask", "Pandas", "Matplotlib", "Excel", "Git"] }],
  internships: [
    {
      title: "Software Engineering Intern",
      organization: "Kerala Freight Systems",
      location: "Kochi",
      dates: "Jan 2025 - Jun 2025",
      bullets: [
        "Worked on Flask endpoints in Python for shipment status lookups",
        "Wrote SQL queries against PostgreSQL to fix slow order reports",
        "Helped the operations team with weekly Excel reports",
      ],
    },
  ],
  projects: [
    { name: "Sales Insights", tech: "Python, Pandas, Matplotlib, SQL", bullets: ["Cleaned 2 years of store sales data with Pandas and SQL", "Made charts in Matplotlib showing monthly revenue trends"] },
    { name: "Library API", tech: "Python, Flask, PostgreSQL", bullets: ["Made a REST API in Flask for book loans stored in PostgreSQL"] },
  ],
  education: [{ title: "B.Tech in Computer Science", organization: "CUSAT", dates: "2021 - 2025", bullets: [] }],
};

const JD_BACKEND = `Junior Python Backend Developer
We are looking for a junior backend developer to join our logistics team.
Responsibilities: build and maintain REST APIs in Python, design PostgreSQL database schemas, write unit tests with pytest, and deploy services with Docker and Kubernetes.
Requirements: Python, Flask or Django, SQL and PostgreSQL, REST API design, Git. Bachelor's degree in Computer Science.`;

const JD_ANALYST = `Data Analyst (Entry Level)
About the role: help our retail team make decisions with data.
What you'll do:
- Write SQL queries to extract and analyze sales data
- Clean and prepare datasets using Python and Pandas
- Build dashboards and data visualizations in Tableau
- Present weekly reporting to business stakeholders
Requirements:
- Strong SQL and Excel
- Python (Pandas) for data analysis
- Data visualization experience
- Statistics fundamentals`;

type Case = {
  name: string;
  jd: string;
  job: Record<string, unknown>;
  rewrites: Record<string, unknown>[];
  newSummary: RegExp;
  emphasis: { firstSkill: string; firstProject: string };
  unsupported: RegExp;
  gaps: string[];
};

const CASES: Case[] = [
  {
    name: "Test A: Python backend developer",
    jd: JD_BACKEND,
    job: {
      title: "Junior Python Backend Developer",
      minYears: 0,
      requirements: [
        { name: "Python", category: "technical", importance: "required", why: "Primary backend language.", evidence: "Worked on Flask endpoints in Python for shipment status lookups" },
        { name: "PostgreSQL", category: "tools", importance: "required", why: "Primary database.", evidence: "Wrote SQL queries against PostgreSQL to fix slow order reports" },
        { name: "Kubernetes", category: "tools", importance: "required", why: "Deployment platform.", evidence: "" },
      ],
      responsibilities: ["Build and maintain REST APIs in Python", "Design PostgreSQL database schemas"],
    },
    rewrites: [
      { target: "summary", text: "Computer science graduate building Python backend services: Flask REST APIs, PostgreSQL queries and SQL for order reports, from an internship and projects.", reason: "Targets the backend role." },
      { target: "internships.0.bullets.0", text: "Built Python Flask endpoints serving shipment status lookups", reason: "Action verb, backend terms first." },
      { target: "internships.0.bullets.1", text: "Optimized slow order reports by rewriting SQL queries against PostgreSQL", reason: "Database work first." },
      { target: "projects.1.bullets.0", text: "Built and maintained a Flask REST API in Python for book loans, with data stored in PostgreSQL", reason: "Matches the API responsibility." },
      { target: "projects.0.bullets.0", text: "Cleaned 2 years of store sales data with Pandas, deployed on Kubernetes", reason: "Adds deployment." },
      { target: "skills", skills: [{ label: "Backend", items: ["Python", "Flask", "PostgreSQL", "SQL", "Git"] }, { label: "Data", items: ["Pandas", "Matplotlib", "Excel"] }, { label: "Cloud", items: ["Kubernetes"] }], reason: "Backend skills first." },
    ],
    newSummary: /Python backend services: Flask REST APIs/,
    emphasis: { firstSkill: "Python", firstProject: "Library API" },
    unsupported: /kubernetes/i,
    gaps: ["Kubernetes", "Docker"],
  },
  {
    name: "Test B: data analyst",
    jd: JD_ANALYST,
    job: {
      title: "Data Analyst (Entry Level)",
      minYears: 0,
      requirements: [
        { name: "SQL", category: "technical", importance: "required", why: "Data extraction.", evidence: "Cleaned 2 years of store sales data with Pandas and SQL" },
        { name: "Tableau", category: "tools", importance: "required", why: "Dashboard tool.", evidence: "" },
        { name: "Statistics fundamentals", category: "domain", importance: "required", why: "Sound analysis.", evidence: "" },
      ],
      responsibilities: ["Write SQL queries to extract and analyze sales data", "Clean and prepare datasets using Python and Pandas"],
    },
    rewrites: [
      { target: "summary", text: "Computer science graduate who analyzes sales data with SQL, Python and Pandas and presents revenue trends with Matplotlib charts.", reason: "Targets the analyst role." },
      { target: "projects.0.bullets.0", text: "Cleaned and prepared 2 years of store sales data for analysis using SQL and Pandas", reason: "Uses the JD's wording." },
      { target: "projects.0.bullets.1", text: "Created data visualization of monthly revenue trends with Matplotlib charts", reason: "Uses the JD's term for work the line shows." },
      { target: "internships.0.bullets.2", text: "Prepared weekly Excel reports for the operations team", reason: "Reporting for stakeholders." },
      { target: "internships.0.bullets.1", text: "Built Tableau dashboards from SQL queries against PostgreSQL", reason: "Adds BI." },
      { target: "skills", skills: [{ label: "Data analysis", items: ["SQL", "Python", "Pandas", "Matplotlib", "Excel"] }, { label: "Engineering", items: ["PostgreSQL", "Flask", "Git"] }, { label: "BI", items: ["Tableau"] }], reason: "Analysis skills first." },
    ],
    newSummary: /analyzes sales data with SQL, Python and Pandas/,
    emphasis: { firstSkill: "SQL", firstProject: "Sales Insights" },
    unsupported: /tableau|dashboard/i,
    gaps: ["Tableau", "Statistics"],
  },
];

/** Stands in for the provider: answers each stage from what the prompt actually contains. */
function fakeModel(c: Case) {
  return (prompt: string) => {
    if (prompt.includes("rejected by a fact checker")) return { rewrites: [] };
    if (prompt.includes("Return a rewrite for each item")) return { rewrites: c.rewrites };
    if (prompt.includes('"resume": {')) return { resume: SOURCE_PARSED, job: c.job, summary: "Coaching summary." };
    return "unexpected prompt";
  };
}

function uploadForm(jd: string, extra = "") {
  const f = new FormData();
  f.append("resume", new File([`${SOURCE_TEXT}${extra}`], "priya.txt", { type: "text/plain" }));
  f.append("jobDescription", jd);
  f.append("mode", "tailor");
  f.append("template", "modern");
  return f;
}

describe("JD-based tailoring: one source resume, two job descriptions", () => {
  const m = measurer;
  const sourceSnapshot = JSON.stringify(SOURCE_PARSED);
  const tailoredSummaries: string[] = [];

  for (const c of CASES) {
    it(c.name, async () => {
      replies = [fakeModel(c), fakeModel(c), fakeModel(c)];
      const res = await post(analyzePost, "/api/resume/analyze", uploadForm(c.jd, `\n${c.name}`));
      const body = (await res.json()) as TailorBody & Required<Pick<TailorBody, "match" | "resume" | "job" | "tailored">>;
      assert.equal(res.status, 200, body.error);

      // The JD reaches both the analysis and the generation prompt, with the analysis results.
      // Multipart form encoding sends the JD's newlines as CRLF, as browsers do.
      const [analyzePrompt, tailorPrompt] = aiPrompts.map((p) => p.replace(/\r/g, ""));
      assert.ok(analyzePrompt!.includes(c.jd), "JD sent to analysis");
      assert.ok(tailorPrompt!.includes(c.jd), "full JD sent to generation");
      assert.match(tailorPrompt!, new RegExp(`JOB REQUIREMENTS THIS RESUME SHOWS \\([^)]*\\): .*${c.emphasis.firstSkill}`));
      assert.doesNotMatch(tailorPrompt!.split("\n").find((l) => l.startsWith("JOB REQUIREMENTS THIS RESUME SHOWS"))!, /degree/i);
      assert.match(tailorPrompt!, new RegExp(`DOES NOT SHOW \\(never mention them anywhere\\): .*${c.gaps[0]}`));
      assert.match(tailorPrompt!, /ANALYSIS RECOMMENDATIONS:\n- \w/);
      assert.match(tailorPrompt!, /FORMAT: "Modern Professional" ATS template.*ONE A4 page/);

      // The score comes from the real inputs and the documented algorithm, for both versions.
      const original = coerceResume(SOURCE_PARSED);
      assert.equal(body.match.status, "scored");
      assert.ok(body.match.requirementCount >= 6, `requirements read: ${body.match.requirementCount}`);
      assert.equal(body.match.score, matchResume(original, body.job).score);
      const t = body.tailored;
      assert.equal(t.match.scoringVersion, body.match.scoringVersion);
      assert.equal(t.match.score, matchResume(t.resume, body.job).score, "tailored score uses the same algorithm");
      assert.ok(t.match.score! >= body.match.score!, `before ${body.match.score}, after ${t.match.score}`);

      // Structured content changed where the source supports it.
      assert.equal(body.resume.summary, "Recent computer science graduate.", "source resume unchanged");
      assert.equal(JSON.stringify(SOURCE_PARSED), sourceSnapshot);
      assert.match(t.resume.summary, c.newSummary);
      assert.equal(t.resume.skills[0]!.items[0], c.emphasis.firstSkill);
      assert.equal(t.resume.projects[0]!.name, c.emphasis.firstProject);
      assert.ok(t.changes.filter((x) => x.kind === "rewritten").length >= 3);
      assert.deepEqual(
        t.resume.internships.map((e) => [e.title, e.organization, e.dates]),
        original.internships.map((e) => [e.title, e.organization, e.dates]),
        "employers, titles and dates are preserved",
      );

      // Unsupported qualifications are never added; they stay as gaps.
      const tailoredText = resumeToText(t.resume);
      assert.doesNotMatch(tailoredText, c.unsupported);
      for (const gap of c.gaps) assert.equal(t.match.matches.find((x) => x.name.toLowerCase() === gap.toLowerCase())?.status, "missing", gap);
      assert.ok(t.rewriteSet.some((r) => !r.valid && /does not show/.test(r.rejectReason ?? "")), "fabricated line rejected");

      // The preview, PDF and DOCX all carry the generated content.
      const preview = previewContent({ edited: null, tailored: t.resume, original: body.resume });
      assert.equal(preview.kind, "tailored");
      const shown = preview.resume!;
      const fit = fitResume(shown, "modern", m);
      assert.equal(fit.validation.ok, true, fit.validation.issues.join("; "));
      assert.equal(fit.pageCount, 1, "concise early-career resume fits one page");
      const layoutText = fit.layout.blocks.flatMap((b) => b.runs.map((r) => r.text)).join(" ");
      assert.ok(layoutText.includes(t.resume.summary.slice(0, 40)), "preview shows the tailored summary");
      const pdfRes = await post(pdfPost, "/api/resume/pdf", JSON.stringify({ resume: shown, template: "modern" }));
      assert.equal(pdfRes.status, 200);
      assert.equal(Number(pdfRes.headers.get("X-Resume-Pages")), fit.pageCount, "PDF pages = preview pages");
      const { text } = await extractText(await getDocumentProxy(new Uint8Array(await pdfRes.arrayBuffer())), { mergePages: true });
      const flat = text.replace(/\s+/g, " ");
      assert.ok(flat.includes(t.resume.summary.slice(0, 40)), "PDF has the tailored summary");
      assert.ok(!flat.includes("Recent computer science graduate."), "PDF is not the original");
      const xml = resumeDocumentXml(fit.layout);
      assert.ok(docxMatchesLayout(xml, fit.layout), "DOCX matches the preview");
      assert.ok(xml.includes(t.resume.summary.slice(0, 40)));

      tailoredSummaries.push(t.resume.summary);
      console.log(
        `${c.name}: score ${body.match.score} -> ${t.match.score}, keywords ${body.match.keywordAlignment}% -> ${t.match.keywordAlignment}%, ` +
          `skills ${body.match.skillsMatch}% -> ${t.match.skillsMatch}%, demonstrated ${countShown(body.match)} -> ${countShown(t.match)}, ` +
          `experience ${expScore(body.match)} -> ${expScore(t.match)}, changes ${t.changes.length}, PDF pages ${fit.pageCount}`,
      );
    });
  }

  it("the two job descriptions produce different tailored resumes", () => {
    assert.equal(tailoredSummaries.length, 2);
    assert.notEqual(tailoredSummaries[0], tailoredSummaries[1]);
  });

  it("a repeated request reuses the result without another AI call", async () => {
    const c = CASES[0]!;
    replies = [fakeModel(c), fakeModel(c), fakeModel(c)];
    const first = await post(analyzePost, "/api/resume/analyze", uploadForm(c.jd, "\nrepeat"));
    assert.equal(first.status, 200);
    const calls = aiCalls.length;
    const again = await post(analyzePost, "/api/resume/analyze", uploadForm(c.jd, "\nrepeat"));
    assert.equal(again.status, 200);
    assert.equal(aiCalls.length, calls, "no duplicate AI calls");
    assert.equal(((await again.json()) as TailorBody).tailored?.resume.summary, ((await first.json()) as TailorBody).tailored?.resume.summary);
  });

  it("invalid AI output during generation is reported, never shown as a tailored resume", async () => {
    const c = CASES[1]!;
    replies = [fakeModel(c), "{not json", "{still not json"];
    const res = await post(analyzePost, "/api/resume/analyze", uploadForm(c.jd, "\ninvalid"));
    assert.equal(res.status, 502);
    const body = (await res.json()) as TailorBody;
    assert.match(String(body.error), /unreadable tailoring result/);
    assert.equal(body.tailored, undefined);
  });

  it("repairs malformed generation output once, then validates the recovered candidate", async () => {
    const c = CASES[1]!;
    replies = [fakeModel(c), "{not json", fakeModel(c)];
    const res = await post(analyzePost, "/api/resume/analyze", uploadForm(c.jd, "\nrepaired output"));
    assert.equal(res.status, 200);
    const body = (await res.json()) as TailorBody;
    assert.ok(body.tailored?.resume);
    assert.equal(body.timings?.outputRepair, 1);
    assert.equal(aiCalls.length, 4, "analysis, malformed generation, one output repair, and the existing fact-check follow-up");
  });

  it("a JD too thin to score returns 422 with its analysis and makes no generation call", async () => {
    replies = [{ resume: SOURCE_PARSED, job: { title: "", requirements: [] }, summary: "" }];
    const res = await post(analyzePost, "/api/resume/analyze", uploadForm("Looking for a good candidate.", "\nthin"));
    assert.equal(res.status, 422);
    const body = (await res.json()) as { code?: string; analysis?: { match: { status: string; score: number | null } } };
    assert.equal(body.code, "insufficient_job_description");
    assert.equal(body.analysis?.match.status, "insufficient_job_description");
    assert.equal(body.analysis?.match.score, null);
    assert.equal(aiCalls.length, 1, "only the analysis call");
  });

  it("11. a failed generation returns no tailored resume and the last valid result stays available", async () => {
    const c = CASES[0]!;
    replies = [fakeModel(c), fakeModel(c), fakeModel(c)];
    const good = await post(analyzePost, "/api/resume/analyze", uploadForm(c.jd, "\nlast valid"));
    assert.equal(good.status, 200);
    const valid = ((await good.json()) as TailorBody).tailored!;
    replies = [fakeModel(c), "{not json", "{still not json"];
    const bad = await post(analyzePost, "/api/resume/analyze", uploadForm(c.jd, "\nlast valid, then failed"));
    assert.equal(bad.status, 502);
    assert.equal(((await bad.json()) as TailorBody).tailored, undefined);
    const again = await post(analyzePost, "/api/resume/analyze", uploadForm(c.jd, "\nlast valid"));
    assert.equal(again.status, 200);
    assert.deepEqual(((await again.json()) as TailorBody).tailored!.resume, valid.resume, "the earlier validated result is unchanged");
  });

  it("12. when nothing meaningful changes, the route reports it instead of a tailored resume", async () => {
    const c = CASES[0]!;
    replies = [fakeModel(c), fakeModel(c), fakeModel(c)];
    const first = await post(analyzePost, "/api/resume/analyze", uploadForm(c.jd, "\nalready tailored"));
    assert.equal(first.status, 200);
    const tailoredOnce = ((await first.json()) as TailorBody).tailored!.resume;

    const cosmetic = (prompt: string) => {
      if (prompt.includes("rejected by a fact checker")) return { rewrites: [] };
      if (prompt.includes("Return a rewrite for each item")) {
        return {
          rewrites: [
            { target: "summary", text: `${tailoredOnce.summary}  `, reason: "Improved summary." },
            { target: "internships.0.bullets.0", text: tailoredOnce.internships[0]!.bullets[0]!.toUpperCase(), reason: "Stronger wording." },
          ],
        };
      }
      return { resume: tailoredOnce, job: c.job, summary: "Coaching summary." };
    };
    replies = [cosmetic, cosmetic, cosmetic];
    const res = await post(analyzePost, "/api/resume/analyze", uploadForm(c.jd, "\nalready tailored, again"));
    const body = (await res.json()) as TailorBody & { code?: string; changes?: import("../src/lib/resume/types").TailorChange[] };
    assert.equal(res.status, 422, body.error);
    assert.equal(body.code, "no_meaningful_changes");
    assert.match(String(body.error), /^No meaningful improvements were possible for this job/);
    assert.equal(body.tailored, undefined, "nothing is presented as tailored");
    assert.ok(body.changes?.length && body.changes.every((x) => x.kind !== "rewritten" && x.kind !== "added"));
  });
});

function countShown(r: import("../src/lib/resume/types").MatchReport) {
  const list = r.matches.filter((x) => x.category !== "responsibility");
  return `${list.filter((x) => x.status === "demonstrated").length}/${list.length}`;
}

function expScore(r: import("../src/lib/resume/types").MatchReport) {
  return r.categories.find((x) => x.key === "experience")?.score ?? "n/a";
}
