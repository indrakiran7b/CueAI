/**
 * Adaptive page fitting. One page is the target for concise resumes; two pages are used when
 * the content cannot fit one page legibly. Spacing is tightened before text size, text never
 * drops below 9.4 pt, and content is never dropped to force a page count.
 */
import { experienceYears } from "./match";
import { MAX_DENSITY, layoutResume, type Measurer, type ResumeLayout } from "./layout";
import type { StructuredResume } from "./types";

export type LayoutValidation = {
  ok: boolean;
  pageCount: number;
  /** Share of the last page's content area that is used (0–1). */
  lastPageFill: number;
  issues: string[];
  warnings: string[];
};

export type FitResult = {
  layout: ResumeLayout;
  pageCount: number;
  /** The page count the fitter aimed for. */
  target: number;
  concise: boolean;
  reason: string;
  validation: LayoutValidation;
};

const ASCENT = 0.78;
const DESCENT = 0.22;

/** Freshers and candidates with limited experience should get one page whenever it is legible. */
export function isConcise(r: StructuredResume): boolean {
  return experienceYears(r) < 3 && r.experience.length <= 2;
}

function textOps(page: ResumeLayout["pages"][number]) {
  return page.ops.filter((o) => o.kind === "text" && o.text.trim()) as Extract<ResumeLayout["pages"][number]["ops"][number], { kind: "text" }>[];
}

export function lastPageFill(layout: ResumeLayout): number {
  const page = layout.pages[layout.pages.length - 1];
  if (!page) return 0;
  const m = layout.style.margin;
  const area = layout.height - m.top - m.bottom;
  const bottom = Math.max(m.top, ...page.ops.map((o) => (o.kind === "text" ? o.y + o.size * DESCENT : o.y)));
  return Math.max(0, Math.min(1, (bottom - m.top) / area));
}

/** Checks the rendered layout for overflow, clipping, overlaps, orphaned headings and empty pages. */
export function validateLayout(layout: ResumeLayout): LayoutValidation {
  const issues: string[] = [];
  const warnings: string[] = [];
  const m = layout.style.margin;
  const tol = 0.75;
  layout.pages.forEach((page, p) => {
    const ops = textOps(page);
    if (!ops.length) issues.push(`Page ${p + 1} is empty.`);
    for (const o of ops) {
      const top = o.y - o.size * ASCENT;
      const bottom = o.y + o.size * DESCENT;
      if (o.x < m.left - tol || o.x + o.width > layout.width - m.right + tol) {
        issues.push(`Page ${p + 1}: text runs past the side margin (“${o.text.slice(0, 30)}”).`);
      }
      if (top < m.top - tol - 2 || bottom > layout.height - m.bottom + tol) {
        issues.push(`Page ${p + 1}: text is clipped at the page edge (“${o.text.slice(0, 30)}”).`);
      }
    }
    const sorted = [...ops].sort((a, b) => a.y - b.y || a.x - b.x);
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i]!;
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j]!;
        const aBottom = a.y + a.size * DESCENT;
        const bTop = b.y - b.size * ASCENT;
        if (bTop >= aBottom - 0.5) break;
        const vertical = Math.min(aBottom, b.y + b.size * DESCENT) - Math.max(a.y - a.size * ASCENT, bTop);
        const horizontal = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const sameLine = Math.abs(a.y - b.y) < 0.5;
        if (horizontal > 0.5 && (sameLine || vertical > 1.5)) {
          issues.push(`Page ${p + 1}: overlapping text (“${a.text.slice(0, 20)}” / “${b.text.slice(0, 20)}”).`);
          break;
        }
      }
    }
  });
  layout.blocks.forEach((b, i) => {
    const next = layout.blocks[i + 1];
    if (b.kind === "heading" && (!next || next.page !== b.page)) {
      issues.push(`“${b.runs.map((r) => r.text).join("")}” heading is separated from its content.`);
    }
  });
  const fill = lastPageFill(layout);
  if (layout.pages.length > 1 && fill < 0.12) warnings.push("The last page is almost empty.");
  if (layout.pages.length > 2) warnings.push("The resume runs past two pages; consider trimming older or less relevant content.");
  return { ok: issues.length === 0, pageCount: layout.pages.length, lastPageFill: fill, issues: [...new Set(issues)].slice(0, 12), warnings };
}

export function fitResume(resume: StructuredResume, templateId: string, m: Measurer): FitResult {
  const concise = isConcise(resume);
  const at = (d: number) => layoutResume(resume, templateId, m, d);
  const done = (layout: ResumeLayout, target: number, reason: string): FitResult => ({
    layout,
    pageCount: layout.pages.length,
    target,
    concise,
    reason,
    validation: validateLayout(layout),
  });

  const base = at(0);
  if (base.pages.length === 1) return done(base, 1, "Fits on one page at the template's standard spacing.");

  // One page: tighten spacing first; concise resumes may also use slightly smaller (still ≥ 9.4 pt) text.
  const maxOnePage = concise ? MAX_DENSITY : 2;
  for (let d = 1; d <= maxOnePage; d++) {
    const l = at(d);
    if (l.pages.length === 1) {
      return done(l, 1, d >= 3 ? `Fitted to one page with tighter spacing and ${l.style.body.size} pt text.` : "Fitted to one page with tighter spacing.");
    }
  }

  // More than one page: keep standard spacing unless that leaves a nearly empty last page.
  let chosen = base;
  if (lastPageFill(base) < 0.25) {
    for (let d = 1; d <= 2; d++) {
      const l = at(d);
      if (l.pages.length < base.pages.length) {
        chosen = l;
        break;
      }
    }
  }
  const target = Math.max(2, chosen.pages.length);
  const reason = concise
    ? "This content cannot fit one page legibly, so it uses two pages instead of shrinking the text."
    : "Your relevant experience needs two pages to stay readable.";
  return done(chosen, target, chosen === base ? reason : `${reason} Spacing was tightened to avoid a nearly empty last page.`);
}
