import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** What the preview and downloads show: manual edits, else the tailored version, else the original. */
export function previewContent<T>(s: { edited: T | null; tailored: T | null; original: T | null }): { resume: T | null; kind: "edited" | "tailored" | "original" } {
  if (s.edited) return { resume: s.edited, kind: "edited" };
  if (s.tailored) return { resume: s.tailored, kind: "tailored" };
  return { resume: s.original, kind: "original" };
}

/* ---------------- Page workflow: Upload → Job description → Tailor & download ---------------- */

export type WorkflowState = "done" | "current" | "todo";
export type WorkflowStep = { label: string; state: WorkflowState };

export function workflowSteps(i: { hasFile: boolean; analyzed: boolean; downloadReady: boolean }): WorkflowStep[] {
  const current = !i.hasFile ? 0 : !i.analyzed ? 1 : 2;
  const done = [i.hasFile, i.analyzed, i.downloadReady];
  return ["Upload Resume", "Add Job Description", "Tailor & Download"].map((label, n) => ({
    label,
    state: done[n] ? "done" : n === current ? "current" : "todo",
  }));
}

export function StepIndicator({ steps }: { steps: WorkflowStep[] }) {
  return (
    <ol aria-label="Progress" className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
      {steps.map((s, n) => (
        <li key={s.label} className="flex items-center gap-2" aria-current={s.state === "current" ? "step" : undefined} data-state={s.state}>
          {n > 0 && <span aria-hidden className="hidden h-px w-8 bg-[var(--border-strong)] sm:block" />}
          <span
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
              s.state === "done" && "bg-primary text-white",
              s.state === "current" && "border-2 border-primary text-primary",
              s.state === "todo" && "border border-[var(--border-strong)] text-subtle",
            )}
          >
            {s.state === "done" ? <Check className="h-3.5 w-3.5" aria-label="Completed" /> : n + 1}
          </span>
          <span className={cn(s.state === "todo" ? "text-subtle" : "font-medium text-foreground")}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

/* ---------------- Tailoring progress: each step is done only after it actually succeeded ---------------- */

export type TaskState = "done" | "active" | "error" | "todo";
export type TaskStep = { label: string; state: TaskState };

export type TailorProgressInput = {
  /** The request currently running, if any. */
  phase: "analyze" | "rewrite" | null;
  failedAt: "analyze" | "rewrite" | null;
  /** A scored analysis exists for the current resume and job description. */
  analyzed: boolean;
  /** Tailored content was returned and accepted for the current inputs. */
  tailored: boolean;
  /** The tailored content was re-scored with the same algorithm. */
  rescored: boolean;
  /** Layout validation of the tailored document: null while it is being prepared. */
  documentValid: boolean | null;
};

export function tailorSteps(i: TailorProgressInput): TaskStep[] {
  const analyze: TaskState = i.phase === "analyze" ? "active" : i.failedAt === "analyze" ? "error" : i.analyzed ? "done" : "todo";
  const rewrite: TaskState = i.phase === "rewrite" ? "active" : i.failedAt === "rewrite" ? "error" : i.tailored ? "done" : "todo";
  const check: TaskState = i.tailored && i.rescored ? "done" : "todo";
  const doc: TaskState = !i.tailored ? "todo" : i.documentValid == null ? "active" : i.documentValid ? "done" : "error";
  return [
    { label: "Analyzing job requirements", state: analyze },
    { label: "Improving relevant resume content", state: rewrite },
    { label: "Checking ATS alignment", state: check },
    { label: "Preparing final document", state: doc },
  ];
}

export function TailorSteps({ steps }: { steps: TaskStep[] }) {
  return (
    <ol aria-label="Tailoring progress" aria-live="polite" className="space-y-1.5 text-sm">
      {steps.map((s) => (
        <li key={s.label} data-state={s.state} className={cn("flex items-center gap-2", s.state === "todo" ? "text-subtle" : "text-foreground")}>
          {s.state === "done" ? (
            <Check className="h-4 w-4 text-emerald-400" aria-label="Done" />
          ) : s.state === "active" ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" aria-label="In progress" />
          ) : s.state === "error" ? (
            <AlertTriangle className="h-4 w-4 text-red-400" aria-label="Failed" />
          ) : (
            <span aria-hidden className="mx-1 h-2 w-2 rounded-full bg-[var(--border-strong)]" />
          )}
          {s.label}
        </li>
      ))}
    </ol>
  );
}
