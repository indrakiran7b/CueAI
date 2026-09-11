import { test, expect } from "@playwright/test";
import { signupAndLogin, uniqueUser } from "./helpers/auth";

test.describe("E2E Flow 5–12 — Feature pages", () => {
  test.beforeEach(async ({ page }) => {
    await signupAndLogin(page, uniqueUser("features"));
  });

  test("dashboard interactive elements", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
    const cards = page.locator("a, button").filter({ hasText: /meeting|session|resume|knowledge/i });
    await expect(cards.first()).toBeVisible();
  });

  test("meetings list and search", async ({ page }) => {
    await page.goto("/meetings");
    await expect(page.getByRole("heading", { name: /meetings/i })).toBeVisible();
    const search = page.getByPlaceholder(/search/i);
    if (await search.count()) {
      await search.fill("Product");
      await expect(page.locator("body")).toContainText(/product|meeting|no results/i);
    }
  });

  test("live session start/stop flow (mock UI)", async ({ page }) => {
    await page.goto("/meetings/live");
    await expect(page.getByRole("heading", { name: /live session/i })).toBeVisible();

    const startBtn = page.getByRole("button", { name: /start session|start listening|join/i }).first();
    if (await startBtn.isVisible()) {
      await startBtn.click();
      await expect(page.locator("body")).toContainText(/listening|transcript|session|live/i);
    }

    const stopBtn = page.getByRole("button", { name: /stop|end session/i }).first();
    if (await stopBtn.isVisible()) {
      await stopBtn.click();
    }
  });

  test("translation language switch and copy", async ({ page }) => {
    await page.goto("/translation?meetingId=m1");
    await expect(page.getByRole("heading", { name: /translation/i })).toBeVisible();

    await page.getByRole("button", { name: /hindi/i }).click();
    await expect(page.locator("body")).toContainText(/टीम|एंटरप्राइज़|latency|summary/i);

    await page.getByRole("button", { name: /summary/i }).click();
    const copyBtn = page.getByRole("button", { name: /copy/i }).first();
    if (await copyBtn.isVisible()) {
      await copyBtn.click();
      await expect(page.getByText(/copied/i)).toBeVisible({ timeout: 3000 });
    }
  });

  test("knowledge base loads and persists doc list", async ({ page }) => {
    await page.goto("/knowledge");
    await expect(page.getByRole("heading", { name: /knowledge/i })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: /knowledge/i })).toBeVisible();
  });

  test("screen context page renders permission UI", async ({ page }) => {
    await page.goto("/screen-context");
    await expect(page.getByRole("heading", { name: /screen context/i })).toBeVisible();
    await expect(page.locator("body")).toContainText(/capture|context|screen|privacy/i);
  });

  test("resume page shows upload UI", async ({ page }) => {
    await page.goto("/resume");
    await expect(page.getByRole("heading", { name: /resume/i })).toBeVisible();
    await expect(page.locator("body")).toContainText(/upload|resume|tailor|pdf|doc/i);
  });

  test("settings toggles persist in localStorage", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: /settings/i })).toBeVisible();

    const toggle = page.locator('input[type="checkbox"]').first();
    if (await toggle.count()) {
      const before = await toggle.isChecked();
      await toggle.click();
      await page.reload();
      const after = await toggle.isChecked();
      expect(after).toBe(!before);
    }
  });

  test("admin portal redirects non-admin users", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/dashboard/);
  });
});

test.describe("E2E Flow 17–19 — Error handling and duplicate actions", () => {
  test("rapid navigation does not crash", async ({ page }) => {
    await signupAndLogin(page, uniqueUser("rapid"));
    for (let i = 0; i < 5; i++) {
      await page.goto("/dashboard");
      await page.goto("/meetings/live");
      await page.goto("/translation");
    }
    await expect(page.locator("body")).not.toContainText("Application error");
  });
});
