import { canAccessAdmin } from "@/lib/roles";

/** SaaS / meeting plan (orthogonal to USER vs ADMIN role). */
export type CuePlan = "free" | "premium";

/** License tier from Keygate / billing (orthogonal to workspace role). */
export type LicensePlan = "free" | "pro" | "business" | "enterprise";

export const FREE_MEETING_QA_LIMIT = 5;

export type MeetingEntitlements = {
  plan: LicensePlan | CuePlan;
  "meeting.full_summary": boolean;
  "meeting.max_questions": number;
  desktop_companion: boolean;
};

export function resolvePlan(value?: string | null): CuePlan {
  const raw = String(value || "").trim().toLowerCase();
  if (
    raw === "premium" ||
    raw === "pro" ||
    raw === "business" ||
    raw === "enterprise"
  ) {
    return "premium";
  }
  return "free";
}

export function resolveLicensePlan(value?: string | null): LicensePlan {
  const raw = String(value || "").trim().toLowerCase();
  if (raw.includes("enterprise")) return "enterprise";
  if (raw.includes("business") || raw.includes("team")) return "business";
  if (raw.includes("pro") || raw.includes("premium") || raw.includes("professional")) {
    return "pro";
  }
  return "free";
}

export function entitlementsForPlan(plan?: string | null): MeetingEntitlements {
  const licensePlan = resolveLicensePlan(plan);
  const premium =
    licensePlan === "pro" || licensePlan === "business" || licensePlan === "enterprise";
  return {
    plan: licensePlan,
    "meeting.full_summary": premium,
    "meeting.max_questions": premium ? -1 : FREE_MEETING_QA_LIMIT,
    desktop_companion: true,
  };
}

export function canViewFullMeetingQa(input: {
  role?: string | null;
  plan?: string | null;
  entitlements?: Partial<MeetingEntitlements> | null;
}): boolean {
  // Role admin ≠ subscription admin; admins still get full meeting tooling for ops.
  if (canAccessAdmin(input.role)) return true;
  if (typeof input.entitlements?.["meeting.full_summary"] === "boolean") {
    return input.entitlements["meeting.full_summary"];
  }
  return resolvePlan(input.plan) === "premium";
}

/** Full meeting transcript is premium (admins always allowed). */
export function canViewFullTranscript(input: {
  role?: string | null;
  plan?: string | null;
  entitlements?: Partial<MeetingEntitlements> | null;
}): boolean {
  return canViewFullMeetingQa(input);
}

export function meetingQaLimit(input: {
  role?: string | null;
  plan?: string | null;
  entitlements?: Partial<MeetingEntitlements> | null;
}): number {
  if (canViewFullMeetingQa(input)) return -1;
  const max = input.entitlements?.["meeting.max_questions"];
  if (typeof max === "number" && Number.isFinite(max)) return max;
  return FREE_MEETING_QA_LIMIT;
}

/**
 * Centralized SaaS entitlement check for account-level features.
 * Prefer this over scattering `user.plan === "pro"` checks.
 *
 * For subscription-period-aware checks (cancel at period end), use
 * `hasEntitlement` from `@/lib/server/billing` on the server.
 */
export function hasPlanEntitlement(
  plan: string | null | undefined,
  feature: "pro" | "premium" | "team" | "meeting.full_summary" | "desktop_companion",
): boolean {
  const ents = entitlementsForPlan(plan);
  const licensePlan = resolveLicensePlan(plan);
  if (feature === "desktop_companion") return ents.desktop_companion;
  if (feature === "meeting.full_summary") return ents["meeting.full_summary"];
  if (feature === "team") {
    return licensePlan === "business" || licensePlan === "enterprise";
  }
  return resolvePlan(plan) === "premium";
}
