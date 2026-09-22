/**
 * Live interview / meeting answer contract.
 * Medium-depth, speakable answers — not one-liners, not essays.
 */

export type LiveAnswerMode = "answer" | "summarize" | "actions" | "risks" | "explain" | "screen";

export type LiveTranscriptLine = { who: string; text: string };

export type LiveAnswerRequest = {
  prompt: string;
  transcript?: LiveTranscriptLine[];
  mode?: LiveAnswerMode;
  sessionContext?: string;
};

export type LiveAnswerResponse = {
  ok: true;
  answer: string;
  confidence: number;
  model: string;
  provider: "groq" | "gemini" | "qwen";
};

/** How many transcript lines to send; keep small for live latency. */
export const LIVE_TRANSCRIPT_WINDOW = 8;

/** Token budget for medium interview answers (roughly 80–250 words). */
export const LIVE_ANSWER_MAX_TOKENS = 520;

const MODE_INSTRUCTIONS: Record<LiveAnswerMode, string> = {
  answer:
    "Give a medium-depth interview-ready answer. Cover the important points an interviewer would expect (what / why / how / features / example as relevant). Target roughly 80–180 words for typical technical questions; go up to ~250 words only for complex topics. Never answer with a single short sentence.",
  summarize: "Summarize what has been discussed so far in at most 5 short bullets.",
  actions: "List concrete action items with owner and due date when either was stated.",
  risks: "Name the risks or objections that are live right now, most urgent first.",
  explain:
    "Explain the topic in clear language suitable for speaking aloud — medium depth, not a textbook chapter.",
  screen:
    "Look at the attached screenshot. Identify the question, coding problem, multiple-choice item, or task. Answer it with medium-depth interview quality. For MCQ give the option and a short reason. Ignore CueAI UI. Lead with the direct answer.",
};

/** Guess the mode from a chip label or free-text prompt. */
export function inferMode(prompt: string): LiveAnswerMode {
  const q = prompt.toLowerCase();
  if (
    q.includes("screenshot") ||
    q.includes("on screen") ||
    q.includes("this screen") ||
    q.includes("what's happening") ||
    q.includes("what is happening")
  ) {
    return "screen";
  }
  if (q.includes("summar")) return "summarize";
  if (q.includes("action") || q.includes("todo") || q.includes("next step")) return "actions";
  if (q.includes("risk") || q.includes("objection") || q.includes("concern")) return "risks";
  if (q.includes("explain") || q.includes("simply") || q.includes("plain")) return "explain";
  return "answer";
}

export function buildSystemInstruction(profileContext: string, hasBriefing: boolean): string {
  return [
    "You are CueAI, a real-time technical interview assistant.",
    "",
    "Goal: help the user give strong, natural, technically accurate interview answers they can say out loud.",
    "",
    "LENGTH:",
    "- Do not give answers so short that important expected information is missing.",
    "- Do not give unnecessarily long textbook explanations.",
    "- Prefer medium depth. Rough guide: simple definitions ~80–140 words; moderate questions ~100–180 words; complex topics ~150–250 words.",
    "- Adapt length to complexity. Never answer a definition question with only one sentence.",
    "",
    "STRUCTURE (adapt to question type — do NOT force every section every time):",
    "- Definition: what it is → why used → key features → common uses → brief example.",
    "- Comparison: define both → key differences → practical implication.",
    "- Why: reason → technical benefits → project relevance if verified → trade-offs if useful.",
    "- How: high-level approach → technologies → steps → security notes if relevant.",
    "- Project: purpose → problem → architecture → tech → implementation → result (only from verified data).",
    "- Behavioral: Situation → Task → Action → Result using verified experience only.",
    "- Coding: approach → why it works → solution → complexity/edge cases briefly.",
    "",
    "NATURALNESS:",
    "- Sound like a knowledgeable candidate speaking, not Wikipedia, docs, or a search result.",
    "- Lead with the direct answer. No preamble, no restating the question, no sign-off.",
    "- Avoid: \"As an AI…\", \"According to my research…\", \"Let's delve into…\", \"comprehensive overview…\".",
    "- Use short bullets only when they improve clarity (lists of >2 items, comparisons).",
    "- Write in first person when the user needs something to say about themselves.",
    "",
    "VERIFIED EXPERIENCE ONLY:",
    "- SESSION BRIEFING, resume, and Knowledge Base excerpts = verified user data.",
    "- You may say \"I used…\" / \"In my project…\" ONLY when that tech or experience appears in verified data.",
    "- If not verified, use general phrasing: \"A common approach is…\" / \"This can be implemented with…\".",
    "- Never invent employers, dates, metrics, degrees, libraries, or project details.",
    "",
    "QUALITY CHECK before finishing:",
    "- Did I answer the actual question?",
    "- Did I include the important concepts an interviewer expects?",
    "- Is it medium length, accurate, and speakable?",
    "- Did I avoid fabricating personal experience?",
    "",
    profileContext ? `\nAbout this user:\n${profileContext}` : "",
    hasBriefing
      ? "\nA session briefing is attached (resume / job / knowledge excerpts). Prefer it for personal or project questions. Never claim the resume is missing if CANDIDATE RESUME appears below."
      : "\nNo resume is attached yet. For personal/project questions, give a strong general technical answer and note that personalization improves after a resume is uploaded — do not invent a fake bio.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildUserPrompt(input: {
  prompt: string;
  transcript?: LiveTranscriptLine[];
  mode: LiveAnswerMode;
  sessionContext?: string;
  knowledgeContext?: string;
}): string {
  const lines = (input.transcript || [])
    .slice(-LIVE_TRANSCRIPT_WINDOW)
    .map((l) => `${l.who}: ${l.text}`)
    .join("\n");

  const knowledge = input.knowledgeContext?.trim();

  return [
    "SESSION BRIEFING (resume, role, company — verified user data only):",
    '"""',
    input.sessionContext?.trim() || "(none provided)",
    '"""',
    "",
    knowledge
      ? [
          "KNOWLEDGE BASE EXCERPTS (verified docs — use only these for user-specific claims):",
          '"""',
          knowledge,
          '"""',
          "",
        ].join("\n")
      : "",
    "LIVE TRANSCRIPT (most recent last):",
    '"""',
    lines || "(nothing transcribed yet)",
    '"""',
    "",
    `TASK: ${MODE_INSTRUCTIONS[input.mode]}`,
    input.mode === "screen"
      ? "A screenshot is attached. Answer the visible question/task. Do not describe the UI."
      : "If this is an interview question, give a ready-to-say medium-depth answer. Use verified resume/KB for personal experience; otherwise keep experience claims general.",
    "",
    "USER REQUEST:",
    '"""',
    input.prompt.slice(0, 2000),
    '"""',
  ]
    .filter(Boolean)
    .join("\n");
}

export function clampConfidence(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0.6;
  return Math.max(0.05, Math.min(1, n > 1 ? n / 100 : n));
}
