/**
 * Configurable CueAI subscription plans → Stripe Price IDs.
 * Prices are never hardcoded; amounts come from env display cents and/or Stripe Price objects.
 */

export type BillingInterval = "month" | "year";

export type BillingPlanDefinition = {
  id: string;
  name: string;
  description: string;
  interval: BillingInterval | "none";
  /** Stripe Price id from env — empty means plan not purchasable yet */
  stripePriceId: string;
  /** Keygate plan id for license mint after payment (optional) */
  keygatePlanId: string;
  /** Maps to CueAI SaaS plan gate */
  cuePlan: "free" | "premium";
  /** Entitlement tier for UI / header (free | pro | team) */
  entitlementLevel: "free" | "pro" | "team";
  features: string[];
  highlighted?: boolean;
  /** Display amount in cents for UI — from env or Stripe Price.unit_amount */
  displayAmountCents: number;
  currency: "usd";
};

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

function displayCents(name: string, fallback = 0): number {
  const raw = env(name);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

/**
 * Centralized CueAI list prices (UI display).
 * Stripe Price IDs remain authoritative at checkout when configured.
 * Monthly defaults: Pro $5, Team $10. Yearly has no invented default.
 */
export const CUEAI_LIST_PRICES_CENTS = {
  PRO_MONTHLY: 500,
  TEAM_MONTHLY: 1000,
} as const;

/** All known plans. Free is never checked out via Stripe. */
export function listBillingPlans(): BillingPlanDefinition[] {
  return [
    {
      id: "free",
      name: "Free",
      description: "Core CueAI meeting assistance for individuals.",
      interval: "none",
      stripePriceId: "",
      keygatePlanId: "",
      cuePlan: "free",
      entitlementLevel: "free",
      displayAmountCents: 0,
      currency: "usd",
      features: [
        "Dashboard & meetings",
        "Live Session",
        "Desktop Companion",
        "Up to 5 Q&A per meeting summary",
      ],
    },
    {
      id: "pro_monthly",
      name: "Pro",
      description: "Full meeting insights for professionals.",
      interval: "month",
      stripePriceId: env("STRIPE_PRICE_PRO_MONTHLY"),
      keygatePlanId: env("KEYGATE_PLAN_ID_PRO") || env("KEYGATE_PLAN_ID_PRO_MONTHLY"),
      cuePlan: "premium",
      entitlementLevel: "pro",
      displayAmountCents: displayCents(
        "STRIPE_DISPLAY_PRO_MONTHLY_CENTS",
        CUEAI_LIST_PRICES_CENTS.PRO_MONTHLY,
      ),
      currency: "usd",
      highlighted: true,
      features: [
        "Everything in Free",
        "Complete meeting Q&A",
        "Full meeting insights",
        "Priority AI responses",
      ],
    },
    {
      id: "pro_yearly",
      name: "Pro",
      description: "Full meeting insights billed yearly.",
      interval: "year",
      stripePriceId: env("STRIPE_PRICE_PRO_YEARLY"),
      keygatePlanId: env("KEYGATE_PLAN_ID_PRO") || env("KEYGATE_PLAN_ID_PRO_YEARLY"),
      cuePlan: "premium",
      entitlementLevel: "pro",
      // No invented yearly default — Stripe Price or STRIPE_DISPLAY_PRO_YEARLY_CENTS only.
      displayAmountCents: displayCents("STRIPE_DISPLAY_PRO_YEARLY_CENTS", 0),
      currency: "usd",
      highlighted: true,
      features: [
        "Everything in Free",
        "Complete meeting Q&A",
        "Full meeting insights",
        "Priority AI responses",
      ],
    },
    {
      id: "team_monthly",
      name: "Team",
      description: "Collaboration for growing teams.",
      interval: "month",
      stripePriceId: env("STRIPE_PRICE_TEAM_MONTHLY"),
      keygatePlanId: env("KEYGATE_PLAN_ID_TEAM") || env("KEYGATE_PLAN_ID_TEAM_MONTHLY"),
      cuePlan: "premium",
      entitlementLevel: "team",
      displayAmountCents: displayCents(
        "STRIPE_DISPLAY_TEAM_MONTHLY_CENTS",
        CUEAI_LIST_PRICES_CENTS.TEAM_MONTHLY,
      ),
      currency: "usd",
      features: [
        "Everything in Pro",
        "Shared workspace tools",
        "Admin-friendly seats",
        "Team meeting insights",
      ],
    },
    {
      id: "team_yearly",
      name: "Team",
      description: "Collaboration billed yearly.",
      interval: "year",
      stripePriceId: env("STRIPE_PRICE_TEAM_YEARLY"),
      keygatePlanId: env("KEYGATE_PLAN_ID_TEAM") || env("KEYGATE_PLAN_ID_TEAM_YEARLY"),
      cuePlan: "premium",
      entitlementLevel: "team",
      displayAmountCents: displayCents("STRIPE_DISPLAY_TEAM_YEARLY_CENTS", 0),
      currency: "usd",
      features: [
        "Everything in Pro",
        "Shared workspace tools",
        "Admin-friendly seats",
        "Team meeting insights",
      ],
    },
  ];
}

/** Map API aliases (PRO_MONTHLY / TEAM_MONTHLY) → canonical plan ids. */
export function normalizeBillingPlanId(planId: string): string {
  const raw = String(planId || "").trim();
  if (!raw) return "";
  const aliases: Record<string, string> = {
    PRO_MONTHLY: "pro_monthly",
    TEAM_MONTHLY: "team_monthly",
    PRO_YEARLY: "pro_yearly",
    TEAM_YEARLY: "team_yearly",
    pro: "pro_monthly",
    team: "team_monthly",
    premium: "pro_monthly",
  };
  return aliases[raw] || aliases[raw.toUpperCase()] || raw.toLowerCase();
}

export function getBillingPlan(planId: string): BillingPlanDefinition | null {
  const id = normalizeBillingPlanId(planId);
  return listBillingPlans().find((p) => p.id === id) || null;
}

export function findPlanByStripePriceId(priceId: string): BillingPlanDefinition | null {
  if (!priceId) return null;
  return listBillingPlans().find((p) => p.stripePriceId && p.stripePriceId === priceId) || null;
}

/** Resolve a CueAI plan from plan id or Stripe price id (backend validation only). */
export function resolveCheckoutPlan(input: {
  planId?: string;
  priceId?: string;
}): BillingPlanDefinition | null {
  const planId = String(input.planId || "").trim();
  // Prefer CueAI plan id. Stripe Price IDs are resolved server-side from env —
  // do not trust client-supplied price ids as the primary selector.
  if (planId) {
    const byId = getBillingPlan(planId);
    if (byId) return byId;
  }
  const priceId = String(input.priceId || "").trim();
  if (priceId) {
    return findPlanByStripePriceId(priceId);
  }
  return null;
}

export function isStripeBillingConfigured(): boolean {
  return Boolean(env("STRIPE_SECRET_KEY"));
}

/** True when at least one paid Stripe Price ID is present. */
export function hasConfiguredPaidPrices(): boolean {
  return listBillingPlans().some((p) => p.id !== "free" && Boolean(p.stripePriceId));
}

export function trialDays(): number {
  const n = Number(env("TRIAL_DAYS") || "0");
  return Number.isFinite(n) && n > 0 ? Math.min(90, Math.floor(n)) : 0;
}

export type PublicBillingPlan = {
  id: string;
  name: string;
  description: string;
  interval: BillingInterval | "none";
  cuePlan: "free" | "premium";
  entitlementLevel: "free" | "pro" | "team";
  features: string[];
  highlighted: boolean;
  displayAmountCents: number;
  currency: string;
  purchasable: boolean;
  /** Stripe Price id — safe after backend re-validation on checkout */
  stripePriceId: string | null;
};

/** Public plan catalog safe for the browser (no secrets). */
export function publicBillingCatalog(amountOverrides?: Record<string, number>) {
  const stripeConfigured = isStripeBillingConfigured();
  return {
    currency: "usd" as const,
    trialDays: trialDays(),
    stripeConfigured,
    pricesConfigured: hasConfiguredPaidPrices(),
    publishableKey: env("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY") || env("STRIPE_PUBLISHABLE_KEY"),
    plans: listBillingPlans().map((p): PublicBillingPlan => {
      const override = amountOverrides?.[p.id];
      const amount =
        typeof override === "number" && override > 0 ? override : p.displayAmountCents;
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        interval: p.interval,
        cuePlan: p.cuePlan,
        entitlementLevel: p.entitlementLevel,
        features: p.features,
        highlighted: Boolean(p.highlighted),
        displayAmountCents: amount,
        currency: p.currency,
        purchasable: Boolean(p.stripePriceId) && p.id !== "free" && stripeConfigured,
        stripePriceId: p.stripePriceId || null,
      };
    }),
  };
}
