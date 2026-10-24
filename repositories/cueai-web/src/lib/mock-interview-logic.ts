/**
 * Pure AI Mock Interview helpers: setup validation, resume grounding, prompt building,
 * and strict parsing of model output. No I/O, so it is unit-testable.
 */

import {
  MOCK_DURATIONS,
  MOCK_QUESTION_LIMIT,
  type MockAnswerEvaluation,
  type MockDifficulty,
  type MockDuration,
  type MockInterviewType,
  type MockQuestionFeedback,
  type MockReadiness,
  type MockReport,
  type MockReportCategory,
  type MockResumeProfile,
  type MockSetup,
  type MockTurn,
} from "@/lib/mock-interview-types";

export const MOCK_ASSESSMENT_LABEL = "AI practice assessment — not an official evaluation";

const DIFFICULTIES: MockDifficulty[] = ["beginner", "intermediate", "advanced"];
const TYPES: MockInterviewType[] = ["technical", "hr_behavioral", "coding", "project", "mixed"];

export const CATEGORY_LABELS: Record<string, string> = {
  technical: "Technical knowledge",
  accuracy: "Answer accuracy",
  problem_solving: "Problem-solving",
  communication: "Communication & clarity",
  structure: "Structure & confidence",
  role_fit: "Role fit & motivation",
  project_depth: "Project explanation",
};

export const CATEGORIES_BY_TYPE: Record<MockInterviewType, string[]> = {
  technical: ["technical", "accuracy", "problem_solving", "communication", "structure"],
  hr_behavioral: ["communication", "structure", "role_fit", "problem_solving"],
  coding: ["technical", "accuracy", "problem_solving", "communication", "structure"],
  project: ["project_depth", "technical", "accuracy", "problem_solving", "communication"],
  mixed: ["technical", "accuracy", "problem_solving", "project_depth", "communication", "structure"],
};

export const READINESS_LABELS: Record<MockReadiness, string> = {
  ready: "Interview-ready",
  nearly_ready: "Nearly ready",
  needs_practice: "Needs more practice",
  not_ready: "Not ready yet",
};

/** Fixed thresholds so readiness always follows the score. */
export function readinessFor(score: number): MockReadiness {
  if (score >= 80) return "ready";
  if (score >= 60) return "nearly_ready";
  if (score >= 40) return "needs_practice";
  return "not_ready";
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanMultiline(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "";
}

function cleanList(value: unknown, maxItems: number, itemMax: number): string[] {
  return Array.isArray(value) ? value.map((v) => clean(v, itemMax)).filter(Boolean).slice(0, maxItems) : [];
}

export function normalizeSetup(input: unknown): { setup: MockSetup } | { error: string } {
  const raw = (input || {}) as Record<string, unknown>;
  const jobTitle = clean(raw.jobTitle, 120);
  if (!jobTitle) return { error: "Enter the job role you are preparing for." };
  const difficulty = DIFFICULTIES.includes(raw.difficulty as MockDifficulty)
    ? (raw.difficulty as MockDifficulty)
    : "intermediate";
  const type = TYPES.includes(raw.interviewType as MockInterviewType)
    ? (raw.interviewType as MockInterviewType)
    : "mixed";
  const duration = MOCK_DURATIONS.includes(Number(raw.durationMin) as MockDuration)
    ? (Number(raw.durationMin) as MockDuration)
    : 20;
  return {
    setup: {
      jobTitle,
      jobDescription: cleanMultiline(raw.jobDescription, 8000) || undefined,
      difficulty,
      durationMin: duration,
      interviewType: type,
      resumeName: clean(raw.resumeName, 160) || undefined,
      origin: "live_session",
    },
  };
}

/** Meetings title for a mock interview session. */
export function mockMeetingTitle(setup: MockSetup): string {
  return `Mock Interview · ${setup.jobTitle}`;
}

export function questionLimitFor(duration: MockDuration): number {
  return MOCK_QUESTION_LIMIT[duration];
}

const STOPWORDS = new Set([
  "and", "the", "for", "with", "from", "into", "using", "of", "in", "on", "at", "to", "a", "an",
  "by", "as", "or", "via", "per", "our", "my", "its",
]);

function normalizeForMatch(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

function tokens(text: string): string[] {
  return normalizeForMatch(text)
    .trim()
    .split(" ")
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/** True when the phrase (or most of its words) actually appears in the resume text. */
export function isGrounded(item: string, resumeText: string, minShare = 0.6): boolean {
  const haystack = normalizeForMatch(resumeText);
  const phrase = normalizeForMatch(item).trim();
  if (!phrase) return false;
  if (haystack.includes(` ${phrase} `)) return true;
  const words = tokens(item);
  if (!words.length) return false;
  const present = words.filter((w) => haystack.includes(` ${w} `)).length;
  return present / words.length >= minShare;
}

/** Keep only profile entries the resume text supports; never adds anything. */
export function groundProfile(raw: unknown, resumeText: string): MockResumeProfile {
  const obj = (raw || {}) as Record<string, unknown>;
  const pick = (key: keyof MockResumeProfile, max: number, itemMax: number, share: number) => {
    const list = Array.isArray(obj[key]) ? (obj[key] as unknown[]) : [];
    const out: string[] = [];
    for (const entry of list) {
      const value = clean(entry, itemMax);
      if (!value || out.some((v) => v.toLowerCase() === value.toLowerCase())) continue;
      if (!isGrounded(value, resumeText, share)) continue;
      out.push(value);
      if (out.length >= max) break;
    }
    return out;
  };
  return {
    education: pick("education", 6, 200, 0.6),
    skills: pick("skills", 40, 60, 1),
    experience: pick("experience", 10, 220, 0.6),
    projects: pick("projects", 10, 220, 0.6),
    certifications: pick("certifications", 10, 160, 0.6),
  };
}

export const EMPTY_PROFILE: MockResumeProfile = { education: [], skills: [], experience: [], projects: [], certifications: [] };

export const PROFILE_SYSTEM =
  "You extract resume facts into JSON. Copy wording from the resume. Include only items explicitly written in the resume. Never infer, embellish, or add skills, employers, degrees, projects, or certifications that are not present.";

export function buildProfilePrompt(resumeText: string): string {
  return [
    "Extract these lists from the resume below. Each entry is one short line copied from the resume.",
    "- education: degree + institution (+ year if present)",
    "- skills: individual technical or professional skills, one per entry",
    "- experience: role + organization (+ dates if present), including internships",
    "- projects: project name + one-line description from the resume",
    "- certifications: certification names",
    "Use an empty list when a section is absent.",
    'Return JSON only: {"education":[],"skills":[],"experience":[],"projects":[],"certifications":[]}',
    "",
    "RESUME:",
    resumeText.slice(0, 12000),
  ].join("\n");
}

const DIFFICULTY_GUIDANCE: Record<MockDifficulty, string> = {
  beginner: "Difficulty: beginner. Ask fundamentals and straightforward questions about their listed projects; avoid deep system design.",
  intermediate: "Difficulty: intermediate. Mix fundamentals with applied questions on trade-offs, debugging, and their project decisions.",
  advanced: "Difficulty: advanced. Probe depth: design trade-offs, scalability, edge cases, and the reasoning behind their decisions.",
};

const TYPE_GUIDANCE: Record<MockInterviewType, string> = {
  technical: "Interview type: technical. Ask about concepts, tools, and technologies the candidate lists or the job requires.",
  hr_behavioral:
    "Interview type: HR / behavioral. Ask about motivation, role fit, teamwork, conflict, ownership, and failures; invite STAR-style stories.",
  coding:
    "Interview type: coding. Ask small coding or algorithm problems the candidate can explain in words (approach, complexity, edge cases), in languages they list.",
  project:
    "Interview type: project-based. Focus on the candidate's actual projects: goals, architecture, their responsibilities, technical decisions, challenges, and results.",
  mixed: "Interview type: mixed. Combine project, technical, and behavioral questions, weighted toward the role.",
};

export const INTERVIEWER_SYSTEM = [
  "You are a realistic, professional interviewer running a practice interview.",
  "Ask exactly one question at a time. Keep each question under 45 words.",
  "Prioritize the candidate's actual projects, technical decisions, tools, responsibilities, and experience from the resume, then the target job.",
  "Never assume skills, employers, experience, certifications, or project features that the resume and answers do not show; ask open questions (e.g. 'How did you…', 'Walk me through…') instead of presuming details.",
  "Never repeat a question that was already asked.",
  "Evaluate answers honestly against the rubric. Never claim the candidate demonstrated something their answer does not show.",
  "Always respond with JSON only.",
].join(" ");

export function describeCandidate(
  setup: MockSetup,
  profile: MockResumeProfile,
  resumeText: string,
  savedProfile = "",
): string {
  const parts = [
    `Target role: ${setup.jobTitle}`,
    DIFFICULTY_GUIDANCE[setup.difficulty],
    TYPE_GUIDANCE[setup.interviewType],
    setup.jobDescription
      ? `Job description:\n${setup.jobDescription.slice(0, 2500)}`
      : "No job description was provided; rely on the resume and the target role.",
  ];
  const profileLines = (Object.entries(profile) as [keyof MockResumeProfile, string[]][])
    .filter(([, list]) => list.length)
    .map(([key, list]) => `${key}: ${list.slice(0, 12).join("; ")}`);
  if (profileLines.length) parts.push(`Resume highlights:\n${profileLines.join("\n")}`);
  if (resumeText.trim()) parts.push(`Resume text (excerpt):\n${resumeText.slice(0, 3500)}`);
  if (savedProfile.trim()) {
    parts.push(
      `Candidate's self-reported profile from Settings (use to pick topics and level; do not assume anything beyond it):\n${savedProfile.slice(0, 2500)}`,
    );
  }
  return parts.join("\n\n");
}

export function buildOpeningPrompt(candidate: string): string {
  return [
    candidate,
    "",
    "Start the interview. Write a short welcome (max 2 sentences, no name assumptions) and the first question.",
    'Return JSON: {"welcome":"...","question":"...","topic":"short topic label"}',
  ].join("\n");
}

/** Last few turns in full, to keep prompts small and fast. */
function recentTranscript(turns: MockTurn[], max = 4): string {
  const start = Math.max(0, turns.length - max);
  return turns
    .slice(start)
    .map((t, i) => {
      const n = start + i + 1;
      const answer = t.skipped ? "(skipped)" : t.answer ? t.answer.slice(0, 1200) : "(no answer)";
      return `Q${n} [${t.kind}${t.topic ? `, ${t.topic}` : ""}]: ${t.question}\nA${n}: ${answer}`;
    })
    .join("\n\n");
}

export const ANSWER_RUBRIC =
  "Rubric (score 0-10): correctness, relevance to the question, clarity and structure, problem-solving, use of concrete examples, communication. 0-2 = no answer, off-topic, or wrong; 3-4 = partly relevant but vague; 5-6 = relevant with clear gaps; 7-8 = solid with specifics; 9-10 = excellent and complete.";

export function buildTurnPrompt(input: {
  candidate: string;
  turns: MockTurn[];
  allowFollowUp: boolean;
  isLast: boolean;
}): string {
  const current = input.turns[input.turns.length - 1];
  const asked = input.turns.map((t, i) => `${i + 1}. ${t.question}`).join("\n");
  return [
    input.candidate,
    "",
    "Recent conversation:",
    recentTranscript(input.turns),
    "",
    `Evaluate the candidate's answer to the latest question: "${current?.question || ""}".`,
    ANSWER_RUBRIC,
    "Be specific and fair; refer to what they actually said. A skipped question scores 0.",
    input.isLast
      ? 'This was the final question. Set next to {"type":"end"}.'
      : input.allowFollowUp
        ? "Then choose the next step: a follow-up that probes a gap or vague point in this answer, or a new main question on a different topic."
        : "Then ask a new main question on a different topic (no follow-up).",
    `Questions already asked (never repeat these):\n${asked}`,
    "Return JSON:",
    '{"evaluation":{"score":<integer 0-10>,"feedback":"one or two sentences","correct":["point the answer got right"],"missing":["key point the answer missed or got wrong"]},',
    ' "next":{"type":"follow_up|main|end","question":"...","topic":"short topic label"}}',
  ].join("\n");
}

export type ParsedTurn = {
  evaluation: MockAnswerEvaluation;
  next: { type: "follow_up" | "main" | "end"; question: string; topic: string };
};

function clampScore(value: unknown, max: number): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(max, Math.round(n)));
}

export function parseEvaluation(raw: unknown): MockAnswerEvaluation | null {
  const e = (raw || {}) as Record<string, unknown>;
  const score = clampScore(e.score, 10);
  const feedback = clean(e.feedback, 600);
  if (score === null || !feedback) return null;
  return { score, feedback, missing: cleanList(e.missing, 6, 200), correct: cleanList(e.correct, 4, 200) };
}

function normalizeQuestion(q: string) {
  return q.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function parseTurnResult(raw: unknown, previousQuestions: string[] = []): ParsedTurn | null {
  const obj = (raw || {}) as Record<string, unknown>;
  const evaluation = parseEvaluation(obj.evaluation);
  if (!evaluation) return null;
  const n = (obj.next || {}) as Record<string, unknown>;
  const type = n.type === "follow_up" || n.type === "main" ? n.type : "end";
  const question = clean(n.question, 500);
  const repeated = previousQuestions.some((q) => normalizeQuestion(q) === normalizeQuestion(question));
  return {
    evaluation,
    next:
      type !== "end" && question && !repeated
        ? { type, question, topic: clean(n.topic, 60) }
        : { type: "end", question: "", topic: "" },
  };
}

/** Decide whether another question may be asked. */
export function canAskAnother(input: { turns: MockTurn[]; questionLimit: number; endsAt: string; now?: number }): boolean {
  const now = input.now ?? Date.now();
  return input.turns.length < input.questionLimit && now < new Date(input.endsAt).getTime();
}

/** At most one follow-up per main question. */
export function followUpAllowed(turns: MockTurn[]): boolean {
  const last = turns[turns.length - 1];
  return Boolean(last && last.kind === "main" && last.answer && !last.skipped);
}

export function buildReportPrompt(input: { candidate: string; setup: MockSetup; turns: MockTurn[] }): string {
  const categories = CATEGORIES_BY_TYPE[input.setup.interviewType];
  const transcript = input.turns
    .map((t, i) => {
      const answer = t.skipped ? "(skipped)" : t.answer ? t.answer.slice(0, 1500) : "(no answer)";
      const evalLine = t.evaluation ? `Rubric score: ${t.evaluation.score}/10. Notes: ${t.evaluation.feedback}` : "Not evaluated.";
      return `Q${i + 1} [${t.kind}${t.topic ? `, ${t.topic}` : ""}]: ${t.question}\nA${i + 1}: ${answer}\n${evalLine}`;
    })
    .join("\n\n");
  return [
    input.candidate,
    "",
    "Full interview:",
    transcript,
    "",
    "Write the final practice assessment based only on these answers.",
    ANSWER_RUBRIC,
    `Score these categories 0-100 using the same rubric: ${categories.join(", ")}. Do not add other categories.`,
    "accuracy = technical correctness of what was said. structure = organization of the answer and how clearly and decisively it is phrased in text; you cannot hear tone of voice, so do not guess it.",
    "Strengths must cite evidence from a specific answer (e.g. 'Q2: explained ...'). If there are no real strengths, return an empty list.",
    "questionFeedback: one entry per question above, in order (q = question number): what a strong interviewer expected, a concise improved answer in the candidate's context, and 1-2 actionable recommendations. Never invent achievements, metrics, employers or projects; use placeholders like [your metric] where facts are unknown.",
    "improvements: only the weakest areas relevant to this role and these answers (e.g. a specific technology, SQL, data structures, project explanation, problem-solving, communication). For each: why it needs improvement, what to learn or practice, one practical exercise or example question, and next steps before a real interview.",
    "practicePlan: 3-5 prioritized actions (priority 1 = most urgent). practiceQuestions: 3-5 follow-up questions to practice next.",
    "readinessNote: one sentence on interview readiness based on the answers.",
    "Return JSON:",
    '{"summary":"2-3 sentences","readinessNote":"...","categories":[{"key":"communication","score":<integer 0-100>,"comment":"..."}],"strengths":[{"point":"...","evidence":"..."}],"questionFeedback":[{"q":1,"expected":"...","improvedAnswer":"...","recommendations":["..."]}],"improvements":[{"area":"...","whyItMatters":"...","whatToPractice":"...","exercise":"...","nextSteps":"..."}],"practicePlan":[{"priority":1,"action":"...","focus":"..."}],"practiceQuestions":["..."]}',
  ].join("\n");
}

/**
 * Overall score: even blend of the category scores and the per-answer rubric scores
 * (skipped questions count as 0), so the headline number tracks how each answer was rated.
 */
export function overallScoreFor(categories: MockReportCategory[], turns: MockTurn[]): number {
  const categoryMean = categories.reduce((n, c) => n + c.score, 0) / categories.length;
  const rated = turns.filter((t) => t.skipped || t.evaluation);
  if (!rated.length) return Math.round(categoryMean);
  const answerMean = (rated.reduce((n, t) => n + (t.evaluation && !t.skipped ? t.evaluation.score : 0), 0) / rated.length) * 10;
  return Math.round((categoryMean + answerMean) / 2);
}

/**
 * Validate the model's report. Returns null (no report) rather than inventing
 * scores when required parts are missing.
 */
export function parseReport(
  raw: unknown,
  setup: MockSetup,
  meta: { provider: string; model: string; now?: string },
  turns: MockTurn[] = [],
): MockReport | null {
  const obj = (raw || {}) as Record<string, unknown>;
  const allowed = CATEGORIES_BY_TYPE[setup.interviewType];
  const list = Array.isArray(obj.categories) ? (obj.categories as Record<string, unknown>[]) : [];
  const categories: MockReportCategory[] = [];
  for (const key of allowed) {
    const row = list.find((c) => clean(c.key, 40).toLowerCase().replace(/[\s-]+/g, "_") === key);
    const score = row ? clampScore(row.score, 100) : null;
    if (score === null) return null;
    categories.push({ key, label: CATEGORY_LABELS[key] || key, score, comment: clean(row?.comment, 400) });
  }
  const summary = clean(obj.summary, 800);
  if (!summary) return null;
  const rows = (key: string) => (Array.isArray(obj[key]) ? (obj[key] as unknown[]) : []).map((s) => (s || {}) as Record<string, unknown>);

  const strengths = rows("strengths")
    .map((s) => ({ point: clean(s.point, 240), evidence: clean(s.evidence, 400) }))
    .filter((s) => s.point && s.evidence)
    .slice(0, 6);
  const improvements = rows("improvements")
    .map((s) => ({
      area: clean(s.area, 160),
      whyItMatters: clean(s.whyItMatters, 400),
      whatToPractice: clean(s.whatToPractice, 500),
      exercise: cleanMultiline(s.exercise, 500),
      nextSteps: clean(s.nextSteps, 400),
    }))
    .filter((s) => s.area && s.whatToPractice)
    .slice(0, 6);
  const practicePlan = rows("practicePlan")
    .map((s, i) => ({ priority: clampScore(s.priority, 10) || i + 1, action: clean(s.action, 300), focus: clean(s.focus, 160) }))
    .filter((s) => s.action)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 6);

  const asked = turns.filter((t) => t.answeredAt);
  const questionFeedback: MockQuestionFeedback[] = [];
  rows("questionFeedback").forEach((f, i) => {
    const q = clampScore(f.q, 100);
    const turn = asked[(q && q >= 1 ? q : i + 1) - 1];
    if (!turn || questionFeedback.some((x) => x.turnId === turn.id)) return;
    const expected = clean(f.expected, 600);
    const improvedAnswer = cleanMultiline(f.improvedAnswer, 1200);
    if (!expected && !improvedAnswer) return;
    questionFeedback.push({ turnId: turn.id, expected, improvedAnswer, recommendations: cleanList(f.recommendations, 2, 300) });
  });

  const overallScore = overallScoreFor(categories, turns);
  return {
    overallScore,
    assessmentLabel: MOCK_ASSESSMENT_LABEL,
    readiness: readinessFor(overallScore),
    readinessNote: clean(obj.readinessNote, 300),
    summary,
    categories,
    strengths,
    improvements,
    practicePlan,
    practiceQuestions: cleanList(obj.practiceQuestions, 5, 300),
    questionFeedback,
    generatedAt: meta.now || new Date().toISOString(),
    provider: meta.provider,
    model: meta.model,
  };
}
