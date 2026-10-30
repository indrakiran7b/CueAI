import { canonicalSkill, isKnownSkill } from "./ats";
import type { ResumeEntry, ResumeProject, StructuredResume, TailorChange } from "./types";

/**
 * Comparison form of a line: case, whitespace, curly quotes, dash styles, "&" vs "and", hyphens
 * between words and punctuation around words are ignored. Words, numbers and symbols that are
 * part of a term (C++, C#, Node.js, 3.5, 40%, $2M) are kept.
 */
export function normalizeForCompare(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201a\u201b\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201e\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/(\p{L})-(?=\p{L})/gu, "$1 ")
    .split(/\s+/)
    .map((t) => (t === "&" ? "and" : t.replace(/^[^\p{L}\p{N}+#$.@]+|[^\p{L}\p{N}+#%]+$/gu, "")))
    .filter(Boolean)
    .join(" ");
}

const FILLER = new Set(["a", "an", "the", "and", "or", "of", "to", "for", "in", "on", "at", "by", "with", "from", "as", "into", "via", "using", "that", "which", "its", "their", "our", "my"]);

function contentTokens(text: string): string[] {
  const norm = normalizeForCompare(text);
  return norm ? norm.split(" ").filter((t) => !FILLER.has(t)) : [];
}

function multisetMinus(a: string[], b: string[]): string[] {
  const left = new Map<string, number>();
  for (const t of b) left.set(t, (left.get(t) ?? 0) + 1);
  const out: string[] = [];
  for (const t of a) {
    const n = left.get(t) ?? 0;
    if (n > 0) left.set(t, n - 1);
    else out.push(t);
  }
  return out;
}

export type TextComparison = {
  /** "cosmetic": only filler words, word order or a single non-technical word differ. */
  kind: "unchanged" | "cosmetic" | "rewritten";
  added: string[];
  removed: string[];
};

/** How a line changed, judged on its content rather than its characters. */
export function compareText(before: string, after: string): TextComparison {
  if (normalizeForCompare(before) === normalizeForCompare(after)) return { kind: "unchanged", added: [], removed: [] };
  const a = contentTokens(before);
  const b = contentTokens(after);
  const added = multisetMinus(b, a);
  const removed = multisetMinus(a, b);
  if (!added.length && !removed.length) return { kind: "cosmetic", added, removed };
  // Swapping one plain word ("Created" → "Developed") is not a rewrite; adding a skill term is.
  if (a.length && added.length <= 1 && removed.length <= 1 && !added.some((t) => isKnownSkill(t) || /\d/.test(t))) {
    return { kind: "cosmetic", added, removed };
  }
  return { kind: "rewritten", added, removed };
}

export function isMeaningfulRewrite(before: string, after: string): boolean {
  return compareText(before, after).kind === "rewritten";
}

/** Word overlap of two lines (0–1), used to pair a rewritten line with its source. */
export function similarity(a: string, b: string): number {
  const x = new Set(contentTokens(a));
  const y = new Set(contentTokens(b));
  if (!x.size && !y.size) return 1;
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return (2 * shared) / (x.size + y.size);
}

/* ------------------------------------------------------------------ */

export type DiffContext = {
  /** Valid rewrites (before → after) and why they were made; used for pairing lines and for reasons only. */
  rewrites?: { before: string; after: string; reason: string }[];
  /** Why a line or entry no longer appears, keyed by the compare form of its text (entries: "entry:" + label). */
  removals?: Map<string, string>;
  /** Why a line or skill now appears, keyed by its compare form. */
  additions?: Map<string, string>;
  /** Why content was reordered, keyed by section label. */
  reorders?: Map<string, string>;
  /** Whether a line is relevant to the job (for the "no change needed" reason). */
  relevant?: (text: string) => boolean;
};

type Pair = { from: number; to: number };

/**
 * Pair original lines with final lines: identical text first, then a line with its validated
 * rewrite, then the most similar remaining line.
 */
function alignLines(before: string[], after: string[], ctx: DiffContext): { pairs: Pair[]; removed: number[]; added: number[] } {
  const usedA = new Set<number>();
  const usedB = new Set<number>();
  const pairs: Pair[] = [];
  const link = (from: number, to: number) => {
    usedA.add(from);
    usedB.add(to);
    pairs.push({ from, to });
  };
  const nb = before.map(normalizeForCompare);
  const na = after.map(normalizeForCompare);
  na.forEach((t, to) => {
    const from = nb.findIndex((s, i) => !usedA.has(i) && s === t);
    if (from >= 0) link(from, to);
  });
  for (const rw of ctx.rewrites ?? []) {
    const to = na.findIndex((t, i) => !usedB.has(i) && t === normalizeForCompare(rw.after));
    const from = nb.findIndex((s, i) => !usedA.has(i) && s === normalizeForCompare(rw.before));
    if (to >= 0 && from >= 0) link(from, to);
  }
  const candidates: { from: number; to: number; s: number }[] = [];
  before.forEach((b, from) => {
    if (usedA.has(from)) return;
    after.forEach((a, to) => {
      if (!usedB.has(to)) candidates.push({ from, to, s: similarity(b, a) });
    });
  });
  for (const c of candidates.sort((x, y) => y.s - x.s)) {
    if (c.s < 0.3) break;
    if (!usedA.has(c.from) && !usedB.has(c.to)) link(c.from, c.to);
  }
  return {
    pairs: pairs.sort((x, y) => x.to - y.to),
    removed: before.map((_, i) => i).filter((i) => !usedA.has(i)),
    added: after.map((_, i) => i).filter((i) => !usedB.has(i)),
  };
}

function reasonFor(ctx: DiffContext, before: string, after: string): string {
  const rw = (ctx.rewrites ?? []).find((r) => normalizeForCompare(r.after) === normalizeForCompare(after) && normalizeForCompare(r.before) === normalizeForCompare(before));
  return rw?.reason || "Reworded to match the job description more closely.";
}

function isIncreasing(xs: number[]) {
  return xs.every((x, i) => i === 0 || x > xs[i - 1]!);
}

/** Line-by-line changes for one list of lines (an entry's bullets, achievements). */
function diffLines(section: string, before: string[], after: string[], ctx: DiffContext, out: TailorChange[]): boolean {
  const { pairs, removed, added } = alignLines(before, after, ctx);
  let changed = false;
  for (const { from, to } of pairs) {
    const b = before[from]!;
    const a = after[to]!;
    if (compareText(b, a).kind === "rewritten") {
      out.push({ kind: "rewritten", section, before: b, after: a, reason: reasonFor(ctx, b, a) });
      changed = true;
    }
  }
  for (const i of removed) {
    out.push({ kind: "removed", section, before: before[i]!, after: "", reason: ctx.removals?.get(normalizeForCompare(before[i]!)) || "Removed." });
    changed = true;
  }
  for (const i of added) {
    out.push({ kind: "added", section, before: "", after: after[i]!, reason: ctx.additions?.get(normalizeForCompare(after[i]!)) || "Added." });
    changed = true;
  }
  if (!isIncreasing(pairs.map((p) => p.from))) {
    out.push({ kind: "reordered", section, before: "", after: "", reason: ctx.reorders?.get(section) || "Most job-relevant bullets moved to the top." });
    changed = true;
  }
  return changed;
}

type AnyEntry = { kind: "experience" | "internships"; entry: ResumeEntry } | { kind: "projects"; entry: ResumeProject };

export function entryLabel(e: AnyEntry): string {
  if (e.kind === "projects") return `Projects · ${e.entry.name || "Untitled project"}`;
  const where = [e.entry.title, e.entry.organization].filter(Boolean).join(", ");
  return `${e.kind === "experience" ? "Experience" : "Internship"} · ${where || "Untitled"}`;
}

function entryKey(e: AnyEntry): string {
  if (e.kind === "projects") return `p|${normalizeForCompare(e.entry.name)}`;
  return `e|${normalizeForCompare(e.entry.organization)}|${normalizeForCompare(e.entry.title)}|${normalizeForCompare(e.entry.dates)}`;
}

function entriesOf(r: StructuredResume, projects: boolean): AnyEntry[] {
  if (projects) return r.projects.map((entry) => ({ kind: "projects" as const, entry }));
  return [
    ...r.experience.map((entry) => ({ kind: "experience" as const, entry })),
    ...r.internships.map((entry) => ({ kind: "internships" as const, entry })),
  ];
}

function diffEntries(original: StructuredResume, final: StructuredResume, projects: boolean, ctx: DiffContext, out: TailorChange[]) {
  const before = entriesOf(original, projects);
  const after = entriesOf(final, projects);
  const used = new Set<number>();
  const order: number[] = [];
  for (const a of after) {
    const key = entryKey(a);
    let from = before.findIndex((b, i) => !used.has(i) && b.kind === a.kind && entryKey(b) === key);
    if (from < 0) from = before.findIndex((b, i) => !used.has(i) && entryKey(b) === key);
    const label = entryLabel(a);
    if (from < 0) {
      out.push({ kind: "added", section: label, before: "", after: a.entry.bullets.join("\n"), reason: ctx.additions?.get(`entry:${label}`) || "Added." });
      continue;
    }
    used.add(from);
    order.push(from);
    const b = before[from]!;
    const changed = diffLines(label, b.entry.bullets, a.entry.bullets, ctx, out);
    if (!changed) {
      const relevant = ctx.relevant ? [...a.entry.bullets, projects ? (a.entry as ResumeProject).tech : ""].some((t) => t && ctx.relevant!(t)) : false;
      out.push({
        kind: "unchanged",
        section: label,
        before: "",
        after: "",
        reason: relevant ? "Already relevant to the target role. No change needed." : "No change needed.",
      });
    }
  }
  before.forEach((b, i) => {
    if (used.has(i)) return;
    const label = entryLabel(b);
    out.push({ kind: "removed", section: label, before: b.entry.bullets.join("\n"), after: "", reason: ctx.removals?.get(`entry:${label}`) || "Removed." });
  });
  if (projects && !isIncreasing(order)) {
    out.push({
      kind: "reordered",
      section: "Projects",
      before: original.projects.map((p) => p.name).join(" → "),
      after: final.projects.map((p) => p.name).join(" → "),
      reason: ctx.reorders?.get("Projects") || "Projects ordered by relevance to the job.",
    });
  }
}

function skillKeys(r: StructuredResume): string[] {
  return r.skills.flatMap((g) => g.items.map((s) => canonicalSkill(s)));
}

/**
 * The change log, computed only from the original and final resume objects. Every "rewritten"
 * item has text that differs in content; moved content is "reordered"; the rest is "unchanged".
 */
export function diffResume(original: StructuredResume, final: StructuredResume, ctx: DiffContext = {}): TailorChange[] {
  const out: TailorChange[] = [];

  for (const [field, section] of [
    ["headline", "Headline"],
    ["summary", "Professional Summary"],
  ] as const) {
    const b = original[field];
    const a = final[field];
    if (!b && !a) continue;
    if (!b) out.push({ kind: "added", section, before: "", after: a, reason: reasonFor(ctx, b, a) });
    else if (!a) out.push({ kind: "removed", section, before: b, after: "", reason: "Removed." });
    else if (compareText(b, a).kind === "rewritten") out.push({ kind: "rewritten", section, before: b, after: a, reason: reasonFor(ctx, b, a) });
    else if (field === "summary") out.push({ kind: "unchanged", section, before: "", after: "", reason: "No change needed." });
  }

  const beforeSkills = skillKeys(original);
  const afterSkills = skillKeys(final);
  const addedSkills = final.skills.flatMap((g) => g.items).filter((s) => !beforeSkills.includes(canonicalSkill(s)));
  const removedSkills = original.skills.flatMap((g) => g.items).filter((s) => !afterSkills.includes(canonicalSkill(s)));
  if (addedSkills.length) {
    const reasons = [...new Set(addedSkills.map((s) => ctx.additions?.get(normalizeForCompare(s))).filter(Boolean))];
    out.push({ kind: "added", section: "Skills", before: "", after: addedSkills.join(", "), reason: reasons.join(" ") || "Added." });
  }
  if (removedSkills.length) out.push({ kind: "removed", section: "Skills", before: removedSkills.join(", "), after: "", reason: "Removed." });
  const layoutOf = (r: StructuredResume) => r.skills.map((g) => `${normalizeForCompare(g.label)}:${g.items.map(canonicalSkill).join(",")}`).join("|");
  const kept = (r: StructuredResume) =>
    layoutOf({ ...r, skills: r.skills.map((g) => ({ ...g, items: g.items.filter((s) => beforeSkills.includes(canonicalSkill(s)) && afterSkills.includes(canonicalSkill(s))) })) });
  if (kept(original) !== kept(final)) {
    const lead = (r: StructuredResume) => {
      const items = r.skills.flatMap((g) => g.items);
      return items.slice(0, 5).join(", ") + (items.length > 5 ? ", …" : "");
    };
    out.push({
      kind: "reordered",
      section: "Skills",
      before: lead(original),
      after: lead(final),
      reason: ctx.reorders?.get("Skills") || "Job-relevant skills listed first.",
    });
  }
  if (!addedSkills.length && !removedSkills.length && kept(original) === kept(final) && final.skills.length) {
    out.push({ kind: "unchanged", section: "Skills", before: "", after: "", reason: "No change needed." });
  }

  diffEntries(original, final, false, ctx, out);
  diffEntries(original, final, true, ctx, out);
  if (original.achievements.length || final.achievements.length) {
    if (!diffLines("Achievements", original.achievements, final.achievements, ctx, out)) {
      out.push({ kind: "unchanged", section: "Achievements", before: "", after: "", reason: "No change needed." });
    }
  }

  if (Boolean(original.projectsFirst) !== Boolean(final.projectsFirst)) {
    const first = final.projectsFirst ? "Projects → Experience" : "Experience → Projects";
    out.push({
      kind: "reordered",
      section: "Section order",
      before: final.projectsFirst ? "Experience → Projects" : "Projects → Experience",
      after: first,
      reason: ctx.reorders?.get("Section order") || "Sections reordered.",
    });
  }
  return out;
}

export type ChangeCounts = Record<TailorChange["kind"], number> & {
  /** Content really changed: a line was rewritten or supported content was added. */
  improved: boolean;
};

export function countChanges(changes: TailorChange[]): ChangeCounts {
  const n = { rewritten: 0, added: 0, removed: 0, reordered: 0, unchanged: 0 };
  for (const c of changes) n[c.kind]++;
  return { ...n, improved: n.rewritten + n.added > 0 };
}
