import { test, expect } from "@playwright/test";
import { signupAndLogin, uniqueUser } from "./helpers/auth";

test.describe("Meeting Translation & Conversation Feed", () => {
  test.beforeEach(async ({ page }) => {
    await signupAndLogin(page, uniqueUser("meet-ctx"));
  });

  test("summary → translation loads that meeting transcript", async ({ page }) => {
    await page.goto("/meetings/m1/summary");
    await expect(page.getByRole("heading", { name: "Q3 Product Sync" })).toBeVisible();

    await page.getByRole("main").getByRole("link", { name: /translation/i }).click();
    await expect(page).toHaveURL(/meetingId=m1/);
    await expect(page.getByText(/Q3 Product Sync/)).toBeVisible();
    await expect(
      page.getByText(/enterprise rollout timeline for CueAI Companion/i).first()
    ).toBeVisible();

    await page.getByRole("button", { name: "Hindi" }).click();
    await expect(page.getByText(/एंटरप्राइज़ रोलआउट/i).first()).toBeVisible();

    await page.getByRole("button", { name: "Telugu" }).click();
    await expect(page.getByText(/ఎంటర్‌ప్రైజ్ రోలౌట్/i).first()).toBeVisible();
  });

  test("summary → conversation feed loads that meeting", async ({ page }) => {
    await page.goto("/meetings/m3/summary");
    await expect(page.getByRole("heading", { name: "Customer Success Weekly" })).toBeVisible();

    await page.getByRole("main").getByRole("link", { name: /conversation feed/i }).click();
    await expect(page).toHaveURL(/\/meetings\/m3\/feed/);
    await expect(page.getByRole("heading", { name: "Customer Success Weekly" })).toBeVisible();
    await expect(page.getByText(/Northstar wants twenty more Pro seats/i)).toBeVisible();
    await expect(page.getByText("Sarah Kim").first()).toBeVisible();
  });

  test("different meeting IDs show different content", async ({ page }) => {
    await page.goto("/translation?meetingId=m1");
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByText(/enterprise rollout timeline/i).first()).toBeVisible();

    await page.goto("/translation?meetingId=m4");
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByText(/Design Critique/)).toBeVisible();
    await expect(page.getByText(/four hundred by four twenty/i).first()).toBeVisible();
    await expect(page.getByText(/enterprise rollout timeline/i)).toHaveCount(0);
  });

  test("invalid meeting ID shows not found", async ({ page }) => {
    await page.goto("/meetings/does-not-exist/summary");
    await expect(page.getByRole("heading", { name: /meeting not found/i })).toBeVisible();

    await page.goto("/meetings/does-not-exist/feed");
    await expect(page.getByRole("heading", { name: /meeting not found/i })).toBeVisible();

    await page.goto("/translation?meetingId=does-not-exist");
    await expect(page.getByRole("heading", { name: /meeting not found/i })).toBeVisible();
  });

  test("refresh retains meeting context on translation", async ({ page }) => {
    await page.goto("/translation?meetingId=m2");
    await expect(page.getByText(/Enterprise Security Review/)).toBeVisible();
    await expect(page.getByText(/excluded from Teams screen share/i).first()).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/meetingId=m2/);
    await expect(page.getByText(/excluded from Teams screen share/i).first()).toBeVisible();
  });
});
