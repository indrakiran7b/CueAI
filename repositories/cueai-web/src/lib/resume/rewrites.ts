import { isKnownSkill, mentions } from "./ats";
import { cleanText, dedupe, splitSkills } from "./normalize";
import type { ResumeRewrite, ResumeSkillGroup, StructuredResume } from "./types";

const ENTRY_TARGET = /^(experience|internships|projects)\.(\d+)\.bullets\.(\d+)$/;
const LIST_TARGET = /^achievements\.(\d+)$/;

function entryLabel(r: StructuredResume, kind: string, i: number) {
  if (kind === "projects") return `Projects · ${r.projects[i]?.name || `#${i + 1}`}`;
  const e = kind === "experience" ? r.experience[i] : r.internships[i];
  const where = [e?.title, e?.organization].filter(Boolean).join(", ");
  return `${kind === "experience" ? "Experience" : "Internship"} · ${where || `#${i + 1}`}`;
}

/** Current text and display label for a rewrite target, or null when it does not exist. */
export function readTarget(r: StructuredResume, target: string): { text: string; section: string } | null {
  if (target === "summary") return r.summary ? { text: r.summary, section: "Summary" } : { text: "", section: "Summary" };
  if (target === "headline") return { text: r.headline, section: "Headline" };
  if (target === "skills") {
    return { text: r.skills.map((g) => (g.label ? `${g.label}: ` : "") + g.items.join(", ")).join("\n"), section: "Skills" };
  }
  const m = target.match(ENTRY_TARGET);
  if (m) {
    const [, kind, i, j] = m;
    const list = kind === "projects" ? r.projects : kind === "experience" ? r.experience : r.internships;
    const text = list[Number(i)]?.bullets[Number(j)];
    return text == null ? null : { text, section: entryLabel(r, kind!, Number(i)) };
  }
  const a = target.match(LIST_TARGET);
  if (a) {
    const text = r.achievements[Number(a[1])];
    return text == null ? null : { text, section: "Achievements" };
  }
  return null;
}

function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)*/g) || []).map((n) => n.replace(/,/g, ""));
}

/**
 * Facts a rewrite may not introduce: numbers or skills the resume does not contain.
 * `numberSource` limits which numbers may appear (a bullet may only reuse its own figures).
 */
export function fabricationIssues(
  after: string,
  sourceText: string,
  skillVocabulary: string[] = [],
  numberSource: string = sourceText,
): string[] {
  const issues: string[] = [];
  const known = new Set(numbersIn(numberSource));
  const newNumbers = numbersIn(after).filter((n) => !known.has(n));
  if (newNumbers.length) {
    issues.push(
      numberSource === sourceText
        ? `adds numbers not in your resume (${dedupe(newNumbers).slice(0, 3).join(", ")})`
        : `adds figures that are not in the original line (${dedupe(newNumbers).slice(0, 3).join(", ")})`,
    );
  }
  const terms = dedupe([...skillVocabulary, ...candidateSkillTerms(after)]);
  const newSkills = terms.filter((t) => mentions(after, t) && !mentions(sourceText, t));
  if (newSkills.length) issues.push(`claims ${newSkills.slice(0, 3).join(", ")}, which your resume does not show`);
  return issues;
}

/** Known skill names that appear in a piece of text. */
function candidateSkillTerms(text: string): string[] {
  const words = text.toLowerCase().split(/[\s,;()]+/).filter(Boolean);
  const out: string[] = [];
  for (let n = 1; n <= 3; n++) {
    for (let i = 0; i + n <= words.length; i++) {
      const phrase = words.slice(i, i + n).join(" ").replace(/[.:]+$/, "");
      if (isKnownSkill(phrase)) out.push(phrase);
    }
  }
  return out;
}

type RawRewrite = { target?: unknown; text?: unknown; after?: unknown; rewritten?: unknown; reason?: unknown; skills?: unknown };

function coerceGroups(value: unknown): ResumeSkillGroup[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((g) => {
      const o = (g && typeof g === "object" ? g : {}) as Record<string, unknown>;
      const items = Array.isArray(o.items) ? o.items.map((i) => cleanText(i, 120)).filter(Boolean) : splitSkills(cleanText(o.items));
      return { label: cleanText(o.label, 80), items: dedupe(items) };
    })
    .filter((g) => g.items.length);
}

/**
 * Turn model output into checked rewrites. Each target is rewritten at most once;
 * rewrites that would add facts are kept for display but marked invalid.
 */
export function validateRewrites(
  resume: StructuredResume,
  sourceText: string,
  raw: unknown,
  skillVocabulary: string[] = [],
): ResumeRewrite[] {
  const list = Array.isArray(raw) ? (raw as RawRewrite[]) : [];
  const seen = new Set<string>();
  const out: ResumeRewrite[] = [];
  for (const item of list) {
    const target = cleanText(item?.target, 60);
    if (!target || seen.has(target)) continue;
    const current = readTarget(resume, target);
    if (!current) continue;

    if (target === "skills") {
      const proposed = coerceGroups(item.skills);
      if (!proposed.length) continue;
      const original = resume.skills.flatMap((g) => g.items);
      const dropped: string[] = [];
      const groups = proposed
        .map((g) => ({
          label: g.label,
          items: g.items.filter((s) => {
            const ok = original.some((o) => o.toLowerCase() === s.toLowerCase()) || mentions(sourceText, s);
            if (!ok) dropped.push(s);
            return ok;
          }),
        }))
        .filter((g) => g.items.length);
      // Never lose a skill the candidate already listed.
      const kept = new Set(groups.flatMap((g) => g.items.map((s) => s.toLowerCase())));
      const lost = original.filter((s) => !kept.has(s.toLowerCase()));
      if (lost.length) groups.push({ label: groups.length ? "Other" : "", items: lost });
      const after = groups.map((g) => (g.label ? `${g.label}: ` : "") + g.items.join(", ")).join("\n");
      if (!groups.length || after === current.text) continue;
      seen.add(target);
      out.push({
        id: `rw-${out.length + 1}`,
        target,
        section: current.section,
        before: current.text,
        after,
        skills: groups,
        reason:
          cleanText(item.reason, 300) +
          (dropped.length ? ` (Left out ${dropped.slice(0, 4).join(", ")} — not shown in your resume.)` : ""),
        valid: true,
      });
      continue;
    }

    const after = cleanText(item.text ?? item.after ?? item.rewritten, target === "summary" ? 1500 : 700);
    if (!after || after === current.text) continue;
    if (current.text && after.length > Math.max(current.text.length * 3, current.text.length + 400)) continue;
    seen.add(target);
    const lineTarget = /\.bullets\.\d+$|^achievements\.\d+$/.test(target);
    const issues = fabricationIssues(after, sourceText, skillVocabulary, lineTarget ? current.text : sourceText);
    out.push({
      id: `rw-${out.length + 1}`,
      target,
      section: current.section,
      before: current.text,
      after,
      reason: cleanText(item.reason, 300),
      valid: issues.length === 0,
      rejectReason: issues.length ? `Not applied: ${issues.join("; ")}.` : undefined,
    });
  }
  return out.slice(0, 40);
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Apply every valid rewrite to a copy of the resume. The input is never mutated. */
export function applyRewrites(resume: StructuredResume, rewrites: ResumeRewrite[]): StructuredResume {
  const next = clone(resume);
  for (const rw of rewrites) {
    if (!rw.valid) continue;
    if (rw.target === "summary") next.summary = rw.after;
    else if (rw.target === "headline") next.headline = rw.after;
    else if (rw.target === "skills" && rw.skills?.length) next.skills = clone(rw.skills);
    else {
      const m = rw.target.match(ENTRY_TARGET);
      if (m) {
        const [, kind, i, j] = m;
        const list = kind === "projects" ? next.projects : kind === "experience" ? next.experience : next.internships;
        const entry = list[Number(i)];
        if (entry && entry.bullets[Number(j)] != null) entry.bullets[Number(j)] = rw.after;
        continue;
      }
      const a = rw.target.match(LIST_TARGET);
      if (a && next.achievements[Number(a[1])] != null) next.achievements[Number(a[1])] = rw.after;
    }
  }
  return next;
}

/** Add skills the user confirmed, into the matching group (or a new one). */
export function addSkills(resume: StructuredResume, skills: { skill: string; group?: string }[]): StructuredResume {
  if (!skills.length) return resume;
  const next = clone(resume);
  for (const { skill, group } of skills) {
    const name = cleanText(skill, 120);
    if (!name || next.skills.some((g) => g.items.some((s) => s.toLowerCase() === name.toLowerCase()))) continue;
    const label = cleanText(group, 80);
    const target =
      (label && next.skills.find((g) => g.label.toLowerCase() === label.toLowerCase())) ||
      next.skills.find((g) => g.label.toLowerCase() === "additional skills");
    if (target) target.items.push(name);
    else next.skills.push({ label: next.skills.length ? label || "Additional Skills" : "", items: [name] });
  }
  return next;
}
