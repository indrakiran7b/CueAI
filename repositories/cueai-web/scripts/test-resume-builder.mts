import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { extractText, getDocumentProxy } from "unpdf";

const { buildResumePdf, resumeFileName, getMeasurer } = await import("../src/lib/resume/pdf");
const { layoutResume } = await import("../src/lib/resume/layout");
const { resumeDocumentXml } = await import("../src/lib/resume/docx");
const { writeFields } = await import("../src/components/resume/resume-editor");
const { docxBlob } = await import("@cueai/export-service/exportDocument");
const { extractDocumentText } = await import("@cueai/shared-libraries/extract-document");
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const { TEMPLATES, getTemplate } = await import("../src/lib/resume/templates");
const { coerceResume, preserveSourceContent, resumeToText } = await import("../src/lib/resume/normalize");
const { scoreResume, extractJobKeywords } = await import("../src/lib/resume/ats");
const { validateRewrites, applyRewrites, addSkills } = await import("../src/lib/resume/rewrites");

type StructuredResume = import("../src/lib/resume/types").StructuredResume;

const OUT = process.env.RESUME_PDF_OUT || "";

/** Test fixture only — never used by the application. */
function fixture(projects = 3): StructuredResume {
  return coerceResume({
    name: "Asha Verma",
    headline: "Backend Engineer",
    contact: { email: "asha.verma@example.com", phone: "+91 98765 43210", location: "Pune, India", links: ["github.com/ashaverma"] },
    summary:
      "Backend engineer with 4 years of experience building Python and Django services, REST APIs and data pipelines on AWS. Focused on reliability, test automation and clear documentation.",
    skills: [
      { label: "Languages", items: ["Python", "SQL", "JavaScript"] },
      { label: "Frameworks", items: ["Django", "Flask", "React"] },
      { label: "Tools", items: ["Docker", "AWS", "Git", "PostgreSQL", "Redis"] },
    ],
    experience: [
      {
        title: "Software Engineer",
        organization: "Finlytics Pvt Ltd",
        location: "Pune",
        dates: "Jan 2022 – Present",
        bullets: [
          "Built REST APIs in Django serving 40 internal clients and reduced p95 latency from 900 ms to 350 ms by adding Redis caching.",
          "Designed a nightly ETL pipeline in Python that loads 2 million rows into PostgreSQL with automated data-quality checks.",
          "Mentored 3 junior engineers and introduced code review guidelines adopted by the backend team.",
        ],
      },
      {
        title: "Associate Engineer",
        organization: "Codeworks Solutions",
        location: "Bengaluru",
        dates: "Jul 2020 – Dec 2021",
        bullets: [
          "Maintained Flask microservices and wrote pytest suites that raised coverage from 45% to 80%.",
          "Containerised legacy services with Docker and documented the deployment runbook.",
        ],
      },
    ],
    internships: [
      { title: "Backend Intern", organization: "DataNest", dates: "May 2019 – Jul 2019", bullets: ["Wrote SQL reports for the operations team."] },
    ],
    projects: Array.from({ length: projects }, (_, i) => ({
      name: `Inventory Tracker ${i + 1}`,
      tech: "Python, Flask, PostgreSQL, Docker",
      dates: "2021",
      bullets: [
        `Implemented stock alerts and a reporting dashboard for project ${i + 1}; documented every API endpoint with OpenAPI so other teams could integrate without support tickets or meetings.`,
        "Wrote integration tests for the order workflow and set up a GitHub Actions pipeline that runs them on every pull request.",
      ],
    })),
    education: [{ title: "B.E. Computer Engineering", organization: "Savitribai Phule Pune University", dates: "2016 – 2020", bullets: ["CGPA 8.4/10"] }],
    certifications: ["AWS Certified Cloud Practitioner"],
    achievements: ["Winner, internal hackathon 2023 (team of 4)."],
    coursework: ["Data Structures", "Operating Systems", "DBMS"],
  });
}

function numbersOutside(line: string, source: string) {
  const own = new Set(line.match(/\d+/g) ?? []);
  return (source.match(/\d+/g) ?? []).find((n) => !own.has(n) && n.length < 4);
}

function norm(text: string) {
  return text.normalize("NFKC").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();
}

async function pdfText(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  return { totalPages, pages: (text as string[]).map(norm) };
}

describe("resume templates and PDF export", () => {
  for (const t of TEMPLATES) {
    it(`${t.id}: every fact from the resume is in the PDF as real text`, async () => {
      const resume = fixture(3);
      const built = await buildResumePdf(resume, t.id);
      if (OUT) {
        await mkdir(OUT, { recursive: true });
        await writeFile(path.join(OUT, `${t.id}-${resumeFileName(resume.name)}`), built.bytes);
      }
      const { totalPages, pages } = await pdfText(built.bytes);
      assert.equal(totalPages, built.layout.pages.length);
      const all = pages.join(" ");
      const facts = [
        resume.name,
        resume.contact.email,
        resume.contact.phone,
        resume.summary,
        ...resume.skills.flatMap((g) => g.items),
        ...resume.experience.flatMap((e) => [e.title, e.organization, e.dates, ...e.bullets]),
        ...resume.internships.flatMap((e) => [e.title, ...e.bullets]),
        ...resume.projects.flatMap((p) => [p.name, p.tech, ...p.bullets]),
        ...resume.education.flatMap((e) => [e.title, e.organization, ...e.bullets]),
        ...resume.certifications,
        ...resume.achievements,
        ...resume.coursework,
      ];
      // Facts may wrap across lines and pages, so compare on words in order.
      const flat = all.replace(/[^a-z0-9%.+@/]+/g, " ");
      for (const f of facts) {
        const want = norm(f).toLowerCase().replace(/[^a-z0-9%.+@/]+/g, " ").trim();
        assert.ok(flat.includes(want), `${t.id}: missing "${f}"`);
      }
      assert.ok(!/sample|lorem|john doe|placeholder/i.test(all), "no placeholder content");
      assert.deepEqual(built.unsupported, []);
    });
  }

  it("the DOCX uses the selected template and keeps every fact, in order, as editable paragraphs", async () => {
    const m = await getMeasurer();
    const resume = fixture(3);
    for (const t of TEMPLATES) {
      const layout = layoutResume(resume, t.id, m);
      const xml = resumeDocumentXml(layout);
      const bytes = Buffer.from(await docxBlob(xml).arrayBuffer());
      if (OUT) {
        await mkdir(OUT, { recursive: true });
        await writeFile(path.join(OUT, `${t.id}-${resumeFileName(resume.name, "docx")}`), bytes);
      }
      const text = norm(await extractDocumentText(bytes, "resume.docx", DOCX_MIME)).replace(/[^a-z0-9%.+@/]+/g, " ");
      const facts = [
        resume.name,
        resume.contact.email,
        resume.summary,
        ...resume.skills.flatMap((g) => g.items),
        ...resume.experience.flatMap((e) => [e.title, e.organization, e.dates, ...e.bullets]),
        ...resume.projects.flatMap((p) => [p.name, ...p.bullets]),
        ...resume.education.flatMap((e) => [e.title, e.organization]),
        ...resume.certifications,
      ];
      for (const f of facts) {
        const want = norm(f).replace(/[^a-z0-9%.+@/]+/g, " ").trim();
        assert.ok(text.includes(want), `${t.id}: DOCX missing "${f}"`);
      }
      // A wrapped bullet is one Word paragraph, not one paragraph per visual line.
      const longBullet = resume.experience[0]!.bullets.find((b) => b.length > 90)!;
      assert.ok(xml.includes(longBullet.replace(/&/g, "&amp;")), `${t.id}: bullet kept as one paragraph`);
      const font = getTemplate(t.id).style.family === "times" ? "Times New Roman" : "Arial";
      assert.ok(xml.includes(`w:ascii="${font}"`), `${t.id}: template font`);
      assert.ok(text.indexOf(norm(resume.name)) < text.indexOf(norm(resume.experience[0]!.organization)), "header first");
    }
  });

  it("DOCX page breaks follow the PDF pagination", async () => {
    const m = await getMeasurer();
    const layout = layoutResume(fixture(14), "software", m);
    assert.ok(layout.pages.length > 1);
    const breaks = resumeDocumentXml(layout).match(/<w:pageBreakBefore\/>/g)?.length ?? 0;
    assert.equal(breaks, layout.pages.length - 1);
  });

  it("edits change the shared resume data without touching employers or dates", () => {
    const original = fixture(2);
    const edited = writeFields(original, {
      summary: "Edited summary text.",
      "experience.0": "First edited bullet\n- Second edited bullet\n\n",
      skills: "Languages: Python, SQL\nCloud: AWS",
    });
    assert.equal(edited.summary, "Edited summary text.");
    assert.deepEqual(edited.experience[0]!.bullets, ["First edited bullet", "Second edited bullet"]);
    assert.equal(edited.experience[0]!.organization, original.experience[0]!.organization);
    assert.equal(edited.experience[0]!.dates, original.experience[0]!.dates);
    assert.deepEqual(edited.skills, [
      { label: "Languages", items: ["Python", "SQL"] },
      { label: "Cloud", items: ["AWS"] },
    ]);
    assert.equal(original.summary, fixture(2).summary, "original untouched");
  });

  it("templates differ in layout but never in content", async () => {
    const m = await getMeasurer();
    const resume = fixture(2);
    const signatures = new Set<string>();
    const contents = new Set<string>();
    for (const t of TEMPLATES) {
      const layout = layoutResume(resume, t.id, m);
      const ops = layout.pages.flatMap((p) => p.ops);
      signatures.add(ops.filter((o) => o.kind === "text").slice(0, 12).map((o) => `${o.kind === "text" ? `${o.family}${o.font}${o.size}${Math.round(o.x)}` : ""}`).join("|"));
      const words = ops.flatMap((o) => (o.kind === "text" ? norm(o.text).split(" ") : [])).filter((w) => /[a-z0-9]/.test(w));
      contents.add(words.map((w) => w.replace(/[^a-z0-9]/g, "")).filter(Boolean).sort().join(" ").replace(/\b(professional|summary|profile|objective|executive|skills|technical|core|competencies|experience|internships|projects|academic|personal|education|certifications|achievements|key|relevant|coursework|tech)\b ?/g, ""));
    }
    assert.equal(signatures.size, TEMPLATES.length, "each template has a distinct layout");
    assert.ok(contents.size <= 2, "same words in every template (apart from heading names)");
  });

  it("long resumes flow onto more pages without clipping, overlap or blank pages", async () => {
    const m = await getMeasurer();
    const resume = fixture(14);
    resume.experience[0]!.bullets.push(`Very long identifier ${"x".repeat(220)} handled without overflow.`);
    for (const t of TEMPLATES) {
      const s = getTemplate(t.id).style;
      const layout = layoutResume(resume, t.id, m);
      assert.ok(layout.pages.length >= 2, `${t.id} should need several pages`);
      for (const [i, page] of layout.pages.entries()) {
        const texts = page.ops.filter((o) => o.kind === "text");
        assert.ok(texts.length > 0, `${t.id} page ${i + 1} is blank`);
        for (const op of texts) {
          assert.ok(op.x >= s.margin.left - 0.5, `${t.id}: text left of margin`);
          assert.ok(op.x + op.width <= layout.width - s.margin.right + 0.5, `${t.id}: "${op.text.slice(0, 30)}" overflows the right margin`);
          assert.ok(op.y <= layout.height - s.margin.bottom + 1, `${t.id}: text below bottom margin`);
          assert.ok(op.y - op.size * 0.8 >= s.margin.top - 0.5, `${t.id}: text above top margin`);
        }
        const baselines = [...new Set(texts.map((o) => Math.round(o.y * 10) / 10))].sort((a, b) => a - b);
        for (let k = 1; k < baselines.length; k++) {
          assert.ok(baselines[k]! - baselines[k - 1]! >= 8, `${t.id}: lines overlap on page ${i + 1}`);
        }
      }
    }
    const built = await buildResumePdf(resume, "software");
    const { totalPages, pages } = await pdfText(built.bytes);
    assert.equal(totalPages, built.layout.pages.length);
    assert.ok(pages.join(" ").includes("inventory tracker 14"), "last project survives pagination");
  });

  it("omits empty sections instead of printing empty headings", async () => {
    const m = await getMeasurer();
    const r = coerceResume({ name: "Ravi K", summary: "Data analyst focused on dashboards and SQL reporting for retail teams.", skills: ["SQL", "Excel"] });
    const layout = layoutResume(r, "classic", m);
    const text = layout.pages.flatMap((p) => p.ops).map((o) => (o.kind === "text" ? o.text : "")).join(" ");
    for (const heading of ["EXPERIENCE", "PROJECTS", "EDUCATION", "CERTIFICATIONS", "ACHIEVEMENTS"]) {
      assert.ok(!text.includes(heading), `empty ${heading} heading printed`);
    }
    assert.equal(layout.pages.length, 1);
  });

  it("names the download after the candidate", () => {
    assert.equal(resumeFileName("Asha Verma"), "Asha_Verma_ATS_Resume.pdf");
    assert.equal(resumeFileName("José O'Neil"), "Jose_O_Neil_ATS_Resume.pdf");
    assert.equal(resumeFileName(""), "ATS_Resume.pdf");
  });

  it("maps characters the PDF fonts cannot encode", async () => {
    const r = fixture(1);
    r.summary = "Built CI/CD → reduced deploys from 3 h to 20 min; non‑breaking hyphen.";
    const built = await buildResumePdf(r, "modern");
    assert.deepEqual(built.unsupported, []);
    const { pages } = await pdfText(built.bytes);
    assert.ok(pages.join(" ").includes("ci/cd -> reduced deploys"));
  });
});

describe("ATS scoring", () => {
  const jd =
    "We are hiring a Backend Engineer with strong Python, Django and PostgreSQL skills. Experience with AWS, Docker and Kubernetes is required. Familiarity with Kafka and CI/CD pipelines is a plus.";

  it("extracts only keywords that the job description contains", () => {
    const k = extractJobKeywords(jd, ["Kubernetes", "Blockchain", "event streaming"]);
    assert.ok(k.includes("Python") && k.includes("Kubernetes") && k.includes("CI/CD"));
    assert.ok(!k.includes("Blockchain"), "model terms not in the JD are ignored");
    assert.ok(!k.includes("event streaming"));
  });

  it("ignores sentence fragments and phrases that repeat a found skill", () => {
    const text = `${jd} You will build REST APIs, own PostgreSQL data models, improve observability and work with message queues. 3+ years required.`;
    const k = extractJobKeywords(text, ["build REST APIs", "own PostgreSQL data models", "strong Python", "3+ years", "design", "message queues", "observability"]);
    for (const bad of ["build REST APIs", "own PostgreSQL data models", "strong Python", "3+ years", "design"]) {
      assert.ok(!k.includes(bad), `"${bad}" is not a keyword`);
    }
    assert.ok(k.includes("message queues") && k.includes("observability"));
    assert.ok(k.includes("REST API"), "the skill itself is still found");
  });

  it("scores from content and is unaffected by the template", () => {
    const keywords = extractJobKeywords(jd);
    const report = scoreResume(fixture(), keywords, true);
    assert.ok(report.missingKeywords.includes("Kubernetes"));
    assert.ok(report.missingKeywords.includes("Kafka"));
    assert.ok(report.matchedKeywords.includes("Django"));
    assert.ok(report.overall > 0 && report.overall < 100);
    assert.deepEqual(scoreResume(fixture(), keywords, true), report, "deterministic");
  });

  it("goes up when real keywords are added and down when content is missing", () => {
    const keywords = extractJobKeywords(jd);
    const base = scoreResume(fixture(), keywords, true);
    const withSkill = scoreResume(addSkills(fixture(), [{ skill: "Kubernetes", group: "Tools" }]), keywords, true);
    assert.ok(withSkill.keywordCoverage > base.keywordCoverage);
    const bare = scoreResume(coerceResume({ name: "X" }), keywords, true);
    assert.ok(bare.overall < base.overall);
  });

  it("without a job description reports formatting only", () => {
    const r = scoreResume(fixture(), [], false);
    assert.equal(r.keywordCoverage, 0);
    assert.equal(r.overall, r.formatting);
    assert.match(r.suggestions[0]!, /job description/);
  });
});

describe("rewrites never add facts", () => {
  const source = resumeToText(fixture());

  it("applies valid rewrites and leaves the original untouched", () => {
    const original = fixture();
    const rewrites = validateRewrites(original, source, [
      { target: "summary", text: "Backend engineer with 4 years of experience designing Python and Django REST APIs and AWS data pipelines.", reason: "Leads with role keywords." },
      { target: "experience.0.bullets.2", text: "Mentored 3 junior engineers and established code review guidelines adopted across the backend team.", reason: "Stronger verb." },
    ]);
    assert.equal(rewrites.length, 2);
    assert.ok(rewrites.every((r) => r.valid));
    const accepted = applyRewrites(original, rewrites);
    assert.match(accepted.summary, /^Backend engineer with 4 years of experience designing/);
    assert.match(accepted.experience[0]!.bullets[2]!, /established code review/);
    assert.equal(original.summary, fixture().summary, "original preserved");
  });

  it("rejects invented numbers and unsupported skills", () => {
    const r = validateRewrites(fixture(), source, [
      { target: "experience.0.bullets.0", text: "Built REST APIs in Django serving 40 internal clients, cutting latency by 75%.", reason: "" },
      { target: "experience.1.bullets.1", text: "Containerised legacy services with Docker and Kubernetes.", reason: "" },
      { target: "experience.0.bullets.1", text: "Built a nightly Python ETL pipeline that loads 2 million rows into PostgreSQL and validates each load with automated data-quality checks.", reason: "" },
    ], ["Kubernetes"]);
    assert.equal(r[0]!.valid, false);
    assert.match(r[0]!.rejectReason!, /75/);
    assert.equal(r[1]!.valid, false);
    assert.match(r[1]!.rejectReason!, /Kubernetes/);
    assert.equal(r[2]!.valid, true);
    const applied = applyRewrites(fixture(), r);
    assert.equal(applied.experience[0]!.bullets[0], fixture().experience[0]!.bullets[0], "invalid rewrite not applied");
  });

  it("applies every validated rewrite automatically and keeps the original line for rejected ones", () => {
    const original = fixture();
    const set = validateRewrites(original, source, [
      { target: "experience.0.bullets.1", text: "Built a nightly Python ETL pipeline that loads 2 million rows into PostgreSQL and validates each load with automated data-quality checks.", reason: "" },
      { target: "experience.0.bullets.0", text: "Built REST APIs serving 999 clients.", reason: "" },
      { target: "experience.9.bullets.0", text: "Nonexistent target.", reason: "" },
    ]);
    const tailored = applyRewrites(original, set);
    const valid = set.filter((r) => r.valid);
    assert.equal(valid.length, 1);
    assert.equal(tailored.experience[0]!.bullets[1], valid[0]!.after);
    assert.equal(tailored.experience[0]!.bullets[0], original.experience[0]!.bullets[0]);
    assert.equal(resumeToText(tailored).length > 0, true);
    for (const e of tailored.experience) assert.ok(e.bullets.every((b) => b.trim()), "no empty lines");
    assert.deepEqual(applyRewrites(original, []), original, "no rewrites leaves the resume intact");
  });

  it("a bullet cannot borrow figures from another part of the resume", () => {
    const original = fixture();
    const otherNumber = numbersOutside(original.experience[0]!.bullets[0]!, source);
    assert.ok(otherNumber, "fixture has a figure outside the first bullet");
    const [rw] = validateRewrites(original, source, [
      { target: "experience.0.bullets.0", text: `${original.experience[0]!.bullets[0]} for ${otherNumber} teams`, reason: "" },
    ]);
    assert.equal(rw!.valid, false);
    assert.match(rw!.rejectReason!, /original line/);
  });

  it("a skills rewrite can regroup but cannot add or drop skills", () => {
    const [rw] = validateRewrites(fixture(), source, [
      { target: "skills", skills: [{ label: "Backend", items: ["Python", "Django", "Flask", "PostgreSQL", "Kubernetes"] }], reason: "Group by role." },
    ]);
    const items = rw!.skills!.flatMap((g) => g.items);
    assert.ok(!items.includes("Kubernetes"));
    for (const s of fixture().skills.flatMap((g) => g.items)) assert.ok(items.includes(s), `lost ${s}`);
  });

  it("ignores targets that do not exist", () => {
    assert.deepEqual(validateRewrites(fixture(), source, [{ target: "experience.9.bullets.0", text: "x y z" }]), []);
  });
});

describe("parsing safety net", () => {
  it("keeps source lines the parser missed", () => {
    const source = "Asha Verma\nVolunteer: taught Python basics to 30 students at a community library\nSkills\nPython, SQL";
    const parsed = coerceResume({ name: "Asha Verma", skills: ["Python", "SQL"] });
    const kept = preserveSourceContent(parsed, source);
    assert.equal(kept.extra.at(-1)?.heading, "Additional Information");
    assert.match(kept.extra.at(-1)!.items[0]!, /taught Python basics to 30 students/);
  });

  it("bounds and sanitizes untrusted input", () => {
    const r = coerceResume({ name: "A\u0000B".padEnd(500, "x"), experience: Array.from({ length: 100 }, () => ({ title: "t", bullets: ["b"] })) });
    assert.ok(r.name.length <= 160 && !r.name.includes("\u0000"));
    assert.ok(r.experience.length <= 30);
  });
});
