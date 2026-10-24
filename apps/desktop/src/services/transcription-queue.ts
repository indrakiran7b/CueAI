/**
 * Bounded, ordered transcription queue.
 *
 * - Final segments are never dropped because a newer one arrived; results are
 *   released per lane in the order the audio was spoken, even when responses
 *   come back out of order.
 * - Partial (in-progress) jobs are best-effort: superseded ones are skipped.
 * - Each request has a timeout and bounded retries for retryable failures only.
 */

import type { SegmentKind } from "./speech-segmenter";

export type TranscribeJob = {
  lane: string;
  segmentId: number;
  kind: SegmentKind;
  wav: Blob;
  prompt?: string;
};

export type TranscribeResult = { text: string; uncertain?: boolean };

export type TranscribeTiming = { queuedAt: number; startedAt: number; finishedAt: number; attempts: number };

export class TranscribeError extends Error {
  status: number;
  retryAfterMs: number;
  constructor(message: string, status = 0, retryAfterMs = 0) {
    super(message);
    this.name = "TranscribeError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export function isRetryableTranscribeError(err: unknown) {
  if (err instanceof TranscribeError) return err.status === 0 || err.status === 408 || err.status === 429 || err.status >= 500;
  if (err instanceof Error) return err.name === "AbortError" || err.name === "TimeoutError" || err instanceof TypeError;
  return false;
}

export type QueueOptions = {
  transcribe: (job: TranscribeJob, signal: AbortSignal) => Promise<TranscribeResult>;
  onResult: (job: TranscribeJob, result: TranscribeResult, timing: TranscribeTiming) => void;
  onError: (job: TranscribeJob, error: Error, timing: TranscribeTiming) => void;
  maxConcurrent?: number;
  /** Waiting (not yet started) final jobs before the oldest is shed. */
  maxQueued?: number;
  timeoutMs?: number;
  retries?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

type Entry = {
  job: TranscribeJob;
  order: number;
  queuedAt: number;
  startedAt: number;
  attempts: number;
};

type Outcome =
  | { ok: true; result: TranscribeResult; timing: TranscribeTiming }
  | { ok: false; error: Error; timing: TranscribeTiming };

export class TranscriptionQueue {
  private opts: Required<Omit<QueueOptions, "transcribe" | "onResult" | "onError">> & QueueOptions;
  private waiting: Entry[] = [];
  private running = new Set<Entry>();
  private controllers = new Set<AbortController>();
  private nextOrder = new Map<string, number>();
  private deliverOrder = new Map<string, number>();
  private finished = new Map<string, Map<number, { entry: Entry; outcome: Outcome }>>();
  private finalSegments = new Map<string, Set<number>>();
  private latestPartial = new Map<string, number>();
  private generation = 0;

  constructor(opts: QueueOptions) {
    this.opts = {
      maxConcurrent: 2,
      maxQueued: 6,
      timeoutMs: 12_000,
      retries: 1,
      now: () => performance.now(),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      ...opts,
    };
  }

  /** Final/split jobs still queued or running for a lane. */
  pendingFinals(lane: string) {
    let n = 0;
    for (const e of [...this.waiting, ...this.running]) if (e.job.lane === lane && e.job.kind !== "partial") n += 1;
    return n + (this.finished.get(lane)?.size || 0);
  }

  get size() {
    return this.waiting.length + this.running.size;
  }

  enqueue(job: TranscribeJob) {
    const now = this.opts.now();
    if (job.kind === "partial") {
      if (this.finalSegments.get(job.lane)?.has(job.segmentId)) return;
      this.latestPartial.set(`${job.lane}:${job.segmentId}`, now);
      // Only the newest partial per lane is worth sending.
      this.waiting = this.waiting.filter((e) => !(e.job.kind === "partial" && e.job.lane === job.lane));
      this.waiting.push({ job, order: -1, queuedAt: now, startedAt: 0, attempts: 0 });
    } else {
      const order = this.nextOrder.get(job.lane) ?? 0;
      this.nextOrder.set(job.lane, order + 1);
      if (!this.finalSegments.has(job.lane)) this.finalSegments.set(job.lane, new Set());
      this.finalSegments.get(job.lane)!.add(job.segmentId);
      this.waiting = this.waiting.filter(
        (e) => !(e.job.kind === "partial" && e.job.lane === job.lane && e.job.segmentId === job.segmentId),
      );
      this.waiting.push({ job, order, queuedAt: now, startedAt: 0, attempts: 0 });
      this.shed();
    }
    this.pump();
  }

  /** Drop everything (session end). In-flight responses are ignored. */
  clear() {
    this.generation += 1;
    for (const c of this.controllers) c.abort();
    this.controllers.clear();
    this.waiting = [];
    this.running.clear();
    this.nextOrder.clear();
    this.deliverOrder.clear();
    this.finished.clear();
    this.finalSegments.clear();
    this.latestPartial.clear();
  }

  private shed() {
    const finals = this.waiting.filter((e) => e.job.kind !== "partial");
    if (finals.length <= this.opts.maxQueued) return;
    this.waiting = this.waiting.filter((e) => e.job.kind !== "partial");
    const excess = finals.length - this.opts.maxQueued;
    const dropped = finals.slice(0, excess);
    this.waiting = this.waiting.filter((e) => !dropped.includes(e));
    for (const entry of dropped) {
      this.settle(entry, {
        ok: false,
        error: new TranscribeError("Transcription backlog — older speech segment skipped.", 0),
        timing: this.timing(entry),
      });
    }
  }

  private timing(entry: Entry): TranscribeTiming {
    return {
      queuedAt: entry.queuedAt,
      startedAt: entry.startedAt || entry.queuedAt,
      finishedAt: this.opts.now(),
      attempts: entry.attempts,
    };
  }

  private pump() {
    while (this.running.size < this.opts.maxConcurrent && this.waiting.length) {
      // Finals first, oldest first; partials only when no final is waiting.
      const idx = this.waiting.findIndex((e) => e.job.kind !== "partial");
      const entry = this.waiting.splice(idx >= 0 ? idx : 0, 1)[0]!;
      this.running.add(entry);
      void this.run(entry, this.generation);
    }
  }

  private async run(entry: Entry, generation: number) {
    entry.startedAt = this.opts.now();
    let lastError: Error = new Error("Transcription failed.");
    const maxAttempts = entry.job.kind === "partial" ? 1 : 1 + this.opts.retries;
    while (entry.attempts < maxAttempts) {
      entry.attempts += 1;
      const controller = new AbortController();
      this.controllers.add(controller);
      const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
      try {
        const result = await this.opts.transcribe(entry.job, controller.signal);
        clearTimeout(timer);
        this.controllers.delete(controller);
        if (generation !== this.generation) return;
        this.running.delete(entry);
        this.settle(entry, { ok: true, result, timing: this.timing(entry) });
        this.pump();
        return;
      } catch (err) {
        clearTimeout(timer);
        this.controllers.delete(controller);
        if (generation !== this.generation) return;
        lastError =
          controller.signal.aborted
            ? new TranscribeError("Transcription timed out.", 408)
            : err instanceof Error
              ? err
              : new Error(String(err));
        if (!isRetryableTranscribeError(lastError) || entry.attempts >= maxAttempts) break;
        const wait = lastError instanceof TranscribeError && lastError.retryAfterMs > 0
          ? Math.min(2000, lastError.retryAfterMs)
          : 350;
        await this.opts.sleep(wait);
        if (generation !== this.generation) return;
      }
    }
    this.running.delete(entry);
    this.settle(entry, { ok: false, error: lastError, timing: this.timing(entry) });
    this.pump();
  }

  private settle(entry: Entry, outcome: Outcome) {
    const { job } = entry;
    if (job.kind === "partial") {
      const superseded =
        this.finalSegments.get(job.lane)?.has(job.segmentId) ||
        (this.latestPartial.get(`${job.lane}:${job.segmentId}`) ?? 0) > entry.queuedAt;
      if (!superseded && outcome.ok) this.opts.onResult(job, outcome.result, outcome.timing);
      return;
    }
    if (!this.finished.has(job.lane)) this.finished.set(job.lane, new Map());
    this.finished.get(job.lane)!.set(entry.order, { entry, outcome });
    this.release(job.lane);
  }

  /** Deliver finished finals strictly in spoken order. */
  private release(lane: string) {
    const done = this.finished.get(lane)!;
    let next = this.deliverOrder.get(lane) ?? 0;
    while (done.has(next)) {
      const { entry, outcome } = done.get(next)!;
      done.delete(next);
      next += 1;
      this.deliverOrder.set(lane, next);
      if (outcome.ok) this.opts.onResult(entry.job, outcome.result, outcome.timing);
      else this.opts.onError(entry.job, outcome.error, outcome.timing);
    }
  }
}
