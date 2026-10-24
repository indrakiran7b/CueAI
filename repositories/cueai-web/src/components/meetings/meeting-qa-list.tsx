"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AnswerText } from "@/components/live/answer-text";
import { cn } from "@/lib/utils";

export type MeetingQaItem = {
  id: string;
  question: string;
  answer: string;
  status?: "answered" | "unavailable";
};

const OPEN_BY_DEFAULT_MAX = 5;

/** Full question/answer list for a meeting summary. Never truncates or invents content. */
export function MeetingQaList({ items }: { items: MeetingQaItem[] }) {
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(items.length <= OPEN_BY_DEFAULT_MAX ? items.map((i) => i.id) : []),
  );

  if (items.length === 0) {
    return <p className="text-sm text-muted">No questions were recorded in this session.</p>;
  }

  const allOpen = open.size === items.length;
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {items.length} question{items.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          className="font-medium text-primary hover:underline"
          onClick={() => setOpen(allOpen ? new Set() : new Set(items.map((i) => i.id)))}
        >
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      </div>
      <ol className="space-y-2">
        {items.map((item, index) => {
          const expanded = open.has(item.id);
          const unavailable = item.status === "unavailable" || !item.answer.trim();
          const panelId = `qa-panel-${item.id}`;
          return (
            <li key={item.id} className="rounded-xl border border-[var(--border)] text-sm">
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left"
              >
                <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-subtle">
                  Question {index + 1}
                </span>
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words font-medium text-foreground">
                  {item.question}
                </span>
                <ChevronDown
                  className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted transition", expanded && "rotate-180")}
                />
              </button>
              {expanded && (
                <div id={panelId} className="border-t border-[var(--border)] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Answer</p>
                  {unavailable ? (
                    <p className="mt-1 italic text-amber-300/90">Answer not available for this question.</p>
                  ) : (
                    <AnswerText text={item.answer} className="mt-1 text-muted" />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
