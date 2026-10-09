/**
 * Offline checks for utterance completeness + first-paint buffering.
 * Does not log private questions as production metrics — this is a unit script.
 */
import assert from "node:assert/strict";

const SPEECH_END_SILENCE_MS = 450;

function adaptiveSilenceMs(speechDurationMs) {
  if (speechDurationMs < 900) return Math.min(600, SPEECH_END_SILENCE_MS + 150);
  if (speechDurationMs < 1600) return Math.min(600, SPEECH_END_SILENCE_MS + 70);
  return SPEECH_END_SILENCE_MS;
}

const LIKELY_CONTINUES =
  /^(generative|traditional|machine|object|oriented|cloud|rest|neural|artificial|natural|large|language|difference|differences|between|gen|generativ)$/i;
const INCOMPLETE_TAIL =
  /\b(and|or|but|the|a|an|to|of|for|with|in|on|at|my|your|our|from|into|using|via|through|by|is|are|was|were|what|how|why|who|which|can|could|would|should|explain|describe|difference|between|versus|vs)$/i;
const HANGING_STEM =
  /^(what is|what are|how does|how do|how is|how are|why is|why are|explain|what is the difference between|can you explain|could you explain)$/i;

function looksTruncatedTranscript(text) {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return true;
  if (/[.!?]$/.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length <= 2) return true;
  if (INCOMPLETE_TAIL.test(t)) return true;
  if (HANGING_STEM.test(t)) return true;
  const last = words[words.length - 1] || "";
  return words.length <= 4 && LIKELY_CONTINUES.test(last);
}

function isFirstMeaningfulAnswer(text) {
  const t = text.trim();
  if (t.length >= 18) return true;
  if (t.length >= 7 && /\s/.test(t)) return true;
  if (t.length >= 12 && /[A-Za-z]{4,}/.test(t)) return true;
  return false;
}

function cleanQuestionText(text) {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return t;
  return t.replace(/^[a-z]/, (ch) => ch.toUpperCase());
}

function needsLiveKnowledge(question) {
  const q = question.toLowerCase();
  return /\b((my|our|this|the)\s+)?(project|resume|experience|background|company|knowledge base|codebase|policy|onboarding|handbook|document|wiki)\b|\b(i|we)\s+(used|built|implemented|worked)\b/.test(
    q,
  );
}

assert.equal(adaptiveSilenceMs(400), 600);
assert.equal(adaptiveSilenceMs(2000), 450);

assert.equal(looksTruncatedTranscript("What is"), true);
assert.equal(looksTruncatedTranscript("What is Generative"), true);
assert.equal(looksTruncatedTranscript("What is Gen"), true);
assert.equal(looksTruncatedTranscript("What is Generative AI?"), false);
assert.equal(looksTruncatedTranscript("What is Python"), false);
assert.equal(looksTruncatedTranscript("What is RAG"), false);
assert.equal(looksTruncatedTranscript("What is an API"), false);

assert.equal(isFirstMeaningfulAnswer("G"), false);
assert.equal(isFirstMeaningfulAnswer("Ge"), false);
assert.equal(isFirstMeaningfulAnswer("Gen"), false);
assert.equal(isFirstMeaningfulAnswer("What is"), true);
assert.equal(isFirstMeaningfulAnswer("Generative AI is"), true);

assert.equal(cleanQuestionText("what is Generative AI?"), "What is Generative AI?");
assert.equal(cleanQuestionText("What is Generative AI?"), "What is Generative AI?");

assert.equal(needsLiveKnowledge("What is Generative AI?"), false);
assert.equal(needsLiveKnowledge("What is RAG?"), false);
assert.equal(needsLiveKnowledge("What is our company's onboarding process?"), true);
assert.equal(needsLiveKnowledge("What does our security policy say about passwords?"), true);

console.log("speech-completeness checks passed");
