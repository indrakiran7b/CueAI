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
