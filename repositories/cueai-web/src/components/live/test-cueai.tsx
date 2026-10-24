"use client";

import { useEffect, useState } from "react";
import { Mic, Square, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LiveAnswerCard, useLiveAnswers } from "@/components/live/live-answers";
import { useVoiceCapture } from "@/components/mock-interview/use-voice-capture";
import { cn } from "@/lib/utils";

/** A spoken question ends at a shorter pause than an interview answer. */
const QUESTION_END_OF_SPEECH_MS = 1300;

/**
 * Test CueAI: ask (or say) an interview question and get the exact answer Regular Interview
 * would give — same /api/live/answer pipeline, same answer card.
 */
export function TestCueAi({ active }: { active: boolean }) {
  const answers = useLiveAnswers({ test: true });
  const [input, setInput] = useState("");

  const voice = useVoiceCapture({
    endOfSpeechMs: QUESTION_END_OF_SPEECH_MS,
    onText: (text, finished) => {
      if (finished) {
        setInput("");
        void answers.ask(text);
      } else {
        setInput(text);
      }
    },
  });
  const recording = voice.state === "listening" || voice.state === "speaking";

  useEffect(() => {
    if (!active) voice.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function submit() {
    const question = input.trim();
    if (!question) return;
    voice.cancel();
    setInput("");
    void answers.ask(question);
  }

  const status = recording
    ? voice.state === "speaking"
      ? "Recording — pause when you finish the question"
      : "Listening… ask your question"
    : voice.state === "transcribing"
      ? "Transcribing your question…"
      : null;

  return (
    <div className="flex flex-col gap-4 text-left">
      <div className="ls-panel min-h-[320px] space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium tracking-tight">AI answers</p>
          <div className="flex items-center gap-2">
            {answers.busy ? <Badge variant="default">Streaming</Badge> : <Badge>Ready</Badge>}
            {answers.items.length > 0 && (
              <Button size="sm" variant="ghost" onClick={answers.clear} aria-label="Clear answers">
                <Trash2 className="h-3 w-3" />
                Clear
              </Button>
            )}
          </div>
        </div>
        {answers.items.length === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-[var(--border)] px-4 py-8 text-center">
            <p className="text-sm font-medium">Ask CueAI an interview question</p>
            <p className="max-w-md text-xs text-muted">
              Speak or type a question such as &ldquo;What is a Python decorator?&rdquo; CueAI answers exactly as it does
              in a Regular Interview, using your latest session briefing (resume and job description) when the question
              is about you.
            </p>
          </div>
        ) : (
          answers.items.map((item) => (
            <LiveAnswerCard
              key={item.id}
              item={item}
              showTiming
              onPin={() => answers.togglePin(item.id)}
              onRegenerate={() => answers.regenerate(item.id)}
              onStop={() => answers.stop(item.id)}
            />
          ))
        )}
      </div>

      <div className="ls-panel space-y-2 p-3">
        {status && (
          <p className="flex items-center gap-2 px-1 text-xs text-muted" aria-live="polite">
            <span
              className={cn("h-2 w-2 rounded-full", voice.state === "speaking" ? "animate-pulse bg-red-400" : "bg-red-400/60")}
              aria-hidden
            />
            {status}
          </p>
        )}
        {voice.error && <p className="px-1 text-xs text-[var(--cue-danger)]">{voice.error}</p>}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <button
            type="button"
            onClick={() => (recording ? voice.stop() : void voice.start())}
            disabled={voice.state === "transcribing"}
            aria-pressed={recording}
            aria-label={recording ? "Stop recording" : "Ask by voice"}
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition disabled:opacity-40",
              recording ? "border-red-400/60 bg-red-500/15 text-red-300" : "border-[var(--border-strong)] text-muted hover:text-foreground",
            )}
          >
            {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
          <label htmlFor="test-cueai-question" className="sr-only">
            Interview question
          </label>
          <input
            id="test-cueai-question"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="ls-ask-input"
            placeholder="Type an interview question, or use the mic…"
            maxLength={2000}
          />
          <Button type="submit" variant="primary" disabled={!input.trim()}>
            Ask
          </Button>
        </form>
      </div>
    </div>
  );
}
