/**
 * Post-signup onboarding questionnaire.
 *
 * Shared by the wizard UI and the API route so choice ids can never drift.
 * Answers personalize the live copilot and resume tailoring.
 */

export type OnboardingFieldId = "persona" | "goals" | "assistLevel" | "referral";

export type OnboardingChoice = { id: string; label: string };

export type OnboardingQuestion = {
  id: OnboardingFieldId;
  prompt: string;
  helper?: string;
  optional?: boolean;
} & (
  | { kind: "single"; choices: OnboardingChoice[] }
  | { kind: "multi"; choices: OnboardingChoice[]; maxSelections: number }
);

export type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  questions: OnboardingQuestion[];
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "about-you",
    title: "Tell us about you",
    description: "So CueAI speaks in the right context during your meetings.",
    questions: [
      {
        id: "persona",
        kind: "single",
        prompt: "What best describes you?",
        choices: [
          { id: "job_seeker", label: "Job seeker / interviewing" },
          { id: "sales", label: "Sales & business development" },
          { id: "consultant", label: "Consultant / client-facing" },
          { id: "engineer", label: "Engineer / technical" },
          { id: "recruiter", label: "Recruiter / HR" },
          { id: "founder", label: "Founder / executive" },
          { id: "student", label: "Student / researcher" },
          { id: "other", label: "Something else" },
        ],
      },
    ],
  },
  {
    id: "goals",
    title: "What should CueAI help with?",
    description: "Pick everything that applies — you can change this later.",
    questions: [
      {
        id: "goals",
        kind: "multi",
        prompt: "I want live help during…",
        maxSelections: 6,
        choices: [
          { id: "job_interviews", label: "Job interviews" },
          { id: "sales_calls", label: "Sales & discovery calls" },
          { id: "client_meetings", label: "Client meetings" },
          { id: "team_meetings", label: "Team meetings & standups" },
          { id: "hiring_interviews", label: "Interviews I run (hiring)" },
          { id: "lectures", label: "Lectures & study sessions" },
        ],
      },
    ],
  },
  {
    id: "guidance",
    title: "How CueAI should behave",
    description: "Sets how proactive the copilot is during a live session.",
    questions: [
      {
        id: "assistLevel",
        kind: "single",
        prompt: "How much live guidance do you want?",
        choices: [
          { id: "minimal", label: "Minimal — only when I ask" },
          { id: "balanced", label: "Balanced — cues at key moments" },
          { id: "maximum", label: "Maximum — proactive suggestions" },
        ],
      },
    ],
  },
  {
    id: "referral",
    title: "One last thing",
    description: "Completely optional — it just helps us know what's working.",
    questions: [
      {
        id: "referral",
        kind: "single",
        prompt: "How did you hear about CueAI?",
        optional: true,
        choices: [
          { id: "search", label: "Search engine" },
          { id: "friend", label: "Friend or colleague" },
          { id: "social", label: "Social media" },
          { id: "video", label: "YouTube / video" },
          { id: "work", label: "Through work" },
          { id: "other", label: "Other" },
        ],
      },
    ],
  },
];

export const ONBOARDING_QUESTIONS: OnboardingQuestion[] = ONBOARDING_STEPS.flatMap(
  (step) => step.questions,
);

export type OnboardingAnswers = {
  persona?: string;
  goals?: string[];
  assistLevel?: string;
  referral?: string;
};

export type OnboardingProfile = OnboardingAnswers & {
  completedAt?: string | null;
  /** True when the user chose "skip for now" instead of answering. */
  skipped?: boolean;
  updatedAt?: string;
};

export function labelFor(id: OnboardingFieldId, value: string): string {
  const question = ONBOARDING_QUESTIONS.find((q) => q.id === id);
  return question?.choices.find((c) => c.id === value)?.label || value;
}

export function isStepAnswered(step: OnboardingStep, answers: OnboardingAnswers): boolean {
  return step.questions.every((question) => {
    if (question.optional) return true;
    const value = answers[question.id];
    if (question.kind === "multi") return Array.isArray(value) && value.length > 0;
    return typeof value === "string" && value.trim().length > 0;
  });
}

export function isOnboardingAnswered(answers: OnboardingAnswers): boolean {
  return ONBOARDING_STEPS.every((step) => isStepAnswered(step, answers));
}

/** Strip anything not defined above so stored profiles stay trustworthy. */
export function sanitizeOnboardingAnswers(input: unknown): OnboardingAnswers {
  const raw = (input || {}) as Record<string, unknown>;
  const answers: OnboardingAnswers = {};

  for (const question of ONBOARDING_QUESTIONS) {
    const value = raw[question.id];
    const allowed = new Set(question.choices.map((c) => c.id));

    if (question.kind === "multi") {
      if (!Array.isArray(value)) continue;
      const picked = Array.from(
        new Set(value.filter((v): v is string => typeof v === "string" && allowed.has(v))),
      ).slice(0, question.maxSelections);
      if (picked.length > 0) answers[question.id] = picked as never;
      continue;
    }

    if (typeof value === "string" && allowed.has(value)) {
      answers[question.id] = value as never;
    }
  }

  return answers;
}

/** Compact profile summary injected into AI prompts. */
export function describeProfile(profile: OnboardingProfile | null | undefined): string {
  if (!profile) return "";

  const lines: string[] = [];
  if (profile.persona) lines.push(`Profile: ${labelFor("persona", profile.persona)}`);
  if (profile.goals?.length) {
    lines.push(`Uses CueAI for: ${profile.goals.map((g) => labelFor("goals", g)).join(", ")}`);
  }
  if (profile.assistLevel) {
    lines.push(`Guidance preference: ${labelFor("assistLevel", profile.assistLevel)}`);
  }

  return lines.join("\n");
}
