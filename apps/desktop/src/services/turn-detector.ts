/**
 * Decides when the speaker has finished the question.
 *
 * Inputs are speech activity (from the segmenter) and transcripts (from the
 * queue). A turn is finalized only when the speaker is silent, no transcript for
 * that turn is still outstanding, and the silence since the last voiced frame
 * meets a threshold that depends on how complete the text looks. Unfinished
 * fragments ("…the difference between") are never answered on their own; they
 * are carried into the next speech on the same lane.
 */

export type TurnConfig = {
  /** Clear, complete question ("…tuple?"). */
  completeSilenceMs: number;
  /** Ends on a word that can end a question but often continues ("…comfortable with"). */
  softSilenceMs: number;
  /** Statement or instruction without a question shape. */
  neutralSilenceMs: number;
  /** Clearly unfinished ("…and", "…between", trailing comma). */
  incompleteSilenceMs: number;
  /** How long an unfinished fragment waits for its continuation. */
  carryMs: number;
};

export const DEFAULT_TURN_CONFIG: TurnConfig = {
  // A natural pause between sentences is commonly 700–1,100 ms. Finalizing
  // sooner answers the first sentence of a multi-part question and leaves the
  // rest as a separate (or rejected) turn.
  completeSilenceMs: 1400,
  softSilenceMs: 1700,
  neutralSilenceMs: 1800,
  incompleteSilenceMs: 2600,
  carryMs: 12_000,
};

export type Completeness = "complete" | "soft" | "neutral" | "incomplete";

export type FinalUtterance = {
  id: string;
  lane: string;
  text: string;
  completeness: Completeness;
  speechStartAt: number;
  lastVoiceAt: number;
  /** When the segmenter declared the last segment's speech over. */
  speechEndDetectedAt: number;
  /** When the last segment's transcription request started. */
  transcribeRequestAt: number;
  transcribedAt: number;
  finalizedAt: number;
  segments: number;
  uncertain: boolean;
};

export type TurnDebug = { lane: string; action: string; reason: string; chars?: number };

const QUESTION_START =
  /^(what|what's|whats|why|how|when|where|who|whom|which|whose|can|could|would|should|do|does|did|is|are|was|were|will|have|has|had|tell me|walk me|explain|describe|give me|talk about|share|define|compare|write|implement)\b/i;

/** Words that essentially never end a finished English question. */
const HARD_TAIL =
  /\b(and|or|but|the|a|an|between|versus|vs|than|your|my|our|their|because|whereas|including|like the|such as|so that|which is|that is)$/i;

/** Words that can end a question but often mean more is coming. */
const SOFT_TAIL = /\b(with|of|to|for|about|from|in|on|at|by|into|using|via|through|is|are|was|were)$/i;

/** Instructions are complete sentences even without a question mark. */
const IMPERATIVE_START =
  /^(tell me|walk me|explain|describe|give me|talk about|share|define|compare|write|implement|introduce yourself)\b/i;

/** "When you design X, …" is a lead-in clause, not a question yet. */
const SUBORDINATE_START = /^(when|where|if|while|since|after|before|once|as|suppose|let's say|say) (you|we|i|they|someone|a|an|the|your|our)\b/i;

const HANGING_STEM =
  /^(so |and |okay,? |alright,? )?(what is|what are|how does|how do|how is|how are|why is|why are|explain|can you explain|could you explain|what is the difference|what's the difference|tell me about|walk me through)$/i;

function bare(text: string) {
  return text.trim().replace(/[\s"'”’)]+$/, "").replace(/[.?!,;:…-]+$/, "").trim();
}

export function classifyCompleteness(text: string): Completeness {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return "incomplete";
  const core = bare(t);
  const words = core.split(" ").filter(Boolean);
  // Whisper often appends "?" to fragments, so the tail word wins over punctuation.
  if (/[,;:…-]$/.test(t)) return "incomplete";
  if (HARD_TAIL.test(core) || HANGING_STEM.test(core)) return "incomplete";
  if (words.length <= 2 && !/[?]$/.test(t)) return "incomplete";
  if (SUBORDINATE_START.test(t) && !/[?]$/.test(t)) return "soft";
  if (SOFT_TAIL.test(core)) return /[?]$/.test(t) && words.length >= 5 ? "complete" : "soft";
  if (/[?]$/.test(t)) return "complete";
  if (IMPERATIVE_START.test(t)) return /[.!]$/.test(t) ? "complete" : "soft";
  if (QUESTION_START.test(t)) return "soft";
  return "neutral";
}

function norm(w: string) {
  return w.toLowerCase().replace(/[^a-z0-9']/g, "");
}

/** Join two consecutive transcripts, removing words repeated by overlapping audio. */
export function mergeTranscripts(prev: string, next: string): string {
  const a = prev.trim();
  const b = next.trim();
  if (!a) return b;
  if (!b) return a;
  const aw = a.split(/\s+/);
  const bw = b.split(/\s+/);
  const max = Math.min(8, aw.length, bw.length);
  for (let k = max; k >= 1; k--) {
    const tail = aw.slice(-k).map(norm).join(" ");
    const head = bw.slice(0, k).map(norm).join(" ");
    if (tail && tail === head && (k >= 2 || tail.length >= 5)) {
      return [...aw, ...bw.slice(k)].join(" ");
    }
  }
  // Whisper ends fragments with "." / "?"; soften it when the sentence continues.
  const joinedA = /[.?]$/.test(a) && /^[a-z]/.test(b) ? a.slice(0, -1) + "," : a;
  return `${joinedA} ${b}`;
}

type Lane = {
  speaking: boolean;
  open: Set<number>;
  text: string;
  segments: number;
  firstSpeechAt: number;
  lastVoiceAt: number;
  speechEndDetectedAt: number;
  transcribeRequestAt: number;
  transcribedAt: number;
  uncertain: boolean;
  carry: { text: string; until: number; segments: number; startAt: number } | null;
  waitingLogged: string;
};

export type TurnDetectorOptions = {
  onFinal: (u: FinalUtterance) => void;
  onPending?: (lane: string, text: string | null) => void;
  onDrop?: (lane: string, text: string, reason: string) => void;
  onDebug?: (d: TurnDebug) => void;
  config?: Partial<TurnConfig>;
};

export class TurnDetector {
  readonly cfg: TurnConfig;
  private lanes = new Map<string, Lane>();
  private counter = 0;
  private opts: TurnDetectorOptions;

  constructor(opts: TurnDetectorOptions) {
    this.opts = opts;
    this.cfg = { ...DEFAULT_TURN_CONFIG, ...(opts.config || {}) };
  }

  private lane(name: string): Lane {
    let l = this.lanes.get(name);
    if (!l) {
      l = {
        speaking: false,
        open: new Set(),
        text: "",
        segments: 0,
        firstSpeechAt: 0,
        lastVoiceAt: 0,
        speechEndDetectedAt: 0,
        transcribeRequestAt: 0,
        transcribedAt: 0,
        uncertain: false,
        carry: null,
        waitingLogged: "",
      };
      this.lanes.set(name, l);
    }
    return l;
  }

  speechStart(lane: string, at: number) {
    const l = this.lane(lane);
    l.speaking = true;
    if (!l.firstSpeechAt) l.firstSpeechAt = at;
  }

  /** A noise burst ended without producing a segment. */
  speechDiscard(lane: string) {
    const l = this.lane(lane);
    l.speaking = false;
    if (!l.text && !l.open.size) l.firstSpeechAt = 0;
  }

  /** A final (or split) segment was cut and sent for transcription. */
  segmentEnded(
    lane: string,
    segmentId: number,
    info: { lastVoiceAt: number; endedAt: number; kind: "final" | "split" },
  ) {
    const l = this.lane(lane);
    l.open.add(segmentId);
    l.lastVoiceAt = Math.max(l.lastVoiceAt, info.lastVoiceAt);
    l.speechEndDetectedAt = info.endedAt;
    if (info.kind === "final") l.speaking = false;
  }

  /** Transcript for a final/split segment (empty text or failure still closes it). */
  transcript(
    lane: string,
    segmentId: number,
    info: { text: string; at: number; requestAt?: number; uncertain?: boolean },
  ) {
    const l = this.lane(lane);
    l.open.delete(segmentId);
    const text = info.text.trim();
    if (!text) return;
    if (info.requestAt != null) l.transcribeRequestAt = info.requestAt;
    if (!l.text && l.carry && info.at <= l.carry.until) {
      l.text = l.carry.text;
      l.segments = l.carry.segments;
      l.firstSpeechAt = l.carry.startAt;
    }
    l.carry = null;
    l.text = mergeTranscripts(l.text, text);
    l.segments += 1;
    l.transcribedAt = info.at;
    l.uncertain = l.uncertain || Boolean(info.uncertain);
    this.opts.onPending?.(lane, l.text);
  }

  /** Live preview while the speaker is still talking (never finalizes). */
  partial(lane: string, text: string) {
    const l = this.lane(lane);
    const preview = mergeTranscripts(l.text || l.carry?.text || "", text);
    if (preview) this.opts.onPending?.(lane, preview);
  }

  /** Evaluate every lane; call on each audio chunk and from a backup timer. */
  tick(now: number) {
    for (const [name, l] of this.lanes) {
      if (l.carry && now > l.carry.until && !l.text) {
        this.opts.onDrop?.(name, l.carry.text, "incomplete_expired");
        this.debug(name, "drop", "incomplete_expired", l.carry.text);
        l.carry = null;
        this.opts.onPending?.(name, null);
      }
      if (!l.text) continue;
      if (l.speaking) {
        this.waitOnce(name, l, "speaker_still_talking");
        continue;
      }
      if (l.open.size) {
        this.waitOnce(name, l, "awaiting_transcript");
        continue;
      }
      const completeness = classifyCompleteness(l.text);
      const silence = now - l.lastVoiceAt;
      const needed =
        completeness === "complete"
          ? this.cfg.completeSilenceMs
          : completeness === "soft"
            ? this.cfg.softSilenceMs
            : completeness === "neutral"
              ? this.cfg.neutralSilenceMs
              : this.cfg.incompleteSilenceMs;
      if (silence < needed) {
        this.waitOnce(name, l, `silence_${completeness}`);
        continue;
      }
      if (completeness === "incomplete") {
        l.carry = { text: l.text, until: now + this.cfg.carryMs, segments: l.segments, startAt: l.firstSpeechAt };
        this.debug(name, "hold", "incomplete_waiting_for_continuation", l.text);
        this.resetTurn(l);
        continue;
      }
      const utterance: FinalUtterance = {
        id: `${name.toLowerCase()}-${++this.counter}`,
        lane: name,
        text: l.text,
        completeness,
        speechStartAt: l.firstSpeechAt,
        lastVoiceAt: l.lastVoiceAt,
        speechEndDetectedAt: l.speechEndDetectedAt,
        transcribeRequestAt: l.transcribeRequestAt,
        transcribedAt: l.transcribedAt,
        finalizedAt: now,
        segments: l.segments,
        uncertain: l.uncertain,
      };
      this.debug(name, "finalize", completeness, l.text);
      this.resetTurn(l);
      this.opts.onPending?.(name, null);
      this.opts.onFinal(utterance);
    }
  }

  /** True while any lane holds text or outstanding transcripts. */
  busy() {
    for (const l of this.lanes.values()) if (l.text || l.open.size || l.speaking) return true;
    return false;
  }

  reset() {
    this.lanes.clear();
  }

  private resetTurn(l: Lane) {
    l.text = "";
    l.segments = 0;
    l.firstSpeechAt = 0;
    l.uncertain = false;
    l.waitingLogged = "";
  }

  private waitOnce(name: string, l: Lane, reason: string) {
    if (l.waitingLogged === reason) return;
    l.waitingLogged = reason;
    this.debug(name, "wait", reason, l.text);
  }

  private debug(lane: string, action: string, reason: string, text?: string) {
    this.opts.onDebug?.({ lane, action, reason, chars: text?.length });
  }
}
