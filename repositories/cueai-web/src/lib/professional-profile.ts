/**
 * Settings → Profile professional details.
 *
 * Shared by the settings form and the /api/profile route so option ids and
 * validation can never drift. Everything here is self-reported by the user.
 */

export type ProfileOption = { id: string; label: string };

export const EMPLOYMENT_TYPES: ProfileOption[] = [
  { id: "full_time", label: "Full-time" },
  { id: "part_time", label: "Part-time" },
  { id: "contract", label: "Contract" },
  { id: "internship", label: "Internship" },
  { id: "freelance", label: "Freelance" },
];

export const EXPERIENCE_LEVELS: ProfileOption[] = [
  { id: "fresher", label: "Fresher" },
  { id: "lt_1", label: "Less than 1 year" },
  { id: "1_3", label: "1–3 years" },
  { id: "3_5", label: "3–5 years" },
  { id: "5_plus", label: "5+ years" },
];

export const WORK_STATUSES: ProfileOption[] = [
  { id: "working", label: "Working" },
  { id: "job_seeking", label: "Looking for a Job" },
  { id: "student", label: "Student" },
  { id: "freelancer", label: "Freelancer" },
];

export const PRIMARY_DOMAINS: ProfileOption[] = [
  { id: "software", label: "Software Development" },
  { id: "ai_ml", label: "AI/ML" },
  { id: "data", label: "Data Analytics" },
  { id: "testing", label: "Testing" },
  { id: "cloud_devops", label: "Cloud/DevOps" },
  { id: "other", label: "Other" },
];

export type ProfessionalProfile = {
  role?: string;
  company?: string;
  jobTitle?: string;
  employmentType?: string;
  experience?: string;
  workStatus?: string;
  summary?: string;
  previousCompany?: string;
  previousJobTitle?: string;
  /** YYYY-MM */
  workStart?: string;
  /** YYYY-MM; ignored when currentlyWorking is true ("Present"). */
  workEnd?: string;
  currentlyWorking?: boolean;
  experienceDescription?: string;
  responsibilities?: string;
  achievements?: string;
  technicalSkills?: string[];
  tools?: string[];
  domain?: string;
  updatedAt?: string;
};

export const SHORT_TEXT_MAX = 120;
export const LONG_TEXT_MAX = 2000;
export const LIST_MAX = 40;
const NAME_MAX = 80;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function optionLabel(options: ProfileOption[], id: string | undefined): string {
  return options.find((o) => o.id === id)?.label || "";
}

/** "React, Node.js\nDocker" → ["React", "Node.js", "Docker"] (deduped, trimmed). */
export function splitList(value: unknown): string[] {
  const parts = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\n]/) : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    if (typeof part !== "string") continue;
    const item = part.trim().replace(/\s+/g, " ").slice(0, 60);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= LIST_MAX) break;
  }
  return out;
}

/** True for statuses where current-employer details are not expected. */
export function isEarlyCareer(profile: Pick<ProfessionalProfile, "experience" | "workStatus">): boolean {
  return profile.experience === "fresher" || profile.workStatus === "student" || profile.workStatus === "job_seeking";
}

export type ProfileFieldErrors = Partial<Record<"name" | keyof ProfessionalProfile, string>>;

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = max > SHORT_TEXT_MAX
    ? value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
    : value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, max) : undefined;
}

function choice(value: unknown, options: ProfileOption[]): string | undefined {
  return typeof value === "string" && options.some((o) => o.id === value) ? value : undefined;
}

/**
 * Validate and normalize a profile update. Unknown keys are dropped.
 * Freshers, students and job seekers can save without any employer details.
 */
export function validateProfileUpdate(
  input: { name?: unknown; profile?: unknown },
  now: Date = new Date(),
): { name: string; profile: ProfessionalProfile } | { errors: ProfileFieldErrors } {
  const raw = (input.profile && typeof input.profile === "object" ? input.profile : {}) as Record<string, unknown>;
  const errors: ProfileFieldErrors = {};

  const name = text(input.name, NAME_MAX) || "";
  if (!name) errors.name = "Full name is required.";

  const profile: ProfessionalProfile = {
    role: text(raw.role, SHORT_TEXT_MAX),
    company: text(raw.company, SHORT_TEXT_MAX),
    jobTitle: text(raw.jobTitle, SHORT_TEXT_MAX),
    employmentType: choice(raw.employmentType, EMPLOYMENT_TYPES),
    experience: choice(raw.experience, EXPERIENCE_LEVELS),
    workStatus: choice(raw.workStatus, WORK_STATUSES),
    summary: text(raw.summary, LONG_TEXT_MAX),
    previousCompany: text(raw.previousCompany, SHORT_TEXT_MAX),
    previousJobTitle: text(raw.previousJobTitle, SHORT_TEXT_MAX),
    workStart: typeof raw.workStart === "string" && MONTH_RE.test(raw.workStart) ? raw.workStart : undefined,
    currentlyWorking: raw.currentlyWorking === true || undefined,
    workEnd: typeof raw.workEnd === "string" && MONTH_RE.test(raw.workEnd) ? raw.workEnd : undefined,
    experienceDescription: text(raw.experienceDescription, LONG_TEXT_MAX),
    responsibilities: text(raw.responsibilities, LONG_TEXT_MAX),
    achievements: text(raw.achievements, LONG_TEXT_MAX),
    technicalSkills: splitList(raw.technicalSkills),
    tools: splitList(raw.tools),
    domain: choice(raw.domain, PRIMARY_DOMAINS),
  };
  if (profile.currentlyWorking) profile.workEnd = undefined;

  if (!profile.experience) errors.experience = "Select your work experience.";
  if (!profile.workStatus) errors.workStatus = "Select your current work status.";
  if (profile.workStatus === "working" && profile.experience !== "fresher") {
    if (!profile.company) errors.company = "Enter your current company.";
    if (!profile.jobTitle) errors.jobTitle = "Enter your job title.";
  }

  const thisMonth = now.toISOString().slice(0, 7);
  if (profile.workStart && profile.workStart > thisMonth) errors.workStart = "Start date can't be in the future.";
  if (profile.workEnd && profile.workEnd > thisMonth) errors.workEnd = "End date can't be in the future.";
  if (profile.workStart && profile.workEnd && profile.workEnd < profile.workStart) {
    errors.workEnd = "End date must be after the start date.";
  }
  if ((profile.workEnd || profile.currentlyWorking) && !profile.workStart) {
    errors.workStart = "Add a start date.";
  }

  if (Object.keys(errors).length) return { errors };

  for (const key of Object.keys(profile) as (keyof ProfessionalProfile)[]) {
    const value = profile[key];
    if (value === undefined || (Array.isArray(value) && value.length === 0)) delete profile[key];
  }
  return { name, profile };
}

function monthLabel(value: string | undefined): string {
  if (!value) return "";
  const [y, m] = value.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function clip(value: string | undefined, max: number): string {
  if (!value) return "";
  const flat = value.replace(/\s*\n\s*/g, "; ");
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}

/**
 * Compact, self-reported background for AI prompts.
 * "brief" omits free-text history (used where only emphasis matters, e.g. resume tailoring).
 */
export function describeProfessionalProfile(
  profile: ProfessionalProfile | null | undefined,
  detail: "brief" | "full" = "full",
): string {
  if (!profile) return "";
  const lines: string[] = [];
  const status = optionLabel(WORK_STATUSES, profile.workStatus);
  const experience = optionLabel(EXPERIENCE_LEVELS, profile.experience);
  const current = [profile.jobTitle, profile.company && `at ${profile.company}`].filter(Boolean).join(" ");

  if (profile.role) lines.push(`Role: ${profile.role}`);
  if (current) {
    const type = optionLabel(EMPLOYMENT_TYPES, profile.employmentType);
    lines.push(`Current position: ${current}${type ? ` (${type})` : ""}`);
  }
  if (status || experience) lines.push(`Work status: ${[status, experience && `experience ${experience}`].filter(Boolean).join(", ")}`);
  if (profile.domain) lines.push(`Primary domain: ${optionLabel(PRIMARY_DOMAINS, profile.domain)}`);
  if (profile.technicalSkills?.length) lines.push(`Technical skills: ${profile.technicalSkills.join(", ")}`);
  if (profile.tools?.length) lines.push(`Tools: ${profile.tools.join(", ")}`);
  if (detail === "brief") return lines.join("\n");

  if (profile.workStart) {
    const end = profile.currentlyWorking ? "Present" : monthLabel(profile.workEnd);
    lines.push(`Role dates: ${monthLabel(profile.workStart)}${end ? ` – ${end}` : ""}`);
  }
  const previous = [profile.previousJobTitle, profile.previousCompany && `at ${profile.previousCompany}`]
    .filter(Boolean)
    .join(" ");
  if (previous) lines.push(`Previous position: ${previous}`);
  if (profile.summary) lines.push(`About: ${clip(profile.summary, 500)}`);
  if (profile.experienceDescription) lines.push(`Experience: ${clip(profile.experienceDescription, 500)}`);
  if (profile.responsibilities) lines.push(`Responsibilities: ${clip(profile.responsibilities, 500)}`);
  if (profile.achievements) lines.push(`Projects and achievements: ${clip(profile.achievements, 500)}`);
  return lines.join("\n");
}
