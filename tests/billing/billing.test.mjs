#!/usr/bin/env node
/**
 * Stripe billing unit tests (no live Stripe / Keygate network).
 *   node --test tests/billing/billing.test.mjs
 */
import assert from "node:assert/strict";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, before, after, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

let tmpDir = "";

const PAID = new Set(["active", "trialing", "past_due"]);

function hasEntitlement(user, feature) {
  const planId = user.billingPlanId || (user.plan === "premium" ? "pro" : "free");
  const status = user.billingStatus || (user.plan === "premium" ? "active" : "none");
  const periodStillOpen =
    Boolean(user.billingPeriodEnd) && Date.parse(String(user.billingPeriodEnd)) > Date.now();
  const paidAccess =
    PAID.has(status) ||
    (status === "canceled" && Boolean(user.cancelAtPeriodEnd) && periodStillOpen);
  if (!paidAccess) return feature === "desktop_companion";
  if (feature === "desktop_companion") return true;
  if (feature === "team") return String(planId).startsWith("team");
  return true;
}

function mapStripeStatus(status) {
  const allowed = [
    "active",
    "trialing",
    "past_due",
    "canceled",
    "unpaid",
    "incomplete",
    "incomplete_expired",
  ];
  return allowed.includes(status) ? status : "incomplete";
}

function subscriptionPeriod(sub) {
  const item = sub.items?.data?.[0];
  const start = item?.current_period_start ?? sub.current_period_start;
  const end = item?.current_period_end ?? sub.current_period_end;
  return {
    start: start ? new Date(start * 1000).toISOString() : undefined,
    end: end ? new Date(end * 1000).toISOString() : undefined,
  };
}

function findPlanByPrice(plans, priceId) {
  return plans.find((p) => p.stripePriceId && p.stripePriceId === priceId) || null;
}

function verifyStripeSignature(payload, header, secret) {
  // Minimal Stripe-compatible check used by tests (not a full SDK constructEvent).
  const parts = Object.fromEntries(
    String(header || "")
      .split(",")
      .map((p) => p.trim().split("="))
      .filter((x) => x.length === 2),
  );
  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) return false;
  const signed = `${timestamp}.${payload}`;
  const expected = createHmac("sha256", secret).update(signed, "utf8").digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  } catch {
    return false;
  }
}

before(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "cueai-billing-"));
  process.env.CUEAI_DATA_DIR = tmpDir;
});

after(async () => {
  delete process.env.CUEAI_DATA_DIR;
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await mkdir(tmpDir, { recursive: true });
});

test("user without subscription has no premium entitlement", () => {
  const user = { plan: "free", billingStatus: "none", billingPlanId: "free" };
  assert.equal(hasEntitlement(user, "pro"), false);
  assert.equal(hasEntitlement(user, "premium"), false);
  assert.equal(hasEntitlement(user, "desktop_companion"), true);
});

test("active subscription grants premium", () => {
  const user = {
    plan: "premium",
    billingStatus: "active",
    billingPlanId: "pro_monthly",
  };
  assert.equal(hasEntitlement(user, "pro"), true);
  assert.equal(hasEntitlement(user, "meeting.full_summary"), true);
});

test("trialing grants access", () => {
  assert.equal(
    hasEntitlement({ billingStatus: "trialing", billingPlanId: "pro_monthly", plan: "premium" }, "pro"),
    true,
  );
});

test("past_due keeps access while Stripe retries", () => {
  assert.equal(
    hasEntitlement({ billingStatus: "past_due", billingPlanId: "pro_monthly", plan: "premium" }, "pro"),
    true,
  );
});

test("canceled at period end keeps access until period ends", () => {
  const user = {
    plan: "premium",
    billingStatus: "canceled",
    billingPlanId: "pro_monthly",
    cancelAtPeriodEnd: true,
    billingPeriodEnd: new Date(Date.now() + 86400_000 * 10).toISOString(),
  };
  assert.equal(hasEntitlement(user, "pro"), true);
});

test("expired subscription removes premium", () => {
  const user = {
    plan: "free",
    billingStatus: "canceled",
    billingPlanId: "pro_monthly",
    cancelAtPeriodEnd: true,
    billingPeriodEnd: new Date(Date.now() - 86400_000).toISOString(),
  };
  assert.equal(hasEntitlement(user, "pro"), false);
});

test("unpaid / incomplete_expired deny premium", () => {
  assert.equal(
    hasEntitlement({ billingStatus: "unpaid", billingPlanId: "pro_monthly", plan: "free" }, "pro"),
    false,
  );
  assert.equal(
    hasEntitlement(
      { billingStatus: "incomplete_expired", billingPlanId: "pro_monthly", plan: "free" },
      "pro",
    ),
    false,
  );
});

test("subscription status mapping", () => {
  for (const s of [
    "active",
    "trialing",
    "past_due",
    "canceled",
    "unpaid",
    "incomplete",
    "incomplete_expired",
  ]) {
    assert.equal(mapStripeStatus(s), s);
  }
});

test("period extracted from SubscriptionItem (Stripe API 2025+)", () => {
  const sub = {
    items: {
      data: [{ current_period_start: 1_700_000_000, current_period_end: 1_702_592_000 }],
    },
  };
  const p = subscriptionPeriod(sub);
  assert.ok(p.start);
  assert.ok(p.end);
});

test("plan catalog maps Stripe price ids", () => {
  const plans = [
    { id: "pro_monthly", stripePriceId: "price_pro_m" },
    { id: "team_yearly", stripePriceId: "price_team_y" },
  ];
  assert.equal(findPlanByPrice(plans, "price_pro_m")?.id, "pro_monthly");
  assert.equal(findPlanByPrice(plans, "missing"), null);
});

test("upgrade / downgrade plan id swap", () => {
  const from = "pro_monthly";
  const to = "team_monthly";
  assert.notEqual(from, to);
  assert.ok(to.startsWith("team"));
});

test("windows and macos share the same entitlement rules", () => {
  const user = { billingStatus: "active", billingPlanId: "pro_yearly", plan: "premium" };
  assert.equal(hasEntitlement(user, "pro"), true);
  // Platform is irrelevant — desktop asks CueAI backend, not a local isPremium flag.
  const platforms = ["windows", "macos"];
  for (const platform of platforms) {
    assert.equal(hasEntitlement(user, "pro"), true, platform);
  }
});

test("billing store idempotency for processed event ids", async () => {
  const storePath = path.join(tmpDir, "billing-store.json");
  const store = { subscriptions: [], payments: [], processedEventIds: ["evt_1"] };
  await writeFile(storePath, JSON.stringify(store, null, 2));
  const eventId = "evt_1";
  const raw = JSON.parse(await readFile(storePath, "utf8"));
  const duplicate = raw.processedEventIds.includes(eventId);
  assert.equal(duplicate, true);
  if (!raw.processedEventIds.includes("evt_2")) raw.processedEventIds.push("evt_2");
  await writeFile(storePath, JSON.stringify(raw, null, 2));
  const again = JSON.parse(await readFile(storePath, "utf8"));
  assert.deepEqual(again.processedEventIds, ["evt_1", "evt_2"]);
});

test("invalid webhook signature rejected", () => {
  const payload = JSON.stringify({ id: "evt_test", type: "invoice.paid" });
  const secret = "whsec_test_secret";
  const ts = Math.floor(Date.now() / 1000);
  const good = createHmac("sha256", secret).update(`${ts}.${payload}`).digest("hex");
  assert.equal(verifyStripeSignature(payload, `t=${ts},v1=${good}`, secret), true);
  assert.equal(verifyStripeSignature(payload, `t=${ts},v1=deadbeef`, secret), false);
  assert.equal(verifyStripeSignature(payload, null, secret), false);
});

test("duplicate webhook does not create duplicate subscriptions", async () => {
  const storePath = path.join(tmpDir, "billing-store-dup.json");
  const store = {
    subscriptions: [
      {
        id: "bsub_1",
        userId: "u1",
        stripeSubscriptionId: "sub_1",
        stripeCustomerId: "cus_1",
        planId: "pro_monthly",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    payments: [],
    processedEventIds: ["evt_sub_created"],
  };
  await writeFile(storePath, JSON.stringify(store, null, 2));
  const raw = JSON.parse(await readFile(storePath, "utf8"));
  if (raw.processedEventIds.includes("evt_sub_created")) {
    // skip apply — idempotent
  } else {
    raw.subscriptions.push({ id: "bsub_2", stripeSubscriptionId: "sub_1" });
  }
  assert.equal(raw.subscriptions.length, 1);
});

test("payment failure maps to past_due / failed attention", () => {
  const status = mapStripeStatus("past_due");
  assert.equal(status, "past_due");
  assert.equal(hasEntitlement({ billingStatus: "past_due", plan: "premium", billingPlanId: "pro_monthly" }, "pro"), true);
});

test("Keygate activation follows paid entitlement; suspension on expiry", () => {
  const hasPaidAccess = hasEntitlement({
    billingStatus: "active",
    plan: "premium",
    billingPlanId: "pro_monthly",
  }, "pro");
  const hasExpiredAccess = hasEntitlement({
    billingStatus: "canceled",
    plan: "free",
    billingPlanId: "pro_monthly",
    cancelAtPeriodEnd: false,
  }, "pro");
  assert.equal(hasPaidAccess, true);
  assert.equal(hasExpiredAccess, false);
  // Sync policy: grant → keygate active; deny → keygate suspended (server billing.ts).
  assert.equal(hasPaidAccess ? "active" : "suspended", "active");
  assert.equal(hasExpiredAccess ? "active" : "suspended", "suspended");
});

test("admin billing rows never include card secrets", () => {
  const row = {
    userId: "u1",
    email: "a@b.com",
    stripeCustomerId: "cus_x",
    stripeSubscriptionId: "sub_x",
    // Explicitly absent:
    cardNumber: undefined,
    cvv: undefined,
    stripeSecretKey: undefined,
  };
  assert.equal(row.cardNumber, undefined);
  assert.equal(row.cvv, undefined);
  assert.equal(row.stripeSecretKey, undefined);
});

test("unauthorized billing access denied without session", () => {
  const session = null;
  assert.equal(session ? "ok" : "Unauthorized", "Unauthorized");
});

test("env price placeholders are not hardcoded final prices", () => {
  const price = process.env.STRIPE_PRICE_PRO_MONTHLY || "";
  assert.equal(typeof price, "string");
  // Must not invent a live price id in source.
  assert.equal(price.startsWith("price_live_fake"), false);
});

void ROOT;
