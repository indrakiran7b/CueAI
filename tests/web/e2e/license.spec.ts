import { test, expect } from "@playwright/test";
import path from "node:path";

const SCREENSHOT_DIR = path.join(process.cwd(), "test-results", "licenses");

test.describe("License activation UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      (window as Window & { cueDesktop?: unknown }).cueDesktop = {
        isDesktop: true,
        isMaximized: async () => false,
        onMaximizedChange: () => () => {},
        minimize: async () => {},
        maximize: async () => false,
        close: async () => {},
        getLicenseDevice: async () => ({
          deviceId: "00000000-0000-4000-8000-000000000001",
          maskedId: "WIN-••••••••0001",
          deviceName: "E2E Test PC",
          platform: "windows",
          appVersion: "1.0.0",
          secureStorageAvailable: true,
        }),
        getLicenseStatus: async () => ({
          ok: false,
          state: "NOT_ACTIVATED",
          authorized: false,
        }),
        activateLicense: async (key: string) => {
          if (key.includes("INVALID")) {
            return {
              ok: false,
              state: "INVALID",
              authorized: false,
              message: "That license key is invalid.",
            };
          }
          if (key.includes("EXPIRED")) {
            return {
              ok: false,
              state: "EXPIRED",
              authorized: false,
              message: "This license has expired.",
            };
          }
          if (key.includes("LIMIT")) {
            return {
              ok: false,
              state: "DEVICE_LIMIT_REACHED",
              authorized: false,
              message: "This license has reached its device limit.",
            };
          }
          if (key.includes("NETWORK")) {
            return {
              ok: false,
              state: "NETWORK_ERROR",
              authorized: false,
              message: "Unable to connect to the licensing server. Please check your internet connection.",
            };
          }
          return {
            ok: true,
            state: "ACTIVE",
            authorized: true,
            clientName: "E2E Client",
            licenseType: "CLIENT_TESTING",
            expiresAt: new Date(Date.now() + 86400_000 * 30).toISOString(),
          };
        },
        deactivateLicense: async () => ({
          ok: true,
          state: "NOT_ACTIVATED",
          authorized: false,
          message: "Device deactivated.",
        }),
      };
    });
  });

  function licenseInput(page: import("@playwright/test").Page) {
    return page.getByRole("textbox");
  }

  test("license screen", async ({ page }) => {
    await page.goto("/license?desktop=windows");
    await expect(page.getByRole("heading", { name: "Activate CueAI" })).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "license-screen.png"), fullPage: true });
  });

  test("invalid license", async ({ page }) => {
    await page.goto("/license?desktop=windows");
    await expect(page.getByRole("heading", { name: "Activate CueAI" })).toBeVisible();
    await licenseInput(page).fill("CUEAI-CLIENT-INVALID-XXXX-XXXX-XXXX");
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(page.getByText("That license key is invalid.")).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "license-invalid.png"), fullPage: true });
  });

  test("valid license", async ({ page }) => {
    await page.goto("/license?desktop=windows");
    await licenseInput(page).fill("CUEAI-CLIENT-VALID-AAAA-BBBB-CCCC");
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(page.getByText("Activation successful")).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "license-valid.png"), fullPage: true });
  });

  test("expired license", async ({ page }) => {
    await page.goto("/license?desktop=windows&state=EXPIRED");
    await licenseInput(page).fill("CUEAI-CLIENT-EXPIRED-AAAA-BBBB-CCCC");
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(page.getByText("This license has expired.")).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "license-expired.png"), fullPage: true });
  });

  test("device limit", async ({ page }) => {
    await page.goto("/license?desktop=windows");
    await licenseInput(page).fill("CUEAI-CLIENT-LIMIT-AAAA-BBBB-CCCC");
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(page.getByText("This license has reached its device limit.")).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "license-device-limit.png"), fullPage: true });
  });

  test("network error", async ({ page }) => {
    await page.goto("/license?desktop=windows");
    await licenseInput(page).fill("CUEAI-CLIENT-NETWORK-AAAA-BBBB-CCCC");
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(page.getByText(/Unable to connect to the licensing server/)).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "license-network-error.png"), fullPage: true });
  });
});
