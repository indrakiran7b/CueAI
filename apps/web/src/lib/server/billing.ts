import {
  CHECKOUT_PLAN_META,
  STRIPE_PRICE_ENV,
  resolveBillingPlan,
  type BillingPlan,
  type CheckoutPlanId,
} from "@/lib/billing-plans";
import { updateStore, type DbUser } from "@/lib/server/db";
import {
  getSubscriptionForUser,
  upsertSubscription,
  type StoredSubscription,
} from "@/lib/server/billing-db";

export function checkoutPlanFromPriceId(priceId: string | null | undefined): CheckoutPlanId | null {
  const wanted = String(priceId || "").trim();
  if (!wanted) return null;
  for (const plan of Object.keys(STRIPE_PRICE_ENV) as CheckoutPlanId[]) {
    if (process.env[STRIPE_PRICE_ENV[plan]] === wanted) return plan;
  }
  return null;
}

export async function applySubscriptionToUser(input: {
  userId: string;
  plan: BillingPlan;
  status: StoredSubscription["status"];
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  currentPeriodEnd?: string;
}) {
  const row: StoredSubscription = {
    userId: input.userId,
    plan: input.plan,
    status: input.status,
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    stripePriceId: input.stripePriceId,
    currentPeriodEnd: input.currentPeriodEnd,
    updatedAt: new Date().toISOString(),
  };
  await upsertSubscription(row);
  await updateStore((store) => {
    const user = store.users.find((item) => item.id === input.userId);
    if (!user) return;
    user.plan = input.plan === "free" ? "free" : input.plan === "team" ? "team" : "pro";
    user.stripeCustomerId = input.stripeCustomerId;
    user.stripeSubscriptionId = input.stripeSubscriptionId;
  });
  return row;
}

export function planFromCheckoutId(plan: CheckoutPlanId): BillingPlan {
  return CHECKOUT_PLAN_META[plan].product;
}

export async function publicSubscription(user: Pick<DbUser, "id" | "plan">) {
  const stored = await getSubscriptionForUser(user.id);
  const plan = stored?.status === "active" ? stored.plan : resolveBillingPlan(user.plan);
  return {
    plan,
    status: stored?.status || (plan === "free" ? "none" : "active"),
    currentPeriodEnd: stored?.currentPeriodEnd || null,
    stripeSubscriptionId: stored?.stripeSubscriptionId || null,
  };
}
