/** AI Mock Interview (a Meetings session kind) — types shared by API routes, server engine, and UI. */

export type MockDifficulty = "beginner" | "intermediate" | "advanced";
export type MockInterviewType = "technical" | "hr_behavioral" | "coding" | "project" | "mixed";
export type MockDuration = 10 | 20 | 30;

export const MOCK_DIFFICULTIES: { id: MockDifficulty; label: string }[] = [
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
];

export const MOCK_INTERVIEW_TYPES: { id: MockInterviewType; label: string }[] = [
  { id: "mixed", label: "Mixed" },
  { id: "technical", label: "Technical" },
  { id: "hr_behavioral", label: "HR / Behavioral" },
  { id: "coding", label: "Coding" },
  { id: "project", label: "Project-based" },
];

export const MOCK_DURATIONS: MockDuration[] = [10, 20, 30];

/** Questions (main + follow-ups) per session length. */
export const MOCK_QUESTION_LIMIT: Record<MockDuration, number> = { 10: 5, 20: 8, 30: 12 };

export type MockResumeProfile = {
  education: string[];
  skills: string[];
  experience: string[];
  projects: string[];
  certifications: string[];
};

export type MockSetup = {
  jobTitle: string;
  jobDescription?: string;
  difficulty: MockDifficulty;
  durationMin: MockDuration;
  interviewType: MockInterviewType;
  resumeName?: string;
  /** Where the session was started. "interview_prep" only appears on sessions saved by the former standalone page. */
  origin?: MockOrigin;
};

export type MockOrigin = "live_session" | "interview_prep";

export type MockAnswerEvaluation = {
  /** 0–10 for this answer, from the fixed rubric in the evaluation prompt. */
  score: number;
  feedback: string;
  missing: string[];
  /** Points the answer got right (absent on sessions saved before this field existed). */
  correct?: string[];
};

export type MockTurn = {
  id: string;
  kind: "main" | "follow_up";
  question: string;
  topic?: string;
  askedAt: string;
  answer?: string;
  answeredAt?: string;
  answerSource?: "voice" | "text";
  skipped?: boolean;
  evaluation?: MockAnswerEvaluation;
  /** Set when the answer was saved but could not be evaluated. */
  evaluationError?: string;
};

export type MockReportCategory = { key: string; label: string; score: number; comment: string };

export type MockReadiness = "ready" | "nearly_ready" | "needs_practice" | "not_ready";

export type MockQuestionFeedback = {
  turnId: string;
  expected: string;
  improvedAnswer: string;
  recommendations: string[];
};

export type MockReport = {
  /** 0–100 AI practice assessment, never an official rating. */
  overallScore: number;
  assessmentLabel: string;
  readiness: MockReadiness;
  readinessNote: string;
  summary: string;
  categories: MockReportCategory[];
  strengths: { point: string; evidence: string }[];
  improvements: {
    area: string;
    whyItMatters: string;
    whatToPractice: string;
    exercise: string;
    nextSteps: string;
  }[];
  practicePlan: { priority: number; action: string; focus: string }[];
  practiceQuestions: string[];
  questionFeedback: MockQuestionFeedback[];
  generatedAt: string;
  provider: string;
  model: string;
};

export type MockInterviewStatus = "active" | "completed" | "interrupted";

/** Mock interview part of a meeting, as returned to the browser (no resume text, no secrets). */
export type MockInterviewPublic = {
  status: MockInterviewStatus;
  setup: MockSetup;
  profile: MockResumeProfile | null;
  welcome: string;
  turns: MockTurn[];
  questionLimit: number;
  startedAt: string;
  endsAt: string;
  endedAt: string | null;
  report: MockReport | null;
  reportError: string | null;
  isOwner: boolean;
};

/** Compact mock fields shown on Meetings history cards. */
export type MockInterviewListSummary = {
  status: MockInterviewStatus;
  jobTitle: string;
  interviewType: MockInterviewType;
  difficulty: MockDifficulty;
  durationMin: MockDuration;
  overallScore: number | null;
  answeredCount: number;
  questionCount: number;
  improvementAreas: string[];
};
