/**
 * Live audio → question → answer pipeline logic shared by the Windows and macOS overlays.
 *
 * Pure and clock-injectable so the timing rules can be tested deterministically.
 * Nothing here touches audio, the network, or the DOM.
 */

export type Clock = {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
};

export const realClock: Clock = {
  now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

/* ------------------------------------------------------------------ */
/* Text heuristics                                                     */
/* ------------------------------------------------------------------ */

const WH =
  /^(so |and |okay |ok |now |then )?(what|whats|what's|why|how|when|where|who|whom|which|whose|can|could|would|should|do|does|did|is|are|was|were|will|have|has|had)\b/i;

const PROMPT =
  /\b(tell me|walk me through|explain|describe|share|talk about|give me an example|introduce yourself|compare|define|write (a|an|the|some)|implement|let'?s (talk|discuss|go over)|i'?d like (to know|to hear|you to)|i want (to know|to hear|you to))\b/i;

const FILLER =
  /^(um+|uh+|hmm+|mm+|yeah|yep|yup|yes|no|nope|ok|okay|right|sure|great|cool|nice|thanks|thank you|hello|hi|hey|bye|got it|alright|all right|perfect|good|let'?s move on|next question)[.!]?$/i;

/** Connectors that can never end a finished sentence, even with a trailing "?". */
const STRONG_DANGLING =
  /\b(and|or|but|the|a|an|of|between|versus|vs|with|to|for|from|into|than|your|my|our|their)$/i;
/** Without punctuation these usually mean the speaker is mid-sentence. */
const WEAK_DANGLING =
  /\b(in|on|at|using|via|through|by|is|are|was|were|about|like|if|because|so|that|which|what|how|why|when|where|who|can|could|would|should|explain|describe|difference)$/i;

const OPEN_STEM =
  /^(so |and |okay |ok |um |uh )?(what is|what are|how does|how do|how would|why is|why do|explain|describe|can you|could you|tell me|what is the difference|what's the difference)$/i;

/** Short follow-ups that only make sense against the previous exchange. */
const FOLLOW_UP =
  /^(and |so |but |okay |ok |right |hmm )?(why|why not|how so|how come|really|meaning|such as|for example|like what|which one|what else|anything else|go on|tell me more|(can|could) you (elaborate|expand)( on)?( that| it| this| more)?|(can|could) you explain( that| it| this| more)|what (did|do|would) you use( for (that|it|this))?|why did you (choose|pick|use|go with) (that|it|this|them)|why that|what about [\w .+#-]{1,40}|how did you (do|handle|implement|build) (that|it|this))[?.!]?$/i;

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

export function isFollowUp(text: string): boolean {
  return FOLLOW_UP.test(text.trim().replace(/\s+/g, " "));
}

export function isFiller(text: string): boolean {
  return FILLER.test(text.trim().replace(/\s+/g, " "));
}

export function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  return t.endsWith("?") || WH.test(t) || PROMPT.test(t) || isFollowUp(t);
}

/**
 * Whether an utterance reads as finished.
 * `strict` is used right after speech stops (needs punctuation or a clear shape);
 * `lenient` is used once the speaker has stayed silent through the longer hold.
 */
export function isLikelyComplete(raw: string, mode: "strict" | "lenient"): boolean {
  const t = raw.trim().replace(/\s+/g, " ");
  if (!t) return false;
  const bare = t.replace(/[?.!,;:…]+$/, "").trim();
  if (!bare) return false;
  if (OPEN_STEM.test(bare)) return false;
  if (STRONG_DANGLING.test(bare)) return false;
  if (isFollowUp(t)) return true;
  if (t.endsWith("?")) return true;
  const n = words(bare).length;
  const shaped = WH.test(bare) || PROMPT.test(bare);
  if (mode === "strict") {
    if (/[.!]$/.test(t) && !WEAK_DANGLING.test(bare)) return n >= 3 || (n >= 2 && shaped);
    return false;
  }
  if (WEAK_DANGLING.test(bare) && !/[.!]$/.test(t)) return false;
  return n >= 3 || (n >= 2 && shaped);
}

/** Remove words repeated across a segment boundary ("...in Python" + "Python decorators..."). */
export function mergeOverlap(prev: string, next: string): string {
  const a = prev.trim();
  const b = next.trim();
  if (!a) return b;
  if (!b) return a;
  const aw = words(a);
  const bw = words(b);
  const na = aw.map((w) => normalizeText(w));
  const nb = bw.map((w) => normalizeText(w));
  const max = Math.min(8, aw.length, bw.length);
  for (let k = max; k >= 1; k--) {
    let same = true;
    for (let i = 0; i < k; i++) {
      if (!na[aw.length - k + i] || na[aw.length - k + i] !== nb[i]) {
        same = false;
        break;
      }
    }
    // A single repeated word only counts when it is not a tiny function word.
    if (same && (k > 1 || (nb[0]?.length ?? 0) > 3)) {
      return [...aw, ...bw.slice(k)].join(" ");
    }
  }
  return `${a} ${b}`;
}

function similarity(a: string, b: string): number {
  const sa = new Set(a.split(" ").filter(Boolean));
  const sb = new Set(b.split(" ").filter(Boolean));
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  return inter / (sa.size + sb.size - inter);
}

function hashId(norm: string): string {
  let h = 0;
  for (let i = 0; i < norm.length; i++) h = (h * 31 + norm.charCodeAt(i)) >>> 0;
  return `q_${h.toString(16)}`;
}

/* ------------------------------------------------------------------ */
/* Utterance assembly + question-completion detection                  */
/* ------------------------------------------------------------------ */

export type CompletionConfig = {
  /** Settle time once the transcript already reads as a finished question. */
  stableMs: number;
  /** Silence after speech end to wait when the transcript still looks unfinished. */
  incompleteHoldMs: number;
  /** An unfinished utterance is prepended to the same speaker's next one within this window. */
  carryMs: number;
  /** A segment whose transcription never resolves is skipped after this long. */
  orderTimeoutMs: number;
};

export const DEFAULT_COMPLETION: CompletionConfig = {
  stableMs: 120,
  incompleteHoldMs: 1600,
  carryMs: 7000,
  orderTimeoutMs: 15_000,
};

export type SegmentResult = {
  text: string;
  uncertain?: boolean;
  /** When the transcription response arrived (clock time). */
  transcribedAt?: number;
};

export type FinalUtterance = {
  id: string;
  who: string;
  text: string;
  /** False when the speaker went quiet mid-sentence; the text is carried into the next utterance. */
  complete: boolean;
  uncertain: boolean;
  carried: boolean;
  segments: number;
  speechStartAt?: number;
  lastVoiceAt?: number;
  speechEndAt?: number;
  transcribedAt?: number;
  finalizedAt: number;
};

export type AssemblerDebugEvent = {
  type:
    | "speech_start"
    | "speech_end"
    | "segment_queued"
    | "segment_result"
    | "segment_timeout"
    | "hold"
    | "finalize"
    | "carry"
    | "carry_expired";
  who: string;
  seq?: number;
  detail?: string;
};

type SpeakerState = {
  speaking: boolean;
  speechStartAt?: number;
  lastVoiceAt?: number;
  speechEndAt?: number;
  nextSeq: number | null;
  queued: Set<number>;
  results: Map<number, SegmentResult | null>;
  guards: Map<number, unknown>;
  text: string;
  uncertain: boolean;
  segments: number;
  transcribedAt?: number;
  timer: unknown;
  carry: { text: string; at: number } | null;
  carried: boolean;
};

export class UtteranceAssembler {
  private readonly clock: Clock;
  private readonly config: CompletionConfig;
  private readonly onFinal: (u: FinalUtterance) => void;
  private readonly onDebug?: (e: AssemblerDebugEvent) => void;
  private speakers = new Map<string, SpeakerState>();
  private counter = 0;

  constructor(opts: {
    onFinal: (u: FinalUtterance) => void;
    onDebug?: (e: AssemblerDebugEvent) => void;
    clock?: Clock;
    config?: Partial<CompletionConfig>;
  }) {
    this.clock = opts.clock || realClock;
    this.config = { ...DEFAULT_COMPLETION, ...(opts.config || {}) };
    this.onFinal = opts.onFinal;
    this.onDebug = opts.onDebug;
  }

  private state(who: string): SpeakerState {
    let s = this.speakers.get(who);
    if (!s) {
      s = {
        speaking: false,
        nextSeq: null,
        queued: new Set(),
        results: new Map(),
        guards: new Map(),
        text: "",
        uncertain: false,
        segments: 0,
        timer: null,
        carry: null,
        carried: false,
      };
      this.speakers.set(who, s);
    }
    return s;
  }

  private clearTimer(s: SpeakerState) {
    if (s.timer != null) this.clock.clearTimeout(s.timer);
    s.timer = null;
  }

  speechStart(who: string, at = this.clock.now()) {
    const s = this.state(who);
    s.speaking = true;
    if (s.speechStartAt == null) s.speechStartAt = at;
    this.clearTimer(s);
    this.onDebug?.({ type: "speech_start", who });
  }

  speechEnd(who: string, at = this.clock.now(), lastVoiceAt?: number) {
    const s = this.state(who);
    s.speaking = false;
    s.speechEndAt = at;
    s.lastVoiceAt = lastVoiceAt ?? at;
    this.onDebug?.({ type: "speech_end", who });
    this.schedule(who);
  }

  segmentQueued(who: string, seq: number) {
    const s = this.state(who);
    s.queued.add(seq);
    if (s.nextSeq == null || seq < s.nextSeq) s.nextSeq = seq;
    const guard = this.clock.setTimeout(() => {
      if (!s.queued.has(seq) || s.results.has(seq)) return;
      this.onDebug?.({ type: "segment_timeout", who, seq });
      this.segmentResult(who, seq, null);
    }, this.config.orderTimeoutMs);
    s.guards.set(seq, guard);
    this.clearTimer(s);
    this.onDebug?.({ type: "segment_queued", who, seq });
  }

  /** `null` means the segment failed or was dropped; ordering continues past it. */
  segmentResult(who: string, seq: number, result: SegmentResult | null) {
    const s = this.speakers.get(who);
    if (!s || !s.queued.has(seq) || s.results.has(seq)) return;
    s.results.set(seq, result);
    const guard = s.guards.get(seq);
    if (guard != null) this.clock.clearTimeout(guard);
    s.guards.delete(seq);
    this.onDebug?.({ type: "segment_result", who, seq, detail: result ? "ok" : "empty" });
    this.drain(who, s);
    this.schedule(who);
  }

  private drain(who: string, s: SpeakerState) {
    while (s.nextSeq != null && s.results.has(s.nextSeq)) {
      const seq = s.nextSeq;
      const r = s.results.get(seq) ?? null;
      s.results.delete(seq);
      s.queued.delete(seq);
      s.nextSeq = seq + 1;
      const text = r?.text?.trim();
      if (!text) continue;
      if (!s.text && s.carry) {
        if (this.clock.now() - s.carry.at <= this.config.carryMs) {
          s.text = s.carry.text;
          s.carried = true;
        } else {
          this.onDebug?.({ type: "carry_expired", who });
        }
        s.carry = null;
      }
      s.text = mergeOverlap(s.text, text);
      s.segments += 1;
      s.uncertain = s.uncertain || Boolean(r?.uncertain);
      if (r?.transcribedAt != null) s.transcribedAt = r.transcribedAt;
    }
  }

  private schedule(who: string) {
    const s = this.speakers.get(who);
    if (!s) return;
    this.clearTimer(s);
    if (s.speaking || s.queued.size > 0 || !s.text) return;
    const now = this.clock.now();
    let delay = this.config.stableMs;
    if (!isLikelyComplete(s.text, "strict")) {
      delay = Math.max(this.config.stableMs, (s.speechEndAt ?? now) + this.config.incompleteHoldMs - now);
      this.onDebug?.({ type: "hold", who, detail: `${Math.round(delay)}ms` });
    }
    s.timer = this.clock.setTimeout(() => this.finalize(who), delay);
  }

  private finalize(who: string) {
    const s = this.speakers.get(who);
    if (!s) return;
    s.timer = null;
    if (s.speaking || s.queued.size > 0 || !s.text) return;
    const complete = isLikelyComplete(s.text, "lenient");
    const utterance: FinalUtterance = {
      id: `${who}-${++this.counter}`,
      who,
      text: s.text,
      complete,
      uncertain: s.uncertain,
      carried: s.carried,
      segments: s.segments,
      speechStartAt: s.speechStartAt,
      lastVoiceAt: s.lastVoiceAt,
      speechEndAt: s.speechEndAt,
      transcribedAt: s.transcribedAt,
      finalizedAt: this.clock.now(),
    };
    if (!complete) {
      s.carry = { text: s.text, at: utterance.finalizedAt };
      this.onDebug?.({ type: "carry", who });
    }
    s.text = "";
    s.uncertain = false;
    s.carried = false;
    s.segments = 0;
    s.speechStartAt = undefined;
    s.transcribedAt = undefined;
    this.onDebug?.({ type: "finalize", who, detail: complete ? "complete" : "incomplete" });
    this.onFinal(utterance);
  }

  /** A capture lane died or was switched off: treat it as end of speech so queued words still finalize. */
  laneStopped(who: string, at = this.clock.now()) {
    const s = this.speakers.get(who);
    if (!s || !s.speaking) return;
    this.speechEnd(who, at);
  }

  /** True while a speaker is talking or has transcriptions outstanding. */
  isBusy(who: string): boolean {
    const s = this.speakers.get(who);
    return Boolean(s && (s.speaking || s.queued.size > 0 || s.text));
  }

  reset() {
    for (const s of this.speakers.values()) {
      this.clearTimer(s);
      for (const g of s.guards.values()) this.clock.clearTimeout(g);
    }
    this.speakers.clear();
  }
}

/* ------------------------------------------------------------------ */
/* Question gate: should this utterance get an automatic answer?       */
/* ------------------------------------------------------------------ */

export type GateDecision = {
  accept: boolean;
  reason:
    | "ok"
    | "speaker_not_answered"
    | "incomplete"
    | "filler"
    | "too_short"
    | "not_question"
    | "duplicate";
  question: string;
  questionId: string;
  followUp: boolean;
};

export class QuestionGate {
  private readonly clock: Clock;
  private readonly dedupeWindowMs: number;
  private readonly followUpWindowMs: number;
  private recent: { norm: string; at: number }[] = [];
  private lastAcceptedAt: number | null = null;

  constructor(opts: { clock?: Clock; dedupeWindowMs?: number; followUpWindowMs?: number } = {}) {
    this.clock = opts.clock || realClock;
    this.dedupeWindowMs = opts.dedupeWindowMs ?? 30_000;
    this.followUpWindowMs = opts.followUpWindowMs ?? 5 * 60_000;
  }

  evaluate(
    u: { text: string; complete: boolean },
    ctx: { answerable: boolean },
  ): GateDecision {
    const question = u.text.trim().replace(/\s+/g, " ").slice(0, 600);
    const norm = normalizeText(question);
    const base = { question, questionId: hashId(norm), followUp: false };
    if (!ctx.answerable) return { ...base, accept: false, reason: "speaker_not_answered" };
    if (!u.complete) return { ...base, accept: false, reason: "incomplete" };
    if (isFiller(question)) return { ...base, accept: false, reason: "filler" };

    const now = this.clock.now();
    const followUp =
      isFollowUp(question) &&
      this.lastAcceptedAt != null &&
      now - this.lastAcceptedAt <= this.followUpWindowMs;
    if (!followUp && norm.length < 8) return { ...base, accept: false, reason: "too_short" };
    if (!followUp && !looksLikeQuestion(question)) {
      return { ...base, accept: false, reason: "not_question" };
    }

    this.recent = this.recent.filter((r) => now - r.at <= this.dedupeWindowMs);
    const dup = this.recent.some((r) => {
      if (r.norm === norm) return true;
      const ratio = Math.min(r.norm.length, norm.length) / Math.max(r.norm.length, norm.length);
      return ratio >= 0.8 && similarity(r.norm, norm) >= 0.85;
    });
    // A bare follow-up ("Why?") may legitimately repeat; only dedupe full questions.
    if (dup && !followUp) return { ...base, followUp, accept: false, reason: "duplicate" };

    this.recent.push({ norm, at: now });
    if (this.recent.length > 12) this.recent.shift();
    this.lastAcceptedAt = now;
    return { ...base, followUp, accept: true, reason: "ok" };
  }

  reset() {
    this.recent = [];
    this.lastAcceptedAt = null;
  }
}

/* ------------------------------------------------------------------ */
/* Answer sequencing: newest question wins, no duplicates, no stale UI */
/* ------------------------------------------------------------------ */

export type AnswerTicket = { id: number; utteranceId?: string; signal: AbortSignal };

export class AnswerSequencer {
  private seq = 0;
  private current: { id: number; controller: AbortController } | null = null;
  private answered = new Set<string>();

  /** Returns null when this utterance already produced an answer. Supersedes any running answer. */
  begin(utteranceId?: string): AnswerTicket | null {
    if (utteranceId) {
      if (this.answered.has(utteranceId)) return null;
      this.answered.add(utteranceId);
      if (this.answered.size > 200) {
        const first = this.answered.values().next().value;
        if (first !== undefined) this.answered.delete(first);
      }
    }
    this.current?.controller.abort();
    const controller = new AbortController();
    const id = ++this.seq;
    this.current = { id, controller };
    return { id, utteranceId, signal: controller.signal };
  }

  isCurrent(id: number): boolean {
    return this.current?.id === id && !this.current.controller.signal.aborted;
  }

  finish(id: number) {
    if (this.current?.id === id) this.current = null;
  }

  cancel() {
    this.current?.controller.abort();
    this.current = null;
  }

  reset() {
    this.cancel();
    this.answered.clear();
  }
}

/* ------------------------------------------------------------------ */
/* Conversation context selection                                      */
/* ------------------------------------------------------------------ */

export type Exchange = { question: string; answer: string };

const STOPWORDS = new Set(
  "about above after again also another because been before being between both could does doing during each from further have having here into itself just more most other over same should some such than that their them then there these they this those through under until very what when where which while will with would your you're yourself tell explain describe please".split(
    " ",
  ),
);

function keywords(text: string): Set<string> {
  return new Set(
    normalizeText(text)
      .split(" ")
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
  );
}

/**
 * Pick the exchanges worth sending with a live question: the last few verbatim, plus older
 * ones that share topic words with the question. Keeps prompts small and follow-ups grounded.
 */
export function selectHistory(
  question: string,
  exchanges: Exchange[],
  opts: { recent?: number; max?: number } = {},
): Exchange[] {
  const recentCount = opts.recent ?? 3;
  const max = Math.max(recentCount, opts.max ?? 6);
  const rows = exchanges.filter((e) => e.question.trim());
  const recent = rows.slice(-recentCount);
  const older = rows.slice(0, Math.max(0, rows.length - recentCount));
  const q = keywords(question);
  const relevant = older
    .map((e, i) => {
      const k = keywords(`${e.question} ${e.answer.slice(0, 300)}`);
      let score = 0;
      for (const w of q) if (k.has(w)) score++;
      return { e, i, score };
    })
    .filter((r) => r.score >= 1)
    .sort((a, b) => b.score - a.score || b.i - a.i)
    .slice(0, max - recent.length)
    .sort((a, b) => a.i - b.i)
    .map((r) => r.e);
  return [...relevant, ...recent].map(({ question: qq, answer }) => ({
    question: qq.slice(0, 600),
    answer: answer.slice(0, 1200),
  }));
}

/* ------------------------------------------------------------------ */
/* Instrumentation                                                     */
/* ------------------------------------------------------------------ */

export type TimelineEvent =
  | "speechStart"
  | "lastVoice"
  | "speechEnd"
  | "transcriptRequest"
  | "transcriptResponse"
  | "finalized"
  | "contextStart"
  | "contextEnd"
  | "llmRequest"
  | "firstToken"
  | "answerComplete";

export type PipelineCounter =
  | "utterances"
  | "incomplete"
  | "answered"
  | "answerFailed"
  | "answerSuperseded"
  | "duplicate"
  | "skipped"
  | "transcriptionErrors"
  | "transcriptionRetries"
  | "segmentsDropped";

export type LatencySummary = {
  audioToTranscriptMs?: number;
  finalWordToFinalizedMs?: number;
  finalizedToFirstTokenMs?: number;
  finalizedToCompleteMs?: number;
  endToEndMs?: number;
};

function diff(a?: number, b?: number) {
  return a == null || b == null ? undefined : Math.round(b - a);
}

export class PipelineMetrics {
  private readonly clock: Clock;
  readonly counters: Record<PipelineCounter, number> = {
    utterances: 0,
    incomplete: 0,
    answered: 0,
    answerFailed: 0,
    answerSuperseded: 0,
    duplicate: 0,
    skipped: 0,
    transcriptionErrors: 0,
    transcriptionRetries: 0,
    segmentsDropped: 0,
  };
  private timelines = new Map<string, Partial<Record<TimelineEvent, number>>>();

  constructor(clock: Clock = realClock) {
    this.clock = clock;
  }

  mark(utteranceId: string, event: TimelineEvent, at = this.clock.now()) {
    let t = this.timelines.get(utteranceId);
    if (!t) {
      t = {};
      this.timelines.set(utteranceId, t);
      if (this.timelines.size > 50) {
        const first = this.timelines.keys().next().value;
        if (first !== undefined) this.timelines.delete(first);
      }
    }
    if (t[event] == null) t[event] = at;
  }

  count(name: PipelineCounter, by = 1) {
    this.counters[name] += by;
  }

  summarize(utteranceId: string): LatencySummary {
    const t = this.timelines.get(utteranceId) || {};
    return {
      audioToTranscriptMs: diff(t.speechEnd, t.transcriptResponse),
      finalWordToFinalizedMs: diff(t.lastVoice, t.finalized),
      finalizedToFirstTokenMs: diff(t.finalized, t.firstToken),
      finalizedToCompleteMs: diff(t.finalized, t.answerComplete),
      endToEndMs: diff(t.lastVoice, t.firstToken),
    };
  }

  rates() {
    const c = this.counters;
    const decided = c.answered + c.answerFailed + c.duplicate + c.skipped;
    return {
      autoAnswerSuccessRate: decided ? c.answered / Math.max(1, c.answered + c.answerFailed) : null,
      incompleteRate: c.utterances ? c.incomplete / c.utterances : null,
      duplicateRate: decided ? c.duplicate / decided : null,
    };
  }

  reset() {
    this.timelines.clear();
    for (const k of Object.keys(this.counters) as PipelineCounter[]) this.counters[k] = 0;
  }
}
