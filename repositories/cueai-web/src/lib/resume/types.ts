/** Structured resume shared by analysis, rewrites, ATS scoring, templates and PDF export. */

export type ResumeContact = {
  email: string;
  phone: string;
  location: string;
  links: string[];
};

/** A role, internship or degree. */
export type ResumeEntry = {
  title: string;
  organization: string;
  location: string;
  dates: string;
  bullets: string[];
};

export type ResumeProject = {
  name: string;
  tech: string;
  dates: string;
  link: string;
  bullets: string[];
};

export type ResumeSkillGroup = {
  label: string;
  items: string[];
};

export type ResumeExtraSection = {
  heading: string;
  items: string[];
};

export type StructuredResume = {
  name: string;
  headline: string;
  contact: ResumeContact;
  summary: string;
  skills: ResumeSkillGroup[];
  experience: ResumeEntry[];
  internships: ResumeEntry[];
  projects: ResumeProject[];
  education: ResumeEntry[];
  certifications: string[];
  achievements: string[];
  coursework: string[];
  extra: ResumeExtraSection[];
  /** Set by tailoring when projects are the candidate's strongest evidence; templates then list them before work history. */
  projectsFirst?: boolean;
};

/** Where a rewrite lands: "summary", "headline", "skills", "experience.0.bullets.2", "achievements.1"… */
export type RewriteTarget = string;

export type ResumeRewrite = {
  id: string;
  target: RewriteTarget;
  /** Human label, e.g. "Experience · Acme Corp". */
  section: string;
  before: string;
  after: string;
  reason: string;
  /** Rewrites that failed the fact checks are shown but never applied. */
  valid: boolean;
  rejectReason?: string;
  /** Present only for the "skills" target. */
  skills?: ResumeSkillGroup[];
};

export type SkillGap = {
  skill: string;
  why: string;
  section: string;
  /** Exact resume text showing related experience; empty when the resume has none. */
  evidence: string;
  supported: boolean;
};

export type SkillSuggestion = {
  skill: string;
  reason: string;
  section: string;
  basis: string;
  supported: boolean;
};

export type AtsCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type AtsReport = {
  overall: number;
  keywordCoverage: number;
  skillsMatch: number;
  formatting: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  checks: AtsCheck[];
  suggestions: string[];
  usedJobDescription: boolean;
};

export type TemplateId = "classic" | "modern" | "software" | "graduate" | "executive";

export type RequirementCategory = "technical" | "tools" | "domain" | "responsibility" | "qualification";
export type RequirementPriority = "high" | "medium" | "low";
export type RequirementStatus = "demonstrated" | "partial" | "missing" | "unclear";

/** One thing the job description asks for. */
export type JobRequirement = {
  id: string;
  name: string;
  category: RequirementCategory;
  priority: RequirementPriority;
  /** Listed under a required/must-have heading (or unmarked) rather than preferred/nice-to-have. */
  required: boolean;
  /** Why it matters for the role (model explanation or the JD line it came from). */
  why: string;
};

export type JobProfile = {
  title: string;
  requirements: JobRequirement[];
  /** Minimum years of experience the JD asks for, when stated. */
  minYears: number | null;
  /**
   * Resume lines the model pointed to as semantic evidence, keyed by requirement id.
   * They are only used after re-checking that the text is really in the resume.
   */
  semanticEvidence: Record<string, string>;
};

export type RequirementMatch = {
  requirementId: string;
  name: string;
  category: RequirementCategory;
  priority: RequirementPriority;
  status: RequirementStatus;
  /** Verbatim resume text supporting the status; empty when nothing was found. */
  evidence: string;
  note: string;
};

export type MatchCategoryKey = "required" | "experience" | "responsibilities" | "tools" | "supporting";

export type MatchCategoryScore = {
  key: MatchCategoryKey;
  label: string;
  weight: number;
  /** 0–100, or null when the category does not apply to this job description. */
  score: number | null;
  detail: string;
};

export type MatchReport = {
  scoringVersion: string;
  /** "insufficient_job_description": too few requirements could be read to score against. */
  status: "scored" | "insufficient_job_description";
  requirementCount: number;
  /** CueAI ATS Match Estimate, 0–100; null when not scorable. */
  score: number | null;
  keywordAlignment: number | null;
  skillsMatch: number | null;
  categories: MatchCategoryScore[];
  matches: RequirementMatch[];
  candidateYears: number;
  confidence: "normal" | "low";
  explanation: string;
  importantMissing: string[];
};

export type RecommendationKind =
  | "summary"
  | "supported_skills"
  | "show_skill_usage"
  | "vague_bullets"
  | "metrics"
  | "keywords"
  | "section_order"
  | "repetition"
  | "irrelevant"
  | "formatting";

export type Recommendation = {
  id: string;
  kind: RecommendationKind;
  title: string;
  issue: string;
  suggestion: string;
  benefit: string;
  evidence: string[];
  priority: RequirementPriority;
};

/**
 * One entry of the change log, computed by comparing the original and final resume objects.
 * "rewritten" always means the content differs; "reordered" means it moved without changing.
 */
export type TailorChange = {
  kind: "rewritten" | "reordered" | "added" | "removed" | "unchanged";
  section: string;
  before: string;
  after: string;
  reason: string;
};

export function emptyResume(): StructuredResume {
  return {
    name: "",
    headline: "",
    contact: { email: "", phone: "", location: "", links: [] },
    summary: "",
    skills: [],
    experience: [],
    internships: [],
    projects: [],
    education: [],
    certifications: [],
    achievements: [],
    coursework: [],
    extra: [],
  };
}
