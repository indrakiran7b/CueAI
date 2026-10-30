import {
  emptyResume,
  type ResumeEntry,
  type ResumeExtraSection,
  type ResumeProject,
  type ResumeSkillGroup,
  type StructuredResume,
} from "./types";

const LIMITS = {
  short: 160,
  line: 400,
  bullet: 700,
  summary: 2000,
  entries: 30,
  bullets: 25,
  items: 80,
  sections: 10,
};

export function cleanText(value: unknown, max: number = LIMITS.line): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cleanList(value: unknown, max: number, itemMax: number = LIMITS.line): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => cleanText(v, itemMax))
    .filter(Boolean)
    .slice(0, max);
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function coerceEntry(value: unknown): ResumeEntry | null {
  const o = obj(value);
  const entry: ResumeEntry = {
    title: cleanText(o.title ?? o.role ?? o.degree, LIMITS.short),
    organization: cleanText(o.organization ?? o.company ?? o.school ?? o.institution, LIMITS.short),
    location: cleanText(o.location, LIMITS.short),
    dates: cleanText(o.dates ?? o.date ?? o.period, LIMITS.short),
    bullets: cleanList(o.bullets ?? o.details, LIMITS.bullets, LIMITS.bullet),
  };
  return entry.title || entry.organization || entry.bullets.length ? entry : null;
}

function coerceProject(value: unknown): ResumeProject | null {
  const o = obj(value);
  const tech = Array.isArray(o.tech) ? cleanList(o.tech, 30).join(", ") : cleanText(o.tech ?? o.stack, LIMITS.line);
  const project: ResumeProject = {
    name: cleanText(o.name ?? o.title, LIMITS.short),
    tech,
    dates: cleanText(o.dates ?? o.date, LIMITS.short),
    link: cleanText(o.link ?? o.url, LIMITS.short),
    bullets: cleanList(o.bullets ?? o.details, LIMITS.bullets, LIMITS.bullet),
  };
  const description = cleanText(o.description, LIMITS.bullet);
  if (description && !project.bullets.includes(description)) project.bullets.unshift(description);
  return project.name || project.bullets.length ? project : null;
}

function coerceSkills(value: unknown): ResumeSkillGroup[] {
  if (!Array.isArray(value)) return [];
  const groups: ResumeSkillGroup[] = [];
  const loose: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      loose.push(...splitSkills(item));
      continue;
    }
    const o = obj(item);
    const items = (Array.isArray(o.items) ? cleanList(o.items, LIMITS.items, LIMITS.short) : splitSkills(cleanText(o.items)))
      .flatMap((s) => splitSkills(s));
    if (items.length) groups.push({ label: cleanText(o.label ?? o.category, LIMITS.short), items: dedupe(items) });
  }
  if (loose.length) groups.push({ label: "", items: dedupe(loose) });
  return groups.slice(0, 12);
}

export function splitSkills(text: string): string[] {
  return text
    .split(/\s*[,;|•·]\s*/)
    .map((s) => cleanText(s, LIMITS.short))
    .filter(Boolean);
}

export function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function coerceExtra(value: unknown): ResumeExtraSection[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => {
      const o = obj(v);
      return { heading: cleanText(o.heading ?? o.title, LIMITS.short), items: cleanList(o.items, LIMITS.items, LIMITS.bullet) };
    })
    .filter((s) => s.heading && s.items.length)
    .slice(0, LIMITS.sections);
}

/** Coerce untrusted JSON (model output or a client request) into a bounded StructuredResume. */
export function coerceResume(value: unknown): StructuredResume {
  const o = obj(value);
  const contact = obj(o.contact);
  const resume = emptyResume();
  resume.name = cleanText(o.name, LIMITS.short);
  resume.headline = cleanText(o.headline ?? o.title, LIMITS.short);
  resume.contact = {
    email: cleanText(contact.email ?? o.email, LIMITS.short),
    phone: cleanText(contact.phone ?? o.phone, LIMITS.short),
    location: cleanText(contact.location ?? o.location, LIMITS.short),
    links: cleanList(contact.links ?? o.links, 8, LIMITS.short),
  };
  resume.summary = cleanText(o.summary, LIMITS.summary);
  resume.skills = coerceSkills(o.skills);
  const entries = (v: unknown) =>
    (Array.isArray(v) ? v : []).map(coerceEntry).filter((e): e is ResumeEntry => Boolean(e)).slice(0, LIMITS.entries);
  resume.experience = entries(o.experience);
  resume.internships = entries(o.internships);
  resume.education = entries(o.education);
  resume.projects = (Array.isArray(o.projects) ? o.projects : [])
    .map(coerceProject)
    .filter((p): p is ResumeProject => Boolean(p))
    .slice(0, LIMITS.entries);
  resume.certifications = cleanList(o.certifications, LIMITS.items);
  resume.achievements = cleanList(o.achievements, LIMITS.items, LIMITS.bullet);
  resume.coursework = cleanList(o.coursework, LIMITS.items, LIMITS.short).flatMap(splitSkills);
  resume.extra = coerceExtra(o.extra);
  if (o.projectsFirst === true) resume.projectsFirst = true;
  return resume;
}

/** Every piece of text in the resume, in reading order. */
export function resumeToText(r: StructuredResume): string {
  const parts: string[] = [r.name, r.headline, r.contact.email, r.contact.phone, r.contact.location, ...r.contact.links, r.summary];
  for (const g of r.skills) parts.push(`${g.label} ${g.items.join(", ")}`);
  for (const e of [...r.experience, ...r.internships, ...r.education]) {
    parts.push(e.title, e.organization, e.location, e.dates, ...e.bullets);
  }
  for (const p of r.projects) parts.push(p.name, p.tech, p.dates, p.link, ...p.bullets);
  parts.push(...r.certifications, ...r.achievements, ...r.coursework);
  for (const s of r.extra) parts.push(s.heading, ...s.items);
  return parts.filter(Boolean).join("\n");
}

export function wordTokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length >= 2);
}

const HEADING_LINE =
  /^(summary|profile|professional summary|objective|experience|work experience|professional experience|employment|internships?|projects?|academic projects|personal projects|skills|technical skills|core skills|education|certifications?|achievements|awards|coursework|relevant coursework|languages|interests|hobbies|contact|references)\s*:?$/i;

/**
 * Lines of the original text that the structured resume does not represent.
 * Used to keep the parser from silently dropping content.
 */
export function uncoveredLines(resume: StructuredResume, sourceText: string): string[] {
  const covered = new Set(wordTokens(resumeToText(resume)));
  const out: string[] = [];
  for (const raw of sourceText.split(/\r?\n/)) {
    const line = cleanText(raw.replace(/^[\s•●▪◦\-*–]+/, ""), LIMITS.bullet);
    if (!line || HEADING_LINE.test(line)) continue;
    const tokens = wordTokens(line).filter((t) => t.length >= 3);
    if (tokens.length < 3) continue;
    const hit = tokens.filter((t) => covered.has(t)).length;
    if (hit / tokens.length < 0.6) out.push(line);
  }
  return out;
}

/** Keep anything the parser missed in an "Additional Information" section. */
export function preserveSourceContent(resume: StructuredResume, sourceText: string): StructuredResume {
  const missing = uncoveredLines(resume, sourceText);
  if (!missing.length) return resume;
  return { ...resume, extra: [...resume.extra, { heading: "Additional Information", items: missing.slice(0, 40) }] };
}

export function hasContent(r: StructuredResume): boolean {
  return Boolean(
    r.summary ||
      r.skills.length ||
      r.experience.length ||
      r.internships.length ||
      r.projects.length ||
      r.education.length,
  );
}
