"use client";

import Image from "next/image";
import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Speech } from "@/components/mock-interview/use-speech";

export type InterviewerStatus = "ready" | "listening" | "thinking" | "speaking" | "paused";

const STATUS: Record<InterviewerStatus, { label: string; dot: string; ring: string }> = {
  ready: { label: "Ready", dot: "bg-teal-400", ring: "ring-teal-400/40" },
  listening: { label: "Listening", dot: "bg-red-400 animate-pulse", ring: "ring-red-400/60" },
  thinking: { label: "Thinking", dot: "bg-amber-400 animate-pulse", ring: "ring-amber-400/50" },
  speaking: { label: "Speaking", dot: "bg-sky-400 animate-pulse", ring: "ring-sky-400/60" },
  paused: { label: "Paused", dot: "bg-[var(--border-strong)]", ring: "ring-[var(--border-strong)]" },
};

/** Virtual interviewer: portrait, name, live status, and the voice toggle. */
export function InterviewerPanel({ status, speech }: { status: InterviewerStatus; speech: Speech }) {
  const s = STATUS[status];
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div
        className={cn(
          "relative h-36 w-36 overflow-hidden rounded-full ring-4 transition-shadow duration-300 sm:h-44 sm:w-44",
          s.ring,
          status === "speaking" && "shadow-[0_0_40px_rgba(56,189,248,0.25)]",
        )}
      >
        <Image
          src="/mock-interview/interviewer.jpg"
          alt="CueAI Interviewer"
          fill
          sizes="176px"
          className="object-cover"
          priority
        />
      </div>
      <div>
        <p className="font-display text-lg font-semibold tracking-tight">CueAI Interviewer</p>
        <p className="text-xs text-muted">Mock interviewer</p>
      </div>
      <p
        className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1 text-sm"
        role="status"
        aria-live="polite"
      >
        <span className={cn("h-2 w-2 rounded-full", s.dot)} aria-hidden />
        {s.label}
      </p>
      {speech.supported && (
        <button
          type="button"
          onClick={() => speech.setEnabled(!speech.enabled)}
          aria-pressed={speech.enabled}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground"
        >
          {speech.enabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          {speech.enabled ? "Interviewer voice on" : "Interviewer voice off"}
        </button>
      )}
      <p className="text-[11px] leading-relaxed text-subtle">
        For practice and learning before your interview. Feedback is an AI estimate, not an official assessment.
      </p>
    </div>
  );
}
