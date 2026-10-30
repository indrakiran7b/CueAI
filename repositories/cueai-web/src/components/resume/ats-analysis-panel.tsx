"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  AtsCheck,
  MatchReport,
  Recommendation,
  RequirementCategory,
  RequirementMatch,
  RequirementPriority,
  RequirementStatus,
  TailorChange,
} from "@/lib/resume/types";

export type PanelBusy = "analyze" | "tailor" | "rescore" | null;

export const CATEGORY_TITLES: Record<RequirementCategory, string> = {
  technical: "Technical skill",
  tools: "Tool",
  domain: "Domain",
  responsibility: "Responsibility",
  qualification: "Qualification",
};

export const STATUS_LABEL: Record<RequirementStatus, string> = {
  demonstrated: "Demonstrated",
  partial: "Partly shown",
  missing: "Missing",
  unclear: "Unclear",
};

const PRIORITY_RANK: Record<RequirementPriority, number> = { high: 3, medium: 2, low: 1 };
const STATUS_RANK: Record<RequirementStatus, number> = { missing: 0, unclear: 0, partial: 1, demonstrated: 2 };
const SKILL_CATEGORIES: RequirementCategory[] = ["technical", "tools", "domain"];

export const MAX_SKILL_CHIPS = 5;
export const MAX_RECOMMENDATIONS = 3;

/** What the compact summary shows, all taken from the calculated report. */
export function summarizeMatch(report: MatchReport, recommendations: Recommendation[]) {
  const skills = report.matches.filter((m) => SKILL_CATEGORIES.includes(m.category));
  const byPriority = (a: RequirementMatch, b: RequirementMatch) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
  const missing = skills.filter((m) => m.status === "missing").sort(byPriority);
  const partial = skills.filter((m) => m.status === "partial").sort(byPriority);
  const top = [...recommendations].sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]).slice(0, MAX_RECOMMENDATIONS);
  return {
    score: report.score,
    matched: skills.filter((m) => m.status === "demonstrated").length,
    total: skills.length,
    toReview: [...missing, ...partial].slice(0, MAX_SKILL_CHIPS).map((m) => ({ name: m.name, status: m.status })),
    topRecommendations: top,
  };
}

export function matchLabel(score: number): { text: string; tone: "good" | "fair" | "low" } {
  if (score >= 75) return { text: "Good match", tone: "good" };
  if (score >= 55) return { text: "Fair match", tone: "fair" };
  return { text: "Needs improvement", tone: "low" };
}

const TONE = {
  good: { text: "text-emerald-300", bar: "bg-emerald-400" },
  fair: { text: "text-amber-300", bar: "bg-amber-400" },
  low: { text: "text-red-300", bar: "bg-red-400" },
};

export type MatchSummaryProps = {
  report: MatchReport;
  /** The original upload's report, for the "updated from" line once content has changed. */
  originalReport: MatchReport | null;
  recommendations: Recommendation[];
  scoreSource: "original" | "tailored" | "reanalyzed";
  /** Why the shown score may be out of date. */
  outdated: "inputs" | "edited" | null;
  /** Content changes the tailoring made (rewritten or added), once tailored. */
  improvements?: number | null;
  /** The one primary action for this stage. */
  action?: ReactNode;
  children?: ReactNode;
};

export function MatchSummary(p: MatchSummaryProps) {
  const s = summarizeMatch(p.report, p.recommendations);
  const compare = p.originalReport && p.scoreSource !== "original" && p.originalReport.score != null ? p.originalReport : null;
  const label = s.score == null ? null : matchLabel(s.score);
  return (
    <section aria-label="Resume match" className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-muted">Resume match</h2>
          {s.score == null || !label ? (
            <p role="status" className="mt-1 text-sm text-amber-200">
              Not scored — the job description is too short to compare against.
            </p>
          ) : (
            <div className={cn("transition-opacity", p.outdated === "inputs" && "opacity-60")}>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-semibold tabular-nums">{s.score}</span>
                <span className="text-sm text-subtle">/100</span>
                <span className={cn("ml-1 text-sm font-medium", TONE[label.tone].text)}>{label.text}</span>
              </p>
              <div className="mt-2 h-1.5 w-48 max-w-full overflow-hidden rounded-full bg-[var(--surface-hover)]" aria-hidden>
                <div className={cn("h-full rounded-full", TONE[label.tone].bar)} style={{ width: `${s.score}%` }} />
              </div>
              {compare && (
                <p className="mt-2 text-xs text-subtle">
                  Updated from {compare.score}
                  {p.improvements != null && ` · ${p.improvements} improvement${p.improvements === 1 ? "" : "s"} made`}
                </p>
              )}
            </div>
          )}
        </div>
        {p.action}
      </div>

      {s.score != null && (
        <div className="mt-5 grid gap-5 border-t border-[var(--border)] pt-4 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold">Skills to improve</h3>
            {s.toReview.length ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {s.toReview.map((m) => (
                  <li
                    key={m.name}
                    title={m.status === "missing" ? "Not shown in your resume" : "Only partly shown in your resume"}
                    className={cn("rounded-full px-2.5 py-0.5 text-xs", m.status === "missing" ? "bg-[var(--surface-hover)]" : "bg-[var(--surface-hover)]/60 text-muted")}
                  >
                    {m.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-subtle">Your resume shows every skill this job asks for.</p>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold">Recommended improvements</h3>
            {s.topRecommendations.length ? (
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {s.topRecommendations.map((r) => (
                  <li key={r.id} className="flex gap-2">
                    <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
                    {r.title}.
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-subtle">No major improvements needed for this job.</p>
            )}
          </div>
        </div>
      )}

      {p.outdated === "inputs" && <p className="mt-3 text-xs text-amber-300">Your resume or job description changed. Analyze again to update this match.</p>}
      {p.outdated === "edited" && <p className="mt-3 text-xs text-amber-300">You edited the resume. Re-check the score to include your changes.</p>}
      {p.children}
    </section>
  );
}

/* ------------------------------------------------------------------ */

const pct = (v: number | null | undefined) => (v == null ? "n/a" : `${v}%`);

function requiredCount(r: MatchReport) {
  const list = r.matches.filter((m) => m.category !== "responsibility");
  return `${list.filter((m) => m.status === "demonstrated").length} of ${list.length}`;
}

const experienceOf = (r: MatchReport) => r.categories.find((x) => x.key === "experience")?.score ?? null;

/** Original vs. current, both scored by the same algorithm, with what moved and what is still missing. */
export function ScoreComparison({ before, after, label }: { before: MatchReport; after: MatchReport; label: string }) {
  const rows: [string, string, string][] = [
    ["ATS match", String(before.score ?? "n/a"), String(after.score ?? "n/a")],
    ["Keyword alignment", pct(before.keywordAlignment), pct(after.keywordAlignment)],
    ["Skills match", pct(before.skillsMatch), pct(after.skillsMatch)],
    ["Requirements demonstrated", requiredCount(before), requiredCount(after)],
    ["Experience relevance", pct(experienceOf(before)), pct(experienceOf(after))],
  ];
  const improved = after.matches
    .map((m) => ({ m, was: before.matches.find((b) => b.requirementId === m.requirementId) }))
    .filter(({ m, was }) => was && STATUS_RANK[m.status] > STATUS_RANK[was.status]);
  return (
    <div className="space-y-2">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-subtle">
          <tr>
            <th className="py-1 pr-2 font-medium" />
            <th className="py-1 pr-2 font-medium">Original</th>
            <th className="py-1 font-medium">{label}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, a, b]) => (
            <tr key={name} className="border-t border-[var(--border)]">
              <td className="py-1.5 pr-2 text-muted">{name}</td>
              <td className="py-1.5 pr-2 tabular-nums">{a}</td>
              <td className="py-1.5 tabular-nums font-medium">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {improved.length > 0 ? (
        <p className="text-xs text-muted">
          Improved:{" "}
          {improved
            .slice(0, 8)
            .map(({ m, was }) => `${m.name} (${STATUS_LABEL[was!.status].toLowerCase()} → ${STATUS_LABEL[m.status].toLowerCase()})`)
            .join(", ")}
          .
        </p>
      ) : (
        <p className="text-xs text-subtle">
          No requirement changed status. The tailored version presents the same evidence more clearly; the estimate only rises when your resume really shows more of
          what the job asks for.
        </p>
      )}
    </div>
  );
}

function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 border-t border-[var(--border)] pt-4 first:border-0 first:pt-0">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function RequirementList({ items, why }: { items: RequirementMatch[]; why: Map<string, string> }) {
  return (
    <ul className="space-y-2">
      {items.map((m) => (
        <li key={m.requirementId} className="text-sm">
          <span className="font-medium">{m.name}</span>
          <span className="ml-1.5 text-xs text-subtle">
            {CATEGORY_TITLES[m.category]}
            {m.priority === "high" ? " · high priority" : ""}
          </span>
          <p className="text-xs text-muted">{m.status === "missing" ? why.get(m.requirementId) || m.note : m.note}</p>
          {m.status !== "missing" && m.evidence && <p className="mt-0.5 line-clamp-2 text-xs italic text-subtle">“{m.evidence}”</p>}
        </li>
      ))}
    </ul>
  );
}

const CHANGE_LABEL: Record<TailorChange["kind"], string> = {
  rewritten: "Rewritten",
  added: "Added",
  removed: "Removed",
  reordered: "Reordered",
  unchanged: "Unchanged",
};

/** One-line count of the change log, e.g. "3 rewritten · 1 added · 2 reordered · 4 unchanged". */
export function changeSummary(changes: TailorChange[]): string {
  return (["rewritten", "added", "removed", "reordered", "unchanged"] as const)
    .map((k) => [k, changes.filter((c) => c.kind === k).length] as const)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${CHANGE_LABEL[k].toLowerCase()}`)
    .join(" · ");
}

function ChangeItem({ c }: { c: TailorChange }) {
  return (
    <li className="text-sm" data-kind={c.kind}>
      <p>
        <span className="font-medium">{c.section}</span>
        <span className="text-subtle"> — {CHANGE_LABEL[c.kind]}</span>
      </p>
      {c.kind === "rewritten" && (
        <dl className="mt-1 space-y-0.5 text-xs">
          <div>
            <dt className="inline text-subtle">Original: </dt>
            <dd className="inline text-muted">{c.before}</dd>
          </div>
          <div>
            <dt className="inline text-subtle">Updated: </dt>
            <dd className="inline text-foreground">{c.after}</dd>
          </div>
        </dl>
      )}
      {c.kind === "added" && <p className="mt-1 text-xs text-foreground">Added: {c.after}</p>}
      {c.kind === "removed" && <p className="mt-1 text-xs text-muted">Removed: {c.before}</p>}
      {c.kind === "reordered" && c.before && c.after && c.before !== c.after && (
        <p className="mt-1 text-xs text-muted">
          Order: {c.before} <span aria-hidden>→</span> {c.after}
        </p>
      )}
      {c.reason && (
        <p className="mt-0.5 text-xs text-subtle">
          {c.kind === "rewritten" ? "Why: " : "Reason: "}
          {c.reason}
        </p>
      )}
    </li>
  );
}

/** The change log, computed from the original and final resume; unchanged items are listed honestly. */
export function ChangeLog({ changes }: { changes: TailorChange[] }) {
  const changed = changes.filter((c) => c.kind !== "unchanged");
  const unchanged = changes.filter((c) => c.kind === "unchanged");
  return (
    <Section title="What tailoring changed">
      <p className="mb-2 text-xs text-subtle">{changeSummary(changes)}</p>
      {changed.length ? (
        <ul className="space-y-3">
          {changed.map((c, i) => (
            <ChangeItem key={i} c={c} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No content was changed.</p>
      )}
      {unchanged.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-subtle">Unchanged ({unchanged.length})</summary>
          <ul className="mt-2 space-y-2">
            {unchanged.map((c, i) => (
              <ChangeItem key={i} c={c} />
            ))}
          </ul>
        </details>
      )}
    </Section>
  );
}

export type FullAnalysisProps = {
  open: boolean;
  onToggle: () => void;
  report: MatchReport;
  originalReport: MatchReport | null;
  scoreSource: "original" | "tailored" | "reanalyzed";
  recommendations: Recommendation[];
  requirementWhy: Map<string, string>;
  changes: TailorChange[] | null;
  formatting: { score: number; checks: AtsCheck[] } | null;
};

/** Every detail of the analysis, behind one disclosure. */
export function FullAnalysis(p: FullAnalysisProps) {
  const r = p.report;
  const shown = r.matches.filter((m) => m.status === "demonstrated");
  const partial = r.matches.filter((m) => m.status === "partial" || m.status === "unclear");
  const missing = r.matches.filter((m) => m.status === "missing");
  const failedChecks = p.formatting?.checks.filter((c) => !c.passed) ?? [];
  return (
    <div className={cn(p.open && "rounded-2xl border border-[var(--border)] bg-[var(--surface)]")}>
      <button
        type="button"
        onClick={p.onToggle}
        aria-expanded={p.open}
        aria-controls="full-analysis"
        className={cn("inline-flex items-center gap-1 text-xs text-subtle hover:text-foreground", p.open ? "px-4 pt-4 sm:px-6" : "px-1")}
      >
        {p.open ? "Hide details" : "View details"}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", p.open && "rotate-180")} />
      </button>
      {p.open && (
        <div id="full-analysis" className="space-y-4 px-4 pb-5 pt-3 sm:px-6">
          <Section title="Overview">
            {p.originalReport && p.scoreSource !== "original" && r.score != null ? (
              <ScoreComparison before={p.originalReport} after={r} label={p.scoreSource === "tailored" ? "Tailored" : "Edited"} />
            ) : (
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-subtle">Keyword alignment</dt>
                  <dd className="tabular-nums">{pct(r.keywordAlignment)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-subtle">Skills match</dt>
                  <dd className="tabular-nums">{pct(r.skillsMatch)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-subtle">Experience relevance</dt>
                  <dd className="tabular-nums">{pct(experienceOf(r))}</dd>
                </div>
                <div>
                  <dt className="text-xs text-subtle">Formatting (separate)</dt>
                  <dd className="tabular-nums">{pct(p.formatting?.score)}</dd>
                </div>
              </dl>
            )}
          </Section>

          <Section id="full-analysis-skills" title="Skills and requirements">
            <div className="space-y-4">
              {shown.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-emerald-300">Demonstrated in your resume ({shown.length})</p>
                  <p className="mt-1 text-sm text-muted">{shown.map((m) => m.name).join(" · ")}</p>
                </div>
              )}
              {partial.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-amber-300">Partly shown ({partial.length})</p>
                  <RequirementList items={partial} why={p.requirementWhy} />
                </div>
              )}
              {missing.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-red-300">Missing ({missing.length})</p>
                  <RequirementList items={missing} why={p.requirementWhy} />
                  <p className="mt-2 text-xs text-subtle">
                    Missing skills are never added for you. If you genuinely have one, add it with Edit Content.
                  </p>
                </div>
              )}
            </div>
          </Section>

          <Section id="full-analysis-recommendations" title="Recommendations">
            {p.recommendations.length ? (
              <ol className="list-decimal space-y-2 pl-5 text-sm">
                {p.recommendations.map((rec) => (
                  <li key={rec.id}>
                    <span className="font-medium">{rec.title}.</span> <span className="text-muted">{rec.suggestion}</span>
                    <span className="block text-xs text-subtle">Why: {rec.issue} {rec.benefit}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-subtle">No improvements flagged for this job.</p>
            )}
          </Section>

          {p.changes && p.changes.length > 0 && <ChangeLog changes={p.changes} />}

          {failedChecks.length > 0 && (
            <Section title="Formatting checks">
              <ul className="space-y-1 text-sm">
                {failedChecks.map((c) => (
                  <li key={c.id}>
                    {c.label} <span className="text-xs text-subtle">— {c.detail}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="How the score works">
            <p className="text-xs leading-relaxed text-muted">
              {r.explanation} The CueAI ATS Match ({r.scoringVersion}) gives each requirement full credit when your resume demonstrates it, half when it is partly
              shown, and none when missing, weighted by priority. Formatting is checked separately. It estimates alignment with this job description — it is not
              an employer&apos;s ATS score and does not guarantee shortlisting.
            </p>
            <table className="mt-2 w-full text-left text-xs">
              <tbody>
                {r.categories.map((c) => (
                  <tr key={c.key} className="border-t border-[var(--border)] align-top">
                    <td className="py-1.5 pr-2">{c.label}</td>
                    <td className="py-1.5 pr-2 tabular-nums text-subtle">{c.weight}%</td>
                    <td className="py-1.5 pr-2 tabular-nums">{c.score == null ? "n/a" : c.score}</td>
                    <td className="py-1.5 text-subtle">{c.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </div>
      )}
    </div>
  );
}
