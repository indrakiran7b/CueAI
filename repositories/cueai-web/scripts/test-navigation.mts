/**
 * Sidebar order, role gating and the Mock Interview route.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const { CUEAI_NAV, visibleCueAiNav, restrictedCueAiPath } = await import("../src/lib/app-access");
const { mockInterviewHref, mockInterviewRedirect, MOCK_INTERVIEW_PATH } = await import("../src/lib/mock-interview-route");

const ROOT = path.resolve(import.meta.dirname, "..");

test("sidebar order is exactly the required order", () => {
  assert.deepEqual(
    CUEAI_NAV.map((i) => i.label),
    [
      "Dashboard",
      "Resume Tailor",
      "Mock Interview",
      "Live Session",
      "Meetings Summary",
      "Knowledge Base",
      "Screen Context",
      "Translation",
      "Admin Portal",
      "Settings",
    ],
  );
  const hrefs = CUEAI_NAV.map((i) => i.href);
  assert.equal(hrefs.indexOf("/mock-interview") + 1, hrefs.indexOf("/meetings/live"), "Mock Interview sits directly above Live Session");
});

test("every nav item points at an existing page", () => {
  for (const { href } of CUEAI_NAV) {
    const page = path.join(ROOT, "src", "app", "(app)", ...href.split("/").filter(Boolean), "page.tsx");
    assert.ok(existsSync(page), `${href} has a page`);
  }
});

test("users only see and reach the items their role allows", () => {
  const user = visibleCueAiNav("User").map((i) => i.href);
  assert.deepEqual(user, ["/dashboard", "/resume", "/mock-interview", "/meetings/live", "/meetings", "/settings"]);
  assert.equal(visibleCueAiNav("Admin").length, CUEAI_NAV.length);
  for (const href of ["/knowledge", "/screen-context", "/translation", "/admin"]) {
    assert.equal(restrictedCueAiPath(href, "User"), "/dashboard", `${href} is blocked for User`);
    assert.equal(restrictedCueAiPath(href, "Admin"), null);
  }
  assert.equal(restrictedCueAiPath("/mock-interview", "User"), null);
});

test("the sidebar renders CUEAI_NAV and its Mac sections cover every item once", () => {
  const src = readFileSync(path.join(ROOT, "src", "components", "layout", "sidebar.tsx"), "utf8");
  assert.match(src, /CUEAI_NAV\.map/);
  const sections = [...src.matchAll(/hrefs:\s*\[([^\]]*)\]/g)].flatMap((m) => [...m[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]));
  assert.deepEqual([...sections].sort(), CUEAI_NAV.map((i) => i.href).sort());
  assert.deepEqual(sections, CUEAI_NAV.map((i) => i.href), "Mac sections keep the same order");
});

test("mock interview links and legacy Live Session URLs go to the Mock Interview page", () => {
  assert.equal(MOCK_INTERVIEW_PATH, "/mock-interview");
  assert.equal(mockInterviewHref(), "/mock-interview");
  assert.equal(mockInterviewHref({ session: "mtg_1" }), "/mock-interview?session=mtg_1");
  assert.equal(mockInterviewRedirect("?mode=mock"), "/mock-interview");
  assert.equal(mockInterviewRedirect("?session=mtg_1"), "/mock-interview?session=mtg_1");
  assert.equal(mockInterviewRedirect("?mock=mtg_2&desktop=1"), "/mock-interview?session=mtg_2&desktop=1");
  assert.equal(mockInterviewRedirect("?practice=pr_1"), "/mock-interview?practice=pr_1");
  assert.equal(mockInterviewRedirect(""), null, "plain Live Session URLs stay on Live Session");
  assert.equal(mockInterviewRedirect("?mode=test"), null);
});

test("opening the Mock Interview page does not start a live session", () => {
  const src = readFileSync(path.join(ROOT, "src", "app", "(app)", "mock-interview", "page.tsx"), "utf8");
  assert.match(src, /<MockInterviewMode/);
  assert.ok(!/startLive|startMeeting|getUserMedia|\/api\/meetings\/start/.test(src), "no live session or mic start on load");
});

test("Privacy is hidden from Settings navigation without removing privacy implementation", () => {
  const nav = readFileSync(path.join(ROOT, "src", "components", "settings", "settings-nav.tsx"), "utf8");
  assert.doesNotMatch(nav, /id:\s*"privacy"/);
  const page = readFileSync(path.join(ROOT, "src", "app", "(app)", "settings", "page.tsx"), "utf8");
  assert.match(page, /section === "privacy"/, "privacy settings implementation remains intact");
  assert.ok(existsSync(path.join(ROOT, "src", "app", "api", "admin", "retention", "cleanup", "route.ts")));
});
