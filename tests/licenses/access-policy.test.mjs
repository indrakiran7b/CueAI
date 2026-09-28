#!/usr/bin/env node
/**
 * CueAI access policy: Resume Tailor web-only Admin/Manager; Knowledge admin-only.
 *   node --test tests/licenses/access-policy.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";

function canAccessAdmin(role) {
  return role === "Admin" || role === "Manager";
}

function canAccessResumeTailor(role) {
  return canAccessAdmin(role);
}

function restrictedCueAiPath(pathname, role) {
  const path = pathname.split("?")[0] || "/";
  const isNormal = !canAccessAdmin(role);
  if (path === "/knowledge" || path.startsWith("/knowledge/")) {
    if (isNormal) return "/dashboard";
    return null;
  }
  if ((path === "/admin" || path.startsWith("/admin/")) && isNormal) {
    return "/dashboard";
  }
  if (isNormal) {
    if (path === "/translation" || path.startsWith("/translation/")) return "/dashboard";
    if (path === "/screen-context" || path.startsWith("/screen-context/")) return "/dashboard";
  }
  return null;
}

function isDesktopBlockedPath(pathname) {
  const path = pathname.split("?")[0] || "/";
  const webOnly = ["/resume", "/resume-tailor"];
  return webOnly.some((p) => path === p || path.startsWith(`${p}/`));
}

test("Resume Tailor allowed for Admin", () => {
  assert.equal(canAccessResumeTailor("Admin"), true);
});

test("Resume Tailor allowed for Manager", () => {
  assert.equal(canAccessResumeTailor("Manager"), true);
});

test("Resume Tailor denied for User", () => {
  assert.equal(canAccessResumeTailor("User"), false);
});

test("Resume Tailor is outside CueAI restrictedCueAiPath (no forced dashboard hop)", () => {
  assert.equal(restrictedCueAiPath("/resume-tailor", "User"), null);
  assert.equal(restrictedCueAiPath("/resume-tailor", "Admin"), null);
});

test("Knowledge blocked for normal user", () => {
  assert.equal(restrictedCueAiPath("/knowledge", "User"), "/dashboard");
});

test("Knowledge allowed for admin", () => {
  assert.equal(restrictedCueAiPath("/knowledge", "Admin"), null);
});

test("Desktop blocks Resume Tailor routes", () => {
  assert.equal(isDesktopBlockedPath("/resume-tailor"), true);
  assert.equal(isDesktopBlockedPath("/resume"), true);
  assert.equal(isDesktopBlockedPath("/dashboard"), false);
});

test("Desktop does not block Admin Portal / Translation / Screen Context", () => {
  assert.equal(isDesktopBlockedPath("/admin"), false);
  assert.equal(isDesktopBlockedPath("/translation"), false);
  assert.equal(isDesktopBlockedPath("/screen-context"), false);
  assert.equal(isDesktopBlockedPath("/knowledge"), false);
});

test("Admin can open Admin Portal / Translation / Screen Context", () => {
  assert.equal(restrictedCueAiPath("/admin", "Admin"), null);
  assert.equal(restrictedCueAiPath("/translation", "Admin"), null);
  assert.equal(restrictedCueAiPath("/screen-context", "Admin"), null);
  assert.equal(restrictedCueAiPath("/translation", "Manager"), null);
});

test("User is role-blocked from Admin Portal / Translation / Screen Context", () => {
  assert.equal(restrictedCueAiPath("/admin", "User"), "/dashboard");
  assert.equal(restrictedCueAiPath("/translation", "User"), "/dashboard");
  assert.equal(restrictedCueAiPath("/screen-context", "User"), "/dashboard");
});
