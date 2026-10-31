import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { docxBlob } from "@cueai/export-service/exportDocument";
import { resumeDocumentXml } from "../src/lib/resume/docx";
import { fitResume } from "../src/lib/resume/fit";
import { coerceResume } from "../src/lib/resume/normalize";
import { buildResumePdf, getMeasurer } from "../src/lib/resume/pdf";

const out = path.resolve(process.argv[2] || "test-results/resume-e2e/fixtures");
const common = {
  contact: {
    phone: "+1 555 010 1234",
    email: "candidate@example.test",
    location: "Austin, TX",
    links: ["github.com/cueai-test-candidate"],
  },
  education: [{ title: "B.S. Computer Science", organization: "State University", dates: "2018 - 2022", details: [] }],
  internships: [],
  certifications: [],
  customSections: [],
};

const fixtures = [
  coerceResume({
    ...common,
    name: "Avery Strong",
    headline: "Backend Software Engineer",
    summary: "Backend engineer with four years of experience building Python services and REST APIs.",
    skills: [
      { label: "Languages", items: ["Python", "SQL", "JavaScript"] },
      { label: "Backend", items: ["Django", "FastAPI", "PostgreSQL", "Redis"] },
      { label: "Cloud and tools", items: ["Docker", "Kubernetes", "AWS", "Git", "pytest"] },
    ],
    experience: [
      {
        title: "Software Engineer",
        organization: "Northwind Logistics",
        location: "Austin, TX",
        dates: "June 2022 - Present",
        bullets: [
          "Built Python and Django REST APIs for shipment tracking",
          "Designed PostgreSQL schemas and optimized SQL queries",
          "Deployed Docker services to Kubernetes on AWS",
          "Added Redis caching and pytest integration tests",
        ],
      },
    ],
    projects: [
      {
        name: "Order Event Service",
        technologies: ["Python", "FastAPI", "PostgreSQL", "Docker"],
        bullets: ["Implemented order APIs with validation, structured error handling, and automated tests"],
      },
    ],
  }),
  coerceResume({
    ...common,
    name: "Morgan Moderate",
    headline: "Software Developer",
    summary: "Software developer with two years of experience maintaining web applications.",
    skills: [
      { label: "Languages", items: ["Python", "JavaScript", "SQL"] },
      { label: "Tools", items: ["Flask", "PostgreSQL", "Git"] },
    ],
    experience: [
      {
        title: "Junior Software Developer",
        organization: "Fabrikam Systems",
        location: "Denver, CO",
        dates: "July 2023 - Present",
        bullets: [
          "Maintained Flask endpoints used by internal operations teams",
          "Wrote SQL reports and fixed production defects",
          "Added unit tests for request validation",
        ],
      },
    ],
    projects: [
      {
        name: "Inventory API",
        technologies: ["Python", "Flask", "SQLite"],
        bullets: ["Built CRUD endpoints for an inventory tracking application"],
      },
    ],
  }),
  coerceResume({
    ...common,
    name: "Riley Career Change",
    headline: "Business Analyst",
    summary: "Business analyst experienced in reporting, process documentation, and stakeholder communication.",
    skills: [
      { label: "Analysis", items: ["Excel", "Power BI", "Requirements gathering"] },
      { label: "General", items: ["Documentation", "Presentation"] },
    ],
    experience: [
      {
        title: "Business Analyst",
        organization: "Adventure Works",
        location: "Chicago, IL",
        dates: "August 2022 - Present",
        bullets: [
          "Prepared monthly Excel reports for operations leadership",
          "Documented business processes and gathered stakeholder requirements",
        ],
      },
    ],
    projects: [
      {
        name: "Sales Dashboard",
        technologies: ["Power BI", "Excel"],
        bullets: ["Created a dashboard showing monthly sales trends"],
      },
    ],
  }),
];

await mkdir(out, { recursive: true });
const measurer = await getMeasurer();
for (const [index, resume] of fixtures.entries()) {
  const label = ["strong", "moderate", "weak"][index]!;
  const pdf = await buildResumePdf(resume, "modern");
  await writeFile(path.join(out, `${label}-match.pdf`), pdf.bytes);
  const fit = fitResume(resume, "modern", measurer);
  const blob = docxBlob(resumeDocumentXml(fit.layout));
  await writeFile(path.join(out, `${label}-match.docx`), new Uint8Array(await blob.arrayBuffer()));
}
console.log(`Generated ${fixtures.length * 2} PDF/DOCX fixtures in ${out}`);
