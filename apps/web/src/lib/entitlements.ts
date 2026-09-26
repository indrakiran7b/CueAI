import { canAccessAdmin } from "@/lib/roles";

export type CuePlan = "free" | "premium";

export const FREE_MEETING_QA_LIMIT = 5;

export function resolvePlan(value?: string | null): CuePlan {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "premium" || raw === "pro" || raw === "enterprise") return "premium";
  return "free";
}

export function canViewFullMeetingQa(input: {
  role?: string | null;
  plan?: string | null;
}): boolean {
  if (canAccessAdmin(input.role)) return true;
  return resolvePlan(input.plan) === "premium";
}

/** Full meeting transcript is premium (admins always allowed). */
export function canViewFullTranscript(input: {
  role?: string | null;
  plan?: string | null;
}): boolean {
  return canViewFullMeetingQa(input);
}
