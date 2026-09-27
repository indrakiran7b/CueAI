import test from "node:test";
import assert from "node:assert/strict";

function normalizeRole(value) {
  if (typeof value !== "string") return "User";
  const compact = value.trim();
  if (compact === "Admin" || compact === "Manager" || compact === "User") return compact;
  const v = compact.toLowerCase();
  if (v === "admin") return "Admin";
  if (v === "manager") return "Manager";
  return "User";
}

function canAccessResumeTailor(role) {
  const normalized = normalizeRole(role);
  return normalized === "Admin" || normalized === "Manager" || normalized === "User";
}

function isResumeProductPath(pathname) {
  const path = (pathname || "").split("?")[0] || "/";
  return path === "/resume" || path.startsWith("/resume/") || path === "/resume-tailor" || path.startsWith("/resume-tailor/");
}

function restrictedPath(pathname, role) {
  const path = pathname.split("?")[0] || "/";
  if (isResumeProductPath(path)) {
    if (!canAccessResumeTailor(role)) return "/resume-tailor/denied";
    return null;
  }
  return null;
}

test("Resume Tailor is available to User, Manager, and Admin", () => {
  assert.equal(canAccessResumeTailor("Admin"), true);
  assert.equal(canAccessResumeTailor("Manager"), true);
  assert.equal(canAccessResumeTailor("User"), true);
  assert.equal(canAccessResumeTailor("member"), true);
});

test("direct Resume Tailor URLs allow authenticated workspace roles", () => {
  assert.equal(restrictedPath("/resume-tailor", "Admin"), null);
  assert.equal(restrictedPath("/resume-tailor/dashboard", "Manager"), null);
  assert.equal(restrictedPath("/resume-tailor", "User"), null);
  assert.equal(restrictedPath("/resume-tailor/analyze", "User"), null);
});
