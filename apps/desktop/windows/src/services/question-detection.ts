/**
 * Lightweight question / interview-prompt detection for live auto-answers.
 * Stitches consecutive STT fragments so questions are not cut mid-sentence,
 * with a short endpoint window for low latency.
 */

export type QuestionDecision = {
  accept: boolean;
  question: string;
  reason: string;
  questionId?: string;
};

const MAX_RECENT = 8;
const DEDUPE_WINDOW_MS = 45_000;
/** Wait for trailing STT fragments when utterance looks incomplete. */
const STITCH_WINDOW_MS = 700;
const MIN_CHARS = 10;
const MAX_CHARS = 600;

const recent: { norm: string; at: number; id: string }[] = [];
const rolling: { who: string; text: string; at: number }[] = [];
const processingIds = new Set<string>();

/** In-progress utterance assembly per speaker. */
const pending: Record<
  string,
  {
    parts: string[];
    updatedAt: number;
    audioEndAt?: number;
    transcribedAt?: number;
    timer: ReturnType<typeof setTimeout> | null;
  }
> = {};

const WH =
  /^(what|whats|what's|why|how|when|where|who|whom|which|whose|can|could|would|should|do|does|did|is|are|was|were|will|have|has|had)\b/i;

const INTERVIEW =
  /\b(tell me|walk me through|explain|describe|share (your|an?)|talk about|give me an example|how (did|do|would) you|what (is|are|was|were|do|does|did|would)|why (did|do|would|is|are)|can you|could you|please explain|introduce yourself|about yourself|your (project|experience|background))\b/i;

const FILLER_ONLY =
  /^(um+|uh+|hmm+|mm+|yeah|yep|yup|ok|okay|right|sure|thanks|thank you|hello|hi|hey|bye|let'?s move on|next question)\.?$/i;

const INCOMPLETE_TAIL =
  /\b(and|or|but|the|a|an|to|of|for|with|in|on|at|my|your|our|from|into|using|via|through|by)$/i;

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function questionIdFor(norm: string) {
  let h = 0;
  for (let i = 0; i < norm.length; i++) h = (h * 31 + norm.charCodeAt(i)) >>> 0;
  return `q_${h.toString(16)}`;
}

function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (t.endsWith("?")) return true;
  if (WH.test(t)) return true;
  if (INTERVIEW.test(t)) return true;
  return false;
}

/**
 * @param forStitch - when true (during assembly), wait longer for mid-sentence cuts.
 *   When false (after stitch timeout / final eval), accept interviewer prompts even
 *   without trailing "?" — Whisper rarely emits question marks.
 */
function isIncomplete(text: string, forStitch = true): boolean {
  const t = text.trim();
  if (t.endsWith("?")) return false;
  if (t.length < 24 && !WH.test(t) && !INTERVIEW.test(t)) return true;
  if (INCOMPLETE_TAIL.test(t) && !t.endsWith("?")) return true;
  // During stitching only: short WH/INTERVIEW without punct may still be growing.
  if (
    forStitch &&
    (WH.test(t) || INTERVIEW.test(t)) &&
    t.length < 40 &&
    !/[.!?]$/.test(t)
  ) {
    return true;
  }
  return false;
}

function isDuplicate(norm: string, now: number): boolean {
  while (recent.length && now - recent[0]!.at > DEDUPE_WINDOW_MS) recent.shift();
  for (const row of recent) {
    if (row.norm === norm) return true;
    if (norm.length > 20 && (row.norm.includes(norm) || norm.includes(row.norm))) {
      return true;
    }
  }
  return false;
}

export function pushRollingTranscript(who: string, text: string) {
  const cleaned = text.trim().slice(0, MAX_CHARS);
  if (!cleaned) return;
  rolling.push({ who, text: cleaned, at: Date.now() });
  while (rolling.length > 12) rolling.shift();
}

export function getRollingContext(limit = 3): { who: string; text: string }[] {
  return rolling.slice(-limit).map(({ who, text }) => ({ who, text }));
}

export function clearQuestionMemory() {
  recent.length = 0;
  rolling.length = 0;
  processingIds.clear();
  for (const key of Object.keys(pending)) {
    const bag = pending[key];
    if (bag?.timer) clearTimeout(bag.timer);
    delete pending[key];
  }
}

export function beginQuestionProcessing(questionId: string): boolean {
  if (processingIds.has(questionId)) return false;
  processingIds.add(questionId);
  return true;
}

export function endQuestionProcessing(questionId: string) {
  processingIds.delete(questionId);
}

export function isFillerOnly(text: string): boolean {
  return FILLER_ONLY.test(text.trim());
}

export function evaluateQuestion(
  text: string,
  opts?: {
    who?: string;
    allowSelfQuestions?: boolean;
    finalized?: boolean;
    /** Accept interviewer speech that fails WH/INTERVIEW heuristics (System finals). */
    forceSystem?: boolean;
  },
): QuestionDecision {
  const raw = text.trim().replace(/\s+/g, " ").slice(0, MAX_CHARS);
  if (raw.length < MIN_CHARS) {
    return { accept: false, question: raw, reason: "too_short" };
  }
  if (FILLER_ONLY.test(raw)) {
    return { accept: false, question: raw, reason: "filler" };
  }
  // After stitch finalization, do not reject for missing "?" (Whisper rarely emits it).
  const forStitch = opts?.finalized === true ? false : true;
  if (isIncomplete(raw, forStitch) && !opts?.forceSystem) {
    return { accept: false, question: raw, reason: "incomplete" };
  }
  if (!looksLikeQuestion(raw) && !opts?.forceSystem) {
    return { accept: false, question: raw, reason: "not_question" };
  }

  const who = opts?.who || "Speaker";
  if (who === "You" && opts?.allowSelfQuestions === false) {
    if (!raw.endsWith("?")) {
      return { accept: false, question: raw, reason: "self_speech" };
    }
  }

  const norm = normalize(raw);
  const now = Date.now();
  const questionId = questionIdFor(norm);
  if (isDuplicate(norm, now) || processingIds.has(questionId)) {
    return { accept: false, question: raw, reason: "duplicate", questionId };
  }

  recent.push({ norm, at: now, id: questionId });
  while (recent.length > MAX_RECENT) recent.shift();

  return { accept: true, question: raw, reason: "ok", questionId };
}

export type AssembledUtterance = {
  who: string;
  text: string;
  finalized: boolean;
  audioEndAt?: number;
  transcribedAt?: number;
};

/**
 * Merge consecutive STT fragments. Finalize immediately on clear `?` / complete
 * questions; otherwise wait a short stitch window for the rest of the sentence.
 */
export function assembleUtterance(
  who: string,
  text: string,
  onReady: (utterance: AssembledUtterance) => void,
  timing?: { audioEndAt?: number; transcribedAt?: number; partial?: boolean },
): void {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (!cleaned) return;

  const key = who || "Speaker";
  const now = Date.now();
  let bag = pending[key];
  if (!bag || now - bag.updatedAt > STITCH_WINDOW_MS + 400) {
    if (bag?.timer) clearTimeout(bag.timer);
    bag = { parts: [], updatedAt: now, timer: null };
    pending[key] = bag;
  }

  const last = bag.parts[bag.parts.length - 1] || "";
  if (!last || normalize(cleaned) !== normalize(last)) {
    if (last && normalize(cleaned).startsWith(normalize(last)) && cleaned.length > last.length) {
      bag.parts[bag.parts.length - 1] = cleaned;
    } else if (!last || !normalize(last).includes(normalize(cleaned))) {
      bag.parts.push(cleaned);
    }
  }
  bag.updatedAt = now;
  if (timing?.audioEndAt != null) bag.audioEndAt = timing.audioEndAt;
  if (timing?.transcribedAt != null) bag.transcribedAt = timing.transcribedAt;

  const joined = bag.parts.join(" ").replace(/\s+/g, " ").trim();
  const complete =
    joined.endsWith("?") ||
    (!isIncomplete(joined, true) && looksLikeQuestion(joined) && /[.!]$/.test(joined));

  if (bag.timer) clearTimeout(bag.timer);

  // Partial mid-speech chunks only extend the bag — never fire AI yet.
  if (timing?.partial) {
    bag.timer = setTimeout(() => {
      const current = pending[key];
      if (!current) return;
      const finalText = current.parts.join(" ").replace(/\s+/g, " ").trim();
      const meta = {
        audioEndAt: current.audioEndAt,
        transcribedAt: current.transcribedAt,
      };
      delete pending[key];
      if (finalText) {
        onReady({ who: key, text: finalText, finalized: true, ...meta });
      }
    }, STITCH_WINDOW_MS);
    return;
  }

  if (complete && joined.length >= MIN_CHARS) {
    const meta = { audioEndAt: bag.audioEndAt, transcribedAt: bag.transcribedAt };
    delete pending[key];
    onReady({ who: key, text: joined, finalized: true, ...meta });
    return;
  }

  bag.timer = setTimeout(() => {
    const current = pending[key];
    if (!current) return;
    const finalText = current.parts.join(" ").replace(/\s+/g, " ").trim();
    const meta = {
      audioEndAt: current.audioEndAt,
      transcribedAt: current.transcribedAt,
    };
    delete pending[key];
    if (finalText) onReady({ who: key, text: finalText, finalized: true, ...meta });
  }, STITCH_WINDOW_MS);
}
