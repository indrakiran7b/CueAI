import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { NextRequest } from "next/server";
import type Stripe from "stripe";

process.env.CUEAI_DATA_DIR = mkdtempSync(path.join(tmpdir(), "cueai-billing-"));
process.env.AUTH_SECRET = "test-billing-secret";
process.env.CUEAI_ENV = "test";
process.env.NEXT_PUBLIC_SKIP_AUTH = "false";
process.env.NEXT_PUBLIC_AUTH_BYPASS = "false";
process.env.CUEAI_BOOTSTRAP_ADMIN_ENABLED = "false";
process.env.APP_BASE_URL = "http://127.0.0.1:3000";
process.env.STRIPE_SECRET_KEY = "sk_test_cueai_billing_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_cueai_billing_test";
process.env.STRIPE_PRICE_PRO_MONTHLY = "price_test_pro_monthly";
process.env.STRIPE_PRICE_TEAM_MONTHLY = "price_test_team_monthly";
process.env.STRIPE_PRO_PRICE_ID = "price_test_pro_monthly";
process.env.STRIPE_TEAM_PRICE_ID = "price_test_team_monthly";
delete process.env.STRIPE_PRICE_PRO_YEARLY;
delete process.env.STRIPE_PRICE_TEAM_YEARLY;

type CheckoutCreate = {
  mode?: string;
  customer?: string;
  success_url?: string;
  cancel_url?: string;
  line_items?: Array<{ price?: string; quantity?: number }>;
  metadata?: Record<string, string>;
  subscription_data?: { metadata?: Record<string, string> };
};

const checkoutCreates: CheckoutCreate[] = [];
const portalCreates: Array<{ customer?: string; return_url?: string }> = [];
let mockSub: Stripe.Subscription;

function periodTimes() {
  const start = Math.floor(Date.now() / 1000) - 60;
  const end = start + 30 * 24 * 60 * 60;
  return { start, end };
}

function makeSubscription(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  const { start, end } = periodTimes();
  return {
    id: "sub_test_a",
    object: "subscription",
    status: "active",
    customer: "cus_test_a",
    cancel_at_period_end: false,
    metadata: { cueai_user_id: "usr_a", cueai_plan_id: "pro_monthly" },
    items: {
      object: "list",
      data: [
        {
          id: "si_test",
          object: "subscription_item",
          current_period_start: start,
          current_period_end: end,
          price: { id: process.env.STRIPE_PRICE_PRO_MONTHLY, object: "price" },
        } as Stripe.SubscriptionItem,
      ],
    },
    ...overrides,
  } as Stripe.Subscription;
}

function mockStripeClient(): Stripe {
  mockSub = makeSubscription();
  return {
    customers: {
      create: async () => ({ id: "cus_test_a" }),
    },
    checkout: {
      sessions: {
        create: async (params: CheckoutCreate) => {
          checkoutCreates.push(params);
          return {
            id: "cs_test_1",
            url: "https://checkout.stripe.com/c/pay/cs_test_1",
          };
        },
      },
    },
    billingPortal: {
      sessions: {
        create: async (params: { customer?: string; return_url?: string }) => {
          portalCreates.push(params);
          return { url: "https://billing.stripe.com/p/session/test" };
        },
      },
    },
    subscriptions: {
      retrieve: async (id: string) => ({ ...mockSub, id }),
      update: async (_id: string, params: Record<string, unknown>) => {
        mockSub = {
          ...mockSub,
          cancel_at_period_end: Boolean(params.cancel_at_period_end),
          status: (params.status as Stripe.Subscription.Status) || mockSub.status,
        };
        return mockSub;
      },
    },
    prices: {
      retrieve: async (id: string) => ({
        id,
        unit_amount: String(id).includes("team") ? 1000 : 500,
        currency: "usd",
      }),
    },
  } as unknown as Stripe;
}

const {
  setStripeClientForTests,
  resetStripeClientForTests,
} = await import("../src/lib/server/stripe");
setStripeClientForTests(mockStripeClient());

const { updateStore } = await import("../src/lib/server/db");
const {
  createCheckoutSession,
  createPortalSession,
  handleStripeWebhookEvent,
  constructAndProcessWebhook,
  getBillingStatusForUser,
  hasEntitlement,
  BillingUserError,
} = await import("../src/lib/server/billing");
const { publicBillingCatalog, getBillingPlan } = await import("../src/lib/server/billing-plans");
const { POST: checkoutPost } = await import("../src/app/api/billing/checkout/route");
const { GET: statusGet } = await import("../src/app/api/billing/status/route");
const { signSession, SESSION_COOKIE } = await import("../src/lib/server/session");
const { requireAuth } = await import("../src/lib/server/api-auth");

const now = new Date().toISOString();

await updateStore((s) => {
  s.workspace.id = "ws_a";
  s.workspace.name = "Workspace A";
  s.users = [
    {
      id: "usr_a",
      name: "User A",
      email: "a@cueai.local",
      passwordHash: "x",
      role: "User",
      status: "Active",
      workspaceId: "ws_a",
      createdAt: now,
      plan: "free",
    },
    {
      id: "usr_b",
      name: "User B",
      email: "b@cueai.local",
      passwordHash: "x",
      role: "User",
      status: "Active",
      workspaceId: "ws_b",
      createdAt: now,
      plan: "free",
      stripeCustomerId: "cus_test_b",
      stripeSubscriptionId: "sub_test_b",
      billingPlanId: "team_monthly",
      billingStatus: "active",
    },
  ];
});

function cookieFor(userId: "usr_a" | "usr_b") {
  const token = signSession({
    userId,
    email: userId === "usr_a" ? "a@cueai.local" : "b@cueai.local",
    name: userId === "usr_a" ? "User A" : "User B",
    role: "User",
    workspaceId: userId === "usr_a" ? "ws_a" : "ws_b",
    workspace: userId === "usr_a" ? "Workspace A" : "Workspace B",
  });
  return `${SESSION_COOKIE}=${token}`;
}

function checkoutRequest(body: unknown, cookie?: string) {
  return new NextRequest("http://127.0.0.1:3000/api/billing/checkout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("1. Free plan requires no payment and is not purchasable", async () => {
  const catalog = publicBillingCatalog();
  const free = catalog.plans.find((p) => p.id === "free");
  assert.equal(free?.displayAmountCents, 0);
  assert.equal(free?.purchasable, false);
  await assert.rejects(
    () => createCheckoutSession({ userId: "usr_a", planId: "free" }),
    (err: unknown) => {
      assert.ok(err instanceof BillingUserError);
      assert.equal(err.status, 400);
      assert.match(err.message, /does not require payment/i);
      return true;
    },
  );
});

test("2. Pro Checkout uses the configured $5 monthly Price ID", async () => {
  checkoutCreates.length = 0;
  const result = await createCheckoutSession({ userId: "usr_a", planId: "pro_monthly" });
  assert.equal(result.url, "https://checkout.stripe.com/c/pay/cs_test_1");
  const created = checkoutCreates.at(-1);
  assert.equal(created?.mode, "subscription");
  assert.equal(created?.line_items?.[0]?.price, "price_test_pro_monthly");
  assert.equal(created?.metadata?.cueai_user_id, "usr_a");
  assert.equal(created?.metadata?.cueai_plan_id, "pro_monthly");
  assert.equal(created?.subscription_data?.metadata?.cueai_plan_id, "pro_monthly");
  assert.equal(getBillingPlan("pro_monthly")?.displayAmountCents, 500);
});

test("3. Team Checkout uses the configured $10 monthly Price ID", async () => {
  checkoutCreates.length = 0;
  await createCheckoutSession({ userId: "usr_a", planId: "team_monthly" });
  const created = checkoutCreates.at(-1);
  assert.equal(created?.mode, "subscription");
  assert.equal(created?.line_items?.[0]?.price, "price_test_team_monthly");
  assert.equal(created?.metadata?.cueai_plan_id, "team_monthly");
  assert.equal(getBillingPlan("team_monthly")?.displayAmountCents, 1000);
});

test("4. Invalid plans are rejected", async () => {
  await assert.rejects(
    () => createCheckoutSession({ userId: "usr_a", planId: "enterprise_unlimited" }),
    (err: unknown) => {
      assert.ok(err instanceof BillingUserError);
      assert.equal(err.status, 400);
      assert.equal(err.message, "Invalid plan.");
      return true;
    },
  );
  const res = await checkoutPost(checkoutRequest({ planId: "not-a-plan" }, cookieFor("usr_a")));
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error?: string };
  assert.equal(body.error, "Invalid plan.");
});

test("5. Unauthenticated checkout is rejected", async () => {
  const res = await checkoutPost(checkoutRequest({ planId: "pro_monthly" }));
  assert.equal(res.status, 401);
});

test("6b. Unpaid checkout.session.completed does not grant premium", async () => {
  await handleStripeWebhookEvent({
    id: "evt_checkout_unpaid",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_unpaid",
        mode: "subscription",
        payment_status: "unpaid",
        client_reference_id: "usr_a",
        subscription: "sub_test_a",
        metadata: { cueai_user_id: "usr_a", cueai_plan_id: "pro_monthly" },
      },
    },
  } as Stripe.Event);
  const status = await getBillingStatusForUser("usr_a");
  assert.notEqual(status?.status, "active");
});

test("6. Verified checkout.session.completed updates subscription state", async () => {
  mockSub = makeSubscription();
  const event = {
    id: "evt_checkout_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_1",
        mode: "subscription",
        payment_status: "paid",
        client_reference_id: "usr_a",
        subscription: "sub_test_a",
        metadata: { cueai_user_id: "usr_a", cueai_plan_id: "pro_monthly" },
      },
    },
  } as Stripe.Event;
  const result = await handleStripeWebhookEvent(event);
  assert.equal(result.duplicate, undefined);
  const status = await getBillingStatusForUser("usr_a");
  assert.equal(status?.cuePlan, "premium");
  assert.equal(status?.planId, "pro_monthly");
  assert.equal(status?.status, "active");
  assert.equal(status?.stripeSubscriptionId, "sub_test_a");
  assert.equal(status?.entitlements.premium, true);
});

test("7. Duplicate webhook delivery does not duplicate processing", async () => {
  const event = {
    id: "evt_checkout_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_1",
        mode: "subscription",
        payment_status: "paid",
        client_reference_id: "usr_a",
        subscription: "sub_test_a",
        metadata: { cueai_user_id: "usr_a", cueai_plan_id: "pro_monthly" },
      },
    },
  } as Stripe.Event;
  const again = await handleStripeWebhookEvent(event);
  assert.equal(again.duplicate, true);
  const store = await (await import("../src/lib/server/billing-db")).readBillingStore();
  const subs = store.subscriptions.filter((s) => s.stripeSubscriptionId === "sub_test_a");
  assert.equal(subs.length, 1);
});

test("8. Failed renewal marks the subscription past_due", async () => {
  mockSub = makeSubscription({ status: "past_due" });
  await handleStripeWebhookEvent({
    id: "evt_invoice_fail_1",
    type: "invoice.payment_failed",
    data: {
      object: {
        id: "in_fail_1",
        customer: "cus_test_a",
        amount_due: 500,
        amount_paid: 0,
        currency: "usd",
        parent: { subscription_details: { subscription: "sub_test_a" } },
      },
    },
  } as Stripe.Event);
  const status = await getBillingStatusForUser("usr_a");
  assert.equal(status?.status, "past_due");
  assert.equal(status?.paymentState, "past_due");
});

test("9. Cancellation updates access according to period policy", async () => {
  const { end } = periodTimes();
  mockSub = makeSubscription({
    status: "canceled",
    cancel_at_period_end: true,
    items: {
      object: "list",
      data: [
        {
          id: "si_test",
          object: "subscription_item",
          current_period_start: end - 30 * 24 * 60 * 60,
          current_period_end: end,
          price: { id: process.env.STRIPE_PRICE_PRO_MONTHLY, object: "price" },
        } as Stripe.SubscriptionItem,
      ],
    },
  });
  await handleStripeWebhookEvent({
    id: "evt_sub_updated_cancel",
    type: "customer.subscription.updated",
    data: { object: mockSub },
  } as Stripe.Event);
  let userA = (await (await import("../src/lib/server/db")).readStore()).users.find(
    (u) => u.id === "usr_a",
  );
  assert.ok(userA);
  assert.equal(hasEntitlement(userA, "premium"), true);

  mockSub = makeSubscription({
    status: "canceled",
    cancel_at_period_end: false,
    items: {
      object: "list",
      data: [
        {
          id: "si_test",
          object: "subscription_item",
          current_period_start: Math.floor(Date.now() / 1000) - 40 * 24 * 60 * 60,
          current_period_end: Math.floor(Date.now() / 1000) - 60,
          price: { id: process.env.STRIPE_PRICE_PRO_MONTHLY, object: "price" },
        } as Stripe.SubscriptionItem,
      ],
    },
  });
  await handleStripeWebhookEvent({
    id: "evt_sub_deleted",
    type: "customer.subscription.deleted",
    data: { object: mockSub },
  } as Stripe.Event);
  userA = (await (await import("../src/lib/server/db")).readStore()).users.find(
    (u) => u.id === "usr_a",
  );
  assert.ok(userA);
  assert.equal(hasEntitlement(userA, "premium"), false);
  assert.equal(userA.plan, "free");
});

test("10. Users cannot access another user's billing records", async () => {
  const a = await getBillingStatusForUser("usr_a");
  const b = await getBillingStatusForUser("usr_b");
  assert.notEqual(a?.stripeCustomerId, b?.stripeCustomerId);
  assert.equal(b?.stripeCustomerId, "cus_test_b");
  assert.notEqual(a?.stripeSubscriptionId, "sub_test_b");

  const res = await statusGet(
    new NextRequest("http://127.0.0.1:3000/api/billing/status", {
      headers: { cookie: cookieFor("usr_a") },
    }),
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { stripeCustomerId?: string; stripeSubscriptionId?: string };
  assert.notEqual(body.stripeCustomerId, "cus_test_b");
  assert.notEqual(body.stripeSubscriptionId, "sub_test_b");
});

test("11. Checkout cancellation returns the user to CueAI", async () => {
  checkoutCreates.length = 0;
  await createCheckoutSession({ userId: "usr_a", planId: "pro_monthly" });
  const created = checkoutCreates.at(-1);
  assert.equal(created?.cancel_url, "http://127.0.0.1:3000/billing/cancelled");
  assert.match(String(created?.success_url), /\/billing\/success/);
});

test("12. Existing session auth still works and portal stays on the user customer", async () => {
  const req = new NextRequest("http://127.0.0.1:3000/api/billing/status", {
    headers: { cookie: cookieFor("usr_a") },
  });
  const { error, session } = await requireAuth(req);
  assert.equal(error, null);
  assert.equal(session?.userId, "usr_a");

  portalCreates.length = 0;
  const portal = await createPortalSession({
    userId: "usr_a",
    returnUrl: "https://evil.example/steal",
  });
  assert.equal(portal.url, "https://billing.stripe.com/p/session/test");
  assert.equal(portalCreates.at(-1)?.return_url, "http://127.0.0.1:3000/settings#billing");
  assert.equal(portalCreates.at(-1)?.customer, "cus_test_a");
});

test("Webhook signatures are verified", async () => {
  resetStripeClientForTests();
  const payload = JSON.stringify({
    id: "evt_sig",
    object: "event",
    type: "customer.subscription.updated",
    data: { object: makeSubscription() },
  });
  await assert.rejects(
    () => constructAndProcessWebhook(payload, "t=1,v1=deadbeef"),
    (err: unknown) => {
      assert.ok(err instanceof BillingUserError);
      assert.equal(err.status, 400);
      assert.match(err.message, /signature/i);
      return true;
    },
  );
  await assert.rejects(() => constructAndProcessWebhook(payload, null), BillingUserError);
  setStripeClientForTests(mockStripeClient());
});

test("Client-supplied Price IDs and redirect URLs are ignored", async () => {
  checkoutCreates.length = 0;
  const res = await checkoutPost(
    checkoutRequest(
      {
        planId: "pro_monthly",
        priceId: "price_attacker",
        successUrl: "https://evil.example/ok",
        cancelUrl: "https://evil.example/no",
      },
      cookieFor("usr_a"),
    ),
  );
  assert.equal(res.status, 200);
  const created = checkoutCreates.at(-1);
  assert.equal(created?.line_items?.[0]?.price, "price_test_pro_monthly");
  assert.equal(created?.cancel_url, "http://127.0.0.1:3000/billing/cancelled");
});
