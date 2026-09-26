#!/usr/bin/env node
/**
 * Keygate / license enforcement unit tests (no live Keygate network).
 *   node --test tests/licenses/keygate-mapping.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";

function mapKeygateStatusToCueState(status, httpStatus, errorCode) {
  if (httpStatus === 409 || errorCode === "ACTIVATION_LIMIT") return "DEVICE_LIMIT_REACHED";
  if (httpStatus === 429 || errorCode === "LOCKED_OUT") return "NETWORK_ERROR";
  if (httpStatus === 404 || errorCode === "LICENSE_NOT_FOUND") return "INVALID";
  const s = String(status || "").toLowerCase();
  if (["active", "trialing", "activated", "already_activated"].includes(s)) return "ACTIVE";
  if (s === "expired") return "EXPIRED";
  if (s === "suspended" || s === "past_due") return "SUSPENDED";
  if (s === "revoked" || s === "canceled" || s === "cancelled") return "REVOKED";
  if (httpStatus === 403) return "REVOKED";
  return "INVALID";
}

function entitlementsFromKeygate(planName, features = {}) {
  const planRaw = String(planName || "").trim().toLowerCase();
  let plan = "free";
  if (planRaw.includes("enterprise")) plan = "enterprise";
  else if (planRaw.includes("business") || planRaw.includes("team")) plan = "business";
  else if (planRaw.includes("pro") || planRaw.includes("premium") || planRaw.includes("professional")) {
    plan = "pro";
  }
  const premium = plan === "pro" || plan === "business" || plan === "enterprise";
  return {
    plan,
    entitlements: {
      "meeting.full_summary": premium,
      "meeting.max_questions": premium ? -1 : 5,
      desktop_companion: true,
    },
  };
}

function resolveStartupPath({ enforcement, localAuthorized, onlineState }) {
  if (!enforcement) return "/dashboard";
  if (!localAuthorized) return "/license?desktop=windows&state=NOT_ACTIVATED";
  if (onlineState && onlineState !== "ACTIVE") {
    return `/license?desktop=windows&state=${onlineState}`;
  }
  return "/dashboard";
}

test("valid / active license maps to ACTIVE", () => {
  assert.equal(mapKeygateStatusToCueState("active"), "ACTIVE");
  assert.equal(mapKeygateStatusToCueState("trialing"), "ACTIVE");
});

test("expired license", () => {
  assert.equal(mapKeygateStatusToCueState("expired"), "EXPIRED");
});

test("revoked license", () => {
  assert.equal(mapKeygateStatusToCueState("revoked"), "REVOKED");
  assert.equal(mapKeygateStatusToCueState("canceled"), "REVOKED");
});

test("invalid / unknown license", () => {
  assert.equal(mapKeygateStatusToCueState(undefined, 404, "LICENSE_NOT_FOUND"), "INVALID");
});

test("unauthorized device / activation limit", () => {
  assert.equal(mapKeygateStatusToCueState(undefined, 409, "ACTIVATION_LIMIT"), "DEVICE_LIMIT_REACHED");
});

test("registered / new device entitlements", () => {
  const pro = entitlementsFromKeygate("Pro");
  assert.equal(pro.plan, "pro");
  assert.equal(pro.entitlements["meeting.full_summary"], true);
  const free = entitlementsFromKeygate("Starter");
  assert.equal(free.entitlements["meeting.max_questions"], 5);
});

test("Keygate unavailable", () => {
  assert.equal(mapKeygateStatusToCueState(undefined, 429, "LOCKED_OUT"), "NETWORK_ERROR");
  assert.equal(mapKeygateStatusToCueState(undefined, 503), "INVALID");
});

test("development mode skips enforcement path", () => {
  assert.equal(resolveStartupPath({ enforcement: false, localAuthorized: false }), "/dashboard");
});

test("production enforcement blocks unauthorized device", () => {
  assert.match(
    resolveStartupPath({ enforcement: true, localAuthorized: false }),
    /\/license/,
  );
  assert.match(
    resolveStartupPath({
      enforcement: true,
      localAuthorized: true,
      onlineState: "REVOKED",
    }),
    /state=REVOKED/,
  );
});

test("production enforcement allows active licensed device", () => {
  assert.equal(
    resolveStartupPath({
      enforcement: true,
      localAuthorized: true,
      onlineState: "ACTIVE",
    }),
    "/dashboard",
  );
});
