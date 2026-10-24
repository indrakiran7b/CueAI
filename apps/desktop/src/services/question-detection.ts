/**
 * Lightweight question / interview-prompt filtering for live auto-answers.
 * Turn boundaries come from turn-detector.ts; this decides whether a finished
 * turn is worth answering (filler, call logistics, duplicates).
 */

import { looksTruncatedTranscript } from "./speech-capture";

export type QuestionDecision = {
  accept: boolean;
  question: string;
  reason: string;
  questionId?: string;
};

const MAX_RECENT = 8;
const DEDUPE_WINDOW_MS = 45_000;
const MIN_CHARS = 10;
const MAX_CHARS = 600;

const recent: { norm: string; at: number; id: string }[] = [];
const rolling: { who: string; text: string; at: number }[] = [];
const processingIds = new Set<string>();

const WH =
  /^(what|whats|what's|why|how|when|where|who|whom|which|whose|can|could|would|should|do|does|did|is|are|was|were|will|have|has|had)\b/i;

const INTERVIEW =
  /\b(tell me|walk me through|explain|describe|share (your|an?)|talk about|give me an example|how (did|do|would) you|what (is|are|was|were|do|does|did|would)|why (did|do|would|is|are)|can you|could you|please explain|introduce yourself|about yourself|your (project|experience|background))\b/i;

const FILLER_ONLY =
  /^(um+|uh+|hmm+|mm+|yeah|yep|yup|ok|okay|right|sure|thanks|thank you|hello|hi|hey|bye|let'?s move on|next question)\.?$/i;

/** Call logistics and rhetorical tags end in "?" but are not interview questions. */
const NOT_A_QUESTION =
  /^(can|could) (you|everyone|everybody) (hear|see) (me|us|my screen|the screen|it)\b|^(is|are) (my|the) (screen|audio|mic|microphone|video|camera)\b|^am i (audible|visible|on mute|muted)\b|^are you able to (hear|see) (me|my screen)\b|^(can|shall) (we|i) (start|begin|get started|share my screen)\b|^(is|are) (this|that|everything|we) (ok|okay|fine|good|clear)\b|^(you know|right|okay|ok|correct|isn'?t it|no)\?$|^(how are you( doing)?( today)?|how'?s it going|how is your day( going)?|did you have lunch)[?.!]*$/i;

/** Short follow-ups that only make sense after an earlier answer. */
const SHORT_FOLLOW_UP =
  /^(why|why not|how|how so|really|such as|for example|like what|meaning|elaborate|go on|and then|what else)[?.!]*$/i;

const INCOMPLETE_TAIL =
  /\b(and|or|but|the|a|an|to|of|for|with|in|on|at|my|your|our|from|into|using|via|through|by|is|are|was|were)$/i;

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Light cleanup only — never rewrite or shorten the spoken question. */
export function cleanQuestionText(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return t;
  return t.replace(/^[a-z]/, (ch) => ch.toUpperCase());
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
  if (looksTruncatedTranscript(t)) return true;
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

/** Answered questions in this session, sent with each request for follow-up context. */
const MAX_EXCHANGES = 12;
const exchanges: { question: string; answer: string }[] = [];

export function rememberExchange(question: string, answer: string) {
  const q = question.trim().slice(0, MAX_CHARS);
  const a = answer.trim().slice(0, 1200);
  if (!q || !a) return;
  const last = exchanges[exchanges.length - 1];
  if (last && normalize(last.question) === normalize(q)) {
    last.answer = a;
    return;
  }
  exchanges.push({ question: q, answer: a });
  while (exchanges.length > MAX_EXCHANGES) exchanges.shift();
}

export function getRecentExchanges(): { question: string; answer: string }[] {
  return exchanges.map((e) => ({ ...e }));
}

export function clearQuestionMemory() {
  recent.length = 0;
  rolling.length = 0;
  exchanges.length = 0;
  processingIds.clear();
}

export function beginQuestionProcessing(questionId: string): boolean {
  if (processingIds.has(questionId)) return false;
  processingIds.add(questionId);
  return true;
}

export function endQuestionProcessing(questionId: string) {
  processingIds.delete(questionId);
}

const FILLER_WORD = /^(um+|uh+|hmm+|mm+|erm|ah+|so|well|like|yeah|yep|ok|okay|right|alright|you|know|i|mean)$/i;

export function isFillerOnly(text: string): boolean {
  const t = text.trim();
  if (FILLER_ONLY.test(t)) return true;
  const words = t.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every((w) => FILLER_WORD.test(w));
}

export function evaluateQuestion(
  text: string,
  opts?: {
    who?: string;
    allowSelfQuestions?: boolean;
    finalized?: boolean;
    /** Accept interviewer speech that fails WH/INTERVIEW heuristics (System finals). */
    forceSystem?: boolean;
    /** The turn detector already waited for the end of the sentence. */
    turnFinalized?: boolean;
  },
): QuestionDecision {
  const raw = text.trim().replace(/\s+/g, " ").slice(0, MAX_CHARS);
  const shortFollowUp = exchanges.length > 0 && SHORT_FOLLOW_UP.test(raw);
  if (raw.length < MIN_CHARS && !shortFollowUp) {
    return { accept: false, question: raw, reason: "too_short" };
  }
  if (isFillerOnly(raw)) {
    return { accept: false, question: raw, reason: "filler" };
  }
  // Short only: "Can you see my screen and explain this query?" is a real question.
  if (raw.split(" ").length <= 9 && NOT_A_QUESTION.test(raw)) {
    return { accept: false, question: raw, reason: "logistics" };
  }
  // After stitch finalization, do not reject for missing "?" (Whisper rarely emits it).
  // forceSystem only relaxes "looks like a question" — never skip truncation checks.
  const forStitch = opts?.finalized === true ? false : true;
  if (!opts?.turnFinalized && !shortFollowUp && (isIncomplete(raw, forStitch) || looksTruncatedTranscript(raw))) {
    return { accept: false, question: raw, reason: "incomplete" };
  }
  if (!looksLikeQuestion(raw) && !opts?.forceSystem && !shortFollowUp) {
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
