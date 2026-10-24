"use client";

import { useEffect, useRef, useState } from "react";
import { Pin, RefreshCw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnswerText } from "@/components/live/answer-text";
import { requestLiveAnswer } from "@/lib/live-answer-client";
import type { LiveExchange, LiveTranscriptLine } from "@/lib/live-answer";

export type LiveAnswerItem = {
  id: string;
  question: string;
  answer: string;
  status: "streaming" | "done" | "error" | "stopped";
  error?: string;
  pinned: boolean;
  firstTextMs?: number;
  totalMs?: number;
};

let seq = 0;
const nextId = () => `ans_${Date.now().toString(36)}_${(seq++).toString(36)}`;

/**
 * Live Session answers (Regular Interview and Test CueAI): each question streams through
 * /api/live/answer with the earlier answers as follow-up context. Newest answer first.
 */
export function useLiveAnswers({ test = false }: { test?: boolean } = {}) {
  const [items, setItems] = useState<LiveAnswerItem[]>([]);
  const itemsRef = useRef(items);
  const controllers = useRef(new Map<string, AbortController>());

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    const active = controllers.current;
    return () => active.forEach((c) => c.abort());
  }, []);

  function patch(id: string, update: Partial<LiveAnswerItem>) {
    setItems((list) => list.map((item) => (item.id === id ? { ...item, ...update } : item)));
  }

  async function ask(rawQuestion: string, opts: { transcript?: LiveTranscriptLine[]; replaceId?: string } = {}) {
    const question = rawQuestion.trim();
    if (!question) return;
    const id = opts.replaceId ?? nextId();
    const history: LiveExchange[] = itemsRef.current
      .filter((item) => item.id !== id && item.status === "done" && item.answer)
      .reverse()
      .map((item) => ({ question: item.question, answer: item.answer }));
    controllers.current.get(id)?.abort();
    const controller = new AbortController();
    controllers.current.set(id, controller);
    const fresh: LiveAnswerItem = { id, question, answer: "", status: "streaming", pinned: false };
    setItems((list) =>
      opts.replaceId && list.some((item) => item.id === id)
        ? list.map((item) => (item.id === id ? { ...fresh, pinned: item.pinned } : item))
        : [fresh, ...list],
    );
    const started = performance.now();
    let firstTextMs: number | undefined;
    try {
      const reply = await requestLiveAnswer({
        prompt: question,
        transcript: opts.transcript,
        history,
        test,
        signal: controller.signal,
        onText: (full) => {
          if (firstTextMs === undefined) {
            firstTextMs = Math.round(performance.now() - started);
            patch(id, { firstTextMs });
          }
          patch(id, { answer: full });
        },
      });
      patch(id, { answer: reply.answer, status: "done", totalMs: Math.round(performance.now() - started) });
    } catch (err) {
      if (controller.signal.aborted) {
        patch(id, { status: "stopped" });
      } else {
        patch(id, {
          status: "error",
          error:
            err instanceof TypeError
              ? "Network error. Check your connection and retry."
              : err instanceof Error
                ? err.message
                : "Unable to generate an answer.",
        });
      }
    } finally {
      if (controllers.current.get(id) === controller) controllers.current.delete(id);
    }
  }

  return {
    items,
    busy: items.some((item) => item.status === "streaming"),
    latest: items[0] ?? null,
    ask,
    regenerate: (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (item) void ask(item.question, { replaceId: id });
    },
    stop: (id: string) => controllers.current.get(id)?.abort(),
    togglePin: (id: string) =>
      setItems((list) => list.map((item) => (item.id === id ? { ...item, pinned: !item.pinned } : item))),
    clear: () => {
      controllers.current.forEach((c) => c.abort());
      setItems([]);
    },
  };
}

/** One question and its AI answer, as shown in Live Session's answer panel. */
export function LiveAnswerCard({
  item,
  onPin,
  onRegenerate,
  onStop,
  showTiming = false,
}: {
  item: LiveAnswerItem;
  onPin: () => void;
  onRegenerate: () => void;
  onStop: () => void;
  showTiming?: boolean;
}) {
  const streaming = item.status === "streaming";
  return (
    <div className="ls-suggestion">
      <p className="ls-suggestion-q">{item.question}</p>
      {streaming && !item.answer ? (
        <div className="mt-2 flex items-center gap-1.5 text-subtle" aria-live="polite">
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-foreground" />
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-foreground" style={{ animationDelay: "0.2s" }} />
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-foreground" style={{ animationDelay: "0.4s" }} />
          <span className="ml-2 text-xs">Generating answer…</span>
        </div>
      ) : (
        item.answer && (
          <div className="mt-2 text-sm leading-relaxed text-foreground/90" aria-live={streaming ? "polite" : undefined}>
            <AnswerText text={item.answer} />
            {streaming && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-foreground/60 align-middle" aria-hidden />}
          </div>
        )
      )}
      {item.status === "error" && <p className="mt-2 text-xs text-[var(--cue-danger)]">{item.error}</p>}
      {item.status === "stopped" && <p className="mt-2 text-xs text-subtle">Stopped.</p>}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant={item.pinned ? "primary" : "outline"} onClick={onPin}>
          <Pin className="h-3 w-3" />
          {item.pinned ? "Pinned" : "Pin"}
        </Button>
        {streaming ? (
          <Button size="sm" variant="ghost" onClick={onStop}>
            <Square className="h-3 w-3" />
            Stop
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={onRegenerate}>
            <RefreshCw className="h-3 w-3" />
            {item.status === "error" ? "Retry" : "Regenerate"}
          </Button>
        )}
        {showTiming && item.firstTextMs !== undefined && (
          <span className="ml-auto text-[11px] text-subtle">
            First text {(item.firstTextMs / 1000).toFixed(1)} s
            {item.totalMs !== undefined ? ` · done ${(item.totalMs / 1000).toFixed(1)} s` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
