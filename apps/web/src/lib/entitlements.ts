/**
 * Entitlements / premium access.
 * Uses the existing role + plan + env flags. Do not hardcode premium users.
 */

import { FREE_MEETING_QA_LIMIT } from "@/lib/app-access";
import { canAccessAdmin } from "@/lib/roles";

export { FREE_MEETING_QA_LIMIT };

export type CuePlan = "free" | "premium";

export type MeetingEntitlements = {
  plan: CuePlan;
  "meeting.full_summary": boolean;
  "meeting.max_questions": number;
};

export type EntitlementSnapshot = {
  premiumMeetings: boolean;
  source: "admin" | "env" | "session" | "free";
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

function envPremiumMeetings(): boolean {
  return (
    process.env.NEXT_PUBLIC_PREMIUM_MEETINGS === "1" ||
    process.env.PREMIUM_MEETINGS === "1"
  );
}

export function entitlementsForPlan(plan?: string | null): MeetingEntitlements {
  const premium = resolvePlan(plan) === "premium";
  return {
    plan: premium ? "premium" : "free",
    "meeting.full_summary": premium,
    "meeting.max_questions": premium ? -1 : FREE_MEETING_QA_LIMIT,
  };
}

export function resolveMeetingEntitlement(input: {
  role?: string | null;
  plan?: string | null;
  premiumMeetings?: boolean | null;
  entitlements?: Partial<MeetingEntitlements> | null;
}): EntitlementSnapshot {
  if (canAccessAdmin(input.role)) {
    return { premiumMeetings: true, source: "admin" };
  }
  if (typeof input.entitlements?.["meeting.full_summary"] === "boolean") {
    return {
      premiumMeetings: input.entitlements["meeting.full_summary"],
      source: input.entitlements["meeting.full_summary"] ? "session" : "free",
    };
  }
  if (input.premiumMeetings === true) {
    return { premiumMeetings: true, source: "session" };
  }
  if (resolvePlan(input.plan) === "premium") {
    return { premiumMeetings: true, source: "session" };
  }
  if (envPremiumMeetings()) {
    return { premiumMeetings: true, source: "env" };
  }
  return { premiumMeetings: false, source: "free" };
}

export function canViewFullMeetingQa(input: {
  role?: string | null;
  plan?: string | null;
  premiumMeetings?: boolean | null;
  entitlements?: Partial<MeetingEntitlements> | null;
  source?: EntitlementSnapshot["source"];
}): boolean {
  return resolveMeetingEntitlement(input).premiumMeetings;
}

export function meetingQaLimit(input: {
  role?: string | null;
  plan?: string | null;
  premiumMeetings?: boolean | null;
  entitlements?: Partial<MeetingEntitlements> | null;
}): number {
  if (canViewFullMeetingQa(input)) return -1;
  const max = input.entitlements?.["meeting.max_questions"];
  if (typeof max === "number" && Number.isFinite(max)) return max;
  return FREE_MEETING_QA_LIMIT;
}

export function clipMeetingAnswers<T>(
  answers: T[],
  input: {
    role?: string | null;
    plan?: string | null;
    premiumMeetings?: boolean | null;
    entitlements?: Partial<MeetingEntitlements> | null;
  },
): { answers: T[]; hasMore: boolean; fullSummaryAvailable: boolean } {
  const fullSummaryAvailable = canViewFullMeetingQa(input);
  const max = meetingQaLimit(input);
  if (fullSummaryAvailable || max < 0) {
    return { answers, hasMore: false, fullSummaryAvailable: true };
  }
  const limit = max > 0 ? max : FREE_MEETING_QA_LIMIT;
  const clipped = answers.slice(0, limit);
  return {
    answers: clipped,
    hasMore: answers.length > clipped.length,
    fullSummaryAvailable: false,
  };
}
