import { entryLabel, normalizeForCompare, similarity } from "./diff";
import { dedupeLines } from "./match";
import type { ResumeEntry, ResumeProject, StructuredResume } from "./types";

export type DuplicateVerdict = { kind: "duplicate" | "review"; reason: string };

export type DuplicateMerge = { kept: string; removed: string; reason: string; addedBullets: string[] };
export type DuplicateReview = { first: string; second: string; reason: string };

const ORG_NOISE = /\b(inc|llc|llp|ltd|limited|pvt|private|corp|corporation|co|company|plc|gmbh)\b/g;
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

const words = (s: string) => s.replace(/[^\p{L}\p{N}+# ]/gu, " ").replace(/\s+/g, " ").trim();

export function normOrg(s: string) {
  return words(normalizeForCompare(s).replace(ORG_NOISE, " "));
}

export function normTitle(s: string) {
  return words(normalizeForCompare(s).replace(/\binternship\b/g, "intern").replace(/\bsr\b/g, "senior").replace(/\bjr\b/g, "junior"));
}

/** "May 2025 – Jul 2025", "05/2025 - 07/2025" and "May 2025 to July 2025" all become "5 2025 7 2025". */
export function normDates(s: string) {
  const t = normalizeForCompare(s).replace(/\b(current|now|ongoing|till date|to date)\b/g, "present");
  const out: string[] = [];
  for (const m of t.matchAll(/\b(\d{1,2})\/((?:19|20)\d{2})\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b((?:19|20)\d{2})\b|\bpresent\b/g)) {
    if (m[1]) out.push(String(Number(m[1])), m[2]!);
    else if (m[3]) out.push(String(MONTHS[m[3]]));
    else if (m[4]) out.push(m[4]);
    else out.push("present");
  }
  return out.join(" ");
}

function sameOrg(a: string, b: string) {
  const x = normOrg(a);
  const y = normOrg(b);
  if (!x || !y) return false;
  return x === y || (Math.min(x.length, y.length) >= 4 && (x.startsWith(y + " ") || y.startsWith(x + " ")));
}

/** Exact after normalization: "Software Engineer" and "Senior Software Engineer" are different roles. */
function sameTitle(a: string, b: string) {
  const x = normTitle(a);
  const y = normTitle(b);
  return Boolean(x) && x === y;
}

/** Description overlap; null when one side has no description to compare. */
function descriptionSimilarity(a: string[], b: string[]): number | null {
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return null;
  return similarity(a.join(" "), b.join(" "));
}

/**
 * Whether two roles are the same real experience. Same organization and title is required;
 * dates and descriptions then decide. Anything uncertain is left for the user to review.
 */
export function compareEntries(a: ResumeEntry, b: ResumeEntry): DuplicateVerdict | null {
  if (!sameOrg(a.organization, b.organization)) return null;
  const da = normDates(a.dates);
  const db = normDates(b.dates);
  const dates = da && db ? (da === db ? "same" : "different") : "unknown";
  const desc = descriptionSimilarity(a.bullets, b.bullets);
  if (sameTitle(a.title, b.title)) {
    if (dates === "same") {
      if (desc == null || desc >= 0.5) return { kind: "duplicate", reason: "Same organization, title and dates." };
      return { kind: "review", reason: "Same organization, title and dates, but different descriptions. Check whether this is one role listed twice." };
    }
    if (dates === "unknown") {
      if (desc != null && desc >= 0.6) return { kind: "duplicate", reason: "Same organization, title and description; one entry has no dates." };
      return { kind: "review", reason: "Same organization and title, but missing dates make it unclear whether these are separate roles." };
    }
    if (desc != null && desc >= 0.85) {
      return { kind: "review", reason: "Same organization, title and description, but different dates. Check whether the dates are correct." };
    }
    return null;
  }
  if (dates === "same" && desc != null && desc >= 0.85) {
    return { kind: "review", reason: "Different titles at the same organization with the same dates and description." };
  }
  return null;
}

export function compareProjects(a: ResumeProject, b: ResumeProject): DuplicateVerdict | null {
  const na = normTitle(a.name);
  const nb = normTitle(b.name);
  const desc = descriptionSimilarity(a.bullets, b.bullets);
  if (na && na === nb) {
    if (desc == null || desc >= 0.5) return { kind: "duplicate", reason: "Same project name and description." };
    return { kind: "review", reason: "Same project name with different descriptions. Check whether this is one project listed twice." };
  }
  if (desc != null && desc >= 0.9 && a.bullets.length && b.bullets.length) {
    return { kind: "review", reason: "Different project names with the same description." };
  }
  return null;
}

type Slot = { list: "experience" | "internships"; index: number; entry: ResumeEntry };

const isIntern = (e: ResumeEntry) => /\bintern(ship)?\b/i.test(e.title);

/** Which copy to keep: the internship list for intern roles, then the copy with dates, then more detail. */
function pickKeeper(x: Slot, y: Slot): [Slot, Slot] {
  const rank = (s: Slot) => (s.list === "internships" && isIntern(s.entry) ? 4 : 0) + (normDates(s.entry.dates) ? 2 : 0) + (s.entry.bullets.length ? 1 : 0);
  return rank(y) > rank(x) ? [y, x] : [x, y];
}

function mergeInto<T extends { bullets: string[] }>(keep: T, drop: T): string[] {
  const merged = dedupeLines([...keep.bullets, ...drop.bullets]);
  const added = merged.slice(keep.bullets.length);
  keep.bullets = merged;
  return added;
}

/**
 * Merge records that are the same real experience or project; flag uncertain pairs for review.
 * Returns a new resume; the input is not modified.
 */
export function mergeDuplicates(resume: StructuredResume): { resume: StructuredResume; merged: DuplicateMerge[]; review: DuplicateReview[] } {
  const next = JSON.parse(JSON.stringify(resume)) as StructuredResume;
  const merged: DuplicateMerge[] = [];
  const review: DuplicateReview[] = [];
  const label = (s: Slot) => entryLabel({ kind: s.list, entry: s.entry });

  const slots: Slot[] = [
    ...next.experience.map((entry, index) => ({ list: "experience" as const, index, entry })),
    ...next.internships.map((entry, index) => ({ list: "internships" as const, index, entry })),
  ];
  const dropped = new Set<Slot>();
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const x = slots[i]!;
      const y = slots[j]!;
      if (dropped.has(x) || dropped.has(y)) continue;
      const v = compareEntries(x.entry, y.entry);
      if (!v) continue;
      if (v.kind === "review") {
        review.push({ first: label(x), second: label(y), reason: v.reason });
        continue;
      }
      const [keep, drop] = pickKeeper(x, y);
      if (!keep.entry.dates) keep.entry.dates = drop.entry.dates;
      if (!keep.entry.location) keep.entry.location = drop.entry.location;
      const addedBullets = mergeInto(keep.entry, drop.entry);
      dropped.add(drop);
      merged.push({ kept: label(keep), removed: label(drop), reason: v.reason, addedBullets });
    }
  }
  next.experience = slots.filter((s) => s.list === "experience" && !dropped.has(s)).map((s) => s.entry);
  next.internships = slots.filter((s) => s.list === "internships" && !dropped.has(s)).map((s) => s.entry);

  const gone = new Set<number>();
  for (let i = 0; i < next.projects.length; i++) {
    for (let j = i + 1; j < next.projects.length; j++) {
      if (gone.has(i) || gone.has(j)) continue;
      const a = next.projects[i]!;
      const b = next.projects[j]!;
      const v = compareProjects(a, b);
      if (!v) continue;
      const la = entryLabel({ kind: "projects", entry: a });
      const lb = entryLabel({ kind: "projects", entry: b });
      if (v.kind === "review") {
        review.push({ first: la, second: lb, reason: v.reason });
        continue;
      }
      if (!a.tech) a.tech = b.tech;
      if (!a.dates) a.dates = b.dates;
      if (!a.link) a.link = b.link;
      const addedBullets = mergeInto(a, b);
      gone.add(j);
      merged.push({ kept: la, removed: lb, reason: v.reason, addedBullets });
    }
  }
  next.projects = next.projects.filter((_, i) => !gone.has(i));
  return { resume: next, merged, review };
}

/** Pairs that are certainly the same record (for validating a final resume). */
export function remainingDuplicates(resume: StructuredResume): string[] {
  return mergeDuplicates(resume).merged.map((m) => `${m.removed} duplicates ${m.kept}`);
}
