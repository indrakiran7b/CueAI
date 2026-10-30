export const JOB_DESCRIPTION_MAX_CHARS = 20000;
export const JOB_DESCRIPTION_REQUIRED_MESSAGE = "Job description is required to tailor your resume.";

/** Trimmed job description, or null when it is missing or whitespace-only. */
export function normalizeJobDescription(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim().slice(0, JOB_DESCRIPTION_MAX_CHARS) : "";
  return text ? text : null;
}

/** The text sent for analysis: the pasted JD, headed by the optional job title and company. */
export function composeJobDescription(jd: string, title: string, company: string): string | null {
  const body = normalizeJobDescription(jd);
  if (!body) return null;
  const head = [title.trim() && `Job title: ${title.trim()}`, company.trim() && `Company: ${company.trim()}`].filter(Boolean);
  return [...head, body].join("\n").slice(0, JOB_DESCRIPTION_MAX_CHARS);
}
