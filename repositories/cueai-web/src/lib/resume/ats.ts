import { resumeToText } from "./normalize";
import type { AtsCheck, AtsReport, StructuredResume } from "./types";

/**
 * Deterministic ATS estimate: keyword coverage against the job description,
 * skills match, and formatting/readability checks. Template choice never
 * affects the score — only resume content does.
 */

export const SKILLS = [
  "python", "java", "javascript", "typescript", "c++", "c#", "go", "golang", "rust", "kotlin", "swift", "scala", "ruby", "php", "r", "matlab", "sql", "nosql", "bash", "shell scripting",
  "react", "react native", "next.js", "angular", "vue", "node.js", "express", "django", "flask", "fastapi", "spring", "spring boot", "hibernate", ".net", "asp.net", "laravel", "rails",
  "html", "css", "tailwind", "redux", "graphql", "rest api", "grpc", "microservices", "websockets",
  "postgresql", "mysql", "mongodb", "redis", "elasticsearch", "cassandra", "dynamodb", "oracle", "sqlite", "kafka", "rabbitmq", "spark", "hadoop", "airflow", "snowflake", "databricks", "etl",
  "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "ansible", "jenkins", "github actions", "gitlab ci", "ci/cd", "linux", "nginx", "serverless", "lambda", "cloudformation",
  "git", "jira", "agile", "scrum", "tdd", "unit testing", "integration testing", "selenium", "cypress", "playwright", "pytest", "junit", "jest", "postman", "api testing", "test automation", "manual testing",
  "machine learning", "deep learning", "nlp", "computer vision", "pytorch", "tensorflow", "keras", "scikit-learn", "pandas", "numpy", "llm", "langchain", "generative ai", "rag", "data analysis", "data visualization",
  "power bi", "tableau", "excel", "statistics", "a/b testing",
  "system design", "data structures", "algorithms", "oop", "design patterns", "distributed systems", "security", "oauth", "networking", "performance optimization",
  "figma", "ui/ux", "accessibility", "seo",
  "project management", "stakeholder management", "communication", "leadership", "mentoring", "product management", "salesforce", "sap",
  "sqlalchemy", "celery", "orm", "database design", "backend development", "api development", "data pipelines", "data warehousing",
  "bigquery", "redshift", "dbt", "data cleaning", "data modeling", "dashboards", "reporting", "business intelligence", "kpi", "looker",
  "google sheets", "matplotlib", "seaborn", "plotly", "jupyter", "data mining", "forecasting",
];

const ALIASES: Record<string, string[]> = {
  javascript: ["js", "es6"],
  typescript: ["ts"],
  golang: ["go"],
  "node.js": ["nodejs", "node"],
  "next.js": ["nextjs"],
  postgresql: ["postgres"],
  kubernetes: ["k8s"],
  "ci/cd": ["cicd", "continuous integration", "continuous delivery", "continuous deployment"],
  "machine learning": ["ml"],
  "rest api": ["restful", "rest apis", "restful apis", "rest"],
  "scikit-learn": ["sklearn"],
  "c#": ["csharp"],
  gcp: ["google cloud"],
  aws: ["amazon web services"],
  azure: ["microsoft azure"],
  "generative ai": ["genai", "gen ai"],
  llm: ["llms", "large language models"],
  "unit testing": ["unit tests"],
  "spring boot": ["springboot"],
  dashboards: ["dashboard"],
  kpi: ["kpis"],
  "data cleaning": ["data cleansing", "data wrangling"],
  "data pipelines": ["data pipeline", "etl pipelines"],
  "data modeling": ["data modelling"],
  "database design": ["schema design", "database schemas"],
  "api development": ["api design"],
  "backend development": ["backend engineering", "back-end development"],
};

const AMBIGUOUS_SHORT = new Set(["r", "go", "rest", "ts", "js", "node", "ml"]);

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

function termRegex(term: string) {
  // Word-ish boundaries that still work for "c++", ".net", "ci/cd".
  return new RegExp(`(^|[^a-z0-9+#.])${escapeRe(term.toLowerCase())}(?=$|[^a-z0-9+#])`, "i");
}

/** Does `text` mention `term` (or a known alias)? */
export function mentions(text: string, term: string): boolean {
  const t = term.toLowerCase().trim();
  if (!t) return false;
  const variants = [t, ...(ALIASES[t] || [])];
  return variants.some((v) => {
    // A bare "R" or "Go" in prose is too ambiguous to count from a resume body.
    if (AMBIGUOUS_SHORT.has(v) && v !== t) return false;
    return termRegex(v).test(text);
  });
}

export function isKnownSkill(term: string) {
  const t = term.toLowerCase().trim();
  return SKILLS.includes(t) || Object.entries(ALIASES).some(([k, v]) => k === t || v.includes(t));
}

/** The canonical skill name for an alias ("rest apis" → "rest api"); other terms are returned lower-cased. */
export function canonicalSkill(term: string) {
  const t = term.toLowerCase().trim();
  if (SKILLS.includes(t)) return t;
  return Object.entries(ALIASES).find(([, v]) => v.includes(t))?.[0] ?? t;
}

/**
 * A specific tool that proves a general skill (Matplotlib charts are data visualization; PostgreSQL
 * queries are SQL). One-directional: knowing SQL never implies PostgreSQL.
 */
export const IMPLIED_BY: Record<string, string[]> = {
  sql: ["postgresql", "mysql", "sqlite", "oracle"],
  nosql: ["mongodb", "dynamodb", "cassandra"],
  "data visualization": ["matplotlib", "seaborn", "plotly", "tableau", "power bi", "looker"],
  "data analysis": ["pandas"],
  "backend development": ["django", "flask", "fastapi", "spring boot", "express"],
  "api development": ["rest api", "graphql", "fastapi"],
  "machine learning": ["scikit-learn", "tensorflow", "pytorch", "keras"],
  "deep learning": ["pytorch", "tensorflow", "keras"],
  "unit testing": ["pytest", "jest", "junit"],
  "ci/cd": ["github actions", "gitlab ci", "jenkins"],
  orm: ["sqlalchemy", "hibernate"],
};

/** Does the text show this skill, by name, alias, or a specific tool that proves it? */
export function evidences(text: string, term: string): boolean {
  const key = canonicalSkill(term);
  return mentions(text, key) || (IMPLIED_BY[key] || []).some((t) => mentions(text, t));
}

export function display(term: string) {
  const special: Record<string, string> = {
    "c++": "C++", "c#": "C#", ".net": ".NET", "asp.net": "ASP.NET", "node.js": "Node.js", "next.js": "Next.js", aws: "AWS", gcp: "GCP",
    sql: "SQL", nosql: "NoSQL", html: "HTML", css: "CSS", "ci/cd": "CI/CD", nlp: "NLP", llm: "LLM", rag: "RAG", etl: "ETL", oop: "OOP", tdd: "TDD",
    "rest api": "REST API", graphql: "GraphQL", grpc: "gRPC", "ui/ux": "UI/UX", seo: "SEO", "a/b testing": "A/B testing", "power bi": "Power BI",
    postgresql: "PostgreSQL", mysql: "MySQL", mongodb: "MongoDB", "scikit-learn": "scikit-learn", pytorch: "PyTorch", tensorflow: "TensorFlow",
    numpy: "NumPy", javascript: "JavaScript", typescript: "TypeScript", "github actions": "GitHub Actions", "gitlab ci": "GitLab CI", sap: "SAP",
    rabbitmq: "RabbitMQ", websockets: "WebSockets", nginx: "NGINX", "spring boot": "Spring Boot",
    kpi: "KPI", orm: "ORM", "api development": "API development", "database design": "Database design", "data modeling": "Data modeling", sqlalchemy: "SQLAlchemy", bigquery: "BigQuery", dbt: "dbt",
    oauth: "OAuth", fastapi: "FastAPI", junit: "JUnit", pytest: "pytest", jest: "Jest", "generative ai": "Generative AI", dynamodb: "DynamoDB",
  };
  return special[term] || term.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * Keywords the job description actually asks for: known skills found in the JD,
 * plus model-proposed terms only when they appear verbatim in the JD.
 */
export function extractJobKeywords(jobDescription: string, proposed: string[] = []): string[] {
  const jd = jobDescription.trim();
  if (!jd) return [];
  const found = new Map<string, string>();
  for (const skill of SKILLS) {
    if (AMBIGUOUS_SHORT.has(skill) && !new RegExp(`(^|[\\s,(/])${escapeRe(skill)}([\\s,)/]|$)`).test(jd)) continue;
    if (mentions(jd, skill)) found.set(skill, display(skill));
  }
  for (const raw of proposed) {
    const term = raw.trim().replace(/\s+/g, " ").replace(/[.,;:]+$/, "");
    if (!isKeywordPhrase(term)) continue;
    const key = term.toLowerCase();
    // Phrases that only wrap a skill already found ("build REST APIs", "strong SQL") would double-count it.
    if ([...found.keys()].some((k) => k === key || (ALIASES[k] || []).includes(key) || mentions(key, k))) continue;
    if (termRegex(key).test(jd)) found.set(key, term);
  }
  return [...found.values()].slice(0, 40);
}

const PHRASE_LEAD =
  /^(a|an|the|and|or|with|of|in|on|for|to|build|building|design|designing|develop|developing|own|owning|write|writing|improve|improving|deploy|deploying|maintain|manage|create|use|using|work|working|strong|solid|good|excellent|proven|deep|hands-on|familiarity|familiar|knowledge|understanding|experience|ability|years?|plus|nice)\b/i;
const GENERIC_TERMS = new Set([
  "design", "development", "build", "code", "coding", "systems", "system", "services", "service", "data", "apis", "api",
  "tools", "teams", "team", "software", "engineering", "experience", "skills", "requirements", "responsibilities", "backend", "frontend",
]);

/** A model-proposed keyword must look like a skill or competency, not a sentence fragment. */
function isKeywordPhrase(term: string) {
  if (term.length < 2 || term.length > 40) return false;
  if (/\d/.test(term) && !isKnownSkill(term)) return false;
  const words = term.split(" ");
  if (words.length > 3) return false;
  if (PHRASE_LEAD.test(term)) return false;
  return !GENERIC_TERMS.has(term.toLowerCase());
}

const ACTION_VERBS =
  /^(achieved|accelerated|architected|automated|built|collaborated|conducted|configured|coordinated|created|debugged|decreased|delivered|deployed|designed|developed|directed|drove|enabled|engineered|enhanced|established|executed|expanded|facilitated|generated|guided|identified|implemented|improved|increased|integrated|introduced|launched|led|maintained|managed|mentored|migrated|modernized|monitored|optimized|orchestrated|organized|owned|partnered|performed|pioneered|planned|presented|produced|programmed|published|reduced|refactored|resolved|researched|restructured|revamped|scaled|secured|shipped|simplified|spearheaded|standardized|streamlined|supported|tested|trained|transformed|troubleshot|upgraded|validated|wrote|analyzed|analysed|assisted|authored|contributed|crafted|defined|documented|evaluated|handled|hosted|investigated|leveraged|modeled|negotiated|oversaw|prepared|prototyped|provided|ran|recruited|redesigned|reviewed|served|set up|utilized|worked)\b/i;

function allBullets(r: StructuredResume) {
  return [
    ...r.experience.flatMap((e) => e.bullets),
    ...r.internships.flatMap((e) => e.bullets),
    ...r.projects.flatMap((p) => p.bullets),
  ];
}

function words(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

export function formattingChecks(r: StructuredResume): AtsCheck[] {
  const bullets = allBullets(r);
  const text = resumeToText(r);
  const total = words(text);
  const actionPct = bullets.length ? bullets.filter((b) => ACTION_VERBS.test(b.replace(/^[^A-Za-z]+/, ""))).length / bullets.length : 0;
  const quantPct = bullets.length ? bullets.filter((b) => /\d/.test(b)).length / bullets.length : 0;
  const longBullets = bullets.filter((b) => words(b) > 40).length;
  const roles = [...r.experience, ...r.internships];
  const summaryWords = words(r.summary);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return [
    { id: "name", label: "Name at the top", passed: Boolean(r.name), detail: r.name ? "Found." : "Add your full name." },
    {
      id: "email",
      label: "Email address",
      passed: /[^\s@]+@[^\s@]+\.[^\s@]+/.test(r.contact.email),
      detail: r.contact.email ? "Found." : "Add a professional email address.",
    },
    {
      id: "phone",
      label: "Phone number",
      passed: (r.contact.phone.match(/\d/g) || []).length >= 7,
      detail: r.contact.phone ? "Found." : "Add a phone number.",
    },
    {
      id: "summary",
      label: "Professional summary (20–120 words)",
      passed: summaryWords >= 20 && summaryWords <= 120,
      detail: summaryWords ? `${summaryWords} words.` : "Add a short summary aimed at the target role.",
    },
    {
      id: "skills",
      label: "Dedicated skills section",
      passed: r.skills.some((g) => g.items.length >= 3),
      detail: r.skills.length ? `${r.skills.reduce((n, g) => n + g.items.length, 0)} skills listed.` : "Add a skills section with your tools and technologies.",
    },
    {
      id: "experience",
      label: "Experience, internships or projects",
      passed: roles.length + r.projects.length > 0,
      detail: roles.length + r.projects.length ? "Found." : "Add work, internship or project experience.",
    },
    { id: "education", label: "Education section", passed: r.education.length > 0, detail: r.education.length ? "Found." : "Add your education." },
    {
      id: "dates",
      label: "Dates on every role",
      passed: roles.length > 0 && roles.every((e) => Boolean(e.dates)),
      detail: roles.length ? `${roles.filter((e) => e.dates).length}/${roles.length} roles dated.` : "No roles to date.",
    },
    {
      id: "action_verbs",
      label: "Bullets start with action verbs",
      passed: bullets.length > 0 && actionPct >= 0.6,
      detail: bullets.length ? `${pct(actionPct)} of ${bullets.length} bullets.` : "Describe your work as bullet points.",
    },
    {
      id: "quantified",
      label: "Measurable results",
      passed: bullets.length > 0 && quantPct >= 0.25,
      detail: bullets.length
        ? `${pct(quantPct)} of bullets include a number. Add real metrics where you have them.`
        : "No bullets yet.",
    },
    {
      id: "bullet_length",
      label: "Concise bullets (≤ 40 words)",
      passed: longBullets === 0,
      detail: longBullets ? `${longBullets} bullet(s) are longer than 40 words.` : "All bullets are concise.",
    },
    {
      id: "length",
      label: "Resume length (250–1200 words)",
      passed: total >= 250 && total <= 1200,
      detail: `${total} words.`,
    },
  ];
}

const CHECK_WEIGHTS: Record<string, number> = {
  name: 1, email: 1.5, phone: 1, summary: 1, skills: 1.5, experience: 2, education: 1, dates: 1, action_verbs: 1.5, quantified: 1.5, bullet_length: 1, length: 1,
};

export function scoreResume(r: StructuredResume, jobKeywords: string[], usedJobDescription: boolean): AtsReport {
  const text = resumeToText(r);
  const checks = formattingChecks(r);
  const totalWeight = checks.reduce((n, c) => n + (CHECK_WEIGHTS[c.id] ?? 1), 0);
  const formatting = Math.round((100 * checks.filter((c) => c.passed).reduce((n, c) => n + (CHECK_WEIGHTS[c.id] ?? 1), 0)) / totalWeight);

  const matched = jobKeywords.filter((k) => mentions(text, k));
  const missing = jobKeywords.filter((k) => !mentions(text, k));
  const skillKeys = jobKeywords.filter(isKnownSkill);
  const skillsText = r.skills.map((g) => g.items.join(", ")).join("\n") + "\n" + text;
  const skillsHit = skillKeys.filter((k) => mentions(skillsText, k)).length;

  const keywordCoverage = jobKeywords.length ? Math.round((100 * matched.length) / jobKeywords.length) : 0;
  const skillsMatch = skillKeys.length ? Math.round((100 * skillsHit) / skillKeys.length) : keywordCoverage;
  const hasJd = usedJobDescription && jobKeywords.length > 0;
  const overall = hasJd ? Math.round(0.45 * keywordCoverage + 0.2 * skillsMatch + 0.35 * formatting) : formatting;

  const suggestions: string[] = [];
  if (hasJd && missing.length) {
    suggestions.push(
      `The job description mentions ${missing.slice(0, 5).join(", ")}. Add them only where you genuinely have that experience.`,
    );
  }
  for (const c of checks) if (!c.passed) suggestions.push(`${c.label}: ${c.detail}`);
  if (!usedJobDescription) suggestions.unshift("Add a job description to measure keyword coverage for a specific role.");

  return {
    overall,
    keywordCoverage,
    skillsMatch: hasJd ? skillsMatch : 0,
    formatting,
    matchedKeywords: matched,
    missingKeywords: missing,
    checks,
    suggestions: suggestions.slice(0, 10),
    usedJobDescription,
  };
}
