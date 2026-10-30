/**
 * Auto-answer state machine for the live overlay.
 *
 * idle → listening → question_pending → generating → answer_ready → (listening …)
 *                                  ↘ error_recovery ↗
 *
 * Every request carries the utterance id it answers. Only the current request
 * may update the visible answer, so a slow stale answer can never overwrite a
 * newer one. Listening is never paused while an answer is generating.
 */

export type AnswerState =
  | "idle"
  | "listening"
  | "question_pending"
  | "generating"
  | "answer_ready"
  | "error_recovery";

export type AnswerSnapshot = {
  state: AnswerState;
  listening: boolean;
  /** Question currently being heard (not yet final). */
  pendingQuestion: string | null;
  /** Question the visible answer belongs to. */
  question: string;
  answer: string;
  utteranceId: string | null;
  error: string | null;
};

export type GenerateRequest = {
  id: string;
  utteranceId: string;
  question: string;
  signal: AbortSignal;
  onToken: (full: string) => void;
};

export type ControllerEvent =
  | { type: "requested"; id: string; utteranceId: string; question: string; merged: boolean; at: number }
  | { type: "first_token"; id: string; at: number }
  | { type: "complete"; id: string; question: string; answer: string; at: number }
  | { type: "superseded"; id: string; at: number }
  | { type: "failed"; id: string; error: string; at: number }
  | { type: "rejected"; utteranceId: string; reason: string; at: number };

export type SubmitInput = {
  utteranceId: string;
  text: string;
  finalizedAt: number;
  source: "auto" | "manual";
};

export type ControllerOptions = {
  generate: (req: GenerateRequest) => Promise<{ answer: string }>;
  onChange?: (snap: AnswerSnapshot) => void;
  onEvent?: (e: ControllerEvent) => void;
  now?: () => number;
  /** A question finalized this soon after the previous unanswered one is treated as part two. */
  mergeWindowMs?: number;
  dedupeWindowMs?: number;
};

type Active = {
  id: string;
  utteranceId: string;
  question: string;
  finalizedAt: number;
  abort: AbortController;
  sawToken: boolean;
};

const CONTINUATION =
  /^(and|also|plus|or|then|additionally|as well as|what about|how about|please (?:explain|describe|show|cover|include|give)|(?:explain|describe|show|cover|include|give) (?:the|a|an|one|how|why|what))\b/i;

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export class AutoAnswerController {
  private opts: ControllerOptions;
  private snap: AnswerSnapshot = {
    state: "idle",
    listening: false,
    pendingQuestion: null,
    question: "",
    answer: "",
    utteranceId: null,
    error: null,
  };
  private active: Active | null = null;
  /** Most recent request, kept after it finishes so a continuation can extend it. */
  private last: Active | null = null;
  private seenUtterances = new Set<string>();
  private answered: { norm: string; at: number }[] = [];
  private counter = 0;
  readonly metrics = {
    requested: 0,
    merged: 0,
    completed: 0,
    superseded: 0,
    failed: 0,
    duplicateEvents: 0,
    duplicateQuestions: 0,
  };

  constructor(opts: ControllerOptions) {
    this.opts = opts;
  }

  get snapshot() {
    return this.snap;
  }

  get busy() {
    return this.active != null;
  }

  private now() {
    return this.opts.now ? this.opts.now() : performance.now();
  }

  private set(patch: Partial<AnswerSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.opts.onChange?.(this.snap);
  }

  private idleState(): AnswerState {
    if (this.snap.pendingQuestion) return "question_pending";
    if (this.snap.answer) return "answer_ready";
    return this.snap.listening ? "listening" : "idle";
  }

  setListening(on: boolean) {
    this.set({ listening: on });
    if (!this.active && this.snap.state !== "error_recovery") this.set({ state: this.idleState() });
  }

  /** Live preview of the question being spoken (null clears it). */
  pending(text: string | null) {
    this.set({ pendingQuestion: text });
    if (!this.active) this.set({ state: this.idleState() });
  }

  submit(input: SubmitInput): { accepted: boolean; reason: string; requestId?: string } {
    const at = this.now();
    const text = input.text.trim();
    if (!text) return this.reject(input.utteranceId, "empty", at);
    if (this.seenUtterances.has(input.utteranceId)) {
      this.metrics.duplicateEvents += 1;
      return this.reject(input.utteranceId, "duplicate_event", at);
    }
    this.seenUtterances.add(input.utteranceId);

    const key = normalize(text);
    const window = this.opts.dedupeWindowMs ?? 45_000;
    this.answered = this.answered.filter((a) => at - a.at <= window);
    if (input.source === "auto" && (this.answered.some((a) => a.norm === key) || this.active && normalize(this.active.question) === key)) {
      this.metrics.duplicateQuestions += 1;
      return this.reject(input.utteranceId, "duplicate_question", at);
    }

    let question = text;
    let merged = false;
    const prev = this.active;
    const last = this.last;
    if (input.source === "auto" && last && input.finalizedAt - last.finalizedAt <= (this.opts.mergeWindowMs ?? 6000)) {
      // "…and how do they relate?" continues the previous question even if its answer already finished.
      if (CONTINUATION.test(text) || (prev === last && !prev.sawToken)) {
        question = `${last.question} ${text}`;
        merged = true;
        this.metrics.merged += 1;
      }
    }
    if (prev) {
      prev.abort.abort();
      this.metrics.superseded += 1;
      this.opts.onEvent?.({ type: "superseded", id: prev.id, at });
    }
    return { accepted: true, reason: merged ? "merged" : prev ? "superseded_previous" : "ok", requestId: this.start(input, question, merged, at) };
  }

  private reject(utteranceId: string, reason: string, at: number) {
    this.opts.onEvent?.({ type: "rejected", utteranceId, reason, at });
    return { accepted: false, reason };
  }

  private start(input: SubmitInput, question: string, merged: boolean, at: number) {
    const id = `ans-${++this.counter}`;
    const req: Active = {
      id,
      utteranceId: input.utteranceId,
      question,
      finalizedAt: input.finalizedAt,
      abort: new AbortController(),
      sawToken: false,
    };
    this.active = req;
    this.last = req;
    this.metrics.requested += 1;
    this.set({ state: "generating", question, answer: "", utteranceId: input.utteranceId, error: null });
    this.opts.onEvent?.({ type: "requested", id, utteranceId: input.utteranceId, question, merged, at });

    const isCurrent = () => this.active === req && !req.abort.signal.aborted;
    void this.opts
      .generate({
        id,
        utteranceId: input.utteranceId,
        question,
        signal: req.abort.signal,
        onToken: (full) => {
          if (!isCurrent()) return;
          if (!req.sawToken) {
            req.sawToken = true;
            this.opts.onEvent?.({ type: "first_token", id, at: this.now() });
          }
          this.set({ answer: full });
        },
      })
      .then(({ answer }) => {
        if (!isCurrent()) return;
        this.active = null;
        this.metrics.completed += 1;
        this.answered.push({ norm: normalize(question), at: this.now() });
        if (merged) this.answered.push({ norm: normalize(input.text), at: this.now() });
        this.set({ state: "answer_ready", answer });
        this.opts.onEvent?.({ type: "complete", id, question, answer, at: this.now() });
      })
      .catch((err: unknown) => {
        if (!isCurrent()) return;
        this.active = null;
        this.metrics.failed += 1;
        const message = err instanceof Error ? err.message : "Unable to generate an answer.";
        // Listening continues; the next finalized question starts a fresh request.
        this.set({ state: "error_recovery", error: message });
        this.opts.onEvent?.({ type: "failed", id, error: message, at: this.now() });
      });
    return id;
  }

  /** Stop the current answer without touching capture. */
  cancel() {
    this.last = null;
    if (!this.active) return;
    this.active.abort.abort();
    this.active = null;
    this.set({ state: this.idleState() });
  }

  /** New or ended session: forget everything. */
  reset() {
    this.active?.abort.abort();
    this.active = null;
    this.last = null;
    this.seenUtterances.clear();
    this.answered = [];
    this.set({ state: this.snap.listening ? "listening" : "idle", pendingQuestion: null, question: "", answer: "", utteranceId: null, error: null });
  }
}
