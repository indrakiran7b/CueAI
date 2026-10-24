/**
 * Per-utterance timing (monotonic performance.now() timestamps) and session
 * counters for the live pipeline. Logs never include audio, keys, or — unless
 * debug mode is on — transcript text.
 *
 * Debug mode: localStorage.setItem("cueai.debug", "1") or VITE_CUEAI_DEBUG=1.
 * Stats: window.cueaiPipelineStats() in the overlay DevTools console.
 */

import type { FinalUtterance } from "./turn-detector";

export type TimelineMarks = {
  speechStart?: number;
  lastVoice?: number;
  speechEndDetected?: number;
  transcribeRequest?: number;
  transcribeResponse?: number;
  finalized?: number;
  llmRequest?: number;
  firstToken?: number;
  firstRender?: number;
  complete?: number;
};

export type TimelineRecord = {
  utteranceId: string;
  lane: string;
  marks: TimelineMarks;
  contextMs?: number;
  provider?: string;
  retries: number;
  outcome: "pending" | "answered" | "superseded" | "failed" | "skipped";
  reason?: string;
};

const MAX_RECORDS = 50;
const records: TimelineRecord[] = [];
const byId = new Map<string, TimelineRecord>();

export const pipelineCounters = {
  finalized: 0,
  triggered: 0,
  answered: 0,
  failed: 0,
  superseded: 0,
  duplicates: 0,
  skipped: 0,
  heldIncomplete: 0,
  droppedIncomplete: 0,
  transcribeRequests: 0,
  transcribeErrors: 0,
  transcribeRetries: 0,
};

export function isPipelineDebug(): boolean {
  try {
    const env = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_CUEAI_DEBUG;
    if (env === "1") return true;
    return typeof localStorage !== "undefined" && localStorage.getItem("cueai.debug") === "1";
  } catch {
    return false;
  }
}

export function debugLog(message: string, detail?: Record<string, unknown>) {
  if (!isPipelineDebug()) return;
  console.log("[CueAI Debug]", message, detail || "");
}

export function startTimeline(u: FinalUtterance): TimelineRecord {
  pipelineCounters.finalized += 1;
  const rec: TimelineRecord = {
    utteranceId: u.id,
    lane: u.lane,
    marks: {
      speechStart: u.speechStartAt || undefined,
      lastVoice: u.lastVoiceAt || undefined,
      speechEndDetected: u.speechEndDetectedAt || undefined,
      transcribeRequest: u.transcribeRequestAt || undefined,
      transcribeResponse: u.transcribedAt || undefined,
      finalized: u.finalizedAt,
    },
    retries: 0,
    outcome: "pending",
  };
  records.push(rec);
  byId.set(u.id, rec);
  while (records.length > MAX_RECORDS) byId.delete(records.shift()!.utteranceId);
  return rec;
}

export function timelineFor(utteranceId: string | null | undefined) {
  return utteranceId ? byId.get(utteranceId) : undefined;
}

export function markTimeline(utteranceId: string | null | undefined, key: keyof TimelineMarks, at = performance.now()) {
  const rec = timelineFor(utteranceId);
  if (rec && rec.marks[key] == null) rec.marks[key] = at;
}

function delta(a?: number, b?: number) {
  return a != null && b != null ? Math.round(b - a) : undefined;
}

export function timelineMetrics(rec: TimelineRecord) {
  const m = rec.marks;
  return {
    audioToTranscriptMs: delta(m.lastVoice, m.transcribeResponse),
    speechEndDetectMs: delta(m.lastVoice, m.speechEndDetected),
    transcribeMs: delta(m.transcribeRequest, m.transcribeResponse),
    finalWordToFinalizedMs: delta(m.lastVoice, m.finalized),
    finalizedToFirstTokenMs: delta(m.finalized, m.firstToken),
    finalizedToCompleteMs: delta(m.finalized, m.complete),
    endToEndMs: delta(m.lastVoice, m.firstRender ?? m.firstToken),
    contextMs: rec.contextMs,
  };
}

export function finishTimeline(
  utteranceId: string | null | undefined,
  outcome: TimelineRecord["outcome"],
  extra?: { reason?: string; provider?: string },
) {
  const rec = timelineFor(utteranceId);
  if (!rec || rec.outcome !== "pending") return;
  rec.outcome = outcome;
  if (extra?.reason) rec.reason = extra.reason;
  if (extra?.provider) rec.provider = extra.provider;
  if (outcome === "answered") pipelineCounters.answered += 1;
  if (outcome === "failed") pipelineCounters.failed += 1;
  if (outcome === "superseded") pipelineCounters.superseded += 1;
  console.log("[CueAI Timeline]", {
    utterance: rec.utteranceId,
    lane: rec.lane,
    outcome,
    reason: rec.reason,
    provider: rec.provider,
    ...timelineMetrics(rec),
  });
}

function pct(values: number[], p: number) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))]!;
}

export function getPipelineStats() {
  const answered = records.filter((r) => r.outcome === "answered").map(timelineMetrics);
  const summarize = (key: keyof ReturnType<typeof timelineMetrics>) => {
    const vals = answered.map((m) => m[key]).filter((v): v is number => typeof v === "number");
    return { n: vals.length, p50: pct(vals, 50), p95: pct(vals, 95), p99: pct(vals, 99) };
  };
  const triggered = Math.max(1, pipelineCounters.triggered);
  return {
    counters: { ...pipelineCounters },
    autoAnswerSuccessRate: Number((pipelineCounters.answered / triggered).toFixed(3)),
    duplicateRate: Number((pipelineCounters.duplicates / Math.max(1, pipelineCounters.finalized)).toFixed(3)),
    transcribeErrorRate: Number(
      (pipelineCounters.transcribeErrors / Math.max(1, pipelineCounters.transcribeRequests)).toFixed(3),
    ),
    incompleteRate: Number(
      (pipelineCounters.droppedIncomplete / Math.max(1, pipelineCounters.finalized + pipelineCounters.droppedIncomplete)).toFixed(3),
    ),
    finalWordToFinalizedMs: summarize("finalWordToFinalizedMs"),
    finalizedToFirstTokenMs: summarize("finalizedToFirstTokenMs"),
    finalizedToCompleteMs: summarize("finalizedToCompleteMs"),
    endToEndMs: summarize("endToEndMs"),
    audioToTranscriptMs: summarize("audioToTranscriptMs"),
  };
}

export function resetPipelineStats() {
  records.length = 0;
  byId.clear();
  for (const k of Object.keys(pipelineCounters) as (keyof typeof pipelineCounters)[]) pipelineCounters[k] = 0;
}

if (typeof window !== "undefined") {
  (window as unknown as { cueaiPipelineStats?: typeof getPipelineStats }).cueaiPipelineStats = getPipelineStats;
}
