/**
 * CueAI Stripe billing service.
 *
 * Stripe owns payment / subscription / invoices.
 * CueAI owns account subscription state + entitlements.
 * Keygate owns license / device authorization (via existing keygate.ts).
 *
 * Never trust frontend checkout return URLs — webhooks are the source of truth.
 */

import type Stripe from "stripe";
import {
  findPlanByStripePriceId,
  getBillingPlan,
  isStripeBillingConfigured,
  listBillingPlans,
  publicBillingCatalog,
  resolveCheckoutPlan,
  trialDays,
  type BillingPlanDefinition,
} from "@/lib/server/billing-plans";
import {
  newBillingId,
  readBillingStore,
  updateBillingStore,
  type DbBillingSubscription,
} from "@/lib/server/billing-db";
import { readStore, updateStore, type DbUser } from "@/lib/server/db";
import {
  isKeygateEnabled,
  keygateAdminCreateLicense,
  keygateAdminSetLicenseStatus,
} from "@/lib/server/keygate";
import { getStripe, getStripeWebhookSecret } from "@/lib/server/stripe";
import { entitlementsForPlan, resolvePlan, type CuePlan } from "@/lib/entitlements";

function logBilling(event: string, meta: Record<string, unknown>) {
  const safe = { ...meta };
  delete safe.licenseKey;
  delete safe.rawKey;
  delete safe.client_secret;
  console.info(`[billing] ${event}`, safe);
}

/** Short-lived cache of Stripe Price amounts (cents) keyed by CueAI plan id. */
const priceAmountCache = new Map<string, { cents: number; at: number }>();
const PRICE_CACHE_MS = 5 * 60_000;

export async function loadStripePriceAmountOverrides(): Promise<Record<string, number>> {
  if (!isStripeBillingConfigured()) return {};
  const overrides: Record<string, number> = {};
  try {
    const stripe = getStripe();
    for (const plan of listBillingPlans()) {
      if (!plan.stripePriceId) continue;
      const cached = priceAmountCache.get(plan.id);
      if (cached && Date.now() - cached.at < PRICE_CACHE_MS) {
        overrides[plan.id] = cached.cents;
        continue;
      }
      try {
        const price = await stripe.prices.retrieve(plan.stripePriceId);
        const cents = typeof price.unit_amount === "number" ? price.unit_amount : 0;
        if (cents > 0) {
          priceAmountCache.set(plan.id, { cents, at: Date.now() });
          overrides[plan.id] = cents;
        }
      } catch (err) {
        logBilling("price.retrieve_failed", {
          planId: plan.id,
          message: err instanceof Error ? err.message : "unknown",
        });
      }
    }
  } catch {
    // Catalog still works with env display amounts.
  }
  return overrides;
}

export async function getPublicBillingCatalogEnriched() {
  const overrides = await loadStripePriceAmountOverrides();
  return publicBillingCatalog(overrides);
}

export const PAID_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
]);

export const ACCESS_GRANTING_STATUSES = new Set([
  "active",
  "trialing",
  // past_due: keep access briefly while Stripe retries (cancel_at_period_end flow
  // still ends access when status becomes canceled / unpaid / incomplete_expired).
  "past_due",
]);

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

function unixToIso(seconds: number | null | undefined): string | undefined {
  if (seconds == null || !Number.isFinite(seconds)) return undefined;
  return new Date(seconds * 1000).toISOString();
}

/** Stripe API 2025+: period lives on SubscriptionItem, not Subscription. */
export function subscriptionPeriod(sub: Stripe.Subscription): {
  start?: string;
  end?: string;
} {
  const item = sub.items?.data?.[0] as
    | (Stripe.SubscriptionItem & {
        current_period_start?: number;
        current_period_end?: number;
      })
    | undefined;
  const start =
    item?.current_period_start ??
    (sub as unknown as { current_period_start?: number }).current_period_start;
  const end =
    item?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end;
  return { start: unixToIso(start), end: unixToIso(end) };
}

export function primaryPriceId(sub: Stripe.Subscription): string | undefined {
  const price = sub.items?.data?.[0]?.price;
  return typeof price === "string" ? price : price?.id;
}

export function cuePlanFromBillingStatus(
  status: string | undefined,
  planId: string | undefined,
): CuePlan {
  if (!status || !ACCESS_GRANTING_STATUSES.has(status)) return "free";
  const plan = planId ? getBillingPlan(planId) : null;
  if (plan) return plan.cuePlan;
  return resolvePlan(planId);
}

export function hasEntitlement(
  user: Pick<
    DbUser,
    "plan" | "billingStatus" | "billingPlanId" | "billingPeriodEnd" | "cancelAtPeriodEnd"
  >,
  feature: "pro" | "premium" | "team" | "meeting.full_summary" | "desktop_companion",
): boolean {
  const planId = user.billingPlanId || (user.plan === "premium" ? "pro" : "free");
  const status = user.billingStatus || (user.plan === "premium" ? "active" : "none");

  const periodStillOpen =
    Boolean(user.billingPeriodEnd) && Date.parse(String(user.billingPeriodEnd)) > Date.now();

  const paidAccess =
    ACCESS_GRANTING_STATUSES.has(status) ||
    (status === "canceled" && Boolean(user.cancelAtPeriodEnd) && periodStillOpen);

  if (!paidAccess) {
    return feature === "desktop_companion";
  }

  const ents = entitlementsForPlan(planId);
  if (feature === "desktop_companion") return ents.desktop_companion;
  if (feature === "meeting.full_summary") return ents["meeting.full_summary"];
  if (feature === "team") {
    return planId.startsWith("team") || planId.includes("enterprise");
  }
  return resolvePlan(planId) === "premium" || user.plan === "premium";
}

async function findUserById(userId: string): Promise<DbUser | null> {
  const store = await readStore();
  return store.users.find((u) => u.id === userId) || null;
}

async function findUserByStripeCustomerId(customerId: string): Promise<DbUser | null> {
  const store = await readStore();
  return store.users.find((u) => u.stripeCustomerId === customerId) || null;
}

async function findUserByStripeSubscriptionId(subId: string): Promise<DbUser | null> {
  const store = await readStore();
  return store.users.find((u) => u.stripeSubscriptionId === subId) || null;
}

export async function ensureStripeCustomer(user: DbUser): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: {
      cueai_user_id: user.id,
      workspace_id: user.workspaceId,
    },
  });
  await updateStore((s) => {
    const u = s.users.find((x) => x.id === user.id);
    if (u) u.stripeCustomerId = customer.id;
  });
  logBilling("customer.created", { userId: user.id, customerId: customer.id });
  return customer.id;
}

export async function createCheckoutSession(input: {
  userId: string;
  planId?: string;
  priceId?: string;
  successUrl?: string;
  cancelUrl?: string;
}): Promise<{ url: string; sessionId: string; changed?: boolean }> {
  if (!isStripeBillingConfigured()) {
    throw new BillingUserError(
      "Payments are temporarily unavailable. Please try again later.",
    );
  }

  // Resolve from CueAI plan id only when provided — map to Stripe Price ID server-side.
  const plan = resolveCheckoutPlan({
    planId: input.planId,
    // Ignore client price ids unless no planId was sent (legacy). Prefer planId.
    priceId: input.planId ? undefined : input.priceId,
  });
  if (!plan || plan.id === "free" || !plan.stripePriceId) {
    throw new BillingUserError(
      "Payments are temporarily unavailable. Please try again later.",
    );
  }
  // Reject arbitrary price ids that are not in the CueAI allow-list.
  if (input.priceId && !input.planId && plan.stripePriceId !== input.priceId.trim()) {
    throw new BillingUserError(
      "Payments are temporarily unavailable. Please try again later.",
    );
  }

  const user = await findUserById(input.userId);
  if (!user || user.status === "Deactivated") {
    throw new BillingUserError("Unable to start checkout.");
  }

  const base = appBaseUrl();
  const successUrl =
    input.successUrl || `${base}/billing/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = input.cancelUrl || `${base}/settings#billing`;

  // Existing active subscription → change plan (no second subscription).
  if (user.stripeSubscriptionId && user.billingStatus && ACCESS_GRANTING_STATUSES.has(user.billingStatus)) {
    try {
      const changed = await changeSubscriptionPlan({
        userId: user.id,
        planId: plan.id,
      });
      logBilling("checkout.plan_changed", {
        userId: user.id,
        planId: plan.id,
        status: changed.status,
      });
      return {
        url: `${base}/billing/success?updated=1`,
        sessionId: user.stripeSubscriptionId,
        changed: true,
      };
    } catch (err) {
      // If change fails, fall through to new Checkout.
      logBilling("checkout.change_fallback", {
        userId: user.id,
        message: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  const customerId = await ensureStripeCustomer(user);
  const stripe = getStripe();
  const trial = trialDays();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    // Payment methods (card, Apple Pay, Link, ACH, etc.) come from Stripe Dashboard.
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    subscription_data: {
      ...(trial > 0 ? { trial_period_days: trial } : {}),
      metadata: {
        cueai_user_id: user.id,
        cueai_plan_id: plan.id,
      },
    },
    metadata: {
      cueai_user_id: user.id,
      cueai_plan_id: plan.id,
    },
  });

  if (!session.url) {
    throw new BillingUserError("Unable to start checkout.");
  }

  logBilling("checkout.created", {
    userId: user.id,
    planId: plan.id,
    sessionId: session.id,
  });

  return { url: session.url, sessionId: session.id };
}

export async function createPortalSession(input: {
  userId: string;
  returnUrl?: string;
}): Promise<{ url: string }> {
  if (!isStripeBillingConfigured()) {
    throw new BillingUserError("Billing service is temporarily unavailable.");
  }
  const user = await findUserById(input.userId);
  if (!user) throw new BillingUserError("Unable to open billing portal.");
  const customerId = user.stripeCustomerId || (await ensureStripeCustomer(user));
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: input.returnUrl || `${appBaseUrl()}/settings#billing`,
  });
  return { url: session.url };
}

export async function changeSubscriptionPlan(input: {
  userId: string;
  planId: string;
}): Promise<{ ok: true; status: string }> {
  if (!isStripeBillingConfigured()) {
    throw new BillingUserError("Billing service is temporarily unavailable.");
  }
  const plan = getBillingPlan(input.planId);
  if (!plan?.stripePriceId) {
    throw new BillingUserError("Unable to change plan.");
  }
  const user = await findUserById(input.userId);
  if (!user?.stripeSubscriptionId) {
    throw new BillingUserError("No active subscription to change.");
  }
  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
  const itemId = sub.items.data[0]?.id;
  if (!itemId) throw new BillingUserError("Unable to change plan.");

  const updated = await stripe.subscriptions.update(user.stripeSubscriptionId, {
    items: [{ id: itemId, price: plan.stripePriceId }],
    proration_behavior: "create_prorations",
    metadata: {
      ...(sub.metadata || {}),
      cueai_user_id: user.id,
      cueai_plan_id: plan.id,
    },
  });

  await applySubscriptionToUser(user.id, updated, plan);
  return { ok: true, status: updated.status };
}

export async function cancelSubscriptionAtPeriodEnd(input: {
  userId: string;
}): Promise<{ ok: true; cancelAtPeriodEnd: boolean; periodEnd?: string }> {
  if (!isStripeBillingConfigured()) {
    throw new BillingUserError("Billing service is temporarily unavailable.");
  }
  const user = await findUserById(input.userId);
  if (!user?.stripeSubscriptionId) {
    throw new BillingUserError("No active subscription to cancel.");
  }
  const stripe = getStripe();
  const updated = await stripe.subscriptions.update(user.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });
  const period = subscriptionPeriod(updated);
  await applySubscriptionToUser(user.id, updated);
  return {
    ok: true,
    cancelAtPeriodEnd: Boolean(updated.cancel_at_period_end),
    periodEnd: period.end,
  };
}

async function upsertSubscriptionRecord(
  userId: string,
  sub: Stripe.Subscription,
  plan: BillingPlanDefinition | null,
) {
  const period = subscriptionPeriod(sub);
  const priceId = primaryPriceId(sub);
  const planId = plan?.id || findPlanByStripePriceId(priceId || "")?.id || "unknown";
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id || "";

  await updateBillingStore((store) => {
    const existing = store.subscriptions.find((s) => s.stripeSubscriptionId === sub.id);
    const now = new Date().toISOString();
    if (existing) {
      existing.status = sub.status;
      existing.stripePriceId = priceId;
      existing.planId = planId;
      existing.currentPeriodStart = period.start;
      existing.currentPeriodEnd = period.end;
      existing.cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);
      existing.updatedAt = now;
    } else {
      const row: DbBillingSubscription = {
        id: newBillingId("bsub"),
        userId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: sub.id,
        stripePriceId: priceId,
        planId,
        status: sub.status,
        currentPeriodStart: period.start,
        currentPeriodEnd: period.end,
        cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
        createdAt: now,
        updatedAt: now,
      };
      store.subscriptions.unshift(row);
    }
  });
}

async function syncKeygateForUser(
  user: DbUser,
  plan: BillingPlanDefinition | null,
  grantAccess: boolean,
) {
  if (!isKeygateEnabled()) {
    logBilling("keygate.skip", { reason: "not_configured", userId: user.id });
    return;
  }

  try {
    if (grantAccess && plan && plan.cuePlan === "premium") {
      if (user.keygateLicenseId) {
        const res = await keygateAdminSetLicenseStatus({
          licenseId: user.keygateLicenseId,
          status: "active",
        });
        logBilling("keygate.reactivate", {
          userId: user.id,
          licenseId: user.keygateLicenseId,
          ok: res.ok,
        });
        return;
      }
      if (!plan.keygatePlanId) {
        logBilling("keygate.skip", {
          reason: "missing_plan_id",
          userId: user.id,
          planId: plan.id,
        });
        return;
      }
      const created = await keygateAdminCreateLicense({
        planId: plan.keygatePlanId,
        customerEmail: user.email,
        maxActivations: plan.id.startsWith("team") ? 5 : 2,
        metadata: {
          cueai_user_id: user.id,
          cueai_plan_id: plan.id,
          stripe_customer_id: user.stripeCustomerId,
          stripe_subscription_id: user.stripeSubscriptionId,
        },
      });
      if (created.ok && created.licenseId) {
        await updateStore((s) => {
          const u = s.users.find((x) => x.id === user.id);
          if (u) u.keygateLicenseId = created.licenseId;
        });
        logBilling("keygate.license_created", {
          userId: user.id,
          licenseId: created.licenseId,
        });
      } else {
        logBilling("keygate.license_create_failed", {
          userId: user.id,
          message: created.message,
        });
      }
      return;
    }

    // Revoke / suspend when access should end
    if (user.keygateLicenseId) {
      const status = grantAccess ? "active" : "suspended";
      const res = await keygateAdminSetLicenseStatus({
        licenseId: user.keygateLicenseId,
        status,
      });
      logBilling("keygate.status", {
        userId: user.id,
        licenseId: user.keygateLicenseId,
        status,
        ok: res.ok,
      });
    }
  } catch (err) {
    logBilling("keygate.error", {
      userId: user.id,
      message: err instanceof Error ? err.message : "unknown",
    });
  }
}

export async function applySubscriptionToUser(
  userId: string,
  sub: Stripe.Subscription,
  planHint?: BillingPlanDefinition | null,
) {
  const priceId = primaryPriceId(sub);
  const plan =
    planHint ||
    findPlanByStripePriceId(priceId || "") ||
    (sub.metadata?.cueai_plan_id
      ? getBillingPlan(String(sub.metadata.cueai_plan_id))
      : null);
  const period = subscriptionPeriod(sub);
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

  const grantAccess =
    ACCESS_GRANTING_STATUSES.has(sub.status) ||
    (Boolean(sub.cancel_at_period_end) &&
      period.end != null &&
      Date.parse(period.end) > Date.now());

  const cuePlan = grantAccess && plan ? plan.cuePlan : grantAccess ? "premium" : "free";
  const billingPlanId = plan?.id || (cuePlan === "premium" ? "pro" : "free");

  await upsertSubscriptionRecord(userId, sub, plan);

  await updateStore((s) => {
    const u = s.users.find((x) => x.id === userId);
    if (!u) return;
    if (customerId) u.stripeCustomerId = customerId;
    u.stripeSubscriptionId = sub.id;
    u.stripePriceId = priceId;
    u.billingPlanId = billingPlanId;
    u.billingStatus = sub.status;
    u.billingPeriodStart = period.start;
    u.billingPeriodEnd = period.end;
    u.cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);
    u.plan = cuePlan;
  });

  const fresh = await findUserById(userId);
  if (fresh) {
    await syncKeygateForUser(fresh, plan, grantAccess && cuePlan === "premium");
  }

  logBilling("subscription.applied", {
    userId,
    subscriptionId: sub.id,
    status: sub.status,
    planId: billingPlanId,
    grantAccess,
  });
}

async function recordPayment(input: {
  userId: string;
  amount: number;
  currency: string;
  status: string;
  stripePaymentIntentId?: string;
  stripeInvoiceId?: string;
}) {
  await updateBillingStore((store) => {
    store.payments.unshift({
      id: newBillingId("pay"),
      userId: input.userId,
      amount: input.amount,
      currency: input.currency,
      status: input.status,
      stripePaymentIntentId: input.stripePaymentIntentId,
      stripeInvoiceId: input.stripeInvoiceId,
      createdAt: new Date().toISOString(),
    });
  });
}

async function resolveUserIdFromSubscription(sub: Stripe.Subscription): Promise<string | null> {
  const metaUser = sub.metadata?.cueai_user_id;
  if (metaUser) return String(metaUser);
  const bySub = await findUserByStripeSubscriptionId(sub.id);
  if (bySub) return bySub.id;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (customerId) {
    const byCust = await findUserByStripeCustomerId(customerId);
    if (byCust) return byCust.id;
  }
  return null;
}

export async function handleStripeWebhookEvent(
  event: Stripe.Event,
): Promise<{ handled: boolean; duplicate?: boolean }> {
  const store = await readBillingStore();
  if (store.processedEventIds.includes(event.id)) {
    logBilling("webhook.duplicate", { eventId: event.id, type: event.type });
    return { handled: true, duplicate: true };
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId =
          session.client_reference_id ||
          session.metadata?.cueai_user_id ||
          null;
        if (session.mode === "subscription" && session.subscription && userId) {
          const stripe = getStripe();
          const subId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          const plan = session.metadata?.cueai_plan_id
            ? getBillingPlan(String(session.metadata.cueai_plan_id))
            : null;
          await applySubscriptionToUser(String(userId), sub, plan);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await resolveUserIdFromSubscription(sub);
        if (userId) {
          await applySubscriptionToUser(userId, sub);
        } else {
          logBilling("webhook.orphan_subscription", {
            eventId: event.id,
            subscriptionId: sub.id,
          });
        }
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        let userId: string | null = null;
        if (customerId) {
          const u = await findUserByStripeCustomerId(customerId);
          userId = u?.id || null;
        }
        const parent = invoice.parent as
          | { subscription_details?: { subscription?: string | { id?: string } } }
          | null
          | undefined;
        const subRef = parent?.subscription_details?.subscription;
        const subId =
          typeof subRef === "string" ? subRef : subRef?.id || undefined;
        if (userId) {
          await recordPayment({
            userId,
            amount: invoice.amount_paid ?? invoice.amount_due ?? 0,
            currency: invoice.currency || "usd",
            status: event.type === "invoice.paid" ? "paid" : "failed",
            stripeInvoiceId: invoice.id,
            stripePaymentIntentId:
              typeof (invoice as unknown as { payment_intent?: string }).payment_intent ===
              "string"
                ? (invoice as unknown as { payment_intent: string }).payment_intent
                : undefined,
          });
          if (subId) {
            const stripe = getStripe();
            const sub = await stripe.subscriptions.retrieve(subId);
            await applySubscriptionToUser(userId, sub);
          }
        }
        break;
      }
      default:
        logBilling("webhook.ignored", { eventId: event.id, type: event.type });
    }
  } catch (err) {
    logBilling("webhook.error", {
      eventId: event.id,
      type: event.type,
      message: err instanceof Error ? err.message : "unknown",
    });
    throw err;
  }

  await updateBillingStore((s) => {
    if (!s.processedEventIds.includes(event.id)) {
      s.processedEventIds.push(event.id);
    }
  });

  return { handled: true };
}

export async function constructAndProcessWebhook(
  rawBody: string | Buffer,
  signature: string | null,
): Promise<{ handled: boolean; duplicate?: boolean }> {
  if (!signature) {
    throw new BillingUserError("Invalid webhook signature.", 400);
  }
  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      getStripeWebhookSecret(),
    );
  } catch {
    throw new BillingUserError("Invalid webhook signature.", 400);
  }
  return handleStripeWebhookEvent(event);
}

export async function getBillingStatusForUser(userId: string) {
  const user = await findUserById(userId);
  if (!user) return null;
  const billingStore = await readBillingStore();
  const sub =
    billingStore.subscriptions.find((s) => s.userId === userId) ||
    (user.stripeSubscriptionId
      ? billingStore.subscriptions.find(
          (s) => s.stripeSubscriptionId === user.stripeSubscriptionId,
        )
      : undefined);

  const planId = user.billingPlanId || (user.plan === "premium" ? "pro" : "free");
  const planDef =
    getBillingPlan(planId) ||
    (planId === "pro" || planId === "premium"
      ? getBillingPlan("pro_monthly")
      : getBillingPlan("free"));
  const status = user.billingStatus || (user.plan === "premium" ? "active" : "none");

  let paymentState:
    | "none"
    | "processing"
    | "active"
    | "past_due"
    | "canceled"
    | "expired"
    | "failed" = "none";
  if (status === "incomplete" || status === "incomplete_expired") paymentState = "processing";
  else if (status === "active" || status === "trialing") paymentState = "active";
  else if (status === "past_due" || status === "unpaid") paymentState = "past_due";
  else if (status === "canceled") {
    paymentState =
      user.billingPeriodEnd && Date.parse(user.billingPeriodEnd) > Date.now()
        ? "canceled"
        : "expired";
  }

  return {
    configured: isStripeBillingConfigured(),
    planId,
    planName: planDef?.name || (user.plan === "premium" ? "Pro" : "Free"),
    cuePlan: user.plan === "premium" ? "premium" : "free",
    entitlementLevel:
      planDef?.entitlementLevel ||
      (planId.startsWith("team")
        ? "team"
        : user.plan === "premium" || planId.startsWith("pro")
          ? "pro"
          : "free"),
    status,
    paymentState,
    interval: planDef?.interval || "none",
    currentPeriodStart: user.billingPeriodStart || sub?.currentPeriodStart || null,
    currentPeriodEnd: user.billingPeriodEnd || sub?.currentPeriodEnd || null,
    cancelAtPeriodEnd: Boolean(user.cancelAtPeriodEnd),
    stripeCustomerId: user.stripeCustomerId || null,
    stripeSubscriptionId: user.stripeSubscriptionId || null,
    entitlements: {
      pro: hasEntitlement(user, "pro"),
      premium: hasEntitlement(user, "premium"),
      team: hasEntitlement(user, "team"),
      "meeting.full_summary": hasEntitlement(user, "meeting.full_summary"),
      desktop_companion: hasEntitlement(user, "desktop_companion"),
    },
    keygateLicenseId: user.keygateLicenseId || null,
    keygateConfigured: isKeygateEnabled(),
  };
}

export async function listAdminBillingRows() {
  const store = await readStore();
  const billing = await readBillingStore();
  return store.users.map((u) => {
    const sub =
      billing.subscriptions.find((s) => s.userId === u.id) ||
      (u.stripeSubscriptionId
        ? billing.subscriptions.find((s) => s.stripeSubscriptionId === u.stripeSubscriptionId)
        : undefined);
    return {
      userId: u.id,
      name: u.name,
      email: u.email,
      planId: u.billingPlanId || (u.plan === "premium" ? "pro" : "free"),
      cuePlan: u.plan === "premium" ? "premium" : "free",
      status: u.billingStatus || (u.plan === "premium" ? "active" : "none"),
      stripeCustomerId: u.stripeCustomerId || null,
      stripeSubscriptionId: u.stripeSubscriptionId || null,
      periodStart: u.billingPeriodStart || sub?.currentPeriodStart || null,
      periodEnd: u.billingPeriodEnd || sub?.currentPeriodEnd || null,
      cancelAtPeriodEnd: Boolean(u.cancelAtPeriodEnd),
      keygateLicenseId: u.keygateLicenseId || null,
      licenseStatus: u.keygateLicenseId
        ? hasEntitlement(u, "premium")
          ? "active"
          : "inactive"
        : "none",
    };
  });
}

export class BillingUserError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "BillingUserError";
    this.status = status;
  }
}
