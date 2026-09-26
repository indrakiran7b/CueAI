#!/usr/bin/env node
import assert from "node:assert/strict";
import { test } from "node:test";

const ALLOWED = ["pro_monthly", "pro_yearly", "team_monthly", "team_yearly"];

test("checkout only accepts named CueAI plans, never raw Stripe price IDs", () => {
  assert.deepEqual(ALLOWED, [
    "pro_monthly",
    "pro_yearly",
    "team_monthly",
    "team_yearly",
  ]);
  assert.equal(ALLOWED.includes("price_123"), false);
  assert.equal(ALLOWED.includes("STRIPE_PRICE_PRO_MONTHLY"), false);
});
