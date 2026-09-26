export const CHECKOUT_PLAN_IDS = [
  "pro_monthly",
  "pro_yearly",
  "team_monthly",
  "team_yearly",
] as const;

export type CheckoutPlanId = (typeof CHECKOUT_PLAN_IDS)[number];
export type BillingPlan = "free" | "pro" | "team";

export const CHECKOUT_PLAN_META: Record<
  CheckoutPlanId,
  { product: Exclude<BillingPlan, "free">; interval: "month" | "year"; label: string }
> = {
  pro_monthly: { product: "pro", interval: "month", label: "$5/month" },
  pro_yearly: { product: "pro", interval: "year", label: "$50/year" },
  team_monthly: { product: "team", interval: "month", label: "$10/month" },
  team_yearly: { product: "team", interval: "year", label: "$100/year" },
};

export const STRIPE_PRICE_ENV: Record<CheckoutPlanId, string> = {
  pro_monthly: "STRIPE_PRICE_PRO_MONTHLY",
  pro_yearly: "STRIPE_PRICE_PRO_YEARLY",
  team_monthly: "STRIPE_PRICE_TEAM_MONTHLY",
  team_yearly: "STRIPE_PRICE_TEAM_YEARLY",
};

export function isCheckoutPlanId(value: string): value is CheckoutPlanId {
  return (CHECKOUT_PLAN_IDS as readonly string[]).includes(value);
}

export function resolveBillingPlan(value?: string | null): BillingPlan {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "team") return "team";
  if (raw === "pro" || raw === "premium" || raw === "enterprise") return "pro";
  return "free";
}
