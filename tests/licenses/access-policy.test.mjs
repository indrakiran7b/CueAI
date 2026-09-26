#!/usr/bin/env node
/**
 * CueAI access policy: Resume Tailor out of CueAI chrome; Knowledge admin-only.
 *   node --test tests/licenses/access-policy.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";

function isAdminUser(role) {
  return role === "Admin" || role === "Manager";
}

function restrictedCueAiPath(pathname, role) {
  const path = pathname.split("?")[0] || "/";
  if (path === "/resume" || path.startsWith("/resume/")) return "/dashboard";
  if (path === "/knowledge" || path.startsWith("/knowledge/")) {
    if (!isAdminUser(role)) return "/dashboard";
    return null;
  }
  if ((path === "/admin" || path.startsWith("/admin/")) && !isAdminUser(role)) {
    return "/dashboard";
  }
  return null;
}

test("Resume Tailor blocked for normal user inside CueAI", () => {
  assert.equal(restrictedCueAiPath("/resume", "User"), "/dashboard");
});

test("Resume Tailor blocked for admin inside CueAI", () => {
  assert.equal(restrictedCueAiPath("/resume", "Admin"), "/dashboard");
});

test("Knowledge blocked for normal user", () => {
  assert.equal(restrictedCueAiPath("/knowledge", "User"), "/dashboard");
});

test("Knowledge allowed for admin", () => {
  assert.equal(restrictedCueAiPath("/knowledge", "Admin"), null);
});
