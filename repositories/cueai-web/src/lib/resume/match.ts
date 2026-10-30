/**
 * CueAI ATS Match Estimate.
 *
 * Deterministic: the same resume content and job profile always produce the same score.
 * The model may propose job keywords and point at resume lines, but every keyword must
 * appear in the job description and every piece of evidence must appear in the resume.
 *
 * Score (0–100) = weighted mean of the categories that apply to the job description:
 *   Required skills & qualifications   35%  required technical/domain skills, degrees, certifications
 *   Relevant experience                25%  years vs. the stated minimum (60%) and share of roles/projects
 *                                           that show at least one requirement (40%); relevance only
 *                                           when the JD states no minimum
 *   Job-specific responsibilities      15%  JD responsibility lines matched against resume bullets
 *   Tools & technologies               15%  every tool/platform the JD names
 *   Supporting keywords & education    10%  preferred / nice-to-have skills and qualifications
 * Inside a category each requirement earns 1 (demonstrated), 0.5 (partially demonstrated) or 0
 * (not found), weighted by priority (high 1, medium 0.75, low 0.5). Categories with no requirements
 * are dropped and the remaining weights are renormalized. Formatting is reported separately and
 * never feeds this score.
 *
 * Requirements come from known skills found in the JD, degree/certification lines, responsibility
 * lines (headed sections, "Responsibilities: …" lines, or duty sentences in prose), and model-proposed
 * requirements whose every content word appears in the JD. With fewer than MIN_REQUIREMENTS the
 * report has status "insufficient_job_description" and no score (null), never 0.
 */
import { IMPLIED_BY, SKILLS, canonicalSkill, display, extractJobKeywords, isKnownSkill, mentions } from "./ats";
import { cleanText, dedupe } from "./normalize";
import type {
  JobProfile,
  JobRequirement,
  MatchCategoryKey,
  MatchCategoryScore,
  MatchReport,
  RequirementCategory,
  RequirementMatch,
  RequirementPriority,
  RequirementStatus,
  StructuredResume,
} from "./types";

export const SCORING_VERSION = "cueai-match-2";

/** Below this many requirements the JD is reported as not scorable instead of scoring 0. */
export const MIN_REQUIREMENTS = 3;

export const MATCH_WEIGHTS: Record<MatchCategoryKey, number> = {
  required: 35,
  experience: 25,
  responsibilities: 15,
  tools: 15,
  supporting: 10,
};

const CATEGORY_LABELS: Record<MatchCategoryKey, string> = {
  required: "Required skills & qualifications",
  experience: "Relevant experience",
  responsibilities: "Job-specific responsibilities",
  tools: "Tools & technologies",
  supporting: "Supporting keywords & education",
};

const PRIORITY_WEIGHT: Record<RequirementPriority, number> = { high: 1, medium: 0.75, low: 0.5 };
const STATUS_CREDIT: Record<RequirementStatus, number> = { demonstrated: 1, partial: 0.5, missing: 0, unclear: 0 };

const TOOLS = new Set([
  "docker", "kubernetes", "terraform", "ansible", "jenkins", "github actions", "gitlab ci", "git", "jira", "aws", "azure", "gcp",
  "postgresql", "mysql", "mongodb", "redis", "elasticsearch", "cassandra", "dynamodb", "oracle", "sqlite", "kafka", "rabbitmq",
  "spark", "hadoop", "airflow", "snowflake", "databricks", "nginx", "lambda", "cloudformation", "selenium", "cypress", "playwright",
  "pytest", "junit", "jest", "postman", "power bi", "tableau", "excel", "figma", "salesforce", "sap", "linux", "pandas", "numpy",
  "pytorch", "tensorflow", "keras", "scikit-learn", "langchain", "serverless", "sqlalchemy", "celery", "bigquery", "redshift", "dbt",
  "looker", "google sheets", "matplotlib", "seaborn", "plotly", "jupyter",
]);
const PROFESSIONAL = new Set([
  "project management", "stakeholder management", "communication", "leadership", "mentoring", "product management", "agile", "scrum",
]);

/** Closely related terms: evidence of one is partial evidence of the other. */
const RELATED: Record<string, string[]> = {
  postgresql: ["sql", "mysql", "sqlite", "oracle"],
  mysql: ["sql", "postgresql", "sqlite"],
  sql: ["postgresql", "mysql", "sqlite", "oracle"],
  nosql: ["mongodb", "dynamodb", "cassandra", "redis"],
  mongodb: ["nosql", "dynamodb"],
  aws: ["azure", "gcp", "lambda"],
  azure: ["aws", "gcp"],
  gcp: ["aws", "azure"],
  kubernetes: ["docker"],
  docker: ["kubernetes"],
  "ci/cd": ["github actions", "gitlab ci", "jenkins"],
  "github actions": ["ci/cd", "gitlab ci", "jenkins"],
  "gitlab ci": ["ci/cd", "github actions", "jenkins"],
  jenkins: ["ci/cd", "github actions", "gitlab ci"],
  react: ["next.js", "react native", "vue", "angular"],
  "next.js": ["react"],
  vue: ["react", "angular"],
  angular: ["react", "vue"],
  "machine learning": ["deep learning", "scikit-learn", "tensorflow", "pytorch", "keras"],
  "deep learning": ["pytorch", "tensorflow", "keras"],
  pytorch: ["tensorflow", "keras"],
  tensorflow: ["pytorch", "keras"],
  "rest api": ["fastapi", "django", "flask", "express", "spring boot", "graphql"],
  microservices: ["docker", "kubernetes"],
  "unit testing": ["pytest", "jest", "junit", "tdd"],
  "test automation": ["selenium", "cypress", "playwright", "pytest"],
  typescript: ["javascript"],
  javascript: ["typescript"],
  "node.js": ["express"],
  express: ["node.js"],
  django: ["flask", "fastapi"],
  flask: ["django", "fastapi"],
  fastapi: ["django", "flask"],
  kafka: ["rabbitmq"],
  rabbitmq: ["kafka"],
  llm: ["generative ai", "langchain", "rag"],
  "generative ai": ["llm", "langchain", "rag"],
  "data analysis": ["pandas", "excel", "sql"],
  "data visualization": ["tableau", "power bi", "looker", "matplotlib", "seaborn", "plotly", "dashboards"],
  dashboards: ["tableau", "power bi", "looker", "data visualization"],
  reporting: ["dashboards", "power bi", "tableau", "excel"],
  "data cleaning": ["pandas"],
  "database design": ["postgresql", "mysql", "sql", "data modeling"],
  "data modeling": ["database design", "postgresql", "mysql"],
  "backend development": ["django", "flask", "fastapi", "node.js", "rest api", "spring boot"],
  "api development": ["rest api", "fastapi", "django", "flask", "express", "graphql"],
  "data pipelines": ["etl", "airflow", "spark"],
  etl: ["data pipelines", "airflow"],
  orm: ["sqlalchemy", "django", "hibernate"],
  sqlalchemy: ["orm"],
  tableau: ["power bi", "looker"],
  "power bi": ["tableau", "looker"],
  looker: ["tableau", "power bi"],
  matplotlib: ["seaborn", "plotly"],
  seaborn: ["matplotlib", "plotly"],
  plotly: ["matplotlib", "seaborn"],
  terraform: ["cloudformation", "ansible"],
  agile: ["scrum"],
  scrum: ["agile"],
};

const HEAD_REQUIRED =
  /^(requirements?|required( skills| qualifications)?|qualifications?|minimum qualifications|basic qualifications|must[- ]haves?|what (you|we)('|’)?(ll| will)? need|what we('|’)?re looking for|who you are|you have|you bring|skills( required)?|key skills|technical skills|essential( skills)?)\b/i;
const HEAD_PREFERRED =
  /^(preferred( qualifications| skills)?|nice[- ]to[- ]haves?|bonus( points)?|good[- ]to[- ]have|desired( skills)?|desirable|pluses|additional( skills)?)\b/i;
const HEAD_RESP =
  /^(responsibilities|key responsibilities|job responsibilities|roles? (and|&) responsibilities|what you('|’)?ll do|what you will do|your role|the role|duties|day[- ]to[- ]day|in this role)\b/i;
const HEAD_OTHER =
  /^(about (us|the company|the team|the role)|benefits|perks|why join|compensation|salary|location|how to apply|equal opportunity|our culture|who we are)\b/i;

const PREFERRED_MARK = /\b(nice to have|preferred|a plus|is a plus|bonus|good to have|familiarity with|exposure to|desirable)\b/i;
const REQUIRED_MARK = /\b(must|required|requires|strong|proficien\w*|expert\w*|solid|hands-on|deep|\d+\+?\s*years?)\b/i;

type Section = "required" | "preferred" | "responsibilities" | "other" | "none";

function stripBullet(line: string) {
  return line.replace(/^[\s•●▪◦\-*–—>·]+/, "").replace(/^\d+[.)]\s+/, "").trim();
}

function headingSection(line: string): Section | null {
  const text = line.replace(/[:\-–—]+$/, "").trim();
  if (!text || text.length > 60 || /[.!?]$/.test(text)) return null;
  if (HEAD_PREFERRED.test(text)) return "preferred";
  if (HEAD_RESP.test(text)) return "responsibilities";
  if (HEAD_REQUIRED.test(text)) return "required";
  if (HEAD_OTHER.test(text)) return "other";
  return null;
}

type JdLine = { text: string; section: Section; bulleted: boolean };

function jdLines(jd: string): JdLine[] {
  const out: JdLine[] = [];
  let section: Section = "none";
  for (const raw of jd.split(/\r?\n/)) {
    const bulleted = /^[\s]*([•●▪◦\-*–—>·]|\d+[.)])\s*/.test(raw);
    const text = cleanText(stripBullet(raw), 1200);
    if (!text) continue;
    // "Responsibilities: design and build REST APIs, own data models, …" on one line.
    const inline = /^([^:]{3,45}):\s*(.{3,})$/.exec(text);
    const inlineHead = inline ? headingSection(inline[1]!) : null;
    if (inline && inlineHead) {
      section = inlineHead;
      out.push({ text: inline[2]!.trim(), section, bulleted });
      continue;
    }
    const head = headingSection(text);
    if (head) {
      section = head;
      // "Requirements: Python, SQL" keeps the content after the colon.
      const rest = text.includes(":") ? text.slice(text.indexOf(":") + 1).trim() : "";
      if (rest) out.push({ text: rest, section, bulleted });
      continue;
    }
    out.push({ text, section, bulleted });
  }
  return out;
}

function jobTitle(jd: string, lines: JdLine[]): string {
  const labelled = /(?:job title|position|role|designation)\s*[:\-–]\s*([^\n]{3,80})/i.exec(jd);
  if (labelled) return cleanText(labelled[1], 80).replace(/[.,;]+$/, "");
  const ROLE =
    /\b((?:senior|sr\.?|junior|jr\.?|lead|principal|staff|associate|entry[- ]level|graduate|trainee)?\s*(?:[A-Z][\w.+#/-]*\s+){0,4}(?:engineer|developer|analyst|scientist|architect|designer|manager|consultant|administrator|specialist|intern|tester|programmer|lead))\b/i;
  for (const l of lines.slice(0, 4)) {
    if (l.text.length <= 80 && !/[.!?]$/.test(l.text) && ROLE.test(l.text)) return cleanText(l.text, 80).replace(/^(job title|role)\s*:\s*/i, "");
  }
  const found = ROLE.exec(lines.slice(0, 8).map((l) => l.text).join(" "));
  return found ? cleanText(found[1], 80) : "";
}

function minYears(lines: JdLine[]): number | null {
  for (const l of lines) {
    const m = /(\d{1,2})\s*\+?\s*(?:(?:-|–|to)\s*\d{1,2}\s*)?\+?\s*(?:years?|yrs?)\b/i.exec(l.text);
    if (m && /experience|exp\b|working|industry|professional|(years?|yrs?)\s+(with|of|in)\b/i.test(l.text)) {
      const n = Number(m[1]);
      if (n > 0 && n <= 30) return n;
    }
  }
  return null;
}

function priorityOf(line: JdLine, mentionCount: number): { priority: RequirementPriority; required: boolean } {
  if (line.section === "preferred" || PREFERRED_MARK.test(line.text)) return { priority: "low", required: false };
  if (line.section === "required" || REQUIRED_MARK.test(line.text) || mentionCount >= 2) return { priority: "high", required: true };
  return { priority: "medium", required: true };
}

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9+#.]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "req";
}

const DEGREE = /\b(bachelor'?s?|master'?s?|b\.?\s?tech|m\.?\s?tech|b\.?\s?e\.?|m\.?\s?e\.?|b\.?\s?sc|m\.?\s?sc|bca|mca|mba|ph\.?\s?d|doctorate|degree|graduate in|diploma)\b/i;
const CERT = /\b(certified|certification|certificate)\b/i;

function degreeLevel(text: string): number {
  const t = text.toLowerCase();
  if (/ph\.?\s?d|doctorate/.test(t)) return 3;
  if (/master|m\.?\s?tech|m\.?\s?e\b|m\.?\s?sc|mca|mba|\bms\b|\bm\.s\./.test(t)) return 2;
  if (/bachelor|b\.?\s?tech|b\.?\s?e\b|b\.?\s?sc|bca|\bbs\b|\bb\.s\.|degree|graduate/.test(t)) return 1;
  if (/diploma/.test(t)) return 0.5;
  return 0;
}

type ModelRequirement = { name?: unknown; category?: unknown; importance?: unknown; why?: unknown; evidence?: unknown };

function modelRows(value: unknown): ModelRequirement[] {
  return Array.isArray(value) ? value.filter((v) => v && typeof v === "object").map((v) => v as ModelRequirement) : [];
}

function modelCategory(value: unknown): RequirementCategory | null {
  const v = cleanText(value, 40).toLowerCase();
  if (/tool|technolog|platform/.test(v)) return "tools";
  if (/domain|industry|business|soft|professional/.test(v)) return "domain";
  if (/qualif|cert|degree|education/.test(v)) return "qualification";
  if (/respons|duty/.test(v)) return "responsibility";
  if (/tech|skill|language|framework/.test(v)) return "technical";
  return null;
}

function skillCategory(key: string): RequirementCategory {
  if (TOOLS.has(key)) return "tools";
  if (PROFESSIONAL.has(key)) return "domain";
  return "technical";
}

function normalizeForSearch(text: string) {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Turn the job description into requirements. Known skills are found deterministically;
 * model-proposed requirements are kept only when their name appears in the JD.
 */
export function analyzeJobDescription(
  jobDescription: string,
  model: { title?: unknown; requirements?: unknown; minYears?: unknown; responsibilities?: unknown } = {},
  resumeText = "",
): JobProfile {
  const lines = jdLines(jobDescription);
  const reqs = new Map<string, JobRequirement>();
  const semanticEvidence: Record<string, string> = {};
  const modelReqs = modelRows(model.requirements);
  const haystack = normalizeForSearch(resumeText);

  const add = (req: JobRequirement) => {
    const existing = reqs.get(req.id);
    if (!existing) {
      reqs.set(req.id, req);
      return;
    }
    const rank = { high: 3, medium: 2, low: 1 };
    if (rank[req.priority] > rank[existing.priority]) {
      existing.priority = req.priority;
      existing.required = req.required;
    }
  };

  const linesMentioning = (term: string) => lines.filter((l) => mentions(l.text, term));

  // Skills and tools.
  const proposed = modelReqs.map((r) => cleanText(r.name, 60)).filter(Boolean);
  for (const term of extractJobKeywords(jobDescription, proposed)) {
    const key = term.toLowerCase();
    const hits = linesMentioning(key);
    const best = hits
      .map((l) => priorityOf(l, hits.length))
      .sort((a, b) => ({ high: 3, medium: 2, low: 1 })[b.priority] - ({ high: 3, medium: 2, low: 1 })[a.priority])[0] ?? {
      priority: "medium" as const,
      required: true,
    };
    const fromModel = modelReqs.find((r) => cleanText(r.name, 60).toLowerCase() === key);
    const known = isKnownSkill(key);
    const category = known ? skillCategory(key) : modelCategory(fromModel?.category) ?? "domain";
    if (category === "responsibility") continue;
    const id = `skill:${slug(key)}`;
    const why = cleanText(fromModel?.why, 240) || (hits[0] ? `Job description: “${cleanText(hits[0].text, 160)}”` : "Named in the job description.");
    add({ id, name: term, category, priority: best.priority, required: best.required, why });
    const evidence = cleanText(fromModel?.evidence, 300);
    if (evidence.length >= 8 && haystack.includes(normalizeForSearch(evidence))) semanticEvidence[id] = evidence;
  }

  // Degrees and certifications.
  for (const l of lines) {
    if (l.section === "other" || l.section === "responsibilities") continue;
    if (DEGREE.test(l.text) && !reqs.has("qual:degree")) {
      const p = priorityOf(l, 1);
      const clause = l.text.split(/[.;]\s+|,\s+(?=[A-Z])/).find((c) => DEGREE.test(c)) ?? l.text;
      add({
        id: "qual:degree",
        name: cleanText(clause, 90).replace(/[.;,]+$/, ""),
        category: "qualification",
        priority: p.priority === "low" ? "low" : "high",
        required: p.required,
        why: "Education requirement stated in the job description.",
      });
    }
    if (CERT.test(l.text)) {
      const m = /((?:[A-Z][\w+#.-]*\s+){0,5}(?:certified|certification|certificate)(?:\s+[A-Z][\w+#.-]*){0,4})/i.exec(l.text);
      const name = cleanText(m?.[1] || l.text, 80);
      const id = `qual:${slug(name)}`;
      const p = priorityOf(l, 1);
      add({ id, name, category: "qualification", priority: p.priority, required: p.required, why: "Certification mentioned in the job description." });
    }
  }

  // Model-proposed requirements outside the known vocabulary, kept only when every content word is in the JD.
  const jdStems = stems(jobDescription);
  const taken = () => [...reqs.values()].filter((q) => q.category !== "responsibility");
  for (const r of modelReqs) {
    const name = cleanText(r.name, 60).replace(/[.,;:]+$/, "");
    const key = name.toLowerCase();
    let category = modelCategory(r.category);
    if (!name || name.split(/\s+/).length > 6 || category === "responsibility" || /\d+\+?\s*(years?|yrs?)/i.test(name)) continue;
    if (coverage(name, jdStems) < 1) continue;
    if (taken().some((q) => q.name.toLowerCase() === key || mentions(key, q.name) || mentions(q.name, key))) continue;
    const degree = DEGREE.test(name);
    if (category === "qualification" && degree && reqs.has("qual:degree")) continue;
    if (category === "qualification" && !degree && !CERT.test(name)) category = "domain";
    const preferred = /prefer|nice|bonus|optional|plus/i.test(cleanText(r.importance, 30));
    const hits = lines.filter((l) => coverage(name, stems(l.text)) === 1);
    const p = preferred ? { priority: "low" as const, required: false } : hits.length ? priorityOf(hits[0]!, hits.length) : { priority: "medium" as const, required: true };
    const id = category === "qualification" && degree ? "qual:degree" : `${category === "qualification" ? "qual" : "skill"}:${slug(key)}`;
    add({ id, name, category: category ?? "domain", priority: p.priority, required: p.required, why: cleanText(r.why, 240) || "Named in the job description." });
    const evidence = cleanText(r.evidence, 300);
    if (evidence.length >= 8 && haystack.includes(normalizeForSearch(evidence))) semanticEvidence[id] = evidence;
  }

  // Responsibilities: lines under a responsibilities heading (bulleted or "Responsibilities: a, b, c"),
  // then duty statements in prose JDs, then the model's list when grounded in the JD.
  const responsibilities: string[] = [];
  const addResp = (text: string) => {
    const name = cleanText(text, 140)
      .replace(/^(and|or)\s+/i, "")
      .replace(/^(you will|you'll|will|to)\s+/i, "")
      .replace(/[.;:]+$/, "");
    if (name.length < 12 || stems(name).size < 2) return;
    if (responsibilities.some((r) => overlap(r, name) >= 0.6 && overlap(name, r) >= 0.6)) return;
    responsibilities.push(name.charAt(0).toUpperCase() + name.slice(1));
  };
  for (const l of lines.filter((x) => x.section === "responsibilities")) clauses(l.text).forEach(addResp);
  if (responsibilities.length < 2) {
    for (const l of lines.filter((x) => x.section === "none" || x.section === "required")) {
      for (const c of clauses(l.text)) if (DUTY.test(c.replace(/^(and|or)\s+/i, ""))) addResp(c);
    }
  }
  for (const text of Array.isArray(model.responsibilities) ? model.responsibilities : []) {
    const t = cleanText(text, 140);
    if (t && coverage(t, jdStems) >= 0.75) addResp(t);
  }
  for (const name of responsibilities.slice(0, 8)) {
    add({ id: `resp:${slug(name)}`, name, category: "responsibility", priority: "medium", required: true, why: "A core responsibility of the role." });
  }

  const statedYears = typeof model.minYears === "number" && model.minYears > 0 && model.minYears <= 30 ? Math.round(model.minYears) : null;
  const modelTitle = cleanText(model.title, 80);
  return {
    title: jobTitle(jobDescription, lines) || (modelTitle && termInText(jobDescription, modelTitle) ? modelTitle : ""),
    requirements: [...reqs.values()].slice(0, 45),
    minYears: minYears(lines) ?? (statedYears && new RegExp(`\\b${statedYears}\\b`).test(jobDescription) ? statedYears : null),
    semanticEvidence,
  };
}

function termInText(text: string, term: string) {
  return normalizeForSearch(text).includes(normalizeForSearch(term));
}

const DUTY =
  /^(you will|you'll|will|to)?\s*(design|develop|build|create|maintain|write|implement|analy[sz]e|collaborate|work with|manage|own|lead|deploy|test|support|prepare|present|monitor|optimi[sz]e|automate|clean|transform|translate|partner|identify|ensure|conduct|perform|deliver|drive|improve|define|gather|extract|query|visuali[sz]e|integrate|troubleshoot|document|review|research|model|track|communicate)\b/i;

/** Split a JD line into duty-sized clauses; short fragments such as "Python" stay with the clause before them. */
function clauses(text: string): string[] {
  const parts = text.split(/;\s*|\.\s+|,\s+/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (out.length && p.split(/\s+/).length < 3) out[out.length - 1] += `, ${p}`;
    else out.push(p);
  }
  return out;
}

/** Share (0–1) of a phrase's content words found in a set of stems. */
function coverage(phrase: string, inStems: Set<string>): number {
  const s = stems(phrase);
  if (!s.size) return 0;
  let hit = 0;
  for (const t of s) if (inStems.has(t)) hit++;
  return hit / s.size;
}

/* ------------------------------------------------------------------ */
/* Resume side                                                         */
/* ------------------------------------------------------------------ */

export type WorkLine = { text: string; entry: string; kind: "experience" | "internship" | "project" | "achievement" | "title" };

type ResumeView = {
  work: WorkLine[];
  skillItems: string[];
  skillsText: string;
  summary: string;
  educationText: string;
  certText: string;
  allText: string;
};

function viewOf(r: StructuredResume): ResumeView {
  const work: WorkLine[] = [];
  r.experience.forEach((e, i) => {
    const entry = `experience.${i}`;
    if (e.title) work.push({ text: [e.title, e.organization].filter(Boolean).join(", "), entry, kind: "title" });
    e.bullets.forEach((b) => work.push({ text: b, entry, kind: "experience" }));
  });
  r.internships.forEach((e, i) => {
    const entry = `internships.${i}`;
    if (e.title) work.push({ text: [e.title, e.organization].filter(Boolean).join(", "), entry, kind: "title" });
    e.bullets.forEach((b) => work.push({ text: b, entry, kind: "internship" }));
  });
  r.projects.forEach((p, i) => {
    const entry = `projects.${i}`;
    const head = [p.name, p.tech].filter(Boolean).join(" — ");
    if (head) work.push({ text: head, entry, kind: "project" });
    p.bullets.forEach((b) => work.push({ text: b, entry, kind: "project" }));
  });
  r.achievements.forEach((a, i) => work.push({ text: a, entry: `achievements.${i}`, kind: "achievement" }));
  const skillItems = r.skills.flatMap((g) => g.items);
  const educationText = r.education.map((e) => [e.title, e.organization, ...e.bullets].join(" ")).join("\n");
  const certText = r.certifications.join("\n");
  const extraText = r.extra.flatMap((s) => s.items).join("\n");
  return {
    work,
    skillItems,
    skillsText: skillItems.join(", "),
    summary: [r.headline, r.summary].filter(Boolean).join(" "),
    educationText,
    certText,
    allText: [r.headline, r.summary, skillItems.join(", "), ...work.map((w) => w.text), educationText, certText, r.coursework.join(", "), extraText].join("\n"),
  };
}

const STOP = new Set(
  (
    "a an the and or of in on for to with by from as at into via using use used across within our your their this that these those " +
    "will be is are was were have has able ability strong good excellent work working team teams ensure including include such other " +
    "new high etc we you who what responsible responsibilities role job candidate experience year years"
  ).split(" "),
);

function stem(word: string) {
  let w = word.toLowerCase();
  for (const suffix of ["ments", "ment", "ings", "ing", "ions", "ion", "ers", "er", "ed", "es", "s", "ly"]) {
    if (w.length - suffix.length >= 4 && w.endsWith(suffix)) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  // "apis" → "api"; "prepare"/"prepared" and "service"/"services" share one stem.
  if (w.length === 4 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  if (w.length >= 5 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}

function stems(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9+#]+/)
      .filter((t) => t.length >= 3 && !STOP.has(t))
      .map(stem),
  );
}

/** Share of a responsibility's content words that a resume line covers (0–1). */
export function overlap(responsibility: string, line: string): number {
  const r = stems(responsibility);
  if (!r.size) return 0;
  const l = stems(line);
  let hit = 0;
  for (const t of r) if (l.has(t)) hit++;
  return hit / Math.max(3, r.size);
}

function matchSkill(req: JobRequirement, v: ResumeView, semantic: string | undefined): Omit<RequirementMatch, "requirementId" | "name" | "category" | "priority"> {
  const key = req.name.toLowerCase();
  const inWork = v.work.find((w) => w.kind !== "title" && mentions(w.text, key)) || v.work.find((w) => mentions(w.text, key));
  if (inWork) return { status: "demonstrated", evidence: inWork.text, note: "Shown in your experience or projects." };
  for (const tool of IMPLIED_BY[canonicalSkill(key)] || []) {
    const line = v.work.find((w) => w.kind !== "title" && mentions(w.text, tool));
    if (line) return { status: "demonstrated", evidence: line.text, note: `Shown through your ${display(tool)} work.` };
  }
  const listed = v.skillItems.find((s) => mentions(s, key) || s.toLowerCase() === key);
  if (listed) return { status: "partial", evidence: listed, note: "Listed in your skills, but no role or project shows how you used it." };
  if (mentions(v.summary, key)) return { status: "partial", evidence: v.summary.slice(0, 200), note: "Mentioned in your summary only." };
  if (mentions(v.educationText, key) || mentions(v.certText, key)) {
    return { status: "partial", evidence: mentions(v.certText, key) ? v.certText.split("\n").find((c) => mentions(c, key)) || "" : "", note: "Covered in education or certifications, not in work." };
  }
  if (mentions(v.allText, key)) {
    const line = v.allText.split("\n").find((l) => mentions(l, key)) || "";
    return { status: "partial", evidence: line.slice(0, 200), note: "Mentioned in your resume, but no role or project shows how you used it." };
  }
  // Requirements outside the known vocabulary ("financial reporting") match on their words.
  if (!isKnownSkill(key) && stems(key).size) {
    const best = v.work
      .filter((w) => w.kind !== "title")
      .map((w) => ({ w, c: coverage(key, stems(w.text)) }))
      .sort((a, b) => b.c - a.c)[0];
    if (best && best.c === 1) return { status: "demonstrated", evidence: best.w.text, note: "Shown in your experience or projects." };
    if (coverage(key, stems(v.allText)) === 1) return { status: "partial", evidence: "", note: "The words appear in your resume, but no role or project shows this work." };
    if (best && best.c >= 0.6 && stems(key).size >= 2) return { status: "partial", evidence: best.w.text, note: "Partly shown in your experience or projects." };
  }
  for (const rel of RELATED[key] || []) {
    const line = v.work.find((w) => mentions(w.text, rel)) || (v.skillItems.some((s) => mentions(s, rel)) ? { text: v.skillItems.find((s) => mentions(s, rel))! } : null);
    if (line) return { status: "partial", evidence: line.text, note: `Related experience with ${display(rel)}; ${req.name} itself is not mentioned.` };
  }
  if (semantic) return { status: "partial", evidence: semantic, note: "Related work found in your resume; the exact term is not used." };
  return { status: "missing", evidence: "", note: "Not found in your resume." };
}

function matchQualification(req: JobRequirement, v: ResumeView): Omit<RequirementMatch, "requirementId" | "name" | "category" | "priority"> {
  if (req.id === "qual:degree") {
    const need = degreeLevel(req.name);
    const lines = v.educationText.split("\n").filter(Boolean);
    const best = lines.map((l) => ({ l, level: degreeLevel(l) })).sort((a, b) => b.level - a.level)[0];
    if (!best || best.level === 0) return { status: lines.length ? "unclear" : "missing", evidence: lines[0] ?? "", note: lines.length ? "Degree level could not be read from your education." : "No education listed." };
    if (need === 0 || best.level >= need) return { status: "demonstrated", evidence: best.l.slice(0, 200), note: "Your education meets the stated level." };
    return { status: "partial", evidence: best.l.slice(0, 200), note: "Your degree is below the level the job asks for." };
  }
  const certs = v.certText.split("\n").filter(Boolean);
  const best = certs.map((c) => ({ c, o: overlap(req.name, c) })).sort((a, b) => b.o - a.o)[0];
  if (best && best.o >= 0.6) return { status: "demonstrated", evidence: best.c, note: "Listed in your certifications." };
  if (best && best.o >= 0.3) return { status: "partial", evidence: best.c, note: "A related certification is listed." };
  return { status: "missing", evidence: "", note: "Not listed in your certifications." };
}

function matchResponsibility(req: JobRequirement, v: ResumeView): Omit<RequirementMatch, "requirementId" | "name" | "category" | "priority"> {
  const skillTerms = SKILLS.filter((s) => mentions(req.name, s));
  let best = { line: "", score: 0 };
  for (const w of v.work) {
    if (w.kind === "title") continue;
    let s = overlap(req.name, w.text);
    if (skillTerms.some((t) => mentions(w.text, t))) s += 0.15;
    if (s > best.score) best = { line: w.text, score: s };
  }
  if (best.score >= 0.5) return { status: "demonstrated", evidence: best.line, note: "A resume bullet covers this responsibility." };
  if (best.score >= 0.28) return { status: "partial", evidence: best.line, note: "Partly covered by a resume bullet." };
  return { status: "missing", evidence: "", note: "No bullet describes this kind of work yet." };
}

/* ---------------------------- dates ---------------------------- */

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

function monthIndex(text: string, end: boolean, now: Date): number | null {
  const t = text.toLowerCase().trim();
  if (!t) return null;
  if (/present|current|now|till date|to date|ongoing/.test(t)) return now.getFullYear() * 12 + now.getMonth();
  const named = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*,?\s*'?(\d{4}|\d{2})\b/.exec(t);
  if (named) {
    const y = Number(named[2]!.length === 2 ? `20${named[2]}` : named[2]);
    return y * 12 + MONTHS[named[1]!]!;
  }
  const numeric = /\b(\d{1,2})[/.-](\d{4})\b/.exec(t);
  if (numeric) return Number(numeric[2]) * 12 + Math.min(11, Math.max(0, Number(numeric[1]) - 1));
  const year = /\b(19|20)\d{2}\b/.exec(t);
  if (year) return Number(year[0]) * 12 + (end ? 11 : 0);
  return null;
}

/** Months covered by a date range such as "Jan 2021 – Present" or "2019 - 2022". */
export function rangeMonths(dates: string, now = new Date()): [number, number] | null {
  const parts = dates.split(/\s*(?:–|—|-|\bto\b|\buntil\b|\btill\b)\s*/i).filter(Boolean);
  if (!parts.length) return null;
  const start = monthIndex(parts[0]!, false, now);
  if (start == null) return null;
  const end = parts.length > 1 ? monthIndex(parts.slice(1).join(" "), true, now) : start;
  if (end == null || end < start) return null;
  return [start, end + 1];
}

/** Total years across roles, counting overlapping periods once. Internships count half. */
export function experienceYears(r: StructuredResume, now = new Date()): number {
  const merge = (ranges: [number, number][]) => {
    const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
    let total = 0;
    let cur: [number, number] | null = null;
    for (const [s, e] of sorted) {
      if (!cur || s > cur[1]) {
        if (cur) total += cur[1] - cur[0];
        cur = [s, e];
      } else cur[1] = Math.max(cur[1], e);
    }
    if (cur) total += cur[1] - cur[0];
    return total;
  };
  const jobs = r.experience.map((e) => rangeMonths(e.dates, now)).filter((x): x is [number, number] => Boolean(x));
  const interns = r.internships.map((e) => rangeMonths(e.dates, now)).filter((x): x is [number, number] => Boolean(x));
  const months = merge(jobs) + merge(interns) * 0.5;
  return Math.round((months / 12) * 10) / 10;
}

/* ---------------------------- scoring ---------------------------- */

function categoryOf(req: JobRequirement): MatchCategoryKey {
  if (req.category === "responsibility") return "responsibilities";
  if (req.category === "tools") return "tools";
  return req.required ? "required" : "supporting";
}

function weightedCredit(list: RequirementMatch[]): number | null {
  if (!list.length) return null;
  let num = 0;
  let den = 0;
  for (const m of list) {
    const w = PRIORITY_WEIGHT[m.priority];
    num += w * STATUS_CREDIT[m.status];
    den += w;
  }
  return den ? Math.round((100 * num) / den) : null;
}

export function matchResume(resume: StructuredResume, job: JobProfile, now = new Date()): MatchReport {
  const v = viewOf(resume);
  const haystack = normalizeForSearch(v.allText);
  const matches: RequirementMatch[] = job.requirements.map((req) => {
    const semantic = job.semanticEvidence[req.id];
    const verified = semantic && haystack.includes(normalizeForSearch(semantic)) ? semantic : undefined;
    const result =
      req.category === "responsibility"
        ? matchResponsibility(req, v)
        : req.category === "qualification"
          ? matchQualification(req, v)
          : matchSkill(req, v, verified);
    return { requirementId: req.id, name: req.name, category: req.category, priority: req.priority, ...result };
  });

  const byCat = (key: MatchCategoryKey) => matches.filter((m) => categoryOf(job.requirements.find((r) => r.id === m.requirementId)!) === key);

  const years = experienceYears(resume, now);
  const entries = new Set(v.work.filter((w) => w.kind !== "achievement").map((w) => w.entry));
  const skillNames = matches.filter((m) => m.category !== "responsibility" && m.status !== "missing").map((m) => m.name.toLowerCase());
  const responsibilityNames = job.requirements.filter((r) => r.category === "responsibility").map((r) => r.name);
  const relevant = [...entries].filter((entry) =>
    v.work
      .filter((w) => w.entry === entry)
      .some((w) => skillNames.some((s) => mentions(w.text, s)) || responsibilityNames.some((r) => overlap(r, w.text) >= 0.28)),
  );
  const relevance = entries.size ? relevant.length / entries.size : 0;
  const yearsRatio = job.minYears ? Math.min(1, years / job.minYears) : null;
  const experienceScore = entries.size || job.minYears ? Math.round(100 * (yearsRatio == null ? relevance : 0.6 * yearsRatio + 0.4 * relevance)) : null;

  const categories: MatchCategoryScore[] = (Object.keys(MATCH_WEIGHTS) as MatchCategoryKey[]).map((key) => {
    if (key === "experience") {
      const detail = job.minYears
        ? `${years} of ${job.minYears}+ years; ${relevant.length} of ${entries.size} roles/projects relevant.`
        : `${relevant.length} of ${entries.size} roles/projects show job requirements.`;
      return { key, label: CATEGORY_LABELS[key], weight: MATCH_WEIGHTS[key], score: experienceScore, detail };
    }
    const list = byCat(key);
    const score = weightedCredit(list);
    const shown = list.filter((m) => m.status === "demonstrated").length;
    const partial = list.filter((m) => m.status === "partial").length;
    return {
      key,
      label: CATEGORY_LABELS[key],
      weight: MATCH_WEIGHTS[key],
      score,
      detail: list.length ? `${shown} demonstrated, ${partial} partial, ${list.length - shown - partial} not found (of ${list.length}).` : "Not applicable to this job description.",
    };
  });

  // Too few requirements to compare against is "not scorable", never a score of 0.
  const scorable = job.requirements.length >= MIN_REQUIREMENTS;
  const applicable = categories.filter((c) => c.score != null);
  const totalWeight = applicable.reduce((n, c) => n + c.weight, 0);
  const score = scorable && totalWeight ? Math.round(applicable.reduce((n, c) => n + c.weight * (c.score as number), 0) / totalWeight) : null;

  const allStems = stems(v.allText);
  const skillLike = matches.filter((m) => m.category === "technical" || m.category === "tools" || m.category === "domain");
  const present = (name: string) => mentions(v.allText, name) || (!isKnownSkill(name) && coverage(name, allStems) === 1);
  const keywordAlignment = scorable && skillLike.length ? Math.round((100 * skillLike.filter((m) => present(m.name)).length) / skillLike.length) : null;
  const skillsMatch = scorable ? (weightedCredit(matches.filter((m) => m.category === "technical" || m.category === "tools")) ?? keywordAlignment) : null;

  const importantMissing = matches
    .filter((m) => m.status === "missing" && m.category !== "responsibility" && (m.priority === "high" || job.requirements.find((r) => r.id === m.requirementId)?.required))
    .sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority])
    .slice(0, 6)
    .map((m) => m.name);

  const nonResp = matches.filter((m) => m.category !== "responsibility");
  const confidence = nonResp.length < 3 ? "low" : "normal";
  const shownCount = nonResp.filter((m) => m.status === "demonstrated").length;
  const partialCount = nonResp.filter((m) => m.status === "partial").length;
  const explanation = !scorable
    ? `Only ${job.requirements.length} concrete requirement${job.requirements.length === 1 ? "" : "s"} could be read from this job description, which is too few for a reliable match estimate. Paste the full posting, including its requirements or qualifications and its responsibilities.`
    : [
    nonResp.length
      ? `Your resume demonstrates ${shownCount} of ${nonResp.length} skills and qualifications the job asks for${partialCount ? ` and partly supports ${partialCount} more` : ""}.`
      : "The job description names few concrete skills, so this estimate relies mostly on experience and responsibilities.",
    importantMissing.length ? `Main gaps: ${importantMissing.slice(0, 4).join(", ")}.` : "",
    job.minYears ? `Experience: about ${years} year${years === 1 ? "" : "s"} against ${job.minYears}+ requested.` : "",
    confidence === "low" ? "Low confidence: add a fuller job description for a more reliable estimate." : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    scoringVersion: SCORING_VERSION,
    status: scorable ? "scored" : "insufficient_job_description",
    requirementCount: job.requirements.length,
    score,
    keywordAlignment,
    skillsMatch,
    categories,
    matches,
    candidateYears: years,
    confidence,
    explanation,
    importantMissing,
  };
}

/** How strongly a resume line relates to the job: requirement terms it shows plus responsibility overlap. */
export function lineRelevance(line: string, job: JobProfile): number {
  let score = 0;
  for (const r of job.requirements) {
    if (r.category === "responsibility") score += overlap(r.name, line) >= 0.28 ? 1 : 0;
    else if (r.category !== "qualification" && mentions(line, r.name)) score += r.priority === "high" ? 2 : 1;
  }
  return score;
}

export function dedupeLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (out.some((o) => o.toLowerCase() === line.toLowerCase() || (overlap(o, line) >= 0.85 && overlap(line, o) >= 0.85))) continue;
    out.push(line);
  }
  return out;
}

export function requirementNames(job: JobProfile, filter: (r: JobRequirement) => boolean): string[] {
  return dedupe(job.requirements.filter(filter).map((r) => r.name));
}
